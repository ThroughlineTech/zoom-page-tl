# 06 - Popup and options UI

## Popup (`extension/popup.html`, `extension/popup.js`)

The toolbar action's popup (`extension/manifest.json:23-25`). Loads `zoom.js` then `popup.js` (`extension/popup.html:325-326`). On open it queries the active tab, derives the hostname, reads `cfg:off`, the slider extents, `cfg:defaultZoom`, `cfg:keys` and the five per-site keys in one call, resolves the level the same way the content script does (own key, else the default, else 100%), sanitizes the extents (falling back to 5-400% when invalid or `max <= min`), adds each enabled shortcut to its control's tooltip (`showShortcutHints`, `popup.js:390-408`), builds the tick strip and renders (`extension/popup.js:416-459`, `:410-414`).

| Control | Element | Behavior | Status |
| --- | --- | --- | --- |
| Master On/Off | `#power` (`popup.html:264-266`) | Sets or removes `cfg:off` (`popup.js:265-273`). | Functional (`tests/global.spec.js`) |
| Hostname | `#host` | Shows host or "(no site)". | Functional |
| Live slider | `#slider` range 0..1000 (`popup.html:273-280`) | Drag: log-mapped factor, soft snap to detents within a 0.01 well, `previewZoom` to the tab with no storage write (`popup.js:190-205`). Release: one commit (`:207-211`). Arrow keys: +/-1% and persist (`:215-223`). Ctrl/Shift+wheel: step the ladder (`:227-236`). | Functional (`tests/slider.spec.js`) |
| Tick strip | `#ticks` | Detents inside the extents; 50/100/150/200/400 labeled (`popup.js:13`, `:64-80`). | Functional |
| Stepper | `#out`, `#in` | `stepFrom` one step (`popup.js:176-181`). | Functional |
| Percent field | `#pct` text input | Shows %, "Off" or "Paused"; click to type; Enter commits, Escape reverts; invalid input restores (`popup.js:101-107`, `:239-260`). | Functional (manual for the typing UX) |
| Presets | `#presets` | 75, 90, 100, 110, 125, 150, 175, 200 (`popup.js:5`, `:168-174`). | Functional |
| Fit | `#fit` | Removes `af:`, sends `autofit`, reflects result; shows "Already fits the width" when `fits` (`popup.js:325-351`). | Functional (`tests/autofit.spec.js` via the same message) |
| Auto | `#auto` | Toggles `af:`; turning on also fits now (`popup.js:355-365`). | Functional |
| Reset | `#reset` | 100%, pinned for the site when the default differs (`popup.js:182-184`). | Functional |
| Re-center when zoomed | `#recenter` | Sets or removes `rc:` (`popup.js:369-382`). | Functional |
| Pause / Exclude | `#pause`, `#exclude` | Set or remove `p:` / `x:`; Exclude also clears `p:` (`popup.js:278-311`). | Functional |
| Options link | `#options` | `chrome.runtime.openOptionsPage()` (`popup.js:384-386`). | Functional |

Every manual level change goes through `setFactor` then `persist`, which clamps to the extents, removes `af:`, removes `z:` when the level equals the default or writes it otherwise, and sets the badge (`popup.js:142-165`).

**Enable/disable rules** (`popup.js:91-140`): when suppressed (global off, excluded or paused) the body gets `off` styling and every zoom control is disabled. In Auto, the manual controls (slider, stepper, presets, percent) are disabled but Fit/Auto/Reset stay live. Pause is disabled while excluded or globally off; Exclude while globally off. Re-center is enabled whenever the site is not suppressed.

## Options page (`extension/options.html`, `extension/options.js`)

Opens in a tab (`extension/manifest.json:19-22`). Loads `zoom.js` then `options.js` (`extension/options.html:255-256`). Re-renders on any local storage change, so it reflects popup and keyboard edits live (`extension/options.js:716-718`).

| Section | Behavior | Status |
| --- | --- | --- |
| Default zoom for new sites (`options.html:144-157`) | `#default` 5-500%; writes `cfg:defaultZoom` via `setDefault`; "Back to 100%" removes it (`options.js:644-654`). | Functional (`tests/options.spec.js:175`, `:523`) |
| Zoom slider range (`options.html:159-174`) | `#zoomMin`/`#zoomMax`; `setBounds` rejects invalid or `max <= min` and stores defaults as absence; reset button removes both (`options.js:60-89`, `:656-674`). | Functional (`tests/slider.spec.js:139`, `:163`) |
| Keyboard shortcuts (`options.html:176-202`) | One row per action: an On checkbox, the chord button and a Default button. Clicking the chord records the next key press (Esc cancels, Backspace clears; bare modifiers are ignored) (`options.js:562-611`). `setShortcut` refuses a chord without Ctrl/Alt/Cmd (unless a function key), one already used by another action (numpad twins count as the same), one Chrome reserves (new/close tab or window, tab switching, quit), and one matching this extension's own Chrome command shortcuts from `chrome.commands.getAll()`. Chords Chrome uses but lets pages override (Ctrl+F, Ctrl+P, ...) and Ctrl+Alt chords (AltGr clash) are saved with a warning shown on the row (`checkChord`, `zoom.js:333-370`; `options.js:196-209`). Rows re-check stored chords against the current Chrome commands on every render. "Reset all shortcuts" removes `cfg:keys`. A link opens `chrome://extensions/shortcuts`, and the commands' current keys are listed. | Functional (`tests/shortcuts.spec.js`) |
| Saved sites: Active and Excluded (`options.html:206-233`) | Union of every host with any `z:`, `x:`, `p:`, `af:` or `rc:` key, sorted (`options.js:225-253`), split by `excluded` (`:455-467`). Each row: host link to `https://<host>/`, level field (disabled while excluded, paused or Auto), Auto, Center, Pause/Resume, Exclude/Include, Remove (`options.js:363-453`). | Functional (`tests/options.spec.js:246-500`) |
| Backup (`options.html:235-245`) | Export downloads JSON; Import reads a file and merges, or replaces when "Replace existing" is checked (`options.js:622-634`, `:676-701`). Format in [03](03-storage-and-state.md). | Functional for the logic (`tests/options.spec.js:22-144`); the real file dialogs are manual. |
| Footer (`options.html:247-252`) | Links to throughlinetech.net and the GitHub repo. | Functional (`tests/options.spec.js:315`) |

`window.ZP` exposes the storage operations for tests: `getDefault`, `setDefault`, `getBounds`, `setBounds`, `setSite`, `setExcluded`, `setPaused`, `setAuto`, `setRecenter`, `removeSite`, `listSites`, `exportData`, `importData`, `getShortcuts`, `setShortcut`, `setShortcutEnabled`, `resetShortcuts` (`extension/options.js:723-742`). It is a test seam, not a product API.

## Loose ends

- Other extensions' shortcuts cannot be read by an extension, so a page shortcut that another extension also binds is not detected; Chrome gives the key to that extension's command first. The options page says so.
- The Chrome-reserved and Chrome-used lists in `zoom.js` are hand-maintained from Chrome's documented shortcuts and can drift from future Chrome releases.

- The site manager has no search or filter; each list is a fixed-height scroll container. A filter was anticipated as the lists grow.
- Site links always use `https://` (`extension/options.js:372`), which is wrong for http-only hosts such as `localhost` dev servers.
- The options level field accepts 5-500% while the popup slider stops at the configured extents; a level outside the extents applies but the slider pins to the end (documented in the hint, `extension/options.html:161-165`).
