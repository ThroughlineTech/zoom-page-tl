// Per-site pause (p:<host> = "suspend zoom for now, resume later"). Distinct from
// exclude (x:): pause keeps the site in the Active list and is meant to be
// temporary, but on the page it behaves the same as exclude - the extension
// steps aside, holding the page at 100% and handing native zoom back. These
// tests prove p: drives that suppression independently of x:. (exclude.spec.js
// covers the shared keyboard/un-prevented nuances via x:.)

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

test("a paused site is not zoomed even with a stored factor", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5, "p:localhost": true })
  );
  await page.goto("/");

  expect(await htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);
});

test("toggling pause un-zooms live, and resuming restores the factor", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  // Pause: page drops to 100% without a reload; the stored 1.5 is preserved.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "p:localhost": true })
  );
  await expect.poll(() => htmlZoom(page)).toBe("");
  expect(
    await serviceWorker.evaluate(() => chrome.storage.local.get("z:localhost"))
  ).toEqual({ "z:localhost": 1.5 });

  // Resume: the preserved factor re-applies live.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("p:localhost")
  );
  await expect.poll(() => htmlZoom(page)).toBe("1.5");
  expect(Math.round(await markerWidth(page))).toBe(150);
});

test("a paused site hands browser zoom back (mode automatic)", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  const tabId = await localhostTabId(serviceWorker);
  const mode = () =>
    serviceWorker.evaluate(
      (id) => chrome.tabs.getZoomSettings(id).then((s) => s.mode),
      tabId
    );

  await expect.poll(mode).toBe("disabled");

  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "p:localhost": true })
  );
  await expect.poll(mode).toBe("automatic");

  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("p:localhost")
  );
  await expect.poll(mode).toBe("disabled");
});

test("the badge shows 'off' for a paused site", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "p:localhost": true })
  );
  await page.goto("/");
  const tabId = await localhostTabId(serviceWorker);
  expect(tabId).not.toBeNull();

  await expect
    .poll(() =>
      serviceWorker.evaluate(
        (id) => chrome.action.getBadgeText({ tabId: id }),
        tabId
      )
    )
    .toBe("off");
});
