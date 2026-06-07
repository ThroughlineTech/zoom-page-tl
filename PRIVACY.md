# Privacy Policy - Zoom Page TL

_Last updated: 2026-06-06_

Zoom Page TL is a Chrome extension that applies per-site full-page zoom. This policy
explains what it does and does not do with your data. The short version: it collects
nothing and sends nothing anywhere.

## What data the extension stores

The extension stores your zoom preferences locally on your own device using the
browser's `chrome.storage.local` API. This includes:

- Per-site zoom levels (for example, "150% on example.com"), keyed by hostname.
- A global default zoom level.
- Per-site flags you set yourself: paused, excluded, auto-fit, and re-center.
- The zoom slider's min/max range.

That is the complete list. The data never leaves your device.

## What the extension does NOT do

- It does **not** collect, transmit, sell, or share any personal or browsing data.
- It does **not** use analytics, tracking, advertising, or telemetry of any kind.
- It does **not** contact any remote server. It has no backend and makes no network
  requests.
- It does **not** read, store, or transmit the content of the pages you visit. It only
  reads the current tab's hostname (e.g. `example.com`) so it can apply the zoom level
  you chose for that site.
- It does **not** include any remote or hosted code. All code is contained in the
  extension package and runs locally.

## Why the extension requests its permissions

- **storage** - to save your zoom preferences locally, as described above.
- **tabs** - to read the active tab's URL/hostname so zoom can be applied per site, and
  to keep Chrome's native browser zoom disabled per tab (which is what prevents the
  native zoom popup from appearing).
- **host access (all sites)** - per-site zoom can apply to any website you choose to
  customize, so the extension cannot know in advance which sites you will use it on. The
  content script that applies zoom runs only in the top frame and only sets a CSS `zoom`
  value; it does not read or exfiltrate page content.

## Data retention and deletion

Because all data is stored locally, you are always in control of it:

- Remove a single site's settings from the extension's Options page (the "Remove"
  button), or set a site back to 100%.
- Use the Options page's Export/Import to back up or move your settings.
- Removing/uninstalling the extension deletes all of its locally stored data.

## Changes to this policy

If this policy changes, the updated version will be posted in the project's public
repository at https://github.com/ThroughlineTech/zoom-page-tl with a new "Last updated"
date.

## Contact

Questions about this policy or the extension can be raised as an issue at
https://github.com/ThroughlineTech/zoom-page-tl/issues
