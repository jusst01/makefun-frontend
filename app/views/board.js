import { getBounties } from '../api.js';
import * as fmt from '../format.js';

const HOUR = 60 * 60 * 1000;
const SOON_MS = 48 * HOUR;

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

const cardHtml = (bounty) => {
  const open = isOpen(bounty);
  const cat = categoryOf(bounty);
  const entries = toNumber(bounty.submissionCount);
  const countdown = fmt.countdown(bounty.deadline);

  const time = open
    ? `<span class="time-left ${fmt.esc(countdown.level)}">${fmt.esc(countdown.label)}</span>`
    : '<span class="tag">Ended</span>';

  return `
    <div class="bounty-card">
      <h3><a href="#/bounty/${fmt.esc(bounty.slug)}">${fmt.esc(bounty.title)}</a></h3>
      <div><span class="tag">${fmt.esc(cat)}</span></div>
      <div class="pot">${fmt.money(toNumber(bounty.potUsd))}</div>
      <div class="meta-row">
        <span>Entry fee: ${entryFee(bounty)}</span>
        ${time}
        <span>${entries.toLocaleString()} ${fmt.plural(entries, 'entry', 'entries')}</span>
      </div>
    </div>`;
};

const chipHtml = (attribute, value, label, pressed) =>
  `<button type="button" class="chip" ${attribute}="${fmt.esc(value)}" aria-pressed="${pressed ? 'true' : 'false'}">${fmt.esc(label)}</button>`;

export async function renderBoard(container) {
  container.innerHTML = skeletonHtml();

  let data;
  try {
    data = await getBounties();
  } catch (e) {
    container.innerHTML = `<div class="error-box"><strong>Could not load bounties.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  const bounties = Array.isArray(data && data.items) ? data.items : [];

  const open = bounties.filter(isOpen);
  const closingSoon = open.filter(isClosingSoon);
  const livePot = open.reduce((sum, bounty) => sum + toNumber(bounty.potUsd), 0);
  const liveEntries = open.reduce((sum, bounty) => sum + toNumber(bounty.submissionCount), 0);
  const categories = [...new Set(bounties.map(categoryOf))].sort((a, b) => a.localeCompare(b));

  const state = { status: 'all', category: 'all' };

  container.innerHTML = `
    <h1>Bounty board</h1>
    <div class="stats-strip">
      <div class="stat"><b>${open.length}</b><span>Open now</span></div>
      <div class="stat"><b class="accent">${fmt.money(livePot)}</b><span>Total live pot</span></div>
      <div class="stat"><b>${liveEntries.toLocaleString()}</b><span>Entries so far</span></div>
      <div class="stat"><b>${closingSoon.length}</b><span>Closing in 48h</span></div>
    </div>

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

    <div class="chip-row" id="category-chips" role="group" aria-label="Filter by category">
      ${chipHtml('data-category', 'all', 'All', true)}
      ${categories.map((cat) => chipHtml('data-category', cat, cat, false)).join('')}
    </div>

    <div class="card-grid" id="board-grid"></div>
  `;

  const grid = container.querySelector('#board-grid');
  const searchInput = container.querySelector('#board-search');
  const sortSelect = container.querySelector('#board-sort');

  const syncChips = () => {
    container.querySelectorAll('#status-chips .chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.status === state.status ? 'true' : 'false');
    });
    container.querySelectorAll('#category-chips .chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.category === state.category ? 'true' : 'false');
    });
  };

  const renderGrid = () => {
    if (!bounties.length) {
      grid.innerHTML = '<div class="empty">The board has no bounties right now.</div>';
      return;
    }

    const query = searchInput.value.trim().toLowerCase();

    const rows = bounties.filter((bounty) => {
      const cat = categoryOf(bounty);
      if (query && !String(bounty.title || '').toLowerCase().includes(query) && !cat.toLowerCase().includes(query)) {
        return false;
      }
      if (state.category !== 'all' && cat !== state.category) return false;
      if (state.status === 'open' && !isOpen(bounty)) return false;
      if (state.status === 'soon' && !isClosingSoon(bounty)) return false;
      if (state.status === 'closed' && isOpen(bounty)) return false;
      return true;
    });

    if (sortSelect.value === 'pot') {
      rows.sort((a, b) => toNumber(b.potUsd) - toNumber(a.potUsd));
    } else if (sortSelect.value === 'entries') {
      rows.sort((a, b) => toNumber(b.submissionCount) - toNumber(a.submissionCount));
    } else {
      rows.sort((a, b) => {
        const aOpen = isOpen(a) ? 0 : 1;
        const bOpen = isOpen(b) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const at = deadlineTime(a);
        const bt = deadlineTime(b);
        return (Number.isFinite(at) ? at : Infinity) - (Number.isFinite(bt) ? bt : Infinity);
      });
    }

    if (!rows.length) {
      grid.innerHTML = `
        <div class="empty">
          <p>No bounties match your filters.</p>
          <button type="button" class="btn btn-ghost" id="clear-filters">Clear filters</button>
        </div>`;
      return;
    }

    grid.innerHTML = rows.map(cardHtml).join('');
  };

  container.querySelector('#status-chips').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-status]');
    if (!btn) return;
    state.status = btn.dataset.status;
    syncChips();
    renderGrid();
  });

  container.querySelector('#category-chips').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-category]');
    if (!btn) return;
    state.category = btn.dataset.category;
    syncChips();
    renderGrid();
  });

  searchInput.addEventListener('input', renderGrid);
  sortSelect.addEventListener('change', renderGrid);

  grid.addEventListener('click', (event) => {
    if (!event.target.closest('#clear-filters')) return;
    searchInput.value = '';
    state.status = 'all';
    state.category = 'all';
    syncChips();
    renderGrid();
  });

  renderGrid();
}
