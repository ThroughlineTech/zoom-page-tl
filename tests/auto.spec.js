// Explicit Auto mode (af:<host>, opt-in). When on, a site re-fits on every page
// load and resize - the old auto-fit behavior, but now only for sites the user
// explicitly turns Auto on for. (Plain "Fit width" is a one-shot fixed level -
// see autofit.spec.js.) Here we cover the re-fit that Auto re-enables, that
// turning it on fits live, and that a manual zoom leaves Auto.

const { test, expect } = require("./fixtures");

function htmlZoom(page) {
  return page.evaluate(() => document.documentElement.style.zoom);
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("an auto-fit site re-fits itself once the page settles", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "af:localhost": true })
  );
  await page.goto("/narrow");

  // The load handler re-fits (debounced): a 600px column in 1000px => ~1.67.
  await expect.poll(() => htmlZoom(page), { timeout: 6000 }).toBe("1.67");
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(["z:localhost", "af:localhost"])
  );
  expect(stored["z:localhost"]).toBeCloseTo(1.67, 2);
  expect(stored["af:localhost"]).toBe(true); // still in auto mode
});

test("turning Auto on fits the page live (no reload)", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/narrow"); // no level, no auto -> 100%
  expect(await htmlZoom(page)).toBe("");

  // Turn Auto on the way the options page does; content.js fits live.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "af:localhost": true })
  );
  await expect.poll(() => htmlZoom(page), { timeout: 6000 }).toBe("1.67");
});

test("a manual keyboard zoom leaves Auto mode", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "af:localhost": true, "z:localhost": 1.5 })
  );
  await page.goto("/");
  await page.locator("body").click();

  await page.keyboard.press("Control+Equal"); // a manual step

  // af cleared; z stepped 1.5 -> 1.75.
  await expect
    .poll(() =>
      serviceWorker.evaluate(() => chrome.storage.local.get("af:localhost"))
    )
    .toEqual({});
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeCloseTo(1.75, 5);
});
