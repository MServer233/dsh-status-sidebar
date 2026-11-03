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
    /** Host route returning the newest `Status:` value from the RSS feed. */
    const FEED_ROUTE = 'api/status-sidebar.feed';

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

    /** Theme state colors; the literal fallback covers themes without the token. */
    const COLORS = {
      green: 'var(--dsw-alias-state-success-primary, #22c55e)',
      red: 'var(--dsw-alias-state-error-primary, #f25a5a)',
      yellow: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      rest: 'currentColor',
    };

    /**
     * Lucide shapes used by the sidebar glyph, inlined from lucide-static
     * v1.67.0 (ISC, https://lucide.dev/icons/). Each shape is `[tag, props]`.
     * The 1.6px stroke is this plugin's choice, not Lucide's 2px default.
     */
    const GLYPHS = {
      activity: [
        ['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }],
      ],
      'check-circle-2': [
        ['circle', { cx: 12, cy: 12, r: 10 }],
        ['path', { d: 'm16 9-5.5 5.5L8 12' }],
      ],
      'circle-alert': [
        ['circle', { cx: 12, cy: 12, r: 10 }],
        ['line', { x1: 12, x2: 12, y1: 8, y2: 12 }],
        ['line', { x1: 12, x2: 12.01, y1: 16, y2: 16 }],
      ],
      'clock-alert': [
        ['path', { d: 'M12 6v6l4 2' }],
        ['path', { d: 'M20 12v5' }],
        ['path', { d: 'M20 21h.01' }],
        ['path', { d: 'M21.25 8.2A10 10 0 1 0 16 21.16' }],
      ],
      clock: [
        ['circle', { cx: 12, cy: 12, r: 10 }],
        ['path', { d: 'M12 6v6l4 2' }],
      ],
    };

    /** Incident status -> sidebar glyph. Unknown or unreadable statuses keep `activity`. */
    const STATUS_GLYPHS = {
      completed: { glyph: 'check-circle-2', color: COLORS.green },
      resolved: { glyph: 'check-circle-2', color: COLORS.green },
      investigating: { glyph: 'circle-alert', color: COLORS.red },
      identified: { glyph: 'circle-alert', color: COLORS.red },
      monitoring: { glyph: 'circle-alert', color: COLORS.red },
      ongoing: { glyph: 'clock-alert', color: COLORS.red },
      scheduled: { glyph: 'clock', color: COLORS.yellow },
    };

    /** Displayed before the feed read settles, and for every unknown status. */
    const FALLBACK_GLYPH = { glyph: 'activity', color: COLORS.rest };

    /**
     * Newest status from the startup read: undefined until it settles, null
     * when the feed or its `Status:` paragraph could not be read.
     */
    let feedStatus;

    const feedListeners = new Set();

    let feedRead;

    /** Publish the settled status so a mounted glyph re-renders. */
    function publishFeedStatus(status) {
      feedStatus = status;
      for (const listener of [...feedListeners]) listener();
    }

    /**
     * Read the status once per page start. The Host route bypasses the feed's
     * missing CORS header and extracts the `Status:` value server-side.
     */
    function readFeedOnce() {
      if (feedRead !== undefined) return feedRead;
      feedRead = fetch(FEED_ROUTE, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then(response => (response.ok ? response.json() : null))
        .then((body) => {
          publishFeedStatus(typeof body?.status === 'string' ? body.status : null);
        })
        .catch(() => {
          publishFeedStatus(null);
        });
      return feedRead;
    }

    /** Subscribe the glyph to the one startup read. */
    function useFeedStatus() {
      const [status, setStatus] = React.useState(feedStatus);
      React.useEffect(() => {
        const listener = () => { setStatus(feedStatus) };
        feedListeners.add(listener);
        listener();
        return () => { feedListeners.delete(listener) };
      }, []);
      return status;
    }

    /**
     * Sidebar glyph: the newest incident status as a Lucide mark, or the plain
     * `activity` mark while the feed is unreadable.
     */
    function StatusPanelIcon({ size }) {
      const status = useFeedStatus();
      const mark = typeof status === 'string' && Object.hasOwn(STATUS_GLYPHS, status)
        ? STATUS_GLYPHS[status]
        : FALLBACK_GLYPH;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: mark.color,
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        GLYPHS[mark.glyph].map(([tag, props], index) => h(tag, { key: index, ...props })),
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
        readFeedOnce();

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
