import { getProfile } from '../api.js';
import * as fmt from '../format.js';

export async function renderProfile(container, handle) {
  try {
    const p = await getProfile(handle);

    container.innerHTML = `
      <div class="avatar-container" style="width: 100px; height: 100px; position: relative;">
        <div class="avatar-initial" style="width: 100%; height: 100%; background: #ccc; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${p.handle.substring(0, 1).toUpperCase()}</div>
        <img src="${p.image || p.avatar}" crossorigin="anonymous" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
      </div>
      <h1>${fmt.esc(p.display_name || p.handle)}</h1>
      <p>@${fmt.esc(p.handle)}</p>
      <p>Joined: ${fmt.dateUtc(p.joined_at)}</p>
      <p>${fmt.esc(p.bio || '')}</p>
      ${p.wallet ? `<p>Wallet: <a href="${fmt.esc(p.wallet.explorer_url)}" target="_blank">${fmt.shortWallet(p.wallet.address)}</a></p>` : ''}

      <h3>Stats</h3>
      <div class="stats">
        <div class="stat-item"><strong>Entered</strong><br>${p.record.competitions_entered}</div>
        <div class="stat-item"><strong>Placed</strong><br>${p.record.competitions_placed}</div>
        <div class="stat-item"><strong>Won</strong><br>${p.record.competitions_won}</div>
        <div class="stat-item"><strong>Podiums</strong><br>${p.record.podium_finishes}</div>
        <div class="stat-item"><strong>Best</strong><br>${p.record.best_placement ? '#' + p.record.best_placement : '-'}</div>
        <div class="stat-item"><strong>Prizes</strong><br>${fmt.money(p.record.prize_usd)}</div>
      </div>

      <h3>Solutions</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Entry</th><th>Comp</th><th>Placement</th><th>Prize</th><th>Score</th></tr></thead>
          <tbody>
            ${p.solutions.map(s => `
              <tr>
                <td>${fmt.esc(s.title)}</td>
                <td><a href="#/bounty/${fmt.esc(s.competition.slug)}">${fmt.esc(s.competition.title)}</a></td>
                <td>${s.placement ? '#' + s.placement : '-'}</td>
                <td class="tabular-nums">${s.prize_usd > 0 ? fmt.money(s.prize_usd) : '-'}</td>
                <td>${(s.score?.display && /^\d{5,}$/.test(s.score.display)) ? fmt.rate(Number(s.score.display)) : fmt.esc(s.score?.display || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const img = container.querySelector('img');
    img.addEventListener('error', () => { img.style.display = 'none'; });
  } catch (e) {
    container.innerHTML = `<h1>Profile not found</h1><p>The user @${fmt.esc(handle)} does not exist.</p>`;
  }
}
