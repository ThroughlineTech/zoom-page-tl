# Chrome zoom API reference (project notes)

Condensed, project-relevant notes so the agent does not have to re-research. Primary
sources linked at the bottom.

## The native zoom bubble

Chrome shows its zoom indicator in the omnibox whenever a tab's zoom factor changes via
`chrome.tabs.setZoom` while zoom settings are in `automatic` mode (the default). There
is no API to hide that bubble. Therefore the only way to zoom without the bubble is to
not use browser zoom at all.

## chrome.tabs.setZoom(tabId?, zoomFactor) => Promise<void>

Sets the browser zoom factor for a tab. Triggers the bubble in automatic mode. This
project does NOT use it.

## chrome.tabs.setZoomSettings(tabId?, zoomSettings) => Promise<void>

`zoomSettings.mode`:
- `automatic`: browser handles zoom, persists per origin, shows the bubble on change.
- `manual`: extension handles zoom via `tabs.onZoomChange`; per-tab only; still goes
  through the browser zoom mechanism.
- `disabled`: all zooming disabled; tab reverts to default (100%); zoom changes ignored.
  No bubble can appear. This project uses `disabled`.

`zoomSettings.scope`: `per-origin` (automatic only) or `per-tab`. Not relevant when
mode is disabled.

Critical lifecycle detail: zoom settings reset to defaults on navigation. You must
reapply `disabled` on every navigation. This project reapplies in `tabs.onUpdated`
(status loading) and `tabs.onActivated`.

Permissions: the zoom methods require host access to the target tab. This project
declares `host_permissions: ["<all_urls>"]`. Calls against restricted pages reject and
are swallowed.

## CSS `zoom`

In Chromium, `zoom` is a real layout zoom: it reflows content like browser zoom rather
than scaling pixels like `transform: scale`. Consequences:
- No horizontal-scrollbar or width-compensation hacks.
- Fixed and sticky positioning behave correctly.
- Responsive breakpoints react as they would under browser zoom.
Applied on `document.documentElement` to zoom the whole page. The property is now part
of the CSS spec and supported in modern browsers; this project targets Chromium.

Contrast with `transform: scale(n)`: visual only, no reflow, needs `transform-origin`
and inverse-width hacks, breaks fixed positioning. Do not use it for full-page zoom.

## Content scripts at document_start

Run before the DOM is constructed, but `document.documentElement` already exists, so an
`html` style can be set immediately. This is what makes zoom apply before first paint.

## Manifest V3 service worker

Ephemeral and event-driven. No durable in-memory state; re-read from `chrome.storage`
on each event. Keep the hot path (applying a known per-site zoom) inside the content
script so it does not depend on the worker being alive.

## Keyboard commands

Chrome reserves `Ctrl` with `+`, `-`, and `0` for browser zoom; extensions cannot bind
them. This project uses `Alt+Shift+Up / Down / 0`, rebindable at
`chrome://extensions/shortcuts`.

## Sources

- chrome.tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- tabs.ZoomSettingsMode (MDN):
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/ZoomSettingsMode
- tabs.setZoomSettings (MDN):
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/setZoomSettings
- Manifest V3 service workers:
  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- Commands API: https://developer.chrome.com/docs/extensions/reference/api/commands
