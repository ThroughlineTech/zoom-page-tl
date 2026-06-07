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
- Drag the zoom slider (top of the popup) to zoom the page live - it reflows as you
  drag, with soft detents at the common levels (100%, 125%, 150%, ...) that you can
  slide right past. A drag is coarse by design; for an exact value, click the percent
  to type it, focus the slider and use the arrow keys (+/-1%), or hold Ctrl/Shift and
  scroll the mouse wheel over the slider. The slider runs 5% to 400% by default; set
  your own range in Options.
- The popup's "Fit" button AutoFits the zoom to the window: it shrinks a page that is too
  wide, or enlarges a site whose content sits in a narrow centered column (filling the
  empty side margins). If the page already spans the window it says so. "Fit" is a
  one-shot: it sets a fixed zoom for the site, which then stays put on every page (no
  re-fitting or bouncing). Click "Fit" again to re-measure - for example on a different
  page layout, or a site that was still loading the first time.
- "Auto" (next to Fit) is an opt-in per-site toggle: turn it on and the site re-fits
  automatically on every page load (and on window resize), which is handy for sites whose
  layout shifts as they load. While Auto is on, the manual zoom numbers grey out because
  the zoom is being managed for you; any manual zoom (or clicking "Fit") turns Auto back
  off and locks the level. You can also toggle Auto per site in Options.
- Keyboard: `Ctrl +` zoom in, `Ctrl -` zoom out, `Ctrl 0` reset (the familiar zoom
  keys keep working - they drive this extension's per-site zoom, with no zoom bubble).
  `Alt+Shift+Up / Down / 0` do the same and are rebindable at
  `chrome://extensions/shortcuts`; AutoFit and the global on/off both have commands
  there with no default key (bind them yourself if you want a hotkey).
- "Re-center when zoomed" (popup, also a per-site "Center" button in Options) is an
  opt-in fix for sites whose content slides off to the side and gets clipped as you zoom
  in - some sites size their page wrappers to the full window in a way the browser does
  not shrink under zoom, so the article ends up half off-screen. Turn this on for such a
  site and the content is shifted back to center. It is per-site and only acts while
  zoomed; leave it off for sites that already behave.
- "Pause" and "Exclude" (popup footer) both step the extension aside on the current
  site: it holds the page at 100% and hands zoom back to Chrome, so the normal native
  Ctrl +/- (and its zoom bubble) work again, and the badge shows "off". Pause is
  temporary (suspend for now - say a layout update broke - then resume later); Exclude
  means never zoom this site. Your saved level is kept either way. Use them for sites
  that misbehave under zoom.
- Master on/off switch (top of the popup) turns the whole extension off on every site
  at once - a global play/pause. While off, every page sits at 100%, native zoom comes
  back everywhere, and the toolbar icon greys out; flip it back on and every site returns
  to exactly its prior zoom. There is also a bindable "toggle on/off everywhere" hotkey
  at `chrome://extensions/shortcuts`.
- The toolbar badge shows the current site's zoom percent.
- "Options" (popup footer, or the extension's options page) lets you set a global
  default zoom for new sites, set the zoom slider's range (min/max), and manage every
  saved site in two lists: Active (edit its level, pause/resume it, or exclude it) and
  Excluded (include it again, or remove it). Export/import your levels and exclude list
  as JSON. Sites you paused or excluded from the popup show up here too, so you can
  manage them without revisiting the page.

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
    content.js              document_start: applies CSS zoom from storage, AutoFit measure, re-center
    zoom.js                 shared helpers: zoom ladder + slider log-map/snap (popup, options, content)
    popup.html
    popup.js
    options.html            options page: default zoom, site manager, import/export
    options.js
    icons/                  color toolbar icons + icons/off/ (greyed, used while off)
  scripts/
    check.js                Chrome-targeted static check (replaces web-ext lint)
    make-off-icons.js       one-off: generate the greyed icons/off/ set from the color icons
  tests/
    fixtures.js             Playwright fixture: loads the unpacked extension
    server.js               local static server (real localhost hostname)
    core.spec.js            zoom apply, no-bubble proxy, live update, reset
    autofit.spec.js         AutoFit measure/clamp/persist
    slider.spec.js          slider log-map/snap math, live preview, settable extents
    recenter.spec.js        re-center drifting layouts under zoom (the /drift fixture)
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
