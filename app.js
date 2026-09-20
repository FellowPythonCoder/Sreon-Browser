const frame = document.getElementById("demo-search-frame");
const address = document.getElementById("demo-addr-text");
const tabsElement = document.getElementById("demo-tabs");
const statusElement = document.getElementById("demo-status");
const siteBase = new URL("./", document.currentScript.src);
let searchBase = new URL("search/", siteBase);
try {
  if (window.SREON_SITE?.searchUrl) {
    const configured = new URL(window.SREON_SITE.searchUrl, siteBase);
    if (
      configured.protocol === "https:" ||
      configured.origin === location.origin
    ) {
      configured.search = "";
      configured.hash = "";
      if (!configured.pathname.endsWith("/")) configured.pathname += "/";
      searchBase = configured;
    }
  }
} catch {}
let nextTabId = 0;
let workspace = "Personal";
const workspaces = { Personal: [], Work: [] };
const selectedTabs = { Personal: null, Work: null };
let connection = "checking";

function activeTab() {
  return workspaces[workspace].find(
    (tab) => tab.id === selectedTabs[workspace],
  );
}
function emptyTab() {
  return {
    id: ++nextTabId,
    title: "New tab",
    entries: [searchBase.href],
    position: 0,
  };
}
function currentUrl() {
  const tab = activeTab();
  return new URL(tab.entries[tab.position]);
}
function postToSearch(message) {
  frame.contentWindow?.postMessage(message, searchBase.origin);
}
function renderTabs() {
  tabsElement.replaceChildren();
  for (const tab of workspaces[workspace]) {
    const row = document.createElement("div");
    row.className = "demo-tab-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `demo-tab${tab.id === selectedTabs[workspace] ? " active" : ""}`;
    button.textContent = tab.title;
    button.title = tab.title;
    button.setAttribute(
      "aria-pressed",
      String(tab.id === selectedTabs[workspace]),
    );
    button.addEventListener("click", () => {
      selectedTabs[workspace] = tab.id;
      loadTab();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "demo-close-tab";
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${tab.title} tab`);
    close.addEventListener("click", () => closeTab(tab.id));
    row.append(button, close);
    tabsElement.append(row);
  }
  document.querySelectorAll(".demo-ws").forEach((button) => {
    const active = button.dataset.ws === workspace;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const tab = activeTab();
  document.getElementById("demo-back").disabled = tab.position === 0;
  document.getElementById("demo-forward").disabled =
    tab.position >= tab.entries.length - 1;
  document.getElementById("standalone-search").href = currentUrl().href;
}
function setAddress() {
  address.value = currentUrl().searchParams.get("q") || "";
}
function loadTab() {
  renderTabs();
  setAddress();
  const url = currentUrl();
  url.searchParams.set("embed", "1");
  url.searchParams.set("parentOrigin", location.origin);
  frame.src = url.href;
}
function newTab() {
  if (workspaces[workspace].length >= 12) {
    statusElement.textContent =
      "You have 12 tabs in this workspace. Close one to make room.";
    return;
  }
  const tab = emptyTab();
  workspaces[workspace].push(tab);
  selectedTabs[workspace] = tab.id;
  loadTab();
}
function closeTab(id) {
  const index = workspaces[workspace].findIndex((tab) => tab.id === id);
  workspaces[workspace].splice(index, 1);
  if (!workspaces[workspace].length) return newTab();
  if (selectedTabs[workspace] === id) {
    selectedTabs[workspace] = workspaces[workspace][Math.max(0, index - 1)].id;
    loadTab();
  } else renderTabs();
}
function switchWorkspace(name) {
  workspace = name;
  if (!workspaces[workspace].length) newTab();
  else loadTab();
}
function navigate(url, title) {
  const tab = activeTab();
  if (url !== tab.entries[tab.position]) {
    tab.entries.splice(tab.position + 1);
    tab.entries.push(url);
    if (tab.entries.length > 50) tab.entries.shift();
    tab.position = tab.entries.length - 1;
  }
  tab.title = title || "New tab";
  renderTabs();
  setAddress();
}
function applySiteTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  document.getElementById("site-theme-toggle").textContent = dark
    ? "Cream mode"
    : "Dark mode";
  document
    .getElementById("site-theme-toggle")
    .setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  document.getElementById("demo-theme-toggle").textContent = dark
    ? "☀ Cream mode"
    : "☾ Dark mode";
  postToSearch({ type: "sreon:theme", theme: dark ? "dark" : "light" });
}
function toggleTheme() {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    const saved = JSON.parse(localStorage.getItem("sreon.preferences") || "{}");
    localStorage.setItem(
      "sreon.preferences",
      JSON.stringify({ ...saved, theme }),
    );
  } catch {}
  applySiteTheme();
}
function closeCommands() {
  document.getElementById("demo-cmdk").close();
  document.getElementById("demo-cmdk-btn").focus();
}
function openCommands() {
  document.getElementById("demo-cmdk").showModal();
}
document
  .getElementById("demo-address-form")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const text = address.value.trim().slice(0, 500);
    if (!text) return;
    let external;
    try {
      if (
        /^https?:\/\//i.test(text) ||
        /^[a-z\d-]+(?:\.[a-z\d-]+)+(?:[/:?#]\S*)?$/i.test(text)
      ) {
        const parsed = new URL(
          /^https?:\/\//i.test(text) ? text : `https://${text}`,
        );
        if (!parsed.username && !parsed.password) external = parsed;
      }
    } catch {}
    if (external) {
      const link = document.createElement("a");
      link.href = external.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      statusElement.textContent =
        "Website opened in a new tab. Return here to keep searching with Sreon.";
      return;
    }
    const url = new URL(searchBase);
    url.searchParams.set("q", text);
    navigate(url.href, text);
    loadTab();
  });
document.getElementById("demo-newtab").addEventListener("click", newTab);
document.getElementById("demo-ws-row").addEventListener("click", (event) => {
  const button = event.target.closest("[data-ws]");
  if (button && Object.hasOwn(workspaces, button.dataset.ws))
    switchWorkspace(button.dataset.ws);
});
for (const [id, direction] of [
  ["demo-back", -1],
  ["demo-forward", 1],
]) {
  document.getElementById(id).addEventListener("click", () => {
    const tab = activeTab();
    const position = tab.position + direction;
    if (position < 0 || position >= tab.entries.length) return;
    tab.position = position;
    tab.title =
      new URL(tab.entries[position]).searchParams.get("q") || "New tab";
    loadTab();
  });
}
document.getElementById("demo-reload").addEventListener("click", loadTab);
document
  .getElementById("site-theme-toggle")
  .addEventListener("click", toggleTheme);
document
  .getElementById("demo-theme-toggle")
  .addEventListener("click", toggleTheme);
document
  .getElementById("demo-cmdk-btn")
  .addEventListener("click", openCommands);
document
  .getElementById("demo-close-commands")
  .addEventListener("click", closeCommands);
document.getElementById("demo-cmdk").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCommands();
});
document.querySelectorAll("[data-action]").forEach((button) =>
  button.addEventListener("click", () => {
    closeCommands();
    if (button.dataset.action === "workspace")
      switchWorkspace(workspace === "Personal" ? "Work" : "Personal");
    if (button.dataset.action === "newtab") newTab();
    if (button.dataset.action === "theme") toggleTheme();
    if (button.dataset.action === "settings") {
      frame.scrollIntoView({ block: "start", behavior: "instant" });
      postToSearch({ type: "sreon:settings" });
    }
  }),
);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!document.getElementById("demo-cmdk").open) openCommands();
  }
});
window.addEventListener("message", (event) => {
  if (
    event.source !== frame.contentWindow ||
    event.origin !== searchBase.origin
  )
    return;
  if (event.data?.type === "sreon:ready") applySiteTheme();
  if (event.data?.type === "sreon:connection") {
    connection = event.data.connected ? "connected" : "unavailable";
    statusElement.textContent =
      connection === "connected"
        ? "Sreon Search · Connected to your search service. Results open real websites."
        : "Sreon Search · Live results need a connected backend. GitHub Pages only hosts the interface. See README.md for deployment.";
  }
  if (event.data?.type === "sreon:navigation") {
    try {
      const url = new URL(event.data.url);
      if (
        url.origin !== searchBase.origin ||
        url.pathname !== searchBase.pathname
      )
        return;
      url.searchParams.delete("embed");
      url.searchParams.delete("parentOrigin");
      navigate(url.href, url.searchParams.get("q") || "New tab");
    } catch {}
  }
});
frame.addEventListener("load", applySiteTheme);
window.addEventListener("storage", (event) => {
  if (event.key !== "sreon.preferences") return;
  try {
    const preferences = JSON.parse(event.newValue || "{}");
    if (["light", "dark"].includes(preferences.theme)) {
      document.documentElement.dataset.theme = preferences.theme;
      applySiteTheme();
    }
  } catch {}
});
document
  .querySelectorAll(".reveal")
  .forEach((element) => element.classList.add("is-visible"));
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          document.getElementById("live-addr").textContent =
            `sreon://${entry.target.id === "try" ? "try-it" : entry.target.id}`;
        }
    },
    { threshold: 0.2 },
  );
  document
    .querySelectorAll("main section[id]")
    .forEach((section) => observer.observe(section));
}
applySiteTheme();
newTab();
