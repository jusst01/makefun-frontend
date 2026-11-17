const sheet = document.createElement('link');
sheet.rel = 'stylesheet';
sheet.href = 'style.css';
document.head.appendChild(sheet);

const app = document.getElementById('app');
const net = document.getElementById('net');

// Reads the live counters: repainted on every change, empty until a request.
const paint = (c) => {
  if (net) net.textContent = `this view: ${c.requests} API ${c.requests === 1 ? 'request' : 'requests'} · ${c.reused} from cache${c.unchanged ? ` · ${c.unchanged} unchanged (ETag)` : ''}${c.at ? ` · as of ${c.at} UTC` : ''}`;
};

let api = null;

const skel = '<div class="skeleton" style="height:210px"></div>';
const errorBox = '<div class="error-box"><h2>Something went wrong</h2><p></p><button type="button" id="retry">Try again</button></div>';
const notFound = '<div class="empty"><h2>Page not found</h2><p>That page does not exist.</p><a href="#/">Back to the board</a></div>';

async function render() {
  window.__shotReady = false;
  const hash = location.hash || '#/';
  if (!api) {
    api = await import('./api.js');
    api.subscribe(paint);
  }
  api.beginView();
  app.innerHTML = skel;

  const [, , slug, sub] = hash.split('/');

  try {
    if (hash === '#/') {
      document.title = 'Board · make.fun bounties';
      await (await import('./views/board.js')).renderBoard(app);
    } else if (slug && hash.startsWith('#/bounty/')) {
      if (sub === 'leaderboard') {
        document.title = `Leaderboard · ${slug}`;
        await (await import('./views/leaderboard.js')).renderLeaderboard(app, slug);
      } else {
        document.title = slug;
        await (await import('./views/bounty.js')).renderBounty(app, slug);
      }
    } else if (slug && hash.startsWith('#/u/')) {
      document.title = `@${slug}`;
      await (await import('./views/profile.js')).renderProfile(app, slug);
    } else {
      document.title = 'Not found';
      app.innerHTML = notFound;
    }
    document.documentElement.scrollTop = 0;
  } catch (e) {
    app.innerHTML = errorBox;
    app.querySelector('.error-box p').textContent = e && e.message ? e.message : 'Unknown error';
    app.querySelector('#retry').addEventListener('click', render);
  } finally {
    window.__shotReady = true;
  }
}

window.addEventListener('hashchange', render);
render();
