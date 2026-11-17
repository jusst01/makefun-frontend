import {
  getBounties,
  getBounty,
  getLeaderboard,
  getProfile,
  beginView,
  subscribe,
  counters
} from './api.js';
import * as fmt from './format.js';

const app = document.getElementById('app');
const net = document.getElementById('net');

// Header readout: one line describing this view's traffic, repainted whenever a
// counter moves. No data is shown until this view has actually made a request.
function paintNet(state) {
  if (!net) return;
  const requests = state.requests;
  const parts = [`this view: ${requests} API ${fmt.plural(requests, 'request', 'requests')}`];
  parts.push(`${state.reused} from cache`);
  if (state.unchanged > 0) parts.push(`${state.unchanged} unchanged (ETag)`);
  if (state.at) parts.push(`as of ${state.at} UTC`);
  net.textContent = parts.join(' · ');
}

subscribe(paintNet);
paintNet(counters);

const loadingHtml = () => `
  <div class="skeleton" style="display:flex;flex-direction:column;gap:12px;padding:20px 0;background:transparent">
    <div class="skel-line" style="width:42%;height:30px"></div>
    <div class="skel-line" style="width:24%"></div>
    <div class="skel-line" style="width:88%"></div>
    <div class="skel-line" style="width:76%"></div>
    <div class="skel-line" style="width:64%"></div>
  </div>
`;

const errorHtml = (message) => `
  <div class="error-box">
    <h2>Something went wrong</h2>
    <p>${fmt.esc(message)}</p>
    <button type="button" class="btn btn-primary" id="retry">Try again</button>
  </div>
`;

const notFoundHtml = () => `
  <div class="empty">
    <h2>Page not found</h2>
    <p>That page does not exist.</p>
    <a class="btn btn-ghost" href="#/">Back to the board</a>
  </div>
`;

async function render() {
  window.__shotReady = false;
  beginView();
  const hash = location.hash || '#/';

  app.innerHTML = loadingHtml();

  try {
    if (hash === '#/') {
      document.title = 'Board · make.fun bounties';
      const { renderBoard } = await import('./views/board.js');
      await renderBoard(app);
    } else if (hash.startsWith('#/bounty/')) {
      const parts = hash.split('/');
      const slug = parts[2];
      if (parts[3] === 'leaderboard') {
        document.title = `Leaderboard · ${slug}`;
        const { renderLeaderboard } = await import('./views/leaderboard.js');
        await renderLeaderboard(app, slug);
      } else {
        document.title = slug;
        const { renderBounty } = await import('./views/bounty.js');
        await renderBounty(app, slug);
      }
    } else if (hash.startsWith('#/u/')) {
      const handle = hash.split('/')[2];
      document.title = `@${handle}`;
      const { renderProfile } = await import('./views/profile.js');
      await renderProfile(app, handle);
    } else {
      document.title = 'Not found';
      app.innerHTML = notFoundHtml();
      document.documentElement.scrollTop = 0;
    }

    document.documentElement.scrollTop = 0;
  } catch (e) {
    app.innerHTML = errorHtml(e && e.message ? e.message : 'Unknown error');
    const retry = app.querySelector('#retry');
    if (retry) retry.addEventListener('click', () => { render(); });
  } finally {
    window.__shotReady = true;
  }
}

window.addEventListener('hashchange', render);
render();
