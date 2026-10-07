# 04 - Content script (`extension/content.js` + `extension/zoom.js`)

The content script is the only component that changes the page. It is declared once: `<all_urls>`, `run_at: document_start`, `all_frames: false`, loading `zoom.js` then `content.js` (`extension/manifest.json:11-18`). The whole script is an IIFE that exits immediately when `location.hostname` is empty (`about:`, `data:`) (`extension/content.js:14-16`).

**Inputs:** the site's storage keys ([03](03-storage-and-state.md)), `storage.onChanged`, `keydown`, `load`, `resize`, DOM mutations on `<html>`/`document`, and runtime messages `autofit` and `previewZoom`. **Outputs:** `<html>` inline `zoom`; a `<style id="zp-recenter">` rule; storage writes of `z:` and removal of `af:`. **Invokes:** `stepFrom` from `zoom.js`; nothing else.

## Shared helpers (`extension/zoom.js`)

- `ZOOM_STEPS` ladder 0.25 ... 5.0, 17 steps (`extension/zoom.js:6-10`); `stepFrom(current, dir)` moves one step past the current value (`:16-28`). Functional (`tests/core.spec.js:145`, `tests/keyboard.spec.js`).
- `hostKey(host)` returns `"z:" + host` (`:12-14`); used by popup and options only.
- Slider math for the popup: `posToFactor`/`factorToPos` (logarithmic map, `:53-60`), `snapFactor` (soft snap to `ZOOM_DETENTS` within a position-space well, `:67-80`), `clampToExtents` (`:83-86`). Functional (`tests/slider.spec.js:35`, `:56`).
- Constants `ZOOM_DETENTS` (`:39-41`), `ZOOM_MIN_DEFAULT`/`ZOOM_MAX_DEFAULT` 0.05/4.0 (`:44-45`), `ZOOM_CLAMP_MIN`/`MAX` 0.05/5.0 (`:49-50`).
- `background.js` keeps its own copy of `ZOOM_STEPS`/`stepFrom` (`extension/background.js:11-27`) because the worker is not a module and does not import `zoom.js`.

## Apply and refresh - Functional

- `apply(factor)` records `desired` and writes `html.style.zoom`, clearing it at 1.0 (`extension/content.js:49-55`).
- `refresh()` reads seven keys in one `storage.local.get`, computes `suppressed`, `autoMode`, `recenter`, applies 1.0 if suppressed or the resolved factor otherwise, and schedules a re-center pass (`:66-85`). Called once at start (`:89`), on relevant `storage.onChanged` events (`:94-114`), and after `load` (`:497`).
- Turning `af:` on from anywhere triggers an immediate re-fit (`:110`).
- Tests: `tests/core.spec.js:29` (first paint), `:82` (live update), `:98` (reset), `tests/options.spec.js:175` (default), `tests/exclude.spec.js`, `tests/pause.spec.js`, `tests/global.spec.js` (suppression).

## Keyboard `Ctrl +/-/0` - Functional

A capture-phase `keydown` listener on `window` (`extension/content.js:405-427`) ignores events when suppressed (`:411`) and requires Ctrl without Alt or Meta (`:414`). It maps `+`, `=`, `NumpadAdd` to in, `-`, `_`, `NumpadSubtract` to out, and `0`, `Numpad0` to reset (`:416-419`), calls `preventDefault`, then `stepZoom` (`:384-403`), which re-reads storage, steps from the resolved factor (default-aware), removes `af:`, and writes or removes `z:`. The page is updated by the resulting `storage.onChanged`, not directly. On suppressed sites the key is left un-prevented so Chrome's native zoom works (`tests/exclude.spec.js:157`). Tests: `tests/keyboard.spec.js:35`, `:55`, `:78`, `:100`; `tests/auto.spec.js:51`.

The keys do not work where content scripts cannot run, and they cannot be remapped (they are page key handling, not `commands`).

## AutoFit (one-shot "Fit") - Functional

Entry: runtime message `{type: "autofit"}` from the popup or the worker's `zoom-autofit` command (`extension/content.js:355-361`). `autofit()` returns `{factor: 1, fits: true}` without acting when suppressed (`:335-342`); otherwise it computes, applies, and writes `z:` (or removes it at 1.0) (`:343-350`).

`computeAutofitFactor()` (`:300-333`):

1. Clears the inline zoom and forces a reflow so measurement happens at scale 1 (`:302-304`).
2. `pickContentTargets(viewport)` scans every element under `body` once, skipping boxes under 100px tall or 200px wide and "breakouts" whose left edge is below -20px; it returns the widest inset block (at least 20px narrower than the viewport, the content column) and the widest block overall (`:130-150`). `documentElement.scrollWidth` is deliberately not used because ad breakouts inflate it (`:126-129`).
3. Regimes: an inset column enlarges to `viewport / columnWidth`; otherwise a block wider than viewport+20 shrinks to `viewport / width`; otherwise the page is fluid and `fits: true` (`:310-318`). A result within [0.99, 1.01] also counts as fits (`:319`).
4. One re-check at the chosen factor tracks the same element and corrects once if its fill ratio is off by more than 3% (`:323-331`), because `clientWidth` is zoom-invariant while `getBoundingClientRect` rescales.
5. Factors are clamped to `[0.05, 5.0]` and rounded to 0.01 by `clampF` (`:116-120`).

Tests: `tests/autofit.spec.js:32` (shrink), `:58` (fits), `:79` (fill column), `:107` (ignore breakout), `:124` (clamp to 0.05), `:138` (fixed level does not re-fit). Real sites are messy (ads, late layout), so the factor can vary by load; it is best-effort.

## Auto mode (`af:<host>`) - Functional

When `af:` is set and the site is not suppressed, `scheduleRefit()` re-runs `autofit()` 400ms after `load` and after each `resize` (`extension/content.js:470-505`). It re-reads the flags when the timer fires because `load` can beat the initial storage read (`:473-474`). A plain fixed level is never re-measured, only re-asserted (`:466-469`). Tests: `tests/auto.spec.js:17`, `:36`, `:51`.

## Live preview (`previewZoom`) - Functional

The popup slider sends `{type: "previewZoom", factor}` during drag; the content script calls `apply()` without writing storage, unless suppressed, and replies synchronously (`extension/content.js:362-371`). Because `apply()` updates `desired`, the re-assert observer holds the preview. Tests: `tests/slider.spec.js:84`, `:105`.

## Re-center (`rc:<host>`) - Functional

Problem: wrappers sized with `100vw` or `min-width: 100vw` do not shrink under CSS `zoom` (vw resolves against the un-zoomed viewport), so a centered column drifts sideways and clips (`extension/content.js:37-42`).

`applyRecenter()` (`:207-277`):

- Clears only when definitely off: flag off, suppressed, no body (`:210-213`), zoom 1.0 (`:215-218`), or the column is not inside an over-wide wrapper (`:231-234`). A transient measurement miss returns without clearing, to avoid bounce (`:221-223`).
- Measures drift as viewport center minus column center (`:224-225`) and picks the outermost ancestor wider than viewport+8 (`:227-230`).
- Targets a stable unique selector (tag plus id, else tag plus classes, verified unique) (`:182-201`), else marks the element with `data-zp-recenter` (`:246-261`).
- Ignores drift under 4px (`:264`); otherwise accumulates `shift += drift / Z` (the translate runs inside `zoom: Z`) and writes `selector{transform:translateX(Npx) !important;}` into the owned `<style id="zp-recenter">` (`:269-276`, `:159-166`).

Scheduling is debounced 150ms (`:280-290`) and triggered by `refresh()`, `<html>` replacement, `load` plus a 700ms delayed pass, and `resize` (`:79`, `:460`, `:500`, `:504`). Tests: `tests/recenter.spec.js:30`, `:55`, `:77`, `:90` (using the `/drift` fixture, `tests/server.js:47-53`).

## Re-assert against re-rendering pages - Functional

`reassert()` re-applies `desired` when the inline zoom differs by more than 0.005 (`extension/content.js:434-439`). A `MutationObserver` on `<html>`'s `style` attribute calls it (`:440-453`); a `childList` observer on `document` re-applies, re-attaches the style observer and re-centers when `<html>` is replaced (`:454-464`). Both are inert while suppressed. Test: `tests/core.spec.js:122`.

## Failure handling

Every Chrome API call is wrapped in `try/catch` or checks `chrome.runtime.lastError`, because the extension context can be unavailable (`:82-84`, `:71`, `:389`, `:400-402`). AutoFit errors are returned as `{error}` to the caller (`:359`). Re-center measurement errors are swallowed per pass (`:284-288`).

## Loose ends

- Comment at `extension/content.js:431-432` cites a service-worker pre-paint stylesheet that no longer exists.
- Comment at `extension/content.js:292` cites "HANDOFF section 9", a document that has been retired; the algorithm is documented here.
- The full-document scan in `pickContentTargets` runs on every re-center pass (debounced) and every Auto re-fit; cost on very large DOMs has not been measured.
- AutoFit and re-center use fixed pixel thresholds (100/200/20/8/4px) tuned on washingtonpost.com and cnn.com; there is no per-site override.
- Cursor/hit-offset issues on map and overlay UIs under CSS zoom are a known CSS-zoom class of bug and remain open ([roadmap.md](../roadmap.md) section 6).
