import { getBounty, getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

export async function renderBounty(container, slug) {
  const bounty = await getBounty(slug);
  const lb = await getLeaderboard(slug);

  let rewardsHtml = '';
  if (bounty.rewardsNow && bounty.rewardsNow.length > 0) {
    rewardsHtml = `<h3>Rewards</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Place</th><th>Amount</th></tr></thead>
          <tbody>${bounty.rewardsNow.map(r => `<tr><td>${r.place}</td><td class="tabular-nums">${fmt.money(r.amount)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  } else if (bounty.rewards && typeof bounty.rewards === 'object') {
    const sorted = Object.entries(bounty.rewards).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    rewardsHtml = `<h3>Rewards</h3>
      <div class="tablewrap">
        <table>
          <caption>Live pot: ${fmt.money(bounty.potUsd)}</caption>
          <thead><tr><th>Place</th><th>Amount</th></tr></thead>
          <tbody>${sorted.map(r => `<tr><td>${r[0]}</td><td class="tabular-nums">${fmt.money(r[1])}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  let resolutionHtml = '';
  if (bounty.resolution) {
    resolutionHtml = `<h3>Resolution</h3>
      <p>${fmt.esc(bounty.resolution.summary)}</p>
      <ul>${bounty.resolution.criteria.map(c => `<li>${fmt.esc(c)}</li>`).join('')}</ul>`;
  }

  container.innerHTML = `
    <h1>${fmt.esc(bounty.title)}</h1>
    <div class="chips">
      <span class="chip">${fmt.esc(bounty.status)}</span>
      <span class="chip">${fmt.esc(bounty.category || 'General')}</span>
    </div>

    <div class="facts">
      <p>Entry fee: ${bounty.entryFeeUsd ? fmt.money(bounty.entryFeeUsd) : 'Free'}</p>
      <p>Deadline: ${fmt.dateUtc(bounty.deadline)} (${fmt.timeLeft(bounty.deadline)})</p>
      <p>Entries: ${bounty.submissionCount}</p>
      <p>Published: ${fmt.dateUtc(bounty.publishedAt)}</p>
    </div>

    <div class="description">
      ${fmt.esc(bounty.description).split('\n\n').map(p => `<p>${p}</p>`).join('')}
    </div>

    ${rewardsHtml}
    ${resolutionHtml}

    <a href="#/bounty/${fmt.esc(slug)}/leaderboard">View Leaderboard</a>

    <h3>Top Entries</h3>
    <ul>
      ${lb.entries.slice(0, 5).map(e => `<li>${fmt.esc(e.title)} by <a href="#/u/${fmt.esc(e.handle)}">${fmt.esc(e.handle)}</a></li>`).join('')}
    </ul>
  `;
}
