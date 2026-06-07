// AutoFit-to-width. The measurement + clamp + persist all happen in the content
// script in response to an "autofit" message; the popup button and the keyboard
// command both drive that same message path, so testing the message covers the
// logic. (chrome.commands hotkeys cannot be dispatched from Playwright; the
// command wiring is on the manual checklist.)

const { test, expect } = require("./fixtures");

async function tabIdFor(sw, frag) {
  return sw.evaluate(async (f) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((tab) => (tab.url || "").includes(f));
    return t ? t.id : null;
  }, frag);
}

async function runAutofit(sw, tabId) {
  return sw.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "autofit" }),
    tabId
  );
}

function htmlZoom(page) {
  return page.evaluate(() => document.documentElement.style.zoom);
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("AutoFit shrinks a too-wide page and persists the factor", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/wide");

  const tabId = await tabIdFor(serviceWorker, "localhost");
  const resp = await runAutofit(serviceWorker, tabId);

  // 3000px content in a 1000px viewport => ~0.33, within the [0.25, 5] range.
  expect(resp.factor).toBeGreaterThan(0.28);
  expect(resp.factor).toBeLessThan(0.4);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeCloseTo(resp.factor, 5);

  // The 100px marker should render ~100*factor in client coordinates.
  const w = await page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
  expect(w).toBeCloseTo(100 * resp.factor, 0);
});

test("AutoFit on a page that already fits leaves it at 100%", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/");

  const tabId = await tabIdFor(serviceWorker, "localhost");
  const resp = await runAutofit(serviceWorker, tabId);

  expect(resp.factor).toBeGreaterThan(0.98);
  expect(resp.factor).toBeLessThanOrEqual(1.0);
  expect(resp.fits).toBe(true); // nothing to fit => "already fits" feedback

  // 100% is stored as the absence of a key.
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeUndefined();
});

test("AutoFit fills a centered column narrower than the window", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/narrow");

  const tabId = await tabIdFor(serviceWorker, "localhost");
  const resp = await runAutofit(serviceWorker, tabId);

  // 600px column in a 1000px viewport => ~1.67 (enlarge to fill), not a no-op.
  expect(resp.fits).toBe(false);
  expect(resp.factor).toBeGreaterThan(1.5);
  expect(resp.factor).toBeLessThan(1.8);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeCloseTo(resp.factor, 5);

  // The column now (about) fills the viewport width.
  const fill = await page.evaluate(() => {
    const c = document.getElementById("col").getBoundingClientRect().width;
    return c / document.documentElement.clientWidth;
  });
  expect(fill).toBeGreaterThan(0.9);
});

test("AutoFit fills the real column and ignores a full-bleed breakout", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/messy");

  const tabId = await tabIdFor(serviceWorker, "localhost");
  const resp = await runAutofit(serviceWorker, tabId);

  // 1200 column in a 1600 viewport => ~1.33. The -400px breakout overflows the
  // viewport, but it must NOT trigger a shrink (the CNN regression).
  expect(resp.fits).toBe(false);
  expect(resp.factor).toBeGreaterThan(1.25);
  expect(resp.factor).toBeLessThan(1.4);
});

test("AutoFit clamps an extremely wide page to the minimum factor", async ({
  page,
  serviceWorker,
}) => {
  // 3000px content in a very narrow viewport would want < 0.25; must clamp.
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto("/wide");

  const tabId = await tabIdFor(serviceWorker, "localhost");
  const resp = await runAutofit(serviceWorker, tabId);

  expect(resp.factor).toBe(0.25);
});

test("a fitted level is fixed: the page does not re-fit on load", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  // A stored level that is NOT what AutoFit would compute for /narrow (~1.67),
  // plus a leftover legacy af: flag. Fit width is one-shot now, so neither must
  // trigger a re-fit on load - the level stays put (no bouncing).
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.2, "af:localhost": true })
  );
  await page.goto("/narrow");

  // The fixed 1.2 applies at document_start...
  await expect.poll(() => htmlZoom(page)).toBe("1.2");
  // ...and is still 1.2 well past the old 400ms re-fit debounce window.
  await page.waitForLoadState("load");
  await page.waitForTimeout(700);
  expect(await htmlZoom(page)).toBe("1.2");
  expect(
    await serviceWorker.evaluate(() =>
      chrome.storage.local.get("z:localhost").then((r) => r["z:localhost"])
    )
  ).toBe(1.2);
});
