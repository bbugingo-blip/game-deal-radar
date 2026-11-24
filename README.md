# 🎮 Game Deal Radar

A web app that finds the **cheapest PC game deals** across Steam, Epic, GOG and other stores. Browse famous games by **genre** (with posters), search any title, filter by store, price and discount, sort the results, and keep a ★ wishlist.

**Why it's useful:** games are expensive, especially for students. Prices for the same game differ a lot between stores and change daily. This app puts the current prices side by side so you can buy at the lowest price and skip the full-price listings.

| | |
|---|---|
| 🎥 Demo video (≤ 2 min) | `ADD_VIDEO_LINK` |
| 🌐 Load balancer URL | `http://LB01_IP` |
| Web01 / Web02 | `http://WEB01_IP` / `http://WEB02_IP` |
| Login / API keys needed | **None.** No accounts and no API key (see [Security](#security)) |

## Features

- **Genre browsing:** pick a genre (Action, RPG, Shooter, Strategy, Simulation, Racing, Horror, Fighting, Sports, Indie) to see the cheapest current deal for famous games in it
- **Poster strip** of famous games for the chosen genre. Click a poster to search that game's deals
- Title search, store filter, max-price filter, "only discounted" toggle
- **Filter** by minimum discount; **sort** by best deal, price, discount, Steam rating or title
- Summary line: number of deals, cheapest price, biggest discount
- ★ **Wishlist** saved in the browser (localStorage), with a "wishlist only" view
- "Get deal" opens the store page through CheapShark's redirect
- Error handling with clear messages: invalid input (400), too many requests (429), deals service down or timed out (504), bad response (502), lost connection, no results
- Server-side proxy with a 5-minute cache; `X-Served-By` header and `/health` endpoint for load-balancer testing

## Architecture

```
Browser ──> Lb01 (nginx, round-robin) ──┬─> Web01 (nginx :80 -> Node :3000)
                                        └─> Web02 (nginx :80 -> Node :3000)
                                                    │
                                           CheapShark API (server side)
```

## Run locally

Requires Node.js 18+.

```bash
git clone https://github.com/YOUR_USER/game-deal-radar.git
cd game-deal-radar
npm install
npm start            # http://localhost:3000
npm test             # 9 tests: validation, genres, caching, upstream failures
```

Optional: `cp .env.example .env` to change `PORT`.

## Deployment

Repeat on **both Web01 and Web02** (Ubuntu assumed; adjust the `User=` and path in `deploy/game-deal-radar.service` if different).

```bash
# 1. Install Node.js and nginx
sudo apt update && sudo apt install -y nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 2. Get the code
sudo git clone https://github.com/YOUR_USER/game-deal-radar.git /var/www/game-deal-radar
cd /var/www/game-deal-radar && sudo npm install --omit=dev

# 3. Run as a service (auto-restart, starts on boot)
sudo cp deploy/game-deal-radar.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now game-deal-radar
curl localhost:3000/health            # -> {"status":"ok","server":"web-01"}

# 4. nginx reverse proxy on port 80
sudo cp deploy/nginx-webserver.conf /etc/nginx/sites-available/game-deal-radar
sudo ln -sf /etc/nginx/sites-available/game-deal-radar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Load balancer (Lb01)

```bash
sudo apt update && sudo apt install -y nginx
sudo cp deploy/nginx-loadbalancer.conf /etc/nginx/sites-available/game-deal-radar-lb
# edit the file: replace WEB01_IP and WEB02_IP
sudo ln -sf /etc/nginx/sites-available/game-deal-radar-lb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Configuration notes: nginx's default **round-robin** alternates requests between the two upstreams. `max_fails=3 fail_timeout=10s` takes a dead server out of rotation briefly, `proxy_next_upstream` retries a failed request on the other server, and the `X-Upstream` header shows which backend answered.

### Testing the load balancer

```bash
# Alternates between the two hostnames
for i in 1 2 3 4 5 6; do curl -s http://LB01_IP/health; echo; done

# Header view
curl -sI http://LB01_IP/ | grep -Ei 'x-served-by|x-upstream'

# Failover: stop one backend, requests keep working, then restore
ssh WEB01 'sudo systemctl stop game-deal-radar'
for i in 1 2 3 4; do curl -s http://LB01_IP/health; echo; done   # only Web02
ssh WEB01 'sudo systemctl start game-deal-radar'
```

Result observed: _ADD YOUR OBSERVATIONS / SCREENSHOT HERE_.

## APIs and credits

- **Posters:** Steam store header images (artwork belongs to each game's publisher).
- **[CheapShark API](https://apidocs.cheapshark.com/)**: game deals and store list. Free, no key. Deal data and links by [CheapShark](https://www.cheapshark.com/).
- [Express](https://expressjs.com/) (MIT): web server.
- [nginx](https://nginx.org/): reverse proxy and load balancer.

## Security

- CheapShark needs no key, so there are no secrets in the repo. `.gitignore` excludes `.env` and `node_modules`; `.env.example` shows the pattern if a keyed API is added later (a key would be read server-side only, never sent to the browser).
- All API calls go through the Node server (the browser never contacts the third party directly).
- Input validation on every endpoint, per-IP rate limit (60/min), security headers including a Content-Security-Policy.
- The UI inserts data with `textContent` only (prevents XSS); outbound links use `rel="noopener noreferrer"`.

## Challenges and how I solved them

- _Fill in with your own experience, e.g.:_ showing which server handled a request → added the `X-Served-By` header; avoiding repeated upstream calls → added a TTL cache; handling a slow or down API → 8 s timeout with separate 504/502 messages; keeping the wishlist after a new search → store the whole deal in localStorage.

## Project structure

```
server.js          Express API proxy, cache, rate limit, error handling
games.js           Famous games catalog (Steam id, title, genre) used for genres and posters
public/            Frontend (HTML, CSS, vanilla JS)
deploy/            systemd unit and nginx configs (web servers + load balancer)
test/              Node test runner tests (CheapShark is mocked)
```
