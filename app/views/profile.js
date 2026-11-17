import { getProfile } from '../api.js';
import * as fmt from '../format.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const has = (value) => value !== null && value !== undefined && value !== '';

// A cell the payload has nothing for reads as a middle dot, never a dash.
const DOT = '<span class="muted">·</span>';

const MEDALS = { 1: 'gold', 2: 'silver', 3: 'bronze' };

function medal(place) {
  const n = Number(place);
  const tone = MEDALS[n];
  return tone
    ? `<span class="rank-medal ${tone}">${n}</span>`
    : `<span class="tabular-nums">#${fmt.esc(place)}</span>`;
}

const usd = (value) => fmt.money(typeof value === 'string' ? value : num(value).toFixed(2));

const ORIGIN = 'https://make.fun';
const absolute = (url) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

// The score a solution carries names its own column: the judge column is a win
// rate in ten-thousandths of a percent, everything else is shown as it was
// published.
function scoreText(score) {
  if (!score || !has(score.display)) return DOT;
  const column = score.column || {};
  if (column.key === 'judge' && has(score.value)) return `${(num(score.value) / 10000).toFixed(2)}%`;
  return fmt.esc(score.display);
}

function skeletonHtml() {
  return `<div class="skeleton">${Array.from({ length: 4 }, () => '<div class="skel-line"></div>').join('')}</div>`;
}

// The profile ships its paid prizes separately from its solutions: a solution
// records a place, and `payouts` records the transfer that settled it. Matching
// on competition and place is the only link the payload offers, so a prize is
// linked only when that match exists. A placed entry that was never paid has no
// transfer to point at, and nothing here invents one.
function payoutRows(profile) {
  const solutions = Array.isArray(profile && profile.solutions) ? profile.solutions : [];
  const payouts = Array.isArray(profile && profile.payouts) ? profile.payouts.slice() : [];
  const keyOf = (slug, place) => `${slug || ''}|${Number(place)}`;

  const byKey = new Map();
  payouts.forEach((payout) => {
    if (!payout) return;
    const slug = payout.competition && payout.competition.slug;
    if (!has(slug) || !has(payout.place)) return;
    const key = keyOf(slug, payout.place);
    // Newest first when a competition paid the same place more than once.
    const previous = byKey.get(key);
    if (!previous || String(payout.paid_at || '') > String(previous.paid_at || '')) byKey.set(key, payout);
  });

  const rows = [];
  solutions.forEach((solution) => {
    const place = solution && solution.placement;
    if (!has(place)) return;
    const slug = solution.competition && solution.competition.slug;
    const payout = slug ? byKey.get(keyOf(slug, place)) || null : null;
    const prize = has(solution.prize_usd) ? Number(solution.prize_usd) : null;

    // A place on its own is a placement, not a payout: the row earns its place
    // here only when a prize amount or a settlement exists.
    if ((prize === null || prize <= 0) && !payout) return;

    rows.push({
      place: Number(place),
      slug: slug || '',
      title: (solution.competition && solution.competition.title) || slug || '',
      amount: prize !== null && prize > 0 ? solution.prize_usd : payout && payout.amount_usd,
      date: (payout && payout.paid_at) || solution.entered_at || '',
      explorer: payout && payout.explorer_url ? payout.explorer_url : '',
      settled: Boolean(payout),
    });
  });

  return rows.sort((a, b) => {
    const at = new Date(a.date || 0).getTime();
    const bt = new Date(b.date || 0).getTime();
    if (bt !== at) return bt - at;
    return a.place - b.place;
  });
}

function payoutsHtml(rows) {
  if (!rows.length) {
    return `
      <h2>Payouts</h2>
      <p class="muted">No payouts yet.</p>`;
  }

  const body = rows
    .map((row) => {
      const competition = row.slug
        ? `<a href="#/bounty/${fmt.esc(row.slug)}">${fmt.esc(row.title)}</a>`
        : fmt.esc(row.title);
      const amount = has(row.amount)
        ? row.explorer
          ? `<a href="${fmt.esc(row.explorer)}" target="_blank" rel="noopener">${usd(row.amount)}</a>`
          : usd(row.amount)
        : DOT;
      const date = row.date ? fmt.dateUtc(row.date) : '';
      const state = row.settled ? '' : ' <span class="muted">pending</span>';

      return `
        <div class="pay-row">
          <span style="display: inline-flex; align-items: baseline; gap: 12px; min-width: 0;">
            ${medal(row.place)}
            <span style="min-width: 0;">${competition}${state}</span>
          </span>
          <span style="display: inline-flex; align-items: baseline; gap: 12px; flex: 0 0 auto;">
            ${date ? `<span class="muted">${fmt.esc(date)}</span>` : ''}
            <span class="num" style="flex: 0 0 auto;">${amount}</span>
          </span>
        </div>`;
    })
    .join('');

  return `
    <h2>Payouts</h2>
    <div>${body}</div>
    <p class="muted">A prize amount links to its transfer where the payload carries one.</p>`;
}

function identityHtml(profile) {
  const links = [];
  const wallet = profile && profile.wallet;

  if (wallet && wallet.address) {
    const label = fmt.shortWallet(wallet.address) || wallet.address;
    links.push(wallet.explorer_url
      ? `<span class="chip">Wallet <a href="${fmt.esc(wallet.explorer_url)}" target="_blank" rel="noopener" title="${fmt.esc(wallet.address)}">${fmt.esc(label)}</a></span>`
      : `<span class="chip">Wallet <span title="${fmt.esc(wallet.address)}">${fmt.esc(label)}</span></span>`);
  }

  if (profile && profile.github_login) {
    const login = profile.github_login;
    links.push(`<span class="chip">GitHub <a href="https://github.com/${encodeURIComponent(login)}" target="_blank" rel="noopener">${fmt.esc(login)}</a></span>`);
  }

  if (profile && profile.discord) links.push(`<span class="chip">Discord ${fmt.esc(profile.discord)}</span>`);
  if (profile && profile.x) links.push(`<span class="chip">X ${fmt.esc(profile.x)}</span>`);

  if (!links.length) return '';
  return `<div class="chip-row" style="margin: 8px 0 0;">${links.join('')}</div>`;
}

export async function renderProfile(container, handle) {
  container.innerHTML = skeletonHtml();

  let profile;
  try {
    profile = await getProfile(handle);
  } catch (e) {
    container.innerHTML = `
      <div class="error-box">
        <h1>Profile not found</h1>
        <p>The user @${fmt.esc(handle)} does not exist or could not be loaded.</p>
        <a class="btn-ghost" href="#/">Back to the board</a>
      </div>`;
    return;
  }

  const record = (profile && profile.record) || {};
  const solutions = Array.isArray(profile && profile.solutions) ? profile.solutions : [];
  const name = profile.display_name || profile.handle || handle;
  const initial = String(profile.handle || handle || '?').slice(0, 1).toUpperCase();
  const image = profile.image || (profile.avatar && profile.avatar.url) || '';

  const avatar = `
    <span style="position: relative; flex: 0 0 auto; width: 72px; height: 72px;">
      <span class="avatar" aria-hidden="true" style="position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;">${fmt.esc(initial)}</span>
      ${image ? `<img class="avatar" src="${fmt.esc(absolute(image))}" alt="" crossorigin="anonymous" style="position: absolute; inset: 0; width: 100%; height: 100%;">` : ''}
    </span>`;

  container.innerHTML = `
    <div class="profile-head">
      ${avatar}
      <div style="flex: 1 1 260px; min-width: 0;">
        <h1>${fmt.esc(name)}</h1>
        <p class="muted" style="margin: 0 0 4px;">@${fmt.esc(profile.handle || handle)}</p>
        ${profile.joined_at ? `<p class="muted" style="margin: 0 0 4px;">Joined ${fmt.esc(fmt.dateUtc(profile.joined_at))}</p>` : ''}
        ${profile.bio ? `<p style="margin: 0 0 4px;">${fmt.esc(profile.bio)}</p>` : ''}
        ${identityHtml(profile)}
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat"><b>${num(record.competitions_entered)}</b><span>Entered</span></div>
      <div class="stat"><b>${num(record.competitions_placed)}</b><span>Placed</span></div>
      <div class="stat"><b>${num(record.competitions_won)}</b><span>Won</span></div>
      <div class="stat"><b>${num(record.podium_finishes)}</b><span>Podiums</span></div>
      <div class="stat"><b>${has(record.best_placement) ? `#${fmt.esc(record.best_placement)}` : DOT}</b><span>Best</span></div>
      <div class="stat"><b>${usd(record.prize_usd || 0)}</b><span>Prizes</span></div>
    </div>

    <h2>Solutions</h2>
    ${solutions.length
      ? `<div class="tablewrap">
        <table>
          <thead><tr><th>Entry</th><th>Competition</th><th>Placement</th><th class="num">Prize</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${solutions.map((solution) => `
              <tr>
                <td>${fmt.esc(solution.title || '') || DOT}</td>
                <td>${solution.competition && solution.competition.slug ? `<a href="#/bounty/${fmt.esc(solution.competition.slug)}">${fmt.esc(solution.competition.title || solution.competition.slug)}</a>` : fmt.esc((solution.competition && solution.competition.title) || '') || DOT}</td>
                <td>${has(solution.placement) ? medal(solution.placement) : DOT}</td>
                <td class="num">${has(solution.prize_usd) && num(solution.prize_usd) > 0 ? usd(solution.prize_usd) : DOT}</td>
                <td class="num">${scoreText(solution.score)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`
      : '<div class="empty">No entries yet</div>'}

    ${payoutsHtml(payoutRows(profile))}`;

  const img = container.querySelector('img.avatar');
  if (img) img.addEventListener('error', () => img.remove());
}
