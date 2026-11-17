import { getProfile } from '../api.js';
import * as fmt from '../format.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const has = (value) => value !== null && value !== undefined && value !== '';

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

const payoutPlaceCell = (place) => {
  const n = Number(place);
  if (n >= 1 && n <= 3) return `<span class="rank-medal ${medalClass(n)}">${n}</span>`;
  return `<span class="muted">#${n}</span>`;
};

const scoreText = (score) => {
  const display = score && score.display !== undefined && score.display !== null ? String(score.display) : '';
  if (!display) return '<span class="muted">-</span>';
  if (/^\d{5,}$/.test(display)) return fmt.esc(fmt.rate(Number(display)));
  return fmt.esc(display);
};

const dot = '<span class="muted">·</span>';

// Avatars arrive as /api/... paths, which are relative to the API host, not to
// wherever this app is served from.
const ORIGIN = 'https://make.fun';
const mediaUrl = (raw) => {
  if (!has(raw)) return '';
  const src = String(raw);
  if (/^https?:\/\//i.test(src)) return src;
  return `${ORIGIN}${src.startsWith('/') ? '' : '/'}${src}`;
};

// Money to the cent, so a real payout never reads as a rounded guess.
const usd = (amount) => {
  const n = Math.round(toNumber(amount) * 100) / 100;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

// Payout records are keyed by competition; a solution row can then borrow the
// transaction link and paid date the payload publishes for that competition.
const payoutIndex = (payouts) => {
  const bySlug = new Map();
  if (!Array.isArray(payouts)) return bySlug;
  for (const payout of payouts) {
    if (!payout || !payout.competition || !payout.competition.slug) continue;
    const slug = String(payout.competition.slug);
    const list = bySlug.get(slug) || [];
    list.push(payout);
    bySlug.set(slug, list);
  }
  return bySlug;
};

const matchPayout = (bySlug, solution) => {
  const slug = solution && solution.competition && solution.competition.slug;
  if (!slug) return null;
  const list = bySlug.get(String(slug));
  if (!list || !list.length) return null;
  const place = Number(solution.placement);
  return list.find((payout) => Number(payout.place) === place) || null;
};

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
  const payoutsBySlug = payoutIndex(p.payouts);

  const avatarSrc = mediaUrl(p.image || p.avatar || '');
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

  // Identity links: the wallet explorer and the GitHub account are both on the
  // payload, so both get a link. Neither URL is ever synthesized.
  const identity = [];
  if (p.wallet && p.wallet.address) {
    const address = String(p.wallet.address);
    const walletLabel = fmt.esc(fmt.shortWallet(address));
    const explorer = p.wallet.explorer_url ? String(p.wallet.explorer_url) : '';
    identity.push(explorer
      ? `<span class="muted">Wallet: <a href="${fmt.esc(explorer)}" target="_blank" rel="noopener">${walletLabel}</a></span>`
      : `<span class="muted">Wallet: <span class="tabular-nums">${walletLabel}</span></span>`);
  }
  if (p.github_login) {
    const login = String(p.github_login);
    identity.push(`<span class="muted">GitHub: <a href="https://github.com/${encodeURIComponent(login)}" target="_blank" rel="noopener">${fmt.esc(login)}</a></span>`);
  }

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

  // One line per payout. A payout is money that was actually paid, so a placed
  // solution still waiting on its prize (prize_usd null, no payout record) is not
  // listed here: the Payouts section is money, not placements. The prize links to
  // the transaction explorer only when the payload publishes a URL for it.
  const paid = solutions.filter((s) => {
    if (!s || !has(s.placement) || Number(s.placement) <= 0) return false;
    const payout = matchPayout(payoutsBySlug, s);
    const amount = has(s.prize_usd) ? toNumber(s.prize_usd) : (payout && has(payout.amount_usd) ? toNumber(payout.amount_usd) : 0);
    return amount > 0;
  });

  const payoutsHtml = paid.length
    ? paid.map((s) => {
        const place = Number(s.placement);
        const payout = matchPayout(payoutsBySlug, s);
        const amount = has(s.prize_usd) ? toNumber(s.prize_usd) : (payout && has(payout.amount_usd) ? toNumber(payout.amount_usd) : 0);
        const prizeText = usd(amount);
        const explorer = payout && (payout.explorer_url || payout.transaction_url || payout.tx_url)
          ? String(payout.explorer_url || payout.transaction_url || payout.tx_url)
          : '';
        const prizeCell = explorer
          ? `<a href="${fmt.esc(explorer)}" target="_blank" rel="noopener">${prizeText}</a>`
          : prizeText;

        const slug = s.competition && s.competition.slug ? String(s.competition.slug) : '';
        const name = s.competition && (s.competition.title || s.competition.slug) ? String(s.competition.title || s.competition.slug) : '';
        const competitionCell = slug
          ? `<a href="#/bounty/${fmt.esc(slug)}">${fmt.esc(name)}</a>`
          : dot;

        const dateRaw = payout && has(payout.paid_at) ? payout.paid_at : s.entered_at;
        const dateText = dateRaw ? fmt.dateFull(dateRaw) : '';

        return `
          <div class="pay-row">
            <span style="display:inline-flex;align-items:center;gap:10px;min-width:0">
              ${payoutPlaceCell(place)}
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${competitionCell}</span>
            </span>
            <span style="display:inline-flex;align-items:center;gap:14px;white-space:nowrap">
              <span class="tabular-nums" style="color:var(--accent);font-weight:600">${prizeCell}</span>
              <span class="muted">${fmt.esc(dateText)}</span>
            </span>
          </div>`;
      }).join('')
    : '<p class="muted" style="margin:0">No payouts yet.</p>';

  container.innerHTML = `
    <div class="profile-head">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <h1>${fmt.esc(displayName)}</h1>
        <p class="muted">@${fmt.esc(p.handle || handle)}</p>
        <div class="meta-row">
          ${joined}
          ${identity.join('')}
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

    <h2>Payouts</h2>
    ${payoutsHtml}
  `;

  const img = container.querySelector('.avatar img');
  if (img) {
    img.addEventListener('error', () => {
      img.style.display = 'none';
    });
  }
}
