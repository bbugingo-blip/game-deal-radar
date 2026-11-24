'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

// Fake CheapShark: calls to our own server go through, everything else is mocked.
const realFetch = global.fetch;
let mode = 'ok';
let upstreamCalls = 0;

async function fakeUpstream(url) {
  upstreamCalls++;
  if (mode === 'down') throw new TypeError('network down');
  if (mode === '500') return { ok: false, status: 500 };
  if (mode === 'badjson') return { ok: true, json: async () => { throw new Error('bad json'); } };
  const body = url.includes('/stores')
    ? [{ storeID: '1', storeName: 'Steam', isActive: 1 }, { storeID: '9', storeName: 'Old', isActive: 0 }]
    : [
        { dealID: 'a b', title: 'Test Game', storeID: '1', salePrice: '4.99', normalPrice: '19.99', savings: '75.03', steamRatingPercent: '90', steamAppID: '292030' },
        { dealID: 'bad', title: 'No price', storeID: '1', salePrice: 'x', normalPrice: 'y' },
      ];
  return { ok: true, json: async () => body };
}
global.fetch = (url, opts) => (String(url).startsWith('http://127.0.0.1') ? realFetch(url, opts) : fakeUpstream(String(url)));

const app = require('../server');
let server;
let base;
const getJson = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, headers: res.headers, body: await res.json() };
};

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('health reports ok and names the server', async () => {
  const { status, headers } = await getJson('/health');
  assert.strictEqual(status, 200);
  assert.ok(headers.get('x-served-by'));
  assert.ok(headers.get('content-security-policy'));
});

test('games endpoint lists famous games and genres', async () => {
  const { body } = await getJson('/api/games');
  assert.ok(body.games.length > 20);
  assert.ok(body.genres.includes('RPG'));
  assert.ok(body.games[0].poster.startsWith('https://'));
});

test('invalid input is rejected with 400', async () => {
  for (const q of [`title=${'a'.repeat(81)}`, 'store=abc', 'maxPrice=-5', 'maxPrice=999', 'genre=Nope']) {
    assert.strictEqual((await getJson(`/api/deals?${q}`)).status, 400, q);
  }
});

test('stores: only active stores are returned', async () => {
  const { body } = await getJson('/api/stores');
  assert.deepStrictEqual(body.stores, [{ id: '1', name: 'Steam' }]);
});

test('deals: cleaned up, genre and poster added, bad rows dropped, link encoded', async () => {
  const { body } = await getJson('/api/deals?title=test');
  assert.strictEqual(body.deals.length, 1);
  const d = body.deals[0];
  assert.strictEqual(d.genre, 'RPG');
  assert.strictEqual(d.savings, 75);
  assert.ok(d.poster.includes('/292030/'));
  assert.ok(d.link.endsWith('a%20b'));
});

test('deals are cached', async () => {
  await getJson('/api/deals?title=cache-me');
  const before = upstreamCalls;
  await getJson('/api/deals?title=cache-me');
  assert.strictEqual(upstreamCalls, before);
});

test('genre filter: browsing a genre and filtering a title search', async () => {
  const browse = await getJson('/api/deals?genre=RPG');
  assert.ok(browse.body.deals.length > 0);
  assert.ok(browse.body.deals.every((d) => d.genre === 'RPG'));
  const none = await getJson('/api/deals?title=other&genre=Racing');
  assert.deepStrictEqual(none.body.deals, []);
});

test('upstream failures give clear errors', async () => {
  mode = 'down';
  assert.strictEqual((await getJson('/api/deals?title=down')).status, 504);
  mode = '500';
  assert.strictEqual((await getJson('/api/deals?title=err')).status, 502);
  mode = 'badjson';
  assert.strictEqual((await getJson('/api/deals?title=bad')).status, 502);
  mode = 'ok';
});

test('unknown API route returns a JSON 404', async () => {
  const { status, body } = await getJson('/api/nope');
  assert.strictEqual(status, 404);
  assert.ok(body.error);
});
