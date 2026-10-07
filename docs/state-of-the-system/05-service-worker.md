# 05 - Service worker (`extension/background.js`)

Declared as the MV3 background `service_worker` (`extension/manifest.json:8-10`). It is ephemeral: it holds only constants and re-reads storage on every event (`extension/background.js:58-97`). Its two jobs are stated in its header (`:1-9`): keep browser zoom suppressed (or handed back), and keep the badge and commands working.

**Inputs:** `tabs.onUpdated`, `tabs.onActivated`, `storage.onChanged`, `commands.onCommand`, storage reads. **Outputs:** `tabs.setZoomSettings`, `action.setBadgeText`/`setBadgeBackgroundColor`/`setIcon`, storage writes (`z:`, `af:` removal, `cfg:off`), `tabs.sendMessage({type: "autofit"})`. **Invokes:** the content script via that message.

## Zoom mode - Functional

`applyZoomMode(tabId, host)` sets `"automatic"` when `isSuppressed(host)` (global off, `x:`, or `p:`) and `"disabled"` otherwise; rejections from restricted pages are swallowed (`extension/background.js:105-115`, `:89-97`). Triggered on `status === "loading"` (`:132-135`), on activation (`:141-150`), on every local storage change for the active tab (`:163`, `:167-177`), and for every tab when `cfg:off` changes (`:158-161`, `:181-196`). Tests: `tests/core.spec.js:56`, `tests/exclude.spec.js:109`, `:132`, `tests/pause.spec.js:72`, `tests/global.spec.js:68`.

## Badge - Functional

`refreshBadge(tabId, host)` shows gray `"off"` (#6b7280) when suppressed, otherwise the resolved percent in blue (#2563eb), blank at 100% (`extension/background.js:117-128`). The factor comes from `getFactor`, which is default-aware (`:58-65`). Refreshed on `complete`/URL change (`:136-138`), activation, and storage change. Tests: `tests/keyboard.spec.js:100`, `tests/exclude.spec.js:190`, `tests/pause.spec.js:97`, `tests/options.spec.js:202`.

## Toolbar icon - Functional

`applyActionIcon(off)` swaps between the color set and the greyed `icons/off/` set (`extension/background.js:40-51`, `:101-103`). Applied when `cfg:off` changes (`:160`) and on every worker start (`:244`), because the manifest's `default_icon` is the color set. Exercised indirectly by `tests/global.spec.js`; the icon pixels are not asserted.

## Commands - Functional (dispatch is manual-only)

Declared in `extension/manifest.json:39-58`; handled in `extension/background.js:199-240`.

| Command | Default key | Behavior |
| --- | --- | --- |
| `zoom-in` | Alt+Shift+Up | Step up from the resolved factor; remove `af:`; write `z:`. |
| `zoom-out` | Alt+Shift+Down | Step down likewise. |
| `zoom-reset` | Alt+Shift+0 | 100%; remove `af:`. |
| `zoom-autofit` | none | Send `{type: "autofit"}` to the active tab, then refresh the badge (`:219-228`). |
| `toggle-global` | none | Flip `cfg:off`; no active tab needed (`:202-209`). |

Level writes go through `setFactor`, which removes `z:` when the new level equals the global default and pins it otherwise (`extension/background.js:67-81`). Per-site commands no-op when there is no host or the site is suppressed (`:211-215`). `zoom-autofit` and `toggle-global` have no `suggested_key` because Chrome allows only four commands with defaults. `chrome.commands` dispatch cannot be triggered from Playwright; tests cover the underlying functions (`stepFrom` via `tests/core.spec.js:145`, default-aware stepping via `tests/options.spec.js:202`), and the hotkeys themselves are a manual check.

## Failure modes

All handlers catch and ignore errors from closed tabs, restricted URLs and missing content scripts (`extension/background.js:147-149`, `:174-176`, `:193-195`, `:223-225`). Because each event recomputes from storage, a missed event self-heals on the next navigation or activation.

## Loose ends

- These commands overlap the configurable page shortcuts in [04](04-content-script.md). They are kept because Chrome dispatches them everywhere, including pages the content script cannot reach; the options page refuses page shortcuts on the same chords and lists the commands' current keys.

- `syncActiveTab` uses `{active: true, currentWindow: true}` (`extension/background.js:169`). With several windows, a per-site change made from another window's popup or options tab updates the badge/mode of the current window's active tab only; other windows' tabs catch up on their next navigation or activation.
- The duplicated `ZOOM_STEPS`/`stepFrom` (`:11-27`) must be kept in sync with `extension/zoom.js:7-29` by hand; no test compares them.
- The popup writes its own badge text after a change (`extension/popup.js:155-158`, `:330-334`) in addition to the worker; harmless duplication.
