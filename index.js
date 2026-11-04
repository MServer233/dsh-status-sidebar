/**
 * Host half of the status sidebar bundle.
 *
 * The status feed carries no CORS header, so the browser cannot fetch
 * `feed.rss` itself. This half serves the newest `Status:` value on an
 * authenticated Host route; the Client half renders it as the sidebar glyph.
 */
import { FEED_PATH, FEED_URL, PROBE_PATH, latestStatus } from './feed.js';

/** The feed routes live on the Host Connection service. */
export const inject = ['connection'];

/** Upstream read budget; a slower/absent feed leaves the plain activity mark. */
const FEED_TIMEOUT_MS = 8000;

/** Reachability probe budget; only proves that a request can leave the Host. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Register the feed route on the Host.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context carrying Connection.
 */
export function apply(ctx) {
  ctx.connection.fetch.register({
    path: FEED_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(FEED_TIMEOUT_MS)]);
      try {
        const response = await fetch(FEED_URL, {
          signal,
          cache: 'no-store',
          headers: { accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
        });
        if (!response.ok) return statusResponse(null);
        return statusResponse(latestStatus(await response.text()));
      } catch {
        // Offline, timed out, or an unreadable body: the Client keeps its fallback glyph.
        return statusResponse(null);
      }
    },
  });

  ctx.connection.fetch.register({
    path: PROBE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]);
      try {
        // Any HTTP response proves the path leaves the Host; HEAD stays cheap and
        // also succeeds when the feed itself is temporarily broken.
        await fetch(FEED_URL, { method: 'HEAD', signal, cache: 'no-store' });
        return probeResponse(true);
      } catch {
        // No route, DNS failure, or timeout: the Client treats the feed as unreachable.
        return probeResponse(false);
      }
    },
  });
}

/**
 * Answer with the derived status, never cached so each page start reads again.
 * @param {string | null} status - newest `Status:` value, or null when unreadable.
 * @returns {Response} JSON body `{ status }`.
 */
function statusResponse(status) {
  return Response.json({ status }, { headers: { 'cache-control': 'no-store' } });
}

/**
 * Answer whether the Host could reach the feed host at all.
 * @param {boolean} reachable - true when the HEAD request received any response.
 * @returns {Response} JSON body `{ reachable }`.
 */
function probeResponse(reachable) {
  return Response.json({ reachable }, { headers: { 'cache-control': 'no-store' } });
}
