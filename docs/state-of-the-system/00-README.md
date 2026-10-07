# Zoom Page TL: state of the system

Code-true reference for the repository as it exists on 2026-10-07 (branch `main`, refreshed after the configurable keyboard shortcuts change; see [PROMPT.md](PROMPT.md)). Every behavioral claim cites `file:line`. Where older documentation and the code disagree, the code wins and the disagreement is noted in the section's loose ends and collected in [10](10-failure-modes-and-loose-ends.md).

[AGENTS.md](../../AGENTS.md) owns working rules. [roadmap.md](../roadmap.md) owns the backlog and declined features. This set owns current behavior. [PROMPT.md](PROMPT.md) records how the set was produced and its refresh history.

## Architecture map

```
                         chrome.storage.local  (the only shared state)
                 z:<host>  x:<host>  p:<host>  af:<host>  rc:<host>
                 cfg:defaultZoom  cfg:off  cfg:zoomMin  cfg:zoomMax  cfg:keys
                   ^   |                ^   |                ^   |
          writes   |   | onChanged      |   | onChanged      |   | onChanged
                   |   v                |   v                |   v
  +------------------------+   +--------------------+   +---------------------+
  | content.js (+ zoom.js) |   | background.js (SW) |   | popup.js / options  |
  | per page, top frame,   |   | tabs.setZoomSettings|  | (+ zoom.js)         |
  | document_start         |   |  disabled|automatic|   | UI writers          |
  | - html.style.zoom      |   | badge, action icon |   |                     |
  | - keyboard shortcuts   |   | chrome.commands    |   |                     |
  | - AutoFit, re-center   |   |                    |   |                     |
  | - re-assert observers  |   |                    |   |                     |
  +------------------------+   +--------------------+   +---------------------+
          ^       ^  runtime messages: "autofit" (popup, SW)  |
          |       +-- "previewZoom" (popup slider drag) ------+
          +-- tabs.sendMessage from SW ("autofit" command)
```

Two mechanisms together produce "per-site zoom with no native bubble": the content script applies CSS `zoom` on `<html>` at `document_start` (`extension/content.js:52-58`, `extension/manifest.json:11-18`), and the service worker pins browser zoom to `disabled` on every navigation and activation (`extension/background.js:105-115`, `:132-150`). No component calls `chrome.tabs.setZoom` (verified by search of `extension/`). There is no backend, no network I/O and no remote code.

## Documents

| Doc | Summary |
| --- | --- |
| [01 - Architecture and design](01-architecture-and-design.md) | Goal, the two mechanisms, root-cause rationale, rejected alternatives, page lifecycle, known edge cases. |
| [02 - Install, build and run](02-install-build-run.md) | Host requirements, npm scripts, load-unpacked, release zip, store packaging, update/uninstall, external dependencies. |
| [03 - Storage and state](03-storage-and-state.md) | Every storage key, resolution rules, writer/reader matrix, export format, on-disk dev/test state. |
| [04 - Content script](04-content-script.md) | `content.js` in depth: apply/refresh, keyboard shortcuts, AutoFit algorithm, Auto mode, re-center, re-assert, messages. |
| [05 - Service worker](05-service-worker.md) | `background.js`: zoom mode, badge, action icon, commands, master switch sweep. |
| [06 - Popup and options UI](06-popup-and-options.md) | Popup controls and slider; options page sections, site manager, import/export, `window.ZP`. |
| [07 - Public surfaces and contracts](07-public-surfaces-and-contracts.md) | Commands, runtime messages, storage contract, JSON backup format, `window.ZP`, sibling-system contracts. |
| [08 - Dev tooling](08-dev-tooling.md) | `check.js`, live dev browser, reload, shot, off-icon generator, env vars, workspace assumptions. |
| [09 - Testing and verification](09-testing-and-verification.md) | Harness design, per-spec coverage, what automation cannot reach, results of the run for this refresh. |
| [10 - Failure modes and loose ends](10-failure-modes-and-loose-ends.md) | Per-operation failure/idempotency table and the consolidated loose-end and doc-vs-code list. |
| [11 - Source inventory](11-source-inventory.md) | Every tracked file, its owner role, and the focused spec. |
| [PROMPT.md](PROMPT.md) | The prompt that produced this set, interpretation notes, refresh history. |

## Status tags

Commands and major code paths are tagged **Functional** (implemented and covered by a passing automated test or verified in this pass), **Partial** (works with a documented gap), **Legacy** (present but superseded), **Aspirational** (described but not implemented), or **Broken** (implemented but wrong).

## Keeping this reference current

Update the affected sections in the same change as the code. Prefer adding a cite to an existing section over a new document. Re-run the prompt in [PROMPT.md](PROMPT.md) for a full refresh and append to its history table.
