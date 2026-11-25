'use strict';

const $ = (id) => document.getElementById(id);

// Tiny helper to build DOM elements. Using properties (not innerHTML) keeps it XSS-safe.
function h(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

let deals = [];
let games = [];
let stores = {}; // store id -> name
let wishlist = {};
try {
  wishlist = JSON.parse(localStorage.getItem('wishlist')) || {};
} catch {
  /* storage unavailable: the wishlist just won't persist */
}
const saveWishlist = () => {
  try {
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
  } catch {
    /* ignore */
  }
};

function say(message, isError = false) {
  $('status').textContent = message;
  $('status').className = isError ? 'error' : '';
}

async function api(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status}).`);
  if (!body) throw new Error('The server returned an invalid response.');
  return body;
}

// ---- showing the deals -------------------------------------------------------
const sorts = {
  deal: () => 0, // keep the order the API gave us
  priceAsc: (a, b) => a.price - b.price,
  priceDesc: (a, b) => b.price - a.price,
  savings: (a, b) => b.savings - a.savings,
  rating: (a, b) => b.rating - a.rating,
  title: (a, b) => a.title.localeCompare(b.title),
};

// Poster image: try the main address, then the backup, then show a plain placeholder.
function posterImg(src, backup) {
  const img = h('img', { src, alt: '', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', () => {
    if (backup && img.src !== backup) img.src = backup;
    else img.classList.add('missing');
  });
  return img;
}

function card(d) {
  const poster = posterImg(d.poster, d.poster2);

  const star = h('button', { type: 'button', className: 'star', textContent: wishlist[d.id] ? '★' : '☆' });
  star.setAttribute('aria-label', `Toggle wishlist for ${d.title}`);
  star.addEventListener('click', () => {
    if (wishlist[d.id]) delete wishlist[d.id];
    else wishlist[d.id] = d;
    saveWishlist();
    render();
  });

  const meta = [stores[d.store], d.genre, d.rating && `Steam ${d.rating}%`].filter(Boolean).join(' · ');
  const price = h('div', { className: 'price' }, h('b', { textContent: `$${d.price.toFixed(2)}` }));
  if (d.savings > 0) {
    price.append(h('s', { textContent: `$${d.normal.toFixed(2)}` }), h('span', { className: 'badge', textContent: `-${d.savings}%` }));
  }
  const buy = h('a', { href: d.link, target: '_blank', rel: 'noopener noreferrer', textContent: 'Get deal' });

  return h('li', { className: 'card' }, poster,
    h('div', { className: 'body' }, h('h3', { textContent: d.title }), h('div', { className: 'meta', textContent: meta }), price,
      h('div', { className: 'actions' }, buy, star)));
}

function render() {
  const minDiscount = Number($('minDiscount').value);
  const source = $('wishOnly').checked ? Object.values(wishlist) : deals;
  const list = source.filter((d) => d.savings >= minDiscount).sort(sorts[$('sort').value]);

  $('wishCount').textContent = Object.keys(wishlist).length;
  $('summary').textContent = list.length
    ? `${list.length} deals · cheapest $${Math.min(...list.map((d) => d.price)).toFixed(2)} · biggest discount ${Math.max(...list.map((d) => d.savings))}%`
    : '';
  $('cards').replaceChildren(...(list.length
    ? list.map(card)
    : [h('li', { className: 'empty', textContent: 'No deals match. Try loosening the filters.' })]));
}

// ---- famous games poster strip -----------------------------------------------
function renderStrip() {
  const genre = $('genre').value;
  $('strip').replaceChildren(...games.filter((g) => !genre || g.genre === genre).map((g) => {
    const button = h('button', { type: 'button', title: `Find deals for ${g.title}` }, posterImg(g.poster, g.poster2), h('span', { textContent: g.title }));
    button.addEventListener('click', () => {
      $('title').value = g.title;
      search();
    });
    return button;
  }));
}

// ---- talking to the server ---------------------------------------------------
async function search() {
  const button = $('search-form').querySelector('button');
  const params = new URLSearchParams({
    title: $('title').value.trim(),
    genre: $('genre').value,
    store: $('store').value,
    maxPrice: $('maxPrice').value,
    onSale: $('onSale').checked ? 1 : 0,
  });
  button.disabled = true;
  say('Searching for deals…');
  try {
    deals = (await api(`/api/deals?${params}`)).deals;
    $('results').hidden = false;
    say(deals.length ? '' : 'No deals found. Try another title, a higher max price, or untick "Only discounted".');
    render();
  } catch (err) {
    $('results').hidden = true;
    say(err.message, true);
  } finally {
    button.disabled = false;
  }
}

function fillSelect(select, items) {
  select.append(...items.map(([value, label]) => h('option', { value, textContent: label })));
}

async function start() {
  try {
    const data = await api('/api/games');
    games = data.games;
    fillSelect($('genre'), data.genres.map((g) => [g, g]));
    renderStrip();
  } catch (err) {
    say(err.message, true);
    return;
  }
  try {
    const { stores: list } = await api('/api/stores');
    list.forEach((s) => (stores[s.id] = s.name));
    fillSelect($('store'), list.map((s) => [s.id, s.name]));
  } catch {
    /* not fatal: the store filter just stays on "All stores" */
  }
  search();
}

$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});
$('genre').addEventListener('change', () => {
  renderStrip();
  search();
});
['minDiscount', 'sort', 'wishOnly'].forEach((id) => $(id).addEventListener('change', render));

start();
