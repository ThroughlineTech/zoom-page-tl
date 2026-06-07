// Options page: global default zoom, the Active/Excluded manage-list UI, and JSON
// import/export. The pure storage ops are tested via window.ZP (deterministic, no
// file dialog); the UI is tested by driving the real DOM.

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

test("export then import round-trips levels, default, and excludes", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  await page.evaluate(async () => {
    await window.ZP.setSite("a.example.com", 1.5);
    await window.ZP.setSite("b.example.com", 0.75);
    await window.ZP.setDefault(1.25);
    await window.ZP.setExcluded("c.example.com", true);
  });

  const dump = await page.evaluate(() => window.ZP.exportData());
  expect(dump).toEqual({
    version: 1,
    defaultZoom: 1.25,
    sites: { "a.example.com": 1.5, "b.example.com": 0.75 },
    excluded: ["c.example.com"],
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
  expect(stored["x:c.example.com"]).toBe(true);
});

test("export carries excluded sites (incl. ones that also have a level)", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  await page.evaluate(async () => {
    await window.ZP.setSite("keep.example.com", 1.4); // active, leveled
    await window.ZP.setSite("both.example.com", 1.2); // leveled...
    await window.ZP.setExcluded("both.example.com", true); // ...and excluded
    await window.ZP.setExcluded("never.example.com", true); // excluded-only
  });

  const dump = await page.evaluate(() => window.ZP.exportData());
  expect(dump.sites).toEqual({
    "keep.example.com": 1.4,
    "both.example.com": 1.2,
  });
  expect(dump.excluded).toEqual(["both.example.com", "never.example.com"]);

  await serviceWorker.evaluate(() => chrome.storage.local.clear());
  await page.evaluate((d) => window.ZP.importData(d, { replace: true }), dump);
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:keep.example.com"]).toBe(1.4);
  expect(stored["z:both.example.com"]).toBe(1.2);
  expect(stored["x:both.example.com"]).toBe(true);
  expect(stored["x:never.example.com"]).toBe(true);
});

test("replace import clears existing excludes", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:old.example.com": true })
  );
  await openOptions(page, extensionId);
  await page.evaluate(() =>
    window.ZP.importData(
      { version: 1, sites: {}, excluded: ["new.example.com"] },
      { replace: true }
    )
  );
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["x:old.example.com"]).toBeUndefined();
  expect(stored["x:new.example.com"]).toBe(true);
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

test("listSites reports level, excluded, and paused state", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:a.example.com": 1.5,
      "x:b.example.com": true,
      "z:c.example.com": 1.2,
      "p:c.example.com": true,
    })
  );
  await openOptions(page, extensionId);
  const sites = await page.evaluate(() => window.ZP.listSites());
  expect(sites).toEqual([
    { host: "a.example.com", factor: 1.5, excluded: false, paused: false, auto: false },
    { host: "b.example.com", factor: null, excluded: true, paused: false, auto: false },
    { host: "c.example.com", factor: 1.2, excluded: false, paused: true, auto: false },
  ]);
});

test("options UI toggles Auto for an active site", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:fit.example.com": 1.3 })
  );
  await openOptions(page, extensionId);

  const row = page.locator("#active tr", { hasText: "fit.example.com" });
  await expect(row.locator("input")).not.toBeDisabled();

  await row.locator("button", { hasText: "Auto" }).click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("af:fit.example.com")
          .then((r) => r["af:fit.example.com"])
      )
    )
    .toBe(true);
  // Auto on: level field greyed/disabled, the Auto button highlighted.
  await expect(row.locator("input")).toBeDisabled();
  await expect(row.locator("button.on")).toHaveText("Auto");
  // Still in the Active list (not moved anywhere).
  await expect(page.locator("#active tr", { hasText: "fit.example.com" })).toHaveCount(
    1
  );

  // Toggle off: af cleared, level editable again.
  await row.locator("button", { hasText: "Auto" }).click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("af:fit.example.com")
          .then((r) => r["af:fit.example.com"])
      )
    )
    .toBeUndefined();
  await expect(
    page.locator("#active tr", { hasText: "fit.example.com" }).locator("input")
  ).not.toBeDisabled();
});

test("options footer links to the company site and the repo", async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  await expect(
    page.locator(".brand a", { hasText: "Throughline Tech" })
  ).toHaveAttribute("href", "https://www.throughlinetech.net/");
  await expect(
    page.locator(".brand a", { hasText: "GitHub" })
  ).toHaveAttribute("href", "https://github.com/ThroughlineTech/zoom-page-tl");
});

test("site names are links that open the site", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:news.example.com": 1.2,
      "x:gone.example.com": true,
    })
  );
  await openOptions(page, extensionId);

  await expect(
    page.locator("#active tr a", { hasText: "news.example.com" })
  ).toHaveAttribute("href", "https://news.example.com/");
  // Excluded names are linked too.
  await expect(
    page.locator("#excluded tr a", { hasText: "gone.example.com" })
  ).toHaveAttribute("href", "https://gone.example.com/");
});

test("options UI lists active sites, edits a level, and removes a site", async ({
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

  await expect(page.locator("#active tr")).toHaveCount(2);
  await expect(
    page.locator("#active tr").first().locator("td.host")
  ).toHaveText("alpha.example.com");

  const alphaInput = page
    .locator("#active tr", { hasText: "alpha.example.com" })
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
    .locator("#active tr", { hasText: "beta.example.com" })
    .locator("button.remove")
    .click();
  await expect(page.locator("#active tr")).toHaveCount(1);
  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:beta.example.com"]).toBeUndefined();
});

test("options UI shows an excluded-only site in the Excluded list and includes it", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "x:never.example.com": true })
  );
  await openOptions(page, extensionId);

  const row = page.locator("#excluded tr", { hasText: "never.example.com" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("input")).toBeDisabled();
  await expect(page.locator("#active tr")).toHaveCount(0);

  await row.locator("button", { hasText: "Include" }).click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("x:never.example.com")
          .then((r) => r["x:never.example.com"])
      )
    )
    .toBeUndefined();
  // No level and no exclude -> no longer a customized site.
  await expect(page.locator("#excluded tr")).toHaveCount(0);
});

test("options UI excludes an active site: moves to Excluded, keeps level, clears pause", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:news.example.com": 1.32,
      "p:news.example.com": true,
    })
  );
  await openOptions(page, extensionId);

  const activeRow = page.locator("#active tr", { hasText: "news.example.com" });
  await expect(activeRow).toHaveCount(1);

  await activeRow.locator("button", { hasText: "Exclude" }).click();

  await expect(
    page.locator("#excluded tr", { hasText: "news.example.com" })
  ).toHaveCount(1);
  await expect(page.locator("#active tr")).toHaveCount(0);

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["x:news.example.com"]).toBe(true);
  expect(stored["p:news.example.com"]).toBeUndefined(); // exclude supersedes pause
  expect(stored["z:news.example.com"]).toBe(1.32); // level kept
});

test("options UI pauses an active site (stays Active, tagged) and resumes", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:blog.example.com": 1.5 })
  );
  await openOptions(page, extensionId);

  const row = page.locator("#active tr", { hasText: "blog.example.com" });
  await expect(row.locator("input")).not.toBeDisabled();

  await row.locator("button", { hasText: "Pause" }).click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("p:blog.example.com")
          .then((r) => r["p:blog.example.com"])
      )
    )
    .toBe(true);
  // Still Active (not moved to Excluded); now greyed, and Pause flipped to Resume.
  await expect(page.locator("#active tr", { hasText: "blog.example.com" })).toHaveCount(
    1
  );
  await expect(page.locator("#excluded tr")).toHaveCount(0);
  await expect(row.locator("button", { hasText: "Resume" })).toBeVisible();
  await expect(row.locator("input")).toBeDisabled();

  await row.locator("button", { hasText: "Resume" }).click();
  await expect
    .poll(() =>
      serviceWorker.evaluate(() =>
        chrome.storage.local
          .get("p:blog.example.com")
          .then((r) => r["p:blog.example.com"])
      )
    )
    .toBeUndefined();
  await expect(
    page.locator("#active tr", { hasText: "blog.example.com" }).locator("input")
  ).not.toBeDisabled();
});

test("removeSite clears the level, exclude, and pause keys together", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:gone.example.com": 1.5,
      "x:gone.example.com": true,
      "p:gone.example.com": true,
    })
  );
  await openOptions(page, extensionId);
  await page.evaluate(() => window.ZP.removeSite("gone.example.com"));

  const stored = await serviceWorker.evaluate(() =>
    chrome.storage.local.get(null)
  );
  expect(stored["z:gone.example.com"]).toBeUndefined();
  expect(stored["x:gone.example.com"]).toBeUndefined();
  expect(stored["p:gone.example.com"]).toBeUndefined();
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
