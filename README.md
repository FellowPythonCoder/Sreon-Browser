# Sreon — opensreon.com

A lightweight, deep-space landing page for Sreon, with locally hosted fonts and dark-graded imagery, a lavender accent, responsive layouts, and no analytics scripts.

## What’s new on the Sreon 1.1 website

- Animated solar-system hero with eight planets, an asteroid belt, and a ringed Saturn.
- Dedicated speed section with an animated asteroid and practical workflow highlights, without invented benchmarks.
- Downloads show current version **1.1**, a six-part release summary, and per-platform build metadata.
- All four local photographs have a baked-in dark, cool color grade, including wallpapers and the preserved demo’s photos.
- The Privacy colon is plain, non-focusable text on both landing and demo pages; the hidden Gaming Area entry point is disabled. Existing games are preserved at their direct URLs.
- One pause/resume control stops the decorative animations; OS reduced-motion preferences are respected, including live preference changes.

## Run locally

Use Node.js 20+ (Node.js 22 is used in the Docker image).

```sh
npm install
npm start
```

The server listens on `0.0.0.0:3000`. Set `PORT` to change it. The landing page also works as static files on GitHub Pages; `CNAME` retains `opensreon.com`.

## Publish downloads

Edit **`site/assets/downloads.js`**. `SREON_RELEASE.version` sets the current version displayed in Downloads and the release-notes heading. Set each platform’s `url` to an official HTTPS release asset URL or a same-origin path, its `version` to the build version, and `detail` to architecture or installer information. Update the release summary and announcement in `index.html` when publishing a new release.

The current Mac download points to the DMG included in this repository:

```js
mac: {
  url: "/site/assets/SREONBROWSER.dmg",
  version: "1.1",
  detail: "macOS · DMG installer"
}
```

The existing DMG is retained unchanged; this website update does not build or replace the browser installer. Windows and Linux remain unset until their builds are available. Each unset platform opens a platform-specific “Coming soon” dialog, rather than a broken download. Configured platforms automatically become real links, update their availability badge, and update the download FAQ.

## What is interactive?

- Browser sidebar: home, inspiration collection, and Studio preview.
- Change the scenery: cycles through three locally hosted wallpapers.
- Focus mode: collapses the browser preview's sidebar; the `+` button resets the preview.
- Studio: three keyboard-accessible examples, an editable settings panel, live results, validation, and Ctrl/Cmd+Enter to apply.
- Privacy: the colon in the **Privacy:** heading is now ordinary punctuation, not a hidden arcade link.
- Solar system and asteroid: a shared pause/resume button and reduced-motion support.
- Download dialogs: native keyboard-accessible dialogs with Escape-to-close and focus restoration.
- Mac installation help: a native dropdown under the Mac download with DMG installation steps, conditional Privacy & Security → Open Anyway guidance for unverified apps, and a warning not to bypass malware detections. Works without JavaScript.
- Mobile navigation, FAQ disclosures, and reduced-motion-aware section reveals.

**The browser and Studio are clearly labeled UI concepts.** Studio uses a strict, safe settings parser, not `eval`, and is not a SPRFST compiler. Its syntax is illustrative. Product copy follows the supplied Sreon brief; there are no invented speed benchmarks or OS compatibility requirements.

## Structure

- `index.html` — new landing page
- `site/assets/landing.css` / `landing.js` — styles and interactions
- `site/assets/downloads.js` — release links
- `site/assets/night-mountains.webp` — optimized generated alpine wallpaper
- `site/assets/mark.png`, fonts, and other landscapes — existing repository assets
- `site/notes/` — preserved arcade and companion features
- `site/explore/index.html` — preserved previous live-search/demo page
- `site/server.mjs` — existing server and API, with a route added for the preserved demo

The landing page makes no third-party requests. Following an external link or using existing arcade companion features may involve third parties; relevant disclosures remain on those pages. The web host may keep request logs. Studio edits are held in page memory only.

## Tests

```sh
npx playwright install chromium
npm run test:landing  # 15 landing-page interaction/responsive tests
npm run test:browser  # all 27 browser tests, including preserved demos and games
npm run test:server   # existing backend unit tests
```

A custom Chromium can be supplied with `PLAYWRIGHT_EXECUTABLE_PATH`. Browser tests cover widths of 360, 390, 768, and 1440 pixels, versioned downloads and release notes, safe Studio input, disabled arcade entry points, motion controls, reduced motion, and the preserved search demo and direct game routes.

Known pre-existing backend test mismatches: `server.test.mjs` expects the old `rust` health identifier instead of the current `duckduckgo-html`, and expects `BACKEND_NOT_READY` on a generic search failure instead of the current error response. Those two assertions fail; the other seven server tests pass. This landing-page change does not modify API behavior. Other legacy Rust/package tests reference source files no longer present in this checkout.

## Deployment

Pushes to a feature branch do not by themselves change the production domain. Review/merge the branch into the repository's configured deployment branch to publish through the existing hosting setup. Static hosting supports the landing page and local arcade; the preserved search API needs the Node server.
