import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

function results(url) {
  const query = new URL(url).searchParams.get("q");
  return {
    results: [
      {
        title: `Explore ${query}`,
        url: "https://example.org/explore",
        content: "A result returned by the connected provider.",
        published: "",
      },
    ],
    elapsed: 0.1,
    hasMore: false,
    partial: false,
  };
}
async function openDemo(page) {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: true, connected: true } }),
  );
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: results(route.request().url()) }),
  );
  await page.goto("/#try");
  const frame = page.frameLocator("#demo-search-frame");
  await expect(frame.getByRole("searchbox")).toBeVisible();
  return frame;
}
async function addressSearch(page, text) {
  await page.getByLabel("Address bar — search or enter a website").fill(text);
  await page
    .getByRole("button", { name: "Search with Sreon", exact: true })
    .click();
}

test("browser landing page retains its sections and embeds the actual search app", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const frame = await openDemo(page);
  await expect(
    page.getByRole("heading", { name: "Try the browser", exact: true }),
  ).toBeVisible();
  for (const id of ["why", "features", "try", "privacy", "download", "contact"])
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.locator('a[href="/o"]')).toHaveCount(1);
  await expect(page.locator("#download a[download]")).toHaveCount(3);
  await expect(page.locator("#demo-status")).toContainText("Connected");
  await expect(
    frame.getByRole("heading", { name: "Less noise. More discovery." }),
  ).toBeVisible();
  await expect(page.locator(".demo-tabs")).not.toContainText("Google");
  expect(errors).toEqual([]);
});

test("address bar and embedded search both use the live-result API path", async ({
  page,
}) => {
  const frame = await openDemo(page);
  await addressSearch(page, "forest");
  await expect(
    frame.getByRole("link", { name: "Explore forest" }),
  ).toBeVisible();
  await expect(page.locator(".demo-tab.active")).toHaveText("forest");
  await frame.getByRole("searchbox").fill("architecture");
  await frame.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    frame.getByRole("link", { name: "Explore architecture" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Address bar — search or enter a website"),
  ).toHaveValue("architecture");
  await expect(page.locator("#standalone-search")).toHaveAttribute(
    "href",
    /\/search\/\?q=architecture$/,
  );
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(
    frame.getByRole("link", { name: "Explore forest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(
    frame.getByRole("link", { name: "Explore architecture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reload search", exact: true })
    .click();
  await expect(
    frame.getByRole("link", { name: "Explore architecture" }),
  ).toBeVisible();
});

test("tabs preserve searches and demo workspaces keep separate tab lists", async ({
  page,
}) => {
  const frame = await openDemo(page);
  await addressSearch(page, "forest");
  await expect(
    frame.getByRole("link", { name: "Explore forest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ New Tab", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Less noise. More discovery." }),
  ).toBeVisible();
  await addressSearch(page, "space");
  await expect(
    frame.getByRole("link", { name: "Explore space" }),
  ).toBeVisible();
  await expect(page.locator(".demo-tab")).toHaveCount(2);
  await page.getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.locator(".demo-tab")).toHaveCount(1);
  await expect(frame.getByRole("searchbox")).toHaveValue("");
  await addressSearch(page, "design");
  await expect(
    frame.getByRole("link", { name: "Explore design" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.locator(".demo-tab")).toHaveCount(2);
  await expect(frame.getByRole("searchbox")).toHaveValue("space");
  await page.getByRole("button", { name: "forest", exact: true }).click();
  await expect(
    frame.getByRole("link", { name: "Explore forest" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close forest tab", exact: true })
    .click();
  await expect(page.locator(".demo-tab")).toHaveCount(1);
  await expect(frame.getByRole("searchbox")).toHaveValue("space");
});

test("dark mode and command-menu preferences reach the embedded app", async ({
  page,
}) => {
  const frame = await openDemo(page);
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#demo-cmdk-btn").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Search preferences", exact: true })
    .click();
  await expect(frame.getByRole("dialog")).toBeVisible();
  await frame.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "☀ Cream mode", exact: true })
    .click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
});

test("real websites open outside the demo rather than becoming placeholders", async ({
  page,
}) => {
  const frame = await openDemo(page);
  await page
    .context()
    .route("https://example.org/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Destination website</h1>",
      }),
    );
  await addressSearch(page, "forest");
  const result = frame.getByRole("link", { name: "Explore forest" });
  await expect(result).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await result.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://example.org/explore");
  await popup.close();
  const addressPopupPromise = page.waitForEvent("popup");
  await addressSearch(page, "example.org");
  const addressPopup = await addressPopupPromise;
  await expect(addressPopup).toHaveURL("https://example.org/");
  await addressPopup.close();
  await expect(frame.getByRole("searchbox")).toHaveValue("forest");
});

test("mobile browser demo remains usable and does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const frame = await openDemo(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await addressSearch(page, "forest");
  await expect(
    frame.getByRole("link", { name: "Explore forest" }),
  ).toBeVisible();
  expect(
    await frame
      .locator("html")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("static hosting without an API shows honest setup guidance", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 404, contentType: "text/html", body: "Not found" }),
  );
  await page.goto("/#try");
  await addressSearch(page, "forest");
  const frame = page.frameLocator("#demo-search-frame");
  await expect(
    frame.getByRole("heading", { name: "One more step to the open web." }),
  ).toBeVisible();
  await expect(page.locator("#demo-status")).toContainText(
    "GitHub Pages only hosts the interface",
  );
});

test("a configured HTTPS search service works across origins without API CORS", async ({
  page,
}) => {
  await page.route("**/site-config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'window.SREON_SITE = { searchUrl: "https://search.example.test/search/" };',
    }),
  );
  await page.route("https://search.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/search")
      return route.fulfill({ json: results(url.href) });
    if (url.pathname === "/api/health")
      return route.fulfill({ json: { connected: true, configured: true } });
    let file = url.pathname.slice(1);
    if (file.endsWith("/")) file += "index.html";
    const types = {
      html: "text/html",
      js: "text/javascript",
      css: "text/css",
      png: "image/png",
      woff2: "font/woff2",
    };
    try {
      return route.fulfill({
        contentType:
          types[file.split(".").at(-1)] || "application/octet-stream",
        body: await readFile(new URL(`../${file}`, import.meta.url)),
      });
    } catch {
      return route.fulfill({ status: 404, body: "Not found" });
    }
  });
  await page.goto("/#try");
  const frame = page.frameLocator("#demo-search-frame");
  await expect(frame.getByRole("searchbox")).toBeVisible();
  await expect(page.locator("#demo-status")).toContainText("Connected");
  await frame.getByRole("searchbox").fill("curiosity");
  await frame.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    frame.getByRole("link", { name: "Explore curiosity" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Address bar — search or enter a website"),
  ).toHaveValue("curiosity");
  await page.locator("#demo-theme-toggle").click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
});
