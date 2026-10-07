// Configurable keyboard shortcuts (cfg:keys) and the "the default is the absence
// of a key" level model they rely on.
//
// The content script's keydown listener matches chords from zoom.js; we press real
// keys with page.keyboard and assert storage and the rendered page. The chord
// rules (duplicates, Chrome-reserved keys, this extension's own Chrome commands)
// are pure functions in zoom.js, driven from the options page where it is loaded.
// The options recording UI and the popup's displayed level are driven through
// their real DOM.

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

function getKey(sw, k) {
  return sw.evaluate((key) => chrome.storage.local.get(key).then((r) => r[key]), k);
}

async function setKeys(sw, map) {
  await sw.evaluate((m) => chrome.storage.local.set({ "cfg:keys": m }), map);
}

// Load the page and wait until its content script has read the shortcut map.
async function gotoWithKeys(page, url) {
  await page.goto(url);
  await page.locator("body").click();
  await page.waitForTimeout(150);
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("chord rules: modifiers, duplicates, Chrome-reserved and Chrome-used keys", async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  const r = await page.evaluate(() => {
    const map = normalizeShortcuts(null);
    const cmds = new Map([[chordKey("Alt+Shift+ArrowUp"), "Zoom in (this site)"]]);
    const check = (c, id = "toggle") => checkChord(c, id, map, cmds);
    return {
      defaults: [map.zoomIn.chord, map.zoomOut.chord, map.reset.chord, map.toggle.chord],
      bare: check("KeyZ"),
      shiftOnly: check("Shift+KeyZ"),
      fkey: check("F9"),
      dupe: check("Ctrl+Equal"),
      dupeTwin: check("Ctrl+Numpad0"),
      sameRow: check("Ctrl+Equal", "zoomIn"),
      reserved: check("Ctrl+KeyT"),
      command: check("Alt+Shift+ArrowUp"),
      chromeUsed: check("Ctrl+KeyF"),
      altgr: check("Ctrl+Alt+BracketLeft"),
      clean: check("Alt+Shift+KeyK"),
      fromChrome: chordFromChromeShortcut("Alt+Shift+Up"),
      fromChrome0: chordFromChromeShortcut("Ctrl+Shift+0"),
      fromChromeArrow: chordFromChromeShortcut("Alt+Shift+Down Arrow"),
      label: chordLabel("Ctrl+Alt+BracketLeft"),
      parsedBad: parseChord("Alt+Ctrl+KeyA"),
    };
  });
  expect(r.defaults).toEqual(["Ctrl+Equal", "Ctrl+Minus", "Ctrl+Digit0", null]);
  expect(r.bare.error).toBeTruthy();
  expect(r.shiftOnly.error).toBeTruthy();
  expect(r.fkey).toEqual({});
  expect(r.dupe.error).toContain("Zoom in");
  expect(r.dupeTwin.error).toContain("Reset");
  expect(r.sameRow.error).toBeUndefined(); // re-binding a row to its own chord is fine
  expect(r.reserved.error).toContain("New tab");
  expect(r.command.error).toContain("Zoom in (this site)");
  expect(r.chromeUsed.error).toBeUndefined();
  expect(r.chromeUsed.warning).toContain("Find");
  expect(r.altgr.error).toBeUndefined();
  expect(r.altgr.warning).toContain("AltGr");
  expect(r.clean).toEqual({});
  expect(r.fromChrome).toBe("Alt+Shift+ArrowUp");
  expect(r.fromChrome0).toBe("Ctrl+Shift+Digit0");
  expect(r.fromChromeArrow).toBe("Alt+Shift+ArrowDown");
  expect(r.label).toBe("Ctrl+Alt+[");
  expect(r.parsedBad).toBeNull(); // modifiers must be in canonical order
});

test("setShortcut refuses this extension's own Chrome command keys", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  // Alt+Shift+Up is the manifest's default for the zoom-in command.
  const res = await page.evaluate(() => window.ZP.setShortcut("toggle", "Alt+Shift+ArrowUp"));
  expect(res.ok).toBe(false);
  expect(res.error).toContain("chrome://extensions/shortcuts");
  expect(await getKey(serviceWorker, "cfg:keys")).toBeUndefined();

  const ok = await page.evaluate(() => window.ZP.setShortcut("toggle", "Ctrl+Alt+KeyZ"));
  expect(ok.ok).toBe(true);
  const stored = await getKey(serviceWorker, "cfg:keys");
  expect(stored.toggle).toEqual({ on: true, chord: "Ctrl+Alt+KeyZ" });
  expect(stored.zoomIn).toEqual({ on: true, chord: "Ctrl+Equal" });
});

test("on/off shortcut turns the extension off everywhere and back on", async ({
  page,
  serviceWorker,
}) => {
  await setKeys(serviceWorker, { toggle: { on: true, chord: "Ctrl+Alt+KeyZ" } });
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "z:localhost": 1.5 }));
  await gotoWithKeys(page, "/");
  expect(Math.round(await markerWidth(page))).toBe(150);

  await page.keyboard.press("Control+Alt+KeyZ");
  await expect.poll(() => getKey(serviceWorker, "cfg:off")).toBe(true);
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(100);

  // It must still work while off (every other shortcut is inert then).
  await page.keyboard.press("Control+Alt+KeyZ");
  await expect.poll(() => getKey(serviceWorker, "cfg:off")).toBeUndefined();
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(150);
});

test("a shortcut switched off does nothing", async ({ page, serviceWorker }) => {
  await setKeys(serviceWorker, { zoomIn: { on: false, chord: "Ctrl+Equal" } });
  await gotoWithKeys(page, "/");
  await page.keyboard.press("Control+Equal");
  await page.waitForTimeout(300);
  expect(await getKey(serviceWorker, "z:localhost")).toBeUndefined();
  expect(Math.round(await markerWidth(page))).toBe(100);
});

test("a rebound zoom-in uses the new chord and frees the old one", async ({
  page,
  serviceWorker,
}) => {
  await setKeys(serviceWorker, { zoomIn: { on: true, chord: "Ctrl+Alt+BracketRight" } });
  await gotoWithKeys(page, "/");

  await page.keyboard.press("Control+Equal");
  await page.waitForTimeout(300);
  expect(await getKey(serviceWorker, "z:localhost")).toBeUndefined();

  await page.keyboard.press("Control+Alt+BracketRight");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeCloseTo(1.1, 5);
});

test("Ctrl++ (with Shift) and the numpad keys still match the defaults", async ({
  page,
  serviceWorker,
}) => {
  await gotoWithKeys(page, "/");
  await page.keyboard.press("Control+Shift+Equal");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeCloseTo(1.1, 5);
  await page.keyboard.press("Control+NumpadAdd");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeCloseTo(1.25, 5);
  await page.keyboard.press("Control+Numpad0");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeUndefined();
});

test("fit shortcut measures once and leaves Auto", async ({ page, serviceWorker }) => {
  await setKeys(serviceWorker, { fit: { on: true, chord: "F9" } });
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "af:localhost": true }));
  await gotoWithKeys(page, "/wide");
  await serviceWorker.evaluate(() => chrome.storage.local.remove("z:localhost"));

  await page.keyboard.press("F9");
  await expect.poll(() => getKey(serviceWorker, "af:localhost")).toBeUndefined();
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeLessThan(0.6);
});

test("auto shortcut toggles Auto-fit for the site", async ({ page, serviceWorker }) => {
  await setKeys(serviceWorker, { auto: { on: true, chord: "Ctrl+Alt+KeyA" } });
  await gotoWithKeys(page, "/wide");

  await page.keyboard.press("Control+Alt+KeyA");
  await expect.poll(() => getKey(serviceWorker, "af:localhost")).toBe(true);
  // Turning Auto on fits right away.
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeLessThan(0.6);

  await page.keyboard.press("Control+Alt+KeyA");
  await expect.poll(() => getKey(serviceWorker, "af:localhost")).toBeUndefined();
});

test("default shortcut returns the site to the global default", async ({
  page,
  serviceWorker,
}) => {
  await setKeys(serviceWorker, { default: { on: true, chord: "Ctrl+Alt+KeyD" } });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:defaultZoom": 1.25, "z:localhost": 2 })
  );
  await gotoWithKeys(page, "/");
  expect(Math.round(await markerWidth(page))).toBe(200);

  await page.keyboard.press("Control+Alt+KeyD");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeUndefined();
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(125);
});

test("reset pins 100% when the global default is not 100%", async ({
  page,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "cfg:defaultZoom": 1.25, "z:localhost": 2 })
  );
  await gotoWithKeys(page, "/");

  await page.keyboard.press("Control+Digit0");
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBe(1);
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(100);

  // Stepping onto the default level stores nothing: the site follows the default.
  await page.keyboard.press("Control+Equal"); // 1.0 -> 1.1
  await page.keyboard.press("Control+Equal"); // 1.1 -> 1.25 == default
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBeUndefined();
  await expect.poll(async () => Math.round(await markerWidth(page))).toBe(125);
});

test("on an excluded site only the on/off shortcut acts", async ({
  page,
  serviceWorker,
}) => {
  await setKeys(serviceWorker, { toggle: { on: true, chord: "Ctrl+Alt+KeyZ" } });
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "x:localhost": true }));
  await gotoWithKeys(page, "/");

  await page.keyboard.press("Control+Equal");
  await page.waitForTimeout(300);
  expect(await getKey(serviceWorker, "z:localhost")).toBeUndefined();

  await page.keyboard.press("Control+Alt+KeyZ");
  await expect.poll(() => getKey(serviceWorker, "cfg:off")).toBe(true);
});

test("options UI records a chord, refuses duplicates and reserved keys, and clears", async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await openOptions(page, extensionId);
  const row = (id) => page.locator(`#keys tr[data-action="${id}"]`);

  // Record Ctrl+Alt+K for the on/off toggle.
  await row("toggle").locator("button.chord").click();
  await expect(row("toggle").locator("button.chord")).toHaveText("Press keys...");
  await page.keyboard.press("Control+Alt+KeyK");
  await expect.poll(async () => (await getKey(serviceWorker, "cfg:keys")).toggle).toEqual({
    on: true,
    chord: "Ctrl+Alt+KeyK",
  });
  await expect(row("toggle").locator("button.chord")).toHaveText("Ctrl+Alt+K");
  await expect(row("toggle").locator("input.keyOn")).toBeChecked();

  // The same chord for Fit is refused, with the reason shown on the row.
  await row("fit").locator("button.chord").click();
  await page.keyboard.press("Control+Alt+KeyK");
  await expect(row("fit").locator(".knote")).toContainText("Turn on/off everywhere");
  expect((await getKey(serviceWorker, "cfg:keys")).fit).toEqual({ on: false, chord: null });

  // A key Chrome keeps for itself is refused.
  await row("fit").locator("button.chord").click();
  await page.keyboard.press("Control+KeyT");
  await expect(row("fit").locator(".knote")).toContainText("Chrome keeps");
  expect((await getKey(serviceWorker, "cfg:keys")).fit.chord).toBeNull();

  // Switch the toggle off with its checkbox, then clear it with Backspace.
  await row("toggle").locator("input.keyOn").uncheck();
  await expect
    .poll(async () => (await getKey(serviceWorker, "cfg:keys")).toggle.on)
    .toBe(false);
  await row("toggle").locator("button.chord").click();
  await page.keyboard.press("Backspace");
  await expect(row("toggle").locator("button.chord")).toHaveText("Not set");

  // Reset all returns to the defaults (stored as no key).
  await page.locator("#keysReset").click();
  await expect.poll(() => getKey(serviceWorker, "cfg:keys")).toBeUndefined();
});

test("shortcuts are carried in the JSON backup", async ({ page, extensionId, serviceWorker }) => {
  await openOptions(page, extensionId);
  await page.evaluate(() => window.ZP.setShortcut("toggle", "Ctrl+Alt+KeyZ"));
  const dump = await page.evaluate(() => window.ZP.exportData());
  expect(dump.shortcuts.toggle).toEqual({ on: true, chord: "Ctrl+Alt+KeyZ" });

  await serviceWorker.evaluate(() => chrome.storage.local.clear());
  await page.evaluate((d) => window.ZP.importData(d, { replace: true }), dump);
  expect((await getKey(serviceWorker, "cfg:keys")).toggle.chord).toBe("Ctrl+Alt+KeyZ");
});

test("popup shows the global default for an un-customized site", async ({
  context,
  page,
  extensionId,
  serviceWorker,
}) => {
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "cfg:defaultZoom": 1.25 }));
  await page.goto("/");

  // Open the popup in a tab, then make the site's tab the active one and reload
  // the popup so its "active tab in this window" query lands on the site.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => (x.url || "").includes("localhost"));
    await chrome.tabs.update(t.id, { active: true });
  });
  await popup.reload();

  await expect(popup.locator("#host")).toHaveText("localhost");
  await expect(popup.locator("#pct")).toHaveValue("125%");

  // Stepping up goes from the default (125%) to 150%, not from 100% to 110%.
  await popup.locator("#in").click();
  await expect.poll(() => getKey(serviceWorker, "z:localhost")).toBe(1.5);
});
