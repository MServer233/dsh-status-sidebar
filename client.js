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
    /** Host route reporting whether the Host itself can reach the feed host. */
    const PROBE_ROUTE = 'api/status-sidebar.probe';

    /**
     * Development tracing switch. Every development branch keeps this `true`;
     * the merge back to `main` restores `false`. Traces use `console.debug`,
     * so they stay hidden unless the browser console enables that level.
     */
    const DEBUG = false;

    /** Emit one structured trace record; `detail` may be a lazy thunk. */
    function debugLog(event, detail) {
      if (!DEBUG || typeof console === 'undefined' || typeof console.debug !== 'function') return;
      console.debug(`[dsh-status-sidebar] ${event}`, typeof detail === 'function' ? detail() : detail);
    }

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
     * Reachability heartbeat. Browser `online`/`offline` events are unreliable
     * behind virtual adapters: the browser can stay "online" after the real link
     * is gone. The Host is therefore asked directly, and its answer drives the
     * offline/online transition of the glyph.
     */
    const PROBE_HEALTHY_MS = 15 * 1000;
    /** Probe faster while the feed host is unreachable, to recover promptly. */
    const PROBE_OFFLINE_MS = 5 * 1000;

    /**
     * Newest status from the latest read: undefined until the first read
     * settles, null when the feed or its `Status:` paragraph could not be read.
     */
    let feedStatus;

    const feedListeners = new Set();

    /** The active reader; components reach it through this handle. */
    let feedReader;

    /** Whether the browser currently reports no network at all. */
    function browserOffline() {
      return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    /** Publish the settled status so a mounted glyph re-renders. */
    function publishFeedStatus(status) {
      feedStatus = status;
      // Listener count separates "status never arrived" from "nothing mounted".
      debugLog('status:publish', () => ({ status, listeners: feedListeners.size }));
      for (const listener of [...feedListeners]) listener();
    }

    /**
     * Single owner of every feed-read decision: page load, new turn, cadence,
     * backoff, and network changes. Keeping them in one object makes their
     * ordering explicit:
     *
     *   1. A network transition is authoritative. It cancels the pending
     *      timer, aborts the in-flight read, and discards that read's result,
     *      so a request started on the old link can never overwrite the new
     *      network state.
     *   2. Going offline publishes the unreadable status immediately, so the
     *      glyph stops showing the last incident at once instead of waiting
     *      for a request that will never be sent.
     *   3. Coming back online reads immediately and restarts the backoff.
     *   4. A periodic Host probe, not `navigator.onLine`, is the authority on
     *      whether the link is gone; browser events only speed the transition.
     *
     * `generation` is the ordering token: it advances on each network
     * transition, and a read applies its result only while its own generation
     * is still current. Probes carry a second, independent token.
     */
    function createFeedReader(onStatus) {
      const state = {
        status: undefined,
        online: !browserOffline(),
        reading: false,
        retryIndex: 0,
        generation: 0,
        controller: undefined,
        timer: undefined,
        nextDelayMs: undefined,
        probeTimer: undefined,
        probePeriod: undefined,
        probeController: undefined,
        probeGeneration: 0,
        probing: false,
      };

      function publish(status) {
        if (state.status === status) return;
        state.status = status;
        onStatus(status);
      }

      function clearTimer() {
        clearTimeout(state.timer);
        state.timer = undefined;
        state.nextDelayMs = undefined;
      }

      /** Cancel the in-flight read; its generation check drops the result. */
      function abortRead() {
        if (state.controller === undefined) return;
        state.controller.abort();
        state.controller = undefined;
      }

      /** Arm one timer; a stopped or offline reader never arms one. */
      function schedule(delay) {
        clearTimer();
        if (!state.reading || !state.online) return;
        state.nextDelayMs = delay;
        state.timer = setTimeout(() => {
          state.timer = undefined;
          request();
        }, delay);
      }

      function scheduleCadence() {
        schedule(NORMAL_STATUSES.has(state.status) ? NORMAL_REFRESH_MS : ALERT_REFRESH_MS);
      }

      function scheduleRetry() {
        const delay = RETRY_DELAYS_MS[Math.min(state.retryIndex, RETRY_DELAYS_MS.length - 1)];
        state.retryIndex += 1;
        schedule(delay);
      }

      /** Re-arm the reachability heartbeat when its period changes. */
      function armProbe(period) {
        if (state.probeTimer !== undefined && state.probePeriod === period) return;
        clearInterval(state.probeTimer);
        state.probeTimer = undefined;
        state.probePeriod = period;
        if (!state.reading) return;
        state.probeTimer = setInterval(() => { probeNow(); }, period);
      }

      /** Abort the in-flight probe; its generation check drops the result. */
      function abortProbe() {
        state.probeGeneration += 1;
        if (state.probeController !== undefined) {
          state.probeController.abort();
          state.probeController = undefined;
        }
        state.probing = false;
      }

      function stopProbe() {
        clearInterval(state.probeTimer);
        state.probeTimer = undefined;
        state.probePeriod = undefined;
        abortProbe();
      }

      /**
       * Ask the Host whether it can reach the feed host. This is the only path
       * back from offline: navigator events may never arrive behind a virtual
       * adapter, while the Host sees the real egress failure.
       */
      async function probeNow() {
        if (!state.reading || state.probing) return;
        state.probing = true;
        const probeGeneration = state.probeGeneration;
        const controller = new AbortController();
        state.probeController = controller;
        const startedAt = Date.now();
        let outcome = 'unreachable';
        try {
          const response = await fetch(PROBE_ROUTE, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (response.ok) {
            try {
              const body = await response.json();
              outcome = body?.reachable === true
                ? 'reachable'
                : body?.reachable === false ? 'unreachable' : 'unavailable';
            } catch {
              outcome = 'unavailable';
            }
          } else {
            // A missing/older probe route must not look like a dead network.
            outcome = 'unavailable';
          }
        } catch {
          outcome = 'unreachable';
        }
        // A network transition fired while this probe was in flight; its
        // answer describes the old link, so it must not move the reader.
        if (probeGeneration !== state.probeGeneration) return;
        state.probing = false;
        state.probeController = undefined;
        if (!state.reading) return;
        if (outcome === 'reachable') {
          if (state.online) {
            armProbe(PROBE_HEALTHY_MS);
          } else {
            markOnline('probe');
          }
        } else if (outcome === 'unreachable') {
          if (state.online) {
            markOffline('unreachable');
          } else {
            armProbe(PROBE_OFFLINE_MS);
          }
        } else {
          // Keep polling; a Host reload can add the route later.
          armProbe(state.online ? PROBE_HEALTHY_MS : PROBE_OFFLINE_MS);
        }
        debugLog('probe:result', () => ({
          ...snapshot(),
          outcome,
          elapsedMs: Date.now() - startedAt,
        }));
      }

      /** Everything a trace needs about the current link and poll state. */
      function snapshot() {
        const connection = typeof navigator === 'undefined' ? undefined : navigator.connection;
        return {
          navigatorOnline: !browserOffline(),
          readerOnline: state.online,
          reading: state.reading,
          inflight: state.controller !== undefined,
          probing: state.probing,
          status: state.status === undefined ? 'unread' : state.status,
          retryIndex: state.retryIndex,
          generation: state.generation,
          nextDelayMs: state.nextDelayMs ?? null,
          probePeriodMs: state.probePeriod ?? null,
          connection: connection === undefined
            ? null
            : { type: connection.type ?? null, effectiveType: connection.effectiveType ?? null },
        };
      }

      /** Read once; a concurrent trigger joins the in-flight read. */
      async function request() {
        if (!state.reading || state.controller !== undefined) return;
        // Offline is owned by the probe/network handlers, not re-derived here.
        if (!state.online) return;
        clearTimer();
        const generation = state.generation;
        const controller = new AbortController();
        state.controller = controller;
        debugLog('read:start', () => ({ ...snapshot(), generation }));
        let status = null;
        let result;
        try {
          const response = await fetch(FEED_ROUTE, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
          });
          const body = response.ok ? await response.json() : null;
          status = typeof body?.status === 'string' ? body.status : null;
          result = { ok: response.ok, httpStatus: response.status, status };
        } catch (error) {
          status = null;
          result = { ok: false, error: error?.name ?? String(error) };
        }
        // A network transition took over while this read was in flight: the
        // result describes the old link and must not be published.
        if (generation !== state.generation) {
          debugLog('read:stale', () => ({ ...snapshot(), generation, result }));
          return;
        }
        state.controller = undefined;
        if (!state.reading) return;
        let outcome;
        if (status === null) {
          // The Host answered but could not read the feed: keep retrying while
          // the reachability probe says the network is still up.
          publish(null);
          scheduleRetry();
          outcome = 'unreachable';
        } else {
          publish(status);
          state.retryIndex = 0;
          scheduleCadence();
          outcome = 'ok';
        }
        debugLog('read:result', () => ({ ...snapshot(), outcome, result }));
      }

      /** No network: stop reading, show the fallback, and probe for recovery. */
      function markOffline(reason) {
        const wasOnline = state.online;
        state.generation += 1;
        state.online = false;
        state.retryIndex = 0;
        clearTimer();
        abortRead();
        abortProbe();
        publish(null);
        armProbe(PROBE_OFFLINE_MS);
        if (wasOnline) debugLog(`network:${reason}`, () => snapshot());
      }

      /** Reachable again: drop stale work, read at once, and probe less often. */
      function markOnline(reason) {
        state.generation += 1;
        state.online = true;
        state.retryIndex = 0;
        clearTimer();
        abortRead();
        abortProbe();
        armProbe(PROBE_HEALTHY_MS);
        debugLog(`network:${reason}`, () => snapshot());
        request();
      }

      return {
        start() {
          state.reading = true;
          if (browserOffline()) {
            // The event may already have fired before mount; the probe confirms.
            markOffline('offline');
            debugLog('network:offline', () => snapshot());
            probeNow();
            return;
          }
          armProbe(PROBE_HEALTHY_MS);
          request();
        },
        stop() {
          state.reading = false;
          clearTimer();
          abortRead();
          stopProbe();
        },
        /** A new turn or the reader's own timer asks for a read. */
        refresh() {
          if (!state.reading || !state.online) return;
          request();
        },
        offline() {
          markOffline('offline');
          probeNow();
        },
        online() {
          if (browserOffline()) {
            markOffline('offline');
            probeNow();
            return;
          }
          markOnline('online');
          probeNow();
        },
        /** A `navigator.connection` type change, which may still be online. */
        switched() {
          if (browserOffline()) {
            markOffline('unreachable');
            probeNow();
            return;
          }
          markOnline('switch');
          probeNow();
        },
      };
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
        if (after.some(id => !before.includes(id))) feedReader?.refresh();
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
      // Confirms the glyph actually re-rendered with the new published status.
      debugLog('icon:render', () => ({
        status: typeof status === 'string' ? status : null,
        glyph: mark.glyph,
      }));
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
          const browser = typeof window === 'undefined' ? undefined : window;
          const connection = typeof navigator === 'undefined' ? undefined : navigator.connection;
          const reader = createFeedReader(publishFeedStatus);
          feedReader = reader;
          // `navigator.connection` reports a Wi-Fi/cellular switch that leaves
          // the browser online; only a type change counts as a network switch.
          const networkSignature = () => connection === undefined
            ? ''
            : `${connection.type ?? ''}|${connection.effectiveType ?? ''}`;
          let lastNetwork = networkSignature();
          // Network handlers preempt the reader: each one cancels the pending
          // timer and aborts the in-flight read before the new state applies.
          const onOffline = () => { reader.offline() };
          const onOnline = () => { reader.online() };
          const onConnectionChange = () => {
            const next = networkSignature();
            if (next === lastNetwork) return;
            lastNetwork = next;
            reader.switched();
          };
          browser?.addEventListener?.('offline', onOffline);
          browser?.addEventListener?.('online', onOnline);
          connection?.addEventListener?.('change', onConnectionChange);
          // Load-time connectivity check: an offline reader sends nothing and
          // publishes the fallback; `online` starts the first read.
          reader.start();
          return () => {
            browser?.removeEventListener?.('offline', onOffline);
            browser?.removeEventListener?.('online', onOnline);
            connection?.removeEventListener?.('change', onConnectionChange);
            reader.stop();
            if (feedReader === reader) feedReader = undefined;
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
