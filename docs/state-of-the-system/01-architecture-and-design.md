# 01 - Architecture and design

## Goal and scope

Zoom Page TL is a Manifest V3 Chrome extension (`extension/manifest.json:2`) that applies a remembered zoom level per hostname and never shows Chrome's native zoom indicator. It is an independent MIT reimplementation, in spirit, of "Zoom Page WE" (GPLv2, unmaintained), scoped to per-site full-page zoom. Text-only zoom, per-tab zoom, subsite (path) trees and image zoom are explicit non-goals; [roadmap.md](../roadmap.md) section 4 records why each was declined.

## Root cause the design answers

The original extension had three problems: a native zoom bubble that kept appearing (including a spurious 100% bubble in its CSS mode), a CSS-vs-browser zoom choice that was global rather than per site, and a visible 100%-then-jump on load.

1. **The bubble.** Chrome shows the omnibox zoom indicator whenever a tab's zoom factor changes through `chrome.tabs.setZoom` in the default `automatic` mode, and no API suppresses it. The spurious 100% bubble came from the original resetting browser zoom to 100% so it could layer CSS zoom on top; that reset is itself a zoom change. Conclusion: any `setZoom` call shows the bubble, so this extension never calls it (no occurrence in `extension/`).
2. **The global toggle.** Removed by making CSS the only mechanism; there is no choice left to be global.
3. **The slowness.** Caused by round-tripping through the ephemeral MV3 service worker and by applying zoom after load. This extension applies the stored factor from the content script at `document_start` with no worker round-trip (`extension/manifest.json:15`, `extension/content.js:100-102`).

[chrome-zoom-api-reference.md](../chrome-zoom-api-reference.md) holds the researched API behavior behind these conclusions.

## The two mechanisms

**CSS zoom on `<html>`** - Functional. `apply()` sets `document.documentElement.style.zoom` to the factor, or clears it for 1.0 (`extension/content.js:52-58`). In Chromium, `zoom` is a layout zoom: content reflows, fixed/sticky positioning and responsive breakpoints behave as under browser zoom. `transform: scale` was rejected because it does not reflow and breaks fixed positioning. Verified by `tests/core.spec.js:29` (marker box measures ~150px at 1.5).

**Browser zoom pinned to `disabled`** - Functional. `applyZoomMode` calls `chrome.tabs.setZoomSettings(tabId, { mode: "disabled" })`, or `"automatic"` for suppressed sites (`extension/background.js:105-115`). `disabled` reverts the tab to 100% and makes Chrome ignore zoom changes, so the bubble cannot fire. Zoom settings reset on navigation, so the worker reapplies on `tabs.onUpdated` with `status === "loading"` and on `tabs.onActivated` (`extension/background.js:132-150`), and on storage changes (`:156-165`). Verified as a proxy by `tests/core.spec.js:56` (the bubble itself is browser chrome and cannot be asserted).

A side effect is that native `Ctrl +/-/0` become inert, which is what lets the content script use those keys as its default zoom shortcuts (`extension/content.js:393-470`; [04](04-content-script.md)).

## Component roles

| Component | Runs | Role |
| --- | --- | --- |
| `extension/zoom.js` | First content script; plain script in popup and options | Zoom ladder, slider math, clamp constants ([04](04-content-script.md), [06](06-popup-and-options.md)). |
| `extension/content.js` | Every top-frame page at `document_start` (`manifest.json:11-18`) | Sole owner of the page's zoom: apply, live updates, keyboard shortcuts, AutoFit, re-center, re-assert ([04](04-content-script.md)). |
| `extension/background.js` | MV3 service worker (`manifest.json:8-10`) | Zoom mode, badge, toolbar icon, keyboard commands ([05](05-service-worker.md)). |
| `extension/popup.*` | Toolbar action popup (`manifest.json:23-32`) | Per-site controls and master switch ([06](06-popup-and-options.md)). |
| `extension/options.*` | Options page in a tab (`manifest.json:19-22`) | Global default, slider range, site manager, backup ([06](06-popup-and-options.md)). |

`chrome.storage.local` is the only channel of shared state; every component reacts to `storage.onChanged` rather than messaging each other, except for the two runtime messages in [07](07-public-surfaces-and-contracts.md).

## Page lifecycle (orchestration)

There is no multi-step workflow beyond the per-page sequence:

1. **Navigation starts.** The worker sees `status: "loading"` and sets the tab's zoom mode (`extension/background.js:132-135`).
2. **`document_start`.** `zoom.js` then `content.js` run (`extension/manifest.json:14-15`). `refresh()` reads the site's keys and applies the resolved factor (`extension/content.js:69-102`). The read is asynchronous; in the common case it resolves before first paint.
3. **Parsing and re-renders.** A `MutationObserver` on `<html>`'s `style` attribute and a `childList` observer on `document` re-assert the desired factor if the page clobbers it or replaces `<html>` (`extension/content.js:478-508`).
4. **`load`.** `refresh()` again, schedule an Auto re-fit if `af:<host>` is set, and a delayed re-center pass (`extension/content.js:539-545`).
5. **Complete.** The worker refreshes the badge on `status: "complete"` or a URL change (`extension/background.js:136-138`).
6. **Live edits.** Any storage write from the popup, options page, keyboard or commands propagates through `storage.onChanged` in the content script (`extension/content.js:107-128`) and the worker (`extension/background.js:156-165`).

SPA client-side navigations do not re-run the content script; the zoom stays on the persistent `<html>`.

## Rejected and reverted approaches

- **`chrome.tabs.setZoom` / browser-zoom mode.** Always shows the bubble. Declined permanently ([roadmap.md](../roadmap.md) section 4).
- **`transform: scale`.** No reflow; needs width hacks; breaks fixed positioning.
- **Service-worker pre-paint injection** (for zero-flash). Tried and reverted. An injected `:root{zoom:N}` stylesheet outlived a later reset to 100% (the inline zoom is cleared at 100%, so the stale rule re-emerged and the page stuck at the old level); removing it raced the page lifecycle; an `executeScript` inline variant fought the content script and re-applied stale values. Two async actors driving the same zoom plus the "100% means cleared" convention produced races. The surviving guidance: if revisited, make it a content-script-owned stylesheet or represent 100% explicitly. The re-assert observers solved the observed case (cnn.com dropping the inline zoom on re-render).
- **Re-measuring fixed levels on every load.** An earlier "Fit width is a mode" re-fit every page and was removed for bouncing; it returned only as the explicit per-site Auto opt-in (`af:`) ([04](04-content-script.md)).
- **Inline style or marker-attribute re-center.** Wiped by SPA re-renders, producing a drift/center bounce; replaced by a content-script-owned stylesheet rule keyed on a stable selector (`extension/content.js:166-172`).

## Known edge cases

- **Restricted pages** (`chrome://`, the Chrome Web Store, `view-source:`, the built-in PDF viewer): content scripts do not run and `setZoomSettings` rejects; rejections are swallowed (`extension/background.js:112-114`), so behavior degrades to no zoom.
- **Frames.** `all_frames: false` (`extension/manifest.json:16`): only the top document is zoomed, which is the intended full-page behavior.
- **First-paint flash.** Possible in principle because the `document_start` read is asynchronous (`extension/content.js:100-102`); not observed on normal sites.
- **Pages that set their own `zoom` on `html`.** The re-assert observer will override them (`extension/content.js:478-483`).
- **Keying.** By `location.hostname` (`extension/content.js:15`), so subdomains are independent and http/https share a key. eTLD+1 grouping is roadmap VT-2.

## Loose ends

- The first design brief stated that the content script deliberately did not use a mutation observer; the code now relies on two (`extension/content.js:484-508`). The brief has been retired; this section supersedes it.
- Zero-flash hardening, storage.sync, eTLD+1 keying and the incognito/restart persistence test remain open on [roadmap.md](../roadmap.md).
