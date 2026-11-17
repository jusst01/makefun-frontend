// The full design loads after first paint; index.html inlines the critical CSS.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'style.css';
document.head.append(link);

const app = document.getElementById('app');
const net = document.getElementById('net');

const paint = ({ requests: r, reused: c, unchanged: u, at }) => {
  if (net) net.textContent = `this view: ${r} API request${r === 1 ? '' : 's'} · ${c} from cache${u ? ` · ${u} unchanged (ETag)` : ''}${at ? ` · as of ${at} UTC` : ''}`;
};

// Each view still arrives by import(), only once the router picks the route.
const VIEWS = {
  board: ['./views/board.js', 'renderBoard'],
  bounty: ['./views/bounty.js', 'renderBounty'],
  leaderboard: ['./views/leaderboard.js', 'renderLeaderboard'],
  profile: ['./views/profile.js', 'renderProfile'],
};

const notice = (title, body, action) => {
  const box = document.createElement('div');
  box.className = title === 'Page not found' ? 'empty' : 'error-box';
  const h = document.createElement('h1');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  box.append(h, p);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-primary';
    b.textContent = action;
    b.onclick = render;
    box.append(b);
  }
  app.replaceChildren(box);
};

let wired = false;

async function render() {
  const api = await import('./api.js');
  if (!wired) { wired = true; api.subscribe(paint); }
  api.beginView();
  window.__shotReady = false;
  const hash = location.hash || '#/';
  const parts = hash.split('/');
  const slug = parts[2];
  const name = hash === '#/' ? 'board'
    : hash.startsWith('#/bounty/') ? (parts[3] === 'leaderboard' ? 'leaderboard' : 'bounty')
    : hash.startsWith('#/u/') ? 'profile' : '';

  try {
    if (!VIEWS[name] || (name !== 'board' && !slug)) {
      document.title = 'Not found';
      notice('Page not found', 'That page does not exist on this board.');
    } else {
      const [src, fn] = VIEWS[name];
      document.title = name === 'board' ? 'Board · make.fun bounties'
        : name === 'profile' ? `@${slug}`
        : name === 'leaderboard' ? `Leaderboard · ${slug}` : slug;
      const mod = await import(src);
      await mod[fn](app, slug);
      document.documentElement.scrollTop = 0;
    }
  } catch (e) {
    document.title = 'Something went wrong';
    notice('Something went wrong', e && e.message || 'An unexpected error occurred.', 'Try again');
  } finally {
    window.__shotReady = true;
  }
}

addEventListener('hashchange', render);
render();
