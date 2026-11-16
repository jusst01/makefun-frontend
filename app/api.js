// Caching GET client for make.fun API
const CACHE = new Map();
const PENDING = new Map();

async function getJson(path) {
  const url = `https://make.fun/api${path}`;
  if (PENDING.has(url)) return PENDING.get(url);

  const promise = (async () => {
    let cached = CACHE.get(url);
    if (!cached) {
      try {
        cached = JSON.parse(sessionStorage.getItem(url) || 'null');
      } catch (e) {
        console.warn('Failed to read sessionStorage', e);
      }
    }

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
    const json = JSON.stringify(entry);
    if (json.length < 500000) {
      try {
        sessionStorage.setItem(url, json);
      } catch (e) {
        console.warn('Failed to write sessionStorage', e);
      }
    }

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
