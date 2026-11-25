# 🎮 Game Deal Radar

A web app that finds the **cheapest PC game deals** across Steam, Epic, GOG and other stores. Browse famous games by **genre** (with posters), search any title, filter by store, price and discount, sort the results, and keep a ★ wishlist.

**Why it's useful:** games are expensive, especially for students. Prices for the same game differ a lot between stores and change daily. This app puts the current prices side by side so you can buy at the lowest price and skip the full-price listings.

| | |
|---|---|
| 🎥 Demo video (≤ 2 min) | `ADD_VIDEO_LINK` |
| 🌐 Load balancer URL | http://18.170.221.244 |
| Web01 / Web02 | http://18.132.43.17 / http://35.178.171.98 |
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
Browser ──> Lb01 (HAProxy, round-robin) ──┬─> Web01 (nginx :80 -> Node :3000)
                                        └─> Web02 (nginx :80 -> Node :3000)
                                                    │
                                           CheapShark API (server side)
```

## Run locally

Requires Node.js 18+.

```bash
git clone https://github.com/bbugingo-blip/game-deal-radar.git
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
sudo git clone https://github.com/bbugingo-blip/game-deal-radar.git /var/www/game-deal-radar
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

Lb01 (`7257-lb-01`, 18.170.221.244) runs **HAProxy**, which balances traffic across both web servers. The relevant part of `/etc/haproxy/haproxy.cfg` is saved in `deploy/haproxy.cfg`:

```
frontend http-in
    bind *:80
    mode http
    default_backend web_servers

backend web_servers
    mode http
    balance roundrobin
    server 7257-web-01 18.132.43.17:80 check
    server 7257-web-02 35.178.171.98:80 check
```

- `balance roundrobin` sends requests to the two servers in turn.
- `check` makes HAProxy health-check each server and stop sending traffic to one that is down.

To apply or change the configuration:

```bash
ssh ubuntu@18.170.221.244
sudo nano /etc/haproxy/haproxy.cfg            # edit the frontend/backend sections
sudo haproxy -c -f /etc/haproxy/haproxy.cfg   # check the syntax
sudo systemctl reload haproxy
```

Every response includes an `X-Served-By` header with the web server's hostname, which shows which server handled the request.

### Testing the load balancer

```bash
# Alternates between the two hostnames
for i in 1 2 3 4 5 6; do curl -s http://18.170.221.244/health; echo; done

# Header view
curl -sI http://18.170.221.244/ | grep -i x-served-by

# Failover: stop one backend, requests keep working, then restore
ssh ubuntu@18.132.43.17 'sudo systemctl stop game-deal-radar'
for i in 1 2 3 4; do curl -s http://18.170.221.244/health; echo; done   # only Web02
ssh ubuntu@18.132.43.17 'sudo systemctl start game-deal-radar'
```

Result observed, running `curl -s 127.0.0.1/health` six times on Lb01: the responses alternate between the two servers.

```
{"status":"ok","server":"7257-web-01"}
{"status":"ok","server":"7257-web-02"}
{"status":"ok","server":"7257-web-01"}
{"status":"ok","server":"7257-web-02"}
{"status":"ok","server":"7257-web-01"}
{"status":"ok","server":"7257-web-02"}
```

## APIs and credits

- **Posters:** Steam store header images (artwork belongs to each game's publisher).
- **[CheapShark API](https://apidocs.cheapshark.com/)**: game deals and store list. Free, no key. Deal data and links by [CheapShark](https://www.cheapshark.com/).
- [Express](https://expressjs.com/) (MIT): web server.
- [nginx](https://nginx.org/): reverse proxy on each web server.
- [HAProxy](https://www.haproxy.org/): load balancer on Lb01.

## Security

- CheapShark needs no key, so there are no secrets in the repo. `.gitignore` excludes `.env` and `node_modules`; `.env.example` shows the pattern if a keyed API is added later (a key would be read server-side only, never sent to the browser).
- All API calls go through the Node server (the browser never contacts the third party directly).
- Input validation on every endpoint, per-IP rate limit (60/min), security headers including a Content-Security-Policy.
- The UI inserts data with `textContent` only (prevents XSS); outbound links use `rel="noopener noreferrer"`.

## Challenges and how I solved them

- **Deals service returned a 400 error.** My first version sent extra parameters to the CheapShark API, and it rejected the request. The app showed my red error message, which told me where the problem was. I simplified the request to only the parameters it needs and added a User-Agent header. I also made the server log CheapShark's reply so I can see the cause of future errors.
- **Genres were not available in the API.** CheapShark does not return game genres, so I created a small catalog of famous games (`games.js`) with a genre for each one. It powers the genre filter and the poster strip.
- **Posters not always loading.** Images come from Steam's servers, so some can fail to load. Each poster now tries a backup image address, then falls back to a plain tile with the game name.
- **Wrong folder structure on GitHub.** When I first uploaded the files, `index.html`, `style.css` and `app.js` ended up outside the `public/` folder. The server serves its pages from `public/`, so the site would have shown nothing. I spotted it in the repo before deploying and moved the files.
- **SSH login to the servers failed.** I got "Permission denied (publickey)". Using `ssh -v`, I saw that my laptop was not offering the key registered on the intranet, because it had a non-default file name. Once I used `-i` with the correct key file, I could log in.
- **Practising on the wrong server.** My first deployment went to a sandbox environment that was not one of my assigned servers. I found the real servers (7257-web-01, 7257-web-02 and 7257-lb-01) on the intranet "My Servers" page and redid the deployment there.
- **Load balancer already running.** I wrote an nginx load balancer config, but Lb01 already had HAProxy on port 80. I read its configuration, confirmed it balanced between both web servers with health checks, and documented it (`deploy/haproxy.cfg`) instead of replacing it.
- **Testing the setup.** On web-02, `curl localhost` returned an odd message even though the app worked. Testing `127.0.0.1` directly showed that nginx was serving the app correctly. I proved the load balancer works by calling `/health` repeatedly and checking that the server name alternates between `7257-web-01` and `7257-web-02`.

**What I would improve with more time:** add HTTPS, a database or Redis cache shared by both servers, and automatic deployment with CI/CD.
## Project structure

```
server.js          Express API proxy, cache, rate limit, error handling
games.js           Famous games catalog (Steam id, title, genre) used for genres and posters
public/            Frontend (HTML, CSS, vanilla JS)
deploy/            systemd unit, nginx config (web servers), HAProxy config (load balancer)
test/              Node test runner tests (CheapShark is mocked)
```
