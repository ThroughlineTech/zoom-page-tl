# 05 - Service worker (`extension/background.js`)

Declared as the MV3 background `service_worker` (`extension/manifest.json:8-10`). It is ephemeral: it holds only constants and re-reads storage on every event (`extension/background.js:58-92`). Its two jobs are stated in its header (`:1-9`): keep browser zoom suppressed (or handed back), and keep the badge and commands working.

**Inputs:** `tabs.onUpdated`, `tabs.onActivated`, `storage.onChanged`, `commands.onCommand`, storage reads. **Outputs:** `tabs.setZoomSettings`, `action.setBadgeText`/`setBadgeBackgroundColor`/`setIcon`, storage writes (`z:`, `af:` removal, `cfg:off`), `tabs.sendMessage({type: "autofit"})`. **Invokes:** the content script via that message.

## Zoom mode - Functional

`applyZoomMode(tabId, host)` sets `"automatic"` when `isSuppressed(host)` (global off, `x:`, or `p:`) and `"disabled"` otherwise; rejections from restricted pages are swallowed (`extension/background.js:100-110`, `:84-92`). Triggered on `status === "loading"` (`:127-130`), on activation (`:136-145`), on every local storage change for the active tab (`:158`, `:162-172`), and for every tab when `cfg:off` changes (`:153-156`, `:176-191`). Tests: `tests/core.spec.js:56`, `tests/exclude.spec.js:109`, `:132`, `tests/pause.spec.js:72`, `tests/global.spec.js:68`.

## Badge - Functional

`refreshBadge(tabId, host)` shows gray `"off"` (#6b7280) when suppressed, otherwise the resolved percent in blue (#2563eb), blank at 100% (`extension/background.js:112-123`). The factor comes from `getFactor`, which is default-aware (`:58-65`). Refreshed on `complete`/URL change (`:131-133`), activation, and storage change. Tests: `tests/keyboard.spec.js:100`, `tests/exclude.spec.js:190`, `tests/pause.spec.js:97`, `tests/options.spec.js:202`.

## Toolbar icon - Functional

`applyActionIcon(off)` swaps between the color set and the greyed `icons/off/` set (`extension/background.js:40-51`, `:96-98`). Applied when `cfg:off` changes (`:155`) and on every worker start (`:239`), because the manifest's `default_icon` is the color set. Exercised indirectly by `tests/global.spec.js`; the icon pixels are not asserted.

## Commands - Functional (dispatch is manual-only)

Declared in `extension/manifest.json:39-58`; handled in `extension/background.js:194-235`.

| Command | Default key | Behavior |
| --- | --- | --- |
| `zoom-in` | Alt+Shift+Up | Step up from the resolved factor; remove `af:`; write `z:`. |
| `zoom-out` | Alt+Shift+Down | Step down likewise. |
| `zoom-reset` | Alt+Shift+0 | 1.0 (removes `z:`); remove `af:`. |
| `zoom-autofit` | none | Send `{type: "autofit"}` to the active tab, then refresh the badge (`:214-223`). |
| `toggle-global` | none | Flip `cfg:off`; no active tab needed (`:197-204`). |

Per-site commands no-op when there is no host or the site is suppressed (`:206-210`). `zoom-autofit` and `toggle-global` have no `suggested_key` because Chrome allows only four commands with defaults. `chrome.commands` dispatch cannot be triggered from Playwright; tests cover the underlying functions (`stepFrom` via `tests/core.spec.js:145`, default-aware stepping via `tests/options.spec.js:202`), and the hotkeys themselves are a manual check.

## Failure modes

All handlers catch and ignore errors from closed tabs, restricted URLs and missing content scripts (`extension/background.js:142-144`, `:169-171`, `:188-190`, `:218-220`). Because each event recomputes from storage, a missed event self-heals on the next navigation or activation.

## Loose ends

- `syncActiveTab` uses `{active: true, currentWindow: true}` (`extension/background.js:164`). With several windows, a per-site change made from another window's popup or options tab updates the badge/mode of the current window's active tab only; other windows' tabs catch up on their next navigation or activation.
- The duplicated `ZOOM_STEPS`/`stepFrom` (`:11-27`) must be kept in sync with `extension/zoom.js:6-28` by hand; no test compares them.
- The popup writes its own badge text after a change (`extension/popup.js:152-155`, `:327-331`) in addition to the worker; harmless duplication.
