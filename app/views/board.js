import { getBounties, everySecond, onMinuteTurn, patchRows } from '../api.js';
import * as fmt from '../format.js';

const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WIDE = '(min-width: 1100px)';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// A bounty is "live" when it carries a deadline that is still in the future.
function isOpen(bounty) {
  const at = bounty && bounty.deadline ? new Date(bounty.deadline).getTime() : NaN;
  return Number.isFinite(at) ? at > Date.now() : false;
}

function hoursLeft(bounty) {
  const at = bounty && bounty.deadline ? new Date(bounty.deadline).getTime() : NaN;
  return Number.isFinite(at) ? (at - Date.now()) / HOUR : Infinity;
}

const categoryOf = (bounty) => (bounty && bounty.category) || 'General';

const pad = (n) => String(n).padStart(2, '0');
const LEVELS = ['ended', 'urgent', 'soon', 'ok'];

// One clock for the whole app: the board ticks it every second and the bounty
// page reads the same function, so a bounty cannot read "3h 19m 04s left" in
// the list and "3h 19m left" in the pane beside it. Under 24 hours the seconds
// are the point; from a day out the minutes are noise, so they go.
export function clock(deadline, now = Date.now()) {
  const at = deadline ? new Date(deadline).getTime() : NaN;
  if (!Number.isFinite(at)) return { label: 'Ended', level: 'ended' };

  const diff = at - now;
  if (diff <= 0) return { label: 'Ended', level: 'ended' };

  const level = diff < 48 * HOUR ? 'urgent' : diff < 7 * DAY ? 'soon' : 'ok';
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  const minutes = Math.floor((diff % HOUR) / MINUTE);
  const seconds = Math.floor((diff % MINUTE) / 1000);

  if (days >= 1) return { label: `${days}d ${hours}h ${minutes}m left`, level };
  if (hours >= 1) return { label: `${hours}h ${pad(minutes)}m ${pad(seconds)}s left`, level };
  return { label: `${minutes}m ${pad(seconds)}s left`, level };
}

// A bounty's window opens when it is published; the detail payload also carries
// the phase's `opensAt`. Only fields that are really there are used: without one
// there is no window to measure, and no meter is drawn.
export function startOf(bounty) {
  if (!bounty) return null;
  return bounty.publishedAt || bounty.opensAt || bounty.startsAt || null;
}

// How far through its own window a bounty is, as a percentage. Null when the
// payload has no usable start, which is the view's signal to leave the meter
// out rather than draw it from a guess.
export function elapsedPct(startIso, deadlineIso, now = Date.now()) {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  const end = deadlineIso ? new Date(deadlineIso).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const share = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return Math.round(share * 1000) / 10;
}

// Everything on the page that moves on its own: countdown text, its urgency
// colour and the elapsed meters. The board subscribes this to the shared second
// tick, and each render calls it once so nothing sits blank for a second.
export function paintLive(root, now = Date.now()) {
  if (!root) return;

  root.querySelectorAll('[data-deadline]').forEach((element) => {
    if (element.classList.contains('elapsed')) return;
    const { label, level } = clock(element.dataset.deadline, now);
    if (element.textContent !== label) element.textContent = label;
    if (!element.classList.contains(level)) {
      LEVELS.forEach((name) => element.classList.remove(name));
      element.classList.add(level);
    }
  });

  root.querySelectorAll('.elapsed[data-deadline]').forEach((element) => {
    const fill = element.firstElementChild;
    if (!fill) return;
    const pct = elapsedPct(element.dataset.start, element.dataset.deadline, now);
    if (pct === null) return;
    const width = `${pct}%`;
    if (fill.style.width !== width) fill.style.width = width;
    const end = new Date(element.dataset.deadline).getTime();
    const hot = end - now > 0 && end - now <= DAY;
    if (element.classList.contains('hot') !== hot) element.classList.toggle('hot', hot);
  });
}

// The loading state: a stats strip of four blocks and six cards, so the page
// shows its shape before any data lands.
function skeletonHtml() {
  const stats = Array.from({ length: 4 }, () => '<div class="stat skeleton"></div>').join('');
  const cards = Array.from(
    { length: 6 },
    () => `
        <div class="skel-card">
          <div class="skel-line"></div>
          <div class="skel-line"></div>
          <div class="skel-line"></div>
        </div>`,
  ).join('');
  return `<div class="stats-strip">${stats}</div><div class="card-grid">${cards}</div>`;
}

// Four figures off the same payload the cards are built from, so the strip and
// the list can never disagree: the patch that moves a card moves the strip.
function statItems(bounties) {
  const open = bounties.filter(isOpen);
  const livePot = open.reduce((sum, b) => sum + num(b.potUsd), 0);
  const entries = open.reduce((sum, b) => sum + num(b.submissionCount), 0);
  const closing = open.filter((b) => hoursLeft(b) < 48).length;

  return [
    { label: 'Open now', value: String(open.length) },
    { label: 'Total live pot', value: fmt.money(livePot) },
    { label: 'Entries so far', value: String(entries) },
    { label: 'Closing in 48h', value: String(closing) },
  ];
}

function chipRow(name, label, chips) {
  const buttons = chips
    .map(
      (chip, index) => `<button type="button" class="chip" data-value="${fmt.esc(chip.value)}" aria-pressed="${index === 0}">${fmt.esc(chip.label)}</button>`,
    )
    .join('');
  return `<div class="chip-row" data-filter="${name}" role="group" aria-label="${fmt.esc(label)}">${buttons}</div>`;
}

const STATUS_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'soon', label: 'Closing soon' },
  { value: 'closed', label: 'Closed' },
];

const normalize = (data) => {
  const list = Array.isArray(data) ? data : Array.isArray(data && data.items) ? data.items : [];
  return list.filter((bounty) => bounty && bounty.slug);
};

// A card's markup leaves the countdown text empty: the second tick owns it, so
// a fresh card never flashes a stale time. Everything else here is a fact of the
// payload, which is what makes a minute-turn text comparison worth doing.
function cardInner(bounty) {
  const closed = !isOpen(bounty);
  const entries = num(bounty.submissionCount);
  const fee = bounty.entryFeeUsd ? fmt.money(bounty.entryFeeUsd) : 'Free';
  const start = startOf(bounty);
  const pct = elapsedPct(start, bounty.deadline);
  const clockSpan = bounty.deadline
    ? `<span class="time-left ended" data-deadline="${fmt.esc(bounty.deadline)}"></span>`
    : '<span class="time-left ended">Ended</span>';

  return `
        <div class="meta-row">
          <span class="tag">${fmt.esc(categoryOf(bounty))}</span>
          ${closed ? '<span class="tag">Ended</span>' : ''}
        </div>
        <h3><a href="#/bounty/${fmt.esc(bounty.slug)}">${fmt.esc(bounty.title) || 'Untitled bounty'}</a></h3>
        <strong class="pot">${fmt.money(num(bounty.potUsd))}</strong>
        <div class="meta-row">
          <span>Fee: ${fee}</span>
          ${clockSpan}
          <span>${entries} ${fmt.plural(entries, 'entry', 'entries')}</span>
        </div>
        ${pct === null ? '' : `<span class="elapsed" data-start="${fmt.esc(start)}" data-deadline="${fmt.esc(bounty.deadline)}"><i style="width:${pct}%"></i></span>`}`;
}

async function mountBoard(container, initialSlug, options = {}) {
  const wide = options.split === true ? true : typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;

  container.innerHTML = skeletonHtml();
  const data = await getBounties();
  let bounties = normalize(data);

  const categories = [...new Set(bounties.map(categoryOf))].sort((a, b) => a.localeCompare(b));
  const categoryChips = [
    { value: 'all', label: 'All' },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  container.innerHTML = `
    <h1>Bounty board</h1>
    <div class="stats-strip" id="board-stats"></div>
    <div class="toolbar">
      <input class="search-input" type="search" placeholder="Search title or category" aria-label="Search bounties">
      <select class="select" aria-label="Sort bounties">
        <option value="deadline">Ending soon</option>
        <option value="pot">Biggest pot</option>
        <option value="entries">Most entries</option>
      </select>
    </div>
    ${chipRow('status', 'Filter by status', STATUS_CHIPS)}
    ${chipRow('category', 'Filter by category', categoryChips)}
    <div class="split" id="board-root">
      <div class="pane-list">
        <div class="card-grid" id="bounty-grid" data-list-marker="board-grid"></div>
      </div>
      ${wide ? '<div class="pane-detail" id="bounty-detail" tabindex="-1"></div>' : ''}
    </div>`;

  const root = container.querySelector('#board-root');
  const grid = container.querySelector('#bounty-grid');
  const stats = container.querySelector('#board-stats');
  const detail = container.querySelector('#bounty-detail');
  const search = container.querySelector('.search-input');
  const sort = container.querySelector('.select');
  const statusRow = container.querySelector('[data-filter="status"]');
  const categoryRow = container.querySelector('[data-filter="category"]');

  let status = 'all';
  let category = 'all';
  let selected = wide ? initialSlug || null : null;
  let empty = false;

  function press(row, value) {
    row.querySelectorAll('button.chip').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.value === value));
    });
  }

  function matches(bounty) {
    const query = search.value.trim().toLowerCase();
    const text = `${(bounty && bounty.title) || ''} ${categoryOf(bounty)}`.toLowerCase();
    if (query && !text.includes(query)) return false;
    if (category !== 'all' && categoryOf(bounty) !== category) return false;

    const open = isOpen(bounty);
    if (status === 'open' && !open) return false;
    if (status === 'soon' && !(open && hoursLeft(bounty) < 48)) return false;
    if (status === 'closed' && open) return false;
    return true;
  }

  function order(rows) {
    const key = sort.value;
    if (key === 'pot') return rows.sort((a, b) => num(b.potUsd) - num(a.potUsd));
    if (key === 'entries') return rows.sort((a, b) => num(b.submissionCount) - num(a.submissionCount));
    // Live bounties first, soonest deadline first; ended ones fall to the end.
    return rows.sort((a, b) => (isOpen(a) === isOpen(b) ? hoursLeft(a) - hoursLeft(b) : isOpen(a) ? -1 : 1));
  }

  // What the current search, sort and chips leave on the board, in order: also
  // the pool a default selection picks from, so "first bounty" means the first
  // card the reader can actually see.
  const visible = () => order(bounties.filter(matches));

  // The strip is patched too: its numbers are the same payload's, and a minute
  // turn should move them in place rather than rebuild the row under the search.
  function patchStats() {
    patchRows(
      stats,
      statItems(bounties),
      (item) => item.label,
      () => {
        const block = document.createElement('div');
        block.className = 'stat';
        return block;
      },
      (block, item) => {
        const html = `<b>${fmt.esc(item.value)}</b><span>${fmt.esc(item.label)}</span>`;
        if (block.__html !== html) {
          block.innerHTML = html;
          block.__html = html;
        }
      },
    );
  }

  function makeCard() {
    const card = document.createElement('article');
    card.className = 'bounty-card';
    return card;
  }

  function fillCard(card, bounty) {
    const html = cardInner(bounty);
    if (card.__html !== html) {
      card.innerHTML = html;
      card.__html = html;
    }
    const isSelected = bounty.slug === selected;
    if (card.classList.contains('is-selected') !== isSelected) card.classList.toggle('is-selected', isSelected);
  }

  function highlight() {
    for (const card of grid.children) {
      const isSelected = card.dataset.key === selected;
      if (card.classList.contains('is-selected') !== isSelected) card.classList.toggle('is-selected', isSelected);
    }
  }

  function showEmpty(message, clearable) {
    const html = `<div class="empty">${message}${clearable ? ' <button type="button" class="btn-ghost" data-clear>Clear filters</button>' : ''}</div>`;
    if (grid.__html !== html) {
      grid.innerHTML = html;
      grid.__html = html;
    }
    empty = true;
  }

  // patchRows reuses a card by its slug, so a minute turn hands the same nodes
  // back for the bounties that are still there: a card whose own text did not
  // move is never rewritten, and the list keeps its scroll, focus and selection.
  function patchList() {
    if (!bounties.length) {
      showEmpty('The board has no bounties right now.');
      return;
    }

    const rows = visible();
    if (!rows.length) {
      showEmpty('No bounties match these filters.', true);
      return;
    }

    if (empty) {
      grid.innerHTML = '';
      grid.__html = '';
      empty = false;
    }
    patchRows(grid, rows, (bounty) => bounty.slug, makeCard, fillCard);
    paintLive(grid);
  }

  function clearFilters() {
    search.value = '';
    status = 'all';
    category = 'all';
    press(statusRow, status);
    press(categoryRow, category);
    patchList();
  }

  // The detail pane is filled by the bounty view's own renderer, so the board
  // and the standalone bounty route cannot drift apart in how a bounty reads.
  async function renderDetail(slug) {
    if (!detail) return;
    const holder = document.createElement('div');
    detail.replaceChildren(holder);
    try {
      const { renderBountyDetail } = await import('./bounty.js');
      await renderBountyDetail(holder, slug);
    } catch (e) {
      holder.innerHTML = `
        <div class="error-box">
          <h2>Could not open this bounty</h2>
          <p>${fmt.esc(e && e.message ? e.message : 'The API did not answer.')}</p>
          <button type="button" class="btn-primary" data-retry-detail>Try again</button>
        </div>`;
      const retry = holder.querySelector('[data-retry-detail]');
      if (retry) {
        retry.addEventListener('click', () => {
          if (selected === slug) renderDetail(slug);
        });
      }
    }
  }

  // Selecting replaces the pane's contents and nothing else: the list keeps its
  // nodes, and replaceState edits the URL without firing hashchange, so the
  // router never tears the board down underneath the click.
  function select(slug, paneMayKeepFocus) {
    if (!detail || !slug) return;
    const hadFocus = detail.contains(document.activeElement);
    selected = slug;
    highlight();
    renderDetail(slug);
    const target = `#/bounty/${slug}`;
    if (location.hash !== target) history.replaceState(null, '', target);
    // A click on a card must not throw the reader into the pane; a keyboard
    // move to the next bounty must not drop them out of it either.
    if (!paneMayKeepFocus && hadFocus) detail.focus({ preventScroll: true });
  }

  // One delegated listener for the grid, so a patch never has to rebind cards.
  // A click with a modifier (or a middle click) belongs to the browser, so those
  // keep the plain link and open the bounty route in a new tab.
  grid.addEventListener('click', (event) => {
    const clear = event.target.closest('[data-clear]');
    if (clear) {
      clearFilters();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#/bounty/"]');
    if (!link || !wide) return;
    const slug = link.getAttribute('href').replace('#/bounty/', '');
    if (!slug) return;
    event.preventDefault();
    select(slug, false);
  });

  search.addEventListener('input', patchList);
  sort.addEventListener('change', patchList);

  statusRow.addEventListener('click', (event) => {
    const button = event.target.closest('button.chip');
    if (!button) return;
    status = button.dataset.value;
    press(statusRow, status);
    patchList();
  });

  categoryRow.addEventListener('click', (event) => {
    const button = event.target.closest('button.chip');
    if (!button) return;
    category = button.dataset.value;
    press(categoryRow, category);
    patchList();
  });

  patchStats();
  if (wide && (!selected || !bounties.some((bounty) => bounty.slug === selected))) {
    const rows = visible();
    selected = rows.length ? rows[0].slug : null;
  }
  patchList();
  if (selected) await renderDetail(selected);

  // The one subscription behind every countdown and meter on the page. It gives
  // itself up when the router has replaced this view.
  const stopTick = everySecond(() => {
    if (!root.isConnected) {
      stopTick();
      return;
    }
    paintLive(root);
  });

  // A failed refresh keeps the board it already has: live figures are better
  // than an error box over a list that is still perfectly readable.
  const stopTurn = onMinuteTurn(async () => {
    // The router has replaced this view: stop the minute turn rather than let it
    // wake up every minute for the rest of the session.
    if (!root.isConnected) {
      stopTurn();
      return;
    }
    let fresh;
    try {
      fresh = normalize(await getBounties());
    } catch (e) {
      return;
    }
    bounties = fresh;

    // The selection is resolved against the new data before the list is
    // patched, so the first card after the patch is the selected one.
    if (detail && selected && !bounties.some((bounty) => bounty.slug === selected)) {
      const rows = visible();
      selected = rows.length ? rows[0].slug : null;
    }

    patchStats();
    patchList();

    if (!detail) return;
    if (selected) {
      renderDetail(selected);
      const target = `#/bounty/${selected}`;
      if (location.hash !== target) history.replaceState(null, '', target);
    } else {
      detail.replaceChildren();
    }
  });

  const stop = () => {
    stopTick();
    stopTurn();
  };

  // The split is a wide-screen layout; crossing that line rebuilds the board
  // around the bounty the reader was looking at. Crossing the other way while
  // the URL names a bounty means the split no longer applies, so the board steps
  // aside and the bounty renders the standalone page it has at that width.
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null;
  const onModeChange = () => {
    if (!root.isConnected) return;
    const here = (location.hash || '').match(/^#\/bounty\/([^/]+)$/);
    stop();
    if (media && media.removeEventListener) media.removeEventListener('change', onModeChange);

    if (media && !media.matches && here) {
      import('./bounty.js')
        .then(({ renderBounty }) => renderBounty(container, decodeURIComponent(here[1])))
        .catch(() => mountBoard(container, null));
      return;
    }

    // `selected` is the reader's place in the list; the hash is where they are.
    // On a wide screen it can also name a bounty the list did not select, so the
    // URL wins when the two disagree.
    const wanted = selected || (here ? decodeURIComponent(here[1]) : null);
    mountBoard(container, media.matches ? wanted : null, { split: media.matches }).catch((e) => {
      container.innerHTML = `
        <div class="error-box">
          <h1>Something went wrong</h1>
          <p>${fmt.esc(e && e.message ? e.message : 'An unexpected error occurred.')}</p>
          <button type="button" class="btn-primary" data-reload>Reload the board</button>
        </div>`;
      const reload = container.querySelector('[data-reload]');
      if (reload) reload.addEventListener('click', () => renderBoard(container));
    });
  };
  if (media && media.addEventListener) media.addEventListener('change', onModeChange);

  return stop;
}

// The board on its own route. The hash is left to the router: `#/` means the
// board with its default selection, and a bounty hash is handed to the bounty
// view, which mounts this same board around that bounty.
export async function renderBoard(container) {
  await mountBoard(container, null);
}

// The board wearing a bounty route's URL. On a wide screen the list stays
// mounted beside the selected bounty's detail; anywhere narrower it declines,
// and the bounty renders the standalone page it has always had.
export async function renderBoardSplit(container, slug) {
  if (typeof window.matchMedia !== 'function' || !window.matchMedia(WIDE).matches) return false;
  try {
    await mountBoard(container, slug, { split: true });
  } catch (e) {
    return false;
  }
  return true;
}
