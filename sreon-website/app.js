// ---------- Interactive "Try It" demo (front-end preview only) ----------
(function(){
  const pages = {
    google:    { url: 'google.com',    title: 'Google',    sub: 'This is a placeholder page in the preview — real tabs load the actual site in the full app.' },
    youtube:   { url: 'youtube.com',   title: 'YouTube',   sub: 'Video playback, comments, and everything else work exactly like your normal browser.' },
    github:    { url: 'github.com',    title: 'GitHub',    sub: 'Sign in, browse repos, open pull requests — just like any other tab.' },
    wikipedia: { url: 'wikipedia.org', title: 'Wikipedia', sub: 'Every article, every language — nothing about the page itself is different.' },
  };

  // A small local search index for the address-bar demo below. Everything
  // it searches lives in this array -- typing never leaves the page, which
  // is also why it's instant.
  const SEARCH_INDEX = [
    { title: 'Google', url: 'google.com', snippet: 'Search the web.' },
    { title: 'YouTube', url: 'youtube.com', snippet: 'Watch and share videos.' },
    { title: 'GitHub', url: 'github.com', snippet: 'Host and review code, manage projects.' },
    { title: 'Wikipedia', url: 'wikipedia.org', snippet: 'The free encyclopedia, in every language.' },
    { title: 'Sreon — GitHub repository', url: 'github.com/sreon/sreon', snippet: 'Source code, issues, and releases for the browser itself.' },
    { title: 'How Sreon encrypts your data', url: 'sreon.app/docs/encryption', snippet: 'AES-256-GCM, per-workspace keys, and why it matters.' },
    { title: 'Sreon keyboard shortcuts', url: 'sreon.app/docs/shortcuts', snippet: 'Command menu, tab switching, and everything else.' },
    { title: 'Sreon release notes', url: 'sreon.app/releases', snippet: 'What changed in the latest build.' },
    { title: 'MDN Web Docs', url: 'developer.mozilla.org', snippet: 'Documentation for web platform APIs.' },
    { title: 'Hacker News', url: 'news.ycombinator.com', snippet: 'Links and discussion for programmers.' },
    { title: 'Stack Overflow', url: 'stackoverflow.com', snippet: 'Questions and answers for developers.' },
    { title: 'Signal', url: 'signal.org', snippet: 'Encrypted messaging, end to end.' },
    { title: 'Proton Mail', url: 'proton.me', snippet: 'Encrypted email based in Switzerland.' },
    { title: 'Electronic Frontier Foundation', url: 'eff.org', snippet: 'Digital rights and privacy advocacy.' },
    { title: 'DuckDuckGo', url: 'duckduckgo.com', snippet: 'A search engine that does not track you.' },
    { title: 'Tauri', url: 'tauri.app', snippet: 'The desktop app framework Sreon is built on.' },
  ];

  const demoBody    = document.getElementById('demo-body');
  const tabsWrap    = document.getElementById('demo-tabs');
  const addrInput   = document.getElementById('demo-addr-text');
  const pageEl      = document.getElementById('demo-page');
  const wsRow       = document.getElementById('demo-ws-row');
  const cmdk        = document.getElementById('demo-cmdk');
  const cmdkBtn     = document.getElementById('demo-cmdk-btn');
  const cmdkInput   = document.getElementById('demo-cmdk-input');
  const themeBtn    = document.getElementById('demo-theme-toggle');
  const newTabBtn   = document.getElementById('demo-newtab');

  let currentPage = pages.google;
  let lastResults = [];

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function highlight(text, query){
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if(idx === -1) return text;
    return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
  }
  function looksLikeUrl(v){
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v.trim());
  }
  function domainTitle(v){
    const host = v.trim().split(/[\/?#]/)[0];
    const label = host.split('.')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  // Ranked substring search over SEARCH_INDEX -- title matches rank above
  // snippet/url matches, matches earlier in the string rank above later ones.
  function searchIndex(query){
    const q = query.toLowerCase();
    return SEARCH_INDEX
      .map(item=>{
        const titleIdx = item.title.toLowerCase().indexOf(q);
        const urlIdx = item.url.toLowerCase().indexOf(q);
        const snippetIdx = item.snippet.toLowerCase().indexOf(q);
        const bestIdx = [titleIdx, urlIdx, snippetIdx].filter(i=>i!==-1).sort((a,b)=>a-b)[0];
        if(bestIdx === undefined) return null;
        return { item, titleHit: titleIdx !== -1, rank: (titleIdx !== -1 ? 0 : 1) * 1000 + bestIdx };
      })
      .filter(Boolean)
      .sort((a,b)=>a.rank - b.rank)
      .slice(0, 6)
      .map(r=>r.item);
  }

  function draw(){
    pageEl.classList.remove('is-list');
    pageEl.innerHTML = `<div><div class="demo-page-title">${escapeHtml(currentPage.title)}</div><div class="demo-page-sub">${escapeHtml(currentPage.snippet || currentPage.sub)}</div></div>`;
  }

  function renderSearchResults(query){
    const t0 = performance.now();
    const results = searchIndex(query);
    const ms = (performance.now() - t0).toFixed(2);
    lastResults = results;
    pageEl.classList.add('is-list');

    if(!results.length){
      pageEl.innerHTML = `
        <div class="search-results">
          <div class="search-meta">0 results · ${ms}ms · searched on this device</div>
          <div class="search-empty">No local results for “${escapeHtml(query)}”. In the full app this would load the live page instead.</div>
        </div>`;
      return;
    }

    pageEl.innerHTML = `
      <div class="search-results">
        <div class="search-meta">${results.length} result${results.length > 1 ? 's' : ''} · ${ms}ms · nothing left this device</div>
        ${results.map((r, i) => `
          <div class="search-result" data-idx="${i}" tabindex="0">
            <div class="sr-title">${highlight(escapeHtml(r.title), query)}</div>
            <div class="sr-url">${escapeHtml(r.url)}</div>
            <div class="sr-snippet">${highlight(escapeHtml(r.snippet), query)}</div>
          </div>`).join('')}
      </div>`;
  }

  function navigateTo(target){
    currentPage = { title: target.title, url: target.url, snippet: target.snippet };
    addrInput.value = target.url;
    draw();
    const matchKey = Object.keys(pages).find(k => pages[k].url === target.url);
    [...tabsWrap.children].forEach(t => t.classList.toggle('active', !!matchKey && t.dataset.tab === matchKey));
    addrInput.blur();
  }

  function commitAddress(query){
    const q = query.trim();
    if(!q) return;
    const results = searchIndex(q);
    if(results.length){ navigateTo(results[0]); return; }
    if(looksLikeUrl(q)){
      navigateTo({ title: domainTitle(q), url: q, snippet: 'This is a placeholder page in the preview — real tabs load the actual site in the full app.' });
    }
  }

  function renderPage(key){
    currentPage = pages[key];
    addrInput.value = currentPage.url;
    draw();
  }

  addrInput.addEventListener('input', ()=>{
    const q = addrInput.value;
    if(!q.trim()){ draw(); return; }
    renderSearchResults(q);
  });
  addrInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); commitAddress(addrInput.value); }
    if(e.key === 'Escape'){ addrInput.value = currentPage.url; draw(); addrInput.blur(); }
  });
  addrInput.addEventListener('focus', ()=> addrInput.select());
  addrInput.addEventListener('blur', ()=>{
    if(!addrInput.value.trim()) addrInput.value = currentPage.url;
  });
  pageEl.addEventListener('click', (e)=>{
    const row = e.target.closest('.search-result');
    if(!row) return;
    const target = lastResults[Number(row.dataset.idx)];
    if(target) navigateTo(target);
  });
  pageEl.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    const row = e.target.closest('.search-result');
    if(!row) return;
    const target = lastResults[Number(row.dataset.idx)];
    if(target) navigateTo(target);
  });

  tabsWrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('.demo-tab');
    if(!btn) return;
    [...tabsWrap.children].forEach(t=>t.classList.toggle('active', t===btn));
    renderPage(btn.dataset.tab);
  });

  wsRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.demo-ws');
    if(!btn) return;
    [...wsRow.children].forEach(w=>w.classList.toggle('active', w===btn));
    // switching workspace resets the visible tab to Google, isolated like real workspaces
    [...tabsWrap.children].forEach((t,i)=>t.classList.toggle('active', i===0));
    renderPage('google');
  });

  newTabBtn.addEventListener('click', ()=>{
    [...tabsWrap.children].forEach((t,i)=>t.classList.toggle('active', i===0));
    renderPage('google');
  });

  function openCmdk(){
    cmdk.classList.add('open');
    setTimeout(()=>cmdkInput && cmdkInput.focus(), 60);
  }
  function closeCmdk(){ cmdk.classList.remove('open'); }

  cmdkBtn.addEventListener('click', ()=>{
    cmdk.classList.contains('open') ? closeCmdk() : openCmdk();
  });
  document.addEventListener('keydown', (e)=>{
    if(!demoBody) return;
    if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){
      e.preventDefault(); openCmdk();
    }
    if(e.key === 'Escape') closeCmdk();
  });
  document.addEventListener('click', (e)=>{
    if(cmdk.classList.contains('open') && !cmdk.contains(e.target) && e.target !== cmdkBtn){
      closeCmdk();
    }
  });

  themeBtn.addEventListener('click', ()=>{
    demoBody.classList.toggle('light');
    themeBtn.innerHTML = demoBody.classList.contains('light') ? '&#127769; Toggle theme' : '&#9728; Toggle theme';
  });

  renderPage('google');
})();

// ---------- Smooth-scroll nav (native scroll-behavior already handles most,
// this just accounts for the sticky header height) ----------
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', (e)=>{
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if(!target) return;
    e.preventDefault();
    const headerH = document.querySelector('.site-header').offsetHeight;
    const y = target.getBoundingClientRect().top + window.scrollY - headerH - 10;
    window.scrollTo({ top: y, behavior:'smooth' });
  });
});

// ---------- Scroll-triggered reveal ----------
// Adds .is-visible to any .reveal element once it enters the viewport.
// Respects prefers-reduced-motion by doing nothing extra -- the CSS rule
// for that media query already renders .reveal elements fully visible.
(function(){
  const items = document.querySelectorAll('.reveal');
  if(!items.length) return;

  if(!('IntersectionObserver' in window)){
    items.forEach(el=>el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach(el=>io.observe(el));
})();

// ---------- Live address bar (signature element) ----------
// Tracks which section is in view and updates the sreon:// address strip
// under the header to match -- echoes the product's own tab/address bar.
(function(){
  const liveAddr = document.getElementById('live-addr');
  if(!liveAddr) return;

  const routes = {
    top:      'sreon://top',
    why:      'sreon://why',
    features: 'sreon://features',
    try:      'sreon://try-it',
    privacy:  'sreon://privacy',
    download: 'sreon://download',
  };

  const sections = Object.keys(routes)
    .map(id=>document.getElementById(id))
    .filter(Boolean);

  if(!sections.length || !('IntersectionObserver' in window)) return;

  let current = '';
  function setAddr(id){
    if(id === current) return;
    current = id;
    liveAddr.style.opacity = '0';
    setTimeout(()=>{
      liveAddr.textContent = routes[id];
      liveAddr.style.opacity = '1';
    }, 120);
  }

  const spy = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting) setAddr(entry.target.id);
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(sec=>spy.observe(sec));
})();
