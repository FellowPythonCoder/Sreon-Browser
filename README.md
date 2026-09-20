# Sreon Search

Just a search engine. No browser landing page, demo, downloads section, discovery feed, or promotional cards.

Sreon has a purple-and-cream interface, dark mode, and a private, self-hosted SearXNG backend. Web, image, news, and video searches return original source links. There are no ads, AI answers, analytics, accounts, external fonts, or production npm dependencies. Google engines are not enabled in the included configuration.

This is an open-source **metasearch engine**: it requests results from upstream providers rather than operating its own crawler and web index.

## Run from Terminal on your Mac

Supports Apple Silicon and Intel Macs with a compatible Docker Desktop installation.

1. Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/). Open it once and complete its setup. Choose the download that matches your Mac.
2. Download and extract this version of the project, or clone the working branch:

   ```sh
   git clone --branch arena/01a0bffb-sreon-browser --single-branch https://github.com/FellowPythonCoder/Sreon-Browser.git
   cd Sreon-Browser
   ```

3. In the project folder, run:

   ```sh
   bash sreon.sh
   ```

The launcher checks Docker, opens Docker Desktop on macOS if needed, starts the search containers, waits for the backend, and opens **http://localhost:3000** in your browser. The first run downloads the container images and can take several minutes. Later runs reuse them. It does not install software, use `sudo`, or execute your `.env` file as shell code.

**Docker is required for this complete local setup.** Node.js, npm, paid search APIs, and API keys are not required. A ready backend can still encounter provider outages or rate limits; the launcher does not guarantee upstream search availability.

If you already cloned this branch, update it first with `git pull --ff-only`. If you downloaded a ZIP, open Terminal and use `cd` to enter its extracted folder. You can type `cd `, drag the folder into Terminal, and press Return.

### Terminal commands

```sh
bash sreon.sh
bash sreon.sh stop
bash sreon.sh status
bash sreon.sh logs
```

Closing Terminal does not stop the containers. Use the stop command above. Stopping preserves your backend configuration.

Start without opening a browser:

```sh
SREON_NO_OPEN=1 bash sreon.sh
```

Use a different port:

```sh
PORT=3001 bash sreon.sh
```

Or create a `.env` file in the project folder containing `PORT=3001`. The launcher reads the actual published container port, so it opens the correct URL. The full Docker setup only exposes Sreon to your Mac's loopback address; the backend is not published to your network.

## Direct Docker commands

On macOS, Linux, or Windows with Docker Compose:

```sh
docker compose up --build -d
```

Open http://localhost:3000. Stop with:

```sh
docker compose down
```

After changing `searxng/settings.yml`, recreate the stack:

```sh
docker compose down
docker compose up --build -d
```

Update container images:

```sh
docker compose pull
docker compose up --build -d
```

For a reproducible deployment, replace the backend's `latest` image tag in `compose.yaml` with a tested release tag or digest.

## Node.js — bring your own search backend

Install Node.js 22 or newer. Copy `.env.example` to `.env` and set `SEARXNG_URL` to a running SearXNG instance reachable from your Node server. That instance must have `json` in its `search.formats` setting.

```dotenv
PORT=3000
SEARXNG_URL=http://127.0.0.1:8080
```

Then run:

```sh
npm start
```

No `npm install` is needed for this runtime. Open http://localhost:3000. Without `SEARXNG_URL`, the interface runs but clearly explains that live search is not connected. It never fills the results with fabricated links or silently redirects searches to another brand.

The Node server binds to `0.0.0.0` for preview compatibility; use your firewall to control exposure when running outside Docker. Browser requests use same-origin `/api` routes rather than a hardcoded localhost backend.

## Search features

- Web, images, news, and videos
- Time range, language, and safe-search preferences
- Original source links, snippets, pagination, and partial-provider warnings
- Cream, dark, and device-matched themes
- Optional new-tab links
- Opt-in recent searches, limited to five and saved only in this browser
- Responsive layouts, accessible dialogs, keyboard controls, and reduced-motion support

Safe-search filtering and language/time preferences depend on provider support. Safe search is not a guarantee of content filtering. Upstream engines can block requests or require captchas.

| Shortcut | Action |
| --- | --- |
| `/` | Focus search |
| `Enter` | Submit search |
| `Esc` | Close a dialog or leave the input |
| `←` / `→` | Change category while a category tab is focused |
| `Home` / `End` | First / last category tab |
| `?` | Keyboard help |

## Privacy and deployment

Sreon contains no analytics and does not retain search queries in its Node server. Backend Docker logging is disabled. Preferences are saved in browser local storage. Recent searches are off by default; disabling them clears the saved list.

This is not an anonymity service. Queries go to your configured backend and its upstream providers, which see the query and your server's IP. Image thumbnails may load from external sites, and opening a result connects to that website. Referrers are suppressed. Browser history and network or hosting logs can still retain information.

The included configuration is for **personal, local use**. Before exposing it publicly, add HTTPS, an appropriate reverse proxy, abuse prevention, and a privacy-conscious logging policy. The application rate limiter uses the direct connecting IP and does not trust arbitrary forwarded headers; users behind a proxy share that limit. Keep SearXNG private.

GitHub Pages can host only the static interface, not Node or SearXNG. Pushing or merging this repository does not deploy the search backend. A public search installation needs the actual server/container stack; the old browser-demo iframe and `site-config.js` integration have been removed.

To erase backend data and its generated secret:

```sh
docker compose down -v
```

This does not clear browser preferences. Use **Settings → Reset preferences** or clear site data in your browser.

## Troubleshooting

- **Docker is missing:** Install and initialize Docker Desktop, then run `bash sreon.sh` again.
- **Docker does not start:** Open Docker Desktop manually, finish any permission prompts, and retry.
- **Port is busy:** Use `PORT=3001 bash sreon.sh`.
- **Backend is not ready:** Run `bash sreon.sh status` and `bash sreon.sh logs`. Check your internet connection and retry after startup completes.
- **JSON requests are refused:** Enable `json` in the custom backend's `search.formats`, then restart it.
- **Backend runs but queries fail:** Providers may be blocked or unavailable. Try another category or query. For diagnosis, temporarily change the search container's logging driver from `none` to `local`, use a non-sensitive query, and disable logging afterward.
- **Only static files are hosted:** Run the included server and backend instead. Opening `index.html` from disk or hosting only the files will not provide live search.

## Development and tests

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
```

`npm run dev` restarts Node on server-code changes. Refresh the browser after frontend edits.

Backend and browser tests use controlled provider responses, not real search engines. Launcher tests simulate Docker and macOS commands without installing or starting services. They do not establish that a real Mac or live Docker stack has been tested in this sandbox.

```text
index.html          The search engine, directly at /
app.js              Search, preferences, results, and dialogs
styles.css          Cream and dark search themes
theme.js            Early theme restoration
server.js           Static server and search API
sreon.sh            Terminal launcher and container management
compose.yaml        Private SearXNG + Sreon deployment
Dockerfile          Dependency-free Node application image
searxng/            Backend configuration and secret initialization
assets/             Sreon logo, local fonts, image placeholder
tests/              Backend, browser, and launcher tests
```

The old browser landing page and its demo code are removed. Previous `/search/` URLs redirect to `/` while preserving the query. The pre-existing secret file `o/index.html`, game files, verification file, domain file, and browser archive remain unchanged in the repository as previously requested, but are not included or served by the search-only application. They are not part of the search interface.

## License

The new Sreon search application is **GNU AGPL-3.0-only**; see `LICENSE.txt`. If you modify and publicly host it, provide the corresponding source as required by the license. Update the source link when distributing a fork.

SearXNG is a separate, unmodified AGPL-licensed service. Its attribution remains here rather than competing with Sreon branding in the interface. See [SearXNG source](https://github.com/searxng/searxng) and [documentation](https://docs.searxng.org/).

DM Sans and Instrument Serif are provided under the SIL Open Font License; their licenses are in `assets/fonts/`. The Sreon butterfly logo and untouched legacy files retain their existing ownership. The removed discovery photographs are no longer shipped with this search application.
