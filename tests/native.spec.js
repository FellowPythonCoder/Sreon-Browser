import { test, expect } from "@playwright/test";

async function nativeApp(page, mode = "normal") {
  await page.addInitScript(({ mode }) => {
    window.nativeCalls = [];
    window.__TAURI__ = {
      event: { listen: async () => () => {} },
      core: { invoke: async (command, payload) => {
        window.nativeCalls.push({ command, payload });
        if (command === "open_page") {
          if (mode === "open-error") throw { message: "This page couldn't open." };
          return null;
        }
        const { q, cursor } = payload.request;
        if (mode === "error" && window.nativeCalls.filter((call) => call.command === "search").length === 1)
          throw { message: "Search couldn't connect. Check your internet connection and try again." };
        if (mode === "race" && q === "old") await new Promise((resolve) => setTimeout(resolve, 400));
        if (mode === "empty") return { results: [], nextCursor: null };
        return {
          results: [{ title: mode === "unsafe" ? "<img src=x onerror=alert(1)>" : `Result for ${q}${cursor ? " page 2" : ""}`, url: "https://example.org/result", content: "A response from the Rust search adapter." }, ...(mode === "unsafe" ? [{ title: "Unsafe link", url: "javascript:alert(1)", content: "Bad" }] : [])],
          nextCursor: cursor ? null : { source: "web", fields: { s: "10", vqd: "test-token" } },
          notice: mode === "fallback" ? "Web results are temporarily unavailable. Showing reference articles instead." : null,
        };
      } },
    };
  }, { mode });
  await page.goto("/");
}

async function search(page, query) {
  await page.getByRole("searchbox").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("start page contains the existing logo, search, and dark mode only", async ({ page }) => {
  await nativeApp(page);
  await expect(page.getByRole("img", { name: "Sreon logo" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/settings|open source|service address|connect your|privacy|shortcuts/i);
  expect(await page.evaluate(() => window.nativeCalls)).toEqual([]);
});

test("search needs no configuration and uses only native IPC", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await nativeApp(page);
  await search(page, "forest");
  await expect(page.getByRole("link", { name: "Result for forest", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.nativeCalls[0])).toEqual({ command: "search", payload: { request: { q: "forest", cursor: null } } });
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("sreon.endpoint"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("sreon.history"))).toBeNull();
  await expect(page).not.toHaveURL(/forest/);
});

test("domain input searches rather than navigating away", async ({ page }) => {
  await nativeApp(page);
  await search(page, "example.org");
  await expect(page.getByRole("link", { name: "Result for example.org" })).toBeVisible();
  expect(await page.evaluate(() => window.nativeCalls.map((call) => call.command))).toEqual(["search"]);
});

test("result links open a native page without replacing the search window", async ({ page }) => {
  await nativeApp(page);
  await search(page, "nature");
  await page.getByRole("link", { name: "Result for nature" }).click();
  expect(await page.evaluate(() => window.nativeCalls.find((call) => call.command === "open_page"))).toEqual({ command: "open_page", payload: { url: "https://example.org/result" } });
  await expect(page.getByRole("searchbox")).toHaveValue("nature");
});

test("dark mode persists without a settings screen", async ({ page }) => {
  await nativeApp(page);
  const toggle = page.getByRole("button", { name: "Dark mode" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("upgrades retain theme but remove old settings and saved searches", async ({ page }) => {
  await nativeApp(page);
  await page.evaluate(() => {
    localStorage.removeItem("sreon.theme");
    localStorage.setItem("sreon.preferences", JSON.stringify({ theme: "dark" }));
    localStorage.setItem("sreon.endpoint", "https://old.example.org/");
    localStorage.setItem("sreon.history", '["old search"]');
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["sreon.theme"]);
});

test("a failed search can be retried without setup", async ({ page }) => {
  await nativeApp(page, "error");
  await search(page, "forest");
  await expect(page.getByRole("status")).toContainText("Search couldn't connect");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Result for forest" })).toBeVisible();
});

test("reference fallback is explicitly distinguished from web results", async ({ page }) => {
  await nativeApp(page, "fallback");
  await search(page, "forest");
  await expect(page.locator("#notice")).toBeVisible();
  await expect(page.locator("#notice")).toContainText("Showing reference articles instead");
});

test("pagination sends the source cursor and reuses previous results in memory", async ({ page }) => {
  await nativeApp(page);
  await search(page, "forest");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result for forest page 2" })).toBeVisible();
  expect(await page.evaluate(() => window.nativeCalls[1].payload.request.cursor)).toEqual({ source: "web", fields: { s: "10", vqd: "test-token" } });
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result for forest", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.nativeCalls.length)).toBe(2);
});

test("late search responses cannot replace newer results", async ({ page }) => {
  await nativeApp(page, "race");
  await search(page, "old");
  await search(page, "new");
  await expect(page.getByRole("link", { name: "Result for new" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("link", { name: "Result for new" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Result for old" })).toHaveCount(0);
});

test("home clears the search and ignores an in-flight result", async ({ page }) => {
  await nativeApp(page, "race");
  await search(page, "old");
  await page.getByRole("button", { name: "Sreon start page" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator("#results-section")).toBeHidden();
  await expect(page).toHaveTitle("Sreon");
});

test("unsafe markup stays plain text and unsafe links are dropped", async ({ page }) => {
  await nativeApp(page, "unsafe");
  await search(page, "test");
  await expect(page.getByRole("link", { name: "<img src=x onerror=alert(1)>" })).toBeVisible();
  await expect(page.locator("#results img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Unsafe link" })).toHaveCount(0);
});

test("empty searches do not invent results", async ({ page }) => {
  await nativeApp(page, "empty");
  await search(page, "unusual query");
  await expect(page.getByRole("status")).toContainText("No results found");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.locator("#pagination")).toBeHidden();
});

test("failed result opens keep the search usable", async ({ page }) => {
  await nativeApp(page, "open-error");
  await search(page, "forest");
  await page.getByRole("link", { name: "Result for forest" }).click();
  await expect(page.getByRole("status")).toContainText("This page couldn't open");
  await expect(page.getByRole("searchbox")).toHaveValue("forest");
});

test("small windows retain accessible search controls without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 560 });
  await nativeApp(page);
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeInViewport();
  await search(page, "forest");
  await expect(page.getByRole("link", { name: "Result for forest" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("browser preview makes no pretend backend request", async ({ page }) => {
  await page.goto("/");
  await search(page, "forest");
  await expect(page.getByRole("status")).toContainText("Search runs in the Sreon Mac app");
  await expect(page.getByRole("link")).toHaveCount(0);
});
