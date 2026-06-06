// Options page: global default zoom, manage-list UI, and JSON import/export.
// The pure storage ops are tested via window.ZP (deterministic, no file dialog);
// the UI is tested by driving the real DOM.

const { test, expect } = require("./fixtures");

async function openOptions(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForFunction(() => !!window.ZP);
}

function markerWidth(page) {
  return page.evaluate(
    () => document.getElementById("marker").getBoundingClientRect().width
  );
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("export then import round-trips per-site data and default", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  await page.evaluate(async () => {
    await window.ZP.setSite("a.example.com", 1.5);
    await window.ZP.setSite("b.example.com", 0.75);
    await window.ZP.setDefault(1.25);
  });

  const dump = await page.evaluate(() => window.ZP.exportData());
  expect(dump).toEqual({
    version: 1,
    defaultZoom: 1.25,
    sites: { "a.example.com": 1.5, "b.example.com": 0.75 },
  });

  await serviceWorker.evaluate(() => chrome.storage.local.clear());
  const count = await page.evaluate(
    (d) => window.ZP.importData(d, { replace: true }),
    dump
  );
  expect(count).toBe(2);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:a.example.com"]).toBe(1.5);
  expect(stored["z:b.example.com"]).toBe(0.75);
  expect(stored["cfg:defaultZoom"]).toBe(1.25);
});

test("import merges by default and replaces when asked", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  await page.evaluate(() => window.ZP.setSite("keep.example.com", 1.5));

  await page.evaluate(() =>
    window.ZP.importData(
      { version: 1, sites: { "new.example.com": 2 } },
      { replace: false }
    )
  );
  let stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:keep.example.com"]).toBe(1.5);
  expect(stored["z:new.example.com"]).toBe(2);

  await page.evaluate(() =>
    window.ZP.importData(
      { version: 1, sites: { "replaced.example.com": 1.1 } },
      { replace: true }
    )
  );
  stored = await serviceWorker.evaluate(() => chrome.storage.local.get(null));
  expect(stored["z:keep.example.com"]).toBeUndefined();
  expect(stored["z:new.example.com"]).toBeUndefined();
  expect(stored["z:replaced.example.com"]).toBe(1.1);
});

test("import clamps out-of-range values and drops 100% / invalid", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  const count = await page.evaluate(() =>
    window.ZP.importData(
      {
        version: 1,
        sites: {
          "huge.example.com": 99,
          "tiny.example.com": 0.01,
          "one.example.com": 1.0,
          "bad.example.com": "nope",
        },
      },
      { replace: true }
    )
  );
  expect(count).toBe(2);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:huge.example.com"]).toBe(5);
  expect(stored["z:tiny.example.com"]).toBe(0.25);
  expect(stored["z:one.example.com"]).toBeUndefined();
  expect(stored["z:bad.example.com"]).toBeUndefined();
});

test("global default applies to un-customized sites; a site key overrides it", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:defaultZoom": 1.25 })
  );
  await page.goto("/");
  await expect
    .poll(async () => Math.round(await markerWidth(page)))
    .toBe(125);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 2 })
  );
  await expect
    .poll(async () => Math.round(await markerWidth(page)))
    .toBe(200);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("z:localhost")
  );
  await expect
    .poll(async () => Math.round(await markerWidth(page)))
    .toBe(125);
});

test("global default drives the command stepping base and the badge", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:defaultZoom": 1.25 })
  );
  await page.goto("/");

  const tabId = await serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => (x.url || "").includes("localhost"));
    return t ? t.id : null;
  });
  expect(tabId).not.toBeNull();

  // getFactor resolves the default for an un-customized site, so the Alt+Shift
  // "zoom in" command steps UP from 1.25 (to 1.5), not from 1.0 (which would
  // shrink a page already shown at 125%). chrome.commands cannot be dispatched
  // from Playwright, so we assert the helper that determines the step base.
  const base = await serviceWorker.evaluate(() => getFactor("localhost"));
  expect(base).toBeCloseTo(1.25, 5);
  expect(await serviceWorker.evaluate(() => stepFrom(1.25, 1))).toBeCloseTo(
    1.5,
    5
  );

  // The badge shows the resolved percent, not a blank that would imply 100%.
  await expect
    .poll(() =>
      serviceWorker.evaluate(
        (id) => chrome.action.getBadgeText({ tabId: id }),
        tabId
      )
    )
    .toBe("125");

  // A site's own key still overrides the default.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 2 })
  );
  expect(await serviceWorker.evaluate(() => getFactor("localhost"))).toBe(2);
});

test("options UI lists saved sites, edits a level, and removes a site", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:alpha.example.com": 1.5,
      "z:beta.example.com": 0.9,
    })
  );
  await openOptions(page, extensionId);

  await expect(page.locator("#sites tr")).toHaveCount(2);
  await expect(
    page.locator("#sites tr").first().locator("td.host")
  ).toHaveText("alpha.example.com");

  const alphaInput = page
    .locator("#sites tr", { hasText: "alpha.example.com" })
    .locator("input");
  await alphaInput.fill("175");
  await alphaInput.blur();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("z:alpha.example.com")
          .then((r) => r["z:alpha.example.com"])
      )
    )
    .toBe(1.75);

  await page
    .locator("#sites tr", { hasText: "beta.example.com" })
    .locator("button.remove")
    .click();
  await expect(page.locator("#sites tr")).toHaveCount(1);
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:beta.example.com"]).toBeUndefined();
});

test("listSites includes paused-only sites and marks pause state", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:a.example.com": 1.5,
      "x:b.example.com": true,
      "z:c.example.com": 1.2,
      "x:c.example.com": true,
    })
  );
  await openOptions(page, extensionId);
  const sites = await page.evaluate(() => window.ZP.listSites());
  expect(sites).toEqual([
    { host: "a.example.com", factor: 1.5, paused: false },
    { host: "b.example.com", factor: null, paused: true },
    { host: "c.example.com", factor: 1.2, paused: true },
  ]);
});

test("options UI lists a paused-only site and resumes it", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:paused.example.com": true })
  );
  await openOptions(page, extensionId);

  const row = page.locator("#sites tr", { hasText: "paused.example.com" });
  await expect(row).toHaveCount(1);
  await expect(row.locator(".tag")).toHaveText("Paused");
  await expect(row.locator("input")).toBeDisabled();

  await row.locator("button.toggle").click(); // Resume
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("x:paused.example.com")
          .then((r) => r["x:paused.example.com"])
      )
    )
    .toBeUndefined();
  // With no level and no pause key, the site is no longer customized.
  await expect(page.locator("#sites tr")).toHaveCount(0);
});

test("options UI pauses an active site and keeps its level", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:active.example.com": 1.5 })
  );
  await openOptions(page, extensionId);

  const row = page.locator("#sites tr", { hasText: "active.example.com" });
  await expect(row.locator("input")).not.toBeDisabled();

  await row.locator("button.toggle").click(); // Pause
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("x:active.example.com")
          .then((r) => r["x:active.example.com"])
      )
    )
    .toBe(true);
  await expect(row.locator(".tag")).toHaveText("Paused");
  await expect(row.locator("input")).toBeDisabled();
  // The saved level survives a pause so resuming restores it.
  expect(
    await serviceWorker.evaluate(() =>
      chrome.storage.local
        .get("z:active.example.com")
        .then((r) => r["z:active.example.com"])
    )
  ).toBe(1.5);
});

test("removeSite clears the level, pause, and auto-fit keys together", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:gone.example.com": 1.5,
      "x:gone.example.com": true,
      "af:gone.example.com": true,
    })
  );
  await openOptions(page, extensionId);
  await page.evaluate(() => window.ZP.removeSite("gone.example.com"));

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:gone.example.com"]).toBeUndefined();
  expect(stored["x:gone.example.com"]).toBeUndefined();
  expect(stored["af:gone.example.com"]).toBeUndefined();
});

test("default zoom field writes the default and resets it", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  const def = page.locator("#default");
  await def.fill("130");
  await def.blur();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("cfg:defaultZoom")
          .then((r) => r["cfg:defaultZoom"])
      )
    )
    .toBe(1.3);

  await page.locator("#defaultReset").click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("cfg:defaultZoom")
          .then((r) => r["cfg:defaultZoom"])
      )
    )
    .toBeUndefined();
  await expect(def).toHaveValue("100");
});
