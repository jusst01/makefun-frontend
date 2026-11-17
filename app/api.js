// Revalidating GET client for make.fun API.
// One parsed body per URL is held in memory and revalidated each minute by fetch(url, {cache: 'no-cache'}),
// letting the browser add If-None-Match from its own cache: a hand-set conditional header breaks the 304,
// because make.fun's 304 carries no CORS headers and the browser then blocks that response outright.
const API = 'https://make.fun/api';

// url -> { etag, data, minute } (minute = floor(epoch ms / 60000) of last validation)
const MEMORY = new Map();
// url -> promise, so concurrent callers share one network round trip
const PENDING = new Map();

// Live counters for the header readout; `at` is when the API last answered.
export const counters = { requests: 0, reused: 0, unchanged: 0, at: '' };

const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener(counters);
    } catch {
      // A broken readout must never break the data path.
    }
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Called by the router at the start of every view: the readout describes that
// view's requests, so only the three view counters reset. `at` stays, because it
// records the last time the API answered in this session.
export function beginView() {
  counters.requests = 0;
  counters.reused = 0;
  counters.unchanged = 0;
  notify();
}

const currentMinute = () => Math.floor(Date.now() / 60000);

const utcClock = () => {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

async function fetchJson(url) {
  counters.requests += 1;
  notify();

  const response = await fetch(url, { cache: 'no-cache' });
  const known = MEMORY.get(url);

  // Browser-native revalidation found no change. Keep the same parsed object so
  // callers can compare identity and skip re-rendering.
  if (response.status === 304) {
    if (!known) throw new Error('API error: 304 without a cached body');
    known.minute = currentMinute();
    counters.unchanged += 1;
    counters.at = utcClock();
    notify();
    return known.data;
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const etag = response.headers.get('ETag');
  if (known && etag && etag === known.etag) {
    known.minute = currentMinute();
    counters.unchanged += 1;
    counters.at = utcClock();
    notify();
    return known.data;
  }

  const data = await response.json();
  MEMORY.set(url, { etag, data, minute: currentMinute() });
  counters.at = utcClock();
  notify();
  return data;
}

function getJson(path) {
  const url = `${API}${path}`;
  const minute = currentMinute();

  const known = MEMORY.get(url);
  if (known && known.minute === minute) {
    counters.reused += 1;
    notify();
    return Promise.resolve(known.data);
  }

  const pending = PENDING.get(url);
  if (pending) {
    counters.reused += 1;
    notify();
    return pending;
  }

  const promise = fetchJson(url).finally(() => {
    if (PENDING.get(url) === promise) PENDING.delete(url);
  });
  PENDING.set(url, promise);
  return promise;
}

export const getBounties = () => getJson('/competitions?status=open&activity=times');
export const getBounty = (slug) => getJson(`/competitions/${slug}`);
export const getLeaderboard = (slug) => getJson(`/competitions/${slug}/leaderboard`);
export const getProfile = (handle) => getJson(`/profiles/${handle}`);

// One interval for the whole app, fanned out to every subscriber.
const ticks = new Set();
let tickHandle = null;

export function everySecond(fn) {
  ticks.add(fn);
  if (tickHandle === null) {
    tickHandle = setInterval(() => {
      for (const tick of ticks) {
        try {
          tick();
        } catch {
          // One broken countdown must not stop the others.
        }
      }
    }, 1000);
  }
  return () => {
    ticks.delete(fn);
    if (!ticks.size && tickHandle !== null) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  };
}

// Runs just after each minute boundary, when the API's ETags roll. A hidden tab
// skips the call but keeps the timer armed, so the next visible turn fires on time.
export function onMinuteTurn(fn) {
  let timer = null;
  let stopped = false;

  const arm = () => {
    if (stopped) return;
    const delay = 60000 - (Date.now() % 60000) + 2000;
    timer = setTimeout(() => {
      timer = null;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!hidden) {
        try {
          fn();
        } catch {
          // Leave the timer armed even if the callback throws.
        }
      }
      arm();
    }, delay);
  };

  arm();
  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// Longest increasing subsequence of `values`, returned as the set of indices that
// stay put. Everything else in a keyed reorder has to move, so this keeps the
// number of DOM moves at the minimum.
function stableIndices(values) {
  const tails = [];
  const prev = new Array(values.length).fill(-1);

  for (let i = 0; i < values.length; i += 1) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < values[i]) low = mid + 1;
      else high = mid;
    }
    if (low > 0) prev[i] = tails[low - 1];
    tails[low] = i;
  }

  const keep = new Set();
  let cursor = tails.length ? tails[tails.length - 1] : -1;
  while (cursor !== -1) {
    keep.add(cursor);
    cursor = prev[cursor];
  }
  return keep;
}

// Keyed list patching: surviving rows keep their nodes (fill rewrites contents),
// new keys get fresh nodes, vanished keys are removed, and order follows `items`
// with the fewest node moves.
export function patchRows(container, items, keyOf, make, fill) {
  const existing = new Map();
  const order = [];

  for (const node of Array.from(container.children)) {
    const key = node.__patchKey;
    if (key !== undefined && !existing.has(key)) {
      existing.set(key, node);
      order.push(node);
    } else {
      node.remove();
    }
  }

  const position = new Map();
  order.forEach((node, index) => position.set(node, index));

  const nodes = [];
  const values = [];
  const isNew = [];

  for (const item of items) {
    const key = keyOf(item);
    let node = existing.get(key);
    if (node) {
      existing.delete(key);
      values.push(position.get(node));
      isNew.push(false);
    } else {
      node = make(item);
      node.__patchKey = key;
      values.push(Infinity);
      isNew.push(true);
    }
    fill(node, item);
    nodes.push(node);
  }

  for (const node of existing.values()) node.remove();

  if (!nodes.length) return;

  // Only reused rows have a real old position; new rows always need placing.
  const reusedIndex = [];
  const reusedValues = [];
  nodes.forEach((_, index) => {
    if (!isNew[index]) {
      reusedIndex.push(index);
      reusedValues.push(values[index]);
    }
  });

  const keep = new Set();
  for (const i of stableIndices(reusedValues)) keep.add(reusedIndex[i]);

  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (keep.has(i)) continue;
    const anchor = i + 1 < nodes.length ? nodes[i + 1] : null;
    container.insertBefore(nodes[i], anchor);
  }
}
