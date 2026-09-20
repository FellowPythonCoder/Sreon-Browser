# Sreon Browser + Search

**Less noise. More discovery.**

The original Sreon Browser landing page now includes Sreon Search in its **Try the browser** demo. The separate search app lives at `/search/`. The secret page `o/index.html`, all existing game files, the verification HTML, and the browser download are preserved without content changes.

A lightweight, Sreon-branded search application in purple and cream, with a persistent dark mode. No ads, generated answers, analytics, external font requests, frontend framework, or production npm dependencies.

Sreon uses a self-hosted **SearXNG** backend to aggregate actual search results. It is a metasearch application, not an independent crawler or a proprietary web index. Search-provider branding is not displayed in the interface; result websites retain their real names and URLs so you know where links lead. The included backend configuration does not enable Google engines.

## Run on your computer — recommended

Works on Windows, macOS, and Linux.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it. On Linux, Docker Engine with the Compose plugin also works.
2. Download this repository using **Code → Download ZIP**, then extract it. Alternatively, clone the repository. Use the version containing `compose.yaml` and this README.
3. Open Terminal, PowerShell, or Command Prompt **inside the extracted project folder**.
4. Run:

   ```sh
   docker compose up --build -d
   ```

5. Allow a few minutes for the first download and startup. Open **http://localhost:3000** in your browser.

You do not need Node.js, npm, a search API key, or a paid service for this option. The setup creates a private backend and generates a cryptographically random secret automatically. Only the Sreon interface is exposed, bound to your computer's loopback address. The search backend is not published to your network.

### Everyday commands

Start again:

```sh
docker compose up -d
```

Stop:

```sh
docker compose down
```

See status and application logs:

```sh
docker compose ps -a
docker compose logs sreon configure
```

After editing `searxng/settings.yml`:

```sh
docker compose down
docker compose up --build -d
```

Update the backend and rebuild the interface:

```sh
docker compose pull
docker compose up --build -d
```

For a reproducible deployment, replace the backend's `latest` tag in `compose.yaml` with a tested release tag or image digest before deploying. Upstream engines can change independently of Sreon.

### Use a different port

Create a file named `.env` in the project folder containing:

```dotenv
PORT=3001
```

Run `docker compose up --build -d` again, then visit http://localhost:3001. The backend URL in Compose is supplied internally; you do not need to change it.

## Node.js option — bring your own backend

Install **Node.js 22 or newer**. No `npm install` is required to run the application.

1. Run or choose a SearXNG instance you trust. Its `search.formats` setting must include `json`.
2. Copy `.env.example` to `.env`.
3. Set `SEARXNG_URL` in `.env` to the URL of that instance, reachable **from the Node server**. For example:

   ```dotenv
   PORT=3000
   SEARXNG_URL=http://127.0.0.1:8080
   ```

4. Start Sreon:

   ```sh
   npm start
   ```

5. Open http://localhost:3000.

For interface-only development, omit `SEARXNG_URL` and run `npm start`. The full interface works, and searches show an honest connection/setup message rather than invented results. There is no public-instance fallback and no silent redirect to another search site.

The Node server binds to `0.0.0.0`, supports arbitrary preview hosts, and exposes the backend through same-origin `/api` routes. Frontend JavaScript never calls your browser's `localhost` to reach the backend. For Node-only use, control network exposure with your firewall.

## Included

- All/web, image, news, and video search
- Search results with original source links and snippets
- Pagination, time range, safe-search preference, and language preference
- Cream, dark, and device-matched appearance
- Optional new-tab links and opt-in local history, limited to five queries
- Locally hosted fonts, logo, and discovery photographs
- Rotating discovery prompts that submit actual searches
- Shareable search URLs and browser back/forward support
- Keyboard navigation, focus indicators, native accessible dialogs, reduced-motion support, and mobile layouts
- Backend timeouts, validation, rate limiting, security headers, and explicit failure states
- No comments in the new application code

Search filters depend on support from upstream providers. Safe search requests are not a guarantee of content filtering. SearXNG may return partial results when one provider is unavailable. Providers may block requests, rate-limit your server, or require captchas; self-hosting does not eliminate those constraints.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `/` | Focus the search box |
| `Enter` | Search |
| `Esc` | Close a dialog or leave the search box |
| `←` / `→` | Change category while a search tab is focused |
| `Home` / `End` | First / last search tab |
| `?` | Show shortcut help |

## Landing-page demo and GitHub Pages

The existing GitHub Pages site is **https://opensreon.com/**. GitHub Pages serves HTML, CSS, and JavaScript only; pushing this code does **not** deploy Node or SearXNG. The demo uses the real search application, not the old hardcoded search index. If the backend is absent, it displays a connection/setup message, not fabricated results.

### Local or full-server deployment

The Docker command above runs the original landing page at `http://localhost:3000`. Scroll to **Try the browser**, or open `http://localhost:3000/search/`. Both interfaces use the same `/api/search` backend.

The demo supports actual search, source links, tabs, separate in-memory Personal and Work tab lists, back/forward, reload, and synchronized dark mode. These workspaces are a web-demo convenience, not separate cookie jars or the desktop browser’s encrypted storage. Direct website addresses open in a real new browser tab because arbitrary sites often prohibit embedding. Demo result links also always open outside the embedded frame.

### Keep the public landing page on GitHub Pages

1. Deploy the included Docker stack to a server capable of running containers. Follow the public-hosting security notes below; this is not something GitHub Pages can do.
2. Put the Sreon Node service behind HTTPS on your own search domain. The `/search/` interface and `/api/` routes must stay on that same service. Keep SearXNG private. Permit your landing page to embed `/search/` in your reverse proxy's frame policy.
3. Edit **`site-config.js`** on the landing-page repository. Replace the empty value with your real, deployed search URL, for example:

   ```js
   window.SREON_SITE = Object.freeze({
     searchUrl: "https://search.your-domain.example/search/"
   });
   ```

   This is an illustrative URL, not a service included or deployed by this change. Leave the value empty for local Docker or a same-origin deployment.

4. Merge the landing-page changes into the branch used by GitHub Pages. This repository currently publishes from `main`; a pushed feature branch or open pull request does not change the live website by itself.
5. Open the public landing page, search in **Try the browser**, and verify that results arrive and links open actual websites.

The iframe talks to its own same-origin search API, so this integration needs no permissive API CORS setting and does not expose the private backend. Parent/frame messages validate both their source window and origin. A third-party deployment must not block the demo's iframe. No hosted backend URL is configured by default.

The former external view/download counters were omitted rather than carrying forward a client-exposed access token. If that old token is still active, revoke or rotate it with its provider.

## Privacy and security

Sreon does not create accounts, include analytics, log queries in its application server, or store search history server-side. The backend's Docker logging driver is disabled to avoid retaining upstream request logs. Browser preferences are stored in local storage. Recent searches are disabled by default; disabling them clears the saved list.

This is not an anonymity service. Search queries are sent to the configured backend and its upstream engines. Those engines see the query and your server's IP. Image thumbnails may be requested directly from their source; clicking a result connects to that website. Referrer information is suppressed. Your browser keeps its normal URL history, and your network or hosting provider may retain logs.

The included configuration is designed for **personal, local use**, not an unrestricted public search service. Before publishing it, add HTTPS, an appropriate reverse proxy, stronger abuse prevention, and a privacy-conscious logging policy. The application rate limiter uses the direct connecting IP and intentionally does not trust arbitrary forwarded headers. Behind a proxy, users share that limit unless you implement a trusted-proxy policy. Do not expose the private search container directly. No user input can override the backend URL.

To erase container data and the backend secret:

```sh
docker compose down -v
```

This does not clear your browser's preferences. Use **Settings → Reset preferences** or clear the site's browser data.

## Troubleshooting

**“One more step to the open web.”** The Node interface has no configured backend. Use the full Docker setup, or supply `SEARXNG_URL` and restart Node.

**“The search backend is temporarily unavailable.”** Wait for first startup, check `docker compose ps -a`, and verify connectivity. Settings displays the connection status. Make sure JSON output is enabled for a custom backend. Backend errors are not replaced with fake results.

**Container starts but queries fail.** Check your computer's network access and whether the upstream providers are blocking requests. Try another category or query. If troubleshooting requires backend logs, temporarily change its logging driver to `local`, reproduce with a non-sensitive query, and disable logging again afterward.

**Docker cannot connect.** Open Docker Desktop and wait until it is running. On Windows, enable the WSL 2 backend if requested during Docker installation.

**Port already in use.** Choose a different `PORT` as described above.

**A static hosting service shows the page but search fails.** Sreon requires its Node server and a backend. Static-only hosting, including GitHub Pages, cannot run `/api/search`. Deploy the containers or Node service instead; do not just open `index.html` from disk.

## Development and tests

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
```

`npm run dev` restarts the Node server when its code changes. Refresh your browser after frontend edits.

Backend tests use isolated local mock providers, never real search engines. Browser integration tests cover the interface and controlled provider responses; they do not claim to validate live upstream search availability. The Docker end-to-end path requires a Docker-capable machine with internet access.

Files:

```text
index.html             Original browser landing page with live search demo
styles.css             Browser landing page, cream and dark themes
app.js                 Demo tabs, workspaces, address bar and frame bridge
site-config.js         Optional hosted search URL for static deployments
search/index.html      Standalone and embedded Sreon Search interface
search/styles.css      Responsive search interface
search/app.js          Search UI, preferences, dialogs and search API client
theme.js               Early theme restoration
server.js              Static server and search API proxy
assets/                Locally hosted images, logo, and fonts
searxng/settings.yml   Minimal provider allowlist and backend settings
searxng/init.mjs       Generates and preserves the backend secret
compose.yaml           One-command personal deployment
Dockerfile             Dependency-free Node application image
tests/                 Backend and browser tests
```

The browser landing page stays at `/`, and the same search app is available at `/search/` and in the embedded demo. Existing secret and game routes and the browser archive are still served unchanged. The legacy secret route retains its original inline-script behavior; it does not inherit the new app’s restrictive Content Security Policy.

## Open-source license and credits

The new Sreon search application code is licensed under **GNU AGPL-3.0-only**; see `LICENSE.txt`. If you modify and publicly host it, provide users access to the corresponding source as required by that license. The header links to this repository; update it to your actual source repository when distributing a fork. The pre-existing logo and legacy files retain their existing ownership; this change does not establish a separate third-party license for them.

SearXNG runs as a separate, unmodified open-source service under its own AGPL-3.0 license. Its name and required attribution are preserved here, not presented as competing product branding in the search interface. See [SearXNG source](https://github.com/searxng/searxng) and [documentation](https://docs.searxng.org/). Other components retain their own licenses.

- **DM Sans** and **Instrument Serif**: SIL Open Font License. License files are included in `assets/fonts/`.
- **Architecture photograph**: Paweł Czerwiński, [Unsplash profile](https://unsplash.com/@pawel_czerwinski), image `photo-1787001251149-51e590869d4e`. Used under the [Unsplash License](https://unsplash.com/license).
- **Forest photograph**: [Unsplash mist forest collection](https://unsplash.com/s/photos/mist-forest), image `photo-1611589442867-4d0b4360c3cf`. Used under the Unsplash License.
- **Cosmic Cliffs photograph**: NASA, ESA, CSA, STScI; Webb view of NGC 3324 in the Carina Nebula. Preview sourced via [Earth.com](https://www.earth.com/news/webbs-iconic-cosmic-cliffs-image-transformed-into-stunning-3d-tour-of-star-nursery/). The image is credited to the original agencies; no endorsement is implied.
- Sreon butterfly mark: existing repository asset.

The home-page images are locally hosted editorial inspiration, not ads or live search results.
