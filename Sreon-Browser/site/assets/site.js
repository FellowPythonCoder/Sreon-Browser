const themeButton = document.querySelector('#theme');
function themeLabel() { themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} mode`); }
themeLabel();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sreon-site-theme', theme); } catch {}
  themeLabel();
});
const form = document.querySelector('#search-form');
const query = document.querySelector('#query');
const results = document.querySelector('#results');
const status = document.querySelector('#search-status');
const submit = document.querySelector('#search-submit');
const more = document.querySelector('#more');
let cursor = null;
let lastQuery = '';
let request = null;
let sequence = 0;
async function search(append = false) {
  const q = append ? lastQuery : query.value.trim();
  if (!q) { query.focus(); return; }
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const id = ++sequence;
  const timer = setTimeout(() => controller.abort(), 25000);
  if (!append) { results.replaceChildren(); cursor = null; lastQuery = q; }
  more.hidden = true;
  submit.disabled = true;
  results.setAttribute('aria-busy', 'true');
  status.dataset.error = 'false';
  status.textContent = 'Searching the web…';
  try {
    const endpoint = document.querySelector('meta[name="sreon-search-endpoint"]').content;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, category: 'web', cursor: append ? cursor : null }), credentials: 'omit', signal: controller.signal, referrerPolicy: 'no-referrer' });
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
      const article = document.createElement('article'); article.className = 'result';
      const source = document.createElement('small'); source.textContent = url.hostname;
      const link = document.createElement('a'); link.href = url.href; link.textContent = item.title || url.hostname; link.rel = 'noreferrer';
      const excerpt = document.createElement('p'); excerpt.textContent = item.content || '';
      article.append(source, link, excerpt); results.append(article); added++;
    }
    cursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
    more.hidden = !cursor;
    status.textContent = added ? `${results.children.length} results for “${q}”.${data.cached ? ' From the engine’s short-lived cache.' : ''}${data.notice ? ' ' + data.notice : ''}` : data.notice || 'No results this time. Try another search.';
  } catch (error) {
    if (id !== sequence) return;
    status.dataset.error = 'true';
    status.textContent = error.name === 'AbortError' ? 'The search took too long. Please try again.' : error.message;
    if (append && cursor) more.hidden = false;
  } finally {
    clearTimeout(timer);
    if (id === sequence) { submit.disabled = false; results.setAttribute('aria-busy', 'false'); }
  }
}
form.addEventListener('submit', (event) => { event.preventDefault(); search(); });
document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => { query.value = button.dataset.query; document.querySelector('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); search(); }));
more.addEventListener('click', () => search(true));

async function checkBackend() {
  try {
    const endpoint = new URL(document.querySelector('meta[name="sreon-search-endpoint"]').content, location.href);
    endpoint.pathname = endpoint.pathname.replace(/\/search\/?$/, '/health');
    endpoint.search = '';
    const response = await fetch(endpoint, { credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(12000) });
    const data = await response.json();
    if (sequence) return;
    if (!response.ok || !data.ready || data.engine !== 'rust') throw new Error('Backend unavailable');
    status.textContent = 'Connected to the Rust search engine. What are you curious about?';
  } catch {
    if (!sequence) { status.dataset.error = 'true'; status.textContent = 'The website search backend is not connected yet.'; }
  }
}
checkBackend();
