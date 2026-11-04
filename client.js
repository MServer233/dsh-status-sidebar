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

    /** States that count as normal; everything else uses the fast cadence. */
    const NORMAL_STATUSES = new Set(['resolved', 'completed']);
    /** Refresh cadence while the newest incident is resolved or completed. */
    const NORMAL_REFRESH_MS = 10 * 60 * 1000;
    /** Refresh cadence for an active incident or an unknown status. */
    const ALERT_REFRESH_MS = 60 * 1000;
    /**
     * Re-confirmation delays after an online read that could not reach the
     * feed: 5s, 10s, 10s, 30s, then one minute for every later attempt.
     */
    const RETRY_DELAYS_MS = [5 * 1000, 10 * 1000, 10 * 1000, 30 * 1000, 60 * 1000];

    /**
     * Newest status from the latest read: undefined until the first read
     * settles, null when the feed or its `Status:` paragraph could not be read.
     */
    let feedStatus;

    const feedListeners = new Set();

    let refreshPromise;

    let refreshTimer;

    let reading = true;

    /**
     * True while the browser reports no network. The timer pauses instead of
     * retrying into a known-offline link, and the next `online` event resumes.
     */
    let networkDown = false;

    /** Position in {@link RETRY_DELAYS_MS}; reset by a success or a network switch. */
    let retryIndex = 0;

    /**
     * Set when `online` arrives while a read is in flight: that read may have
     * started on the dead link, so its result cannot end the outage.
     */
    let pendingOnlineRefresh = false;

    /** Whether the browser currently reports no network at all. */
    function browserOffline() {
      return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    /** Publish the settled status so a mounted glyph re-renders. */
    function publishFeedStatus(status) {
      feedStatus = status;
      for (const listener of [...feedListeners]) listener();
    }

    /** Re-arm the read at the cadence the readable status implies. */
    function scheduleRefresh() {
      if (!reading) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshStatus();
      }, NORMAL_STATUSES.has(feedStatus) ? NORMAL_REFRESH_MS : ALERT_REFRESH_MS);
    }

    /** Re-confirm a feed the browser claims to be online for, backing off. */
    function scheduleRetry() {
      if (!reading) return;
      clearTimeout(refreshTimer);
      const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
      retryIndex += 1;
      refreshTimer = setTimeout(() => {
        refreshStatus();
      }, delay);
    }

    /**
     * Read the status now and re-arm the cadence. Concurrent callers share one
     * read; the Host route bypasses the feed's missing CORS header.
     */
    function refreshStatus() {
      if (refreshPromise !== undefined) return refreshPromise;
      clearTimeout(refreshTimer);
      // A known-offline link gets no request at all; the `online` listener
      // resumes the normal read path.
      if (browserOffline()) {
        networkDown = true;
        return Promise.resolve();
      }
      refreshPromise = fetch(FEED_ROUTE, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then(response => (response.ok ? response.json() : null))
        .then((body) => {
          publishFeedStatus(typeof body?.status === 'string' ? body.status : null);
        })
        .catch(() => {
          publishFeedStatus(null);
        })
        .then(() => {
          refreshPromise = undefined;
          if (!reading) return;
          if (feedStatus === null) {
            // A null status while the browser reports offline is a link-level
            // failure: wait for `online` instead of retrying the dead route.
            if (browserOffline()) {
              networkDown = true;
              pendingOnlineRefresh = false;
              clearTimeout(refreshTimer);
              return;
            }
            // The link returned while this read was in flight, so its null
            // result is stale: read again immediately.
            if (pendingOnlineRefresh) {
              pendingOnlineRefresh = false;
              networkDown = false;
              refreshStatus();
              return;
            }
            scheduleRetry();
            return;
          }
          // A readable feed means the route works even if the browser still
          // reports no network (for example a loopback Host).
          networkDown = false;
          pendingOnlineRefresh = false;
          retryIndex = 0;
          scheduleRefresh();
        });
      return refreshPromise;
    }

    /** Subscribe the glyph to the latest read. */
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
     * Refresh when a listed Session starts a new turn: `running` reappears
     * after the previous turn stopped. Subagent turns are not user rounds.
     */
    function useTurnRefresh(useSessions) {
      const sessions = useSessions ?? (() => '');
      const running = sessions((state) => {
        const ids = [];
        for (const id of state.ids) {
          const row = state.byId[id];
          if (row?.running === true && row.origin !== 'subagent') ids.push(id);
        }
        return ids.sort().join('|');
      });
      const previous = React.useRef(undefined);
      React.useEffect(() => {
        if (previous.current === undefined) {
          previous.current = running;
          return;
        }
        const before = previous.current === '' ? [] : previous.current.split('|');
        const after = running === '' ? [] : running.split('|');
        previous.current = running;
        if (after.some(id => !before.includes(id))) refreshStatus();
      }, [running]);
    }

    /**
     * Sidebar glyph: the newest incident status as a Lucide mark, or the plain
     * `activity` mark while the feed is unreadable.
     */
    function StatusPanelIcon({ size, useSessions }) {
      const status = useFeedStatus();
      useTurnRefresh(useSessions);
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
        ctx.effect(() => {
          reading = true;
          const browser = typeof window === 'undefined' ? undefined : window;
          const connection = typeof navigator === 'undefined' ? undefined : navigator.connection;
          // Every network switch re-checks immediately: the new link may have
          // different reachability, so the backoff restarts from the first step.
          const recheck = () => {
            networkDown = browserOffline();
            retryIndex = 0;
            clearTimeout(refreshTimer);
            if (refreshPromise !== undefined) {
              pendingOnlineRefresh = true;
              return;
            }
            refreshStatus();
          };
          const onOffline = () => {
            networkDown = true;
            clearTimeout(refreshTimer);
          };
          const onOnline = () => {
            recheck();
          };
          // `navigator.connection` reports a Wi-Fi/cellular switch that leaves
          // the browser online; only a type change counts as a network switch.
          const networkSignature = () => connection === undefined
            ? ''
            : `${connection.type ?? ''}|${connection.effectiveType ?? ''}`;
          let lastNetwork = networkSignature();
          const onConnectionChange = () => {
            const next = networkSignature();
            if (next === lastNetwork) return;
            lastNetwork = next;
            recheck();
          };
          browser?.addEventListener?.('offline', onOffline);
          browser?.addEventListener?.('online', onOnline);
          connection?.addEventListener?.('change', onConnectionChange);
          // Load-time connectivity check: refreshStatus skips the request when
          // the browser already reports no network, and `online` resumes it.
          refreshStatus();
          return () => {
            reading = false;
            clearTimeout(refreshTimer);
            browser?.removeEventListener?.('offline', onOffline);
            browser?.removeEventListener?.('online', onOnline);
            connection?.removeEventListener?.('change', onConnectionChange);
          };
        }, 'dsh-status-sidebar: feed reads');

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
