/**
 * Host-side contract of the reachability probe.
 *
 * `fetch` is stubbed so the test proves the request shape and both response
 * branches without depending on the live status site.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_URL, PROBE_PATH } from '../feed.js';
import { apply } from '../index.js';

function routeTable() {
  const routes = new Map();
  apply({
    connection: {
      fetch: {
        register(definition) { routes.set(definition.path, definition) },
      },
    },
  });
  return routes;
}

test('probe route sends a HEAD and reports reachable on any response', async (t) => {
  const route = routeTable().get(PROBE_PATH);
  assert.ok(route, 'probe route registered');
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 200 });
  };
  t.after(() => { globalThis.fetch = original });

  const response = await route.fetch({ signal: new AbortController().signal });
  assert.deepEqual(await response.json(), { reachable: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(captured.url, FEED_URL);
  assert.equal(captured.init.method, 'HEAD');
  assert.equal(captured.init.cache, 'no-store');
});

test('probe route reports unreachable when the upstream request fails', async (t) => {
  const route = routeTable().get(PROBE_PATH);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed') };
  t.after(() => { globalThis.fetch = original });

  const response = await route.fetch({ signal: new AbortController().signal });
  assert.deepEqual(await response.json(), { reachable: false });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
