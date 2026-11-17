import { getBounty, getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const has = (value) => value !== null && value !== undefined && value !== '';

// A row with no figure for a column gets a middle dot. The tables stay aligned
// without a dash standing in for a number the API does not publish.
const DOT = '<span class="muted">·</span>';

// Win rates and their interval bounds arrive in ten-thousandths of a percent:
// 956066 reads 95.61%.
const winPct = (micro) => `${(num(micro) / 10000).toFixed(2)}%`;

const MEDALS = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const PAGE_SIZE = 50;
const ORIGIN = 'https://make.fun';

// Avatars come back either absolute (a GitHub avatar) or as a path on the API
// host; only the relative form needs the origin put in front of it.
const absolute = (url) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const usd = (value) => fmt.money(typeof value === 'string' ? value : num(value).toFixed(2));

function medal(rank) {
  const n = Number(rank);
  const tone = MEDALS[n];
  return tone
    ? `<span class="rank-medal ${tone}">${n}</span>`
    : `<span class="tabular-nums">${fmt.esc(rank)}</span>`;
}

// Rows past the first ten come back as light records without an avatar, so the
// tile falls back to the handle's initial: that letter is the handle itself,
// not an invented picture.
function avatarHtml(image, handle, size) {
  const letter = fmt.esc(String(handle || '?').slice(0, 1).toUpperCase());
  const frame = `position:relative;display:inline-block;flex:0 0 auto;width:${size}px;height:${size}px;`;
  const initial = `<span class="avatar" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.max(11, Math.round(size * 0.32))}px;">${letter}</span>`;
  const picture = has(image)
    ? `<img class="avatar" src="${fmt.esc(absolute(image))}" alt="" loading="lazy" crossorigin="anonymous" style="position:absolute;inset:0;width:100%;height:100%;">`
    : '';
  return `<span style="${frame}">${initial}${picture}</span>`;
}

function skeletonHtml() {
  return `<div class="skeleton">${Array.from({ length: 7 }, () => '<div class="skel-line"></div>').join('')}</div>`;
}

// The API ships the payout schedule twice: `rewards` is the base place-to-amount
// map, and `rewardsNow` is the same schedule recomputed at the live pot, with
// the fees collected so far split over the places in proportion to their base
// reward. This is the bounty view's reading of those two fields, kept in step
// with it so a figure in the prize column is the figure the bounty page shows.
function prizeRows(bounty) {
  if (Array.isArray(bounty.rewardsNow) && bounty.rewardsNow.length) {
    const rows = bounty.rewardsNow
      .filter((row) => row && has(row.place))
      .sort((a, b) => Number(a.place) - Number(b.place))
      .map((row) => ({ place: row.place, amount: row.amountUsd }));
    if (rows.length) return rows;
  }

  if (bounty.rewards && typeof bounty.rewards === 'object') {
    return Object.entries(bounty.rewards)
      .filter(([place, amount]) => place !== '' && has(amount))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([place, amount]) => ({ place, amount }));
  }

  return [];
}

const prizeMap = (rows) => new Map(rows.map((row) => [Number(row.place), row.amount]));

// `entries` are the full records; `rest` are the lighter rows behind them, each
// carrying its own rank, score and interval. Both become one shape here, so the
// table, the search and the pager walk the whole ranked field rather than the
// first ten.
function collectRows(lb) {
  const entries = Array.isArray(lb && lb.entries) ? lb.entries : [];
  const rest = Array.isArray(lb && lb.rest) ? lb.rest : [];
  const key = lb && lb.rank_key;

  const full = (raw) => {
    const values = (raw && raw.values) || {};
    const value = has(values[key]) ? values[key] : values.judge;
    const display = raw && raw.display && has(raw.display[key])
      ? raw.display[key]
      : has(value) ? String(value) : '';
    return {
      rank: num(raw && raw.rank),
      ranked: has(raw && raw.rank) && num(raw.rank) > 0,
      prizeRank: raw && raw.prize_rank,
      handle: (raw && raw.handle) || '',
      title: (raw && raw.title) || '',
      image: (raw && raw.image) || '',
      value,
      display,
      interval: raw && raw.interval,
      judge: (raw && raw.judge) || null,
    };
  };

  const light = (raw) => ({
    rank: num(raw && raw.rank),
    ranked: has(raw && raw.rank) && num(raw.rank) > 0,
    prizeRank: raw && raw.prize_rank,
    handle: (raw && raw.handle) || '',
    title: (raw && raw.title) || '',
    image: '',
    value: raw && raw.value,
    display: raw && has(raw.display) ? String(raw.display) : '',
    interval: raw && raw.interval,
    judge: null,
  });

  const all = [...entries.map(full), ...rest.map(light)];
  return { all, entries, rest };
}

function intervalText(interval) {
  if (!interval || !has(interval.low) || !has(interval.high)) return DOT;
  return `${winPct(interval.low)} to ${winPct(interval.high)}`;
}

// The band's level names the interval the API published ("0.900000000" = 90%).
function intervalLabel(rows) {
  const found = rows.find((row) => row.interval && has(row.interval.level));
  return found ? `${(num(found.interval.level) * 100).toFixed(0)}%` : '90%';
}

const titleCell = (title) =>
  `<span title="${fmt.esc(title)}" style="display:inline-block;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;">${fmt.esc(title)}</span>`;

function tableHtml(rows, ctx) {
  const head = ['<th>Rank</th>', '<th>Entrant</th>', '<th>Entry</th>'];
  head.push(`<th class="num">${fmt.esc(ctx.scoreTitle)}</th>`);
  if (ctx.showInterval) head.push(`<th class="num">${fmt.esc(ctx.intervalLabel)} interval</th>`);
  if (ctx.showRecord) head.push('<th class="num">W-D-L</th>');
  if (ctx.prizes) head.push('<th class="num">Prize now</th>');

  const body = rows
    .map((row) => {
      const cells = [];
      cells.push(`<td>${medal(row.rank)}</td>`);

      const entrant = row.handle
        ? `<a href="#/u/${fmt.esc(row.handle)}">${fmt.esc(row.handle)}</a>`
        : DOT;
      cells.push(`<td><span style="display:inline-flex;align-items:center;gap:8px;">${avatarHtml(row.image, row.handle, 28)}${entrant}</span></td>`);

      cells.push(`<td>${titleCell(row.title)}</td>`);

      const score = ctx.judgeMode
        ? (has(row.value) ? winPct(row.value) : DOT)
        : (has(row.display) ? fmt.esc(row.display) : DOT);
      cells.push(`<td class="num">${score}</td>`);

      // A band and a record are two short figures that read as one line; letting
      // them wrap doubles the row height for no gain.
      if (ctx.showInterval) cells.push(`<td class="num" style="white-space: nowrap;">${intervalText(row.interval)}</td>`);

      if (ctx.showRecord) {
        const judge = row.judge;
        const record = judge && has(judge.wins)
          ? `${num(judge.wins)}-${num(judge.draws)}-${num(judge.losses)}`
          : DOT;
        cells.push(`<td class="num" style="white-space: nowrap;">${record}</td>`);
      }

      if (ctx.prizes) {
        const prize = has(row.prizeRank) && ctx.prizes.has(num(row.prizeRank))
          ? usd(ctx.prizes.get(num(row.prizeRank)))
          : DOT;
        cells.push(`<td class="num" style="white-space: nowrap;">${prize}</td>`);
      }

      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  return `<div class="tablewrap"><table><thead><tr>${head.join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function leaderHtml(row, ctx) {
  if (!row) return '';
  const score = ctx.judgeMode
    ? (has(row.value) ? winPct(row.value) : DOT)
    : (has(row.display) ? fmt.esc(row.display) : DOT);
  const scoreLabel = ctx.judgeMode ? 'win rate' : fmt.esc(ctx.scoreTitle).toLowerCase();
  const band = ctx.showInterval
    ? ` <span class="muted">${fmt.esc(ctx.intervalLabel)} interval ${intervalText(row.interval)}</span>`
    : '';

  return `
    <div class="profile-head">
      ${avatarHtml(row.image, row.handle, 72)}
      <div style="flex: 1 1 220px; min-width: 0;">
        <p class="muted" style="margin: 0 0 4px;">Leading entry</p>
        <h2 style="margin: 0 0 4px;">${row.handle ? `<a href="#/u/${fmt.esc(row.handle)}">${fmt.esc(row.handle)}</a>` : fmt.esc(row.handle)}</h2>
        <p class="muted" style="margin: 0 0 6px;">${fmt.esc(row.title)}</p>
        <p style="margin: 0;"><strong style="font-size: 20px; font-variant-numeric: tabular-nums;">${score}</strong> <span class="muted">${scoreLabel}</span>${band}</p>
      </div>
      <span style="margin-left: auto;">${medal(1)}</span>
    </div>`;
}

export async function renderLeaderboard(container, slug) {
  container.innerHTML = skeletonHtml();

  // The payout schedule is a bonus: if the bounty payload fails, the standings
  // still render and the prize column is left out rather than filled from a
  // guess.
  const [lb, bounty] = await Promise.all([
    getLeaderboard(slug),
    getBounty(slug).catch(() => null),
  ]);

  const { all, entries, rest } = collectRows(lb);
  const ranked = all
    .filter((row) => row.ranked)
    .sort((a, b) => a.rank - b.rank);

  const judgeMode = Boolean(lb && lb.rank_key === 'judge') || ranked.some((row) => row.judge && has(row.judge.wins));
  const rankColumn = Array.isArray(lb && lb.columns)
    ? lb.columns.find((column) => column && column.key === (lb && lb.rank_key))
    : null;

  const prizes = bounty ? prizeMap(prizeRows(bounty)) : null;

  const ctx = {
    judgeMode,
    scoreTitle: judgeMode
      ? 'Win rate'
      : (rankColumn && rankColumn.title) || (lb && lb.rank_key) || 'Score',
    intervalLabel: intervalLabel(ranked),
    showInterval: ranked.some((row) => row.interval && has(row.interval.low) && has(row.interval.high)),
    showRecord: ranked.some((row) => row.judge && has(row.judge.wins)),
    prizes: prizes && prizes.size ? prizes : null,
  };

  const competition = (lb && lb.competition) || {};
  const phase = (lb && lb.phase) || {};
  const unranked = all.length - ranked.length;
  const entered = entries.length + rest.length;
  // The header describes the same field the table draws from: every merged row
  // that carries a win-rate value, not just the full records in `entries`.
  const rankedCount = all.filter((row) => has(row.value)).length;

  container.innerHTML = `
    <h1>${fmt.esc(competition.title || slug)} leaderboard</h1>
    <p class="muted">
      ${phase.title ? `Phase: ${fmt.esc(phase.title)}` : ''}
      ${phase.scores ? ` <span class="muted">·</span> Scores ${fmt.esc(phase.scores)}` : ''}
      <span class="muted">·</span> <a href="#/bounty/${fmt.esc(slug)}">Back to the bounty</a>
    </p>
    ${leaderHtml(ranked[0], ctx)}
    <p class="muted">
      ${rankedCount} ranked of ${entered} entered
      ${unranked > 0 ? ` <span class="muted">·</span> ${unranked} awaiting a rank` : ''}
    </p>
    <div class="toolbar">
      <input class="search-input" type="search" placeholder="Search handle or entry" aria-label="Search the leaderboard">
    </div>
    <p class="muted" id="leaderboard-count"></p>
    <div id="leaderboard-region"></div>`;

  const search = container.querySelector('.search-input');
  const region = container.querySelector('#leaderboard-region');
  const count = container.querySelector('#leaderboard-count');
  let page = 1;

  const matching = () => {
    const query = search.value.trim().toLowerCase();
    if (!query) return ranked;
    return ranked.filter((row) => `${row.handle} ${row.title}`.toLowerCase().includes(query));
  };

  const renderRegion = () => {
    if (!ranked.length) {
      count.textContent = '';
      region.innerHTML = `
        <div class="empty">
          <p>No ranked entries yet</p>
          <p class="muted">The leaderboard fills in as judging lands.</p>
        </div>`;
      return;
    }

    const filtered = matching();
    if (!filtered.length) {
      count.textContent = `No ranked entries match "${search.value.trim()}".`;
      region.innerHTML = '<div class="empty">No entries match that search.</div>';
      return;
    }

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > pages) page = pages;
    if (page < 1) page = 1;

    const start = (page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);
    count.textContent = `Showing ${start + 1} to ${start + rows.length} of ${filtered.length} ranked ${fmt.plural(filtered.length, 'entry', 'entries')}`;

    region.innerHTML = `
      ${tableHtml(rows, ctx)}
      ${pages > 1
        ? `<div class="pager">
            <button class="btn-ghost" type="button" data-prev ${page === 1 ? 'disabled' : ''}>Prev</button>
            <span>Page ${page} of ${pages}</span>
            <button class="btn-ghost" type="button" data-next ${page === pages ? 'disabled' : ''}>Next</button>
          </div>`
        : ''}`;

    const prev = region.querySelector('[data-prev]');
    const next = region.querySelector('[data-next]');
    if (prev) prev.addEventListener('click', () => { page -= 1; renderRegion(); });
    if (next) next.addEventListener('click', () => { page += 1; renderRegion(); });

    // A broken avatar falls back to the initial underneath it.
    region.querySelectorAll('img.avatar').forEach((img) => {
      img.addEventListener('error', () => img.remove());
    });
  };

  search.addEventListener('input', () => {
    page = 1;
    renderRegion();
  });

  // The leader tile is painted once above the region, so its avatar listens
  // here rather than in the region renderer.
  container.querySelectorAll('img.avatar').forEach((img) => {
    img.addEventListener('error', () => img.remove());
  });

  renderRegion();
}
