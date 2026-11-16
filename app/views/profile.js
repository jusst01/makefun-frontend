import { getProfile } from '../api.js';
import * as fmt from '../format.js';

const medal = (placement) => {
  const classes = { 1: 'gold', 2: 'silver', 3: 'bronze' };
  return classes[placement] ? `<span class="rank-medal ${classes[placement]}">${placement}</span>` : '#' + fmt.esc(placement);
};

function scoreText(score) {
  const display = score && score.display;
  // Long digit-only displays are micro-units and read better as a rate.
  if (display && /^\d{5,}$/.test(display)) return fmt.rate(Number(display));
  return fmt.esc(display || '-');
}

const skeleton = () => `
  <div class="skeleton">
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>
    <div class="skel-line"></div>
  </div>`;

export async function renderProfile(container, handle) {
  container.innerHTML = skeleton();

  let p;
  try {
    p = await getProfile(handle);
  } catch (e) {
    container.innerHTML = `
      <div class="error-box">
        <h1>Profile not found</h1>
        <p>The user @${fmt.esc(handle)} does not exist or could not be loaded.</p>
        <a class="btn-ghost" href="#/">Back to the board</a>
      </div>`;
    return;
  }

  const record = p?.record || {};
  const solutions = Array.isArray(p?.solutions) ? p.solutions : [];
  const name = p?.display_name || p?.handle || handle;
  const initial = String(p?.handle || handle || '?').substring(0, 1).toUpperCase();
  const image = p?.image || p?.avatar || '';

  container.innerHTML = `
    <div class="profile-head">
      <div style="position: relative; flex: 0 0 auto; width: 72px; height: 72px;">
        <span class="avatar" aria-hidden="true" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 24px;">${fmt.esc(initial)}</span>
        ${image ? `<img class="avatar" src="${fmt.esc(image)}" crossorigin="anonymous" alt="" style="position: absolute; inset: 0;">` : ''}
      </div>
      <div style="flex: 1 1 260px; min-width: 0;">
        <h1>${fmt.esc(name)}</h1>
        <p class="muted">@${fmt.esc(handle)}</p>
        ${p?.joined_at ? `<p class="muted">Joined ${fmt.esc(fmt.dateUtc(p.joined_at))}</p>` : ''}
        ${p?.bio ? `<p>${fmt.esc(p.bio)}</p>` : ''}
        ${p?.wallet?.explorer_url ? `<p>Wallet: <a href="${fmt.esc(p.wallet.explorer_url)}" target="_blank" rel="noopener">${fmt.esc(fmt.shortWallet(p.wallet.address))}</a></p>` : ''}
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat"><b>${fmt.esc(record.competitions_entered ?? 0)}</b><span>Entered</span></div>
      <div class="stat"><b>${fmt.esc(record.competitions_placed ?? 0)}</b><span>Placed</span></div>
      <div class="stat"><b>${fmt.esc(record.competitions_won ?? 0)}</b><span>Won</span></div>
      <div class="stat"><b>${fmt.esc(record.podium_finishes ?? 0)}</b><span>Podiums</span></div>
      <div class="stat"><b>${record.best_placement ? '#' + fmt.esc(record.best_placement) : '-'}</b><span>Best</span></div>
      <div class="stat"><b>${fmt.esc(fmt.money(record.prize_usd))}</b><span>Prizes</span></div>
    </div>

    <h2>Solutions</h2>
    ${solutions.length
      ? `<div class="tablewrap">
        <table>
          <thead><tr><th>Entry</th><th>Competition</th><th>Placement</th><th>Prize</th><th>Score</th></tr></thead>
          <tbody>
            ${solutions.map((s) => `
              <tr>
                <td>${fmt.esc(s?.title || '-')}</td>
                <td>${s?.competition?.slug ? `<a href="#/bounty/${fmt.esc(s.competition.slug)}">${fmt.esc(s.competition.title || s.competition.slug)}</a>` : fmt.esc(s?.competition?.title || '-')}</td>
                <td>${s?.placement ? medal(s.placement) : '-'}</td>
                <td class="tabular-nums">${s?.prize_usd > 0 ? fmt.esc(fmt.money(s.prize_usd)) : '-'}</td>
                <td>${scoreText(s?.score)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`
      : '<div class="empty">No entries yet</div>'}`;

  const img = container.querySelector('img.avatar');
  if (img) img.addEventListener('error', () => { img.style.display = 'none'; });
}
