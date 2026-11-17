import { getBounties, getBounty, getLeaderboard, getProfile, beginView, subscribe } from './api.js';
import * as fmt from './format.js';

const app = document.getElementById('app');
const net = document.getElementById('net');

function paintTelemetry({ requests, reused, unchanged, at }) {
  if (!net) return;
  const suffix = unchanged > 0 ? ` · ${unchanged} unchanged (ETag)` : '';
  const timestamp = at ? ` · as of ${at} UTC` : '';
  net.textContent = `this view: ${requests} API request${requests === 1 ? '' : 's'} · ${reused} from cache${suffix}${timestamp}`;
}
subscribe(paintTelemetry);

const loadingHtml = `
  <div class="skeleton">
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>
  </div>`;

function notFoundHtml() {
  return `
    <div class="empty">
      <h1>Page not found</h1>
      <p>That page does not exist on this board.</p>
      <a class="btn-ghost" href="#/">Back to the board</a>
    </div>`;
}

function errorHtml(message) {
  return `
    <div class="error-box">
      <h1>Something went wrong</h1>
      <p>${fmt.esc(message)}</p>
      <button type="button" class="btn-primary" data-retry>Try again</button>
    </div>`;
}

async function render() {
  beginView();
  window.__shotReady = false;
  const hash = location.hash || '#/';

  app.innerHTML = loadingHtml;

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
    }

    document.documentElement.scrollTop = 0;
  } catch (e) {
    document.title = 'Something went wrong';
    app.innerHTML = errorHtml(e && e.message ? e.message : 'An unexpected error occurred.');
    const retry = app.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', render);
  } finally {
    window.__shotReady = true;
  }
}

window.addEventListener('hashchange', render);
render();
