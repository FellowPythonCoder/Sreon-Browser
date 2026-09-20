import { test, expect } from "@playwright/test";

const fixture = {
  results: [
    {
      title: "The forest ecosystem",
      url: "https://example.org/forest",
      content:
        "An introduction to forests and their extraordinary biodiversity.",
      thumbnail: "/assets/image-placeholder.svg",
      published: "2026-09-20",
    },
  ],
  elapsed: 0.18,
  hasMore: true,
  partial: false,
};
async function mockSearch(page, response = fixture) {
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: response }),
  );
}
async function search(page, query = "forest") {
  await page.getByRole("searchbox").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("home is Sreon-only, loads local assets and has no script errors", async ({
  page,
}) => {
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/127\.0\.0\.1|localhost/))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less noise. More discovery." }),
  ).toBeVisible();
  await expect(
    page.locator("iframe, #try, #download, .discovery-card, .manifesto"),
  ).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Google|Bing|DuckDuckGo/,
  );
  expect(
    await page
      .locator(".site-header .brand img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("dark mode persists and can return to cream", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("search without a backend gives useful setup steps, not fake results", async ({
  page,
}) => {
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "NOT_CONFIGURED",
        message: "Connect your search backend for live results.",
      },
    }),
  );
  await page.goto("/");
  await search(page);
  await expect(
    page.getByRole("heading", { name: "One more step to the open web." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect your search engine" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("bash sreon.sh");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("renders backend results, paginates and sends time filters", async ({
  page,
}) => {
  const requests = [];
  await page.route("**/api/search?**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await search(page);
  await expect(
    page.getByRole("link", { name: "The forest ecosystem" }),
  ).toHaveAttribute("href", "https://example.org/forest");
  await expect(
    page.getByRole("link", { name: "The forest ecosystem" }),
  ).toHaveAttribute("target", "_blank");
  await expect(page.locator("#results-meta")).toContainText("1 result");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#page-number")).toHaveText("Page 2");
  expect(requests.at(-1).searchParams.get("page")).toBe("2");
  await page.getByLabel("Time range").selectOption("week");
  await expect(page.locator("#page-number")).toHaveText("Page 1");
  expect(requests.at(-1).searchParams.get("time")).toBe("week");
  await page.getByRole("tab", { name: "News", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "News", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".result-date")).toBeVisible();
  expect(requests.at(-1).searchParams.get("category")).toBe("news");
  await page.getByRole("tab", { name: "Videos", exact: true }).click();
  await expect(page.locator("#page-number")).toHaveText("Page 1");
  expect(requests.at(-1).searchParams.get("category")).toBe("videos");
});

test("images render a clickable source and hide unsafe result URLs", async ({
  page,
}) => {
  await mockSearch(page, {
    ...fixture,
    results: [
      ...fixture.results,
      { title: "Do not show", url: "javascript:alert(1)", content: "" },
    ],
  });
  await page.goto("/?q=forest&category=images");
  await expect(page.locator(".image-result")).toHaveCount(1);
  await expect(page.locator(".image-result img")).toBeVisible();
  await expect(page.locator(".image-result")).toHaveAttribute(
    "href",
    "https://example.org/forest",
  );
});

test("handles empty, partial and error results", async ({ page }) => {
  await mockSearch(page, { ...fixture, results: [], hasMore: false });
  await page.goto("/?q=unknown");
  await expect(
    page.getByRole("heading", { name: "A different path, perhaps?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refine your search" }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.unroute("**/api/search?**");
  await mockSearch(page, { ...fixture, partial: true });
  await search(page);
  await expect(page.locator(".result-warning")).toContainText(
    "Some sources didn’t respond",
  );
  await page.unroute("**/api/search?**");
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ status: 502, json: { message: "A temporary problem." } }),
  );
  await search(page, "nature");
  await expect(
    page.getByRole("heading", { name: "A small pause in your exploration." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("renders malicious snippets only as text", async ({ page }) => {
  await mockSearch(page, {
    ...fixture,
    results: [
      {
        ...fixture.results[0],
        title: "<img src=x onerror=alert(1)>",
        content: "<script>alert(1)</script>",
      },
    ],
  });
  await page.goto("/?q=test");
  await expect(page.locator("article.result-item")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".result-item img")).toHaveCount(0);
  await expect(page.locator(".result-item script")).toHaveCount(0);
});

test("settings save filters and opt-in history and can be reset", async ({
  page,
}) => {
  const requests = [];
  await page.route("**/api/search?**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Search settings" }).click();
  await page.getByLabel("Safe search", { exact: true }).selectOption("2");
  await page.getByLabel("Search language").selectOption("fr");
  await page.getByLabel("Open results in a new tab").uncheck();
  await page.getByLabel("Remember recent searches").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await search(page);
  await expect(
    page.getByRole("link", { name: "The forest ecosystem" }),
  ).not.toHaveAttribute("target", "_blank");
  expect(requests.at(-1).searchParams.get("safe")).toBe("2");
  expect(requests.at(-1).searchParams.get("language")).toBe("fr");
  await page.getByRole("link", { name: "Sreon home" }).first().click();
  await expect(page.locator("#recent-searches")).toContainText("forest");
  await page.getByRole("button", { name: "Search settings" }).click();
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await expect(page.getByLabel("Remember recent searches")).not.toBeChecked();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("#recent-searches")).toBeHidden();
});

test("no history by default and history never exceeds five searches", async ({
  page,
}) => {
  await mockSearch(page);
  await page.goto("/");
  await search(page);
  expect(
    await page.evaluate(() => localStorage.getItem("sreon.history")),
  ).toBeNull();
  await page.getByRole("button", { name: "Search settings" }).click();
  await page.getByLabel("Remember recent searches").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  for (let i = 0; i < 7; i++) {
    await search(page, `nature ${i}`);
    await expect(page.locator("#results-meta")).toContainText("1 result");
  }
  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sreon.history")),
  );
  expect(history).toHaveLength(5);
  expect(history[0]).toBe("nature 6");
});

test("browser back and forward restore queries and home", async ({ page }) => {
  await mockSearch(page);
  await page.goto("/");
  await search(page, "forest");
  await expect(page.locator("article.result-item")).toBeVisible();
  await search(page, "architecture");
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("forest");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Less noise. More discovery." }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("searchbox")).toHaveValue("forest");
});

test("keyboard shortcuts, tab navigation and clear button work", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("searchbox").fill("hello");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "All", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Images", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Images", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("mobile layout and dialogs do not overflow horizontally", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await page.getByRole("button", { name: "Search settings" }).click();
  await expect(
    page.getByRole("button", { name: "Save preferences" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
