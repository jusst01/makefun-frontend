import { getBounties } from '../api.js';
import * as fmt from '../format.js';

export async function renderBoard(container) {
  const data = await getBounties();
  const bounties = data.items;

  container.innerHTML = `
    <h1>Bounties</h1>
    <input type="text" id="search" placeholder="Search bounties...">
    <select id="sort">
      <option value="deadline">Ending soon</option>
      <option value="pot">Biggest pot</option>
      <option value="entries">Most entries</option>
    </select>
    <div id="list"></div>
  `;

  const list = document.getElementById('list');
  const search = document.getElementById('search');
  const sort = document.getElementById('sort');

  const renderList = () => {
    let filtered = bounties.filter(b =>
      b.title.toLowerCase().includes(search.value.toLowerCase()) ||
      b.category.toLowerCase().includes(search.value.toLowerCase())
    );

    if (sort.value === 'deadline') filtered.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    else if (sort.value === 'pot') filtered.sort((a, b) => b.potUsd - a.potUsd);
    else if (sort.value === 'entries') filtered.sort((a, b) => b.submissionCount - a.submissionCount);

    list.innerHTML = filtered.map(b => `
      <div class="card">
        <a href="#/bounty/${fmt.esc(b.slug)}"><h3>${fmt.esc(b.title)}</h3></a>
        <p>Live pot: ${fmt.money(b.potUsd)}</p>
        <p>${fmt.timeLeft(b.deadline)}</p>
        <p>${b.submissionCount} ${fmt.plural(b.submissionCount, 'entry', 'entries')}</p>
        <p>Category: ${fmt.esc(b.category)}</p>
      </div>
    `).join('');
  };

  search.addEventListener('input', renderList);
  sort.addEventListener('change', renderList);
  renderList();
}
