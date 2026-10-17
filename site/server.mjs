import { createServer } from 'node:http';
import { appendFile, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SearchEngine } from './searchEngine.mjs';
import { inspectEngine } from './backend.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.dmg':'application/x-apple-diskimage' };
const siteCsp = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com https://cdn.jsdelivr.net https://storage.googleapis.com data:; worker-src 'self' blob:; media-src 'self' blob:; frame-src https: http:; object-src 'none'; base-uri 'none'; form-action 'self'";
const spaceWavesCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://spacewaves.io https://slope3.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://assets.msn.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://spacewaves.io https://slope3.com; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https://spacewaves.io https://slope3.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://assets.msn.com https://static.cloudflareinsights.com data: blob:; worker-src 'self' blob: https://spacewaves.io https://slope3.com; media-src 'self' https: blob: data:; frame-src https:; object-src 'none'; base-uri https://spacewaves.io; form-action https://spacewaves.io; frame-ancestors 'self'";
function json(response, status, data) {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  response.end(JSON.stringify(data));
}
function body(request, maximum = 4096, milliseconds = 5000) {
  return new Promise((resolveBody, reject) => {
    let size = 0, ended = false;
    const chunks = [];
    const fail = (message) => { if (!ended) { ended = true; clearTimeout(timer); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('Request timed out'), milliseconds);
    request.on('data', (chunk) => {
      if (ended) return;
      size += chunk.length;
      if (size > maximum) { fail('Request too large'); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (ended) return;
      ended = true; clearTimeout(timer);
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', () => fail('Request interrupted'));
    request.on('aborted', () => fail('Request interrupted'));
  });
}

// The public bug chat at /report/. Everybody reads and writes the same thread,
// so reports live in one append-only log beside their images. Nothing here
// trusts a client: lengths, counts, and byte sizes are all checked again, and an
// image is stored under the format its own bytes declare, never the one it
// claims. Deleting needs the token that was handed back once, at post time.
const BUG_AREAS = ['Browser window', 'New tab', 'Tabs', 'Sidebar', 'Search', 'Studio', 'Guidebook', 'Shield', 'Settings', 'Splash', 'This website', 'Other'];
const BUG_SEVERITIES = ['crash', 'broken', 'minor', 'idea'];
const BUG_LIMITS = { name: 40, title: 120, steps: 2000, expected: 1000, version: 40, platform: 40, contact: 120, text: 2000 };
const BUG_IMAGE_TYPES = { png: { ext:'png', mime:'image/png' }, jpeg: { ext:'jpg', mime:'image/jpeg' }, webp: { ext:'webp', mime:'image/webp' }, gif: { ext:'gif', mime:'image/gif' } };
const BUG_IMAGE_CEILING = 2 * 1024 * 1024;
const BUG_IMAGES_PER_POST = 3;
const BUG_BODY_CEILING = 9 * 1024 * 1024;
const BUG_LOG_CEILING = 2 * 1024 * 1024;
const BUG_LIST_LENGTH = 200;
const BUG_FILE_NAME = /^[a-z0-9-]{1,80}\.(png|jpg|webp|gif)$/;
const BUG_ID = /^bug-[a-z0-9-]{1,40}$/;
function cleanText(value, maximum, keepNewlines = false) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, keepNewlines ? '\n' : ' ');
  const shaped = keepNewlines ? text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() : text.replace(/\s{2,}/g, ' ').trim();
  if (!shaped || [...shaped].length > maximum) return null;
  return shaped;
}
function optionalText(value, maximum, keepNewlines = false) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  if (!value.trim()) return '';
  return cleanText(value, maximum, keepNewlines);
}
// The stored bytes decide the format. A renamed script or an SVG never gets in.
function sniffImage(bytes) {
  const head = (from, to) => bytes.subarray(from, to).toString('latin1');
  if (bytes.length > 24 && bytes[0] === 0x89 && head(1, 4) === 'PNG') return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length > 6 && head(0, 3) === 'GIF' && ['87a', '89a'].includes(head(3, 6))) return 'gif';
  if (bytes.length > 12 && head(0, 4) === 'RIFF' && head(8, 12) === 'WEBP') return 'webp';
  return null;
}
function decodeImages(value, id) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > BUG_IMAGES_PER_POST) return null;
  const images = [];
  for (const [index, entry] of value.entries()) {
    const match = typeof entry === 'string' ? /^data:image\/(?:png|jpe?g|webp|gif);base64,([A-Za-z0-9+/\s=]+)$/.exec(entry.trim()) : null;
    if (!match) return null;
    const bytes = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    if (!bytes.length || bytes.length > BUG_IMAGE_CEILING) return null;
    const type = sniffImage(bytes);
    if (!type) return null;
    images.push({ name: `${id}-${index}.${BUG_IMAGE_TYPES[type].ext}`, type, bytes });
  }
  return images;
}
// Builds the record that will be written to the log, or null if it is not usable.
export function normalizeBugEntry(data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const name = optionalText(data.name, BUG_LIMITS.name);
  if (name === null) return null;
  const entry = { kind: data.kind === 'reply' ? 'reply' : 'report', id, at: new Date().toISOString(), name };
  if (entry.kind === 'reply') {
    const parent = typeof data.parent === 'string' && BUG_ID.test(data.parent) ? data.parent : null;
    const text = cleanText(data.text, BUG_LIMITS.text, true);
    if (!parent || !text) return null;
    entry.parent = parent;
    entry.text = text;
    return entry;
  }
  const title = cleanText(data.title, BUG_LIMITS.title);
  if (!title || !BUG_SEVERITIES.includes(data.severity) || !BUG_AREAS.includes(data.area)) return null;
  entry.title = title;
  entry.severity = data.severity;
  entry.area = data.area;
  for (const field of ['steps', 'expected', 'version', 'platform', 'contact']) {
    const value = optionalText(data[field], BUG_LIMITS[field], field === 'steps' || field === 'expected');
    if (value === null) return null;
    if (value) entry[field] = value;
  }
  return entry;
}
const publicEntry = ({ token, ...rest }) => rest;
export function createBugInbox(directory) {
  const log = join(directory, 'reports.jsonl');
  const files = join(directory, 'files');
  let cache = null;
  let version = 0;
  let ready = null;
  let readyUntil = 0;
  async function writable() {
    if (ready !== null && Date.now() < readyUntil) return ready;
    try {
      await mkdir(directory, { recursive: true });
      await mkdir(files, { recursive: true });
      await appendFile(log, '');
      ready = true;
    } catch { ready = false; }
    readyUntil = Date.now() + 30000;
    return ready;
  }
  async function entries() {
    if (cache && cache.version === version && Date.now() - cache.at < 5000) return cache.entries;
    let raw = '';
    try { raw = await readFile(log, 'utf8'); } catch { raw = ''; }
    const removed = new Set();
    const kept = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
      if (entry.kind === 'removed') { removed.add(entry.id); continue; }
      kept.push(entry);
    }
    cache = { version, at: Date.now(), entries: kept.filter((entry) => !removed.has(entry.id)) };
    return cache.entries;
  }
  return {
    directory,
    async open() { return writable(); },
    // The shared thread: reports with their replies, oldest first, tokens removed.
    async list() {
      const kept = (await entries()).slice(-BUG_LIST_LENGTH);
      const live = new Set(kept.filter((entry) => entry.kind === 'report').map((entry) => entry.id));
      return kept.filter((entry) => entry.kind !== 'reply' || live.has(entry.parent)).map(publicEntry);
    },
    async has(id) { return (await entries()).some((entry) => entry.id === id); },
    async owner(id, token) {
      if (typeof token !== 'string' || token.length < 16) return false;
      const entry = (await entries()).find((candidate) => candidate.id === id);
      return Boolean(entry && typeof entry.token === 'string' && entry.token.length === token.length
        && Buffer.from(entry.token).equals(Buffer.from(token)));
    },
    async append(entry) {
      if (!(await writable())) throw Object.assign(new Error('The bug inbox is not writable'), { code: 'INTAKE_CLOSED' });
      try {
        const info = await stat(log);
        if (info.size > BUG_LOG_CEILING) await rename(log, `${log}.1`).catch(() => {});
      } catch {}
      await appendFile(log, `${JSON.stringify(entry)}\n`, 'utf8');
      version++;
      cache = null;
      return entry.id;
    },
    async saveImages(images) {
      for (const image of images) await writeFile(join(files, image.name), image.bytes);
    },
    async forgetImages(id) {
      const names = await readdir(files).catch(() => []);
      await Promise.all(names.filter((name) => name.startsWith(`${id}-`)).map((name) => unlink(join(files, name)).catch(() => {})));
    },
    async imagePath(name) {
      if (!BUG_FILE_NAME.test(name)) return null;
      const file = await realpath(join(files, name)).catch(() => null);
      const inside = files.endsWith(sep) ? files : files + sep;
      return file && file.startsWith(inside) ? file : null;
    },
    imageType(name) { return BUG_IMAGE_TYPES[extname(name) === '.jpg' ? 'jpeg' : extname(name).slice(1)]?.mime || 'application/octet-stream'; },
  };
}
export function createWebsite({ clientFactory = () => new SearchEngine(), allowedOrigins = (process.env.SREON_ALLOWED_ORIGINS || 'https://opensreon.com,https://www.opensreon.com').split(','), limit = 15, bugLimit = Number(process.env.SREON_BUG_LIMIT || 6), bugDir = process.env.SREON_BUG_DIR || join(tmpdir(), 'sreon-bug-inbox') } = {}) {
  let client = null;
  let pending = 0;
  let health = null;
  let healthUntil = 0;
  function engine() {
    if (!client || client.failure) { client?.close(); client = clientFactory(); }
    return client;
  }
  const clients = new Map();
  const bugInbox = createBugInbox(bugDir);
  const bugClients = new Map();
  let pendingBugs = 0;
  // Shared CORS/preflight gate for the small JSON APIs. Returns false when the
  // response has already been finished (blocked origin or preflight answered).
  function apiGate(request, response, methods) {
    response.setHeader('Vary', 'Origin');
    const origin = request.headers.origin;
    let sameOrigin = false;
    // A reverse proxy may rewrite Host, so the forwarded host counts too. Browsers
    // refuse to set X-Forwarded-Host themselves, which keeps this a proxy concern
    // rather than a way for a page to invent an origin.
    const forwarded = String(request.headers['x-forwarded-host'] || '').split(',')[0].trim();
    try { const parsed = new URL(origin); sameOrigin = ['https:', 'http:'].includes(parsed.protocol) && (parsed.host === request.headers.host || (Boolean(forwarded) && parsed.host === forwarded)); } catch {}
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) { json(response, 403, { error:'Origin not allowed' }); return false; }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods':methods, 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'600' }); response.end(); return false;
    }
    return true;
  }
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://sreon.invalid').pathname); }
    catch { json(response, 400, { error: 'Invalid path' }); return; }
    if (pathname === '/api/search' || pathname === '/api/health') {
      const methods = pathname === '/api/health' ? 'GET, OPTIONS' : 'POST, OPTIONS';
      if (!apiGate(request, response, methods)) return;
      if (pathname === '/api/health') {
        if (request.method !== 'GET') { response.setHeader('Allow', methods); json(response, 405, { error:'Use GET' }); return; }
        if (!health || Date.now() > healthUntil) {
          healthUntil = Infinity;
          health = Promise.resolve().then(() => inspectEngine(engine())).catch(() => false).then(ready => { healthUntil = Date.now()+5000; return ready; });
        }
        const ready = await health;
        json(response, ready ? 200 : 503, ready
          ? { ready:true, engine:'duckduckgo-html', sources:'checked when searching' }
          : { ready:false, code:'BACKEND_NOT_READY', error:'The search backend is not responding.' });
        return;
      }
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); json(response, 405, { error:'Use POST' }); return; }
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { json(response, 415, { error:'Use application/json' }); return; }
      const now = Date.now();
      for (const [ip, entry] of clients) if (entry.until < now) clients.delete(ip);
      const ip = request.socket.remoteAddress;
      const entry = clients.get(ip) || { count:0, until:now+60000 };
      if (entry.count >= limit || pending >= 8 || (!clients.has(ip) && clients.size >= 10000)) { response.setHeader('Retry-After','60'); json(response, 429, { error:'Please wait before searching again' }); return; }
      entry.count++; clients.set(ip, entry);
      let data;
      try { data = await body(request); }
      catch (error) { json(response, error.message === 'Request too large' ? 413 : 400, { error:error.message }); return; }
      if (!data || Array.isArray(data) || typeof data.q !== 'string' || !data.q.trim() || [...data.q.trim()].length > 500 || (data.category !== undefined && data.category !== 'web') || (data.cursor != null && (typeof data.cursor !== 'string' || data.cursor.length > 2048))) { json(response, 400, { error:'Use a query of 1–500 characters and the web category' }); return; }
      if (pending >= 8) { json(response, 429, { error:'The search service is busy' }); return; }
      pending++;
      try {
        const result = await engine().search(data.q.trim(), 'web', data.cursor ?? null);
        if (!response.destroyed) json(response, 200, result);
      } catch (error) {
        if (!response.destroyed) {
          if (['SOURCE_UNAVAILABLE','SEARCH_UNAVAILABLE'].includes(error.code))
            json(response, 502, { code:'SOURCE_UNAVAILABLE', error:'The search engine could not reach its search source. Please retry shortly.' });
          else if (error.code === 'ENOENT') json(response, 503, { code:'BACKEND_NOT_READY', error:'The search backend is not installed on this host.' });
          else json(response, 503, { error:'Search is temporarily unavailable' });
        }
      } finally { pending--; }
      return;
    }
    if (pathname === '/api/bugs' || pathname === '/api/bugs/remove' || pathname.startsWith('/api/bugs/files/')) {
      const removing = pathname === '/api/bugs/remove';
      const fileName = pathname.startsWith('/api/bugs/files/') ? pathname.slice('/api/bugs/files/'.length) : null;
      if (!apiGate(request, response, fileName ? 'GET, OPTIONS' : 'GET, POST, OPTIONS')) return;
      if (fileName !== null) {
        if (!['GET','HEAD'].includes(request.method)) { response.setHeader('Allow','GET, OPTIONS'); json(response, 405, { error:'Use GET' }); return; }
        const file = await bugInbox.imagePath(fileName);
        if (!file) { json(response, 404, { error:'Not found' }); return; }
        try {
          const image = await readFile(file);
          // An uploaded file is data and nothing else: no scripts, no framing.
          response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          response.setHeader('Cache-Control', 'public, max-age=86400');
          response.writeHead(200, { 'Content-Type':bugInbox.imageType(fileName), 'Content-Length':image.length });
          response.end(request.method === 'HEAD' ? undefined : image);
        } catch { json(response, 404, { error:'Not found' }); }
        return;
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        // The shared thread everybody reads. A host that cannot keep reports says
        // so plainly instead of pretending to hold posts it is about to drop.
        if (!(await bugInbox.open())) { json(response, 503, { ready:false, code:'INTAKE_CLOSED', error:'This host cannot keep bug reports, so nothing posted here would reach anyone else.' }); return; }
        const thread = await bugInbox.list();
        json(response, 200, { ready:true, intake:'open', areas:BUG_AREAS, severities:BUG_SEVERITIES, maxImages:BUG_IMAGES_PER_POST, maxImageBytes:BUG_IMAGE_CEILING, count:thread.length, entries:thread });
        return;
      }
      if (request.method !== 'POST') { response.setHeader('Allow','GET, POST, OPTIONS'); json(response, 405, { error:'Use POST' }); return; }
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { json(response, 415, { error:'Use application/json' }); return; }
      const now = Date.now();
      for (const [ip, entry] of bugClients) if (entry.until < now) bugClients.delete(ip);
      const ip = request.socket.remoteAddress;
      const entry = bugClients.get(ip) || { count:0, until:now+3600000 };
      if (entry.count >= bugLimit || pendingBugs >= 2 || (!bugClients.has(ip) && bugClients.size >= 10000)) { response.setHeader('Retry-After','3600'); json(response, 429, { error:'That is enough posts for now. Please come back in an hour.' }); return; }
      let data;
      try { data = await body(request, removing ? 2048 : BUG_BODY_CEILING, 20000); }
      catch (error) { json(response, error.message === 'Request too large' ? 413 : 400, { error:error.message }); return; }
      if (removing) {
        const id = typeof data?.id === 'string' && BUG_ID.test(data.id) ? data.id : null;
        if (!id) { json(response, 400, { error:'Name the post you want removed' }); return; }
        if (!(await bugInbox.owner(id, data?.token))) { json(response, 403, { error:'Only the browser that posted this can remove it' }); return; }
        entry.count++; bugClients.set(ip, entry);
        try {
          const replies = (await bugInbox.list()).filter((item) => item.kind === 'reply' && item.parent === id);
          for (const gone of [{ id }, ...replies]) {
            await bugInbox.append({ kind:'removed', id:gone.id, at:new Date().toISOString() });
            await bugInbox.forgetImages(gone.id);
          }
          json(response, 200, { removed:true, id, replies:replies.length });
        } catch { json(response, 503, { code:'INTAKE_CLOSED', error:'The bug inbox is temporarily unavailable.' }); }
        return;
      }
      const id = `bug-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
      const draft = normalizeBugEntry(data, id);
      if (!draft) { json(response, 400, { error:`A report needs a title of 1\u2013${BUG_LIMITS.title} characters with a known severity and area; a reply needs text and a report that exists` }); return; }
      const images = decodeImages(data?.images, id);
      if (images === null) { json(response, 400, { error:`Up to ${BUG_IMAGES_PER_POST} PNG, JPEG, WebP or GIF images of ${Math.round(BUG_IMAGE_CEILING/1024/1024)} MB each` }); return; }
      if (!(await bugInbox.open())) { json(response, 503, { code:'INTAKE_CLOSED', error:'This host cannot keep bug reports. Copy the text and open it as a GitHub issue instead.' }); return; }
      if (draft.kind === 'reply' && !(await bugInbox.has(draft.parent))) { json(response, 400, { error:'That report is no longer in the thread' }); return; }
      entry.count++; bugClients.set(ip, entry);
      pendingBugs++;
      try {
        // The token comes back once, to this browser only, and is what makes a
        // later removal possible. It is never part of the public thread.
        draft.token = randomBytes(12).toString('hex');
        if (images.length) { await bugInbox.saveImages(images); draft.images = images.map((image) => image.name); }
        await bugInbox.append(draft);
        if (!response.destroyed) json(response, 201, { received:true, id, token:draft.token, images:draft.images || [] });
      } catch {
        if (!response.destroyed) json(response, 503, { code:'INTAKE_CLOSED', error:'The bug inbox is temporarily unavailable. Your post is still in the composer.' });
      } finally { pendingBugs--; }
      return;
    }
    if (!['GET','HEAD'].includes(request.method)) { json(response, 405, { error:'Method not allowed' }); return; }
    if (pathname === '/site/explore') { response.writeHead(308, { Location:'/site/explore/' }); response.end(); return; }
    if (pathname === '/site/notes') { response.writeHead(308, { Location:'/site/notes/' }); response.end(); return; }
    if (pathname === '/site/notes/space-waves') { response.writeHead(308, { Location:'/site/notes/space-waves/' }); response.end(); return; }
    if (pathname === '/report' || pathname === '/report/index.html') { response.writeHead(308, { Location:'/report/' }); response.end(); return; }
    const relative = pathname === '/' || pathname === '/index.html' ? 'index.html' : pathname === '/site/explore/' ? 'site/explore/index.html' : pathname === '/site/notes/' ? 'site/notes/index.html' : pathname === '/site/notes/space-waves/' ? 'site/notes/space-waves.html' : pathname === '/report/' ? 'site/report/index.html' : pathname.startsWith('/site/assets/') ? pathname.slice(1) : null;
    if (!relative || relative.includes('\\') || relative.split('/').some(part => part === '..' || part.startsWith('.')) || !mime[extname(relative)]) { json(response, 404, { error:'Not found' }); return; }
    try {
      const file = await realpath(resolve(root, relative));
      if (file !== resolve(root, relative) || !file.startsWith(root.endsWith(sep) ? root : root+sep) || !(await stat(file)).isFile()) throw new Error('Not found');
      const content = await readFile(file);
      response.setHeader('Content-Security-Policy', relative === 'site/notes/space-waves.html' ? spaceWavesCsp : siteCsp);
      response.setHeader('Cache-Control', 'no-cache');
      if (relative.startsWith('site/notes/') || relative.startsWith('site/assets/modules/')) response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
      response.writeHead(200, { 'Content-Type':mime[extname(file)], 'Content-Length':content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { json(response, 404, { error:'Not found' }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('close', () => client?.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createWebsite();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Sreon website listening on port ${server.address().port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
