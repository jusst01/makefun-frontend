// Caching GET client for make.fun API.
// One fetch per URL per page session, shared by every view that needs it (the
// bounty page and the leaderboard page both read the same 19 MB leaderboard),
// and one in-flight request when two views ask at the same time.
//
// Requests are plain CORS-safelisted GETs. Conditional headers such as
// If-None-Match are deliberately absent: they are not safelisted, so sending
// them makes the browser preflight an API that answers the preflight without
// CORS headers, and the request fails outright.
const CACHE = new Map();
const PENDING = new Map();

async function getJson(path) {
  const url = `https://make.fun/api${path}`;

  if (CACHE.has(url)) return CACHE.get(url);
  if (PENDING.has(url)) return PENDING.get(url);

  const promise = (async () => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const body = await response.json();
    CACHE.set(url, body);
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
