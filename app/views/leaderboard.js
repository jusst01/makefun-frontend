import { getLeaderboard, getBounty } from '../api.js';
import { rewardsPlan } from './bounty.js';
import * as fmt from '../format.js';

const PAGE_SIZE = 50;
// Avatars arrive as /api/... paths; the app itself is served from elsewhere.
const ORIGIN = 'https://make.fun';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const has = (value) => value !== null && value !== undefined && value !== '';

const mediaUrl = (raw) => {
  if (!has(raw)) return '';
  const src = String(raw);
  if (/^https?:\/\//i.test(src)) return src;
  return `${ORIGIN}${src.startsWith('/') ? '' : '/'}${src}`;
};

// The count is micro-units: 956066 reads as 95.61%.
const microPercent = (value) => (has(value) ? `${(Number(value) / 10000).toFixed(2)}%` : '');

// Money to the cent, like the bounty view: a fee share is rarely a whole dollar.
const usd = (amount) => {
  const n = Math.round(toNumber(amount) * 100) / 100;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dot = '<span class="muted">·</span>';

const medalClass = (rank) => {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
};

const rankCell = (rank) => {
  if (rank <= 3) return `<span class="rank-medal ${medalClass(rank)}">${rank}</span>`;
  return `<span class="muted">${rank}</span>`;
};

// Round avatar with the initial underneath, so a missing image still reads as a
// person rather than a broken icon.
const avatarHtml = (src, label, size) => {
  const initial = String(label || '?').trim().charAt(0).toUpperCase() || '?';
  const box = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;vertical-align:middle`;
  if (!src) return `<span class="avatar" aria-hidden="true" style="${box}">${fmt.esc(initial)}</span>`;
  return `
    <span class="avatar" style="${box};position:relative;overflow:hidden">
      <span aria-hidden="true">${fmt.esc(initial)}</span>
      <img src="${fmt.esc(src)}" alt="" loading="lazy" crossorigin="anonymous" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    </span>`;
};

const skeletonHtml = () => `
  <div class="skel-line" style="width:46%;height:30px;margin-bottom:14px"></div>
  <div class="skel-line" style="width:22%;margin-bottom:24px"></div>
  <div class="profile-head">
    <div class="skeleton avatar"></div>
    <div style="flex:1;min-width:0">
      <div class="skel-line" style="width:28%;height:22px;margin-bottom:10px"></div>
      <div class="skel-line" style="width:18%"></div>
    </div>
  </div>
  <div class="toolbar">
    <div class="skeleton" style="width:100%;max-width:380px;height:40px;border-radius:8px"></div>
  </div>
  <div class="tablewrap">
    <div class="skeleton" style="padding:16px">
      ${Array.from({ length: 8 }, (_, i) => `<div class="skel-line" style="width:${94 - i * 6}%;margin-bottom:12px"></div>`).join('')}
    </div>
  </div>
`;

// The ranked metric sits in values[rankKey] on the full entry objects and in
// `value` on the lighter rest rows; both are the same number.
const rawMetric = (row, key) => {
  const values = row.values && typeof row.values === 'object' ? row.values : {};
  if (has(values[key])) return values[key];
  return has(row.value) ? row.value : null;
};

const displayMetric = (row, key) => {
  const display = row.display;
  if (display && typeof display === 'object') return has(display[key]) ? String(display[key]) : null;
  if (has(display)) return String(display);
  return null;
};

// Only the judge view publishes a low/high band; rest rows carry the same pair
// as strings inside `interval`.
const rawInterval = (row) => {
  const values = row.values && typeof row.values === 'object' ? row.values : {};
  const interval = row.interval && typeof row.interval === 'object' ? row.interval : {};
  const low = has(values.judge_low) ? values.judge_low : interval.low;
  const high = has(values.judge_high) ? values.judge_high : interval.high;
  if (!has(low) || !has(high)) return null;
  const l = Number(low);
  const h = Number(high);
  return Number.isFinite(l) && Number.isFinite(h) ? { low: l, high: h } : null;
};

const leaderTile = (leader, judgeMode) => {
  const rateText = judgeMode ? microPercent(leader.metric) : (leader.displayMetric || String(leader.metric));
  const intervalText = judgeMode && leader.interval
    ? `${microPercent(leader.interval.low)} to ${microPercent(leader.interval.high)}`
    : '';
  const handle = leader.handle ? `<a href="#/u/${fmt.esc(leader.handle)}">${fmt.esc(leader.handle)}</a>` : dot;

  return `
    <div class="profile-head" style="margin:0 0 12px">
      ${avatarHtml(leader.image, leader.handle || leader.title, 64)}
      <div style="flex:1;min-width:0">
        <p class="muted" style="margin:0 0 4px">Leader</p>
        <h2 style="margin:0 0 6px">${handle}</h2>
        <div class="meta-row">
          <span class="pot" style="font-size:22px">${rateText}</span>
          ${intervalText ? `<span>90% interval ${intervalText}</span>` : ''}
        </div>
        ${leader.title ? `<p class="muted" style="margin:6px 0 0;max-width:640px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmt.esc(leader.title)}</p>` : ''}
      </div>
    </div>`;
};

export async function renderLeaderboard(container, slug) {
  container.innerHTML = skeletonHtml();

  let lb;
  let bounty = null;
  try {
    const [board, competition] = await Promise.all([
      getLeaderboard(slug),
      getBounty(slug).catch(() => null)
    ]);
    lb = board;
    bounty = competition;
  } catch (e) {
    container.innerHTML = `<div class="error-box"><strong>Could not load this leaderboard.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  if (!lb || typeof lb !== 'object') {
    container.innerHTML = '<div class="empty">This leaderboard does not exist.</div>';
    return;
  }

  const entries = Array.isArray(lb.entries) ? lb.entries : [];
  const rest = Array.isArray(lb.rest) ? lb.rest : [];
  const columns = Array.isArray(lb.columns) ? lb.columns : [];
  const rankKey = has(lb.rank_key) ? String(lb.rank_key) : 'judge';
  const rankColumn = columns.find((column) => column && column.key === rankKey) || null;
  const judgeMode = rankKey === 'judge' || entries.some((entry) => entry && entry.values && has(entry.values.judge));
  const metricTitle = rankColumn && rankColumn.title ? String(rankColumn.title) : (judgeMode ? 'Win rate' : 'Score');

  const title = (lb.competition && lb.competition.title) || lb.title || slug;
  const phaseTitle = lb.phase && lb.phase.title ? lb.phase.title : 'Unknown phase';

  // Every row the table can list, built only from fields the payload carries.
  // Rows whose metric is missing (the API reports them as "n/a") are not listed
  // at all, so a cell never has to stand in for an absent number.
  const allRows = [];
  [...entries, ...rest].forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const raw = rawMetric(row, rankKey);
    if (!has(raw)) return;
    const metric = Number(raw);
    if (!Number.isFinite(metric)) return;

    const rankValue = Number(row.rank);
    allRows.push({
      key: String(row.submission_id || `${row.handle || 'row'}-${index}`),
      rank: Number.isFinite(rankValue) && rankValue > 0 ? rankValue : index + 1,
      prizeRank: has(row.prize_rank) && Number.isFinite(Number(row.prize_rank)) ? Number(row.prize_rank) : null,
      handle: has(row.handle) ? String(row.handle) : '',
      title: has(row.title) ? String(row.title) : '',
      image: mediaUrl(row.image),
      metric,
      displayMetric: displayMetric(row, rankKey),
      interval: judgeMode ? rawInterval(row) : null,
      judge: row.judge && typeof row.judge === 'object' ? row.judge : null
    });
  });
  allRows.sort((a, b) => a.rank - b.rank);

  const entered = entries.length + rest.length;
  const rankedCount = allRows.length;

  // Prize now is the live pot for the row's prize place: base reward plus the
  // fee share in proportion to the base schedule, exactly as the bounty view
  // computes it. No rewards figures means no column at all.
  const plan = bounty ? rewardsPlan(bounty) : null;
  const prizeByPlace = new Map();
  if (plan) for (const place of plan.places) prizeByPlace.set(Number(place.place), place.prize);
  const showPrize = prizeByPlace.size > 0;

  const state = { page: 1, query: '' };

  container.innerHTML = `
    <h1>${fmt.esc(title)}</h1>
    <p class="muted">Leaderboard · Phase: ${fmt.esc(phaseTitle)}</p>

    ${allRows.length ? leaderTile(allRows[0], judgeMode) : ''}

    <p class="muted" id="lb-count">${rankedCount.toLocaleString()} ranked of ${entered.toLocaleString()} entered</p>

    <div class="toolbar">
      <input id="lb-search" class="search-input" type="search" placeholder="Search handle or entry title" aria-label="Search leaderboard entries">
    </div>

    <div id="lb-table"></div>
    <div id="lb-pager"></div>
  `;

  const tableRegion = container.querySelector('#lb-table');
  const pagerRegion = container.querySelector('#lb-pager');
  const searchInput = container.querySelector('#lb-search');

  const filtered = () => {
    const query = state.query.trim().toLowerCase();
    if (!query) return allRows;
    return allRows.filter((row) => (
      row.handle.toLowerCase().includes(query) || row.title.toLowerCase().includes(query)
    ));
  };

  const renderTable = () => {
    const rows = filtered();

    if (!rows.length) {
      tableRegion.innerHTML = allRows.length
        ? '<div class="empty">No entries match that search.</div>'
        : (entered
          ? '<div class="empty">No ranked entries yet for this competition.</div>'
          : '<div class="empty">No entries yet for this competition.</div>');
      pagerRegion.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    const body = pageRows.map((row) => {
      const handleLink = row.handle
        ? `<a href="#/u/${fmt.esc(row.handle)}">${fmt.esc(row.handle)}</a>`
        : dot;
      const entrant = `<span style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(row.image, row.handle || row.title, 28)}${handleLink}</span>`;
      const entryTitle = row.title
        ? `<span title="${fmt.esc(row.title)}" style="display:block;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmt.esc(row.title)}</span>`
        : dot;

      const metricCells = judgeMode
        ? `<td class="num">${microPercent(row.metric)}</td>
           <td class="num">${row.interval ? `${microPercent(row.interval.low)} to ${microPercent(row.interval.high)}` : dot}</td>
           <td class="num">${row.judge ? `${toNumber(row.judge.wins)}-${toNumber(row.judge.draws)}-${toNumber(row.judge.losses)}` : dot}</td>`
        : `<td class="num">${fmt.esc(row.displayMetric !== null ? row.displayMetric : String(row.metric))}</td>`;

      const prize = row.prizeRank !== null && prizeByPlace.has(row.prizeRank)
        ? usd(prizeByPlace.get(row.prizeRank))
        : dot;

      return `
        <tr>
          <td>${rankCell(row.rank)}</td>
          <td>${entrant}</td>
          <td>${entryTitle}</td>
          ${metricCells}
          ${showPrize ? `<td class="num">${prize}</td>` : ''}
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
              ${judgeMode
                ? '<th class="num">Win rate</th><th class="num">90% interval</th><th class="num">W-D-L</th>'
                : `<th class="num">${fmt.esc(metricTitle)}</th>`}
              ${showPrize ? '<th class="num">Prize now</th>' : ''}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;

    const from = start + 1;
    const to = start + pageRows.length;
    pagerRegion.innerHTML = `
      <div class="pager">
        ${totalPages > 1 ? `<button type="button" id="lb-prev" ${state.page === 1 ? 'disabled' : ''}>Prev</button>` : ''}
        <span>Showing ${from} to ${to} of ${rows.length} entries</span>
        ${totalPages > 1 ? `<button type="button" id="lb-next" ${state.page >= totalPages ? 'disabled' : ''}>Next</button>` : ''}
      </div>`;

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

    tableRegion.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    });
  };

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.page = 1;
    renderTable();
  });

  renderTable();
}
