import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createWebsite } from './server.mjs';
import { inspectEngine } from './backend.mjs';
import { SearchEngine } from './searchEngine.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));

// No Rust binary to build or spawn anymore: the search engine is the plain
// Node module in searchEngine.mjs, so startup just has to confirm it can
// reach its search source before the HTTP server opens for traffic.
export async function startWebsite({ root = project, port = Number(process.env.PORT || 3000), host = '0.0.0.0' } = {}) {
  const probe = new SearchEngine();
  let ready;
  try { ready = await inspectEngine(probe); }
  finally { probe.close(); }
  if (!ready) throw new Error('Search engine failed its protocol check. Website startup stopped rather than offering broken search.');
  const server = createWebsite();
  server.listen(port, host);
  await once(server, 'listening');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startWebsite();
    console.log(`Sreon website and search backend ready on port ${server.address().port}`);
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
