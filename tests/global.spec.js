// Global disable (cfg:off) - the master switch. When set, the extension is off on
// EVERY site, regardless of any per-site z:/x:/p:: content.js holds each page at
// 100%, and the service worker puts the tab in "automatic" (native zoom back) and
// shows the "off" badge. The popup power switch and the toggle-global command both
// just flip cfg:off (the command itself can't be dispatched from Playwright - that
// is a manual checklist item; here we drive the storage flag it writes).

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

test("off everywhere: a leveled site is not zoomed", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5, "cfg:off": true })
  );
  await page.goto("/");
  expect(await htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);
});

test("toggling the master switch un-zooms live, and back on restores", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:off": true })
  );
  await expect.poll(() => htmlZoom(page)).toBe("");
  // The per-site level is left untouched, so turning it back on restores it.
  expect(
    await serviceWorker.evaluate(() => chrome.storage.local.get("z:localhost"))
  ).toEqual({ "z:localhost": 1.5 });

  await serviceWorker.evaluate(() => chrome.storage.local.remove("cfg:off"));
  await expect.poll(() => htmlZoom(page)).toBe("1.5");
  expect(Math.round(await markerWidth(page))).toBe(150);
});

test("off everywhere hands browser zoom back and shows the 'off' badge", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  const tabId = await localhostTabId(serviceWorker);
  const mode = () =>
    serviceWorker.evaluate(
      (id) => chrome.tabs.getZoomSettings(id).then((s) => s.mode),
      tabId
    );

  await expect.poll(mode).toBe("disabled");

  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:off": true })
  );
  await expect.poll(mode).toBe("automatic");
  await expect
    .poll(() =>
      serviceWorker.evaluate(
        (id) => chrome.action.getBadgeText({ tabId: id }),
        tabId
      )
    )
    .toBe("off");

  await serviceWorker.evaluate(() => chrome.storage.local.remove("cfg:off"));
  await expect.poll(mode).toBe("disabled");
});

test("the master switch and per-site exclude are independent", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:localhost": 1.5,
      "x:localhost": true,
      "cfg:off": true,
    })
  );
  await page.goto("/");
  expect(await htmlZoom(page)).toBe(""); // off both ways

  // Turn the master switch back on: the per-site exclude still holds it at 100%.
  await serviceWorker.evaluate(() => chrome.storage.local.remove("cfg:off"));
  await expect.poll(() => htmlZoom(page)).toBe("");

  // Remove the exclude too: now the stored level finally applies.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("x:localhost")
  );
  await expect.poll(() => htmlZoom(page)).toBe("1.5");
});
