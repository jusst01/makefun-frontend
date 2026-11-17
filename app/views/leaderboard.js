import { getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

const PAGE_SIZE = 50;

const skeletonHtml = () => `
  <div class="skel-line" style="width:46%;height:30px;margin-bottom:14px"></div>
  <div class="skel-line" style="width:22%;margin-bottom:24px"></div>
  <div class="toolbar">
    <div class="skeleton" style="width:100%;max-width:380px;height:40px;border-radius:8px"></div>
  </div>
  <div class="tablewrap">
    <div class="skeleton" style="padding:16px">
      ${Array.from({ length: 8 }, (_, i) => `<div class="skel-line" style="width:${94 - i * 6}%;margin-bottom:12px"></div>`).join('')}
    </div>
  </div>
`;

const medalClass = (rank) => {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
};

const rankCell = (rank) => {
  if (!Number.isFinite(rank) || rank <= 0) return '<span class="muted">-</span>';
  if (rank <= 3) return `<span class="rank-medal ${medalClass(rank)}">${rank}</span>`;
  return `<span class="muted">${rank}</span>`;
};

const sizeCell = (values) => {
  const bytes = values ? Number(values.bytes) : NaN;
  if (!Number.isFinite(bytes) || bytes <= 0) return '<span class="muted">-</span>';
  return `<span style="white-space:nowrap">${(bytes / 1024).toFixed(1)} KB</span>`;
};

export async function renderLeaderboard(container, slug) {
  container.innerHTML = skeletonHtml();

  let lb;
  try {
    lb = await getLeaderboard(slug);
  } catch (e) {
    container.innerHTML = `<div class="error-box"><strong>Could not load this leaderboard.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  if (!lb || typeof lb !== 'object') {
    container.innerHTML = '<div class="empty">This leaderboard does not exist.</div>';
    return;
  }

  const entries = Array.isArray(lb.entries) ? lb.entries : [];
  const withheld = Boolean(lb.metrics_withheld);
  const title = (lb.competition && lb.competition.title) || slug;
  const phaseTitle = lb.phase && lb.phase.title ? lb.phase.title : 'Unknown phase';

  const state = { page: 1, query: '' };

  container.innerHTML = `
    <h1>${fmt.esc(title)}</h1>
    <p class="muted">Leaderboard · Phase: ${fmt.esc(phaseTitle)}</p>

    <div class="toolbar">
      <input id="lb-search" class="search-input" type="search" placeholder="Search handle or entry title" aria-label="Search leaderboard entries">
    </div>

    ${withheld ? '<div class="empty" style="margin:0 0 16px;padding:16px">Scores are withheld for this phase. Ranks and entries are shown, judge metrics stay hidden until the phase is finalized.</div>' : ''}

    <div id="lb-table"></div>
    <div id="lb-pager"></div>
  `;

  const tableRegion = container.querySelector('#lb-table');
  const pagerRegion = container.querySelector('#lb-pager');
  const searchInput = container.querySelector('#lb-search');

  const filtered = () => {
    const query = state.query.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const handle = String(entry.handle || '').toLowerCase();
      const entryTitle = String(entry.title || '').toLowerCase();
      return handle.includes(query) || entryTitle.includes(query);
    });
  };

  const renderTable = () => {
    const rows = filtered();

    if (!rows.length) {
      tableRegion.innerHTML = entries.length
        ? `<div class="empty">No entries match that search.</div>`
        : `<div class="empty">No entries yet for this competition.</div>`;
      pagerRegion.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    const body = pageRows.map((entry) => {
      const rank = Number(entry.rank);
      const judge = entry.values ? Number(entry.values.judge) : NaN;
      const low = entry.values ? Number(entry.values.judge_low) : NaN;
      const high = entry.values ? Number(entry.values.judge_high) : NaN;
      const hasInterval = Number.isFinite(low) && Number.isFinite(high);
      const valid = entry.valid === undefined || entry.valid === null
        ? '-'
        : (entry.valid ? 'Yes' : 'No');

      const handle = entry.handle ? fmt.esc(entry.handle) : '';
      const entrant = handle
        ? `<a href="#/u/${handle}">${handle}</a>`
        : '<span class="muted">-</span>';

      return `
        <tr>
          <td>${rankCell(rank)}</td>
          <td>${entrant}</td>
          <td>${entry.title ? fmt.esc(entry.title) : '<span class="muted">Untitled</span>'}</td>
          <td class="num">${!withheld && Number.isFinite(judge) ? fmt.rate(judge) : '<span class="muted">-</span>'}</td>
          <td class="num">${!withheld && hasInterval ? `${fmt.rate(low)} - ${fmt.rate(high)}` : '<span class="muted">-</span>'}</td>
          <td>${withheld ? '<span class="muted">-</span>' : valid}</td>
          <td class="num">${sizeCell(entry.values)}</td>
        </tr>`;
    }).join('');

    tableRegion.innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entrant</th>
              <th>Entry</th>
              <th class="num">Judge</th>
              <th class="num">Interval</th>
              <th>Valid</th>
              <th class="num">Size</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;

    pagerRegion.innerHTML = totalPages > 1
      ? `<div class="pager">
          <button type="button" id="lb-prev" ${state.page === 1 ? 'disabled' : ''}>Prev</button>
          <span>Page ${state.page} of ${totalPages}</span>
          <button type="button" id="lb-next" ${state.page >= totalPages ? 'disabled' : ''}>Next</button>
        </div>`
      : '';

    const prev = pagerRegion.querySelector('#lb-prev');
    const next = pagerRegion.querySelector('#lb-next');
    if (prev) {
      prev.addEventListener('click', () => {
        if (state.page > 1) {
          state.page--;
          renderTable();
        }
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        if (state.page < totalPages) {
          state.page++;
          renderTable();
        }
      });
    }
  };

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.page = 1;
    renderTable();
  });

  renderTable();
}
