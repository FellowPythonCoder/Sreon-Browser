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

test("downloads honestly show each platform status, trap focus and close with Escape", async ({
  page,
}) => {
  await page.goto("/#download");
  for (const [platform, name] of [
    ["mac", "Mac"],
    ["windows", "Windows"],
    ["linux", "Linux"],
  ]) {
    const button = page.locator(
      `.download-action[data-platform="${platform}"]`,
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

test("Privacy colon opens the hidden game library and local game", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#privacy");
  await page.locator(".quiet-colon").click();
  await expect(
    page.getByRole("heading", { name: "Off the clock." }),
  ).toBeVisible();
  await expect(page.locator(".game-card")).not.toHaveCount(0);
  await page.getByRole("button", { name: /Geometry Rush/ }).click();
  await expect(page.locator("#game-canvas")).toBeVisible();
  await page.locator("#exit-game").click();
  await expect(page.locator("#library")).toBeVisible();
  expect(errors).toEqual([]);
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
    "Downloads are not published yet",
  );
  await page
    .getByText("The small print, in plain language", { exact: false })
    .click();
  await expect(page.locator(".privacy-details[open] p")).toContainText(
    "host may keep request logs",
  );
  await expect(page.locator(".download-heading")).toHaveCSS("opacity", "1");
});
