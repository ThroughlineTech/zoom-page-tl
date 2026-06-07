// Core verification: the two headline guarantees plus storage semantics.
//   1. A stored per-host factor is applied (and reflows the page) on first paint.
//   2. Browser zoom stays disabled, the observable proxy for "the native zoom
//      bubble can never fire" (the bubble is browser chrome, not in the DOM, so
//      it cannot be asserted directly).
//   3. Live updates apply without a reload.
//   4. Reset removes the key (100% == absence of a key).

const { test, expect } = require("./fixtures");

function markerWidth(page) {
  return page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
}

async function tabIdFor(serviceWorker, urlFragment) {
  return serviceWorker.evaluate(async (frag) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((tab) => (tab.url || "").includes(frag));
    return t ? t.id : null;
  }, urlFragment);
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("applies a stored zoom factor on first paint", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");

  // The 100px marker should render ~150px wide under CSS zoom 1.5 (real reflow).
  const w = await markerWidth(page);
  expect(w).toBeGreaterThan(145);
  expect(w).toBeLessThan(155);

  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe(
    "1.5"
  );
});

test("a fresh site renders at 100% (no key)", async ({ page }) => {
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(100);
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe(
    ""
  );
});

test("browser zoom stays disabled (no-bubble proxy)", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  const tabId = await tabIdFor(serviceWorker, "localhost");
  expect(tabId).not.toBeNull();

  // setZoomSettings(disabled) is reapplied on every navigation; poll to allow
  // the service worker to wake and run its onUpdated handler.
  await expect
    .poll(async () =>
      serviceWorker.evaluate(
        (id) => chrome.tabs.getZoomSettings(id).then((s) => s.mode),
        tabId
      )
    )
    .toBe("disabled");

  const zoom = await serviceWorker.evaluate(
    (id) => chrome.tabs.getZoom(id),
    tabId
  );
  expect(zoom).toBe(1);
});

test("live storage updates apply without a reload", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(100);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 2 })
  );

  await expect
    .poll(async () => Math.round(await markerWidth(page)))
    .toBe(200);
});

test("reset removes the key and restores 100%", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("z:localhost")
  );

  await expect
    .poll(async () => await page.evaluate(() => document.documentElement.style.zoom))
    .toBe("");

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:localhost"]).toBeUndefined();
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

  // Simulate a re-render that wipes our inline zoom (e.g. a heavy SPA site).
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  // The MutationObserver re-asserts the FIXED factor (this is re-assert, not
  // re-measure - the level never changes).
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.zoom))
    .toBe("1.5");
  expect(Math.round(await markerWidth(page))).toBe(150);
});

test("stepFrom (service worker) walks the zoom ladder correctly", async ({
  serviceWorker,
}) => {
  // stepFrom is a top-level function in background.js, callable in SW scope.
  const inFrom1 = await serviceWorker.evaluate(() => stepFrom(1.0, 1));
  const outFrom1 = await serviceWorker.evaluate(() => stepFrom(1.0, -1));
  const inFromMax = await serviceWorker.evaluate(() => stepFrom(5.0, 1));
  const outFromMin = await serviceWorker.evaluate(() => stepFrom(0.25, -1));
  expect(inFrom1).toBeCloseTo(1.1, 5);
  expect(outFrom1).toBeCloseTo(0.9, 5);
  expect(inFromMax).toBeCloseTo(5.0, 5);
  expect(outFromMin).toBeCloseTo(0.25, 5);
});
