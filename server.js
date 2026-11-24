'use strict';

const express = require('express');
const os = require('os');
const path = require('path');
const { GAMES, GENRES, GENRE_BY_ID, poster, poster2 } = require('./games');

const PORT = Number(process.env.PORT) || 3000;
const API = 'https://www.cheapshark.com/api/1.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // we sit behind nginx / the load balancer

// Every response says which server answered (shows load balancing) + basic security headers.
app.use((req, res, next) => {
  res.set({
    'X-Served-By': os.hostname(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:",
  });
  next();
});

// ---- rate limit: 60 requests per minute per IP ---------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
function limit(req, res, next) {
  const n = (hits.get(req.ip) || 0) + 1;
  hits.set(req.ip, n);
  if (n > 60) return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
  next();
}

// ---- fetch from CheapShark with a 5-minute cache and clear errors --------
const cache = new Map();
const fail = (status, message) => Object.assign(new Error(message), { status });

async function get(url) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;

  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'GameDealRadar/1.0 (student project)', Accept: 'application/json' },
    });
  } catch {
    throw fail(504, 'The deals service is unreachable or timed out.');
  }
  if (!res.ok) {
    console.error(`CheapShark ${res.status} for ${url}\n${await res.text().catch(() => '')}`);
    throw fail(502, `The deals service returned an error (${res.status}).`);
  }

  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) throw fail(502, 'The deals service returned an unexpected response.');

  if (cache.size > 500) cache.clear();
  cache.set(url, { data, expires: Date.now() + 5 * 60 * 1000 });
  return data;
}

// Turn a CheapShark deal into the small object the frontend needs.
const toDeal = (d) => ({
  id: d.dealID,
  title: d.title,
  store: d.storeID,
  price: parseFloat(d.salePrice),
  normal: parseFloat(d.normalPrice),
  savings: Math.round(d.savings) || 0,
  rating: Number(d.steamRatingPercent) || 0,
  genre: GENRE_BY_ID[d.steamAppID] || 'Other',
  poster: d.steamAppID ? poster(d.steamAppID) : d.thumb,
  poster2: d.steamAppID ? poster2(d.steamAppID) : '',
  link: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
});

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// ---- routes ---------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok', server: os.hostname() }));

app.get('/api/games', (req, res) => res.json({ games: GAMES, genres: GENRES }));

app.get('/api/stores', limit, wrap(async (req, res) => {
  const stores = await get(`${API}/stores`);
  res.json({
    stores: stores.filter((s) => Number(s.isActive) === 1).map((s) => ({ id: String(s.storeID), name: s.storeName })),
  });
}));

app.get('/api/deals', limit, wrap(async (req, res) => {
  const title = String(req.query.title || '').trim();
  const store = String(req.query.store || '');
  const genre = String(req.query.genre || '');
  const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : 60;
  const onSale = req.query.onSale !== '0';

  const problem =
    title.length > 80 ? 'Search text is too long (max 80 characters).'
    : !/^\d{0,3}$/.test(store) ? 'Invalid store.'
    : genre && !GENRES.includes(genre) ? 'Unknown genre.'
    : !(maxPrice >= 0 && maxPrice <= 200) ? 'Max price must be between 0 and 200.'
    : null;
  if (problem) return res.status(400).json({ error: problem });

  let raw;
  if (genre && !title) {
    // Genre browsing: cheapest current deal for each famous game in that genre.
    const ids = GAMES.filter((g) => g.genre === genre).map((g) => g.id);
    raw = (await Promise.all(ids.map(async (id) => (await get(`${API}/deals?steamAppID=${id}&sortBy=Price`)).slice(0, 1)))).flat();
  } else {
    const params = new URLSearchParams({ upperPrice: maxPrice, onSale: onSale ? 1 : 0 });
    if (title) params.set('title', title);
    if (store) params.set('storeID', store);
    raw = await get(`${API}/deals?${params}`);
  }

  const deals = raw
    .map(toDeal)
    .filter((d) => Number.isFinite(d.price) && Number.isFinite(d.normal))
    .filter((d) => d.price <= maxPrice && (!onSale || d.savings > 0))
    .filter((d) => !store || d.store === store)
    .filter((d) => !genre || d.genre === genre);
  res.json({ deals });
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Game Deal Radar on :${PORT} (${os.hostname()})`));
}

module.exports = app;
