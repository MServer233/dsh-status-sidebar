/**
 * Host half of the status sidebar bundle.
 *
 * The status feed carries no CORS header, so the browser cannot fetch
 * `feed.rss` itself. This half serves the newest `Status:` value on an
 * authenticated Host route; the Client half renders it as the sidebar glyph.
 */
import { FEED_PATH, FEED_URL, latestStatus } from './feed.js';

/** The feed route lives on the Host Connection service. */
export const inject = ['connection'];

/** Upstream read budget; a slower/absent feed leaves the plain activity mark. */
const FEED_TIMEOUT_MS = 8000;

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
}

/**
 * Answer with the derived status, never cached so each page start reads again.
 * @param {string | null} status - newest `Status:` value, or null when unreadable.
 * @returns {Response} JSON body `{ status }`.
 */
function statusResponse(status) {
  return Response.json({ status }, { headers: { 'cache-control': 'no-store' } });
}
