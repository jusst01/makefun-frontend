import { getBounties } from '../api.js';
import * as fmt from '../format.js';

const HOUR = 1000 * 60 * 60;

// A bounty is "live" when it carries a deadline that is still in the future.
function isOpen(bounty) {
  const at = bounty && bounty.deadline ? new Date(bounty.deadline).getTime() : NaN;
  return Number.isFinite(at) ? at > Date.now() : false;
}

function hoursLeft(bounty) {
  const at = bounty && bounty.deadline ? new Date(bounty.deadline).getTime() : NaN;
  return Number.isFinite(at) ? (at - Date.now()) / HOUR : Infinity;
}

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const categoryOf = (bounty) => (bounty && bounty.category) || 'General';

// The loading state: a stats strip of four blocks and six cards, so the page
// shows its shape before any data lands.
function skeletonHtml() {
  const stats = Array.from({ length: 4 }, () => '<div class="stat skeleton"></div>').join('');
  const cards = Array.from(
    { length: 6 },
    () => `
        <div class="skel-card">
          <div class="skel-line"></div>
          <div class="skel-line"></div>
          <div class="skel-line"></div>
        </div>`,
  ).join('');
  return `<div class="stats-strip">${stats}</div><div class="card-grid">${cards}</div>`;
}

function statsHtml(bounties) {
  const open = bounties.filter(isOpen);
  const livePot = open.reduce((sum, b) => sum + num(b.potUsd), 0);
  const entries = open.reduce((sum, b) => sum + num(b.submissionCount), 0);
  const closing = open.filter((b) => hoursLeft(b) < 48).length;

  return `
    <div class="stats-strip">
      <div class="stat"><b>${open.length}</b><span>Open now</span></div>
      <div class="stat"><b>${fmt.money(livePot)}</b><span>Total live pot</span></div>
      <div class="stat"><b>${entries}</b><span>Entries so far</span></div>
      <div class="stat"><b>${closing}</b><span>Closing in 48h</span></div>
    </div>`;
}

function chipRow(name, label, chips) {
  const buttons = chips
    .map(
      (chip, index) => `<button type="button" class="chip" data-value="${fmt.esc(chip.value)}" aria-pressed="${index === 0}">${fmt.esc(chip.label)}</button>`,
    )
    .join('');
  return `<div class="chip-row" data-filter="${name}" role="group" aria-label="${fmt.esc(label)}">${buttons}</div>`;
}

const STATUS_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'soon', label: 'Closing soon' },
  { value: 'closed', label: 'Closed' },
];

function cardHtml(bounty) {
  const closed = !isOpen(bounty);
  const clock = fmt.countdown(bounty && bounty.deadline);
  const entries = num(bounty && bounty.submissionCount);
  const fee = bounty && bounty.entryFeeUsd ? fmt.money(bounty.entryFeeUsd) : 'Free';

  return `
      <article class="bounty-card">
        <div class="meta-row">
          <span class="tag">${fmt.esc(categoryOf(bounty))}</span>
          ${closed ? '<span class="tag">Ended</span>' : ''}
        </div>
        <h3><a href="#/bounty/${fmt.esc(bounty && bounty.slug)}">${fmt.esc(bounty && bounty.title) || 'Untitled bounty'}</a></h3>
        <strong class="pot">${fmt.money(num(bounty && bounty.potUsd))}</strong>
        <div class="meta-row">
          <span>Fee: ${fee}</span>
          <span class="time-left ${closed ? 'ended' : clock.level}">${closed ? 'Ended' : fmt.esc(clock.label)}</span>
          <span>${entries} ${fmt.plural(entries, 'entry', 'entries')}</span>
        </div>
      </article>`;
}

export async function renderBoard(container) {
  container.innerHTML = skeletonHtml();

  const data = await getBounties();
  const bounties = Array.isArray(data) ? data : Array.isArray(data && data.items) ? data.items : [];

  const categories = [...new Set(bounties.map(categoryOf))].sort((a, b) => a.localeCompare(b));
  const categoryChips = [
    { value: 'all', label: 'All' },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  container.innerHTML = `
    <h1>Bounty board</h1>
    ${statsHtml(bounties)}
    <div class="toolbar">
      <input class="search-input" type="search" placeholder="Search title or category" aria-label="Search bounties">
      <select class="select" aria-label="Sort bounties">
        <option value="deadline">Ending soon</option>
        <option value="pot">Biggest pot</option>
        <option value="entries">Most entries</option>
      </select>
    </div>
    ${chipRow('status', 'Filter by status', STATUS_CHIPS)}
    ${chipRow('category', 'Filter by category', categoryChips)}
    <div class="card-grid" id="bounty-grid"></div>`;

  const grid = container.querySelector('#bounty-grid');
  const search = container.querySelector('.search-input');
  const sort = container.querySelector('.select');
  const statusRow = container.querySelector('[data-filter="status"]');
  const categoryRow = container.querySelector('[data-filter="category"]');

  let status = 'all';
  let category = 'all';

  function press(row, value) {
    row.querySelectorAll('button.chip').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.value === value));
    });
  }

  function matches(bounty) {
    const query = search.value.trim().toLowerCase();
    const text = `${(bounty && bounty.title) || ''} ${categoryOf(bounty)}`.toLowerCase();
    if (query && !text.includes(query)) return false;
    if (category !== 'all' && categoryOf(bounty) !== category) return false;

    const open = isOpen(bounty);
    if (status === 'open' && !open) return false;
    if (status === 'soon' && !(open && hoursLeft(bounty) < 48)) return false;
    if (status === 'closed' && open) return false;
    return true;
  }

  function order(rows) {
    const key = sort.value;
    if (key === 'pot') return rows.sort((a, b) => num(b.potUsd) - num(a.potUsd));
    if (key === 'entries') return rows.sort((a, b) => num(b.submissionCount) - num(a.submissionCount));
    // Live bounties first, soonest deadline first; ended ones fall to the end.
    return rows.sort((a, b) => (isOpen(a) === isOpen(b) ? hoursLeft(a) - hoursLeft(b) : isOpen(a) ? -1 : 1));
  }

  // Only the grid is repainted, never the toolbar or the strip.
  function renderGrid() {
    if (!bounties.length) {
      grid.innerHTML = '<div class="empty">The board has no bounties right now.</div>';
      return;
    }

    const rows = order(bounties.filter(matches));
    if (!rows.length) {
      grid.innerHTML = `
        <div class="empty">
          No bounties match these filters.
          <button type="button" class="btn-ghost" data-clear>Clear filters</button>
        </div>`;
      grid.querySelector('[data-clear]').addEventListener('click', clearFilters);
      return;
    }

    grid.innerHTML = rows.map(cardHtml).join('');
  }

  function clearFilters() {
    search.value = '';
    status = 'all';
    category = 'all';
    press(statusRow, status);
    press(categoryRow, category);
    renderGrid();
  }

  search.addEventListener('input', renderGrid);
  sort.addEventListener('change', renderGrid);

  statusRow.addEventListener('click', (event) => {
    const button = event.target.closest('button.chip');
    if (!button) return;
    status = button.dataset.value;
    press(statusRow, status);
    renderGrid();
  });

  categoryRow.addEventListener('click', (event) => {
    const button = event.target.closest('button.chip');
    if (!button) return;
    category = button.dataset.value;
    press(categoryRow, category);
    renderGrid();
  });

  renderGrid();
}
