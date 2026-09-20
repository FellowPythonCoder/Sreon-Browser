# Sreon — native Mac app

A **Rust-powered macOS app** with the Sreon purple-and-cream interface and dark mode. It opens from Applications or the Dock, not a localhost browser tab.

- **Native executable:** Rust compiles to machine code for Apple Silicon and Intel.
- **System WebKit:** uses the Mac's installed web renderer instead of shipping Electron or Chromium.
- **No local server:** the installed app does not start Node, Docker, an HTTP listener, or a background search daemon.
- **Real browsing:** enter a website address or open a search result in a Sreon WebKit window.
- **Direct search:** the Rust core connects over HTTPS to a hosted search service you choose.
- **No ads, generated answers, analytics, accounts, or promotional landing page.**

## Install the Mac app

The [Build Sreon Mac app workflow](https://github.com/FellowPythonCoder/Sreon-Browser/actions/workflows/desktop.yml) builds a **universal app for Apple Silicon and Intel**. Open a successful run and download its **Sreon-mac-universal** artifact. Artifacts are retained for 30 days and downloading them may require signing in to GitHub.

Inside the artifact:

- `Sreon_…_universal.dmg`: open it and drag **Sreon** into **Applications**.
- `Sreon-mac-universal.zip`: an alternative archive containing `Sreon.app`.
- `SHA256SUMS.txt`: checksums of the downloadable packages.
- `Cargo.lock`: the exact Rust dependencies used by that build.
- `SOURCE.txt`, `LICENSE.txt`, and this guide: source revision, license, and setup details.

Launch **Sreon** from Applications or Spotlight. No terminal, Docker, Node.js, Rust compiler, or localhost service is required to use the installed app.

These are **ad-hoc-signed development builds, not Apple-notarized releases**. macOS may block a downloaded build or ask you to approve it. Prefer building from source if you do not trust a downloaded artifact. Do not disable Gatekeeper globally. Public distribution without security warnings requires an Apple Developer signing identity and notarization; neither is configured in this repository.

Minimum deployment target: macOS 11. WebKit compatibility follows the macOS version installed on the user's machine; newer websites may require a newer macOS release.

## Search and browsing

### Visit a website immediately

Type a complete address such as `https://example.org` or a domain such as `example.org` into the search box with **All** selected. Sreon opens it in a native browsing window. This does not require a search backend.

### Enable web search

1. Open **Search settings** using the gear icon.
2. Enter the **HTTPS base URL of a hosted SearXNG service you operate or trust**. Its `search.formats` configuration must include `json`. Do not enter your Mac's localhost address or a result page URL.
3. Save preferences, then search normally.

There is **no public search service deployed or configured by default**. The native app is a search client/metasearch interface, not a complete independently crawled web index. Searches need an online provider. The app does not invent results, quietly select a public instance, or redirect search queries to a different search brand.

The included `searxng/settings.yml` is an example provider configuration with Google engines excluded. A hosted service has its own configuration, so its provider choices and policies are controlled by its operator. See [WEB.md](WEB.md) for the optional server setup if you want to host the backend separately; it is **not needed on your Mac** when using an already hosted service.

Search settings support web, images, news, videos, time range, language, safe search, appearance, and opt-in recent queries. Filter support depends on upstream providers. Safe search is not a guarantee of content filtering. Providers can rate-limit or block requests.

### Native browsing controls

- `⌘L`: return to Sreon Search and focus the input.
- `⌘[` / `⌘]`: back / forward in the focused window.
- `⌘R`: reload the focused window.
- `⌘W`: close a window.
- `⌘Q`: quit Sreon.
- `/`: focus search; `?`: show search shortcuts.

**Open results in a new window** creates separate WebKit windows. Turn it off to reuse the last browsing window. Up to 12 browsing windows are allowed to bound resource usage. Website popups are blocked rather than granted native app privileges.

This is a lightweight search-first browser, not a feature-complete Safari/Chrome replacement. It does not include extensions, a password manager, sync, an ad blocker, or the old desktop browser's encrypted workspaces. Website compatibility and rendering speed come from system WebKit.

## Build on your Mac from Terminal

One-time build requirements:

1. Install Apple's command-line tools: `xcode-select --install`.
2. Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/).
3. Install stable Rust using [rustup.rs](https://rustup.rs/), then reopen Terminal.
4. Download the source or clone this session's branch:

   ```sh
   git clone --branch arena/01a0bffb-sreon-browser --single-branch https://github.com/FellowPythonCoder/Sreon-Browser.git
   cd Sreon-Browser
   ```

Build and open a native app:

```sh
bash sreon.sh
```

The first run compiles Rust and builds `Sreon.app`; it may take several minutes. If an app bundle already exists, this command opens it without rebuilding or starting a server. To force a fresh build:

```sh
bash sreon.sh build
```

The locally built app is at:

```text
src-tauri/target/release/bundle/macos/Sreon.app
```

Drag it into Applications. The compilers and Node are **build-time tools only**, not runtime requirements. You can also launch an installed app from Terminal using `open -a Sreon`.

### Build a universal app / disk image

```sh
npm ci
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin --bundles app,dmg
```

The universal bundles are under `src-tauri/target/universal-apple-darwin/release/bundle/`. Apple SDKs are required; producing a Mac `.app`/`.dmg` is a macOS build step, not a Linux cross-build claim.

## Performance choices

- Release Rust builds use optimization level 3, link-time optimization, one code-generation unit, and stripped symbols.
- A single asynchronous HTTP client reuses TLS connections and connection pools.
- A new query cancels the previous Rust search task instead of accumulating obsolete requests.
- Responses are bounded to 5 MB and 60 results; requests have connect and overall timeouts.
- Search preferences and bundled assets are local. No frontend framework, analytics, or externally hosted fonts are required.
- System WebKit supplies rendering; the app does not ship another browser engine.

**“Fastest” is not a measured claim.** Startup speed, memory, rendering, and search latency depend on hardware, macOS/WebKit, network, and the provider. Rust improves control over native work; it cannot make a remote search index or internet connection instantaneous. Handwritten assembly is not included because there is no demonstrated assembly-level bottleneck.

## Privacy and security

The hosted search service receives your query and IP address. Its upstream providers generally receive the backend's IP. Opening websites and image thumbnails contacts their respective servers. Nothing makes this app a VPN or an anonymity service.

Search preferences and the chosen service URL are stored in the app's local WebKit storage. Recent searches are disabled by default; enabling them stores the latest five locally. Resetting preferences disconnects the saved service and clears recent queries. There is no analytics or query logging in the Rust core. OS and network logs are outside the app's control.

Website windows use WebKit's ephemeral/incognito storage. They do **not** receive Sreon's native command permissions. Only the bundled `main` window has the explicitly listed commands, and each command checks the calling window again in Rust. Main-window navigation cannot turn an external website into a privileged app page. No filesystem, shell, process, or general-purpose HTTP plugin is exposed to web content.

Search endpoints must be hosted HTTPS URLs without credentials or query strings. Obvious local/private IP literals and localhost names are rejected. This is not a claim to prevent every DNS-rebinding or malicious-hosting scenario; choose an endpoint you trust. Upstream redirects are not followed by the Rust search client, errors do not expose internal response details, and returned URLs are validated before rendering or navigation.

Tauri uses internal asset and IPC protocols to communicate within the app. An `ipc.localhost` value in its CSP is an internal WebView transport identifier, **not a listening HTTP server**. No local TCP port is opened by this application code.

## Development and verification

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run test:rust
```

- Node tests cover the optional server, both launchers, packaging boundaries, and capability configuration.
- Browser tests cover the interface and a simulated native bridge. They are not a substitute for running WKWebView on a Mac.
- Rust tests cover query/filter validation, endpoint restrictions, URL safety, response normalization, and size/result limits.
- GitHub's macOS workflow compiles the actual Rust app for both Mac architectures and packages the bundles. A successful build is not a benchmark or a complete GUI compatibility test.
- Provider responses in automated tests are fixtures, not claims of live search availability.

For native development on your Mac, use `npm run desktop:dev`. The packaged release embeds the assets and does not use the optional Node web server.

`npm start`, `sreon-web.sh`, `server.js`, and Docker Compose are retained **only as explicit optional web/developer tools**. They are excluded from the desktop asset bundle. See [WEB.md](WEB.md). The main launcher `sreon.sh` never falls back to a localhost website.

```text
src-tauri/src/search.rs       Rust HTTPS search, validation, normalization
src-tauri/src/desktop.rs      Native app, menus, window isolation, IPC
src-tauri/tauri.conf.json     Desktop packaging and content security policy
src-tauri/capabilities/       Main-window-only permissions
native.js                    Thin Rust IPC / optional web transport adapter
index.html, app.js, styles.css  Bundled search interface
scripts/prepare-desktop.mjs  Explicit desktop asset allowlist
sreon.sh                     Native Mac app launcher / one-time build
.github/workflows/desktop.yml  Universal Mac app build
```

The secret page `o/index.html`, game files, verification HTML, domain file, and original browser archive remain untouched. None are included in the native app. The old browser marketing website is not restored.

## Open-source license

Sreon's new application code is **AGPL-3.0-only**; see `LICENSE.txt`. Source is available in this repository, including the native core. Public distribution and modified network deployments must comply with the corresponding-source requirements. Preserve notices and point your fork's source link to its actual source.

Tauri, Rust dependencies, and system WebKit retain their own licenses. SearXNG is a separate AGPL-licensed service; see [its source](https://github.com/searxng/searxng). DM Sans and Instrument Serif use the SIL Open Font License, included in `assets/fonts/`. The existing Sreon logo and untouched legacy files retain their ownership.
