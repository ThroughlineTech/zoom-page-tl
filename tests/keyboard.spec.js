// Ctrl +/-/0 keyboard zoom.
//
// Chrome reserves these keys (an extension cannot bind them as commands) and the
// extension keeps browser zoom disabled, so without the content-script handler
// they do nothing. The handler intercepts them and drives the same per-site CSS
// zoom ladder as the popup. We dispatch real key events with page.keyboard and
// assert the page actually reflows (html style.zoom + marker width), that the
// "100% == absence of a key" storage convention holds, and that the badge tracks
// the change.

const { test, expect } = require("./fixtures");

function markerWidth(page) {
  return page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
}

function htmlZoom(page) {
  return page.evaluate(() => document.documentElement.style.zoom);
}

async function localhostTabId(serviceWorker) {
  return serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => (x.url || "").includes("localhost"));
    return t ? t.id : null;
  });
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("Ctrl+= zooms in one step and persists the per-site factor", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  await page.locator("body").click(); // ensure the page has keyboard focus
  expect(await htmlZoom(page)).toBe("");

  await page.keyboard.press("Control+Equal");

  // stepFrom(1.0, +1) === 1.1, applied live via storage.onChanged.
  await expect.poll(() => htmlZoom(page)).toBe("1.1");
  expect(Math.round(await markerWidth(page))).toBe(110);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get("z:localhost")
  );
  expect(stored["z:localhost"]).toBeCloseTo(1.1, 5);
});

test("Ctrl+- zooms out, and stepping back to 100% removes the key", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.1 })
  );
  await page.goto("/");
  await page.locator("body").click();
  expect(Math.round(await markerWidth(page))).toBe(110);

  await page.keyboard.press("Control+Minus");

  // stepFrom(1.1, -1) === 1.0 -> 100%, which is stored as the absence of a key.
  await expect.poll(() => htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:localhost"]).toBeUndefined();
});

test("Ctrl+0 resets to 100% and removes the key", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.75 })
  );
  await page.goto("/");
  await page.locator("body").click();
  expect(Math.round(await markerWidth(page))).toBe(175);

  await page.keyboard.press("Control+Digit0");

  await expect.poll(() => htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:localhost"]).toBeUndefined();
});

test("Ctrl+= updates the toolbar badge", async ({ page, serviceWorker }) => {
  await page.goto("/");
  await page.locator("body").click();
  const tabId = await localhostTabId(serviceWorker);
  expect(tabId).not.toBeNull();

  await page.keyboard.press("Control+Equal");

  await expect
    .poll(() =>
      serviceWorker.evaluate(
        (id) => chrome.action.getBadgeText({ tabId: id }),
        tabId
      )
    )
    .toBe("110");
});
