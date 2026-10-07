# 03 - Storage and state

All runtime state lives in `chrome.storage.local`. There is no `storage.sync`, no IndexedDB, no cookies, no files and no network persistence. Values are plain JSON (numbers or `true`).

## Keys

| Key | Value | Meaning | Absent means |
| --- | --- | --- | --- |
| `z:<hostname>` | number (factor; 1.5 = 150%) | The site's fixed zoom level. | Follow `cfg:defaultZoom`, else 100%. |
| `cfg:defaultZoom` | number | Global default for sites with no `z:` key. | 100%. |
| `cfg:off` | `true` | Master switch: extension off on every site. | On. |
| `x:<hostname>` | `true` | Excluded: never zoom this site (durable). | Not excluded. |
| `p:<hostname>` | `true` | Paused: suspended for now (transient by intent). | Not paused. |
| `af:<hostname>` | `true` | Explicit Auto mode: re-fit on every load and resize. | Fixed level. |
| `rc:<hostname>` | `true` | Re-center content that drifts sideways under zoom. | Off. |
| `cfg:zoomMin` | number | Popup slider low extent. | 0.05 (5%), `extension/zoom.js:45`. |
| `cfg:zoomMax` | number | Popup slider high extent. | 4.0 (400%), `extension/zoom.js:46`. |
| `cfg:keys` | object `{ <action>: { on, chord } }` | Page keyboard shortcuts ([04](04-content-script.md)). Normalized on every read by `normalizeShortcuts` (`extension/zoom.js:205-223`). | Defaults: Ctrl +/-/0 on, others unset (`extension/zoom.js:118-126`). |

`<hostname>` is `location.hostname` in the content script (`extension/content.js:15`) and `new URL(tab.url).hostname` in the worker and popup (`extension/background.js:29-35`, `extension/popup.js:421`). The `z:` prefix is produced by `hostKey()` in the popup and options (`extension/zoom.js:13-15`) and inlined elsewhere (`extension/content.js:17`, `extension/background.js:60`).

## Conventions

- **The default is absence.** A site's level is stored only when it differs from the global default; a level equal to `cfg:defaultZoom` (or 100% when there is none) removes `z:<host>`, and the site follows the default. Every writer applies the same rule with `sameFactor` (`extension/zoom.js:93-95`): content shortcuts (`extension/content.js:412-424`), AutoFit (`:358-365`), worker commands (`extension/background.js:67-81`), popup (`extension/popup.js:142-160`), options `setSite` and `importData` (`extension/options.js:93-102`, `:283-297`). So a site can be pinned at 100% while the default is something else, and "Reset" (100%) and "Back to the default" are different actions. `cfg:defaultZoom` itself, and the slider extents, are stored as absence at their own defaults (`extension/options.js:48-55`, `:78-87`). Until 2026-10-07 the rule was "100% is absence", which made 100% unpinnable under a non-100% default; existing stored data is compatible.
- **Factor resolution.** `z:<host>` if present, else `cfg:defaultZoom`, else 1.0, in the content script (`extension/content.js:63-67`) and the worker (`extension/background.js:58-65`). The popup resolves the same way (`extension/popup.js:443-451`).
- **Suppression hierarchy.** `cfg:off` OR `x:<host>` OR `p:<host>` holds the page at 100%, ignoring `z:` and the default (`extension/content.js:85-91`), hands browser zoom back (`extension/background.js:89-97`, `:111`), shows the gray "off" badge (`:119-123`), disables keyboard and commands (`extension/content.js:456`, `extension/background.js:215`), and makes `af:`/`rc:` inert (`extension/content.js:87-88`). Per-site keys are never modified by suppression, so clearing a flag restores the prior state.
- **Exclude supersedes Pause.** Setting `x:` also removes `p:` (`extension/popup.js:303-306`, `extension/options.js:109-111`).
- **Manual zoom leaves Auto.** Every manual write removes `af:<host>`: keyboard shortcuts (`extension/content.js:417`, and "Back to the default" `:433-435`), commands (`extension/background.js:237`), popup `persist` and Fit (`extension/popup.js:145-146`, `:348-349`). An options level edit does not need to, because the level field is disabled while Auto is on (`extension/options.js:390`).
- **Clamps.** Stored factors are clamped to `[0.05, 5.0]` (`extension/zoom.js:50-51`; `extension/content.js:25-26`, `:130-134`; `extension/options.js:11-12`, `:27-31`). The popup additionally clamps to the current slider extents (`extension/popup.js:51-53`). The keyboard ladder spans 0.25 to 5.0 (`extension/zoom.js:7-11`).

## Writer / reader matrix

| Key | Written by | Read by |
| --- | --- | --- |
| `z:` | content shortcuts, AutoFit; worker commands; popup; options level edit, import, remove | content, worker (badge, step base), popup, options |
| `cfg:defaultZoom` | options (field, reset, import) | content, worker, options. Not the popup (see loose ends). |
| `cfg:off` | popup power switch (`extension/popup.js:265-273`); `toggle-global` command (`extension/background.js:202-209`) | content, worker, popup |
| `x:` | popup Exclude; options Exclude/Include, import, remove | content, worker, popup, options |
| `p:` | popup Pause; options Pause/Resume, remove | content, worker, popup, options |
| `af:` | popup Auto/Fit/manual; options Auto, remove; content and worker on manual zoom | content, popup, options |
| `rc:` | popup Re-center; options Center, remove | content, popup, options |
| `cfg:zoomMin`/`Max` | options range fields and reset (`extension/options.js:656-674`) | popup (`extension/popup.js:426-443`), options |
| `cfg:keys` | options Keyboard shortcuts section and import (`extension/options.js:167-221`) | content (`extension/content.js:84`), popup tooltips (`extension/popup.js:390-408`), options |

## Backup format (export/import)

`exportData()` returns `{ version: 1, defaultZoom, sites: { <host>: factor }, excluded: [<host>], shortcuts? }` (`extension/options.js:255-267`). Only `z:`, `x:`, the default and (when customized) `cfg:keys` are carried. `p:`, `af:`, `rc:`, `cfg:off` and the slider extents are not exported. `importData()` merges by default; with `replace` it first deletes all `z:`, `x:` and `cfg:defaultZoom` keys (`extension/options.js:278-284`), then writes clamped levels, drops invalid entries and entries equal to the default in effect after the import, applies `excluded` as `x:` flags and applies `defaultZoom` and normalized `shortcuts` if present (`:295-327`). `version` is written but never checked on import. The download filename is `zoom-page-tl-backup.json` (`extension/options.js:678`).

## Lifetime and cleanup

- Keys persist until changed, removed through the UI, or the extension is uninstalled. "Remove" in the options page deletes `z:`, `x:`, `p:`, `af:` and `rc:` for a host (`extension/options.js:155-163`).
- No key is time-limited. Pause is "temporary" by intent only; nothing expires it.
- The manifest declares no `incognito` key, so Chrome's default `spanning` mode applies when the user enables the extension in incognito: one storage area is shared, and levels set in incognito persist to the normal profile.
- No migration code exists for key format changes.

## Ephemeral in-memory state

- Content script: `suppressed`, `autoMode`, `desired`, re-center bookkeeping, debounce timers (`extension/content.js:34-50`, `:294`, `:514`). Rebuilt on every page load.
- Popup: current host, factor, flags, extents, drag state (`extension/popup.js:15-26`). Rebuilt on every open.
- Worker: none beyond constants; it re-reads storage on every event (`extension/background.js:58-97`).
- Page DOM side effects: inline `style.zoom` on `<html>`; a `<style id="zp-recenter">` element and, as a fallback, a `data-zp-recenter` attribute on one wrapper (`extension/content.js:173-192`, `:269-274`). Both are cleared when re-center turns off.

## Developer and test state on disk

| Path | Written by | Cleanup |
| --- | --- | --- |
| `.dev-profile/` | dev browser persistent profile (`scripts/dev-lib.js:16`) | Never automatically; holds logins. Git-ignored. |
| `.dev-shots/` | `dev-shot.js` default output (`scripts/dev-shot.js:18-19`); also ad-hoc investigation files | Never automatically. Git-ignored. |
| `test-results/` | Playwright | Overwritten per run. Git-ignored. |
| `dist/` | `npm run build` | `--overwrite-dest`. Git-ignored. |
| Test browser profile | `launchPersistentContext("")` (`tests/fixtures.js:15`) | Temporary directory, discarded per test. |

## Loose ends

- **Replace-import leaves orphan flags.** It clears `z:`, `x:` and the default but not `af:`, `rc:` or `p:` (`extension/options.js:280-282`), so hosts can keep Auto/Center/Pause flags with no level after a replace.
- After the default changes, a site pinned at a level equal to the new default keeps its key (harmless; it renders the same and shows in the site list).
- `af:` and `rc:` are not in the backup format; the roadmap tracks exporting Auto.
- Import does not validate host strings or the `version` field.
- `PRIVACY.md` lists stored data accurately; it does not mention the incognito spanning behavior.
