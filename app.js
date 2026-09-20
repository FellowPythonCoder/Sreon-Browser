(() => {
  const input = document.getElementById("search-input");
  const results = document.getElementById("results");
  const section = document.getElementById("results-section");
  const status = document.getElementById("status");
  const notice = document.getElementById("notice");
  const retry = document.getElementById("retry");
  const pagination = document.getElementById("pagination");
  const previous = document.getElementById("previous");
  const next = document.getElementById("next");
  const theme = document.getElementById("theme-toggle");
  let query = "";
  let sequence = 0;
  let pages = [];
  let pageIndex = 0;
  let pendingCursor = null;

  function updateTheme() {
    theme.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
  }

  theme.addEventListener("click", () => {
    const value = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem("sreon.theme", value); } catch {}
    updateTheme();
  });
  updateTheme();

  function safeUrl(raw) {
    try {
      const url = new URL(raw);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch { return null; }
  }

  function showPage(index) {
    const data = pages[index];
    pageIndex = index;
    results.replaceChildren();
    results.setAttribute("aria-busy", "false");
    retry.hidden = true;
    notice.textContent = data.notice || "";
    notice.hidden = !data.notice;
    let count = 0;
    for (const result of data.results) {
      const url = safeUrl(result.url);
      if (!url || !result.title) continue;
      const article = document.createElement("article");
      article.className = "result";
      const address = document.createElement("span");
      address.className = "result-url";
      address.textContent = url.hostname + (url.pathname === "/" ? "" : url.pathname);
      const title = document.createElement("h2");
      const link = document.createElement("a");
      link.href = url.href;
      link.textContent = result.title;
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        try { await window.sreonRuntime.openPage(url.href); }
        catch (error) { status.textContent = error?.message || "This page couldn't open. Please try again."; }
      });
      link.addEventListener("auxclick", (event) => event.preventDefault());
      title.append(link);
      const content = document.createElement("p");
      content.textContent = result.content || "";
      article.append(address, title, content);
      results.append(article);
      count++;
    }
    status.textContent = count ? `${count} result${count === 1 ? "" : "s"}` : data.notice ? "No reference articles found. Try another search." : "No results found. Try another search.";
    pagination.hidden = index === 0 && !data.nextCursor;
    previous.disabled = index === 0;
    next.disabled = !data.nextCursor;
    document.getElementById("page-number").textContent = `Page ${index + 1}`;
  }

  async function loadPage(cursor, index) {
    const current = ++sequence;
    pendingCursor = cursor;
    pageIndex = index;
    document.body.classList.add("has-results");
    section.hidden = false;
    results.replaceChildren();
    results.setAttribute("aria-busy", "true");
    status.textContent = "Searching…";
    notice.hidden = true;
    retry.hidden = true;
    pagination.hidden = true;
    document.title = `${query} — Sreon`;
    try {
      const data = await window.sreonRuntime.search(query, cursor);
      if (current !== sequence) return;
      if (!Array.isArray(data?.results)) throw new Error("Search returned an unreadable response. Please try again.");
      pages[index] = data;
      showPage(index);
    } catch (error) {
      if (current !== sequence) return;
      results.setAttribute("aria-busy", "false");
      status.textContent = error?.message || "Search couldn't connect. Please try again.";
      retry.hidden = false;
      if (index > 0) {
        pagination.hidden = false;
        previous.disabled = false;
        next.disabled = true;
        document.getElementById("page-number").textContent = `Page ${index + 1}`;
      }
    }
  }

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    query = value;
    pages = [];
    loadPage(null, 0);
  });
  retry.addEventListener("click", () => loadPage(pendingCursor, pageIndex));
  previous.addEventListener("click", () => {
    if (pageIndex > 0 && pages[pageIndex - 1]) showPage(pageIndex - 1);
  });
  next.addEventListener("click", () => {
    const cursor = pages[pageIndex]?.nextCursor;
    if (!cursor) return;
    if (pages[pageIndex + 1]) showPage(pageIndex + 1);
    else loadPage(cursor, pageIndex + 1);
  });
  document.getElementById("home").addEventListener("click", () => {
    sequence++;
    query = "";
    pages = [];
    input.value = "";
    results.replaceChildren();
    results.setAttribute("aria-busy", "false");
    section.hidden = true;
    document.body.classList.remove("has-results");
    document.title = "Sreon";
    input.focus();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
})();
