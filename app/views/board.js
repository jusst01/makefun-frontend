import { getBounties, everySecond, onMinuteTurn, patchRows } from '../api.js';
import * as fmt from '../format.js';

const HOUR = 60 * 60 * 1000;
const SOON_MS = 48 * HOUR;
const WIDE = '(min-width: 1100px)';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const deadlineTime = (bounty) => new Date(bounty.deadline).getTime();

const isOpen = (bounty) => {
  const t = deadlineTime(bounty);
  return Number.isFinite(t) && t > Date.now();
};

const isClosingSoon = (bounty) => {
  const t = deadlineTime(bounty);
  return Number.isFinite(t) && t > Date.now() && t - Date.now() < SOON_MS;
};

const categoryOf = (bounty) => bounty.category || 'General';

const entryFee = (bounty) => {
  const raw = bounty.entryFeeUsd;
  if (raw === null || raw === undefined || raw === '' || toNumber(raw) <= 0) return 'Free';
  return fmt.money(toNumber(raw));
};

// Same window the detail page uses for its elapsed bar: opened at opensAt when
// the payload has it, otherwise publishedAt.
const startTimeOf = (bounty) => {
  const raw = bounty.opensAt || bounty.publishedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
};

const skeletonHtml = () => `
  <h1>Bounty board</h1>
  <div class="stats-strip">
    ${Array.from({ length: 4 }, () => '<div class="skeleton stat" style="min-height:76px"></div>').join('')}
  </div>
  <div class="card-grid">
    ${Array.from({ length: 6 }, () => `
      <div class="skel-card">
        <div class="skel-line" style="width:78%"></div>
        <div class="skel-line" style="width:38%"></div>
        <div class="skel-line" style="width:52%;height:24px"></div>
        <div class="skel-line" style="width:88%"></div>
      </div>`).join('')}
  </div>
`;

const chipHtml = (attribute, value, label, pressed) =>
  `<button type="button" class="chip" ${attribute}="${fmt.esc(value)}" aria-pressed="${pressed ? 'true' : 'false'}">${fmt.esc(label)}</button>`;

const setText = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};

const setAttr = (node, name, value) => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};

// One card node; its text is rewritten in place by fillCard, never re-created,
// so a patched row keeps focus, scroll and any selection state it holds.
const makeCard = () => {
  const card = document.createElement('div');
  card.className = 'bounty-card';
  card.innerHTML = `
    <h3><a href="#/"></a></h3>
    <div><span class="tag"></span></div>
    <div class="pot"></div>
    <div class="meta-row">
      <span class="fee"></span>
      <span class="time-left" data-deadline=""></span>
      <span class="count"></span>
    </div>
    <div class="elapsed-slot"></div>`;
  return card;
};

const fillCard = (card, bounty, live) => {
  const slug = String(bounty.slug || '');
  if (card.dataset.slug !== slug) card.dataset.slug = slug;
  setAttr(card, 'data-slug', slug);

  const link = card.querySelector('h3 a');
  setAttr(link, 'href', `#/bounty/${slug}`);
  setText(link, String(bounty.title || ''));

  setText(card.querySelector('.tag'), categoryOf(bounty));
  setText(card.querySelector('.pot'), fmt.money(toNumber(bounty.potUsd)));

  setText(card.querySelector('.fee'), `Entry fee: ${entryFee(bounty)}`);

  const entries = toNumber(bounty.submissionCount);
  setText(card.querySelector('.count'), `${entries.toLocaleString()} ${fmt.plural(entries, 'entry', 'entries')}`);

  const time = card.querySelector('.time-left');
  setAttr(time, 'data-deadline', bounty.deadline ? String(bounty.deadline) : '');

  const slot = card.querySelector('.elapsed-slot');
  const start = startTimeOf(bounty);
  let bar = slot.firstElementChild;

  if (start === null || !bounty.deadline) {
    // No start field on this payload: no bar at all, rather than an invented one.
    if (bar) bar.remove();
  } else {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'elapsed';
      bar.appendChild(document.createElement('i'));
      slot.appendChild(bar);
    }
    setAttr(bar, 'data-start', new Date(start).toISOString());
    setAttr(bar, 'data-deadline', String(bounty.deadline));
  }

  if (live) live(card);
};

export async function renderBoard(container, options = {}) {
  const wide = window.matchMedia(WIDE).matches;
  const requestedSlug = options && options.selectedSlug ? String(options.selectedSlug) : null;

  container.innerHTML = wide
    ? `<div class="split">
        <div class="pane-list" id="board-list"></div>
        <div class="pane-detail" id="board-detail" aria-live="polite"></div>
      </div>`
    : '<div id="board-list"></div>';

  const listRoot = container.querySelector('#board-list');
  const detailPane = container.querySelector('#board-detail');

  listRoot.innerHTML = skeletonHtml();

  let data;
  try {
    data = await getBounties();
  } catch (e) {
    listRoot.innerHTML = `<div class="error-box"><strong>Could not load bounties.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  // The detail renderer and the live-update helper live in the bounty module;
  // it is loaded on demand, the same way the router lazy-loads every view.
  let bountyView;
  try {
    bountyView = await import('./bounty.js');
  } catch (e) {
    bountyView = null;
  }
  const live = bountyView ? bountyView.updateLive : () => {};

  let bounties = Array.isArray(data && data.items) ? data.items : [];

  const state = { status: 'all', category: 'all', query: '', sort: 'deadline' };
  let selectedSlug = null;
  let lastRows = [];
  let lastSlugs = new Set(bounties.map((b) => String(b.slug)));
  let detailToken = 0;

  const categoriesOf = (items) => [...new Set(items.map(categoryOf))].sort((a, b) => a.localeCompare(b));

  const openNow = () => bounties.filter(isOpen);

  listRoot.innerHTML = `
    <h1>Bounty board</h1>
    <div class="stats-strip" id="board-stats"></div>

    <div class="toolbar">
      <input id="board-search" class="search-input" type="search" placeholder="Search title or category" aria-label="Search bounties">
      <select id="board-sort" class="select" aria-label="Sort bounties">
        <option value="deadline">Ending soon</option>
        <option value="pot">Biggest pot</option>
        <option value="entries">Most entries</option>
      </select>
    </div>

    <div class="chip-row" id="status-chips" role="group" aria-label="Filter by status">
      ${chipHtml('data-status', 'all', 'All', true)}
      ${chipHtml('data-status', 'open', 'Open', false)}
      ${chipHtml('data-status', 'soon', 'Closing soon', false)}
      ${chipHtml('data-status', 'closed', 'Closed', false)}
    </div>

    <div class="chip-row" id="category-chips" role="group" aria-label="Filter by category"></div>

    <div class="card-grid" id="board-grid"></div>
  `;

  const stats = listRoot.querySelector('#board-stats');
  const grid = listRoot.querySelector('#board-grid');
  const searchInput = listRoot.querySelector('#board-search');
  const sortSelect = listRoot.querySelector('#board-sort');
  const statusChips = listRoot.querySelector('#status-chips');
  const categoryChips = listRoot.querySelector('#category-chips');

  const paintStats = () => {
    const open = openNow();
    const closingSoon = open.filter(isClosingSoon);
    const livePot = open.reduce((sum, bounty) => sum + toNumber(bounty.potUsd), 0);
    const liveEntries = open.reduce((sum, bounty) => sum + toNumber(bounty.submissionCount), 0);

    stats.innerHTML = `
      <div class="stat"><b>${open.length}</b><span>Open now</span></div>
      <div class="stat"><b class="accent">${fmt.money(livePot)}</b><span>Total live pot</span></div>
      <div class="stat"><b>${liveEntries.toLocaleString()}</b><span>Entries so far</span></div>
      <div class="stat"><b>${closingSoon.length}</b><span>Closing in 48h</span></div>`;
  };

  const syncChips = () => {
    statusChips.querySelectorAll('.chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.status === state.status ? 'true' : 'false');
    });
    categoryChips.querySelectorAll('.chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.category === state.category ? 'true' : 'false');
    });
  };

  const paintCategories = () => {
    const cats = categoriesOf(bounties);
    categoryChips.dataset.categories = cats.join('\u0000');
    categoryChips.innerHTML = [
      chipHtml('data-category', 'all', 'All', state.category === 'all'),
      ...cats.map((cat) => chipHtml('data-category', cat, cat, state.category === cat))
    ].join('');
  };

  const matches = (bounty) => {
    const cat = categoryOf(bounty);
    const query = state.query;
    if (query && !String(bounty.title || '').toLowerCase().includes(query) && !cat.toLowerCase().includes(query)) {
      return false;
    }
    if (state.category !== 'all' && cat !== state.category) return false;
    if (state.status === 'open' && !isOpen(bounty)) return false;
    if (state.status === 'soon' && !isClosingSoon(bounty)) return false;
    if (state.status === 'closed' && isOpen(bounty)) return false;
    return true;
  };

  const sorted = (rows) => {
    const copy = rows.slice();
    if (state.sort === 'pot') {
      copy.sort((a, b) => toNumber(b.potUsd) - toNumber(a.potUsd));
    } else if (state.sort === 'entries') {
      copy.sort((a, b) => toNumber(b.submissionCount) - toNumber(a.submissionCount));
    } else {
      copy.sort((a, b) => {
        const aOpen = isOpen(a) ? 0 : 1;
        const bOpen = isOpen(b) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const at = deadlineTime(a);
        const bt = deadlineTime(b);
        return (Number.isFinite(at) ? at : Infinity) - (Number.isFinite(bt) ? bt : Infinity);
      });
    }
    return copy;
  };

  const markSelection = () => {
    grid.querySelectorAll('.bounty-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.slug === selectedSlug);
    });
  };

  const paintDetail = async () => {
    if (!detailPane) return;
    const slug = selectedSlug;
    const token = ++detailToken;
    if (!slug || !bountyView) {
      detailPane.replaceChildren();
      return;
    }

    // Paint the pane skeleton straight away: the bounty request answers quickly
    // but the leaderboard payload behind the top 10 takes longer on a cold view.
    detailPane.innerHTML = bountyView.detailSkeletonHtml();

    // Rendered off-screen first, so a slower earlier request cannot clobber the
    // pane when a newer selection has already won.
    const holder = document.createElement('div');
    await bountyView.renderBountyDetail(holder, slug);
    if (token !== detailToken) return;
    detailPane.replaceChildren(...Array.from(holder.childNodes));
    live(detailPane);
  };

  const select = (slug, { updateUrl = true } = {}) => {
    if (!slug) return Promise.resolve();
    const changed = slug !== selectedSlug;
    selectedSlug = slug;
    markSelection();
    if (updateUrl && location.hash !== `#/bounty/${slug}`) {
      // replaceState fires no hashchange, so the router leaves this view mounted.
      history.replaceState(null, '', `#/bounty/${slug}`);
    }
    if (changed || !detailPane.firstChild) return paintDetail();
    return Promise.resolve();
  };

  const renderGrid = () => {
    lastRows = sorted(bounties.filter(matches));

    if (!lastRows.length) {
      grid.innerHTML = `
        <div class="empty">
          <p>No bounties match your filters.</p>
          <button type="button" class="btn btn-ghost" id="clear-filters">Clear filters</button>
        </div>`;
      return;
    }

    patchRows(
      grid,
      lastRows,
      (bounty) => String(bounty.slug),
      () => makeCard(),
      (card, bounty) => {
        fillCard(card, bounty, live);
        card.classList.toggle('is-selected', String(bounty.slug) === selectedSlug);
      }
    );
    markSelection();
  };

  paintCategories();
  paintStats();
  renderGrid();

  if (wide && detailPane) {
    // The requested slug wins even when it is outside the current filter (a
    // filter change at minute turn must never override where the reader was).
    const target = requestedSlug
      || (lastRows[0] ? String(lastRows[0].slug) : null);
    if (target) await select(target, { updateUrl: false });
  }

  statusChips.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-status]');
    if (!btn) return;
    state.status = btn.dataset.status;
    syncChips();
    renderGrid();
  });

  categoryChips.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-category]');
    if (!btn) return;
    state.category = btn.dataset.category;
    syncChips();
    renderGrid();
  });

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderGrid();
  });

  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    renderGrid();
  });

  grid.addEventListener('click', (event) => {
    const clear = event.target.closest('#clear-filters');
    if (clear) {
      searchInput.value = '';
      state.query = '';
      state.status = 'all';
      state.category = 'all';
      syncChips();
      renderGrid();
      return;
    }

    const card = event.target.closest('.bounty-card');
    if (!card) return;

    // Wide: the card selects in place, so the link must not reach the router.
    if (detailPane) {
      event.preventDefault();
      select(card.dataset.slug);
    }
  });

  // One shared timer for every countdown and elapsed bar on the board.
  const stopTicks = everySecond(() => {
    if (!container.isConnected) {
      stopTicks();
      stopMinute();
      return;
    }
    live(container);
  });

  // Each minute turn refetches and patches the mounted list, keeping search,
  // sort, filters and the current selection exactly as the reader left them.
  const stopMinute = onMinuteTurn(async () => {
    if (!container.isConnected) {
      stopMinute();
      return;
    }

    let next;
    try {
      next = await getBounties();
    } catch (e) {
      return;
    }
    if (!container.isConnected) return;

    bounties = Array.isArray(next && next.items) ? next.items : [];
    const nextSlugs = new Set(bounties.map((b) => String(b.slug)));
    const nextCategories = categoriesOf(bounties).join('\u0000');
    const categoriesChanged = nextCategories !== categoryChips.dataset.categories;

    paintStats();
    if (categoriesChanged) {
      paintCategories();
      syncChips();
    }
    renderGrid();

    if (selectedSlug && lastSlugs.has(selectedSlug) && !nextSlugs.has(selectedSlug)) {
      // The selected bounty is gone: fall back to the first remaining one.
      const first = lastRows[0] ? String(lastRows[0].slug) : null;
      if (first) select(first);
      else {
        selectedSlug = null;
        if (detailPane) detailPane.replaceChildren();
      }
    }
    lastSlugs = nextSlugs;
  });
}
