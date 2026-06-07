# Zoom Page TL: Engineering Handoff

This document is the complete brief for a coding agent picking up this project. It
contains the goal, the root-cause analysis behind the design, the relevant Chrome
API behavior (so you do not have to re-research it), a file-by-file walkthrough,
the data model, known edge cases, and a prioritized backlog. Read it top to bottom
before changing code.

No em dashes are used in this repo's docs by author preference. Keep that style.

## 1. Goal

A small, fast Manifest V3 Chrome extension that applies per-site full-page zoom and
never triggers Chrome's native zoom indicator popup. It is an independent rewrite in
the spirit of "Zoom Page WE" by DW-dev (GPLv2, last updated April 2023, unmaintained),
scoped down to the one feature the author actually uses: per-site full zoom.

Explicit non-goals for v1: text-only zoom, minimum font size, per-tab mode, subsite
trees, image fit-to-window scaling. Those are ZPWE features the author does not use.
AutoFit-to-width is deferred (see Backlog), not rejected.

## 2. Background: what was wrong with the original

The author used Zoom Page WE and hit three problems:

1. A native Chrome zoom bubble (the "100% / minus / plus / Reset" omnibox popup) kept
   appearing on zoom changes, including a spurious 100% bubble even in the extension's
   own "CSS full zoom" mode.
2. The "use CSS full zoom instead of browser full zoom" setting was a single global
   toggle, not per-site, so you could not have CSS zoom on one site and browser zoom
   on another. Every other setting (level, type) was per-site.
3. CSS full zoom was slow and clunky. The page would render at 100%, the extension
   would "think" for a moment, then snap to the target zoom. Sometimes it did not
   settle correctly.

## 3. Root-cause analysis (read this; it drives the whole design)

### 3.1 The zoom bubble

Chrome shows its native zoom indicator whenever the zoom factor for a tab changes via
the `chrome.tabs.setZoom` API while zoom settings are in the default `automatic` mode.
There is no API flag to suppress that bubble. It is intrinsic to browser zoom.

The spurious 100% bubble that ZPWE produced even in CSS mode is the signature of the
extension resetting browser zoom to 100% (via setZoom) so it could layer CSS zoom on
top. That reset is itself a zoom-factor change, so it flashes the bubble.

Conclusion: as long as an extension calls `setZoom` at all, the bubble will appear.
You cannot tune it away with options. The only fix is to stop using browser zoom.

### 3.2 The global method toggle

ZPWE modeled "browser vs CSS" as a global preference rather than per-site state. This
project removes the choice entirely: CSS is the only zoom mechanism, stored per site
like everything else. One decision (CSS-only) fixes both the bubble and the global
toggle complaint.

### 3.3 The slowness

Two contributing causes:

1. MV3 service worker lifecycle. The background context is torn down and respun on
   each event, so any zoom application that round-trips through the service worker
   incurs that spin-up latency.
2. Late application. ZPWE applied zoom after load and measurement, with mutation
   observers re-checking, so you saw a 100% render then a jump.

Fix: apply zoom in a `document_start` content script, synchronously from
`chrome.storage`, with no service worker round-trip and no measurement step. Fixed
per-site zoom then applies before first paint in the common case.

## 4. Core architecture

Two mechanisms, both required:

1. Zoom is applied as the CSS `zoom` property on `document.documentElement`
   (`html { zoom: <factor> }`), injected by a `document_start` content script that
   reads the stored factor for the current hostname.
2. The service worker calls `chrome.tabs.setZoomSettings(tabId, { mode: "disabled" })`
   on every navigation and tab activation. This pins browser zoom to 100% and makes
   Chrome ignore all zoom changes, so the bubble can never fire. The extension itself
   never calls `setZoom`. Exception: on a paused site (`x:<host>`) the worker sets
   `mode: "automatic"` instead, handing native zoom back to Chrome (see section 7).

Why CSS `zoom` specifically (not `transform: scale`): in Chromium, the `zoom` property
is a real layout-affecting zoom. It reflows content the same way browser zoom does, so
there are no horizontal-scrollbar or overflow hacks, fixed/sticky positioning behaves
correctly, and responsive breakpoints react as they would under browser zoom.
`transform: scale` only scales visually, does not reflow, and forces width-compensation
hacks and broken fixed positioning. `zoom` is now part of the CSS specification and is
supported in modern browsers; this project targets Chromium.

## 5. Relevant Chrome API behavior (researched, do not re-derive)

### chrome.tabs.setZoomSettings(tabId, { mode })
- `mode: "automatic"` (default): browser handles zoom normally and shows the bubble on
  zoom changes. Persists per origin.
- `mode: "manual"`: extension handles zoom via the `tabs.onZoomChange` event. Per-tab
  only (ignores scope). Still routes through the browser zoom mechanism.
- `mode: "disabled"`: disables all zooming in the tab. The tab reverts to the default
  (100%) zoom level and all attempted zoom changes are ignored. This is what suppresses
  the bubble for us.
- Important: zoom settings are reset to defaults upon navigating the tab. You MUST
  reapply `disabled` on each navigation. We do this in `tabs.onUpdated` when
  `changeInfo.status === "loading"`, and again on `tabs.onActivated`.
- The zoom methods require host access to the tab. We declare `host_permissions:
  ["<all_urls>"]`. Calls against restricted pages (chrome://, the Web Store, the PDF
  viewer, view-source) reject; we swallow those rejections.

Reference: https://developer.chrome.com/docs/extensions/reference/api/tabs
Reference: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/ZoomSettingsMode

### CSS `zoom`
- Chromium implements `zoom` as a layout zoom (reflow), not a visual transform.
- Setting it on `document.documentElement` zooms the whole page.
- Setting it to `1` (or clearing it) restores normal scale.

### Content scripts at `document_start`
- Run before the DOM is built, but `document.documentElement` already exists, so you
  can set `html` style immediately. This is why first-paint zoom works.

### MV3 service worker
- Event-driven and ephemeral. Do not hold long-lived in-memory state. Re-read from
  `chrome.storage` on each event. The current code already follows this.

### commands (keyboard) reserved keys
- Chrome reserves Ctrl with +, -, and 0 for browser zoom and will not let extensions
  bind them as commands. We expose two paths:
  - `Alt+Shift+Up / Down / 0` are real `commands` (rebindable at
    `chrome://extensions/shortcuts`), handled in the service worker.
  - `Ctrl +/-/0` are intercepted in the content script (`keydown`, capture phase,
    `preventDefault`) and drive the same per-site CSS zoom. This works precisely
    because browser zoom is disabled, so the native Ctrl +/-/0 are inert and ours
    are the only effect. (These are not rebindable; they are page-level key handling,
    not extension commands.)
- `zoom-autofit` and `toggle-global` are defined with NO `suggested_key`, so they do not
  consume the 4 default-key slots Chrome allows (only 4 commands may carry a
  `suggested_key`; we use 3 for zoom in/out/reset). Users bind them by hand at
  `chrome://extensions/shortcuts`. `toggle-global` flips the `cfg:off` master switch.

## 6. File-by-file walkthrough

All loadable files live under `extension/`. Load unpacked points at that folder.

- `extension/manifest.json`
  MV3 manifest. Permissions: `storage`, `tabs`. `host_permissions`: `<all_urls>`.
  One `document_start` content-script entry on `<all_urls>`, top frame only, loading
  `zoom.js` then `content.js`. An action with the popup. Five commands (zoom-in,
  zoom-out, zoom-reset, zoom-autofit, toggle-global; the last two have no default key,
  so they do not consume the 4 suggested-key slots Chrome allows).

- `extension/content.js`
  Runs at `document_start`. Reads `z:<hostname>` from `chrome.storage.local` and sets
  `document.documentElement.style.zoom`. Subscribes to `storage.onChanged` so changes
  from the popup or keyboard apply live without a reload. Also intercepts `Ctrl +/-/0`
  (`keydown`, capture, `preventDefault`) and steps the per-site CSS zoom via `stepFrom`
  (from `zoom.js`, loaded first). Honors the two suppression flags `x:<hostname>`
  (excluded - never zoom) and `p:<hostname>` (paused - suspended for now): when either is
  set it holds the page at 100% and leaves Ctrl +/- to the browser (it does not
  preventDefault them), so native zoom works there. Re-asserts the desired factor if the
  page clobbers it - a
  MutationObserver on the `<html>` style attribute plus a `document` childList observer
  for wholesale `<html>` replacement (this is what keeps re-rendering sites like cnn.com
  stable, and it is why a stored zoom survives the load churn). This re-ASSERT (not
  re-measure) is what holds a FIXED level steady: plain "Fit width" is a one-shot, so a
  fixed level never bounces. Re-MEASURING only happens for sites in explicit Auto mode
  (`af:<host>`, opt-in): those re-run AutoFit after `load` (debounced) and on resize, and
  also fit immediately when Auto is turned on. Also answers two runtime messages: the
  one-shot `autofit` (measure + persist, see below) and `previewZoom` - an EPHEMERAL
  live preview used while the popup's zoom slider is being dragged: it `apply()`s the
  factor to `<html>` WITHOUT writing storage (no write churn, no badge/tab fan-out), so
  the page reflows in real time as you drag; the popup commits once to storage on
  release. Because `apply()` updates `desired`, the re-assert observer holds the preview
  steady instead of reverting it. Ignored while suppressed. Also drives the per-site
  RE-CENTER fix (`rc:<host>`, opt-in): some sites size full-bleed wrappers to the device
  viewport (`100vw` / `min-width:100vw`), which Chromium does NOT shrink under CSS `zoom`
  (vw resolves against the un-zoomed viewport), so content centered inside drifts sideways
  and clips. When enabled and zoom != 1, `applyRecenter` measures the inset content column
  (via `pickContentTargets`), finds the outermost over-wide wrapper containing it, and writes
  a CONTENT-SCRIPT-OWNED stylesheet rule (`<style id=zp-recenter>`) of the form
  `<wrapper-selector>{transform:translateX(shift) !important}`. Two subtleties make it stable
  on SPA sites (e.g. WaPo) that re-render/re-create the wrapper during hydration and on scroll:
  (1) it targets a STABLE selector (the wrapper's id or class chain, verified unique), NOT
  inline style or a marker attribute - so the rule keeps matching whatever the site re-renders,
  flicker-free (an inline transform got wiped each re-render -> bounce); (2) the shift ACCUMULATES
  (`shift += drift / Z`, the `/ Z` because the translate is inside the root `zoom:Z`), so a
  reading of an already-centered column is a no-op instead of a reset - no feedback oscillation.
  A transient measurement miss (column mid-render) returns WITHOUT clearing; the rule is cleared
  only when genuinely off (100%, flag off, suppressed, or the column is not in an over-wide
  wrapper). Debounced (`scheduleRecenter`) and re-applied on storage change, load (plus a delayed
  pass), resize, and `<html>` replacement. Wrapped in try/catch for pages where the extension
  context is unavailable.

- `extension/background.js`
  Service worker. On `tabs.onUpdated` (status loading) and `tabs.onActivated`, calls
  `setZoomSettings({ mode: "disabled" })` to keep the bubble suppressed, and refreshes
  the toolbar badge to the current site's percent. A `storage.onChanged` listener also
  refreshes the active tab's badge so in-place edits (the content-script Ctrl +/- keys,
  the popup, the options page) keep the badge in sync. Handles the keyboard commands by
  stepping the active site's factor and writing it back to storage (`zoom-autofit` just
  forwards a one-shot autofit message to the content script). `getFactor` resolves
  the factor the same way content.js does (`z:<host>` -> `cfg:defaultZoom` -> 1.0), so
  both the command stepping base and the badge are default-aware: with a non-100% global
  default, "zoom in" steps up from what is on screen and the badge shows that percent.
  Honors the suppression flags via `isSuppressed` (the global switch `cfg:off`, OR
  `x:<host>` excluded, OR `p:<host>` paused): on a suppressed site the commands no-op, the
  badge shows a gray "off", and `applyZoomMode` sets the tab to `"automatic"` (not
  `"disabled"`) so native browser zoom works. A `storage.onChanged` listener re-applies the
  mode and badge live: a per-site change calls `syncActiveTab` (the active tab only), but a
  `cfg:off` change calls `syncAllTabs` (every open tab, since the master switch affects them
  all at once) and swaps the toolbar icon to/from the greyed `icons/off/` set via
  `applyActionIcon`. The `toggle-global` command flips `cfg:off`. Contains its
  own copy of `ZOOM_STEPS` and `stepFrom` because service workers cannot easily share
  the popup's plain script.

- `extension/zoom.js`
  Shared helpers. The keyboard ladder: `ZOOM_STEPS`, `hostKey`, `stepFrom`. The popup
  zoom slider: `posToFactor` / `factorToPos` (a LOGARITHMIC position<->factor map over
  the settable extents, so equal travel == equal ratio), `snapFactor` (soft magnetic
  snap to the nearest `ZOOM_DETENTS` value within a small position-space well, else the
  raw factor - so you can slide past), and `clampToExtents`. Plus the constants
  `ZOOM_DETENTS`, `ZOOM_MIN_DEFAULT`/`ZOOM_MAX_DEFAULT` (5%/400% slider extents) and
  `ZOOM_CLAMP_MIN`/`ZOOM_CLAMP_MAX` (5%/500% hard clamp, shared with content.js and
  options.js). Loaded as a plain script before `popup.js` and `options.js`, and as the
  first content script before `content.js` (so the Ctrl +/- keys can use `stepFrom`).
  The slider helpers are pure (no DOM), so `tests/slider.spec.js` drives the math
  directly. (Background duplicates `ZOOM_STEPS`/`stepFrom` intentionally.)

- `extension/popup.html` / `extension/popup.js`
  The toolbar popup. Native-feeling, light/dark aware. Shows the current hostname and
  percent, a live zoom SLIDER, a minus/plus stepper, a preset grid, a "Fit width"
  (AutoFit) button, a reset button, two footer toggles - "Pause" (suspend zoom for now,
  `p:<host>`) and
  "Exclude" (never zoom, `x:<host>`) - and an "Options" footer link. A top appbar holds a
  master On/Off power switch (writes `cfg:off`); when off everywhere the whole per-site UI
  dims and the switch reads "Off". Writes per-site
  factor to storage on change; the content script reflects it live. The action row is
  "Fit | Auto | Reset": **Fit** is a one-shot (measure once, fixed level), **Auto** toggles
  explicit auto-fit mode (`af:<host>` - re-fits each load; highlighted while on, and it
  greys out the manual stepper/presets since the zoom is auto-managed), **Reset** is 100%.
  Any manual zoom (preset/stepper) leaves Auto. While suppressed it shows "Paused"/"Off",
  dims the controls, and disables them;
  excluding supersedes a pause (it clears `p:` and disables the Pause toggle).
  The slider is the live/coarse control: a native `<input type=range>` (0..1000 mapped
  through the LOG scale over the settable extents), with a tick strip drawn at the
  detents. On `input` (drag) it sends an ephemeral `previewZoom` to the active tab (no
  storage write) and soft-snaps the thumb to a detent within the well; on `change`
  (release) it commits once via the normal persist path. A drag cannot resolve a single
  percent at a 5-400 range (sub-pixel), so EXACT values come from three fine controls,
  all of which persist immediately: the percent readout is an editable field (click to
  type), Arrow keys on the slider nudge +/-1%, and Ctrl/Shift + wheel steps the ladder.
  The slider extents are read from `cfg:zoomMin`/`cfg:zoomMax` (default 5%/400%) on open.
  The slider/stepper/presets/percent all grey out and disable while suppressed or in
  Auto, like the other manual numbers. A "Re-center when zoomed" toggle (`rc:<host>`)
  writes the per-site re-center flag; it is enabled whenever the site is not suppressed
  (independent of Auto).

- `extension/options.html` / `extension/options.js`
  The options page (also reachable from the popup footer). Four sections: a global
  default zoom for un-customized sites (stored under `cfg:defaultZoom`); a **Zoom slider
  range** (min/max stored under `cfg:zoomMin`/`cfg:zoomMax`, default 5%/400%, clamped to
  the 5%-500% hard range and rejecting `max <= min`); a site manager split into an
  **Active** list and an **Excluded** list; and JSON import/export. Each site row has a
  "Center" button (the per-site `rc:` re-center toggle) alongside Auto/Pause/Exclude/Remove.
  `getBounds`/`setBounds`/`setRecenter` are exposed on `window.ZP` for the test suite. The
  manager lists the union of every customized host (`z:` level, `x:` excluded, or `p:`
  paused). Active rows have inline level editing, a Pause/Resume toggle, an Exclude
  button (moves the row to the Excluded list), and Remove; a paused active row shows a
  "Paused" tag and a disabled level field (resume to edit). Excluded rows show their
  cached level greyed, an Include button (moves it back to Active), and Remove. Remove
  forgets the site entirely (drops `z:`, `x:`, and `p:`). Each list is in a
  max-height scroll container (a per-list search filter is a future add as the lists
  grow). The pure storage operations are also exposed on `window.ZP` so the test suite
  can drive them without a file dialog.

- `extension/icons/`
  16/32/48/128 PNG magnifier icons (generated, blue rounded square).

- `scripts/check.js`
  Chrome-targeted static check, wired to `npm run lint`. Validates that the manifest
  is valid JSON, every referenced JS file parses, and every referenced asset exists
  (icons verified as real PNGs at their declared sizes). Replaces `web-ext lint`,
  which validates against Firefox and false-flags Chrome's MV3 service worker.

- `tests/` + `playwright.config.js`
  Playwright suite. `fixtures.js` loads the unpacked extension in Chromium's new
  headless mode (via `channel: "chromium"`, which supports extensions and their
  service workers) and exposes the service worker for privileged calls. `server.js`
  serves test pages on a real `localhost` hostname (content.js keys by hostname, so a
  real origin is required). Specs cover the core guarantees, AutoFit, and the options
  / import-export flows. Run with `npm test`.

## 7. Data model

`chrome.storage.local`, one key per site:

- Key: `z:<hostname>` (for example `z:www.washingtonpost.com`)
- Value: a number, the zoom factor (1.5 means 150%)
- Convention: 100% is stored as the absence of a key. Setting a site to 100% deletes
  its key. This keeps storage clean and makes "is this site customized" a simple
  presence check.
- Reserved keys `cfg:zoomMin` / `cfg:zoomMax` (numbers, factors) are the popup zoom
  slider's extents. Absent means the defaults (0.05 / 4.0, i.e. 5% / 400%). They are
  settable in the options page, clamped to the hard range `[ZOOM_CLAMP_MIN,
  ZOOM_CLAMP_MAX]` = `[0.05, 5.0]` (5%-500%), and stored as the absence of a key when at
  the default (consistent with the rest of the model). A level set outside the extents
  (e.g. via import or the options site manager, which allow up to the 500% hard ceiling)
  still applies; the popup slider and its typed/arrow/wheel controls clamp to the extents.
  NOTE: the hard factor clamp floor was lowered from 0.25 to 0.05 (in content.js,
  options.js, and the shared `ZOOM_CLAMP_MIN`) so the slider can reach 5%.
- Reserved key: `cfg:defaultZoom` (a number) is the global default applied to sites
  that have no `z:` key of their own. Absent means 100%. Consequence of the
  absence-means-100% convention: when the default is not 100%, a site with no key
  follows the default rather than rendering at 100%. To pin such a site to a specific
  level (including 100% when the default differs), set it explicitly in the options
  site manager. content.js resolves a site's factor as `z:<host>` if present, else
  `cfg:defaultZoom`, else 1.0, and re-resolves live when either key changes.
- Master switch: `cfg:off` = `true` turns the extension off on EVERY site (a global
  play/pause). It is the top of the suppression hierarchy: when set, content.js holds
  every page at 100%, the worker puts every tab in `"automatic"` and shows the "off"
  badge, and the toolbar icon greys out - regardless of any per-site `z:`/`x:`/`p:`.
  Per-site state is untouched, so clearing `cfg:off` restores each site exactly. Absent
  means on. Written by the popup power switch and the `toggle-global` command. Persists
  (it is a deliberate state), so it survives a restart until toggled back on.
- Two per-site suppression flags - `x:<hostname>` (excluded: never zoom) and `p:<hostname>`
  (paused: suspended for now). Either set to `true` makes content.js hold the page at its
  natural 100% (ignoring `z:<host>` and the default), the extension's zoom inert, the
  badge "off", and the service worker sets that tab to `setZoomSettings` `"automatic"` -
  handing native Ctrl +/- (and the browser's zoom bubble) back to Chrome (the "act as if
  the extension is not here" behavior). They behave identically on the page; the
  difference is intent and lifecycle:
  - **Exclude (`x:`)** is durable ("never on this site"); it lives in the options Excluded
    list and IS carried in JSON export/import.
  - **Pause (`p:`)** is meant to be temporary ("a layout broke, suspend for now"); it keeps
    the site in the Active list (greyed, with Resume) and is NOT exported (transient).
  The `z:<host>` factor is left intact under both, so removing the flag restores the
  previous level and the `"disabled"` (no-bubble) mode live. Excluding supersedes a pause:
  setting `x:` clears any `p:`. Absence of both means enabled. Written by the popup's Pause
  / Exclude toggles and the options site manager. (Historically `x:` was a single
  "disable" flag; it is now specifically Exclude, with Pause split out as `p:`.)
- Fit vs Auto. Plain "Fit" is a one-shot: it measures once and writes the result as the
  ordinary fixed `z:<host>` level, so every page renders at that level with no re-fit and
  no bouncing (the default; the author wants levels fixed per site). `af:<hostname>` =
  `true` is the EXPLICIT, opt-in Auto mode (the popup "Auto" toggle / the options Auto
  button): a site in Auto re-runs AutoFit on every `load` (debounced) and resize, and fits
  immediately when toggled on, so it reshapes to fit as the page loads. `z:<host>` holds
  the current fit (applied at document_start). ANY manual zoom (preset/stepper/Ctrl +/-/0,
  the commands, an options level edit) or a one-shot "Fit" clears `af:`, locking the level.
  Auto and the manual numbers are mutually exclusive in the UI: while Auto is on the popup
  stepper/presets grey out and the options level field is disabled. (History: `af:` was the
  always-on behavior of the old "Fit width is a mode"; that was removed for being jarring,
  then re-added as this explicit opt-in.) The re-assert observers still hold whatever level
  is current applied against sites that clobber the inline zoom (re-assert, not re-measure).
  Auto is NOT in JSON export/import yet (a possible follow-up, like Exclude is).
- Re-center: `rc:<hostname>` = `true` is a per-site, opt-in layout fix for sites whose
  content drifts sideways under CSS `zoom` (full-bleed `100vw`/`min-width:100vw` wrappers
  that do not shrink under zoom - see the content.js entry). When set and zoom != 1, the
  content script translates the offending wrapper so the content column re-centers. It is
  inert at 100% and while suppressed, and is NOT exported (transient, like `af:`). Written
  by the popup "Re-center when zoomed" toggle and the options "Center" button.

Keying is by `location.hostname`. This matches ZPWE's "treat domain and subdomains as
separate sites" behavior: `x.com`, `www.x.com`, and `sub.x.com` are independent, and
http vs https share a key (hostname ignores scheme). See Backlog for the eTLD+1 option.

## 8. Known edge cases and limitations

- Restricted pages (chrome://, Chrome Web Store, view-source:, the built-in PDF
  viewer, some extension pages): content scripts do not run and/or setZoomSettings
  rejects. All such calls are wrapped; behavior degrades to "no zoom," which is correct.
- iframes: `all_frames: false`, so only the top document is zoomed. For full-page zoom
  that is the right behavior. Do not flip this on without testing; per-frame zoom on
  `html` inside cross-origin frames is messy and usually unwanted.
- First-paint flash: `storage.local.get` at document_start is async. It resolves before
  first paint in the common case, but a very fast first paint on a heavy site could
  show a brief 100% frame before the zoom applies. See Backlog item "zero-flash
  hardening" if this is ever observed in practice.
- Sites that set their own `zoom` on `html`, or that rewrite the `html` style attribute
  after load, could fight our value. We reassert only on `storage.onChanged`, not via a
  mutation observer, deliberately (observers were part of what made ZPWE slow). If a
  specific site misbehaves, prefer a targeted fix over a global observer.
- SPA client-side navigations do not re-run the content script. That is fine: the zoom
  stays applied on the persistent `html` element, and `setZoomSettings` persists for the
  life of the document.

## 9. Backlog (prioritized)

Each item lists effort as S/M/L. Items 1, 3, 4, and 7 are DONE (see notes); the rest
remain open.

1. AutoFit-to-width [M]. DONE (revised twice). content.js measures at scale 1 (forced
   sync reflow, no visible un-zoomed frame). `pickContentTargets` scans block elements
   (height >= 100, width >= 200) once, SKIPPING breakouts (left < -20: elements pulled
   off the left edge with negative margins, e.g. full-bleed ad zones), and returns the
   widest INSET block (leaves a side margin: the content column) and the widest block
   overall. Then three regimes: (a) an inset content column -> enlarge to fill, factor =
   clientWidth/columnWidth (makes washingtonpost.com ~1.48 and cnn.com ~1.2-1.5 instead
   of no-opping); (b) no inset column but the widest block exceeds the viewport ->
   shrink to fit it; (c) neither -> fluid edge-to-edge, returns `fits: true` and the
   popup shows "Already fits the width". We deliberately do NOT use
   documentElement.scrollWidth - ad breakouts pollute it (cnn.com had ~9-280px of
   phantom overflow that tipped the old shrink branch into a ~1.0 no-op). Clamped to
   [0.25, 5.0], rounded to 0.01; a result within [0.99, 1.01] counts as "fits". One
   re-check tracks the SAME element (measuring under CSS zoom is unreliable - clientWidth
   is zoom-invariant while getBoundingClientRect rescales, and re-selecting the widest
   block diverges). Returns `{ factor, fits }`. Driven by the popup "Fit width" button
   and a `zoom-autofit` command (no default key). Covered by `tests/autofit.spec.js`
   (shrink, fill, breakout-ignore, clamp, fluid no-op) with `/wide`, `/narrow`, `/messy`
   fixtures. NOTE: real-world pages are messy (ads, breakouts, layouts that shift as
   content loads), so AutoFit is best-effort and the exact factor can vary by load; the
   clamps and the "fits" fallback bound the worst case. FIT vs AUTO (current): the popup
   action row is "Fit | Auto | Reset". **Fit** is a one-shot - measure once, write a fixed
   `z:<host>` level, never re-fit (the default; fixed levels do not bounce). **Auto** is the
   explicit opt-in mode (`af:<host>`): a site in Auto re-fits on every `load`/resize and on
   toggle-on, and while it is on the manual numbers (popup stepper/presets, options level
   field) grey out. Any manual zoom or a one-shot Fit clears `af:`. (History: `af:` was the
   always-on behavior of the earlier "Fit width is a mode"; removed for being jarring, then
   re-added as this explicit toggle.) Covered by `tests/autofit.spec.js` (one-shot fixed,
   no-re-fit), `tests/auto.spec.js` (Auto re-fit + toggle), `tests/options.spec.js` (Auto
   toggle UI); re-assert by `tests/core.spec.js`.
2. eTLD+1 keying option [M]. OPEN. Optionally collapse subdomains to the registrable
   domain. Requires a public-suffix list (bundle a static copy of the PSL; do not
   fetch at runtime, MV3 forbids remote code). Make it a toggle in the options page,
   defaulting off to preserve current behavior.
3. Options page [S to M]. DONE (global default zoom + site manager + import/export).
   The eTLD+1 toggle (item 2) is the remaining piece to add here.
4. Import/export per-site data [S]. DONE. Export `z:*` levels, `cfg:defaultZoom`, and the
   `x:*` exclude list to JSON (`{version, defaultZoom, sites, excluded}`); import merges
   or replaces (replace also clears existing `z:*`/`x:*`), clamping values and dropping
   100%/invalid entries. Pause (`p:`) is transient and intentionally not exported. Lives
   in the options page Backup section. Covered by `tests/options.spec.js`.
5. chrome.storage.sync option [S]. OPEN. Sync per-site levels across the user's
   signed-in Chrome instances. Watch the sync quota (small); keep local as the source
   of truth and mirror to sync, or make it a toggle.
6. Zero-flash hardening [M]. PARTLY ADDRESSED via the content-script re-assert (see the
   content.js entry) - that is what actually fixed cnn.com, where the flash was the site
   RE-RENDERING and dropping the inline zoom, not just a slow first read. The SW
   pre-inject idea (insertCSS `:root{zoom:N}` at navigation) was TRIED AND REVERTED: a
   left-behind stylesheet outlives a later reset to 100% (inline cleared -> the stale
   `:root{zoom:1.5}` rule re-emerges -> page stuck at 150%), and removing it races the
   page lifecycle; the inline (`executeScript`) variant instead fights the content script
   and re-applies stale values after a live change. Two independent async actors driving
   the same zoom + the "100% == cleared inline" convention = races. If revisited, do it
   as a content.js-owned stylesheet (so one actor owns it) or change how 100% is
   represented (explicit `zoom:1` to override, with behavioral tests). For now a stored
   zoom applies at document_start and the re-assert keeps it stable, which is flash-free
   on normal sites and stable on re-rendering ones.
7. Tests [M]. DONE (harness). Playwright + Chromium suite loads the unpacked extension
   and asserts real behavior (CSS-zoom reflow via getBoundingClientRect, browser zoom
   disabled as the no-bubble proxy, live updates, reset, AutoFit, options,
   import/export). `npm run lint` is now a Chrome-aware static check. Still worth
   adding over time: incognito + restart persistence (buglist regression-watch), and a
   site-compat smoke set.

### Newly surfaced (from real-world ZPWE feedback)

See `docs/chrome-web-store-buglist.md` for a triaged list of issues reported against
the original Zoom Page WE. Status of the highest-signal candidates for this rewrite:

- Per-site exclude + pause [DONE]. Split into two flags: Exclude (`x:`, never zoom -
  durable, the blocklist) and Pause (`p:`, suspend for now - transient, e.g. a layout
  broke). Either holds the site at 100%, no-ops the keyboard/commands, shows the "off"
  badge, and restores native browser zoom (`"automatic"`) - the workaround for sites that
  misbehave under zoom (buglist #3 chatgpt.com, #14). The popup has Pause + Exclude
  toggles; the options site manager splits into an Active list and an Excluded list and
  surfaces exclude-only / paused sites for management (Pause/Resume, Exclude/Include,
  Remove clears `z:`/`x:`/`p:`). Exclude is carried in JSON export/import (the
  `excluded` array); pause is transient and not exported. Covered by
  `tests/exclude.spec.js`, `tests/pause.spec.js`, `tests/options.spec.js` - DONE.
- Content drifts sideways under zoom [DONE]. Sites with full-bleed `100vw`/`min-width:100vw`
  wrappers (e.g. washingtonpost.com) push their centered content off to the side and clip it
  as you zoom in, because Chromium resolves `vw` against the un-zoomed viewport under CSS
  `zoom`. Fixed by the per-site Re-center toggle (`rc:<host>`), which translates the offending
  wrapper back to center. Covered by `tests/recenter.spec.js` (with the `/drift` fixture).
- CSS-zoom site-compat bugs (e.g. cursor hit-offset at non-100% zoom on map/overlay
  UIs) - OPEN.
- A durable persistence regression test (incognito + restart + new tab) - OPEN.

## 10. Manual test checklist

- Load unpacked from `extension/`. Confirm the toolbar icon and badge appear.
- On washingtonpost.com, set 150% via the popup. Confirm the page reflows to 150% and
  NO native zoom bubble appears.
- Reload the page. Confirm 150% applies on first paint with no visible 100% frame.
- Open a different site (for example github.com). Confirm it is independent at 100%.
- Set github.com to 90%, switch back to WaPo, confirm WaPo is still 150% and the badge
  tracks the active tab.
- Use Alt+Shift+Up / Down / 0 on a normal page. Confirm step in/out and reset, badge
  updates, no bubble.
- Use Ctrl +, Ctrl -, and Ctrl 0 on a normal page. Confirm step in/out and reset, badge
  updates, and NO native zoom bubble appears (these drive the CSS zoom, not browser
  zoom). Try the numpad +/-/0 too.
- Navigate to chrome://settings. Confirm no errors in the service worker console and
  the action simply does nothing harmful.
- Set a site back to 100% and confirm its storage key is removed (check via the popup
  showing 100% and, if you want, `chrome.storage.local.get(null)` in the SW console).
- Click "Fit width" in the popup. On a too-wide page it shrinks to fit; on a
  letterboxed site (e.g. washingtonpost.com on a wide window) it ENLARGES so the content
  column fills the window (~125-150%); on a fluid edge-to-edge site it stays put and
  shows "Already fits the width". Confirm the percent/badge update accordingly.
- On a zoomed site, open the popup and check "Disable here". Confirm the page drops to
  100%, the popup shows "Off" with dimmed controls, and the badge shows "off". Confirm
  native Ctrl +/- now do Chrome's own zoom (its bubble appearing is expected) while the
  extension's Alt+Shift commands do nothing. Uncheck it and confirm the previous
  zoom level returns. Reload the page and confirm it stays paused until you re-enable.
- Open Options (popup footer). Set the default zoom to 125%, then open a site you have
  never customized. Confirm it renders at 125%. Set that site explicitly to a different
  level and confirm it overrides the default; remove it and confirm it follows the
  default again.
- In Options, confirm the saved-sites list shows your customized sites, that editing a
  level updates the page live, and that Remove deletes the entry.
- In Options, Export JSON and confirm a backup file downloads. Clear a site, then
  Import the file (try both with and without "Replace existing") and confirm levels
  are restored.

Automated coverage: `npm test` exercises the core guarantees, AutoFit, the default
fallback, and import/export. The two things it cannot reach are the native zoom bubble
itself (browser chrome, not in the DOM; the suite asserts browser-zoom-disabled as the
proxy) and global keyboard-shortcut dispatch (chrome.commands cannot be triggered from
Playwright; the popup button drives the same AutoFit path). Verify those two by hand.

## 11. Dev workflow

- Load unpacked: `chrome://extensions` > Developer mode on > Load unpacked >
  select the `extension/` folder.
- After editing `background.js` or `manifest.json`: click the reload icon on the
  extension card. After editing `content.js`: reload the extension, then reload the
  page. After editing popup files: just reopen the popup.
- Service worker logs: `chrome://extensions` > this extension > "service worker" link
  opens its devtools console.
- Content script logs: the normal page devtools console.
- Optional tooling (recommended): `web-ext` for linting and a clean run profile. See
  `package.json` scripts. Run `npm install` first. `web-ext` is dev-only and is the
  standard Mozilla extension tool; it works for Chromium targets too.

## 12. Licensing

The code here is an independent reimplementation. It was not copied from ZPWE source;
the design was derived from the observed behavior and the public Chrome APIs. It is
shipped under MIT (see LICENSE), copyright Throughline Technical Services LLC.

Note, not legal advice: Zoom Page WE is GPLv2. If you later copy any ZPWE source into
this repo (for example, lifting its AutoFit math), the combined work would need to be
distributed under GPLv2. If you want to keep MIT, reimplement from behavior rather than
pasting GPL code. The ZPWE source is included in this repo only as a read-only reference
under `reference/` (if you added it); do not merge it into `extension/`.

## 13. Reference material to attach

Alongside this repo, attach the original Zoom Page WE source as read-only reference for
the agent. The author has it installed; see the repo README section "Capturing the ZPWE
reference" for the exact extraction steps. Recommended placement: a top-level
`reference/zoom-page-we/` directory, git-ignored or clearly marked, kept out of
`extension/`.
