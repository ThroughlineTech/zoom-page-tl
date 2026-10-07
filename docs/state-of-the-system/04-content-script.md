# 04 - Content script (`extension/content.js` + `extension/zoom.js`)

The content script is the only component that changes the page. It is declared once: `<all_urls>`, `run_at: document_start`, `all_frames: false`, loading `zoom.js` then `content.js` (`extension/manifest.json:11-18`). The whole script is an IIFE that exits immediately when `location.hostname` is empty (`about:`, `data:`) (`extension/content.js:14-16`).

**Inputs:** the site's storage keys and `cfg:keys` ([03](03-storage-and-state.md)), `storage.onChanged`, `keydown`, `load`, `resize`, DOM mutations on `<html>`/`document`, and runtime messages `autofit` and `previewZoom`. **Outputs:** `<html>` inline `zoom`; a `<style id="zp-recenter">` rule; storage writes of `z:`, `af:` and `cfg:off` (from shortcuts). **Invokes:** `stepFrom` from `zoom.js`; nothing else.

## Shared helpers (`extension/zoom.js`)

- `ZOOM_STEPS` ladder 0.25 ... 5.0, 17 steps (`extension/zoom.js:7-11`); `stepFrom(current, dir)` moves one step past the current value (`:17-29`). Functional (`tests/core.spec.js:145`, `tests/keyboard.spec.js`).
- `hostKey(host)` returns `"z:" + host` (`extension/zoom.js:13-15`); used by popup and options only.
- Slider math for the popup: `posToFactor`/`factorToPos` (logarithmic map, `extension/zoom.js:54-61`), `snapFactor` (soft snap to `ZOOM_DETENTS` within a position-space well, `:68-81`), `clampToExtents` (`:84-87`). Functional (`tests/slider.spec.js:35`, `:56`).
- `sameFactor` (`extension/zoom.js:93-95`) implements "a level equal to the default is stored as no key" for every writer.
- Keyboard shortcuts: `KEYS_KEY`, `KEY_ACTIONS`, `KEY_DEFAULTS`, chord parsing and labels (`parseChord`, `chordString`, `chordKey`, `chordLabel`), event matching (`eventChords`, `matchShortcut`, `shortcutLookup`), stored-value repair (`normalizeShortcuts`, which drops malformed or duplicate chords), and the binding rules (`checkChord`, `CHROME_RESERVED`, `CHROME_SHORTCUTS`, `chordFromChromeShortcut`) (`extension/zoom.js:97-397`).
- Constants `ZOOM_DETENTS` (`extension/zoom.js:40-42`), `ZOOM_MIN_DEFAULT`/`ZOOM_MAX_DEFAULT` 0.05/4.0 (`:45-46`), `ZOOM_CLAMP_MIN`/`MAX` 0.05/5.0 (`:50-51`).
- `background.js` keeps its own copy of `ZOOM_STEPS`/`stepFrom` (`extension/background.js:11-27`) because the worker is not a module and does not import `zoom.js`.

## Apply and refresh - Functional

- `apply(factor)` records `desired` and writes `html.style.zoom`, clearing it at 1.0 (`extension/content.js:52-58`).
- `refresh()` reads seven keys in one `storage.local.get`, computes `suppressed`, `autoMode`, `recenter`, applies 1.0 if suppressed or the resolved factor otherwise, and schedules a re-center pass (`:69-98`). Called once at start (`:102`), on relevant `storage.onChanged` events (`:107-128`), and after `load` (`:541`).
- Turning `af:` on from anywhere triggers an immediate re-fit (`:124`).
- Tests: `tests/core.spec.js:29` (first paint), `:82` (live update), `:98` (reset), `tests/options.spec.js:175` (default), `tests/exclude.spec.js`, `tests/pause.spec.js`, `tests/global.spec.js` (suppression).

## Keyboard shortcuts - Functional

Seven actions can be bound to page-level shortcuts: on/off everywhere, zoom in, zoom out, reset to 100%, back to the default zoom, Fit (once) and Auto on/off (`KEY_ACTIONS`, `extension/zoom.js:107-115`). Defaults are Ctrl+= / Ctrl+- / Ctrl+0 for zoom in/out/reset, all others unset (`KEY_DEFAULTS`, `extension/zoom.js:118-126`). Bindings live in `cfg:keys` and are edited on the options page ([06](06-popup-and-options.md)).

**Matching.** The content script keeps a chord -> action lookup, seeded with the defaults so the keys work before the first storage read and rebuilt on every `refresh()` (`extension/content.js:39`, `:84`). A capture-phase `keydown` listener on `window` (`:451-470`) asks `matchShortcut` (`extension/zoom.js:242-248`) for an action. Candidate chords for an event are, in order: the exact chord (modifiers plus `KeyboardEvent.code`), its numpad twin (Num0-9, Num+, Num- count as 0-9, =, -), and the typed-character alias without Shift (`+`/`=` -> Equal, `-`/`_` -> Minus), so Ctrl++ matches on any layout (`eventChords`, `extension/zoom.js:189-201`). Events with AltGr held never match, so AltGr characters are never swallowed (`:191`).

**Dispatch.** While the site is suppressed (off, excluded or paused) every shortcut except on/off is ignored and the key is left un-prevented, so Chrome's native Ctrl +/- and its bubble work (`extension/content.js:461`; `tests/exclude.spec.js:157`). Otherwise the key is prevented; auto-repeat re-fires only zoom in/out (`extension/content.js:427`, `:463`). `runShortcut` (`:429-450`):

| Action | Effect |
| --- | --- |
| zoomIn / zoomOut / reset | `stepZoom(+1/-1/0)` (`extension/content.js:412-424`): re-read storage, step from the resolved (default-aware) factor or go to 1.0, remove `af:`, then remove `z:` if the result equals the default, else write it. |
| default | Remove `z:` and `af:`: the site follows the global default. |
| fit | Remove `af:`, then the one-shot `autofit()`. |
| auto | Toggle `af:`; turning it on fits through the `storage.onChanged` path. |
| toggle | Flip `cfg:off`. Works while off, so it can turn the extension back on. |

Handlers only write storage; the page updates through `storage.onChanged`.

**Limits.** Shortcuts work only where the content script runs (not `chrome://` pages, the Web Store, the PDF viewer, or browser UI such as the address bar), and Chrome's own reserved keys and any extension command on the same chord reach Chrome first. Chrome-level `commands` ([05](05-service-worker.md)) remain available for those cases.

Tests: `tests/keyboard.spec.js` (defaults, badge), `tests/shortcuts.spec.js` (every action, switched-off and rebound shortcuts, Ctrl++ and numpad aliases, suppression, reset pinning 100% under a non-100% default), `tests/auto.spec.js:51`.

## AutoFit (one-shot "Fit") - Functional

Entry: runtime message `{type: "autofit"}` from the popup or the worker's `zoom-autofit` command (`extension/content.js:371-377`). `autofit()` returns `{factor: 1, fits: true}` without acting when suppressed (`:349-357`); otherwise it computes, applies, and writes `z:` (or removes it when the result equals the default) (`:358-366`).

`computeAutofitFactor()` (`:314-347`):

1. Clears the inline zoom and forces a reflow so measurement happens at scale 1 (`:316-318`).
2. `pickContentTargets(viewport)` scans every element under `body` once, skipping boxes under 100px tall or 200px wide and "breakouts" whose left edge is below -20px; it returns the widest inset block (at least 20px narrower than the viewport, the content column) and the widest block overall (`:144-164`). `documentElement.scrollWidth` is deliberately not used because ad breakouts inflate it (`:140-143`).
3. Regimes: an inset column enlarges to `viewport / columnWidth`; otherwise a block wider than viewport+20 shrinks to `viewport / width`; otherwise the page is fluid and `fits: true` (`:324-332`). A result within [0.99, 1.01] also counts as fits (`:333`).
4. One re-check at the chosen factor tracks the same element and corrects once if its fill ratio is off by more than 3% (`:337-345`), because `clientWidth` is zoom-invariant while `getBoundingClientRect` rescales.
5. Factors are clamped to `[0.05, 5.0]` and rounded to 0.01 by `clampF` (`:130-134`).

Tests: `tests/autofit.spec.js:32` (shrink), `:58` (fits), `:79` (fill column), `:107` (ignore breakout), `:124` (clamp to 0.05), `:138` (fixed level does not re-fit). Real sites are messy (ads, late layout), so the factor can vary by load; it is best-effort.

## Auto mode (`af:<host>`) - Functional

When `af:` is set and the site is not suppressed, `scheduleRefit()` re-runs `autofit()` 400ms after `load` and after each `resize` (`extension/content.js:514-549`). It re-reads the flags when the timer fires because `load` can beat the initial storage read (`:517-518`). A plain fixed level is never re-measured, only re-asserted (`:510-513`). Tests: `tests/auto.spec.js:17`, `:36`, `:51`.

## Live preview (`previewZoom`) - Functional

The popup slider sends `{type: "previewZoom", factor}` during drag; the content script calls `apply()` without writing storage, unless suppressed, and replies synchronously (`extension/content.js:378-387`). Because `apply()` updates `desired`, the re-assert observer holds the preview. Tests: `tests/slider.spec.js:84`, `:105`.

## Re-center (`rc:<host>`) - Functional

Problem: wrappers sized with `100vw` or `min-width: 100vw` do not shrink under CSS `zoom` (vw resolves against the un-zoomed viewport), so a centered column drifts sideways and clips (`extension/content.js:40-45`).

`applyRecenter()` (`:221-291`):

- Clears only when definitely off: flag off, suppressed, no body (`:224-227`), zoom 1.0 (`:229-232`), or the column is not inside an over-wide wrapper (`:245-248`). A transient measurement miss returns without clearing, to avoid bounce (`:235-237`).
- Measures drift as viewport center minus column center (`:238-239`) and picks the outermost ancestor wider than viewport+8 (`:241-244`).
- Targets a stable unique selector (tag plus id, else tag plus classes, verified unique) (`:196-215`), else marks the element with `data-zp-recenter` (`:260-275`).
- Ignores drift under 4px (`:278`); otherwise accumulates `shift += drift / Z` (the translate runs inside `zoom: Z`) and writes `selector{transform:translateX(Npx) !important;}` into the owned `<style id="zp-recenter">` (`:283-290`, `:173-180`).

Scheduling is debounced 150ms (`:294-304`) and triggered by `refresh()`, `<html>` replacement, `load` plus a 700ms delayed pass, and `resize` (`:92`, `:504`, `:544`, `:548`). Tests: `tests/recenter.spec.js:30`, `:55`, `:77`, `:90` (using the `/drift` fixture, `tests/server.js:47-53`).

## Re-assert against re-rendering pages - Functional

`reassert()` re-applies `desired` when the inline zoom differs by more than 0.005 (`extension/content.js:478-483`). A `MutationObserver` on `<html>`'s `style` attribute calls it (`:484-497`); a `childList` observer on `document` re-applies, re-attaches the style observer and re-centers when `<html>` is replaced (`:498-508`). Both are inert while suppressed. Test: `tests/core.spec.js:122`.

## Failure handling

Every Chrome API call is wrapped in `try/catch` or checks `chrome.runtime.lastError`, because the extension context can be unavailable (`extension/content.js:83`, `:95-97`, `:401`, `:404-406`). AutoFit errors are returned as `{error}` to the caller (`:375`). Re-center measurement errors are swallowed per pass (`:298-302`).

## Loose ends

- The full-document scan in `pickContentTargets` runs on every re-center pass (debounced) and every Auto re-fit; cost on very large DOMs has not been measured.
- AutoFit and re-center use fixed pixel thresholds (100/200/20/8/4px) tuned on washingtonpost.com and cnn.com; there is no per-site override.
- Cursor/hit-offset issues on map and overlay UIs under CSS zoom are a known CSS-zoom class of bug and remain open ([roadmap.md](../roadmap.md) section 6).
