# Zoom Page TL

A small Manifest V3 Chrome extension for per-site full-page zoom that never triggers
Chrome's native zoom bubble. It applies zoom with the CSS `zoom` property and keeps
browser zoom disabled so the omnibox indicator can never appear.

Independent rewrite, in spirit, of "Zoom Page WE" by DW-dev, scoped to per-site full
zoom only. See `HANDOFF.md` for the full design rationale and the engineering brief.

## Install (development)

1. `chrome://extensions`
2. Enable Developer mode (top right)
3. Load unpacked
4. Select the `extension/` folder in this repo

## Use

- Click the toolbar button to set the zoom level for the current site. The level is
  remembered per hostname.
- "Fit width" in the popup AutoFits the zoom so the page width matches the window.
- Keyboard: `Ctrl +` zoom in, `Ctrl -` zoom out, `Ctrl 0` reset (the familiar zoom
  keys keep working - they drive this extension's per-site zoom, with no zoom bubble).
  `Alt+Shift+Up / Down / 0` do the same and are rebindable at
  `chrome://extensions/shortcuts`; AutoFit has a command there with no default key.
- "Disable here" (popup footer) pauses zooming on the current site: the extension steps
  aside and hands zoom back to Chrome, so the normal native Ctrl +/- (and its zoom
  bubble) work again. Your saved level is kept for when you re-enable. Use it for sites
  that misbehave under zoom. The badge shows "off" while paused.
- The toolbar badge shows the current site's zoom percent.
- "Options" (popup footer, or the extension's options page) lets you set a global
  default zoom for new sites, manage every saved site, and import/export your
  levels as JSON.

## Layout

```
zoom-page-tl/
  README.md                 this file
  HANDOFF.md                full engineering brief (read this first to develop)
  LICENSE                   MIT
  package.json              tooling: lint (Chrome check), test (Playwright), web-ext
  playwright.config.js      Playwright config (serial, local test server)
  .gitignore
  extension/                the loadable extension (point "Load unpacked" here)
    manifest.json
    background.js           service worker: bubble suppression, badge, commands, AutoFit
    content.js              document_start: applies CSS zoom from storage, AutoFit measure
    zoom.js                 shared step helpers for popup + options
    popup.html
    popup.js
    options.html            options page: default zoom, site manager, import/export
    options.js
    icons/
  scripts/
    check.js                Chrome-targeted static check (replaces web-ext lint)
  tests/
    fixtures.js             Playwright fixture: loads the unpacked extension
    server.js               local static server (real localhost hostname)
    core.spec.js            zoom apply, no-bubble proxy, live update, reset
    autofit.spec.js         AutoFit measure/clamp/persist
    options.spec.js         default zoom, site manager UI, import/export
  docs/
    chrome-zoom-api-reference.md
  reference/                (optional) original ZPWE source, read-only, see below
```

## How it works (one paragraph)

A `document_start` content script reads the stored zoom factor for the current
hostname and sets `document.documentElement.style.zoom`, so the page renders zoomed on
first paint. The service worker calls
`chrome.tabs.setZoomSettings(tabId, { mode: "disabled" })` on every navigation and tab
switch, which pins browser zoom to 100% and makes Chrome ignore zoom changes, so the
native bubble never fires. The extension never calls `chrome.tabs.setZoom`. Per-site
levels live in `chrome.storage.local` under `z:<hostname>` keys; 100% is stored as the
absence of a key.

## Tooling

```
npm install          # installs dev tooling (Playwright, web-ext)
npm run lint         # Chrome-targeted static check (manifest, JS syntax, assets)
npm test             # Playwright suite: loads the extension, asserts behavior
npm start            # web-ext run -t chromium with a clean profile
npm run build        # web-ext build -> dist/
```

First run only: `npx playwright install chromium` (downloads the browser the tests
drive). The suite loads the unpacked extension in Chromium's new headless mode and
asserts real behavior: that CSS zoom reflows the page, that browser zoom stays
disabled (the observable proxy for "no native zoom bubble"), AutoFit math, and the
options/import-export flows.

Note on `web-ext lint`: it runs Mozilla's addons-linter, which validates against
Firefox and rejects Chrome's MV3 `service_worker` background plus demands a Gecko
id. Those are false positives for a Chromium-only extension, so `npm run lint`
points at a Chrome-aware check instead (`scripts/check.js`).

## Capturing the ZPWE reference (for the coding agent)

The original Zoom Page WE is GPLv2 and unmaintained, with no maintained public repo, so
it cannot be fetched from a package registry. It is, however, already unpacked on disk
wherever it is installed in Chrome. To capture it as read-only reference:

Windows (default profile):

```
%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\bcdjhkphgmiapajkphennjfgoehpodpk\
```

That `bcdjhkphgmiapajkphennjfgoehpodpk` folder is the Chrome extension ID for Zoom Page
WE. Inside it is a version folder (for example `33.5_0`). Zip that version folder and
drop it into this repo at `reference/zoom-page-we/`. For example:

```
C:\Users\fubar\AppData\Local\Google\Chrome\User Data\Default\Extensions\bcdjhkphgmiapajkphennjfgoehpodpk\33.5_0\
```

If you use a non-default Chrome profile, replace `Default` with `Profile 1`,
`Profile 2`, etc. To find the right one, open `chrome://version` and look at the
"Profile Path" line, then go up to `User Data` and into `Extensions`.

Alternative sources if it is not installed:

- Chrome Web Store listing:
  https://chromewebstore.google.com/detail/zoom-page-we/bcdjhkphgmiapajkphennjfgoehpodpk
  Use any reputable CRX downloader to fetch the `.crx`, then rename to `.zip` and
  unzip (a CRX is a zip with a short header; most unzip tools handle it directly).
- Firefox add-on (note: that build is Manifest V2, so it is a weaker reference than the
  Chrome MV3 build for this project):
  https://addons.mozilla.org/en-US/firefox/addon/zoom-page-we/
  The `.xpi` is a plain zip; download and unzip.

Keep the reference out of `extension/` and do not merge GPL code into the MIT-licensed
source. See `HANDOFF.md` section 12.
