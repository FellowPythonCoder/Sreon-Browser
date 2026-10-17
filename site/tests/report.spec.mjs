import { test, expect } from '@playwright/test';

// Every spec in this file shares one inbox (see playwright.config.mjs), so each
// test gives its posts a unique title and withdraws them again when it is done.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+p7RLAAAAAElFTkSuQmCC', 'base64');
const unique = (title) => `${title} · ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function post(page, { title, severity = 'broken', area = 'Sidebar', steps = '' }) {
  await page.locator('#bug-title').fill(title);
  await page.locator(`.pill.${severity}`).click();
  await expect(page.locator(`.pill.${severity} input`)).toBeChecked();
  await page.locator('#bug-area').selectOption(area);
  if (steps) {
    await page.locator('#bug-details summary').click();
    await page.locator('#bug-steps').fill(steps);
  }
  await page.locator('#composer-send').click();
  const card = page.locator('.post.report', { hasText: title });
  await expect(card).toBeVisible();
  return card;
}
const withdraw = async (card) => {
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0);
};

test('a report posted here is public: every other visitor reads the same thread', async ({ page, browser }) => {
  await page.goto('/report/');
  await expect(page.locator('#intake-card')).toHaveAttribute('data-state', 'open');
  await expect(page.locator('#intake-label')).toContainText('Inbox open');
  await expect(page.locator('.public-note')).toContainText('public');
  const title = unique('The sidebar closes on its own');
  const card = await post(page, { title, steps: '1. Open Sreon\n2. Wait a minute' });
  await expect(card.locator('.tag.severity')).toHaveText('Broken');
  await expect(card.locator('.tag').nth(1)).toHaveText('Sidebar');
  await expect(card.locator('.post-body')).toContainText('Wait a minute');
  await expect(card.getByRole('button', { name: 'Delete' })).toBeVisible();

  const visitor = await browser.newPage();
  await visitor.goto('/report/');
  const seen = visitor.locator('.post.report', { hasText: title });
  await expect(seen).toBeVisible();
  await expect(seen.locator('.post-body')).toContainText('Wait a minute');
  // Another browser never received the token, so it cannot withdraw this report.
  await expect(seen.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await visitor.close();
  await withdraw(card);
});

test('screenshots are resized in the browser, stored, and shown to everybody', async ({ page }) => {
  await page.goto('/report/');
  const title = unique('The new tab renders sideways');
  await page.locator('#bug-title').fill(title);
  await page.locator('#attach-images').setInputFiles({ name: 'screenshot.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.attachment canvas')).toBeVisible();
  await expect(page.locator('.attachment figcaption')).toContainText('screenshot');
  await expect(page.locator('#composer-status')).toContainText('image');
  await page.locator('#composer-send').click();
  const card = page.locator('.post.report', { hasText: title });
  await expect(card).toBeVisible();
  const src = await card.locator('.shot img').getAttribute('src');
  expect(src).toMatch(/^\/api\/bugs\/files\/bug-[a-z0-9-]+\.(png|webp|jpg)$/);
  const shot = await page.request.get(src);
  expect(shot.ok()).toBe(true);
  expect(shot.headers()['content-type']).toMatch(/^image\//);
  // The stored image is data, not a page: it cannot carry a script.
  expect(shot.headers()['content-security-policy']).toContain("default-src 'none'");
  await card.locator('.shot').click();
  await expect(page.locator('#shot-viewer')).toBeVisible();
  await expect(page.locator('#shot-image')).toHaveAttribute('src', src);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shot-viewer')).toBeHidden();
  await withdraw(card);
});

test('replies stay with their report and the filters narrow the thread', async ({ page }) => {
  await page.goto('/report/');
  const title = unique('Sreon quits when a tab is closed');
  const card = await post(page, { title, severity: 'crash', area: 'Tabs' });
  await card.getByRole('button', { name: 'Reply' }).click();
  await expect(page.locator('#reply-banner')).toContainText(title.slice(0, 24));
  await expect(page.locator('#report-fields')).toBeHidden();
  await expect(page.locator('#composer-send')).toHaveText('Post reply ↗');
  await page.locator('#reply-text').fill('Same thing on Windows 11.');
  await page.locator('#composer-send').click();
  await expect(card.locator('.post.reply')).toContainText('Same thing on Windows 11.');
  await expect(card.locator('.post-foot .post-meta')).toContainText('1 reply');
  await expect(page.locator('#report-fields')).toBeVisible();

  await page.locator('.chip[data-filter=idea]').click();
  await expect(card).toBeHidden();
  await expect(page.locator('.thread-none')).toContainText('Nothing matches');
  await page.locator('.chip[data-filter=crash]').click();
  await expect(card).toBeVisible();
  await page.locator('.chip[data-filter=mine]').click();
  await expect(card).toBeVisible();
  await page.locator('#thread-search').fill('windows 11');
  await expect(card).toBeVisible();
  await page.locator('#thread-search').fill('nothing will ever match this');
  await expect(card).toBeHidden();
  await page.locator('.chip[data-filter=all]').click();
  await page.locator('#thread-search').fill('');
  await withdraw(card);
});

test('a host with no inbox says so instead of pretending to hold reports', async ({ page }) => {
  await page.route('**/api/bugs', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not found</h1>' }));
  await page.goto('/report/');
  await expect(page.locator('#intake-card')).toHaveAttribute('data-state', 'closed');
  await expect(page.locator('#intake-label')).toContainText('No shared inbox');
  await expect(page.locator('#intake-note')).toContainText('cannot be shared');
  await page.locator('#bug-title').fill('This cannot be posted anywhere');
  await page.locator('#composer-send').click();
  await expect(page.locator('#composer-status')).toContainText('no shared inbox');
  await expect(page.locator('.post.report')).toHaveCount(0);
  // The escape hatch still works: the text can be copied or taken to GitHub.
  await expect(page.locator('.side-card.quiet a[href*="github.com"]')).toBeVisible();
});

test('the bug chat is linked from the public site but the hidden corner stays hidden', async ({ page }) => {
  for (const [path, selector] of [
    ['/', '.desktop-nav a[href="/report/"]'],
    ['/', '#mobile-nav a[href="/report/"]'],
    ['/', '.footer-links a[href="/report/"]'],
    ['/site/explore/', '.header nav a[href="/report/"]'],
    ['/site/explore/', '.footer a[href="/report/"]'],
    ['/site/notes/', '.footer-report'],
  ]) {
    await page.goto(path);
    await expect(page.locator(selector).first(), path + selector).toHaveAttribute('href', '/report/');
  }
  await page.goto('/');
  await expect(page.locator('a[href*="/site/notes"]')).toHaveCount(0);
});

test('the bug chat stays inside a phone screen while posting', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const title = unique('Everything overflows on a phone');
  await page.goto('/report/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const card = await post(page, { title, steps: '1. A very long step that keeps going and going and going without a space' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.chip[data-filter=crash]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.chip[data-filter=all]').click();
  await withdraw(card);
});
