// Live zoom slider. Three things are testable without a real popup gesture:
//   1. the pure log-map + snap helpers (zoom.js), which carry the only tricky math;
//   2. the content-script "previewZoom" handler, which applies a factor live
//      WITHOUT writing storage (the mechanism behind dragging the slider); and
//   3. the settable slider extents (cfg:zoomMin / cfg:zoomMax) via window.ZP.
// The actual drag/keyboard/wheel gestures in the popup are on the manual
// checklist (like the global hotkeys: a popup driving its own active tab cannot
// be simulated here).

const { test, expect } = require("./fixtures");

function markerWidth(page) {
  return page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
}

async function tabIdFor(serviceWorker, frag) {
  return serviceWorker.evaluate(async (f) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((tab) => (tab.url || "").includes(f));
    return t ? t.id : null;
  }, frag);
}

async function openOptions(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForFunction(() => !!window.ZP);
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("log map round-trips and its midpoint is the geometric mean", async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId); // any page that loads zoom.js
  const r = await page.evaluate(() => {
    const min = 0.05;
    const max = 4.0;
    return {
      lo: posToFactor(0, min, max),
      hi: posToFactor(1, min, max),
      mid: posToFactor(0.5, min, max),
      roundTrip: factorToPos(posToFactor(0.3, min, max), min, max),
    };
  });
  expect(r.lo).toBeCloseTo(0.05, 5);
  expect(r.hi).toBeCloseTo(4.0, 5);
  expect(r.mid).toBeCloseTo(Math.sqrt(0.05 * 4.0), 5); // geometric mean
  expect(r.roundTrip).toBeCloseTo(0.3, 5);
});

test("snap grabs a detent inside the well but releases past it", async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  const r = await page.evaluate(() => {
    const min = 0.05;
    const max = 4.0;
    const well = 0.01;
    // A factor just inside the well around 100% snaps to exactly 1.0.
    const nearPos = factorToPos(1.0, min, max) + 0.005;
    const near = posToFactor(nearPos, min, max);
    // The midpoint between 100% and 110% is 1/2 a detent-gap away from each,
    // which is wider than the well, so it must NOT snap.
    const midPos = (factorToPos(1.0, min, max) + factorToPos(1.1, min, max)) / 2;
    const mid = posToFactor(midPos, min, max);
    return {
      snappedNear: snapFactor(near, min, max, well),
      free: snapFactor(mid, min, max, well),
      mid,
    };
  });
  expect(r.snappedNear).toBe(1.0); // grabbed the detent
  expect(r.free).toBeCloseTo(r.mid, 6); // unchanged (slid past)
  expect(r.free).toBeGreaterThan(1.0);
  expect(r.free).toBeLessThan(1.1);
});

test("previewZoom applies the factor live without writing storage", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  const tabId = await tabIdFor(serviceWorker, "localhost");

  await serviceWorker.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "previewZoom", factor: 1.5 }),
    tabId
  );

  // The page reflows live...
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(150);
  // ...but nothing is persisted (the commit happens on release, not on drag).
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeUndefined();
});

test("previewZoom is ignored on a suppressed (excluded) site", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:localhost": true })
  );
  await page.goto("/");
  const tabId = await tabIdFor(serviceWorker, "localhost");

  await serviceWorker.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "previewZoom", factor: 1.5 }),
    tabId
  );
  await page.waitForTimeout(150);
  expect(Math.round(await markerWidth(page))).toBe(100); // held at 100%
});

test("a 5% level applies end-to-end (the widened clamp floor)", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 0.05 })
  );
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe(
    "0.05"
  );
  const w = await markerWidth(page);
  expect(w).toBeGreaterThan(3);
  expect(w).toBeLessThan(7); // 100px marker at 5% => ~5px
});

test("slider extents default to 5-400% and round-trip when set", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  expect(await page.evaluate(() => window.ZP.getBounds())).toEqual({
    min: 0.05,
    max: 4.0,
  });

  const ok = await page.evaluate(() => window.ZP.setBounds(0.5, 3.0));
  expect(ok).toBe(true);
  expect(await page.evaluate(() => window.ZP.getBounds())).toEqual({
    min: 0.5,
    max: 3.0,
  });
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(["cfg:zoomMin", "cfg:zoomMax"])
  );
  expect(stored["cfg:zoomMin"]).toBe(0.5);
  expect(stored["cfg:zoomMax"]).toBe(3.0);
});

test("slider extents reject max<=min and clamp to the hard range", async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);

  // Incoherent: writes nothing, returns false, stays at the defaults.
  expect(await page.evaluate(() => window.ZP.setBounds(2.0, 1.0))).toBe(false);
  expect(await page.evaluate(() => window.ZP.getBounds())).toEqual({
    min: 0.05,
    max: 4.0,
  });

  // Out of range: 0.01 -> 0.05 floor, 99 -> 5.0 ceiling.
  await page.evaluate(() => window.ZP.setBounds(0.01, 99));
  expect(await page.evaluate(() => window.ZP.getBounds())).toEqual({
    min: 0.05,
    max: 5.0,
  });
});
