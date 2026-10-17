import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir:'./tests', testMatch:'**/*.spec.mjs', fullyParallel:true, workers:2,
  use:{ baseURL:'http://127.0.0.1:3000', headless:true, launchOptions:process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']} : {} },
  webServer:{ command:'node site/server.mjs', cwd:fileURLToPath(new URL('../',import.meta.url)), url:'http://127.0.0.1:3000', reuseExistingServer:!process.env.CI,
    env:{ ...process.env, SREON_BUG_DIR:fileURLToPath(new URL('../test-results/bug-inbox',import.meta.url)), SREON_BUG_LIMIT:'500' } },
});
