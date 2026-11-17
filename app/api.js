// Revalidate with browser-native ETags: memory serves the current minute, then
// fetch(no-cache) lets the browser add If-None-Match. Never set that header by
// hand: make.fun 304 responses omit CORS headers and manual conditionals fail.
const CACHE = new Map();
const PENDING = new Map();

export const telemetry = { requests: 0, reused: 0, unchanged: 0, at: '' };
const listeners = new Set();
const notify = () => {
  listeners.forEach((listener) => listener(telemetry));
};
export const subscribe = (listener) => {
  listeners.add(listener);
  notify();
  return () => listeners.delete(listener);
};
export const beginView = () => {
  telemetry.requests = 0;
  telemetry.reused = 0;
  telemetry.unchanged = 0;
  telemetry.at = '';
  notify();
};

const currentMinute = () => Math.floor(Date.now() / 60000);
const markNetworkAnswer = () => {
  telemetry.at = new Date().toISOString().slice(11, 16);
};

async function getJson(path) {
  const url = `https://make.fun/api${path}`;
  const minute = currentMinute();
  const cached = CACHE.get(url);
  if (cached && cached.minute === minute) {
    telemetry.reused += 1;
    notify();
    return cached.data;
  }
  if (PENDING.has(url)) {
    telemetry.reused += 1;
    notify();
    return PENDING.get(url);
  }

  const promise = (async () => {
    telemetry.requests += 1;
    notify();
    const response = await fetch(url, { cache: 'no-cache' });
    markNetworkAnswer();
    notify();
    if (response.status === 304) {
      if (!cached) throw new Error('API error: 304 without cached data');
      cached.minute = currentMinute();
      telemetry.unchanged += 1;
      notify();
      return cached.data;
    }
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const etag = response.headers.get('ETag');
    if (cached && etag && etag === cached.etag) {
      cached.minute = currentMinute();
      telemetry.unchanged += 1;
      notify();
      return cached.data;
    }
    const data = await response.json();
    CACHE.set(url, { etag, data, minute: currentMinute() });
    return data;
  })();

  PENDING.set(url, promise);
  try {
    return await promise;
  } finally {
    PENDING.delete(url);
  }
}

export const getBounties = () => getJson('/competitions?status=open&activity=times');
export const getBounty = (slug) => getJson(`/competitions/${slug}`);
export const getLeaderboard = (slug) => getJson(`/competitions/${slug}/leaderboard`);
export const getProfile = (handle) => getJson(`/profiles/${handle}`);

const secondSubscribers = new Set();
let secondTimer;
export const everySecond = (fn) => {
  secondSubscribers.add(fn);
  if (!secondTimer) secondTimer = setInterval(() => secondSubscribers.forEach((callback) => callback()), 1000);
  return () => {
    secondSubscribers.delete(fn);
    if (!secondSubscribers.size) {
      clearInterval(secondTimer);
      secondTimer = undefined;
    }
  };
};

export const onMinuteTurn = (fn) => {
  let timer;
  const arm = () => {
    const delay = 60000 - (Date.now() % 60000) + 2000;
    timer = setTimeout(() => {
      if (typeof document === 'undefined' || !document.hidden) fn();
      arm();
    }, delay);
  };
  arm();
  return () => clearTimeout(timer);
};

export function patchRows(container, items, keyOf, make, fill) {
  const existing = new Map();
  for (const row of container.children) existing.set(row.dataset.key, row);

  const wanted = new Set(items.map((item) => String(keyOf(item))));
  for (const [key, row] of existing) {
    if (!wanted.has(key)) {
      row.remove();
      existing.delete(key);
    }
  }

  // Walk the wanted order with a cursor over the live children: a row already
  // sitting at the cursor stays put, anything else is moved once. Rows that
  // never moved keep their nodes, their scroll position and their focus.
  let cursor = container.firstElementChild;
  for (const item of items) {
    const key = String(keyOf(item));
    let row = existing.get(key);
    if (row) {
      fill(row, item);
    } else {
      row = make(item);
      row.dataset.key = key;
      existing.set(key, row);
      // fill then runs on the fresh node too, so make may hand back a bare
      // element and fill stays the one place that writes contents.
      fill(row, item);
    }
    if (row !== cursor) container.insertBefore(row, cursor);
    cursor = row.nextElementSibling;
  }
}
