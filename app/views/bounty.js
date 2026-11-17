import { getBounty, getLeaderboard, everySecond } from '../api.js';
import * as fmt from '../format.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WIDE = '(min-width: 1100px)';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Math.round(value * 100) / 100;

// Money in the reward columns, always to the cent: a fee share is rarely a whole
// dollar, and "$156.6" would read as a rounded-off guess rather than a figure.
const usd = (amount) => {
  const n = round2(toNumber(amount));
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const medalClass = (place) => {
  if (place === 1) return 'gold';
  if (place === 2) return 'silver';
  if (place === 3) return 'bronze';
  return '';
};

const rankCell = (place) => {
  if (place >= 1 && place <= 3) {
    return `<span class="rank-medal ${medalClass(place)}">${place}</span>`;
  }
  return `<span class="muted">${fmt.esc(place)}</span>`;
};

const entryFeeText = (bounty) => {
  const raw = bounty.entryFeeUsd;
  if (raw === null || raw === undefined || raw === '' || toNumber(raw) <= 0) return 'Free';
  return fmt.money(toNumber(raw));
};

// Start of the window an elapsed bar measures: the moment the bounty opened for
// entries. Both fields are timestamps on the competition payload.
const startTimeOf = (bounty) => {
  const raw = bounty.opensAt || bounty.publishedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
};

// Time left, to the second inside the last day, in days/hours/minutes above it.
export const countdownText = (iso) => {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return 'Ended';
  const diff = target - Date.now();
  if (diff <= 0) return 'Ended';

  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n) => String(n).padStart(2, '0');

  if (diff < DAY) return `${hours}h ${two(minutes)}m ${two(seconds)}s left`;
  return `${days}d ${hours}h ${minutes}m left`;
};

const levelOf = (iso) => {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return 'ended';
  const diff = target - Date.now();
  if (diff <= 0) return 'ended';
  if (diff < 2 * DAY) return 'urgent';
  if (diff < 7 * DAY) return 'soon';
  return 'ok';
};

// One shared timer paints every live element inside `root`: countdowns keep
// ticking to the second and elapsed bars grow with the share of the window used.
export const updateLive = (root) => {
  if (!root) return;

  root.querySelectorAll('.time-left[data-deadline]').forEach((el) => {
    const iso = el.getAttribute('data-deadline');
    const text = countdownText(iso);
    if (el.textContent !== text) el.textContent = text;
    const level = levelOf(iso);
    if (el.dataset.level !== level) {
      el.dataset.level = level;
      el.className = `time-left ${level}`;
    }
  });

  root.querySelectorAll('.elapsed[data-start][data-deadline]').forEach((bar) => {
    const start = new Date(bar.dataset.start).getTime();
    const end = new Date(bar.dataset.deadline).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const share = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
    const fill = bar.firstElementChild;
    const width = `${(share * 100).toFixed(2)}%`;
    if (fill && fill.style.width !== width) fill.style.width = width;
    const hot = share >= 0.75;
    if (bar.classList.contains('hot') !== hot) bar.classList.toggle('hot', hot);
  });
};

// Base rewards schedule, straight from the payload: place -> base dollars.
const baseSchedule = (bounty) => {
  if (bounty.rewards && typeof bounty.rewards === 'object' && !Array.isArray(bounty.rewards)) {
    const rows = Object.entries(bounty.rewards)
      .map(([place, amount]) => ({ place: toNumber(place), base: toNumber(amount) }))
      .filter((row) => row.place > 0)
      .sort((a, b) => a.place - b.place);
    if (rows.length) return rows;
  }

  if (Array.isArray(bounty.rewardsNow)) {
    const rows = bounty.rewardsNow
      .map((reward) => ({ place: toNumber(reward.place), base: toNumber(reward.baseUsd) }))
      .filter((row) => row.place > 0)
      .sort((a, b) => a.place - b.place);
    if (rows.length) return rows;
  }

  return [];
};

// Collected entry fees, the money the rules split over the places in proportion
// to their base rewards. `entryFeesUsd` is the fee figure the payload publishes.
const feesTotal = (bounty) => {
  const raw = bounty.entryFeesUsd;
  if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  const pot = Number(bounty.potUsd);
  const base = Number(bounty.rewardAmount);
  if (Number.isFinite(pot) && Number.isFinite(base)) return pot - base;
  return null;
};

// Prize per place at the live pot: base_i + fees * base_i / sum(base).
export const rewardsPlan = (bounty) => {
  const rows = baseSchedule(bounty);
  if (!rows.length) return null;

  const baseSum = rows.reduce((sum, row) => sum + row.base, 0);
  const fees = feesTotal(bounty);
  const feeKnown = fees !== null && Number.isFinite(fees) && fees >= 0 && baseSum > 0;

  const places = rows.map((row) => {
    const feeShare = feeKnown ? round2((fees * row.base) / baseSum) : null;
    return {
      place: row.place,
      base: round2(row.base),
      feeShare,
      prize: feeKnown ? round2(row.base + (fees * row.base) / baseSum) : round2(row.base)
    };
  });

  return {
    places,
    baseSum: round2(baseSum),
    fees: feeKnown ? round2(fees) : null,
    total: feeKnown ? round2(baseSum + fees) : round2(baseSum)
  };
};

// Fallback table: base schedule only, used when the fee figures are not on the
// payload. No number here is derived from anything but `rewards`.
const baseOnlyTable = (plan) => `
  <div class="rewards-note">Fee figures are not on this payload, so the table shows the base schedule only.</div>
  <div class="tablewrap">
    <table>
      <caption>Base rewards</caption>
      <thead><tr><th>Place</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${plan.places.map((row) => `
          <tr>
            <td>${rankCell(row.place)}</td>
            <td class="num">${usd(row.base)}</td>
          </tr>`).join('')}
        <tr class="total">
          <td>Total</td>
          <td class="num">${usd(plan.baseSum)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;

const liveTable = (plan, potUsd) => `
  <div class="tablewrap">
    <table>
      <caption>Live pot: ${usd(toNumber(potUsd))} (${usd(plan.baseSum)} in base rewards plus ${usd(plan.fees)} in entry fees)</caption>
      <thead>
        <tr>
          <th>Place</th>
          <th class="num">Base</th>
          <th class="num">From fees</th>
          <th class="num">Prize now</th>
        </tr>
      </thead>
      <tbody>
        ${plan.places.map((row) => `
          <tr>
            <td>${rankCell(row.place)}</td>
            <td class="num">${usd(row.base)}</td>
            <td class="num">${usd(row.feeShare)}</td>
            <td class="num">${usd(row.prize)}</td>
          </tr>`).join('')}
        <tr class="total">
          <td>Total</td>
          <td class="num">${usd(plan.baseSum)}</td>
          <td class="num">${usd(plan.fees)}</td>
          <td class="num">${usd(plan.total)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;

const rewardsHtml = (bounty) => {
  const plan = rewardsPlan(bounty);
  if (!plan) return '';
  return `<h3>Rewards</h3>${plan.fees === null ? baseOnlyTable(plan) : liveTable(plan, bounty.potUsd)}`;
};

const resolutionHtml = (bounty) => {
  const resolution = bounty.resolution;
  if (!resolution) return '';

  const summary = resolution.summary ? `<p>${fmt.esc(resolution.summary)}</p>` : '';
  const criteria = Array.isArray(resolution.criteria)
    ? resolution.criteria.map((item) => `<li>${fmt.esc(item)}</li>`).join('')
    : '';

  if (!summary && !criteria) return '';

  return `
    <h3>How it is decided</h3>
    ${summary}
    ${criteria ? `<ul class="rules-list">${criteria}</ul>` : ''}`;
};

const microPercent = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${(n / 10000).toFixed(2)}%`;
};

const dot = '<span class="muted">·</span>';

// Top 10 ranked entries, embedded under the rewards: rank, entrant, win rate,
// the 90% interval and the prize the entry's place pays at the live pot.
const topEntriesHtml = (leaderboard, slug, plan) => {
  const fullLink = `<a class="btn btn-primary" href="#/bounty/${fmt.esc(slug)}/leaderboard">View the full leaderboard</a>`;
  const all = leaderboard && Array.isArray(leaderboard.entries) ? leaderboard.entries : [];

  if (!all.length) {
    return `
      <h3>Top entries</h3>
      <p class="muted">No entries yet</p>
      <div class="pager">${fullLink}</div>`;
  }

  const prizeByPlace = new Map();
  if (plan) for (const row of plan.places) prizeByPlace.set(row.place, row.prize);

  const ranked = all
    .map((entry, index) => ({ entry, fallback: index + 1 }))
    .sort((a, b) => {
      const ar = Number(a.entry.rank);
      const br = Number(b.entry.rank);
      const av = Number.isFinite(ar) && ar > 0 ? ar : a.fallback;
      const bv = Number.isFinite(br) && br > 0 ? br : b.fallback;
      return av - bv;
    })
    .slice(0, 10);

  const rows = ranked.map(({ entry, fallback }) => {
    const rawRank = Number(entry.rank);
    const place = Number.isFinite(rawRank) && rawRank > 0 ? rawRank : fallback;
    const handle = entry.handle
      ? `<a href="#/u/${fmt.esc(entry.handle)}">${fmt.esc(entry.handle)}</a>`
      : dot;

    const values = entry.values || {};
    const winRate = microPercent(values.judge);
    const low = microPercent(values.judge_low !== undefined ? values.judge_low : (entry.interval && entry.interval.low));
    const high = microPercent(values.judge_high !== undefined ? values.judge_high : (entry.interval && entry.interval.high));
    const interval = low !== null && high !== null ? `${low} to ${high}` : null;

    const prizeRank = Number(entry.prize_rank);
    const prize = Number.isFinite(prizeRank) && prizeByPlace.has(prizeRank)
      ? usd(prizeByPlace.get(prizeRank))
      : null;

    return `
      <tr>
        <td>${rankCell(place)}</td>
        <td>${handle}</td>
        <td class="num">${winRate !== null ? winRate : dot}</td>
        <td class="num">${interval !== null ? interval : dot}</td>
        <td class="num">${prize !== null ? prize : dot}</td>
      </tr>`;
  }).join('');

  return `
    <h3>Top entries</h3>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Entrant</th>
            <th class="num">Win rate</th>
            <th class="num">90% interval</th>
            <th class="num">Prize now</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="pager">${fullLink}</div>`;
};

const skeletonHtml = () => `
  <div class="skel-line" style="width:52%;height:30px;margin-bottom:16px"></div>
  <div class="facts-grid">
    ${Array.from({ length: 4 }, () => `
      <div class="fact">
        <div class="skel-line" style="width:40%"></div>
        <div class="skel-line" style="width:70%;height:18px"></div>
      </div>`).join('')}
  </div>
  ${Array.from({ length: 5 }, (_, i) => `<div class="skel-line" style="width:${92 - i * 8}%;margin-bottom:10px"></div>`).join('')}
`;

// The board paints this in its detail pane the moment a card is clicked, so the
// swap is visible at once instead of after the leaderboard has downloaded.
export const detailSkeletonHtml = skeletonHtml;

// Detail content only: the board mounts this into its right pane, and the
// standalone route mounts the same markup under the page container.
export async function renderBountyDetail(container, slug) {
  const holder = container;
  holder.innerHTML = skeletonHtml();

  let bounty;
  try {
    bounty = await getBounty(slug);
  } catch (e) {
    holder.innerHTML = `<div class="error-box"><strong>Could not load this bounty.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  if (!bounty || typeof bounty !== 'object') {
    holder.innerHTML = '<div class="empty">This bounty does not exist.</div>';
    return;
  }

  let leaderboard = null;
  try {
    leaderboard = await getLeaderboard(slug);
  } catch (e) {
    leaderboard = null;
  }

  const pageSlug = bounty.slug || slug;
  const category = bounty.category || 'General';
  const entries = toNumber(bounty.submissionCount);
  const deadline = bounty.deadline || '';

  const publishedFact = bounty.publishedAt
    ? `<div class="fact"><span class="label">Published</span><strong>${fmt.esc(fmt.dateUtc(bounty.publishedAt))}</strong></div>`
    : '';

  const description = bounty.description ? String(bounty.description) : '';
  const descriptionHtml = description
    ? `<section>
        <h2>About this bounty</h2>
        ${description.split('\n\n').map((paragraph) => `<p>${fmt.esc(paragraph)}</p>`).join('')}
      </section>`
    : '';

  holder.innerHTML = `
    <h1>${fmt.esc(bounty.title)}</h1>
    <div class="chip-row">
      <span class="chip">${fmt.esc(bounty.status || 'unknown')}</span>
      <span class="tag">${fmt.esc(category)}</span>
    </div>

    <div class="facts-grid">
      <div class="fact"><span class="label">Live pot</span><strong>${fmt.money(toNumber(bounty.potUsd))}</strong></div>
      <div class="fact"><span class="label">Entry fee</span><strong>${entryFeeText(bounty)}</strong></div>
      <div class="fact">
        <span class="label">Deadline</span>
        <strong><span class="time-left" data-deadline="${fmt.esc(deadline)}">${fmt.esc(countdownText(deadline))}</span></strong>
        <span>${fmt.esc(fmt.dateUtc(deadline))}</span>
      </div>
      <div class="fact"><span class="label">Entries</span><strong>${entries.toLocaleString()}</strong></div>
      ${publishedFact}
    </div>

    ${descriptionHtml}
    ${rewardsHtml(bounty)}
    ${resolutionHtml(bounty)}

    <section class="top-entries">
      ${topEntriesHtml(leaderboard, pageSlug, rewardsPlan(bounty))}
    </section>
  `;

  updateLive(holder);
}

// Standalone page: on a wide screen the bounty route shows the same master and
// detail split the board uses, with this bounty selected; below 1100px it stays
// the single-column page it has always been.
export async function renderBounty(container, slug) {
  if (window.matchMedia(WIDE).matches) {
    const { renderBoard } = await import('./board.js');
    await renderBoard(container, { selectedSlug: slug });
    return;
  }

  await renderBountyDetail(container, slug);

  const stop = everySecond(() => {
    if (!container.isConnected) {
      stop();
      return;
    }
    updateLive(container);
  });
}
