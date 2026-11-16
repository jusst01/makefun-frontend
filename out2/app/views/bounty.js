import { getBounty, getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

export async function renderBounty(container, slug) {
  const bounty = await getBounty(slug);
  const lb = await getLeaderboard(slug);

  container.innerHTML = `
    <h1>${fmt.esc(bounty.title)}</h1>
    <div class="chips">
      <span>${fmt.esc(bounty.status)}</span>
      <span>${fmt.esc(bounty.category)}</span>
    </div>
    <h2>Live pot: ${fmt.money(bounty.potUsd)}</h2>

    <div class="facts">
      <p>Entry fee: ${bounty.entryFeeUsd ? fmt.money(bounty.entryFeeUsd) : 'Free'}</p>
      <p>Deadline: ${fmt.dateUtc(bounty.deadline)} (${fmt.timeLeft(bounty.deadline)})</p>
      <p>Entries: ${bounty.submissionCount}</p>
      <p>Published: ${fmt.dateUtc(bounty.publishedAt)}</p>
    </div>

    <div class="description">
      ${fmt.esc(bounty.description).split('\n\n').map(p => `<p>${p}</p>`).join('')}
    </div>

    <a href="#/bounty/${fmt.esc(slug)}/leaderboard">View Leaderboard</a>

    <h3>Top Entries</h3>
    <ul>
      ${lb.entries.slice(0, 5).map(e => `<li>${fmt.esc(e.title)} by ${fmt.esc(e.handle)}</li>`).join('')}
    </ul>
  `;
}
