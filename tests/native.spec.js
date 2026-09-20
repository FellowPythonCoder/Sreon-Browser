import { test, expect } from "@playwright/test";

async function nativeApp(page, endpoint = "https://search.example.org/") {
  await page.addInitScript(
    ({ endpoint }) => {
      if (endpoint) localStorage.setItem("sreon.endpoint", endpoint);
      window.nativeCalls = [];
      window.__TAURI__ = {
        event: { listen: async () => () => {} },
        core: {
          invoke: async (command, payload) => {
            window.nativeCalls.push({ command, payload });
            if (command === "connection_status")
              return {
                connected: !!payload.endpoint,
                configured: !!payload.endpoint,
              };
            if (command === "open_page") return null;
            if (!payload.endpoint)
              throw {
                status: 503,
                code: "NOT_CONFIGURED",
                message:
                  "Add a hosted HTTPS search service in Search settings.",
              };
            return {
              results: [
                {
                  title: `Native result for ${payload.request.q}`,
                  url: "https://example.org/result",
                  content: "A response from the Rust search adapter.",
                  thumbnail: "",
                  published: "",
                },
              ],
              elapsed: 0.1,
              hasMore: true,
              partial: false,
            };
          },
        },
      };
    },
    { endpoint },
  );
  await page.goto("/");
}

test("native app uses Rust IPC, not a localhost search API", async ({
  page,
}) => {
  const apiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await nativeApp(page);
  await expect(page.locator("html")).toHaveClass(/native-app/);
  await page.getByRole("searchbox").fill("forest");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Native result for forest" }),
  ).toBeVisible();
  const call = await page.evaluate(() =>
    window.nativeCalls.find((call) => call.command === "search"),
  );
  expect(call.payload.endpoint).toBe("https://search.example.org/");
  expect(call.payload.request.q).toBe("forest");
  expect(call.payload.request.category).toBe("general");
  expect(apiRequests).toEqual([]);
});

test("native setup opens app settings, not Docker instructions", async ({
  page,
}) => {
  await nativeApp(page, "");
  await expect(page.locator("#desktop-connection")).toBeVisible();
  await page.getByRole("searchbox").fill("forests");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect your search engine" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Search service");
  await expect(page.getByRole("dialog")).not.toContainText("Docker");
  await page
    .getByLabel("Search service", { exact: true })
    .fill("https://search.example.org");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("link", { name: "Native result for forests" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("sreon.endpoint")),
  ).toBe("https://search.example.org/");
});

test("native settings reject insecure and local service addresses", async ({
  page,
}) => {
  await nativeApp(page, "");
  await page.getByRole("button", { name: "Search settings" }).click();
  for (const url of [
    "http://example.org",
    "https://localhost",
    "https://127.0.0.1",
    "https://example.org/?key=secret",
  ]) {
    await page.getByLabel("Search service", { exact: true }).fill(url);
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator("#endpoint-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  expect(
    await page.evaluate(() => localStorage.getItem("sreon.endpoint")),
  ).toBeNull();
});

test("result links open a native browsing window rather than replacing search", async ({
  page,
}) => {
  await nativeApp(page);
  await page.getByRole("searchbox").fill("nature");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "Native result for nature" }).click();
  const call = await page.evaluate(() =>
    window.nativeCalls.find((call) => call.command === "open_page"),
  );
  expect(call.payload).toEqual({
    url: "https://example.org/result",
    reuse: false,
  });
  await expect(page).toHaveURL(/q=nature/);
  await expect(page.getByRole("searchbox")).toHaveValue("nature");
});

test("typing a website works without a search backend", async ({ page }) => {
  await nativeApp(page, "");
  await page.getByRole("searchbox").fill("example.org");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const calls = await page.evaluate(() => window.nativeCalls);
  expect(calls.filter((call) => call.command === "search")).toHaveLength(0);
  expect(calls.find((call) => call.command === "open_page").payload.url).toBe(
    "https://example.org/",
  );
});

test("native window reuse preference is respected", async ({ page }) => {
  await nativeApp(page);
  await page.getByRole("button", { name: "Search settings" }).click();
  await page.getByLabel("Open results in a new window").uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("searchbox").fill("https://example.org/article");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.nativeCalls.find((call) => call.command === "open_page").payload
          .reuse,
    ),
  ).toBe(true);
});

test("native settings reset disconnects the service and clears history", async ({
  page,
}) => {
  await nativeApp(page);
  await page.getByRole("button", { name: "Search settings" }).click();
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await expect(page.getByLabel("Search service", { exact: true })).toHaveValue(
    "",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("sreon.endpoint")),
  ).toBe("");
});
