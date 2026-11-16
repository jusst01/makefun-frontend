import { getLeaderboard } from '../api.js';
import * as fmt from '../format.js';

export async function renderLeaderboard(container, slug) {
  const lb = await getLeaderboard(slug);

  let page = 1;
  const pageSize = 50;

  const render = () => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = lb.entries.slice(start, end);

    container.innerHTML = `
      <h1>${fmt.esc(lb.competition)} Leaderboard</h1>
      <p>Phase: ${fmt.esc(lb.phase)}</p>

      <table>
        <thead>
          <tr>
            ${lb.columns.map(c => `<th>${fmt.esc(c.title)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${paginated.map(e => `
            <tr>
              <td>${e.rank}</td>
              <td><a href="#/u/${fmt.esc(e.handle)}">${fmt.esc(e.handle)}</a></td>
              <td>${fmt.esc(e.title)}</td>
              <td>${e.values?.judge ? fmt.rate(e.values.judge) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div>
        <button id="prev" ${page === 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${page}</span>
        <button id="next" ${end >= lb.entries.length ? 'disabled' : ''}>Next</button>
      </div>
    `;

    document.getElementById('prev').addEventListener('click', () => { page--; render(); });
    document.getElementById('next').addEventListener('click', () => { page++; render(); });
  };

  render();
}
