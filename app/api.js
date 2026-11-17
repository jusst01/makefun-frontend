// Caching GET client for make.fun API
// The API sends short-lived cacheable responses (max-age plus ETag), so the
// browser HTTP cache already serves repeats. We only dedupe in-flight requests,
// and we never send our own If-None-Match: a 304 from the API has no CORS
// headers, which makes the browser block the cross-origin response.
const PENDING = new Map();

async function getJson(path) {
  const url = `https://make.fun/api${path}`;
  if (PENDING.has(url)) return PENDING.get(url);

  const promise = (async () => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
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
