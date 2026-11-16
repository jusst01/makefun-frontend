// Caching GET client for make.fun API
const CACHE = new Map();
const PENDING = new Map();

async function getJson(path) {
  const url = `https://make.fun/api${path}`;
  if (PENDING.has(url)) return PENDING.get(url);

  const promise = (async () => {
    const cached = CACHE.get(url) || JSON.parse(sessionStorage.getItem(url) || 'null');

    const headers = {};
    if (cached && cached.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    const response = await fetch(url, { headers });

    if (response.status === 304) {
      return cached.body;
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const etag = response.headers.get('ETag');
    const body = await response.json();

    const entry = { etag, body, at: Date.now() };
    CACHE.set(url, entry);
    sessionStorage.setItem(url, JSON.stringify(entry));

    return body;
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
