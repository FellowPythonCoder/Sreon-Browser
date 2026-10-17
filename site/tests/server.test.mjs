import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createWebsite } from '../server.mjs';

async function setup(t, options = {}) {
  const server = createWebsite(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (base, data, headers = {}) => fetch(base+'/api/search', { method:'POST', headers: { 'Content-Type':'application/json', ...headers }, body:JSON.stringify(data) });
test('web adapter calls the existing engine client and forwards cursor/results', async t => {
  const calls = [];
  const base = await setup(t, { clientFactory: () => ({ search:async (...args) => { calls.push(args); return { results:[{title:'YouTube',url:'https://www.youtube.com/'}],nextCursor:'next' }; }, close() {} }) });
  const response = await post(base, { q:' YouTube ',category:'web',cursor:'page' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].url, 'https://www.youtube.com/');
  assert.deepEqual(calls, [['YouTube','web','page']]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('API validates bodies, methods, origins, and content type', async t => {
  const base = await setup(t);
  for (const value of [null, [], {}, {q:''}, {q:'x'.repeat(501)}, {q:'ok',category:'files'}, {q:'ok',cursor:{}}]) assert.equal((await post(base,value)).status, 400);
  assert.equal((await post(base, {q:'hello'}, {Origin:'https://untrusted.test'})).status,403);
  assert.equal((await fetch(base+'/api/search')).status,405);
  assert.equal((await fetch(base+'/api/search',{method:'POST',body:'query'})).status,415);
  assert.equal((await post(base,{q:'x'.repeat(5000)})).status,413);
});
test('approved cross-origin website can use a separately hosted API', async t => {
  const base = await setup(t);
  const response = await fetch(base+'/api/search',{method:'OPTIONS',headers:{Origin:'https://opensreon.com'}});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://opensreon.com');
  assert.equal(response.headers.get('access-control-allow-credentials'),null);
});
test('provider errors are honest and do not expose internal paths', async t => {
  const base = await setup(t, { clientFactory: () => ({ search: async () => { throw new Error('/private/executable'); }, close() {} }) });
  const response = await post(base,{q:'hello'});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'Search is temporarily unavailable'});
});
test('request limits cannot be bypassed with a forged forwarded address', async t => {
  const base = await setup(t,{limit:1});
  assert.equal((await post(base,{})).status,400);
  assert.equal((await post(base,{}, {'X-Forwarded-For':'123.2.1.1'})).status,429);
});
test('only public files are served; old game paths and source files are unavailable', async t => {
  const base = await setup(t);
  for (const path of ['/site/server.mjs','/.git/config','/Extra/Source/integrations/sreon.mjs','/o/','/games/pack7.js','/site/assets/%2e%2e/server.mjs','/site/Dockerfile']) assert.equal((await fetch(base+path)).status,404,path);
  assert.equal((await fetch(base+'/')).status,200);
  const response = await fetch(base+'/site/notes/');
  assert.equal(response.status,200);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  assert.match(await response.text(),/module-07.js/);
  const spaceWaves = await fetch(base+'/site/notes/space-waves/');
  assert.equal(spaceWaves.status,200);
  assert.match(spaceWaves.headers.get('content-security-policy'),/slope3\.com/);
  assert.match(spaceWaves.headers.get('x-robots-tag'),/noindex/);
  assert.match(await spaceWaves.text(),/Space Waves/);
});

test('health endpoint verifies the engine and does not assert provider reachability', async t => {
  let calls=0;
  const base=await setup(t,{clientFactory:()=>({close(){},search:async q=>{calls++;assert.equal(q,'');throw Object.assign(new Error('Invalid query'),{status:400,code:'INVALID_QUERY'});}})});
  const response=await fetch(base+'/api/health');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ready:true,engine:'duckduckgo-html',sources:'checked when searching'});
  await fetch(base+'/api/health'); assert.equal(calls,1);
});
test('health distinguishes unavailable transport from an operational backend', async t => {
  const base=await setup(t,{clientFactory:()=>({close(){},search:async()=>{throw Object.assign(new Error('internal path'),{code:'ENOENT'});}})});
  assert.equal((await fetch(base+'/api/health')).status,503);
  const response=await post(base,{q:'YouTube'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'BACKEND_NOT_READY');
});
test('an upstream failure is not mislabeled as an uninstalled backend', async t => {
  const base=await setup(t,{clientFactory:()=>({close(){},search:async()=>{throw Object.assign(new Error('private provider detail'),{status:502,code:'SOURCE_UNAVAILABLE'});}})});
  const response=await post(base,{q:'YouTube'});
  assert.equal(response.status,502);
  assert.equal((await response.json()).code,'SOURCE_UNAVAILABLE');
});

test('only the Mac download is configured; Windows and Linux stay unavailable', async t => {
  const base = await setup(t);
  const response = await fetch(base + '/site/assets/downloads.js');
  assert.equal(response.status, 200);
  const context = { window:{} };
  runInNewContext(await response.text(), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.SREON_DOWNLOADS)), {
    mac:{ url:'/site/assets/SREONBROWSER.dmg', version:'1.1', detail:'macOS · DMG installer' },
    windows:{ url:null, detail:'' },
    linux:{ url:null, detail:'' },
  });
});

test('the Mac DMG is served from its exact case-sensitive path', async t => {
  const base = await setup(t);
  const expected = await readFile(new URL('../assets/SREONBROWSER.dmg', import.meta.url));
  const url = base + '/site/assets/SREONBROWSER.dmg';
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/x-apple-diskimage');
  assert.equal(response.headers.get('content-length'), String(expected.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);

  const head = await fetch(url, { method:'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/x-apple-diskimage');
  assert.equal(head.headers.get('content-length'), String(expected.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

/* ------------------------------------------------- the public bug chat --- */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+p7RLAAAAAElFTkSuQmCC', 'base64');
const REPORT = { name:'Ada', title:'Sidebar snaps shut on its own', severity:'broken', area:'Sidebar', steps:'1. Open\n2. Wait', version:'1.1', platform:'macOS' };
async function inbox(t, options = {}) {
  const holder = await mkdtemp(join(tmpdir(), 'sreon-bug-inbox-'));
  t.after(() => rm(holder, { recursive:true, force:true }));
  const base = await setup(t, { bugDir: join(holder, 'inbox'), ...options });
  const send = (data, path = '/api/bugs') => fetch(base+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const thread = async () => (await fetch(base+'/api/bugs')).json();
  return { base, holder, send, thread, withdraw: (id, token) => send({ id, token }, '/api/bugs/remove') };
}
test('the bug chat keeps a report and shows it to everybody without its token', async t => {
  const { send, thread } = await inbox(t);
  const created = await send(REPORT);
  assert.equal(created.status, 201);
  const { id, token, images } = await created.json();
  assert.match(id, /^bug-[a-z0-9-]+$/);
  assert.equal(token.length, 24);
  assert.deepEqual(images, []);
  const listed = await thread();
  assert.equal(listed.ready, true);
  assert.equal(listed.intake, 'open');
  assert.equal(listed.count, 1);
  assert.deepEqual(listed.entries[0], { kind:'report', id, at:listed.entries[0].at, name:'Ada', title:REPORT.title, severity:'broken', area:'Sidebar', steps:'1. Open\n2. Wait', version:'1.1', platform:'macOS' });
  assert.ok(!JSON.stringify(listed).includes(token), 'the removal token must never be published');
});
test('replies join a report and leave again with it', async t => {
  const { send, thread, withdraw } = await inbox(t);
  const parent = await (await send(REPORT)).json();
  assert.equal((await send({ kind:'reply', parent:parent.id, name:'Grace', text:'Same on Windows.' })).status, 201);
  assert.equal((await thread()).count, 2);
  assert.equal((await send({ kind:'reply', parent:'bug-gone-already', text:'orphan' })).status, 400);
  const removed = await withdraw(parent.id, parent.token);
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).replies, 1);
  assert.equal((await thread()).count, 0);
});
test('screenshots are stored under the format their own bytes declare', async t => {
  const { base, send } = await inbox(t);
  const { id, images } = await (await send({ ...REPORT, title:'A picture of the broken tab', images:[`data:image/png;base64,${PNG.toString('base64')}`] })).json();
  assert.deepEqual(images, [`${id}-0.png`]);
  const shot = await fetch(`${base}/api/bugs/files/${images[0]}`);
  assert.equal(shot.status, 200);
  assert.equal(shot.headers.get('content-type'), 'image/png');
  assert.match(shot.headers.get('content-security-policy'), /default-src 'none'/);
  assert.deepEqual(Buffer.from(await shot.arrayBuffer()), PNG);
  const disguised = await send({ ...REPORT, title:'Not a picture', images:['data:image/png;base64,'+Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')] });
  assert.equal(disguised.status, 400);
  assert.equal((await fetch(`${base}/api/bugs/files/..%2F..%2Fserver.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/api/bugs/files/${images[0]}.html`)).status, 404);
  assert.equal((await fetch(`${base}/api/bugs/files/`, { method:'POST' })).status, 405);
});
test('the bug inbox refuses junk, wrong methods, foreign origins, and floods', async t => {
  const { base, send } = await inbox(t, { bugLimit: 2 });
  for (const value of [null, [], {}, { title:'' }, { title:'x'.repeat(121), severity:'crash', area:'Other' }, { title:'ok', severity:'meh', area:'Other' }, { title:'ok', severity:'crash', area:'Nowhere' }, { title:'ok', severity:'crash', area:'Other', steps:7 }, { kind:'reply', text:'no parent' }])
    assert.equal((await send(value)).status, 400, JSON.stringify(value));
  assert.equal((await fetch(`${base}/api/bugs`, { method:'PUT' })).status, 405);
  assert.equal((await fetch(`${base}/api/bugs`, { method:'POST', body:'title=x' })).status, 415);
  assert.equal((await fetch(`${base}/api/bugs`, { headers:{ Origin:'https://untrusted.test' } })).status, 403);
  assert.equal((await fetch(`${base}/api/bugs/remove`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:'../etc/passwd', token:'x'.repeat(24) }) })).status, 400);
  assert.equal((await send(REPORT)).status, 201);
  assert.equal((await send(REPORT)).status, 201);
  const flooded = await send(REPORT);
  assert.equal(flooded.status, 429);
  assert.equal(flooded.headers.get('retry-after'), '3600');
});
test('only the browser that posted can withdraw a post', async t => {
  const { send, thread, withdraw } = await inbox(t);
  const { id, token } = await (await send(REPORT)).json();
  assert.equal((await withdraw(id, 'not-the-token-at-all')).status, 403);
  assert.equal((await withdraw(id, token.slice(0, -1))).status, 403);
  assert.equal((await withdraw('bug-somewhere-else', token)).status, 403);
  assert.equal((await thread()).count, 1);
  assert.equal((await withdraw(id, token)).status, 200);
  assert.equal((await thread()).count, 0);
});
test('a host that cannot keep reports says so instead of accepting them', async t => {
  const holder = await mkdtemp(join(tmpdir(), 'sreon-blocked-'));
  t.after(() => rm(holder, { recursive:true, force:true }));
  const inTheWay = join(holder, 'not-a-folder');
  await writeFile(inTheWay, 'in the way');
  const base = await setup(t, { bugDir: join(inTheWay, 'inbox') });
  const probe = await fetch(`${base}/api/bugs`);
  assert.equal(probe.status, 503);
  assert.equal((await probe.json()).code, 'INTAKE_CLOSED');
  const posted = await fetch(`${base}/api/bugs`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(REPORT) });
  assert.equal(posted.status, 503);
});
test('the report page is public while the stored thread is not a web page', async t => {
  const { base, send } = await inbox(t);
  await send(REPORT);
  const short = await fetch(`${base}/report`);
  assert.equal(short.status, 200);
  assert.equal(new URL(short.url).pathname, '/report/');
  const page = await fetch(`${base}/report/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('x-robots-tag'), null);
  assert.match(await page.text(), /report\.js/);
  for (const path of ['/reports.jsonl', '/site/report/reports.jsonl', '/site/report/', '/site/server.mjs']) assert.equal((await fetch(base+path)).status, 404, path);
});
