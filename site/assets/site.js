const themeButton = document.querySelector('#theme');
function themeLabel() { themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} mode`); }
themeLabel();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sreon-site-theme', theme); } catch {}
  themeLabel();
});
const $ = (s) => document.querySelector(s);
const form = $('#search-form'), query = $('#query'), results = $('#results'), status = $('#search-status'), submit = $('#search-submit'), more = $('#more');
const preview = $('#site-preview'), previewFrame = $('#preview-frame'), previewAddress = $('#preview-address'), previewOpen = $('#preview-open');
const newtab = $('#newtab'), tabsEl = $('#tabs'), back = $('#nav-back'), forward = $('#nav-forward'), shieldBtn = $('#shields'), shieldPanel = $('#shield-panel');
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let tabs = [], active = null, tabId = 0, sequence = 0, request = null;

// Address bar: anything that looks like a web address is opened, everything else is searched.
function asUrl(text) {
  if (/\s/.test(text)) return null;
  const raw = /^https?:\/\//i.test(text) ? text : /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(text) || /^localhost([:/]|$)/.test(text) ? 'https://' + text : null;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === 'http:' && $('#sh-https').checked) url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}
const cur = () => active.hist[active.i];
function newTab() { const t = { id: ++tabId, hist: [{ type: 'new' }], i: 0 }; tabs.push(t); active = t; render(); }
function go(entry) { active.hist.splice(active.i + 1); active.hist.push(entry); active.i++; render(); }
function step(d) { const i = active.i + d; if (i < 0 || i >= active.hist.length) return; active.i = i; render(); }
function titleOf(t) { const e = t.hist[t.i]; return e.type === 'search' ? e.q : e.type === 'site' ? new URL(e.url).hostname : 'New Tab'; }
function renderTabs() {
  tabsEl.replaceChildren(...tabs.map((t) => {
    const tab = document.createElement('div'); tab.className = 'tab'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(t === active));
    const title = document.createElement('button'); title.type = 'button'; title.className = 'tab-title'; title.textContent = titleOf(t);
    title.addEventListener('click', () => { active = t; render(); });
    const close = document.createElement('button'); close.type = 'button'; close.className = 'tab-x'; close.setAttribute('aria-label', 'Close tab'); close.textContent = '×';
    close.addEventListener('click', () => {
      const n = tabs.indexOf(t); tabs.splice(n, 1);
      if (!tabs.length) { newTab(); return; }
      if (t === active) active = tabs[Math.min(n, tabs.length - 1)];
      render();
    });
    tab.append(title, close); return tab;
  }));
}
function render() {
  request?.abort(); sequence++;
  const e = cur();
  back.disabled = active.i === 0; forward.disabled = active.i === active.hist.length - 1;
  renderTabs();
  results.replaceChildren(); more.hidden = true; submit.disabled = false; results.setAttribute('aria-busy', 'false');
  newtab.hidden = e.type !== 'new'; preview.hidden = e.type !== 'site';
  if (e.type !== 'site') { previewFrame.src = 'about:blank'; previewOpen.removeAttribute('href'); }
  if (e.type === 'new') { query.value = ''; return; }
  if (e.type === 'site') {
    query.value = e.url; previewAddress.textContent = new URL(e.url).hostname; previewOpen.href = e.url;
    previewFrame.setAttribute('sandbox', 'allow-forms allow-downloads' + ($('#sh-scripts').checked ? '' : ' allow-scripts allow-same-origin'));
    previewFrame.src = e.url; status.dataset.error = 'false';
    status.textContent = `Loading ${new URL(e.url).hostname}. If it stays blank, the site blocks embedding: use “Open original”.`;
    return;
  }
  query.value = e.q;
  if (e.loaded) { e.items.forEach(addResult); more.hidden = !e.cursor; status.dataset.error = 'false'; status.textContent = `${e.items.length} results for “${e.q}”.`; }
  else fetchResults(e, false);
}
function addResult(item) {
  const url = new URL(item.url);
  const article = document.createElement('article'); article.className = 'result';
  const source = document.createElement('small'); source.textContent = url.hostname;
  const link = document.createElement('a'); link.href = url.href; link.textContent = item.title || url.hostname; link.rel = 'noreferrer';
  link.addEventListener('click', (event) => { event.preventDefault(); go({ type: 'site', url: asUrl(url.href) || url.href }); requestAnimationFrame(() => preview.scrollIntoView({ behavior: calm() ? 'instant' : 'smooth', block: 'nearest' })); });
  const excerpt = document.createElement('p'); excerpt.textContent = item.content || '';
  article.append(source, link, excerpt); results.append(article);
}
async function fetchResults(e, append) {
  request?.abort();
  const controller = new AbortController(); request = controller;
  const id = ++sequence;
  const timer = setTimeout(() => controller.abort(), 25000);
  more.hidden = true; submit.disabled = true; results.setAttribute('aria-busy', 'true');
  status.dataset.error = 'false'; status.textContent = 'Searching the web…';
  try {
    const endpoint = $('meta[name="sreon-search-endpoint"]').content;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: e.q, category: 'web', cursor: append ? e.cursor : null }), credentials: 'omit', signal: controller.signal, referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('A few too many searches. Please wait a minute and try again.');
      if (failure.code === 'SOURCE_UNAVAILABLE') throw new Error('The Rust engine is running, but its search sources could not be reached. Please retry shortly.');
      if (failure.code === 'BACKEND_NOT_READY' || response.status === 404) throw new Error('The website search backend is not connected yet.');
      throw new Error('Search is temporarily unavailable. Please try again.');
    }
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('The search service returned an unexpected response.');
    if (id !== sequence) return;
    let added = 0;
    for (const item of data.results) {
      let url;
      try { url = new URL(item.url); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      e.items.push(item); addResult(item); added++;
    }
    e.loaded = true; e.cursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
    more.hidden = !e.cursor;
    status.textContent = added ? `${results.children.length} results for “${e.q}”.${data.cached ? ' From the engine’s short-lived cache.' : ''}${data.notice ? ' ' + data.notice : ''}` : data.notice || 'No results this time. Try another search.';
  } catch (error) {
    if (id !== sequence) return;
    status.dataset.error = 'true';
    status.textContent = error.name === 'AbortError' ? 'The search took too long. Please try again.' : error.message;
    if (append && e.cursor) more.hidden = false;
  } finally {
    clearTimeout(timer);
    if (id === sequence) { submit.disabled = false; results.setAttribute('aria-busy', 'false'); }
  }
}
function openQuery(text) {
  const value = text.trim();
  if (!value) { query.focus(); return; }
  const url = asUrl(value);
  go(url ? { type: 'site', url } : { type: 'search', q: value, items: [], cursor: null, loaded: false });
}
form.addEventListener('submit', (event) => { event.preventDefault(); openQuery(query.value); });
more.addEventListener('click', () => fetchResults(cur(), true));
back.addEventListener('click', () => step(-1));
forward.addEventListener('click', () => step(1));
$('#preview-back').addEventListener('click', () => step(-1));
$('#new-tab').addEventListener('click', () => { newTab(); query.focus(); });
$('#nav-reload').addEventListener('click', () => { const e = cur(); if (e.type === 'search') { e.items = []; e.loaded = false; } if (e.type !== 'new') render(); });
$('#sh-scripts').addEventListener('change', () => { if (cur().type === 'site') render(); });
shieldBtn.addEventListener('click', (event) => { event.stopPropagation(); shieldPanel.hidden = !shieldPanel.hidden; shieldBtn.setAttribute('aria-expanded', String(!shieldPanel.hidden)); });
document.addEventListener('click', (event) => { if (!shieldPanel.hidden && !shieldPanel.contains(event.target)) { shieldPanel.hidden = true; shieldBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !shieldPanel.hidden) { shieldPanel.hidden = true; shieldBtn.setAttribute('aria-expanded', 'false'); shieldBtn.focus(); } });
document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => { query.value = button.dataset.query; $('#try').scrollIntoView({ behavior: calm() ? 'instant' : 'smooth' }); openQuery(button.dataset.query); }));
newTab();

async function checkBackend() {
  try {
    const endpoint = new URL($('meta[name="sreon-search-endpoint"]').content, location.href);
    endpoint.pathname = endpoint.pathname.replace(/\/search\/?$/, '/health');
    endpoint.search = '';
    const response = await fetch(endpoint, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (sequence > 1) return;
    if (!response.ok || !data.ready || data.engine !== 'rust') throw new Error('Backend unavailable');
    status.textContent = 'Connected to the Rust search engine. What are you curious about?';
  } catch {
    if (sequence <= 1) { status.dataset.error = 'true'; status.textContent = 'The website search backend is not connected yet.'; }
  }
}
checkBackend();
