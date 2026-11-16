import { getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

const medal = (rank) => {
  const classes = { 1: 'gold', 2: 'silver', 3: 'bronze' };
  return classes[rank] ? `<span class="rank-medal ${classes[rank]}">${rank}</span>` : fmt.esc(rank || '-');
};

const skeleton = () => `<div class="skeleton">${Array.from({ length: 7 }, () => '<div class="skel-line"></div>').join('')}</div>`;

export async function renderLeaderboard(container, slug) {
  container.innerHTML = skeleton();
  const lb = await getLeaderboard(slug);
  const entries = Array.isArray(lb && lb.entries) ? lb.entries : [];
  let page = 1;
  const pageSize = 50;

  container.innerHTML = `
    <h1>${fmt.esc(lb?.competition?.title || slug)} Leaderboard</h1>
    <p class="muted">Phase: ${fmt.esc(lb?.phase?.title || '-')}</p>
    <div class="toolbar"><input class="search-input" type="search" placeholder="Search handle or entry" aria-label="Search leaderboard"></div>
    <div id="leaderboard-region"></div>`;

  const search = container.querySelector('.search-input');
  const region = container.querySelector('#leaderboard-region');
  const renderRegion = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = entries.filter((entry) => `${entry?.handle || ''} ${entry?.title || ''}`.toLowerCase().includes(query));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages);
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    const withheld = Boolean(lb?.metrics_withheld);
    region.innerHTML = `${withheld ? '<p class="empty">Scores are withheld for this phase. Ranking metrics will be available when the phase allows publication.</p>' : ''}
      ${!filtered.length ? '<div class="empty">No entries match that search.</div>' : `<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Entrant</th><th>Entry</th><th>Judge</th><th>Interval</th><th>Valid</th><th>Size</th></tr></thead><tbody>${rows.map((entry) => {
        const values = entry?.values || {};
        const rank = Number(entry?.rank);
        const interval = !withheld && values.judge_low !== undefined && values.judge_high !== undefined ? `${fmt.rate(values.judge_low)}-${fmt.rate(values.judge_high)}` : '-';
        const size = values.bytes ? `${(Number(values.bytes) / 1024).toFixed(1)} KB` : '-';
        return `<tr><td>${medal(rank)}</td><td><a href="#/u/${fmt.esc(entry?.handle)}">${fmt.esc(entry?.handle || '-')}</a></td><td>${fmt.esc(entry?.title || '-')}</td><td>${!withheld && values.judge ? fmt.rate(values.judge) : '-'}</td><td>${interval}</td><td>${withheld ? '-' : entry?.valid ? 'yes' : 'no'}</td><td>${size}</td></tr>`;
      }).join('')}</tbody></table></div>`}
      ${totalPages > 1 ? `<div class="pager"><button class="btn-ghost" data-prev ${page === 1 ? 'disabled' : ''}>Prev</button><span>Page ${page} of ${totalPages}</span><button class="btn-ghost" data-next ${page === totalPages ? 'disabled' : ''}>Next</button></div>` : ''}`;
    region.querySelector('[data-prev]')?.addEventListener('click', () => { page -= 1; renderRegion(); });
    region.querySelector('[data-next]')?.addEventListener('click', () => { page += 1; renderRegion(); });
  };
  search.addEventListener('input', () => { page = 1; renderRegion(); });
  renderRegion();
}
