import { getBounty, getLeaderboard, everySecond } from '../api.js';
import * as fmt from '../format.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Payout and pot figures arrive as money strings that carry their cents
// ("32.20"), while rewardAmount is a plain number. fmt.money leaves a string
// alone, so handing the payload value straight over keeps the cents the API
// shipped instead of rounding them off.
const usd = (value) => fmt.money(typeof value === 'string' ? value : num(value).toFixed(2));

// A row with no figure for a column: the tables stay aligned without a dash
// standing in for a number that does not exist.
const DOT = '<span class="muted">·</span>';

// A win rate is carried in ten-thousandths of a percent: 956066 reads 95.61%.
const winPct = (micro) => `${(num(micro) / 10000).toFixed(2)}%`;

const has = (value) => value !== null && value !== undefined && value !== '';

const MEDALS = { 1: 'gold', 2: 'silver', 3: 'bronze' };

function medal(place) {
  const rank = Number(place);
  const tone = MEDALS[rank];
  return tone ? `<span class="rank-medal ${tone}">${rank}</span>` : `<span class="rank-medal">${fmt.esc(place)}</span>`;
}

function skeletonHtml() {
  return `
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>`;
}

function headerHtml(bounty, clock) {
  const chips = [];
  if (bounty.status) chips.push(`<span class="chip">${fmt.esc(bounty.status)}</span>`);
  if (bounty.category) chips.push(`<span class="tag">${fmt.esc(bounty.category)}</span>`);

  const facts = [];
  facts.push(`<div class="fact"><span>Live pot</span><strong>${usd(bounty.potUsd)}</strong></div>`);
  facts.push(`<div class="fact"><span>Entry fee</span><strong>${bounty.entryFeeUsd ? usd(bounty.entryFeeUsd) : 'Free'}</strong></div>`);

  // Only a bounty whose entry fee is actually being collected has fees to
  // report; the rest send "0.00" and get no fact rather than a row of zeros.
  if (num(bounty.entryFeesUsd) > 0) {
    const payers = has(bounty.entryFeePayers) ? ` from ${num(bounty.entryFeePayers)} payers` : '';
    facts.push(`<div class="fact"><span>Fees collected</span><strong>${usd(bounty.entryFeesUsd)}</strong><small>${fmt.esc(payers.trim())}</small></div>`);
  }

  if (bounty.deadline) {
    const left = clock(bounty.deadline);
    facts.push(`<div class="fact"><span>Deadline</span><strong>${fmt.dateUtc(bounty.deadline)}</strong><small class="time-left ${left.level}" data-deadline="${fmt.esc(bounty.deadline)}">${fmt.esc(left.label)}</small></div>`);
  }

  if (bounty.submissionCount !== undefined && bounty.submissionCount !== null) {
    facts.push(`<div class="fact"><span>Entries</span><strong>${num(bounty.submissionCount)}</strong></div>`);
  }

  if (bounty.publishedAt) {
    facts.push(`<div class="fact"><span>Published</span><strong>${fmt.dateUtc(bounty.publishedAt)}</strong></div>`);
  }

  return `
    <h1>${fmt.esc(bounty.title || bounty.slug)}</h1>
    ${chips.length ? `<div class="chip-row">${chips.join('')}</div>` : ''}
    <div class="facts-grid">${facts.join('')}</div>`;
}

const BULLET = /^(?:[-*•]|\d+[.)])\s+/;

// Bullet lines become list items, a wrapped continuation line joins the item
// above it, and the remaining source breaks were just wrapping, so they are
// joined back into one sentence flow.
function linesHtml(lines) {
  const html = [];
  let para = [];
  let items = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.join(' ')}</p>`);
    para = [];
  };
  const flushItems = () => {
    if (items.length) html.push(`<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    items = [];
  };

  lines.forEach((line) => {
    if (BULLET.test(line)) {
      flushPara();
      items.push(line.replace(BULLET, ''));
    } else if (items.length) {
      items[items.length - 1] += ` ${line}`;
    } else {
      para.push(line);
    }
  });
  flushPara();
  flushItems();
  return html.join('');
}

function descriptionHtml(bounty) {
  if (!bounty.description) return '';
  // The API text is hard-wrapped markdown. Blank lines break blocks and a
  // leading "#" line is a heading; everything else is prose or a bullet list.
  const body = fmt
    .esc(bounty.description)
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';

      const heading = lines[0].match(/^#{1,6}\s+(.*)$/);
      if (heading) return `<h3>${heading[1]}</h3>${linesHtml(lines.slice(1))}`;

      return linesHtml(lines);
    })
    .join('');
  return `<section class="description"><h2>About this bounty</h2>${body}</section>`;
}

// The API ships the payout schedule twice: `rewards` is the base place-to-amount
// map, and `rewardsNow` is the same schedule recomputed at the live pot, with
// the fees collected so far split over the places in proportion to their base
// reward. Everything below reads one of those two, so no figure is invented
// here: a bounty without `rewardsNow` falls back to its base-only schedule.
function prizeRows(bounty) {
  if (Array.isArray(bounty.rewardsNow) && bounty.rewardsNow.length) {
    const rows = bounty.rewardsNow
      .filter((row) => row && has(row.place))
      .sort((a, b) => Number(a.place) - Number(b.place))
      .map((row) => ({ place: row.place, base: row.baseUsd, fee: row.feeShareUsd, amount: row.amountUsd }));
    if (rows.length) return rows;
  }

  if (bounty.rewards && typeof bounty.rewards === 'object') {
    return Object.entries(bounty.rewards)
      .filter(([place, amount]) => place !== '' && has(amount))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([place, amount]) => ({ place, base: amount, fee: null, amount }));
  }

  return [];
}

// The place a prize figure belongs to, keyed the way the leaderboard states it.
function prizeMap(rows) {
  return new Map(rows.map((row) => [Number(row.place), row.amount]));
}

const totalOf = (rows, key) => rows.reduce((sum, row) => sum + num(row[key]), 0).toFixed(2);

function rewardsHtml(bounty) {
  const rows = prizeRows(bounty);
  if (!rows.length) return '';

  const split = rows.some((row) => has(row.fee));
  const baseTotal = totalOf(rows, 'base');
  const feeTotal = totalOf(rows, 'fee');
  const prizeTotal = totalOf(rows, 'amount');
  const payers = has(bounty.entryFeePayers) ? num(bounty.entryFeePayers) : null;

  const caption = split && num(feeTotal) > 0
    ? `Live pot ${usd(bounty.potUsd)}: ${usd(baseTotal)} in base rewards, plus ${usd(feeTotal)} of entry fees${payers === null ? '' : ` from ${payers} payers`} shared over the places`
    : `Live pot: ${usd(bounty.potUsd)}`;

  const head = split
    ? '<thead><tr><th>Place</th><th class="num">Base</th><th class="num">From fees</th><th class="num">Prize now</th></tr></thead>'
    : '<thead><tr><th>Place</th><th class="num">Amount</th></tr></thead>';

  const body = rows
    .map((row) => (split
      ? `<tr><td>${medal(row.place)}</td><td class="num">${usd(row.base)}</td><td class="num">${usd(row.fee)}</td><td class="num">${usd(row.amount)}</td></tr>`
      : `<tr><td>${medal(row.place)}</td><td class="num">${usd(row.amount)}</td></tr>`))
    .join('');

  const foot = split
    ? `<tfoot><tr><td>Total</td><td class="num">${usd(baseTotal)}</td><td class="num">${usd(feeTotal)}</td><td class="num">${usd(prizeTotal)}</td></tr></tfoot>`
    : `<tfoot><tr><td>Total</td><td class="num">${usd(prizeTotal)}</td></tr></tfoot>`;

  return `
    <h2>Rewards</h2>
    <div class="tablewrap">
      <table>${`<caption>${fmt.esc(caption)}</caption>`}${head}<tbody>${body}</tbody>${foot}</table>
    </div>`;
}

// The 90% band is carried per entry as micro rates on the same scale as the win
// rate, and its level names the band the API published ("0.900000000" = 90%).
function intervalHtml(entry) {
  const interval = entry && entry.interval;
  if (!interval || !has(interval.low) || !has(interval.high)) return DOT;
  return `${winPct(interval.low)} to ${winPct(interval.high)}`;
}

function intervalTitle(entries) {
  const level = entries.find((entry) => entry && entry.interval && has(entry.interval.level));
  const share = level ? num(level.interval.level) * 100 : 90;
  return `${share.toFixed(0)}% interval`;
}

function entriesHtml(leaderboard, slug, prizes) {
  const all = leaderboard && Array.isArray(leaderboard.entries) ? leaderboard.entries : [];
  // Ranked entries only, best first: some runs are still unranked, and they
  // belong to the full leaderboard rather than to a top ten.
  const entries = all
    .filter((entry) => entry && has(entry.rank) && num(entry.rank) > 0)
    .sort((a, b) => num(a.rank) - num(b.rank))
    .slice(0, 10);

  const button = `<p><a class="btn btn-primary" href="#/bounty/${fmt.esc(slug)}/leaderboard">View the full leaderboard</a></p>`;

  if (!entries.length) {
    return `
      <h2>Top entries</h2>
      <p class="muted">No ranked entries yet. The leaderboard opens as judging lands.</p>
      ${button}`;
  }

  const head = `<thead><tr><th>Rank</th><th>Entry</th><th>Entrant</th><th class="num">Win rate</th><th class="num">${fmt.esc(intervalTitle(entries))}</th><th class="num">Prize now</th></tr></thead>`;

  const rows = entries
    .map((entry) => {
      const handle = entry.handle;
      const entrant = handle ? `<a href="#/u/${fmt.esc(handle)}">${fmt.esc(handle)}</a>` : DOT;
      const win = has(entry.values && entry.values.judge) ? winPct(entry.values.judge) : DOT;
      const prize = has(entry.prize_rank) && prizes.has(num(entry.prize_rank)) ? usd(prizes.get(num(entry.prize_rank))) : DOT;
      return `<tr><td>${medal(entry.rank)}</td><td>${fmt.esc(entry.title)}</td><td>${entrant}</td><td class="num">${win}</td><td class="num">${intervalHtml(entry)}</td><td class="num">${prize}</td></tr>`;
    })
    .join('');

  return `
    <h2>Top entries</h2>
    <div class="tablewrap">
      <table>${head}<tbody>${rows}</tbody></table>
    </div>
    <p class="muted">Win rate is the share of judged duels won, and the band beside it is the interval the judge published for that rate.</p>
    ${button}`;
}

function resolutionHtml(bounty) {
  const resolution = bounty.resolution;
  if (!resolution) return '';
  const criteria = Array.isArray(resolution.criteria) ? resolution.criteria.filter(Boolean) : [];
  if (!resolution.summary && !criteria.length) return '';

  return `
    <section>
      <h3>How it is decided</h3>
      ${resolution.summary ? `<p>${fmt.esc(resolution.summary)}</p>` : ''}
      ${criteria.length ? `<ul class="rules-list">${criteria.map((rule) => `<li>${fmt.esc(rule)}</li>`).join('')}</ul>` : ''}
    </section>`;
}

// Whose job it is to keep these clocks honest. Every render paints once, so the
// countdown has its text straight away. In the board's split the list-side tick
// already walks the pane, so the detail renderer subscribes only when it is the
// whole page and nobody else is ticking.
function followLive(container, paint) {
  paint(container);
  if (container.closest('.pane-detail')) return;
  const stop = everySecond(() => {
    if (!container.isConnected) {
      stop();
      return;
    }
    paint(container);
  });
}

// The detail body on its own: no page chrome, so the board can drop it into a
// pane beside the list and the bounty route can hand it the whole page.
export async function renderBountyDetail(container, slug) {
  container.innerHTML = skeletonHtml();

  // `clock` lives with the board's second tick, so the countdown this renderer
  // prints is the same text that tick keeps updating. One import, one clock.
  const [{ clock, paintLive }, bounty] = await Promise.all([import('./board.js'), getBounty(slug)]);

  // The leaderboard is a bonus section: its own request and its own failure, so
  // a leaderboard outage never blanks a page that has the bounty to show.
  let leaderboard = null;
  try {
    leaderboard = await getLeaderboard(slug);
  } catch (e) {
    leaderboard = null;
  }

  const skills = Array.isArray(bounty.skills) ? bounty.skills.filter(Boolean) : [];
  const prizes = prizeMap(prizeRows(bounty));

  container.innerHTML = `
    ${headerHtml(bounty, clock)}
    ${skills.length ? `<div class="chip-row">${skills.map((skill) => `<span class="tag">${fmt.esc(skill)}</span>`).join('')}</div>` : ''}
    ${descriptionHtml(bounty)}
    ${rewardsHtml(bounty)}
    ${entriesHtml(leaderboard, slug, prizes)}
    ${resolutionHtml(bounty)}`;

  followLive(container, paintLive);
}

// The standalone bounty page. Where there is room for two columns it becomes the
// board's split view with this bounty selected, and the list beside it; below
// that width it stays the page it has always been.
const WIDE = '(min-width: 1100px)';

export async function renderBounty(container, slug) {
  let split = false;
  try {
    const { renderBoardSplit } = await import('./board.js');
    split = await renderBoardSplit(container, slug);
  } catch (e) {
    // The split needs the whole board: if that fetch fails, the bounty itself
    // still gets its own page rather than an error.
    split = false;
  }
  if (split) return;

  container.innerHTML = skeletonHtml();
  await renderBountyDetail(container, slug);

  // Room for a second column can arrive after the page was drawn (a window
  // resize): when it does, this page hands itself back to the board's split, so
  // a wide window shows what a wide load shows.
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null;
  if (!media || !media.addEventListener) return;
  const onGrow = () => {
    if (!container.isConnected) {
      media.removeEventListener('change', onGrow);
      return;
    }
    if (!media.matches) return;
    media.removeEventListener('change', onGrow);
    renderBounty(container, slug).catch(() => {});
  };
  media.addEventListener('change', onGrow);
}
