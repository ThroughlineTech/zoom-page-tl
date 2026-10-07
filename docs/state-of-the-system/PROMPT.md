# PROMPT.md - how this set was produced

## Verbatim prompt

The CONFIG block and PROMPT body used for this run, copied verbatim from `docs/state-of-the-system-prompt.md` (a generic template; only the CONFIG block is repo-specific).

````markdown
## CONFIG

```
Repo:            zoom-page-tl
Main focus:      "even coverage, no single focus"
Related sets:    "none"
Must-answer Qs:  "none, derive them"
Output dir:      docs/state-of-the-system/
Notify on done:  notify me
```

## PROMPT

Read through the entire `<Repo>` repository as it exists today and document it
thoroughly: what is in it, what each component does, what each reads and
writes, what each expects from the workspace and from the host machine, and
how it composes with the rest of the stack.

Where a main focus is named in CONFIG, that subsystem gets the deepest
treatment - it is the load-bearing surface and the rest of the set is context
around it. Where CONFIG says even coverage, weight the docs by how much each
area actually matters to someone re-scaffolding the system.

Write it for where the repo is **today**, broken into logical sections.

### Rules

- **Code-true.** Read from source, not from existing docs or specs. Where a
  doc and the code disagree, the code wins, and note the disagreement.
- **Cite `file:line` for every claim.** No assertion about behavior without a
  reference.
- **Point to schemas and contracts, do not reproduce them.** Reference schema
  files, type definitions, and contract files by path. Keep the prose at the
  level of what they mean and how they are used.
- **Status-tag every command and major code path** as one of: Functional,
  Partial, Legacy, Aspirational, Broken.
- **End every section with a "loose ends" call-out** - declared but unused
  capabilities, dead references, planned-but-not-shipped behavior, known gaps.
- If a CONFIG question has no implementation, answer it explicitly as "not
  implemented" and name the boundary where it would live.

### Cross-reference

If CONFIG names related doc sets, mirror their depth and structure - the
reader will have all sets open side by side. Note where this repo's surfaces
connect to theirs.

### Questions the set must answer

Answer every question in the CONFIG must-answer list, each by `file:line`
cite or by explicit "not implemented + boundary named".

In addition, regardless of CONFIG, the set must answer all of the following:

1. **Inventory.** Every command / module / service / endpoint / script: what
   it does at a high level, its inputs (arguments, files read, env vars, MCP
   tools, network calls), its outputs (files written, side effects, exit
   states), and which other components it invokes.
2. **Install / build / run.** How the repo gets onto a machine and runs -
   setup scripts, package managers, build steps. What an update does, what an
   uninstall leaves behind, what the host machine must provide.
3. **External dependencies.** Services, APIs, MCP servers, and databases the
   repo requires, and which specific tools or endpoints from each. What the
   handshake looks like when a dependency is missing or unauthenticated.
4. **Configuration and environment.** Every env var, config file, and secret.
   Which are required vs optional, and which are referenced but unused.
5. **State and persistence.** Everything the repo writes over the lifetime of
   a session - files, directories, logs, scratch state, DB rows, caches -
   where it writes them, and whether they are cleaned up.
6. **Public surfaces.** APIs, CLIs, and exported interfaces other code depends
   on, with the functional state of each.
7. **Contracts with sibling repos or systems.** What this repo reads that
   another wrote, and vice versa. Where two definitions of a shared artifact
   overlap or conflict, and how each side handles the other's version.
8. **Workspace and environment assumptions.** What the code assumes about
   where it runs beyond the obvious - branch conventions, required tooling,
   OS, CI integration, stack-specific code paths in command or build bodies.
9. **Failure modes and idempotency.** For each major operation: how it fails,
   and whether re-running it is safe.
10. **Lifecycle / orchestration.** If the repo drives a multi-step process,
    the phases, the coordination protocol, and how it transitions state.

### Output

Save the docs under the CONFIG output directory (default
`docs/state-of-the-system/`). Use a numbered scheme with a `00`-prefixed
index/README that carries a short architectural map and a one-line summary of
each doc. Standalone-readable documents - one per logical section. Split into
several documents rather than one long file.

### PROMPT.md (required deliverable)

Write a `PROMPT.md` alongside the doc set containing:

- **Verbatim prompt.** The exact CONFIG block and PROMPT body used for this
  run, copied verbatim, in a fenced block. If this is a refresh and the prompt
  text changed since the last run, update this copy and add a short note of
  what was added, removed, or reworded.
- **Document set.** A list of every document in the set with a one-line
  description, and how the set evolved (docs added or removed over time).
- **How the prompt was interpreted.** Any judgment calls made - what "main
  focus" was taken to mean, what was deliberately covered lightly, how
  ambiguous instructions were resolved.
- **Refresh history.** A table: date, branch / HEAD commit, notes on what
  changed in that pass.

On every later run, update `PROMPT.md` in place: refresh the verbatim prompt
if it changed, update the document set list, and append a row to the refresh
history table.

### Voice

Professional. No marketing prose, no "we" voice, no emoji. Plain technical
prose, `file:line` references throughout.

### On completion

<Notify on done - e.g. "notify me when you're done", or omit.>
````

## Document set

| Doc | Description |
| --- | --- |
| 00-README.md | Index, architecture map, status-tag legend. |
| 01-architecture-and-design.md | Goal, the two mechanisms, rationale, rejected approaches, page lifecycle, edge cases. |
| 02-install-build-run.md | Host requirements, external dependencies, npm scripts, release packaging, update/uninstall. |
| 03-storage-and-state.md | Storage keys, conventions, writer/reader matrix, backup format, on-disk state. |
| 04-content-script.md | content.js and zoom.js in depth. |
| 05-service-worker.md | background.js. |
| 06-popup-and-options.md | Popup and options UI. |
| 07-public-surfaces-and-contracts.md | Commands, messages, storage contract, sibling-system contracts. |
| 08-dev-tooling.md | Lint, dev browser, icon generator, env vars, workspace assumptions. |
| 09-testing-and-verification.md | Harness, coverage, manual-only checks, this run's results. |
| 10-failure-modes-and-loose-ends.md | Failure/idempotency table and consolidated loose ends. |
| 11-source-inventory.md | Every tracked file with role and focused spec. |

Evolution: first run (2026-10-07). It replaced three retired engineering handoffs (`HANDOFF.md`, `HANDOFF_2.md`, `HANDOFF_3.md`, in git history before this change) as the description of current behavior; their durable working rules moved to `AGENTS.md` and their open backlog to `docs/roadmap.md`.

## How the prompt was interpreted

- **Even coverage.** Weighted by what matters to re-scaffold the extension: the content script (the only component that touches pages) and the storage model got the most depth; the popup/options UI is tabulated rather than narrated; dev tooling is covered because the owner's review loop depends on it.
- **Code-true.** Written from `extension/`, `scripts/` and `tests/` source. The retired handoffs and existing docs were read only to find disagreements, which are listed in 10.
- **Status tags.** "Functional" was applied only where a passing automated test in this run covers the path, or the script was exercised in this run; hotkey dispatch is marked as manually verified only. One behavior is tagged Broken (minor): the popup ignoring the global default (in 03 and 06).
- **Must-answer questions.** CONFIG said "derive them"; the ten standard questions map to: 1 inventory (04-08, 11), 2 install (02), 3 dependencies (02), 4 configuration (03 keys, 08 env vars; there are no secrets), 5 state (03), 6 public surfaces (07), 7 sibling contracts (07), 8 workspace assumptions (08), 9 failure modes (10), 10 lifecycle (01, page lifecycle; there is no multi-step orchestration).
- **Schemas.** There are no schema files; the storage key table in 03 and the backup format pointer to `extension/options.js` stand in for them.
- **Related sets.** None. Structure loosely mirrors the owner's Bellwether state-of-the-system set (numbered docs, 00 index, source inventory last).
- **Not covered:** CSS of popup.html and options.html beyond enable/disable behavior; store screenshot content.

## Refresh history

| Date | Branch / HEAD | Notes |
| --- | --- | --- |
| 2026-10-07 | main / 8ec5470 (plus uncommitted docs restructure) | First run. lint OK, 64/64 Playwright tests passed. Found: popup ignores cfg:defaultZoom; replace-import leaves af:/rc:/p: orphans; two stale code comments in content.js. Corrected roadmap clamp/range facts, the API reference keyboard section and the README layout. |
