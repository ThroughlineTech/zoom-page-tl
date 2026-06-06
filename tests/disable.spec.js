// Per-site disable (pause). The popup writes x:<host> = true; content.js then
// leaves the page at its natural 100% (ignoring any stored factor and the global
// default), the keyboard zoom is inert, and the badge shows "off". We exercise
// the behavior content.js honors (driving storage the way the popup toggle does);
// the toggle widget itself is a manual checklist item.

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

test("a disabled site is not zoomed even with a stored factor", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5, "x:localhost": true })
  );
  await page.goto("/");

  expect(await htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);
});

test("a disabled site ignores the global default too", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:defaultZoom": 1.25, "x:localhost": true })
  );
  await page.goto("/");

  expect(await htmlZoom(page)).toBe("");
  expect(Math.round(await markerWidth(page))).toBe(100);
});

test("toggling disable un-zooms live, and re-enabling restores the factor", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5 })
  );
  await page.goto("/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  // Pause: page drops to 100% without a reload (the stored 1.5 is preserved).
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:localhost": true })
  );
  await expect.poll(() => htmlZoom(page)).toBe("");
  expect(
    await serviceWorker.evaluate(() => chrome.storage.local.get("z:localhost"))
  ).toEqual({ "z:localhost": 1.5 });

  // Resume: the preserved factor re-applies live.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("x:localhost")
  );
  await expect.poll(() => htmlZoom(page)).toBe("1.5");
  expect(Math.round(await markerWidth(page))).toBe(150);
});

test("on a disabled site, Ctrl +/- do not drive the extension", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 1.5, "x:localhost": true })
  );
  await page.goto("/");
  await page.locator("body").click();
  expect(Math.round(await markerWidth(page))).toBe(100);

  await page.keyboard.press("Control+Equal");
  await page.keyboard.press("Control+Minus");
  await page.waitForTimeout(150);

  // The extension applies no CSS zoom and writes nothing; the keys are left to
  // the browser (see the next two tests for the mode and the un-prevented event).
  expect(await htmlZoom(page)).toBe("");
  expect(
    await serviceWorker.evaluate(() => chrome.storage.local.get("z:localhost"))
  ).toEqual({ "z:localhost": 1.5 });
});

test("a disabled site hands browser zoom back (mode automatic)", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:localhost": true })
  );
  await page.goto("/");
  const tabId = await localhostTabId(serviceWorker);
  expect(tabId).not.toBeNull();

  // Inverse of the core "browser zoom stays disabled" guarantee: on a paused
  // site native zoom is restored, so Ctrl +/- and the browser bubble work.
  await expect
    .poll(() =>
      serviceWorker.evaluate(
        (id) => chrome.tabs.getZoomSettings(id).then((s) => s.mode),
        tabId
      )
    )
    .toBe("automatic");
});

test("toggling disable flips the browser-zoom mode live", async ({
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
    chrome.storage.local.set({ "x:localhost": true })
  );
  await expect.poll(mode).toBe("automatic");

  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("x:localhost")
  );
  await expect.poll(mode).toBe("disabled");
});

test("on a disabled site, Ctrl+= is left un-prevented for the browser", async ({
  page,
  serviceWorker,
}) => {
  await page.goto("/");
  await page.locator("body").click();
  await page.evaluate(() => {
    window.__dp = null;
    // Bubble-phase, so it runs after the content script's capture-phase handler
    // and observes whether that handler called preventDefault.
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        window.__dp = e.defaultPrevented;
      }
    });
  });

  // Enabled: the content script intercepts (preventDefault => true).
  await page.keyboard.press("Control+Equal");
  await expect.poll(() => page.evaluate(() => window.__dp)).toBe(true);

  // Disable and wait for the content script to observe it (page un-zooms).
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:localhost": true })
  );
  await expect.poll(() => htmlZoom(page)).toBe("");

  // Paused: the key is left un-prevented, so the browser handles it natively.
  await page.evaluate(() => (window.__dp = null));
  await page.keyboard.press("Control+Equal");
  await expect.poll(() => page.evaluate(() => window.__dp)).toBe(false);
});

test("the badge shows 'off' for a disabled site", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:localhost": true })
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
