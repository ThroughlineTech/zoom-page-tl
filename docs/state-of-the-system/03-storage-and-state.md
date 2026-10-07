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
| `cfg:zoomMin` | number | Popup slider low extent. | 0.05 (5%), `extension/zoom.js:44`. |
| `cfg:zoomMax` | number | Popup slider high extent. | 4.0 (400%), `extension/zoom.js:45`. |

`<hostname>` is `location.hostname` in the content script (`extension/content.js:15`) and `new URL(tab.url).hostname` in the worker and popup (`extension/background.js:29-35`, `extension/popup.js:398`). The `z:` prefix is produced by `hostKey()` in the popup and options (`extension/zoom.js:12-14`) and inlined elsewhere (`extension/content.js:17`, `extension/background.js:60`).

## Conventions

- **100% is absence.** Every writer removes the key instead of storing 1.0: content keyboard (`extension/content.js:393-397`), AutoFit (`:345-349`), worker commands (`extension/background.js:67-75`), popup (`extension/popup.js:146-150`), options `setSite`/`setDefault`/`setBounds`/`importData` (`extension/options.js:45-52`, `:71-86`, `:88-97`, `:224-246`). Defaults for the slider extents are likewise stored as absence (`extension/options.js:75-84`).
- **Factor resolution.** `z:<host>` if present, else `cfg:defaultZoom`, else 1.0, in the content script (`extension/content.js:60-64`) and the worker (`extension/background.js:58-65`). Consequence: with a non-100% default, a site cannot be pinned to 100% by key, because 100% deletes the key and the site then follows the default. The options hint text acknowledges this (`extension/options.html:124-127`).
- **Suppression hierarchy.** `cfg:off` OR `x:<host>` OR `p:<host>` holds the page at 100%, ignoring `z:` and the default (`extension/content.js:72-78`), hands browser zoom back (`extension/background.js:84-92`, `:106`), shows the gray "off" badge (`:114-118`), disables keyboard and commands (`extension/content.js:411`, `extension/background.js:210`), and makes `af:`/`rc:` inert (`extension/content.js:74-75`). Per-site keys are never modified by suppression, so clearing a flag restores the prior state.
- **Exclude supersedes Pause.** Setting `x:` also removes `p:` (`extension/popup.js:300-303`, `extension/options.js:104-106`).
- **Manual zoom leaves Auto.** Every manual write removes `af:<host>`: keyboard (`extension/content.js:392`), commands (`extension/background.js:232`), popup `persist` and Fit (`extension/popup.js:144-145`, `:345-346`). An options level edit does not need to, because the level field is disabled while Auto is on (`extension/options.js:310`).
- **Clamps.** Stored factors are clamped to `[0.05, 5.0]` (`extension/zoom.js:49-50`; `extension/content.js:25-26`, `:116-120`; `extension/options.js:10-11`, `:24-28`). The popup additionally clamps to the current slider extents (`extension/popup.js:50-52`). The keyboard ladder spans 0.25 to 5.0 (`extension/zoom.js:6-10`).

## Writer / reader matrix

| Key | Written by | Read by |
| --- | --- | --- |
| `z:` | content keyboard, AutoFit; worker commands; popup; options level edit, import, remove | content, worker (badge, step base), popup, options |
| `cfg:defaultZoom` | options (field, reset, import) | content, worker, options. Not the popup (see loose ends). |
| `cfg:off` | popup power switch (`extension/popup.js:262-270`); `toggle-global` command (`extension/background.js:197-204`) | content, worker, popup |
| `x:` | popup Exclude; options Exclude/Include, import, remove | content, worker, popup, options |
| `p:` | popup Pause; options Pause/Resume, remove | content, worker, popup, options |
| `af:` | popup Auto/Fit/manual; options Auto, remove; content and worker on manual zoom | content, popup, options |
| `rc:` | popup Re-center; options Center, remove | content, popup, options |
| `cfg:zoomMin`/`Max` | options range fields and reset (`extension/options.js:431-449`) | popup (`extension/popup.js:403-420`), options |

## Backup format (export/import)

`exportData()` returns `{ version: 1, defaultZoom, sites: { <host>: factor }, excluded: [<host>] }` (`extension/options.js:192-202`). Only `z:`, `x:` and the default are carried. `p:`, `af:`, `rc:`, `cfg:off` and the slider extents are not exported. `importData()` merges by default; with `replace` it first deletes all `z:`, `x:` and `cfg:defaultZoom` keys (`extension/options.js:213-219`), then writes clamped levels, drops 100%/invalid entries, applies `excluded` as `x:` flags and applies `defaultZoom` if present (`:221-247`). `version` is written but never checked on import. The download filename is `zoom-page-tl-backup.json` (`extension/options.js:453`).

## Lifetime and cleanup

- Keys persist until changed, removed through the UI, or the extension is uninstalled. "Remove" in the options page deletes `z:`, `x:`, `p:`, `af:` and `rc:` for a host (`extension/options.js:150-158`).
- No key is time-limited. Pause is "temporary" by intent only; nothing expires it.
- The manifest declares no `incognito` key, so Chrome's default `spanning` mode applies when the user enables the extension in incognito: one storage area is shared, and levels set in incognito persist to the normal profile.
- No migration code exists for key format changes.

## Ephemeral in-memory state

- Content script: `suppressed`, `autoMode`, `desired`, re-center bookkeeping, debounce timers (`extension/content.js:34-47`, `:280`, `:470`). Rebuilt on every page load.
- Popup: current host, factor, flags, extents, drag state (`extension/popup.js:15-25`). Rebuilt on every open.
- Worker: none beyond constants; it re-reads storage on every event (`extension/background.js:58-92`).
- Page DOM side effects: inline `style.zoom` on `<html>`; a `<style id="zp-recenter">` element and, as a fallback, a `data-zp-recenter` attribute on one wrapper (`extension/content.js:159-178`, `:255-260`). Both are cleared when re-center turns off.

## Developer and test state on disk

| Path | Written by | Cleanup |
| --- | --- | --- |
| `.dev-profile/` | dev browser persistent profile (`scripts/dev-lib.js:16`) | Never automatically; holds logins. Git-ignored. |
| `.dev-shots/` | `dev-shot.js` default output (`scripts/dev-shot.js:18-19`); also ad-hoc investigation files | Never automatically. Git-ignored. |
| `test-results/` | Playwright | Overwritten per run. Git-ignored. |
| `dist/` | `npm run build` | `--overwrite-dest`. Git-ignored. |
| Test browser profile | `launchPersistentContext("")` (`tests/fixtures.js:15`) | Temporary directory, discarded per test. |

## Loose ends

- **Popup ignores the global default.** The popup initializes `currentFactor = res[z:<host>] || 1.0` (`extension/popup.js:422`) and never reads `cfg:defaultZoom`. On an un-customized site with a 125% default, the page and badge show 125% but the popup shows 100%, and its stepper steps from 100% (to 110%) rather than from 125%. The worker's equivalent path is default-aware (`extension/background.js:58-65`). Status: Broken (minor).
- **Replace-import leaves orphan flags.** It clears `z:`, `x:` and the default but not `af:`, `rc:` or `p:` (`extension/options.js:215-217`), so hosts can keep Auto/Center/Pause flags with no level after a replace.
- `af:` and `rc:` are not in the backup format; the roadmap tracks exporting Auto.
- Import does not validate host strings or the `version` field.
- `PRIVACY.md` lists stored data accurately; it does not mention the incognito spanning behavior.
