// Sreon’s public bug chat.
//
// One shared thread, read and written by everybody: GET /api/bugs brings the
// whole conversation, POST adds a report or a reply, and the token handed back
// once at post time is what lets this browser remove its own posts later.
// Nothing from the thread is ever inserted as markup — every string goes through
// textContent, and an uploaded image is only ever shown from its own URL.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const API = '/api/bugs';
  const ISSUE_URL = 'https://github.com/FellowPythonCoder/Sreon-Browser/issues/new';
  const SEVERITIES = { crash: 'Crash', broken: 'Broken', minor: 'Minor', idea: 'Idea' };
  const NAME_KEY = 'sreon-bug-name';
  const TOKEN_KEY = 'sreon-bug-tokens';
  const MAX_IMAGES = 3;
  const IMAGE_EDGE = 1600;
  const IMAGE_CEILING = 2 * 1024 * 1024; // the server enforces the same ceiling
  const FILE_NAME = /^[a-z0-9-]{1,80}\.(png|jpg|webp|gif)$/;
  const POLL_MS = 25000;

  const thread = $('#thread');
  const emptyThread = $('#thread-empty').cloneNode(true);
  const composer = $('#composer');
  let entries = [];
  let tokens = {};
  let intake = 'checking'; // 'open' | 'closed' | 'checking'
  let filter = 'all';
  let query = '';
  let replyTo = null;
  let shots = [];
  let known = new Set();
  let rendered = null;
  let timer = 0;
  let shotKey = 0;

  /* ------------------------------------------------------- small helpers -- */

  function status(text, tone = 'info') {
    const line = $('#composer-status');
    line.textContent = text;
    line.dataset.tone = tone;
  }
  function clip(value, maximum) {
    const text = String(value ?? '').trim();
    return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
  }
  function when(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
    if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
    return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function stamp(iso) {
    const then = new Date(iso);
    return Number.isNaN(then.getTime()) ? '' : then.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function reader() {
    const value = $('#reader-name').value.trim();
    return value || 'Anonymous';
  }
  function initial(name) {
    return (name || 'A').trim().charAt(0).toUpperCase() || 'A';
  }
  function detectPlatform() {
    const agent = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS';
    if (/Android/i.test(agent)) return 'Android';
    if (/Macintosh|Mac OS X/i.test(agent)) return 'macOS';
    if (/Windows/i.test(agent)) return 'Windows';
    if (/CrOS/i.test(agent)) return 'ChromeOS';
    if (/Linux/i.test(agent)) return 'Linux';
    return navigator.userAgentData?.platform || '';
  }
  function loadTokens() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
      tokens = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { tokens = {}; }
  }
  function saveTokens() {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens)); } catch {}
  }
  const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function reveal(element) {
    try { element.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' }); } catch {}
  }
  function grow(field, ceiling = 240) {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, ceiling)}px`;
  }

  /* ------------------------------------------------------------- images --- */

  // A screenshot is resized in the reader’s own browser before it is sent, so
  // the thread stays light and nothing full-resolution leaves the machine.
  async function shrink(file) {
    if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
    if (file.size > 12 * 1024 * 1024) throw new Error(`${clip(file.name, 30)} is larger than 12 MB.`);
    const bitmap = await createImageBitmap(file).catch(async () => {
      const url = URL.createObjectURL(file);
      try {
        return await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('That image could not be read.'));
          image.src = url;
        });
      } finally { setTimeout(() => URL.revokeObjectURL(url), 4000); }
    });
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) throw new Error('That image has no size.');
    const scale = Math.min(1, IMAGE_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    // An animated GIF is sent as it arrived; everything else is re-encoded.
    if (file.type === 'image/gif' && file.size <= IMAGE_CEILING) {
      const dataUrl = await new Promise((resolve, reject) => {
        const handle = new FileReader();
        handle.onload = () => resolve(String(handle.result));
        handle.onerror = () => reject(new Error('That image could not be read.'));
        handle.readAsDataURL(file);
      });
      return { canvas, dataUrl, bytes: file.size, name: clip(file.name, 60) || 'screenshot.gif' };
    }
    let dataUrl = canvas.toDataURL('image/webp', 0.85);
    let suffix = '.webp';
    if (!dataUrl.startsWith('data:image/webp')) { dataUrl = canvas.toDataURL('image/jpeg', 0.85); suffix = '.jpg'; }
    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (bytes > IMAGE_CEILING) throw new Error('That image is still too big after resizing. Try a smaller one.');
    return { canvas, dataUrl, bytes, name: `${clip(file.name.replace(/\.[a-z0-9]+$/i, ''), 50) || 'screenshot'}${suffix}` };
  }
  async function attach(list) {
    const files = Array.from(list || []).slice(0, MAX_IMAGES - shots.length);
    if (!files.length) {
      if ((list || []).length) status(`A post carries ${MAX_IMAGES} images at most. Remove one first.`, 'warn');
      return;
    }
    for (const file of files) {
      try {
        shots.push({ key: `shot-${++shotKey}`, ...await shrink(file) });
      } catch (error) { status(error.message, 'warn'); }
    }
    renderShots();
    if (shots.length) status(`${shots.length} image${shots.length === 1 ? '' : 's'} ready to post.`, 'info');
  }
  function renderShots() {
    const host = $('#attachments');
    host.replaceChildren();
    for (const shot of shots) {
      const figure = document.createElement('figure');
      figure.className = 'attachment';
      const preview = shot.canvas.cloneNode(true);
      preview.getContext('2d').drawImage(shot.canvas, 0, 0);
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', `Preview of ${shot.name}`);
      const caption = document.createElement('figcaption');
      caption.textContent = `${shot.name} · ${Math.max(1, Math.round(shot.bytes / 1024))} KB`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${shot.name}`);
      remove.addEventListener('click', () => { shots = shots.filter((entry) => entry.key !== shot.key); renderShots(); });
      figure.append(preview, caption, remove);
      host.append(figure);
    }
    host.hidden = shots.length === 0;
  }

  /* ------------------------------------------------------- markdown out --- */

  function markdown(entry) {
    if (entry.kind === 'reply') {
      return `> ${SEVERITIES[entry.severity] || ''} reply from ${entry.name || 'Anonymous'} · ${stamp(entry.at)}\n\n${entry.text || ''}\n`;
    }
    const lines = [`## ${SEVERITIES[entry.severity]} · ${entry.area} — ${entry.title}`, ''];
    lines.push(`- **Reported by:** ${entry.name || 'Anonymous'}`);
    lines.push(`- **When:** ${stamp(entry.at)}`);
    lines.push(`- **Severity:** ${SEVERITIES[entry.severity]}`);
    lines.push(`- **Where:** ${entry.area}`);
    if (entry.version) lines.push(`- **Sreon version:** ${entry.version}`);
    if (entry.platform) lines.push(`- **System:** ${entry.platform}`);
    if (entry.contact) lines.push(`- **Contact:** ${entry.contact}`);
    if (entry.steps) lines.push('', '### What I did', '', entry.steps);
    if (entry.expected) lines.push('', '### What I expected', '', entry.expected);
    const answers = entries.filter((item) => item.kind === 'reply' && item.parent === entry.id);
    if (answers.length) lines.push('', `### ${answers.length} repl${answers.length === 1 ? 'y' : 'ies'}`, '', ...answers.map((item) => `- **${item.name || 'Anonymous'}**, ${stamp(item.at)}: ${item.text}`));
    return `${lines.join('\n')}\n`;
  }
  function issueLink(entry) {
    const body = `${markdown(entry)}\n---\n\nPosted in the public bug chat at opensreon.com/report/.\n`;
    return `${ISSUE_URL}?title=${encodeURIComponent(clip(`[Bug] ${entry.title}`, 90))}&body=${encodeURIComponent(body)}`;
  }
  function exportThread() {
    const shown = reports().filter(matches);
    if (!shown.length) return;
    const heading = `# Sreon bug chat\n\n${shown.length} report${shown.length === 1 ? '' : 's'} exported from ${location.origin}/report/ on ${new Date().toLocaleString()}.\n`;
    const file = new Blob([heading, '\n---\n\n', shown.map(markdown).join('\n---\n\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sreon-bug-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    status(`Exported ${shown.length} report${shown.length === 1 ? '' : 's'} as Markdown.`, 'ok');
  }
  async function copyText(text, button, done = 'Copied') {
    const label = button.textContent;
    try { await navigator.clipboard.writeText(text); button.textContent = done; }
    catch { button.textContent = 'Select and copy'; }
    setTimeout(() => { button.textContent = label; }, 2200);
  }

  /* --------------------------------------------------------------- thread - */

  const reports = () => entries.filter((entry) => entry.kind === 'report');
  const repliesOf = (id) => entries.filter((entry) => entry.kind === 'reply' && entry.parent === id);
  function haystack(entry) {
    return [entry.title, entry.steps, entry.expected, entry.text, entry.name, entry.area, entry.version, entry.platform].filter(Boolean).join('\n').toLowerCase();
  }
  function matches(entry) {
    const answers = repliesOf(entry.id);
    if (filter === 'mine' && ![entry, ...answers].some((item) => tokens[item.id])) return false;
    if (filter !== 'all' && filter !== 'mine' && entry.severity !== filter) return false;
    if (!query) return true;
    return [entry, ...answers].some((item) => haystack(item).includes(query));
  }
  function shotsFor(entry) {
    const host = document.createDocumentFragment();
    for (const name of entry.images || []) {
      if (!FILE_NAME.test(name)) continue; // only names the server could have issued
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shot';
      const image = document.createElement('img');
      image.src = `${API}/files/${encodeURIComponent(name)}`;
      image.alt = `Screenshot attached to: ${clip(entry.title || entry.text || 'a post', 60)}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => button.remove());
      button.append(image);
      button.addEventListener('click', () => viewShot(image.src, image.alt));
      host.append(button);
    }
    return host;
  }
  function who(entry) {
    const head = document.createElement('div');
    head.className = 'who';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initial(entry.name);
    const label = document.createElement('p');
    const name = document.createElement('b');
    name.textContent = entry.name || 'Anonymous';
    label.append(name);
    if (entry.at) {
      const time = document.createElement('time');
      time.dateTime = entry.at;
      time.title = stamp(entry.at);
      time.textContent = when(entry.at);
      label.append(document.createTextNode(' '), time);
    }
    head.append(avatar, label);
    return head;
  }
  function actions(entry, { reply = false } = {}) {
    const bar = document.createElement('span');
    bar.className = 'post-actions';
    if (reply) {
      const answer = document.createElement('button');
      answer.type = 'button';
      answer.textContent = 'Reply';
      answer.addEventListener('click', () => startReply(entry));
      bar.append(answer);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyText(markdown(entry), copy));
    bar.append(copy);
    if (entry.kind === 'report') {
      const issue = document.createElement('a');
      issue.href = issueLink(entry);
      issue.target = '_blank';
      issue.rel = 'noopener noreferrer';
      issue.textContent = 'GitHub ↗';
      bar.append(issue);
    }
    if (tokens[entry.id]) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => withdraw(entry, remove));
      bar.append(remove);
    }
    return bar;
  }
  function replyCard(entry) {
    const article = document.createElement('article');
    article.className = 'post reply';
    article.dataset.id = entry.id;
    const body = document.createElement('div');
    body.className = 'reply-body';
    const text = document.createElement('p');
    text.textContent = entry.text || '';
    body.append(text);
    const images = entry.images?.length ? document.createElement('div') : null;
    if (images) { images.className = 'shots'; images.append(shotsFor(entry)); body.append(images); }
    article.append(who(entry), body, actions(entry));
    return article;
  }
  function reportCard(entry) {
    const article = document.createElement('article');
    article.className = `post report severity-${entry.severity}`;
    article.dataset.id = entry.id;
    const head = document.createElement('header');
    head.className = 'post-head';
    head.append(who(entry));
    const tags = document.createElement('span');
    tags.className = 'post-tags';
    const severity = document.createElement('span');
    severity.className = 'tag severity';
    severity.textContent = SEVERITIES[entry.severity] || entry.severity;
    const area = document.createElement('span');
    area.className = 'tag';
    area.textContent = entry.area || 'Other';
    tags.append(severity, area);
    head.append(tags);

    const title = document.createElement('h3');
    title.className = 'post-title';
    title.textContent = entry.title || '';

    article.append(head, title);

    if (entry.steps || entry.expected) {
      const body = document.createElement('div');
      body.className = 'post-body';
      for (const [label, value] of [['What I did', entry.steps], ['What I expected', entry.expected]]) {
        if (!value) continue;
        const part = document.createElement('p');
        const name = document.createElement('span');
        name.textContent = label;
        part.append(name, document.createTextNode(value));
        body.append(part);
      }
      article.append(body);
    }
    if (entry.images?.length) {
      const gallery = document.createElement('div');
      gallery.className = 'shots';
      gallery.append(shotsFor(entry));
      article.append(gallery);
    }

    const answers = repliesOf(entry.id);
    const foot = document.createElement('footer');
    foot.className = 'post-foot';
    const meta = document.createElement('span');
    meta.className = 'post-meta';
    meta.textContent = [entry.version && `Sreon ${entry.version}`, entry.platform, entry.contact && `Contact ${entry.contact}`, `${answers.length} repl${answers.length === 1 ? 'y' : 'ies'}`].filter(Boolean).join(' · ');
    foot.append(meta, actions(entry, { reply: true }));
    article.append(foot);

    if (answers.length) {
      const list = document.createElement('div');
      list.className = 'replies';
      list.append(...answers.map(replyCard));
      article.append(list);
    }
    return article;
  }
  function render() {
    const pinned = atBottom();
    const place = thread.scrollTop;
    const shown = reports().filter(matches);
    $('#copy-thread').disabled = entries.length === 0;
    $('#download-thread').disabled = entries.length === 0;
    const replies = entries.filter((entry) => entry.kind === 'reply').length;
    const crashes = reports().filter((entry) => entry.severity === 'crash').length;
    $('#stat-reports').textContent = String(reports().length);
    $('#stat-replies').textContent = String(replies);
    $('#stat-crashes').textContent = String(crashes);
    $('#thread-summary').textContent = intake === 'closed'
      ? 'No shared inbox on this host'
      : reports().length
        ? `${reports().length} report${reports().length === 1 ? '' : 's'} · ${replies} repl${replies === 1 ? 'y' : 'ies'}`
        : 'Open thread · nothing reported yet';
    $('#thread-dot').classList.toggle('connected', intake === 'open');
    $('#filter-note').textContent = filter === 'all' && !query
      ? 'Showing the whole thread.'
      : `Showing ${shown.length} of ${reports().length} report${reports().length === 1 ? '' : 's'}.`;

    if (!shown.length) {
      const placeholder = entries.length ? document.createElement('div') : emptyThread.cloneNode(true);
      if (entries.length) {
        placeholder.id = 'thread-empty';
        placeholder.className = 'thread-none';
        const mark = document.createElement('span');
        mark.className = 'empty-mark';
        mark.textContent = '✳';
        const heading = document.createElement('h3');
        heading.textContent = 'Nothing matches that.';
        const note = document.createElement('p');
        note.textContent = 'Try another filter, or clear the search box.';
        placeholder.append(mark, heading, note);
      }
      thread.replaceChildren(placeholder);
      return;
    }
    thread.replaceChildren(...shown.map(reportCard));
    thread.scrollTop = pinned ? thread.scrollHeight : place;
  }
  function atBottom() {
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  }
  function viewShot(src, alt) {
    const viewer = $('#shot-viewer');
    $('#shot-image').src = src;
    $('#shot-image').alt = alt;
    $('#shot-caption').textContent = alt;
    if (typeof viewer.showModal === 'function') viewer.showModal();
    else viewer.setAttribute('open', '');
  }

  /* ---------------------------------------------------------------- sync -- */

  function describeIntake() {
    const card = $('#intake-card');
    card.dataset.state = intake;
    if (intake === 'open') {
      $('#intake-label').textContent = 'Inbox open · posts are shared';
      $('#intake-note').textContent = 'Everything posted here is stored on this host and shown to every visitor.';
      $('#composer-note').textContent = 'Public · 3 images max · paste or drop a screenshot';
    } else if (intake === 'closed') {
      $('#intake-label').textContent = 'No shared inbox on this host';
      $('#intake-note').textContent = 'This copy of the site cannot store the thread, so posts cannot be shared. Write it here, then copy it or open it on GitHub.';
      $('#composer-note').textContent = 'Not shared · copy the report or open it on GitHub';
    } else {
      $('#intake-label').textContent = 'Connecting to the bug inbox…';
      $('#intake-note').textContent = 'Checking whether this host keeps the shared thread.';
    }
  }
  async function sync({ announce = true, silent = false } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(API, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ready || !Array.isArray(data.entries)) throw new Error(data?.error || 'The inbox is not answering.');
      intake = 'open';
      const signature = data.entries.map((entry) => entry.id).join(' ');
      const fresh = data.entries.filter((entry) => !known.has(entry.id)).length;
      entries = data.entries;
      known = new Set(entries.map((entry) => entry.id));
      describeIntake();
      if (signature !== rendered) {
        const following = atBottom();
        rendered = signature;
        render(); // render() holds the reader’s place, or follows the thread
        const cue = $('#thread-cue');
        if (announce && fresh && !following) {
          cue.hidden = false;
          cue.textContent = `↓ ${fresh} new post${fresh === 1 ? '' : 's'}`;
        } else cue.hidden = true;
      }
      $('#last-sync').textContent = `Synced ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
      return true;
    } catch (error) {
      intake = 'closed';
      describeIntake();
      render();
      $('#last-sync').textContent = 'Not synced';
      if (!silent) status(error.name === 'AbortError' ? 'The inbox took too long to answer. Try Refresh now.' : error.message, 'warn');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
  function poll() {
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && intake === 'open') sync(); }, POLL_MS);
  }

  /* ---------------------------------------------------------------- post -- */

  function startReply(entry) {
    replyTo = entry;
    $('#reply-banner').hidden = false;
    $('#reply-title').textContent = clip(entry.title, 60);
    $('#report-fields').hidden = true;
    $('#reply-fields').hidden = false;
    $('#composer-send').textContent = 'Post reply ↗';
    $('#reply-text').value = '';
    grow($('#reply-text'));
    $('#reply-text').focus();
    try { composer.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); } catch {}
  }
  function cancelReply() {
    replyTo = null;
    $('#reply-banner').hidden = true;
    $('#report-fields').hidden = false;
    $('#reply-fields').hidden = true;
    $('#composer-send').textContent = 'Post bug ↗';
    $('#reply-text').value = '';
  }
  async function send(payload, button) {
    if (intake === 'closed') {
      status('This host has no shared inbox, so nothing can be posted. Use Copy, or open it as a GitHub issue.', 'warn');
      return false;
    }
    button.disabled = true;
    button.textContent = 'Posting…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || (response.status === 429 ? 'Too many posts from here. Come back in an hour.' : 'The inbox refused that post.'));
      if (data.id && data.token) { tokens[data.id] = data.token; saveTokens(); }
      shots = [];
      renderShots();
      cancelReply();
      await sync({ announce: false, silent: true });
      const posted = thread.querySelector(`[data-id="${CSS.escape(data.id)}"]`);
      if (posted) {
        posted.classList.add('just-posted');
        reveal(posted);
        setTimeout(() => posted.classList.remove('just-posted'), 2600);
      }
      status(payload.kind === 'reply' ? 'Reply posted. Everybody reading the thread can see it.' : 'Posted. Thank you — that one is now on the list.', 'ok');
      return true;
    } catch (error) {
      status(error.name === 'AbortError' ? 'Posting timed out. Your text is still here — try again.' : error.message, 'warn');
      return false;
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      button.textContent = replyTo ? 'Post reply ↗' : 'Post bug ↗';
    }
  }
  async function withdraw(entry, button) {
    if (!tokens[entry.id]) return;
    button.disabled = true;
    button.textContent = 'Deleting…';
    try {
      const response = await fetch(`${API}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, token: tokens[entry.id] }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'That post could not be removed.');
      known.delete(entry.id);
      for (const answer of [entry, ...repliesOf(entry.id)]) delete tokens[answer.id];
      saveTokens();
      if (replyTo?.id === entry.id) cancelReply();
      await sync({ announce: false, silent: true });
      status(entry.kind === 'reply' ? 'Reply removed from the thread.' : `Report removed${data.replies ? `, with its ${data.replies} repl${data.replies === 1 ? 'y' : 'ies'}` : ''}.`, 'ok');
    } catch (error) {
      status(error.message, 'warn');
      button.disabled = false;
      button.textContent = 'Delete';
    }
  }
  async function submit() {
    const name = clip(reader(), 40);
    if (replyTo) {
      const text = $('#reply-text').value.trim();
      if (!text) { status('A reply needs words. Add what you saw, and attach a screenshot if it helps.', 'warn'); $('#reply-text').focus(); return; }
      await send({ kind: 'reply', parent: replyTo.id, name, text, images: shots.map((shot) => shot.dataUrl) }, $('#composer-send'));
      $('#reply-text').value = '';
      grow($('#reply-text'));
      return;
    }
    const title = $('#bug-title').value.trim();
    if (!title) { status('Give the bug a one-line title so it can be found later.', 'warn'); $('#bug-title').focus(); return; }
    const payload = {
      kind: 'report',
      name,
      title,
      severity: composer.querySelector('input[name=severity]:checked')?.value || 'broken',
      area: $('#bug-area').value,
      steps: $('#bug-steps').value.trim(),
      expected: $('#bug-expected').value.trim(),
      version: $('#bug-version').value.trim(),
      platform: $('#bug-platform').value.trim(),
      contact: $('#bug-contact').value.trim(),
      images: shots.map((shot) => shot.dataUrl),
    };
    if (await send(payload, $('#composer-send'))) {
      composer.reset();
      $('#bug-details').open = false;
      $('#bug-version').value = '1.1';
      $('#bug-platform').value = detectPlatform();
      $('#bug-title-count').textContent = '0/120';
      for (const field of [$('#bug-steps'), $('#bug-expected')]) grow(field);
    }
  }

  /* -------------------------------------------------------------- wiring -- */

  $('#reader-name').addEventListener('change', () => {
    try { localStorage.setItem(NAME_KEY, $('#reader-name').value.trim()); } catch {}
  });
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    $$('.chip').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
    render();
  }));
  $('#thread-search').addEventListener('input', (event) => { query = event.target.value.trim().toLowerCase(); render(); });
  $('#sync-now').addEventListener('click', () => sync().then((ok) => ok && status('Thread refreshed.', 'ok')));
  $('#thread-cue').addEventListener('click', () => { thread.scrollTop = thread.scrollHeight; $('#thread-cue').hidden = true; });
  $('#copy-thread').addEventListener('click', (event) => copyText(reports().filter(matches).map(markdown).join('\n---\n\n'), event.currentTarget, 'Thread copied'));
  $('#download-thread').addEventListener('click', exportThread);
  $('#reply-cancel').addEventListener('click', cancelReply);
  $('#composer-reset').addEventListener('click', () => {
    composer.reset();
    cancelReply();
    shots = [];
    renderShots();
    $('#bug-details').open = false;
    $('#bug-title-count').textContent = '0/120';
    for (const field of [$('#bug-steps'), $('#bug-expected'), $('#reply-text')]) grow(field);
    status('Composer cleared.', 'info');
    $('#bug-title').focus();
  });
  composer.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  composer.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(); }
  });
  $('#bug-title').addEventListener('input', (event) => { $('#bug-title-count').textContent = `${event.target.value.length}/120`; });
  for (const field of [$('#bug-steps'), $('#bug-expected'), $('#reply-text')]) field.addEventListener('input', () => grow(field));
  $('#attach-images').addEventListener('change', (event) => { attach(event.target.files); event.target.value = ''; });
  $('.attach-button').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#attach-images').click(); }
  });
  // A screenshot straight off the clipboard, or dropped on the thread.
  document.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    attach(files);
    status('Screenshot added from the clipboard.', 'ok');
  });
  for (const target of [thread, composer]) {
    target.addEventListener('dragover', (event) => { event.preventDefault(); target.classList.add('dropping'); });
    target.addEventListener('dragleave', () => target.classList.remove('dropping'));
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      target.classList.remove('dropping');
      attach(event.dataTransfer?.files);
    });
  }
  for (const type of ['dragover', 'drop']) document.addEventListener(type, (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
  });
  $('#shot-close').addEventListener('click', () => $('#shot-viewer').close());
  $('#shot-viewer').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && intake === 'open') sync({ silent: true }); });

  const themeButton = $('#theme');
  function themeLabel() {
    themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} mode`);
  }
  themeButton.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sreon-site-theme', theme); } catch {}
    themeLabel();
  });
  themeLabel();

  try { $('#reader-name').value = localStorage.getItem(NAME_KEY) || ''; } catch {}
  if (!$('#bug-platform').value) $('#bug-platform').value = detectPlatform();
  loadTokens();
  render();
  sync({ announce: false, silent: true }).then(poll);
  window.SreonBugs = { sync, get intake() { return intake; }, count: () => entries.length };
})();
