# Chrome Web Store listing - Zoom Page TL

Everything to paste into the Developer Dashboard for the v1.0.0 submission. Decisions:
Category = Accessibility, Visibility = Public, Version = 1.0.0.

---

## Product details

**Name**

```
Zoom Page TL
```

**Summary / short description** (max 132 chars)

```
Per-site full-page zoom that sticks - with no native zoom popup. Fast, fully local, no tracking. Set a zoom level per website.
```

**Category:** Accessibility
**Language:** English (United States)

**Detailed description**

```
Zoom Page TL gives every website its own zoom level - and remembers it. Set a site to
150% once and it loads at 150% every time, applied before the page even paints. No more
re-zooming the same sites over and over.

It also gets rid of Chrome's native zoom popup. The little "100% / - / +" bubble that
flashes in the address bar on every zoom change never appears, because Zoom Page TL uses
real CSS page zoom and keeps the browser's own zoom out of the way.

FEATURES

- Per-site zoom, remembered by website. Different levels for different sites.
- A live zoom slider - drag and the page zooms as you go, with soft detents at the
  common levels (100%, 125%, 150%...) that you can slide right past.
- Type an exact percentage, or nudge by 1% with the arrow keys.
- Fit-to-width: size a page to your window in one click. Optional Auto mode re-fits a
  site every time it loads.
- Keyboard shortcuts: the familiar Ctrl + / - / 0 keep working (no zoom bubble), plus
  rebindable Alt+Shift shortcuts.
- A global default zoom for sites you have not customized.
- Pause or Exclude any site that misbehaves under zoom - it hands control back to the
  browser for that site.
- Re-center: an opt-in per-site fix for sites whose content drifts sideways when you
  zoom in.
- Import / export your settings as a JSON backup.

PRIVATE BY DESIGN

Zoom Page TL collects nothing and sends nothing anywhere. All of your settings are
stored locally in your browser. There is no account, no analytics, no tracking, and no
remote server - the extension makes no network requests at all. It only reads the
current tab's hostname (like "example.com") so it can apply the level you chose for that
site; it never reads or transmits page content.

Open source (MIT) at https://github.com/ThroughlineTech/zoom-page-tl

Zoom Page TL is an independent reimplementation, in spirit, of the unmaintained "Zoom
Page WE", focused on the one feature most people used: fast, per-site full-page zoom.
```

**Single purpose** (required field)

```
Zoom Page TL applies and remembers a per-site full-page zoom level, using CSS zoom so
Chrome's native zoom popup never appears.
```

---

## Privacy practices tab

**Permission justifications** (one box per permission)

- `storage`
  ```
  Saves the user's per-site zoom levels and preferences (default zoom, paused/excluded/
  auto-fit/re-center flags, slider range) locally on the device. Nothing is transmitted.
  ```

- `tabs`
  ```
  Reads the active tab's URL/hostname so the correct per-site zoom can be applied, and
  disables Chrome's native browser zoom on each tab (this is what prevents the native
  zoom popup from appearing). No browsing history is collected or sent.
  ```

- Host permissions (`<all_urls>`)
  ```
  Per-site zoom can apply to any website the user chooses to customize, so the extension
  cannot know in advance which sites it will be used on. Its content script runs only in
  the top frame and only sets a CSS zoom value; it does not read, store, or transmit
  page content.
  ```

**Remote code:** No, the extension does not use remote code. All code is in the package.

**Data usage** - check the boxes to certify all three (all true):
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Data collection disclosure:** Do NOT check any data-type category (no personally
identifiable info, health, financial, authentication, personal communications, location,
web history, user activity, or website content is collected or transmitted). All
preference data stays on the device via chrome.storage.local.

**Privacy policy URL**

```
https://github.com/ThroughlineTech/zoom-page-tl/blob/main/PRIVACY.md
```

---

## Graphic assets

- **Store icon:** 128x128 - already in the package (`icons/icon128.png`).
- **Screenshots** (need at least 1; up to 5; 1280x800 or 640x400) - in `store/screenshots/`:
  - `01-popup.png` - the popup (slider, presets, controls)
  - `02-options.png` - the Options page (default zoom, slider range, saved sites)
  - `03-zoomed.png` - a real article shown zoomed (the effect)
  These are functional captures; swap in polished marketing shots later if desired.
- **Promo tile (optional, 440x280):** not included; optional for better placement.

---

## Package

- Upload `dist/zoom_page_tl-1.0.0.zip` (built by `npm run build`).
- The manifest is at the TOP LEVEL of the zip (verified) - do not re-zip it into a
  subfolder.

## Submission steps (dashboard)

1. chromewebstore.google.com/devconsole -> New item -> upload `dist/zoom_page_tl-1.0.0.zip`.
2. Store listing tab: paste Name, Summary, Detailed description, Single purpose; set
   Category = Accessibility, Language = English (US); upload the 3 screenshots and the
   128x128 icon if prompted.
3. Privacy practices tab: paste the three permission justifications, answer "No" to
   remote code, check the three data-usage certifications, leave all data-type categories
   unchecked, paste the Privacy policy URL.
4. Distribution: Visibility = Public; choose regions (All regions is fine).
5. Submit for review. (Review can take hours to ~2 weeks; <all_urls> may draw a closer
   look - the justifications above cover it.)

Note: the Privacy policy URL must be live before you submit, so push PRIVACY.md to the
public repo first (it is at the repo root).
