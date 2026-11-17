import { getBounty, getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

const rewardsTable = (rows, potUsd) => `
  <div class="tablewrap">
    <table>
      <caption>Live pot: ${fmt.money(toNumber(potUsd))}</caption>
      <thead><tr><th>Place</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${rankCell(row.place)}</td>
            <td class="num">${fmt.money(row.amount)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

const rewardsHtml = (bounty) => {
  if (Array.isArray(bounty.rewardsNow) && bounty.rewardsNow.length > 0) {
    const rows = bounty.rewardsNow.map((reward) => ({
      place: toNumber(reward.place),
      amount: toNumber(reward.amountUsd !== undefined ? reward.amountUsd : reward.amount)
    }));
    return `<h3>Rewards</h3>${rewardsTable(rows, bounty.potUsd)}`;
  }

  if (bounty.rewards && typeof bounty.rewards === 'object') {
    const rows = Object.entries(bounty.rewards)
      .map(([place, amount]) => ({ place: toNumber(place), amount: toNumber(amount) }))
      .filter((row) => row.place > 0)
      .sort((a, b) => a.place - b.place);
    if (rows.length) return `<h3>Rewards</h3>${rewardsTable(rows, bounty.potUsd)}`;
  }

  return '';
};

const resolutionHtml = (bounty) => {
  const resolution = bounty.resolution;
  if (!resolution) return '';

  const summary = resolution.summary
    ? `<p>${fmt.esc(resolution.summary)}</p>`
    : '';
  const criteria = Array.isArray(resolution.criteria)
    ? resolution.criteria.map((item) => `<li>${fmt.esc(item)}</li>`).join('')
    : '';

  if (!summary && !criteria) return '';

  return `
    <h3>How it is decided</h3>
    ${summary}
    ${criteria ? `<ul class="rules-list">${criteria}</ul>` : ''}`;
};

const entriesHtml = (leaderboard, slug) => {
  const fullLink = `<a class="btn btn-primary" href="#/bounty/${fmt.esc(slug)}/leaderboard">View the full leaderboard</a>`;
  const entries = leaderboard && Array.isArray(leaderboard.entries) ? leaderboard.entries : [];

  if (!entries.length) {
    return `<h3>Top entries</h3>
      <p class="muted">No entries yet</p>
      ${fullLink}`;
  }

  const withheld = Boolean(leaderboard.metrics_withheld);

  const rows = entries.slice(0, 5).map((entry, index) => {
    const place = Number.isFinite(Number(entry.rank)) && entry.rank !== null ? toNumber(entry.rank) : index + 1;
    const title = entry.title ? fmt.esc(entry.title) : '<span class="muted">Untitled</span>';
    const entrant = entry.handle
      ? `<a href="#/u/${fmt.esc(entry.handle)}">${fmt.esc(entry.handle)}</a>`
      : '<span class="muted">-</span>';
    const judge = entry.values ? entry.values.judge : undefined;
    const winRate = !withheld && judge !== null && judge !== undefined && Number.isFinite(Number(judge))
      ? `<td class="num">${fmt.rate(Number(judge))}</td>`
      : '<td class="num muted">-</td>';

    return `
      <tr>
        <td>${rankCell(place)}</td>
        <td>${title}</td>
        <td>${entrant}</td>
        ${winRate}
      </tr>`;
  }).join('');

  return `
    <h3>Top entries</h3>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Rank</th><th>Entry</th><th>Entrant</th><th class="num">Win rate</th></tr></thead>
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

export async function renderBounty(container, slug) {
  container.innerHTML = skeletonHtml();

  let bounty;
  try {
    bounty = await getBounty(slug);
  } catch (e) {
    container.innerHTML = `<div class="error-box"><strong>Could not load this bounty.</strong> ${fmt.esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    return;
  }

  if (!bounty || typeof bounty !== 'object') {
    container.innerHTML = '<div class="empty">This bounty does not exist.</div>';
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
  const countdown = fmt.countdown(bounty.deadline);
  const deadlineText = bounty.deadline
    ? `${fmt.dateUtc(bounty.deadline)} (${fmt.esc(countdown.label)})`
    : '<span class="muted">Not set</span>';

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

  container.innerHTML = `
    <h1>${fmt.esc(bounty.title)}</h1>
    <div class="chip-row">
      <span class="chip">${fmt.esc(bounty.status || 'unknown')}</span>
      <span class="tag">${fmt.esc(category)}</span>
    </div>

    <div class="facts-grid">
      <div class="fact"><span class="label">Live pot</span><strong>${fmt.money(toNumber(bounty.potUsd))}</strong></div>
      <div class="fact"><span class="label">Entry fee</span><strong>${entryFeeText(bounty)}</strong></div>
      <div class="fact"><span class="label">Deadline</span><strong>${deadlineText}</strong></div>
      <div class="fact"><span class="label">Entries</span><strong>${entries.toLocaleString()}</strong></div>
      ${publishedFact}
    </div>

    ${descriptionHtml}
    ${rewardsHtml(bounty)}
    ${resolutionHtml(bounty)}

    <section class="top-entries">
      ${entriesHtml(leaderboard, pageSlug)}
    </section>
  `;
}
