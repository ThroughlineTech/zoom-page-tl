# 06 - Popup and options UI

## Popup (`extension/popup.html`, `extension/popup.js`)

The toolbar action's popup (`extension/manifest.json:23-25`). Loads `zoom.js` then `popup.js` (`extension/popup.html:325-326`). On open it queries the active tab, derives the hostname, reads `cfg:off`, the slider extents and the five per-site keys in one call, sanitizes the extents (falling back to 5-400% when invalid or `max <= min`), builds the tick strip and renders (`extension/popup.js:393-430`, `:387-391`).

| Control | Element | Behavior | Status |
| --- | --- | --- | --- |
| Master On/Off | `#power` (`popup.html:264-266`) | Sets or removes `cfg:off` (`popup.js:262-270`). | Functional (`tests/global.spec.js`) |
| Hostname | `#host` | Shows host or "(no site)". | Functional |
| Live slider | `#slider` range 0..1000 (`popup.html:273-280`) | Drag: log-mapped factor, soft snap to detents within a 0.01 well, `previewZoom` to the tab with no storage write (`popup.js:187-202`). Release: one commit (`:204-208`). Arrow keys: +/-1% and persist (`:212-220`). Ctrl/Shift+wheel: step the ladder (`:224-233`). | Functional (`tests/slider.spec.js`) |
| Tick strip | `#ticks` | Detents inside the extents; 50/100/150/200/400 labeled (`popup.js:13`, `:63-79`). | Functional |
| Stepper | `#out`, `#in` | `stepFrom` one step (`popup.js:173-178`). | Functional |
| Percent field | `#pct` text input | Shows %, "Off" or "Paused"; click to type; Enter commits, Escape reverts; invalid input restores (`popup.js:100-106`, `:236-257`). | Functional (manual for the typing UX) |
| Presets | `#presets` | 75, 90, 100, 110, 125, 150, 175, 200 (`popup.js:5`, `:165-171`). | Functional |
| Fit | `#fit` | Removes `af:`, sends `autofit`, reflects result; shows "Already fits the width" when `fits` (`popup.js:322-348`). | Functional (`tests/autofit.spec.js` via the same message) |
| Auto | `#auto` | Toggles `af:`; turning on also fits now (`popup.js:352-362`). | Functional |
| Reset | `#reset` | 100% (`popup.js:179-181`). | Functional |
| Re-center when zoomed | `#recenter` | Sets or removes `rc:` (`popup.js:366-379`). | Functional |
| Pause / Exclude | `#pause`, `#exclude` | Set or remove `p:` / `x:`; Exclude also clears `p:` (`popup.js:275-308`). | Functional |
| Options link | `#options` | `chrome.runtime.openOptionsPage()` (`popup.js:381-383`). | Functional |

Every manual level change goes through `setFactor` then `persist`, which clamps to the extents, removes `af:`, writes or removes `z:`, and sets the badge (`popup.js:141-162`).

**Enable/disable rules** (`popup.js:90-139`): when suppressed (global off, excluded or paused) the body gets `off` styling and every zoom control is disabled. In Auto, the manual controls (slider, stepper, presets, percent) are disabled but Fit/Auto/Reset stay live. Pause is disabled while excluded or globally off; Exclude while globally off. Re-center is enabled whenever the site is not suppressed.

## Options page (`extension/options.html`, `extension/options.js`)

Opens in a tab (`extension/manifest.json:19-22`). Loads `zoom.js` then `options.js` (`extension/options.html:202-203`). Re-renders on any local storage change, so it reflects popup and keyboard edits live (`extension/options.js:479-481`).

| Section | Behavior | Status |
| --- | --- | --- |
| Default zoom for new sites (`options.html:122-134`) | `#default` 5-500%; writes `cfg:defaultZoom` via `setDefault`; "Back to 100%" removes it (`options.js:419-429`). | Functional (`tests/options.spec.js:175`, `:523`) |
| Zoom slider range (`options.html:136-151`) | `#zoomMin`/`#zoomMax`; `setBounds` rejects invalid or `max <= min` and stores defaults as absence; reset button removes both (`options.js:57-86`, `:431-449`). | Functional (`tests/slider.spec.js:139`, `:163`) |
| Saved sites: Active and Excluded (`options.html:153-180`) | Union of every host with any `z:`, `x:`, `p:`, `af:` or `rc:` key, sorted (`options.js:162-190`), split by `excluded` (`:375-387`). Each row: host link to `https://<host>/`, level field (disabled while excluded, paused or Auto), Auto, Center, Pause/Resume, Exclude/Include, Remove (`options.js:283-373`). | Functional (`tests/options.spec.js:246-500`) |
| Backup (`options.html:182-192`) | Export downloads JSON; Import reads a file and merges, or replaces when "Replace existing" is checked (`options.js:397-409`, `:451-476`). Format in [03](03-storage-and-state.md). | Functional for the logic (`tests/options.spec.js:22-144`); the real file dialogs are manual. |
| Footer (`options.html:194-199`) | Links to throughlinetech.net and the GitHub repo. | Functional (`tests/options.spec.js:315`) |

`window.ZP` exposes the storage operations for tests: `getDefault`, `setDefault`, `getBounds`, `setBounds`, `setSite`, `setExcluded`, `setPaused`, `setAuto`, `setRecenter`, `removeSite`, `listSites`, `exportData`, `importData` (`extension/options.js:486-501`). It is a test seam, not a product API.

## Loose ends

- The popup does not read `cfg:defaultZoom` (`extension/popup.js:403-422`); see [03](03-storage-and-state.md) loose ends. Status: Broken (minor).
- The site manager has no search or filter; each list is a fixed-height scroll container. A filter was anticipated as the lists grow.
- Site links always use `https://` (`extension/options.js:292`), which is wrong for http-only hosts such as `localhost` dev servers.
- The options level field accepts 5-500% while the popup slider stops at the configured extents; a level outside the extents applies but the slider pins to the end (documented in the hint, `extension/options.html:138-142`).
