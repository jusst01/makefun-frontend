import { getProfile } from '../api.js';
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

const placementCell = (place) => {
  const n = Number(place);
  if (!Number.isFinite(n) || n <= 0) return '<span class="muted">-</span>';
  if (n <= 3) return `<span class="rank-medal ${medalClass(n)}">${n}</span>`;
  return `<span class="muted">#${n}</span>`;
};

const scoreText = (score) => {
  const display = score && score.display !== undefined && score.display !== null ? String(score.display) : '';
  if (!display) return '<span class="muted">-</span>';
  if (/^\d{5,}$/.test(display)) return fmt.esc(fmt.rate(Number(display)));
  return fmt.esc(display);
};

const skeletonHtml = () => `
  <div class="profile-head">
    <div class="skeleton avatar"></div>
    <div style="flex:1;min-width:0">
      <div class="skel-line" style="width:38%;height:26px;margin-bottom:10px"></div>
      <div class="skel-line" style="width:24%;margin-bottom:8px"></div>
      <div class="skel-line" style="width:30%"></div>
    </div>
  </div>
  <div class="stats-grid">
    ${Array.from({ length: 6 }, () => '<div class="skeleton stat" style="min-height:70px"></div>').join('')}
  </div>
  <div class="skel-line" style="width:20%;height:20px;margin-bottom:14px"></div>
  ${Array.from({ length: 4 }, (_, i) => `<div class="skel-line" style="width:${92 - i * 9}%;margin-bottom:10px"></div>`).join('')}
`;

export async function renderProfile(container, handle) {
  container.innerHTML = skeletonHtml();

  let p;
  try {
    p = await getProfile(handle);
  } catch (e) {
    container.innerHTML = `<div class="error-box"><strong>Profile not found.</strong> The account @${fmt.esc(handle)} does not exist or could not be loaded.</div>`;
    return;
  }

  if (!p || typeof p !== 'object') {
    container.innerHTML = `<div class="error-box"><strong>Profile not found.</strong> The account @${fmt.esc(handle)} does not exist.</div>`;
    return;
  }

  const displayName = p.display_name || p.handle || handle;
  const initial = String(displayName).trim().substring(0, 1).toUpperCase() || '?';
  const record = p.record && typeof p.record === 'object' ? p.record : {};
  const solutions = Array.isArray(p.solutions) ? p.solutions : [];

  const avatarSrc = p.image || p.avatar || '';
  const avatarHtml = avatarSrc
    ? `<div class="avatar" style="position:relative;overflow:hidden">
         <span aria-hidden="true">${fmt.esc(initial)}</span>
         <img src="${fmt.esc(avatarSrc)}" alt="${fmt.esc(displayName)}" crossorigin="anonymous" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
       </div>`
    : `<div class="avatar" aria-hidden="true">${fmt.esc(initial)}</div>`;

  const bio = p.bio ? `<p class="muted">${fmt.esc(p.bio)}</p>` : '';
  const joined = p.joined_at
    ? `<span class="muted">Joined ${fmt.esc(fmt.dateUtc(p.joined_at))}</span>`
    : '<span class="muted">Join date unknown</span>';

  const wallet = p.wallet && p.wallet.address
    ? `<span class="muted">Wallet: <a href="${fmt.esc(p.wallet.explorer_url || '#')}" target="_blank" rel="noopener">${fmt.esc(fmt.shortWallet(p.wallet.address))}</a></span>`
    : '';

  const bestPlacement = record.best_placement ? `#${fmt.esc(record.best_placement)}` : '-';

  const solutionsHtml = solutions.length
    ? `<div class="tablewrap">
        <table>
          <thead><tr><th>Entry</th><th>Competition</th><th>Placement</th><th class="num">Prize</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${solutions.map((s) => {
              const competition = s && s.competition && s.competition.slug
                ? `<a href="#/bounty/${fmt.esc(s.competition.slug)}">${fmt.esc(s.competition.title || s.competition.slug)}</a>`
                : '<span class="muted">-</span>';
              const prize = toNumber(s && s.prize_usd);
              return `
                <tr>
                  <td>${s && s.title ? fmt.esc(s.title) : '<span class="muted">Untitled</span>'}</td>
                  <td>${competition}</td>
                  <td>${placementCell(s && s.placement)}</td>
                  <td class="num">${prize > 0 ? fmt.money(prize) : '<span class="muted">-</span>'}</td>
                  <td class="num">${scoreText(s && s.score)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
    : '<div class="empty">No entries yet</div>';

  container.innerHTML = `
    <div class="profile-head">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <h1>${fmt.esc(displayName)}</h1>
        <p class="muted">@${fmt.esc(p.handle || handle)}</p>
        <div class="meta-row">
          ${joined}
          ${wallet}
        </div>
        ${bio}
      </div>
    </div>

    <h2>Record</h2>
    <div class="stats-grid">
      <div class="stat"><b>${toNumber(record.competitions_entered).toLocaleString()}</b><span>Entered</span></div>
      <div class="stat"><b>${toNumber(record.competitions_placed).toLocaleString()}</b><span>Placed</span></div>
      <div class="stat"><b>${toNumber(record.competitions_won).toLocaleString()}</b><span>Won</span></div>
      <div class="stat"><b>${toNumber(record.podium_finishes).toLocaleString()}</b><span>Podiums</span></div>
      <div class="stat"><b>${bestPlacement}</b><span>Best placement</span></div>
      <div class="stat"><b class="accent">${fmt.money(toNumber(record.prize_usd))}</b><span>Prizes</span></div>
    </div>

    <h2>Solutions</h2>
    ${solutionsHtml}
  `;

  const img = container.querySelector('.avatar img');
  if (img) {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    });
  }
}
