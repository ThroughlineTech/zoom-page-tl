# 09 - Testing and verification

## Results for this refresh (2026-10-07, keyboard shortcuts change)

Run on Windows 11, Node v24.11.1, with no dev browser running:

- `npm run lint`: `OK: extension static check passed (7 JS files, 12 icons, manifest v3).`
- `npx playwright test`: **78 passed** (3.3 minutes; 64 existing + 14 in `tests/shortcuts.spec.js`). No failures, skips or flakes.

The first run of the day, before the change (HEAD `8ec5470`), passed 64/64.

## Harness design

- **Fixtures** (`tests/fixtures.js`): `context` is a fresh persistent Chromium context per test, launched with `channel: "chromium"` (full build, new headless mode, supports MV3 service workers) and the unpacked `extension/` (`:13-26`). `serviceWorker` exposes the worker for privileged calls via `evaluate` (`:30-34`). `extensionId` is parsed from the worker URL for `chrome-extension://` pages (`:36-39`).
- **Server** (`tests/server.js`): an in-memory HTTP server on `localhost:3210`, because the content script keys by hostname and needs a real origin (`:1-3`). Every page carries a 100x100 `#marker` whose `getBoundingClientRect` width measures the applied zoom (`:9-25`). Routes: `/` core, `/wide` 3000px block, `/narrow` 600px centered column, `/drift` `min-width:100vw` wrapper, `/messy` column plus negative-margin breakout (`:27-65`). Unknown paths serve `/`.
- **Config** (`playwright.config.js`): serial, one worker, because all tabs share one storage area and one worker (`:5-11`); boots the server via `webServer` and reuses an existing one (`:16-23`).
- Specs clear storage in `beforeEach` via the worker.

## Coverage by spec

| Spec | Tests | Covers |
| --- | --- | --- |
| `tests/core.spec.js` | 7 | First-paint apply, fresh site at 100%, browser zoom `disabled` (no-bubble proxy), live update, reset removes key, re-assert after clobber, `stepFrom` ladder. |
| `tests/keyboard.spec.js` | 4 | Ctrl+=, Ctrl+-, Ctrl+0, badge update. |
| `tests/autofit.spec.js` | 6 | Shrink, already fits, fill column, ignore breakout, clamp to 0.05, fixed level does not re-fit. |
| `tests/auto.spec.js` | 3 | Auto re-fits after load, turning Auto on fits live, manual key zoom leaves Auto. |
| `tests/exclude.spec.js` | 8 | Exclude ignores level and default, live toggle, keys inert and un-prevented, mode `automatic`, live mode flip, "off" badge. |
| `tests/pause.spec.js` | 4 | Pause ignores level, live toggle, mode `automatic`, "off" badge. |
| `tests/global.spec.js` | 4 | Master switch un-zooms, live toggle restores, hands zoom back and shows "off", independence from per-site exclude. |
| `tests/recenter.spec.js` | 4 | Re-center pulls column to center, off clears, inert at 100%, inert while excluded. |
| `tests/slider.spec.js` | 7 | Log map round trip, snap well, `previewZoom` without storage write, preview ignored when suppressed, 5% end to end, extents default/round-trip, extents validation. |
| `tests/shortcuts.spec.js` | 14 | Chord rules (modifiers, duplicates and numpad twins, Chrome-reserved, Chrome-used warnings, this extension's commands via the real `chrome.commands.getAll()`), on/off shortcut including while off, switched-off and rebound shortcuts, Ctrl++ and numpad aliases, Fit, Auto, Back to default, Reset pinning 100% under a 125% default, suppression, options recording UI, backup round trip, popup showing the default for an un-customized site. |
| `tests/options.spec.js` | 17 | Export/import round trip, excluded export, replace semantics, merge vs replace, import clamping, default zoom resolution, default-aware commands and badge, `listSites`, Auto toggle UI, footer links, site links, level edit/remove UI, exclude/include/pause/resume UI, `removeSite`, default field. |

## What automation cannot reach (always manual)

- The native zoom bubble itself (browser chrome, not DOM). The suite asserts `getZoomSettings().mode === "disabled"` as the proxy.
- `chrome.commands` hotkey dispatch (Alt+Shift+Up/Down/0, and user-bound Fit / toggle-global).
- Real file download and upload dialogs (logic is tested through `window.ZP`).
- First-paint flash, cross-origin iframes, and visual correctness on real sites (use the dev browser and `npm run shot`).
- The greyed toolbar icon's appearance.

## Manual regression checklist (whole product)

1. Load unpacked; no service-worker console errors.
2. Set a real site to 150% in the popup; page reflows, no native bubble; reload applies before paint.
3. A second site stays independent; the badge tracks the active tab.
4. Alt+Shift+Up/Down/0 and Ctrl +/-/0 (including numpad) step and reset with no bubble.
5. Options > Keyboard shortcuts: record Ctrl+Alt+[ for on/off, then use it on a real page to turn the extension off and on again. Try Ctrl+T (refused) and Ctrl+F (warned). Confirm the popup's power-switch tooltip shows the chord.
6. `chrome://settings`: nothing harmful, no worker errors.
7. Fit on a too-wide page shrinks; on a letterboxed site (e.g. washingtonpost.com) enlarges; on a fluid site shows "Already fits the width".
8. Pause and Exclude: page drops to 100%, badge "off", native Ctrl +/- and its bubble return; clearing restores the level.
9. Master switch off: every tab at 100%, icon greyed; back on restores each site.
10. Options: default zoom applies to un-customized sites; Export then Import (merge and replace) restores levels.
11. Re-center on a drifting site (washingtonpost.com at 150%+): column returns to center and stays put while scrolling.

## Loose ends

- No incognito, browser-restart or multi-window tests.
- No test for replace-import leaving `af:`/`rc:`/`p:` orphans.
- No CI; the suite runs only when someone runs it locally.
