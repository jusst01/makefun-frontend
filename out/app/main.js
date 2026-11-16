import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import * as fmt from './format.js';

const app = document.getElementById('app');

async function render() {
  window.__shotReady = false;
  const hash = location.hash || '#/';

  app.innerHTML = '<div class="loading">Loading...</div>';

  try {
    if (hash === '#/') {
      const { renderBoard } = await import('./views/board.js');
      await renderBoard(app);
    } else if (hash.startsWith('#/bounty/')) {
      const parts = hash.split('/');
      const slug = parts[2];
      if (parts[3] === 'leaderboard') {
        const { renderLeaderboard } = await import('./views/leaderboard.js');
        await renderLeaderboard(app, slug);
      } else {
        const { renderBounty } = await import('./views/bounty.js');
        await renderBounty(app, slug);
      }
    } else if (hash.startsWith('#/u/')) {
      const handle = hash.split('/')[2];
      const { renderProfile } = await import('./views/profile.js');
      await renderProfile(app, handle);
    } else {
      app.innerHTML = '<h1>404</h1><p>Page not found</p>';
    }

    document.documentElement.scrollTop = 0;
  } catch (e) {
    app.innerHTML = `<h1>Error</h1><p>${fmt.esc(e.message)}</p>`;
  } finally {
    window.__shotReady = true;
  }
}

window.addEventListener('hashchange', render);
render();
