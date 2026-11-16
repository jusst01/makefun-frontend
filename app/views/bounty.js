import { getBounty, getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

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

function headerHtml(bounty) {
  const chips = [];
  if (bounty.status) chips.push(`<span class="chip">${fmt.esc(bounty.status)}</span>`);
  if (bounty.category) chips.push(`<span class="tag">${fmt.esc(bounty.category)}</span>`);

  const facts = [];
  facts.push(`<div class="fact"><span>Live pot</span><strong>${fmt.money(num(bounty.potUsd))}</strong></div>`);
  facts.push(`<div class="fact"><span>Entry fee</span><strong>${bounty.entryFeeUsd ? fmt.money(num(bounty.entryFeeUsd)) : 'Free'}</strong></div>`);

  if (bounty.deadline) {
    const clock = fmt.countdown(bounty.deadline);
    const level = clock.level;
    facts.push(`<div class="fact"><span>Deadline</span><strong>${fmt.dateUtc(bounty.deadline)}</strong><small class="time-left ${level}">${fmt.esc(clock.label)}</small></div>`);
  }

  if (bounty.submissionCount !== undefined && bounty.submissionCount !== null) {
    const entries = num(bounty.submissionCount);
    facts.push(`<div class="fact"><span>Entries</span><strong>${entries}</strong></div>`);
  }

  if (bounty.publishedAt) {
    facts.push(`<div class="fact"><span>Published</span><strong>${fmt.dateUtc(bounty.publishedAt)}</strong></div>`);
  }

  return `
    <h1>${fmt.esc(bounty.title)}</h1>
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

function rewardsHtml(bounty) {
  const caption = `<caption>Live pot: ${fmt.money(num(bounty.potUsd))}</caption>`;
  const head = '<thead><tr><th>Place</th><th class="num">Amount</th></tr></thead>';

  // The caption has to sit inside the table element, or the parser drops it.
  const wrap = (rows) => `<h2>Rewards</h2>
      <div class="tablewrap">
        <table>${caption}${head}<tbody>${rows}</tbody></table>
      </div>`;

  if (Array.isArray(bounty.rewardsNow) && bounty.rewardsNow.length) {
    const pairs = bounty.rewardsNow
      .filter((row) => row && row.place !== undefined && row.place !== null)
      .sort((a, b) => Number(a.place) - Number(b.place));
    if (!pairs.length) return '';
    const rows = pairs
      .map((row) => `<tr><td>${medal(row.place)}</td><td class="num">${fmt.money(num(row.amountUsd !== undefined ? row.amountUsd : row.amount))}</td></tr>`)
      .join('');
    return wrap(rows);
  }

  if (bounty.rewards && typeof bounty.rewards === 'object') {
    const pairs = Object.entries(bounty.rewards)
      .filter(([place, amount]) => place !== '' && amount !== null && amount !== undefined)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    if (!pairs.length) return '';
    const rows = pairs
      .map(([place, amount]) => `<tr><td>${medal(place)}</td><td class="num">${fmt.money(num(amount))}</td></tr>`)
      .join('');
    return wrap(rows);
  }

  return '';
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

function entriesHtml(leaderboard, slug) {
  const entries = leaderboard && Array.isArray(leaderboard.entries) ? leaderboard.entries : [];
  const withheld = Boolean(leaderboard && leaderboard.metrics_withheld);

  const header = '<thead><tr><th>Rank</th><th>Entry</th><th>Entrant</th><th class="num">Win rate</th></tr></thead>';

  if (!entries.length) {
    return `
      <h2>Top entries</h2>
      <p class="muted">No entries yet</p>`;
  }

  const rows = entries
    .slice(0, 5)
    .map((entry) => {
      const rank = entry && entry.rank !== undefined && entry.rank !== null ? entry.rank : entries.indexOf(entry) + 1;
      const handle = entry && entry.handle;
      const entrant = handle ? `<a href="#/u/${fmt.esc(handle)}">${fmt.esc(handle)}</a>` : '<span class="muted">-</span>';
      const judge = entry && entry.values ? entry.values.judge : undefined;
      const winRate = !withheld && judge !== undefined && judge !== null ? fmt.rate(num(judge)) : '<span class="muted">-</span>';
      return `<tr><td>${medal(rank)}</td><td>${fmt.esc(entry && entry.title)}</td><td>${entrant}</td><td class="num">${winRate}</td></tr>`;
    })
    .join('');

  return `
    <h2>Top entries</h2>
    <div class="tablewrap">
      <table>${header}<tbody>${rows}</tbody></table>
    </div>
    ${withheld ? '<p class="muted">Win rates are still held back for this bounty, so the column reads as a dash until the judging opens up.</p>' : ''}
    <p><a class="btn btn-primary" href="#/bounty/${fmt.esc(slug)}/leaderboard">View the full leaderboard</a></p>`;
}

export async function renderBounty(container, slug) {
  container.innerHTML = skeletonHtml();

  // The bounty is what the page is about: fetch it first, and let a failure
  // there surface as the page error rather than a half-empty page.
  const bounty = await getBounty(slug);

  // The leaderboard is a bonus section: its own request and its own failure.
  let leaderboard = null;
  try {
    leaderboard = await getLeaderboard(slug);
  } catch (e) {
    leaderboard = null;
  }

  const skills = Array.isArray(bounty.skills) ? bounty.skills.filter(Boolean) : [];

  container.innerHTML = `
    ${headerHtml(bounty)}
    ${skills.length ? `<div class="chip-row">${skills.map((skill) => `<span class="tag">${fmt.esc(skill)}</span>`).join('')}</div>` : ''}
    ${descriptionHtml(bounty)}
    ${rewardsHtml(bounty)}
    ${resolutionHtml(bounty)}
    ${entriesHtml(leaderboard, slug)}`;
}
