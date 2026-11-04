/**
 * Ordering tests for the Client feed reader.
 *
 * The module is evaluated in a VM with fake timers, a fake `fetch`, and a
 * minimal React stub, so network transitions and read results can be
 * interleaved deterministically. Network control does not exist in this
 * environment, hence the simulation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const COLORS = {
  red: 'var(--dsw-alias-state-error-primary, #f25a5a)',
  yellow: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
  rest: 'currentColor',
};

const flush = () => new Promise(resolve => setImmediate(resolve));

function createHarness({ online = true } = {}) {
  const timers = new Map();
  const intervals = new Map();
  const windowListeners = new Map();
  const connectionListeners = new Set();
  const reads = [];
  const probes = [];
  const connection = {
    type: 'wifi',
    effectiveType: '4g',
    addEventListener(type, fn) {
      if (type === 'change') connectionListeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'change') connectionListeners.delete(fn);
    },
  };
  const navigator = { onLine: online, connection };
  let timerSeq = 0;
  let intervalSeq = 0;
  let definition;
  let iconComponent;
  let stateUpdates = 0;
  let effectsRun = 0;

  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const React = {
    createElement: h,
    Fragment: 'Fragment',
    useState(initial) {
      return [initial, () => { stateUpdates += 1 }];
    },
    useEffect(fn) {
      // The glyph's two effects subscribe it and initialise the turn tracker.
      if (effectsRun < 2) {
        effectsRun += 1;
        fn();
      }
    },
    useRef(initial) { return { current: initial } },
    useCallback(fn) { return fn },
  };

  function fakeFetch(url, init) {
    const read = { url, init, aborted: false };
    read.promise = new Promise((resolve, reject) => {
      read.succeed = body => resolve({ ok: true, status: 200, json: async () => body });
      read.failStatus = status => resolve({ ok: false, status, json: async () => ({}) });
      read.fail = () => reject(new Error('network down'));
    });
    init.signal?.addEventListener?.('abort', () => { read.aborted = true });
    (url === 'api/status-sidebar.probe' ? probes : reads).push(read);
    return read.promise;
  }

  const win = {
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      windowListeners.get(type)?.delete(fn);
    },
    __ModuleLoader__: {
      load(loaded) { definition = loaded },
    },
  };

  const sandbox = {
    window: win,
    navigator,
    fetch: fakeFetch,
    setTimeout(fn, delay) {
      const id = ++timerSeq;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id) },
    setInterval(fn, period) {
      const id = ++intervalSeq;
      intervals.set(id, { fn, period });
      return id;
    },
    clearInterval(id) { intervals.delete(id) },
    AbortController,
    // Keep the tracing output out of the test report; `DSS_DEBUG=1` shows it.
    console: process.env.DSS_DEBUG ? console : { debug() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  assert.ok(definition, 'client module registered itself');

  const module = definition.factory(() => React);
  const cleanups = [];
  module.apply({
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
    locale: {
      register: () => () => {},
      bind: () => key => key,
    },
    slots: {
      inject: (name, factory) => factory(),
      register: (options, component) => {
        if (options.name === 'sidebar.panellist') iconComponent = component;
        return {};
      },
    },
  });
  assert.ok(iconComponent, 'sidebar glyph component registered');

  const dispatchWindow = (type) => {
    for (const fn of [...(windowListeners.get(type) ?? [])]) fn();
  };

  return {
    reads,
    probes,
    /** Render the glyph and read the stroke, size, and shape of its SVG. */
    glyph() {
      const tree = iconComponent({ size: 16, useSessions: undefined });
      const nodes = tree.children.flat(Infinity).filter(node => node && node.type);
      return {
        stroke: tree.props.stroke,
        strokeWidth: tree.props.strokeWidth,
        width: tree.props.width,
        height: tree.props.height,
        shape: nodes.map(node => node.type).join(' '),
      };
    },
    /** Poll-free count of listener-driven state updates. */
    takeStateUpdates() {
      const count = stateUpdates;
      stateUpdates = 0;
      return count;
    },
    goOffline() {
      navigator.onLine = false;
      dispatchWindow('offline');
    },
    goOnline() {
      navigator.onLine = true;
      dispatchWindow('online');
    },
    setConnection(type) {
      connection.type = type;
      for (const fn of [...connectionListeners]) fn();
    },
    timerDelays() {
      return [...timers.values()].map(timer => timer.delay);
    },
    probeIntervals() {
      return [...intervals.values()].map(interval => interval.period);
    },
    fireProbe() {
      const next = intervals.entries().next();
      assert.equal(next.done, false, 'a probe interval is armed');
      next.value[1].fn();
    },
    runTimer() {
      const next = timers.entries().next();
      assert.equal(next.done, false, 'a timer is armed');
      const [id, timer] = next.value;
      timers.delete(id);
      timer.fn();
    },
    listenerCounts() {
      return {
        window: [...windowListeners.values()].reduce((sum, set) => sum + set.size, 0),
        connection: connectionListeners.size,
      };
    },
    cleanup() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}

test('offline publishes the unreadable mark at once and drops the in-flight read', async () => {
  const hs = createHarness();
  assert.equal(hs.reads.length, 1);

  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.rest);
  assert.equal(hs.glyph().shape, 'path');
  assert.deepEqual(hs.timerDelays(), [600000]);

  hs.runTimer();
  assert.equal(hs.reads.length, 2);

  hs.takeStateUpdates();
  hs.goOffline();
  // The glyph updates without waiting for the read to settle.
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path');
  assert.ok(hs.takeStateUpdates() > 0, 'the subscribed glyph was notified');
  assert.equal(hs.reads[1].aborted, true);
  assert.deepEqual(hs.timerDelays(), []);

  // A transport that ignored the abort and succeeded late must not apply.
  hs.reads[1].succeed({ status: 'investigating' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path');
  assert.equal(hs.reads.length, 2, 'no request is made while offline');
});

test('online reads immediately, applies the new status, and re-arms the cadence', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();

  hs.goOffline();
  assert.equal(hs.glyph().stroke, COLORS.red);

  hs.goOnline();
  assert.equal(hs.reads.length, 2);
  hs.reads[1].succeed({ status: 'ongoing' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path path');
  assert.deepEqual(hs.timerDelays(), [60000]);
});

test('a page load while offline sends nothing and shows the unreadable mark', async () => {
  const hs = createHarness({ online: false });
  assert.equal(hs.reads.length, 0);
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path');

  hs.goOnline();
  assert.equal(hs.reads.length, 1);
  hs.reads[0].succeed({ status: 'scheduled' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.yellow);
  assert.equal(hs.glyph().shape, 'path path path path path circle');
  assert.deepEqual(hs.timerDelays(), [60000]);
});

test('online backoff steps 5s/10s and an offline-online switch restarts it', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: null });
  await flush();
  assert.deepEqual(hs.timerDelays(), [5000]);

  hs.runTimer();
  hs.reads[1].succeed({ status: null });
  await flush();
  assert.deepEqual(hs.timerDelays(), [10000]);

  hs.runTimer();
  hs.reads[2].succeed({ status: null });
  await flush();
  assert.deepEqual(hs.timerDelays(), [10000]);

  hs.goOffline();
  assert.deepEqual(hs.timerDelays(), []);
  hs.goOnline();
  assert.equal(hs.reads.length, 4);
  hs.reads[3].succeed({ status: null });
  await flush();
  assert.deepEqual(hs.timerDelays(), [5000]);
});

test('a connection type switch preempts the read and drops its result', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  hs.runTimer();
  assert.equal(hs.reads.length, 2);

  hs.setConnection('cellular');
  assert.equal(hs.reads[1].aborted, true);
  assert.equal(hs.reads.length, 3);

  hs.reads[1].succeed({ status: 'resolved' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.rest);

  hs.reads[2].succeed({ status: 'investigating' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'circle line line');
});

test('a failed Host probe goes offline while navigator still reports online', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.rest);
  assert.deepEqual(hs.probeIntervals(), [15000]);

  // A healthy probe only confirms reachability; it does not read the feed.
  hs.fireProbe();
  hs.probes[0].succeed({ reachable: true });
  await flush();
  assert.equal(hs.reads.length, 1);
  assert.deepEqual(hs.probeIntervals(), [15000]);

  hs.fireProbe();
  hs.probes[1].succeed({ reachable: false });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path');
  assert.deepEqual(hs.probeIntervals(), [5000]);

  // Recovery also works through the probe, without an `online` event.
  hs.fireProbe();
  hs.probes[2].succeed({ reachable: true });
  await flush();
  assert.equal(hs.reads.length, 2);
  hs.reads[1].succeed({ status: 'ongoing' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path path');
  assert.deepEqual(hs.probeIntervals(), [15000]);
});

test('a failed probe aborts the read already in flight', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  hs.runTimer();
  assert.equal(hs.reads.length, 2);

  hs.fireProbe();
  hs.probes[0].succeed({ reachable: false });
  await flush();
  assert.equal(hs.reads[1].aborted, true);
  assert.equal(hs.glyph().stroke, COLORS.red);
  assert.equal(hs.glyph().shape, 'path path path path path path path');
  assert.deepEqual(hs.probeIntervals(), [5000]);
});

test('a reachable Host probe restores an offline page load without an online event', async () => {
  const hs = createHarness({ online: false });
  assert.equal(hs.reads.length, 0);
  assert.equal(hs.probes.length, 1);

  hs.probes[0].succeed({ reachable: true });
  await flush();
  assert.equal(hs.reads.length, 1);
  hs.reads[0].succeed({ status: 'scheduled' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.yellow);
  assert.equal(hs.glyph().shape, 'path path path path path circle');
  assert.deepEqual(hs.probeIntervals(), [15000]);
});

test('a stale probe failure cannot undo a newer online transition', async () => {
  const hs = createHarness({ online: false });
  assert.equal(hs.probes.length, 1);

  hs.goOnline();
  assert.equal(hs.reads.length, 1);
  assert.equal(hs.probes.length, 2);

  // The offline probe answers after the transition; its answer is stale.
  hs.probes[0].succeed({ reachable: false });
  await flush();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.rest);
  assert.deepEqual(hs.probeIntervals(), [15000]);
});

test('a missing probe route is not mistaken for a dead network', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();

  hs.fireProbe();
  hs.probes[0].failStatus(404);
  await flush();
  assert.equal(hs.glyph().stroke, COLORS.rest);
  assert.deepEqual(hs.probeIntervals(), [15000]);
});

test('cleanup removes listeners, timers, and the in-flight read', async () => {
  const hs = createHarness();
  hs.reads[0].succeed({ status: 'resolved' });
  await flush();
  assert.deepEqual(hs.timerDelays(), [600000]);
  assert.deepEqual(hs.probeIntervals(), [15000]);
  assert.deepEqual(hs.listenerCounts(), { window: 2, connection: 1 });

  hs.cleanup();
  assert.deepEqual(hs.timerDelays(), []);
  assert.deepEqual(hs.probeIntervals(), []);
  assert.deepEqual(hs.listenerCounts(), { window: 0, connection: 0 });

  hs.goOffline();
  assert.equal(hs.glyph().stroke, COLORS.rest, 'no listener reacts after cleanup');
});

test('glyph mapping covers pending, unreadable, and every incident status', async () => {
  const pending = createHarness();
  assert.deepEqual(pending.glyph(), {
    stroke: COLORS.rest,
    strokeWidth: 1.6,
    width: 16,
    height: 16,
    shape: 'path path path',
  });
  pending.cleanup();

  const unreadable = createHarness();
  unreadable.reads[0].succeed({ status: null });
  await flush();
  assert.deepEqual(unreadable.glyph(), {
    stroke: COLORS.red,
    strokeWidth: 1.6,
    width: 16,
    height: 16,
    shape: 'path path path path path path path',
  });
  unreadable.cleanup();

  const cases = [
    ['investigating', COLORS.red, 'circle line line'],
    ['identified', COLORS.red, 'circle line line'],
    ['monitoring', COLORS.red, 'circle line line'],
    ['ongoing', COLORS.red, 'path path path path path path path path'],
    ['scheduled', COLORS.yellow, 'path path path path path circle'],
    ['resolved', COLORS.rest, 'path'],
    ['completed', COLORS.rest, 'path'],
    ['maintenance', COLORS.rest, 'path'],
  ];
  for (const [status, stroke, shape] of cases) {
    const hs = createHarness();
    hs.reads[0].succeed({ status });
    await flush();
    assert.deepEqual(hs.glyph(), { stroke, strokeWidth: 1.6, width: 16, height: 16, shape }, status);
    hs.cleanup();
  }
});
