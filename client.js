/**
 * Client half of the status sidebar bundle.
 *
 * Registers one global panel: the `main` slot key holds the embedded status
 * page, and `sidebar.panellist` supplies its sidebar entry. The sidebar owns
 * the button, its accessible name, and selection; this module only draws the
 * glyph, the panel header, and the iframe.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-status-sidebar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Client locale namespace owned by this bundle. */
    const NS = 'statusSidebar';
    /** Panel id shared by the sidebar entry and the main slot key. */
    const PANEL_ID = 'status-sidebar';
    /** Page the panel embeds. */
    const STATUS_URL = 'https://status.deepseek.com';

    const DICTS = {
      en: {
        panel: 'Status',
        pageLabel: 'DeepSeek service status',
        refresh: 'Reload',
        loading: 'Loading the status page…',
        frameTitle: 'DeepSeek service status',
      },
      zh: {
        panel: '状态',
        pageLabel: 'DeepSeek 服务状态',
        refresh: '刷新',
        loading: '正在加载状态页…',
        frameTitle: 'DeepSeek 服务状态',
      },
    };

    // Prefixed class names keep this bundle's rules from reaching host controls.
    const STYLES = `
      .dss-status-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-base);
      }
      .dss-status-head {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px clamp(16px, 4vw, 32px) 12px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .dss-status-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }
      .dss-status-refresh {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 999px;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        font: inherit;
        font-size: 12px;
        line-height: 1.6;
        cursor: pointer;
      }
      .dss-status-refresh:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .dss-status-refresh:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }
      .dss-status-body {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      .dss-status-frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: var(--dsw-alias-bg-base);
      }
      .dss-status-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-bg-base);
        font-size: 13px;
      }
    `;

    /**
     * Sidebar glyph: Lucide's `activity` icon at the size the sidebar requests.
     * Path data from lucide-static v1.67.0 (ISC, https://lucide.dev/icons/activity);
     * the 1.6px stroke is this plugin's choice, not Lucide's 2px default.
     */
    function StatusPanelIcon({ size }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        h('path', {
          d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Main panel: a compact header over the embedded status page. */
    function StatusPanel({ t }) {
      const [reloadToken, setReloadToken] = React.useState(0);
      const [loaded, setLoaded] = React.useState(false);
      const onLoad = React.useCallback(() => { setLoaded(true) }, []);
      const onRefresh = React.useCallback(() => {
        setLoaded(false);
        // A new key remounts the frame, which reloads the page from its URL.
        setReloadToken(token => token + 1);
      }, []);

      return h(
        React.Fragment,
        null,
        h('style', { key: 'styles' }, STYLES),
        h(
          'section',
          { key: 'panel', className: 'dss-status-page', 'aria-label': t('pageLabel') },
          h(
            'header',
            { className: 'dss-status-head' },
            h('h1', { className: 'dss-status-title' }, t('pageLabel')),
            h(
              'button',
              {
                type: 'button',
                className: 'dss-status-refresh',
                onClick: onRefresh,
                'aria-label': t('refresh'),
                title: t('refresh'),
              },
              h(
                'svg',
                {
                  viewBox: '0 0 16 16',
                  width: 12,
                  height: 12,
                  fill: 'none',
                  'aria-hidden': 'true',
                  style: { display: 'block' },
                },
                h('path', {
                  d: 'M13.2 6.6A5.4 5.4 0 1 0 13 9.6M13.2 2.6v4h-4',
                  stroke: 'currentColor',
                  strokeWidth: 1.3,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),
              ),
              h('span', null, t('refresh')),
            ),
          ),
          h(
            'div',
            { className: 'dss-status-body' },
            h('iframe', {
              key: reloadToken,
              className: 'dss-status-frame',
              src: STATUS_URL,
              title: t('frameTitle'),
              onLoad,
            }),
            loaded ? null : h('div', { className: 'dss-status-loading' }, t('loading')),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, DICTS),
          'dsh-status-sidebar: dictionaries',
        );
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, StatusPanel));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel'),
        }, StatusPanelIcon));
      },
    };
  },
});
