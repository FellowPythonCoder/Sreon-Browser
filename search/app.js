const searchBase = new URL("./", document.currentScript.src);
const siteBase = new URL("../", searchBase);
const embedded = window.parent !== window;
let parentOrigin = location.origin;
try {
  parentOrigin = new URL(
    new URLSearchParams(location.search).get("parentOrigin") || location.origin,
  ).origin;
} catch {}
if (embedded) document.documentElement.classList.add("embedded");
function notifyParent() {
  if (!embedded) return;
  window.parent.postMessage(
    {
      type: "sreon:navigation",
      url: location.href,
      title: currentQuery || "New tab",
    },
    parentOrigin,
  );
}
const paths = {
  search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 4.5 4.5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-7 8-3-3-3 3"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v5H7zM15 8h2m-2 4h2M7 16h10"/>',
  video:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H4m6-6-6 6 6 6"/>',
  "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
  moon: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  settings:
    '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/>',
  shield:
    '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  leaf: '<path d="M20 3c1 11-2 17-9 17a7 7 0 0 1-7-7C4 6 12 8 20 3Z"/><path d="M3 22 16 9"/>',
  shuffle:
    '<path d="M3 6h2c5 0 9 12 14 12h2M17 14l4 4-4 4M3 18h2c1.5 0 3-1.5 4-3m6-6c1-1.5 2.5-3 4-3h2M17 2l4 4-4 4"/>',
  fingerprint:
    '<path d="M6 20c2-3 2-5 2-8a4 4 0 0 1 8 0c0 4-.3 7-2 10M10 22c2-4 2-6 2-10M3 16v-4a9 9 0 0 1 18 0v3M4 7a9 9 0 0 1 16 0m0 11-1 3M4 19l1-3"/>',
  feather:
    '<path d="M20 4c4 5-5 15-12 13l-4 4M8 17C5 9 15 0 20 4ZM8 17 18 7m-6 7h5"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  heart: '<path d="m12 21-8-8C-3 6 7-1 12 6c5-7 15 0 8 7z"/>',
  plug: '<path d="m7 3 0 5m10-5v5M5 8h14v3a7 7 0 0 1-14 0zM12 18v4"/>',
  refresh: '<path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.globe}</svg>`;
const $ = (selector) => document.querySelector(selector);
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}
const defaults = {
  theme: "light",
  safeSearch: "1",
  language: "auto",
  newTab: true,
  history: false,
};
function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function cleanPreferences(value) {
  return {
    theme: ["light", "dark", "system"].includes(value?.theme)
      ? value.theme
      : defaults.theme,
    safeSearch: ["0", "1", "2"].includes(value?.safeSearch)
      ? value.safeSearch
      : defaults.safeSearch,
    language: ["auto", "en", "de", "es", "fr", "it", "ja"].includes(
      value?.language,
    )
      ? value.language
      : defaults.language,
    newTab: typeof value?.newTab === "boolean" ? value.newTab : defaults.newTab,
    history:
      typeof value?.history === "boolean" ? value.history : defaults.history,
  };
}
let preferences = cleanPreferences(readStorage("sreon.preferences", defaults));
let category = "general";
let page = 1;
let currentQuery = "";
let controller;
let toastTimer;
let topicSet = 0;
let lastFocused;
const topicSets = [
  [
    {
      topic: "architecture",
      label: "DESIGN & CULTURE",
      title: "Spaces that make you pause",
      subtitle: "A different way to see the everyday.",
      query: "minimalist architecture",
      image: "architecture.jpg",
      alt: "Quiet geometry of a white building against a pale blue sky",
    },
    {
      topic: "nature",
      label: "THE NATURAL WORLD",
      title: "Take the scenic route",
      subtitle: "There’s more beyond the beaten path.",
      query: "ancient forests around the world",
      image: "nature.jpg",
      alt: "Misty green hills and a lush forest",
    },
    {
      topic: "space",
      label: "SCIENCE & BEYOND",
      title: "A universe of what-ifs",
      subtitle: "Big questions. Even bigger discoveries.",
      query: "James Webb telescope discoveries",
      image: "space.webp",
      alt: "Stars and colorful clouds of the Carina Nebula",
    },
  ],
  [
    {
      topic: "architecture",
      label: "ART & IDEAS",
      title: "Good design is everywhere",
      subtitle: "Find beauty in the small details.",
      query: "Bauhaus design principles",
      image: "architecture.jpg",
      alt: "A minimalist white facade and clear blue sky",
    },
    {
      topic: "nature",
      label: "SLOW EXPLORATION",
      title: "A little closer to nature",
      subtitle: "Find your own kind of wilderness.",
      query: "forest bathing benefits",
      image: "nature.jpg",
      alt: "Green forest wrapped in soft fog",
    },
    {
      topic: "space",
      label: "THE BIG PICTURE",
      title: "Look a little further",
      subtitle: "Meet our extraordinary cosmic neighbors.",
      query: "habitable exoplanets",
      image: "space.webp",
      alt: "A star-forming region in the Carina Nebula",
    },
  ],
  [
    {
      topic: "architecture",
      label: "PLACES & PEOPLE",
      title: "Built for a better tomorrow",
      subtitle: "Architecture with a lighter footprint.",
      query: "sustainable architecture passive design",
      image: "architecture.jpg",
      alt: "Clean architectural lines against the sky",
    },
    {
      topic: "nature",
      label: "WILD CURIOSITY",
      title: "The secret life of forests",
      subtitle: "A whole world beneath the canopy.",
      query: "forest mycorrhizal networks",
      image: "nature.jpg",
      alt: "Layers of forested hills disappearing into mist",
    },
    {
      topic: "space",
      label: "A SENSE OF WONDER",
      title: "How it all began",
      subtitle: "Go back to the very first stars.",
      query: "formation of the first stars",
      image: "space.webp",
      alt: "Glowing cosmic cliffs and distant stars",
    },
  ],
];
function renderTopics() {
  $("#discovery-grid").innerHTML = topicSets[topicSet]
    .map(
      (item) =>
        `<button class="discovery-card fade-in" data-topic="${item.topic}" data-query="${escape(item.query)}"><div class="card-image-wrap"><img class="card-image" src="../assets/${item.image}" alt="${item.alt}" width="500" height="250"><span class="card-label">${item.label}</span></div><div class="card-copy"><div><h3>${item.title}</h3><p>${item.subtitle}</p></div><span>${icon("arrow-up-right")}</span></div></button>`,
    )
    .join("");
}
function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3000);
}
function applyTheme() {
  const dark =
    preferences.theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
      : preferences.theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("#theme-toggle").innerHTML = icon(dark ? "sun" : "moon");
  $("#theme-toggle").setAttribute(
    "aria-label",
    `Switch to ${dark ? "light" : "dark"} mode`,
  );
  $("#theme-toggle").title = `Switch to ${dark ? "light" : "dark"} mode`;
  $('meta[name="theme-color"]').content = dark ? "#19171f" : "#f8f7f2";
}
function savePreferences() {
  if (!writeStorage("sreon.preferences", preferences))
    showToast(
      "Your browser could not save preferences. They’ll last for this visit.",
    );
  applyTheme();
  renderRecent();
}
function recentQueries() {
  const stored = readStorage("sreon.history", []);
  return Array.isArray(stored)
    ? stored.filter((item) => typeof item === "string").slice(0, 5)
    : [];
}
function renderRecent() {
  const recent = preferences.history ? recentQueries() : [];
  $("#recent-searches").hidden = !recent.length || !!currentQuery;
  $("#recent-searches").innerHTML = recent.length
    ? `<span>Recently explored</span>${recent.map((query) => `<button data-query="${escape(query)}">${escape(query)}</button>`).join("")}<button id="clear-history">Clear</button>`
    : "";
}
function setCategory(next) {
  category = ["general", "images", "news", "videos"].includes(next)
    ? next
    : "general";
  document.querySelectorAll("[data-category]").forEach((button) => {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $("#search-input").placeholder =
    category === "general"
      ? "Where will your curiosity take you?"
      : `Search ${category}, without the noise…`;
}
function syncInput() {
  const filled = !!$("#search-input").value;
  $("#clear-search").hidden = !filled;
  $(".search-shortcut").hidden = filled;
}
function setView(searching) {
  document.body.classList.toggle("results-view", searching);
  $("#hero-intro").hidden = searching;
  $("#suggestions").hidden = searching;
  $("#search-below").hidden = searching;
  $("#home-content").hidden = searching;
  $("#results-section").hidden = !searching;
  renderRecent();
}
function resultTarget() {
  return embedded || preferences.newTab
    ? ' target="_blank" rel="noopener noreferrer"'
    : ' rel="noreferrer"';
}
function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function resultHost(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function renderResults(data) {
  const results = data.results.filter((result) => safeUrl(result.url));
  const query = escape(currentQuery);
  $("#results-meta").textContent =
    `${results.length} result${results.length === 1 ? "" : "s"} on this page · ${data.elapsed.toFixed(2)} seconds`;
  if (!results.length && data.partial) {
    renderError(
      {
        message:
          "The available sources could not return results for this search. Try again in a moment, or choose another category.",
      },
      502,
    );
    $("#pagination").hidden = true;
    return;
  }
  if (!results.length) {
    $("#results-content").innerHTML =
      `<div class="empty-state"><div class="empty-icon">${icon("search")}</div><h2>A different path, perhaps?</h2><p>No ${category === "general" ? "" : category + " "}results for “${query}”. Try fewer words, a broader idea, or a different time range.</p><button class="primary-button" id="edit-query">Refine your search ${icon("arrow-right")}</button></div>`;
    $("#pagination").hidden = page === 1;
    $("#next-page").disabled = true;
    $("#previous-page").disabled = page === 1;
    $("#page-number").textContent = `Page ${page}`;
    return;
  }
  const warning = data.partial
    ? '<div class="result-warning">Some sources didn’t respond. These are the results available right now.</div>'
    : "";
  if (category === "images") {
    $("#results-content").innerHTML =
      warning +
      `<div class="image-results">${results.map((result) => `<a class="image-result" href="${escape(safeUrl(result.url))}"${resultTarget()}><img src="${escape(safeUrl(result.thumbnail) || "../assets/image-placeholder.svg")}" alt="${escape(result.title)}" loading="lazy" referrerpolicy="no-referrer"><h3>${escape(result.title)}</h3><p>${escape(resultHost(result.url))}</p></a>`).join("")}</div>`;
    $("#results-content")
      .querySelectorAll("img")
      .forEach((image) =>
        image.addEventListener(
          "error",
          () => {
            image.src = "../assets/image-placeholder.svg";
          },
          { once: true },
        ),
      );
  } else {
    $("#results-content").innerHTML =
      warning +
      results
        .map(
          (result) =>
            `<article class="result-item"><a class="result-site" href="${escape(safeUrl(result.url))}"${resultTarget()}><span>${escape(resultHost(result.url).slice(0, 1).toUpperCase())}</span>${escape(resultHost(result.url))}</a><h3><a href="${escape(safeUrl(result.url))}"${resultTarget()}>${escape(result.title)}</a></h3><p>${escape(result.content)}</p>${result.published ? `<div class="result-date">${escape(result.published)}</div>` : ""}</article>`,
        )
        .join("");
  }
  $("#pagination").hidden = false;
  $("#previous-page").disabled = page === 1;
  $("#next-page").disabled = page >= 20 || !data.hasMore;
  $("#page-number").textContent = `Page ${page}`;
}
function renderError(error, status) {
  const setup = status === 503 && error.code === "NOT_CONFIGURED";
  $("#results-meta").textContent = `Search for “${currentQuery}”`;
  $("#results-content").innerHTML =
    `<div class="empty-state"><div class="empty-icon">${icon(setup ? "plug" : "globe")}</div><h2>${setup ? "One more step to the open web." : "A small pause in your exploration."}</h2><p>${escape(error.message || "The search service couldn’t be reached. Please try again in a moment.")}</p>${setup ? `<button class="primary-button" data-dialog="setup">Connect your search engine ${icon("arrow-right")}</button>` : `<button class="primary-button" id="retry-search">Try again ${icon("refresh")}</button><button class="secondary-button" data-dialog="setup">Connection help</button>`}</div>`;
}
async function runSearch(query, options = {}) {
  query = query.trim().slice(0, 500);
  if (!query) return;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  currentQuery = query;
  page = options.page || 1;
  $("#search-input").value = query;
  syncInput();
  setView(true);
  if (preferences.history)
    writeStorage(
      "sreon.history",
      [query, ...recentQueries().filter((item) => item !== query)].slice(0, 5),
    );
  const params = new URLSearchParams({ q: query });
  if (category !== "general") params.set("category", category);
  if (page > 1) params.set("page", String(page));
  if ($("#time-filter").value) params.set("time", $("#time-filter").value);
  if (embedded) {
    params.set("embed", "1");
    params.set("parentOrigin", parentOrigin);
  }
  if (!options.fromHistory)
    history.pushState({}, "", `${searchBase.pathname}?${params}`);
  document.title = `${query} — Sreon`;
  notifyParent();
  $("#results-meta").textContent = "Looking a little further…";
  $("#results-content").setAttribute("aria-busy", "true");
  $("#pagination").hidden = true;
  $("#results-content").innerHTML = Array.from(
    { length: 3 },
    () =>
      '<div class="result-item" aria-hidden="true"><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div></div>',
  ).join("");
  params.set("category", category);
  params.set("page", String(page));
  params.set("safe", preferences.safeSearch);
  params.set("language", preferences.language);
  window.scrollTo({ top: 0, behavior: "instant" });
  const timeout = setTimeout(() => requestController.abort("timeout"), 25000);
  try {
    const response = await fetch(new URL(`api/search?${params}`, siteBase), {
      signal: requestController.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
      renderError(
        {
          code: "NOT_CONFIGURED",
          message:
            "This site is serving the search interface without a live backend. The site owner needs to connect a hosted Sreon Search service; GitHub Pages alone cannot run web search.",
        },
        503,
      );
      return;
    }
    const data = await response.json();
    if (requestController.signal.aborted) return;
    if (!response.ok) renderError(data, response.status);
    else renderResults(data);
  } catch {
    if (
      requestController.signal.aborted &&
      requestController.signal.reason !== "timeout"
    )
      return;
    renderError(
      {
        message:
          "The search service couldn’t be reached. Check your connection and try again.",
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
    if (controller === requestController)
      $("#results-content").setAttribute("aria-busy", "false");
  }
}
function restoreLocation() {
  controller?.abort();
  const params = new URLSearchParams(location.search);
  setCategory(params.get("category"));
  const time = params.get("time") || "";
  $("#time-filter").value = ["", "day", "week", "month", "year"].includes(time)
    ? time
    : "";
  const query = (params.get("q") || "").trim();
  if (query)
    runSearch(query, {
      page: Math.min(20, Math.max(1, parseInt(params.get("page"), 10) || 1)),
      fromHistory: true,
    });
  else {
    currentQuery = "";
    $("#search-input").value = "";
    syncInput();
    setView(false);
    document.title = "Sreon — Less noise. More discovery.";
    notifyParent();
  }
}
const privacyPoint = (symbol, title, text) =>
  `<div class="privacy-point"><span>${icon(symbol)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`;
function openDialog(name) {
  if (!$("#modal").open) lastFocused = document.activeElement;
  const content = $("#modal-content");
  const dialogs = {
    about: `<span class="section-kicker">INDEPENDENT BY DESIGN</span><h2 id="modal-title">A little less. A lot more.</h2><p>Somewhere along the way, searching the web got complicated. Ads, distractions, answers you didn’t ask for. We wanted a quieter place to start.</p><p>Sreon puts your curiosity first. A lightweight, open-source search interface, powered by a self-hosted metasearch service. Real links, original sources, and room to explore.</p>${privacyPoint("feather", "Only what you need", "No generated answers, sponsored placements, accounts, or endless feeds.")}${privacyPoint("code", "Open, all the way down", "Inspect it, change it, and make it your own. Sreon’s search application is licensed under AGPL-3.0.")}<div class="dialog-footer"><span class="section-kicker">MADE FOR THE CURIOUS</span><a class="primary-button" href="https://github.com/FellowPythonCoder/Sreon-Browser" target="_blank" rel="noopener noreferrer">Explore the source ${icon("arrow-up-right")}</a></div>`,
    privacy: `<span class="section-kicker">YOUR CURIOSITY BELONGS TO YOU</span><h2 id="modal-title">Explore. Don’t be followed.</h2>${privacyPoint("fingerprint", "No profiles. No analytics.", "Sreon does not include advertising trackers, analytics, or server-side search history. We don’t create a profile of your searches.")}${privacyPoint("shield", "Search through your own backend", "Queries are sent to your configured search service, which asks upstream providers for results. Those providers receive the query and your server’s IP address, not a Sreon account.")}${privacyPoint("settings", "Your device, your preferences", "Theme and search preferences stay in this browser. Recent searches are off by default; if enabled, only the last five are saved on this device.")}${privacyPoint("globe", "Know where a click takes you", "Opening a result connects you to that website. Image thumbnails may load directly from external sources. Those websites have their own privacy policies.")}<p>No system makes you anonymous by itself. Your hosting provider and network may retain connection logs. Use a backend you trust.</p><button class="secondary-button" data-dialog="settings">Manage your preferences ${icon("arrow-right")}</button>`,
    shortcuts: `<span class="section-kicker">LESS CLICKING. MORE EXPLORING.</span><h2 id="modal-title">A few handy shortcuts.</h2><div class="shortcut-row"><span>Jump to search</span><kbd>/</kbd></div><div class="shortcut-row"><span>Search</span><kbd>Enter ↵</kbd></div><div class="shortcut-row"><span>Close a dialog / leave the search box</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>Switch search tabs when focused</span><kbd>← →</kbd></div><div class="shortcut-row"><span>Show these shortcuts</span><kbd>?</kbd></div><p>Your browser’s usual keyboard shortcuts work here, too.</p>`,
    feedback: `<span class="section-kicker">BETTER, TOGETHER</span><h2 id="modal-title">Have a little something?</h2><p>A rough edge, a fresh idea, or something you’d love to see? Sreon is built in the open, and your perspective is welcome.</p><p>Share feedback in the project’s issue tracker. Please avoid including personal information or private search queries.</p><div class="dialog-footer"><span class="section-kicker">EVERY IDEA HELPS</span><a class="primary-button" href="https://github.com/FellowPythonCoder/Sreon-Browser/issues/new" target="_blank" rel="noopener noreferrer">Share feedback ${icon("arrow-up-right")}</a></div>`,
    setup: `<span class="section-kicker">YOUR OWN LITTLE SEARCH ENGINE</span><h2 id="modal-title">Connect to the open web.</h2><p>The interface is ready. Full web search needs the included open-source backend running on your computer. This preview never substitutes made-up results.</p><ol class="setup-steps"><li>Install and open Docker Desktop on your computer.</li><li>Download the project, open a terminal in its folder, and run:</li></ol><code class="setup-command">docker compose up --build -d</code><ol class="setup-steps" start="3"><li>Wait for the containers to start, then open <strong>http://localhost:3000</strong> on that computer.</li></ol><p>Already have a backend? Set <code>SEARXNG_URL</code> in your <code>.env</code> file, enable its JSON output, and restart Sreon. Full instructions are in README.md.</p><div class="dialog-footer"><a class="text-button" href="../README.md" target="_blank">Read setup instructions ${icon("arrow-up-right")}</a><button class="secondary-button" id="check-connection">Check connection ${icon("refresh")}</button></div><div class="backend-status" id="backend-status"></div>`,
  };
  if (name === "settings") {
    content.innerHTML = `<span class="section-kicker">MAKE YOURSELF AT HOME</span><h2 id="modal-title">Your search. Your way.</h2><p class="modal-lead">Small preferences for a better place to explore.</p><div class="setting-row"><div><label for="setting-theme">Appearance</label><p>A little light, or a little shade.</p></div><select id="setting-theme"><option value="light">Cream</option><option value="dark">Dark</option><option value="system">Match device</option></select></div><div class="setting-row"><div><label for="setting-safe">Safe search</label><p>Ask search providers to filter explicit content.</p></div><select id="setting-safe"><option value="2">Strict</option><option value="1">Moderate</option><option value="0">Off</option></select></div><div class="setting-row"><div><label for="setting-language">Search language</label><p>Prefer results in your language.</p></div><select id="setting-language"><option value="auto">Automatic</option><option value="en">English</option><option value="de">Deutsch</option><option value="es">Español</option><option value="fr">Français</option><option value="it">Italiano</option><option value="ja">日本語</option></select></div><div class="setting-row"><div><label for="setting-newtab">Open results in a new tab</label><p>Keep your place while you explore.</p></div><input class="switch" type="checkbox" role="switch" id="setting-newtab"></div><div class="setting-row"><div><label for="setting-history">Remember recent searches</label><p>Last five searches. On this device only.</p></div><input class="switch" type="checkbox" role="switch" id="setting-history"></div><div class="backend-status" id="backend-status">Checking search connection…</div><div class="dialog-footer"><button class="text-button" id="reset-preferences">Reset preferences</button><button class="primary-button" id="save-settings">Save preferences ${icon("check")}</button></div>`;
    $("#setting-theme").value = preferences.theme;
    $("#setting-safe").value = preferences.safeSearch;
    $("#setting-language").value = preferences.language;
    $("#setting-newtab").checked = preferences.newTab;
    $("#setting-history").checked = preferences.history;
  } else content.innerHTML = dialogs[name] || dialogs.about;
  if (!$("#modal").open) $("#modal").showModal();
  $("#modal").scrollTop = 0;
  if (name === "settings" || name === "setup") checkConnection();
}
async function checkConnection() {
  const element = $("#backend-status");
  if (!element) return;
  element.textContent = "Checking search connection…";
  try {
    const response = await fetch(new URL("api/health", siteBase), {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!element.isConnected) return;
    element.classList.toggle("connected", data.connected);
    element.innerHTML = `<span class="status-dot"></span>${data.connected ? "Your search engine is connected." : "Search backend is not connected."}${!data.connected ? '<button class="text-button" data-dialog="setup">Set up →</button>' : ""}`;
  } catch {
    if (element.isConnected)
      element.textContent =
        "Couldn’t reach the search service. Check your connection.";
  }
}
function closeDialog() {
  $("#modal").close();
  if (lastFocused?.isConnected) lastFocused.focus();
}
document.addEventListener("click", (event) => {
  const dialogButton = event.target.closest("[data-dialog]");
  if (dialogButton) openDialog(dialogButton.dataset.dialog);
  const queryButton = event.target.closest("[data-query]");
  if (queryButton) {
    setCategory("general");
    runSearch(queryButton.dataset.query);
  }
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    setCategory(categoryButton.dataset.category);
    if (currentQuery) runSearch($("#search-input").value || currentQuery);
  }
  const id = event.target.closest("[id]")?.id;
  if (id === "save-settings") {
    preferences = {
      theme: $("#setting-theme").value,
      safeSearch: $("#setting-safe").value,
      language: $("#setting-language").value,
      newTab: $("#setting-newtab").checked,
      history: $("#setting-history").checked,
    };
    if (!preferences.history) writeStorage("sreon.history", []);
    savePreferences();
    closeDialog();
    showToast("A little more you. Preferences saved.");
    if (currentQuery) runSearch(currentQuery, { page, fromHistory: true });
  }
  if (id === "reset-preferences") {
    preferences = { ...defaults };
    writeStorage("sreon.history", []);
    savePreferences();
    openDialog("settings");
    showToast("Back to a fresh start.");
    if (currentQuery) runSearch(currentQuery, { page, fromHistory: true });
  }
  if (id === "clear-history") {
    writeStorage("sreon.history", []);
    renderRecent();
    showToast("Recent searches cleared.");
  }
  if (id === "retry-search")
    runSearch(currentQuery, { page, fromHistory: true });
  if (id === "edit-query") {
    $("#search-input").focus();
    $("#search-input").select();
  }
  if (id === "check-connection") checkConnection();
});
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch($("#search-input").value);
});
$("#search-input").addEventListener("input", syncInput);
$("#clear-search").addEventListener("click", () => {
  $("#search-input").value = "";
  syncInput();
  $("#search-input").focus();
});
$("#theme-toggle").addEventListener("click", () => {
  preferences.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  savePreferences();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (preferences.theme === "system") applyTheme();
});
$("#shuffle").addEventListener("click", () => {
  topicSet = (topicSet + 1) % topicSets.length;
  renderTopics();
  showToast("Another little corner of the web to explore.");
});
$("#time-filter").addEventListener("change", () => {
  if (currentQuery) runSearch(currentQuery);
});
$("#next-page").addEventListener("click", () =>
  runSearch(currentQuery, { page: page + 1 }),
);
$("#previous-page").addEventListener("click", () =>
  runSearch(currentQuery, { page: page - 1 }),
);
$("#close-modal").addEventListener("click", closeDialog);
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const rect = $("#modal").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog();
  }
});
$("#modal").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
$(".search-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...document.querySelectorAll("[data-category]")];
  const index = tabs.findIndex((tab) => tab.dataset.category === category);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].focus();
  tabs[next].click();
});
document.addEventListener("keydown", (event) => {
  const editing =
    event.target.matches("input, textarea, select") ||
    event.target.isContentEditable;
  if (event.key === "Escape" && editing && !$("#modal").open)
    event.target.blur();
  if (
    editing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    $("#modal").open
  )
    return;
  if (event.key === "/") {
    event.preventDefault();
    $("#search-input").focus();
  }
  if (event.key === "?") {
    event.preventDefault();
    openDialog("shortcuts");
  }
});
window.addEventListener("popstate", restoreLocation);
hydrateIcons();
applyTheme();
renderTopics();
restoreLocation();

window.addEventListener("message", (event) => {
  if (
    !embedded ||
    event.source !== window.parent ||
    event.origin !== parentOrigin
  )
    return;
  if (
    event.data?.type === "sreon:theme" &&
    ["light", "dark"].includes(event.data.theme)
  ) {
    preferences.theme = event.data.theme;
    applyTheme();
  }
  if (event.data?.type === "sreon:settings") openDialog("settings");
});
if (embedded) {
  window.parent.postMessage({ type: "sreon:ready" }, parentOrigin);
  notifyParent();
}

if (embedded) {
  const home = new URL(searchBase);
  home.searchParams.set("embed", "1");
  home.searchParams.set("parentOrigin", parentOrigin);
  document.querySelectorAll('[aria-label="Sreon home"]').forEach((link) => {
    link.href = home.href;
  });
  fetch(new URL("api/health", siteBase), { signal: AbortSignal.timeout(8000) })
    .then((response) => (response.ok ? response.json() : { connected: false }))
    .then((data) =>
      window.parent.postMessage(
        { type: "sreon:connection", connected: data.connected === true },
        parentOrigin,
      ),
    )
    .catch(() =>
      window.parent.postMessage(
        { type: "sreon:connection", connected: false },
        parentOrigin,
      ),
    );
}
