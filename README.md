# Zoom Page TL

A small Manifest V3 Chrome extension for per-site full-page zoom that never triggers
Chrome's native zoom bubble. It applies zoom with the CSS `zoom` property and keeps
browser zoom disabled so the omnibox indicator can never appear.

Independent rewrite, in spirit, of "Zoom Page WE" by DW-dev, scoped to per-site full
zoom only. Version 1.1.0, packaged for the Chrome Web Store. Contributors and coding
agents start at [AGENTS.md](AGENTS.md); current behavior is documented in
[docs/state-of-the-system/](docs/state-of-the-system/00-README.md).

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
- Keyboard: `Ctrl +` zoom in, `Ctrl -` zoom out, `Ctrl 0` reset to 100% (the familiar
  zoom keys keep working - they drive this extension's per-site zoom, with no zoom
  bubble). Every page shortcut is configurable in Options > Keyboard shortcuts: turn
  the extension on/off everywhere, zoom in, zoom out, reset to 100%, back to the default
  zoom, Fit and Auto. Click a shortcut and press any chord (for example Ctrl+Alt+[);
  each can be switched off, no two can be the same, keys Chrome keeps for itself (like
  Ctrl+T) are refused, and keys Chrome uses but lets a page take over (like Ctrl+F) are
  allowed with a warning. Page shortcuts work on web pages but not on chrome:// pages,
  the Web Store or the PDF viewer. For those, `Alt+Shift+Up / Down / 0` and the
  AutoFit and on/off commands are Chrome-level shortcuts, rebindable at
  `chrome://extensions/shortcuts` (the last two have no default key).
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
  default zoom for new sites (a site set to that same level follows the default; any
  other level, including 100%, stays fixed for that site), set the zoom slider's range
  (min/max), configure keyboard shortcuts, and manage every
  saved site in two lists: Active (edit its level, pause/resume it, or exclude it) and
  Excluded (include it again, or remove it). Export/import your levels, exclude list and
  shortcuts as JSON. Sites you paused or excluded from the popup show up here too, so you can
  manage them without revisiting the page.

## Layout

```
zoom-page-tl/
  README.md                 this file
  AGENTS.md                 working rules for coding agents (CLAUDE.md points here)
  PRIVACY.md                privacy policy (linked from the store listing)
  LICENSE                   MIT
  package.json              tooling: lint, test, dev browser, web-ext run/build
  playwright.config.js      Playwright config (serial, one worker, local test server)
  extension/                the loadable extension (point "Load unpacked" here)
    manifest.json
    background.js           service worker: bubble suppression, badge, commands, master switch
    content.js              document_start: applies CSS zoom, Ctrl +/-/0, AutoFit, re-center, re-assert
    zoom.js                 shared helpers: zoom ladder + slider log-map/snap (popup, options, content)
    popup.html / popup.js   toolbar popup
    options.html / options.js  options page: default zoom, slider range, site manager, import/export
    icons/                  color toolbar icons + icons/off/ (greyed, used while off everywhere)
  scripts/
    check.js                Chrome-targeted static check (npm run lint)
    dev-browser.js          live dev browser with hot reload (npm run dev)
    dev-reload.js           force a hot reload of the dev browser (npm run reload)
    dev-shot.js             screenshot a URL in the dev browser (npm run shot)
    dev-lib.js              shared launch flags and hot-reload routine
    make-off-icons.js       one-off: generate icons/off/ from the color icons
  tests/                    Playwright suite: fixtures.js, server.js, one spec per feature
  store/                    Chrome Web Store listing text and screenshots
  docs/
    state-of-the-system/    code-true reference for the current implementation
    roadmap.md              backlog, and old-app features ported or declined
    zpwe-feedback-triage.md triaged real-world reports against Zoom Page WE
    chrome-zoom-api-reference.md  Chrome zoom/tabs/commands API notes
  reference/                (optional, git-ignored) original ZPWE source, read-only
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
npm run dev          # headed dev Chromium with the extension, hot-reloads on save
npm run reload       # force a hot reload of the running dev browser
npm run shot -- URL  # screenshot URL in the dev browser (.dev-shots/shot.png)
npm start            # web-ext run -t chromium with a clean profile
npm run build        # web-ext build -> dist/zoom_page_tl-<version>.zip
```

First run only: `npx playwright install chromium` (downloads the browser the tests
drive). The suite loads the unpacked extension in Chromium's new headless mode and
asserts real behavior: that CSS zoom reflows the page, that browser zoom stays
disabled (the observable proxy for "no native zoom bubble"), AutoFit math, and the
options/import-export flows. Do not run it while `npm run dev` is up; the headed
browser starves the runner and tests flake.

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
source; reimplement from behavior instead (see AGENTS.md, "Invariants").
