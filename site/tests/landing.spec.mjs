import { test, expect } from "@playwright/test";

test("landing loads local images without script errors or outside requests", async ({
  page,
}) => {
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less browser. More possibility." }),
  ).toBeVisible();
  await expect(page.locator(".quiet-colon")).toHaveCount(1);
  await page.locator("#download").scrollIntoViewIfNeeded();
  await expect(page.locator(".download-card")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images
            .filter((image) => image.complete && !image.naturalWidth)
            .map((image) => image.src),
        ),
    )
    .toEqual([]);
  expect(requests.every((url) => new URL(url).hostname === "127.0.0.1")).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("browser sidebar, focus mode, wallpaper and reset are interactive", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-view="inspiration"]').click();
  await expect(page.locator("#preview-inspiration")).toBeVisible();
  await expect(page.locator("#preview-home")).toBeHidden();
  await expect(page.locator("#preview-address")).toHaveText(
    "sreon://collection",
  );
  await page.locator('[data-view="studio"]').click();
  await expect(page.locator("#preview-studio")).toBeVisible();
  await page.locator("#customize-preview").click();
  await expect(page.locator(".wallpaper")).toHaveAttribute("src", /coast/);
  await page.locator("#focus-preview").click();
  await expect(page.locator("#browser-preview")).toHaveClass(/is-focused/);
  await expect(page.locator(".browser-sidebar")).toHaveAttribute("inert", "");
  await page.locator("#reset-preview").click();
  await expect(page.locator("#browser-preview")).not.toHaveClass(/is-focused/);
  await expect(page.locator(".wallpaper")).toHaveAttribute(
    "src",
    /night-mountains/,
  );
});

test("Studio safely applies editable settings, reports errors and supports keyboard tabs", async ({
  page,
}) => {
  await page.goto("/#studio");
  const code = page.locator("#studio-code");
  await code.fill(
    'browser.greeting = "My little universe."\nbrowser.theme = "midnight"\nbrowser.sidebar = "compact"',
  );
  await page.locator("#run-code").click();
  await expect(page.locator("#result-greeting")).toHaveText(
    "My little universe.",
  );
  await expect(page.locator("#studio-result")).toHaveAttribute(
    "data-theme",
    "midnight",
  );
  await expect(page.locator("#studio-result")).toHaveClass(/compact/);
  await code.fill('alert("not allowed")');
  await page.locator("#run-code").click();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#result-greeting")).toHaveText(
    "My little universe.",
  );
  await page.getByRole("tab", { name: "appearance.spr" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "focus.spr" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#result-greeting")).toHaveText("Find your flow.");
  await page.keyboard.press("End");
  await expect(page.locator("#result-greeting")).toHaveText(
    "Good things start here.",
  );
  await code.fill(
    'browser.greeting = "<b>Not HTML</b>"\nbrowser.theme = "dusk"\nbrowser.sidebar = "expanded"',
  );
  await code.press("Control+Enter");
  await expect(page.locator("#result-greeting")).toHaveText("<b>Not HTML</b>");
  await expect(page.locator("#result-greeting b")).toHaveCount(0);
});

test("only Mac offers the DMG while Windows and Linux remain coming soon", async ({
  page,
}) => {
  await page.goto("/#download");
  const mac = page.locator('a.download-action[data-platform="mac"]');
  await expect(mac).toHaveAttribute(
    "href",
    /\/site\/assets\/SREONBROWSER\.dmg$/,
  );
  await expect(page.locator('[data-status="mac"]')).toHaveText(
    "Version 1.1 · macOS · DMG installer",
  );
  await expect(
    page.locator(".download-card").first().locator(".platform-tag"),
  ).toHaveText("AVAILABLE NOW");
  await expect(page.locator("a.download-action")).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    mac.click(),
  ]);
  expect(download.suggestedFilename()).toBe("SREONBROWSER.dmg");

  for (const [platform, name] of [
    ["windows", "Windows"],
    ["linux", "Linux"],
  ]) {
    const button = page.locator(
      `button.download-action[data-platform="${platform}"]`,
    );
    await expect(button).toBeVisible();
    await expect(page.locator(`[data-status="${platform}"]`)).toHaveText(
      "Coming soon · Download not yet available",
    );
    await button.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#download-dialog-title")).toHaveText(
      `Sreon for ${name} is on its way.`,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test("configured release URLs become real links and unsafe URLs are ignored", async ({
  page,
}) => {
  await page.route("**/downloads.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.SREON_DOWNLOADS = {mac:{url:"https://github.com/FellowPythonCoder/Sreon-Browser/releases/download/v1/Sreon.dmg",detail:"v1 · Apple silicon"},windows:{url:"javascript:alert(1)"},linux:{url:null}}',
    }),
  );
  await page.goto("/#download");
  await expect(
    page.locator('a.download-action[data-platform="mac"]'),
  ).toHaveAttribute("href", /Sreon\.dmg$/);
  await expect(page.locator('[data-status="mac"]')).toHaveText(
    "v1 · Apple silicon",
  );
  await expect(
    page.locator('button.download-action[data-platform="windows"]'),
  ).toBeVisible();
});

test("Privacy colons are plain text and cannot open the gaming area", async ({
  page,
}) => {
  for (const path of ["/#privacy", "/site/explore/#privacy"]) {
    await page.goto(path);
    const colon = page.locator(".quiet-colon");
    await expect(colon).toHaveText(":");
    expect(await colon.evaluate((el) => el.tagName)).toBe("SPAN");
    await expect(colon).not.toHaveAttribute("tabindex");
    await expect(page.locator('a[href*="/site/notes"]')).toHaveCount(0);
    await colon.click();
    await expect(page).toHaveURL(new RegExp(path.replaceAll("/", "\\/") + "$"));
  }
});

test("downloads show the current version and summarized release notes", async ({
  page,
}) => {
  await page.goto("/#download");
  await expect(page.locator(".release-badge")).toContainText(
    "Current version · 1.1",
  );
  await page.locator(".release-badge").click();
  await expect(page).toHaveURL(/#release-notes$/);
  await expect(page.locator("#release-title")).toHaveText(
    "What’s new in Sreon 1.1",
  );
  await expect(page.locator(".release-highlights > div")).toHaveCount(6);
  await expect(page.locator(".release-notes")).toContainText("SPRFST");
  await expect(page.locator(".release-notes")).toContainText("32 chapters");
  await expect(page.locator(".release-notes code")).toHaveText(
    "sprfst new app <name>",
  );
});

test("release metadata updates both version labels and platform-specific build status", async ({
  page,
}) => {
  await page.route("**/downloads.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.SREON_RELEASE = {version:"1.2"}; window.SREON_DOWNLOADS = {mac:{url:"/site/assets/SREONBROWSER.dmg",version:"1.2",detail:"macOS"}};',
    }),
  );
  await page.goto("/#download");
  await expect(page.locator("[data-release-version]")).toHaveText([
    "1.2",
    "1.2",
  ]);
  await expect(page.locator('[data-status="mac"]')).toHaveText(
    "Version 1.2 · macOS",
  );
});

test("solar system and speed asteroid animate and can be paused together", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".planet-orbit")).toHaveCount(8);
  await expect(page.locator(".earth")).toHaveCSS(
    "animation-name",
    "planet-revolve",
  );
  await expect(page.locator(".asteroid-flight")).toHaveCSS(
    "animation-name",
    "asteroid-fly",
  );
  await page.getByRole("button", { name: "Pause animations" }).click();
  for (const selector of [
    ".earth",
    ".earth .planet",
    ".asteroid-flight",
    ".flight-grid",
  ]) {
    await expect(page.locator(selector)).toHaveCSS(
      "animation-play-state",
      "paused",
    );
  }
  await expect(page.locator("#motion-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Resume animations" }).click();
  await expect(page.locator(".earth")).toHaveCSS(
    "animation-play-state",
    "running",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".earth")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".asteroid-flight")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator("#motion-toggle")).toBeHidden();
  await expect(page.locator("#speed-title")).toHaveText(
    "Keep your orbit.Lose the waiting.",
  );
});

for (const width of [360, 390, 768, 1440]) {
  test(`responsive layout has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator("#download").scrollIntoViewIfNeeded();
    await expect(page.locator(".download-card").first()).toBeVisible();
    if (width < 760) {
      await page.goto("/");
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .locator("#mobile-nav")
        .getByRole("link", { name: "Studio" })
        .click();
      await expect(page.locator("#mobile-nav")).toBeHidden();
      await expect(page).toHaveURL(/#studio$/);
    }
  });
}

test("FAQ and privacy disclosure open; reduced motion still reveals all content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .locator(".faq-list summary")
    .filter({ hasText: "When can I download it?" })
    .click();
  await expect(page.locator(".faq-list details[open] p")).toContainText(
    "Published builds are linked in the download section above",
  );
  await page
    .getByText("The small print, in plain language", { exact: false })
    .click();
  await expect(page.locator(".privacy-details[open] p")).toContainText(
    "host may keep request logs",
  );
  await expect(page.locator(".download-heading")).toHaveCSS("opacity", "1");
});
