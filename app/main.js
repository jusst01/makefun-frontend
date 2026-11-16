import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import * as fmt from './format.js';

const app = document.getElementById('app');

async function render() {
  window.__shotReady = false;
  const hash = location.hash || '#/';

  app.innerHTML = '<div class="loading">Loading...</div>';

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
