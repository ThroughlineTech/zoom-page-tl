// Auto-fit MODE (af:<host>) and zoom re-assertion.
//   - An auto-fit site re-measures once the page settles (after load), so it
//     works on sites that reshape while loading.
//   - Any manual zoom (keys here; popup/options too) leaves auto-fit mode.
//   - If a page clobbers documentElement.style.zoom (a re-render), the content
//     script re-applies the desired factor.
// The service-worker pre-paint CSS injection (background.js injectZoomCss) is
// verified live, not here - injected stylesheets are not observable from the page
// the way these behaviors are.

const { test, expect } = require("./fixtures");

function htmlZoom(page) {
  return page.evaluate(() => document.documentElement.style.zoom);
}
function markerWidth(page) {
  return page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("an auto-fit site re-fits itself once the page settles", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  // Auto-fit mode on, no stored factor yet.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "af:localhost": true })
  );
  await page.goto("/narrow");

  // The load handler re-fits (debounced); a 600px column in 1000px => ~1.67.
  await expect.poll(() => htmlZoom(page), { timeout: 6000 }).toBe("1.67");
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(["z:localhost", "af:localhost"])
  );
  expect(stored["z:localhost"]).toBeCloseTo(1.67, 2);
  expect(stored["af:localhost"]).toBe(true); // still in auto-fit mode
});

test("a manual keyboard zoom leaves auto-fit mode", async ({
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
    .poll(() => serviceWorker.evaluate(() => chrome.storage.local.get("af:localhost")))
    .toEqual({});
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeCloseTo(1.75, 5);
});

test("re-applies the zoom if the page clobbers it", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  // Simulate a re-render that wipes our inline zoom.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  // The MutationObserver re-asserts the desired factor.
  await expect.poll(() => htmlZoom(page)).toBe("1.5");
  expect(Math.round(await markerWidth(page))).toBe(150);
});
