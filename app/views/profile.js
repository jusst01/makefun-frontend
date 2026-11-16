import { getProfile } from '../api.js';
import * as fmt from '../format.js';

export async function renderProfile(container, handle) {
  try {
    const p = await getProfile(handle);

    container.innerHTML = `
      <h1>${fmt.esc(p.display_name || p.handle)}</h1>
      <p>@${fmt.esc(p.handle)}</p>
      <p>Joined: ${fmt.dateUtc(p.joined_at)}</p>
      <p>${fmt.esc(p.bio || '')}</p>
      <p>Wallet: <a href="${fmt.esc(p.wallet.explorer_url)}" target="_blank">${fmt.shortWallet(p.wallet.address)}</a></p>

      <h3>Stats</h3>
      <div class="stats">
        <p>Entered: ${p.record.competitions_entered}</p>
        <p>Won: ${p.record.competitions_won}</p>
      </div>

      <h3>Solutions</h3>
      <ul>
        ${p.solutions.map(s => `
          <li>
            <a href="#/bounty/${fmt.esc(s.competition.slug)}">${fmt.esc(s.competition.title)}</a>:
            ${fmt.esc(s.title)} (Placement: ${s.placement || 'N/A'})
          </li>
        `).join('')}
      </ul>
    `;
  } catch (e) {
    container.innerHTML = `<h1>Profile not found</h1><p>The user @${fmt.esc(handle)} does not exist.</p>`;
  }
}
