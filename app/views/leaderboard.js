import { getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

export async function renderLeaderboard(container, slug) {
  const lb = await getLeaderboard(slug);

  let page = 1;
  const pageSize = 50;

  const render = () => {
    const totalPages = Math.ceil(lb.entries.length / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = lb.entries.slice(start, end);

    container.innerHTML = `
      <h1>${fmt.esc((lb.competition && lb.competition.title) || slug)} Leaderboard</h1>
      <p>Phase: ${fmt.esc(lb.phase.title)}</p>
      ${lb.metrics_withheld ? '<p>Scores are withheld for this phase.</p>' : ''}

      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entrant</th>
              <th>Entry</th>
              <th>Judge</th>
              <th>Interval</th>
              <th>Valid</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${paginated.map(e => `
              <tr>
                <td>${e.rank || '-'}</td>
                <td><a href="#/u/${fmt.esc(e.handle)}">${fmt.esc(e.handle)}</a></td>
                <td>${fmt.esc(e.title)}</td>
                <td>${!lb.metrics_withheld && e.values?.judge ? fmt.rate(e.values.judge) : '-'}</td>
                <td>${!lb.metrics_withheld && e.values?.judge_low !== undefined ? fmt.rate(e.values.judge_low) + "-" + fmt.rate(e.values.judge_high) : '-'}</td>
                <td>${lb.metrics_withheld ? "-" : (e.valid ? "yes" : "no")}</td>
                <td>${e.values?.bytes ? (e.values.bytes / 1024).toFixed(1) + " KB" : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top: 1rem;">
        <button id="prev" ${page === 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${page} of ${totalPages}</span>
        <button id="next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    document.getElementById('prev').addEventListener('click', () => { page--; render(); });
    document.getElementById('next').addEventListener('click', () => { page++; render(); });
  };

  render();
}
