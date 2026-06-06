# Zoom Page TL: Engineering Handoff 2 (process + workflow)

This is the second handoff. The first, `HANDOFF.md`, is the design brief: the goal,
the root-cause analysis, the Chrome API behavior, the data model, and the backlog.
Read that for "why the code is shaped this way."

This file is the working manual: what was done in the build-out session, where the
repo lives, and the exact loop to follow when adding a feature or fixing a bug so that
every change ships with automated proof and a human review checklist.

No em dashes anywhere in this repo's docs or code, by author preference. ASCII only
(plain hyphens, straight quotes). Keep that style.

## 1. Where the repo is

- GitHub: https://github.com/ThroughlineTech/zoom-page-tl (public, org: ThroughlineTech)
- Default branch: `main`
- Clone: `git clone https://github.com/ThroughlineTech/zoom-page-tl.git`
- License: MIT. Do NOT paste GPL code from Zoom Page WE into `extension/`; reimplement
  from behavior (see HANDOFF.md section 12).

## 2. What was done in the build-out session

Starting point was the initial scaffold (extension code matching HANDOFF.md, no tests).
This session added verification and the next wave of features, then published the repo.

- Playwright test harness that loads the unpacked MV3 extension in Chromium's new
  headless mode and asserts real behavior. 15 tests, all green.
- Verified the core: CSS `zoom` actually reflows the page (measured via
  getBoundingClientRect, not a style read-back), browser zoom stays disabled (the
  observable proxy for "the native zoom bubble can never fire"), live updates, reset.
- Replaced `web-ext lint` (it validates against Firefox and false-flags Chrome's MV3
  service worker) with a Chrome-targeted static check, `scripts/check.js`, wired to
  `npm run lint`.
- AutoFit-to-width: popup "Fit width" button and a `zoom-autofit` command. Measures at
  scale 1, clamps to [0.25, 5.0], persists per host.
- Options page (`extension/options.html` / `options.js`): global default zoom for new
  sites, a manage-list of every saved site, and JSON import/export. Reachable from the
  popup footer.
- Renamed the project from "ZoomPage Lite" to "Zoom Page TL" and published.

Backlog status now lives in HANDOFF.md section 9 (items 1, 3, 4, 7 are DONE; eTLD+1,
storage.sync, and zero-flash hardening remain). Real-world bug candidates are triaged
in `docs/chrome-web-store-buglist.md`.

## 3. Repo orientation (what to read first)

- `HANDOFF.md` - design rationale, data model, API behavior, backlog. Read before
  changing core behavior.
- `extension/` - the loadable extension. `content.js` (document_start apply + AutoFit
  measure), `background.js` (bubble suppression, badge, commands), `popup.*`,
  `options.*`, `zoom.js` (shared step helpers).
- `tests/` - Playwright suite (see section 6).
- `scripts/check.js` - the lint check.
- `docs/chrome-web-store-buglist.md` - triaged bug/feature candidates from ZPWE
  feedback. Good source of bugfix work.

## 4. Commands cheat sheet

```
npm install                      # dev tooling (Playwright + web-ext)
npx playwright install chromium  # one time: download the browser the tests drive
npm run lint                     # Chrome static check (manifest, JS syntax, assets)
npm test                         # Playwright suite (loads the extension, asserts behavior)
npm start                        # web-ext run -t chromium with a clean profile (manual)
npm run build                    # web-ext build -> dist/ (zip for distribution)
```

Single test file: `npx playwright test tests/autofit.spec.js`
Headed (watch it run): `npx playwright test --headed`
Load unpacked manually: chrome://extensions > Developer mode > Load unpacked >
select `extension/`. Service worker logs: the "service worker" link on the extension
card. Content-script logs: the normal page devtools console.

## 5. The development loop (follow this for every change)

The author wants to be the final reviewer only: the agent implements, proves it with
automation, and hands back a focused checklist. The loop:

1. Scope. State the one feature or bug in a sentence. For a bug, find the failing
   behavior first and (ideally) write a failing test that reproduces it.
2. Implement. Read before writing. Match the surrounding style. Keep the per-host
   storage model and the "100% == absence of a key" convention (see the gotcha in
   section 8) unless deliberately changing it.
3. Add or extend Playwright coverage. Every change gets at least one test that would
   fail without it. Put it in the matching spec or a new `tests/<topic>.spec.js`.
4. Make it green. `npm run lint` and `npm test` must both pass. Do not hand back a
   change with a red or skipped test without calling it out explicitly.
5. Update docs. If behavior, data model, or the file map changed, update HANDOFF.md
   (and README.md if user-facing). If you closed a backlog item, mark it DONE.
6. Hand back a review checklist (section 7). Split into "Automated (already verified)"
   and "Manual (please verify)". Only put things in Manual that automation genuinely
   cannot reach.
7. Commit only when asked. Use `topic: short description` (or `TKT-ID: ...` if a
   ticket exists). No Claude branding in commit messages. Branch off `main`; do not
   push or merge without an explicit instruction.

## 6. How the test harness works (so you can extend it)

- `tests/fixtures.js` exports `test` and `expect` with three fixtures:
  - `context` - a persistent Chromium context launched with `channel: "chromium"`
    (new headless, which is what supports extensions + service workers) and the
    unpacked extension loaded via `--load-extension`.
  - `serviceWorker` - the extension's MV3 service worker. Run privileged code in it
    with `serviceWorker.evaluate(...)`: chrome.storage, chrome.tabs.getZoomSettings,
    and any top-level function defined in `background.js` (for example `stepFrom`).
  - `extensionId` - the extension id, for navigating to `chrome-extension://<id>/...`
    pages (popup.html, options.html).
- `tests/server.js` serves test pages on a real `localhost` hostname (content.js keys
  by `location.hostname`, so a real http origin is required; file:// and data: will not
  do). Every page has a 100x100 `#marker` box; its rendered width via
  getBoundingClientRect reflects CSS `zoom`, so a marker at zoom 1.5 measures ~150px.
  That is a true behavioral assertion. Add routes here when a test needs a specific
  layout (see the `/wide` route used by AutoFit).
- `playwright.config.js` runs serial, one worker (the extension shares one storage
  area and one service worker across tabs), and boots the server via `webServer`.
- Each test gets a fresh context. Clear storage in `beforeEach`:
  `await serviceWorker.evaluate(() => chrome.storage.local.clear())`.

Common patterns (copy from the existing specs):

```js
// set a per-site factor, then load and assert the reflow
await serviceWorker.evaluate(() => chrome.storage.local.set({ "z:localhost": 1.5 }));
await page.goto("/");
const w = await page.evaluate(() =>
  document.getElementById("marker").getBoundingClientRect().width);
expect(w).toBeGreaterThan(145); expect(w).toBeLessThan(155);

// no-bubble proxy: assert browser zoom is disabled for the tab
const settings = await serviceWorker.evaluate((id) =>
  chrome.tabs.getZoomSettings(id), tabId);
expect(settings.mode).toBe("disabled");

// drive the options page logic without a file dialog (window.ZP is exposed for tests)
await page.goto(`chrome-extension://${extensionId}/options.html`);
await page.waitForFunction(() => !!window.ZP);
const dump = await page.evaluate(() => window.ZP.exportData());
```

What the harness CANNOT test (these are always Manual checklist items):

- The native zoom bubble itself. It is browser chrome, not in the page DOM. The suite
  asserts browser-zoom-disabled as the proxy; a human must confirm no bubble appears.
- Global keyboard shortcuts. chrome.commands.onCommand cannot be dispatched from
  Playwright. Test the underlying effect by driving the same code path (for AutoFit,
  the content-script "autofit" message), and put the actual hotkey on the checklist.
- Real file download/upload dialogs. Test the pure import/export logic via `window.ZP`;
  put the real Export/Import buttons on the checklist.
- First-paint flash, true cross-origin iframes, and visual correctness on real sites.

## 7. The review checklist (what to hand back after each change)

After each feature or bugfix, produce a checklist in this shape. Keep it specific to
the change, not a generic regression sweep. The point is to tell the author exactly
what to click and what they should see.

```
## Review checklist: <feature or bug>

Automated (already verified by `npm test` + `npm run lint`):
- [x] <assertion 1, e.g. AutoFit shrinks a 3000px page to ~0.33 and persists it>
- [x] <assertion 2>
- [x] Full suite still green (N/N), lint green

Manual (please verify - automation cannot reach these):
- [ ] Load unpacked from extension/, confirm no service-worker console errors
- [ ] <the one new user-facing behavior, with exact steps and expected result>
- [ ] <anything touching the zoom bubble, hotkeys, or file dialogs>
- [ ] Regression: <the closest existing behavior this change could have broken>
```

Worked example (the AutoFit change from this session):

```
## Review checklist: AutoFit-to-width

Automated (verified):
- [x] AutoFit on a 3000px-wide page in a 1000px viewport -> factor ~0.33, persisted
- [x] AutoFit on a page that already fits -> stays 100%, no key written
- [x] AutoFit on an extremely wide page clamps to the 0.25 floor
- [x] 15/15 tests green, lint green

Manual (please verify):
- [ ] Click "Fit width" in the popup on a real wide site; page width fits the window
- [ ] Bind zoom-autofit at chrome://extensions/shortcuts and confirm the hotkey works
- [ ] Badge updates to the new percent; no native zoom bubble appears
- [ ] Reset to 100% still works afterward
```

## 8. Conventions and gotchas

- Data model: `chrome.storage.local`, one key per site, `z:<hostname>` = factor (1.5 =
  150%). 100% is stored as the ABSENCE of a key. `cfg:defaultZoom` is the global
  default. content.js resolves: `z:<host>` if present, else `cfg:defaultZoom`, else 1.0.
- Default-zoom gotcha: because 100% means "no key," a site with no key follows the
  global default. So when the default is not 100%, an "un-customized" site is NOT 100%;
  it is the default. To pin a site to a specific level (including 100% when the default
  differs), set it explicitly in the options site manager. If you change this model,
  update HANDOFF.md section 7 and the options-page hint text, and add tests.
- Keying is by `location.hostname` (subdomains are independent; http and https share a
  key). The eTLD+1 option is still open (HANDOFF.md backlog item 2).
- Never call `chrome.tabs.setZoom`. The whole no-bubble guarantee depends on browser
  zoom staying disabled and the extension using only CSS `zoom`.
- The service worker is ephemeral (MV3). Do not hold long-lived in-memory state;
  re-read from storage on each event.
- Keyboard shortcut slots: Chrome allows 4 commands with a default `suggested_key`.
  Three are used (zoom in/out/reset). `zoom-autofit` is intentionally defined with no
  default key so it does not consume the last slot; users bind it manually.
- Lint is `scripts/check.js`, not `web-ext lint`. If you add a manifest-referenced file
  or an icon size, the check verifies it exists; keep it passing.

## 9. Where to find work

- HANDOFF.md section 9 - the prioritized backlog (eTLD+1, storage.sync, zero-flash).
- docs/chrome-web-store-buglist.md - triaged real-world reports against ZPWE. Highest
  signal: a per-site exclusion/disable list (most-requested, and the workaround for
  sites that misbehave under zoom), CSS-zoom cursor-offset on map/overlay UIs, and a
  durable persistence regression test (incognito + restart + new tab).
