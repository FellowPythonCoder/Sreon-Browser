import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
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
  assert.deepEqual(await response.json(),{ready:true,engine:'rust',sources:'checked when searching'});
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

test('Mac and Linux ARM64 downloads are configured; Windows stays unavailable', async t => {
  const base = await setup(t);
  const response = await fetch(base + '/site/assets/downloads.js');
  assert.equal(response.status, 200);
  const context = { window:{} };
  runInNewContext(await response.text(), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.SREON_DOWNLOADS)), {
    mac:{ url:'/site/assets/SREONBROWSER.dmg', version:'1.1', detail:'macOS · DMG installer' },
    windows:{ url:null, detail:'' },
    linux:{ url:'/site/assets/SREONBROWSER-linux-arm64.deb', version:'1.1', detail:'Linux ARM64 · .deb package' },
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

test('the Linux ARM64 .deb is served from its exact case-sensitive path', async t => {
  const base = await setup(t);
  const expected = await readFile(new URL('../assets/SREONBROWSER-linux-arm64.deb', import.meta.url));
  const url = base + '/site/assets/SREONBROWSER-linux-arm64.deb';
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.debian.binary-package');
  assert.equal(response.headers.get('content-length'), String(expected.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);

  const head = await fetch(url, { method:'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/vnd.debian.binary-package');
  assert.equal(head.headers.get('content-length'), String(expected.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});
