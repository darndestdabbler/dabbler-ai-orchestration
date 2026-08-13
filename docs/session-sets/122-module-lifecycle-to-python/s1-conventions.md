# Set 122 Session 1 — verification conventions

Read this before the work. It states the baseline, the contract, and the
by-design exclusions, so Round 1 spends its findings on real defects rather
than on the agreed starting position.

## What this session shipped

`ai_router/modules.py` (new) and `ai_router/tests/test_modules_lifecycle.py`
(new), plus one `ai_router/CHANGELOG.md` entry. Nothing else in the repo
changed.

The deliverable is `python -m ai_router.modules create | rename | delete |
assign-sets` — the Python port of the module lifecycle that lives today in
the VS Code extension's `tools/dabbler-ai-orchestration/src/utils/
moduleAuthoring.ts` (2,601 lines) and `cancelLifecycle.ts`.

## Suite baseline (test-run policy A1/A2 — read this before flagging it)

- **Targeted tests only have been run, and they are green:** 33 passed in
  `test_modules_lifecycle.py`, plus 32 passed across
  `test_production_imports.py`, `test_no_legacy_field_reads.py`,
  `test_entry_points.py`, `test_session_lifecycle.py` (the corpus-scanning
  and sanctioned-writer neighbours).
- **The full pytest suite has NOT been run yet, deliberately.** The repo's
  test-run policy (A2) forbids a FULL suite before any cross-provider stage,
  because Step 7 remediation is a code change that invalidates it. The full
  run of record is owed at the session's Step 6, after verification.
  **Its absence is not a finding.**
- No Layer 2 / Layer 3 (Playwright) run is owed by this session: `covers` is
  by path, and this session touched no extension surface. Session 2 of this
  set edits `package.json` and owes the full Playwright suite there.

## Release contract

- `ai_router` is released to PyPI. The changelog entry is under
  `## [Unreleased]`; **no version bump is owed by this session** — the set's
  release walk happens at the end of the set, not per session.
- **No console script was added.** The spec's surface is `python -m
  ai_router.modules`, so an entry in `[project.scripts]` would be an
  unrequested addition (the repo's standing "prefer removal over addition"
  principle). `[tool.setuptools.packages.find]` already includes the new
  module via `ai_router*`; no packaging change is owed.

## By-design exclusions — decided by the spec, not open here

These are **out of scope for Session 1** and must not be reported as gaps:

1. **The extension still has its TypeScript lifecycle implementation.**
   Session 2 of this set points the five existing context-menu commands at
   this CLI, deletes the lifecycle logic from `moduleAuthoring.ts`, and fixes
   `cancelLifecycle.ts:296`. Two implementations coexisting *right now* is
   the planned intermediate state, not a defect of this session.
2. **No command echo / no UI wiring.** "Echo the command before running it"
   is Session 2, step 3.
3. **No append-file partitioning and no set-number collision refusal.** Those
   are Session 3.
4. **The on-disk `docs/modules.yaml` contract is deliberately unchanged.**
   The spec states this as a port: "a format change here would strand every
   repo that already has a manifest." A finding of the form "this format
   would be cleaner as X" is out of scope; a finding of the form "this does
   NOT match what `moduleAuthoring.ts` writes" is exactly in scope.
5. **Exotic manifest shapes refuse loud rather than being handled.**
   Multiline flow lists, tags and anchors are a declared, inherited residual:
   `rewrite_manifest_entry_text` / `remove_manifest_entry_text` return
   `None` and the caller refuses with "edit it by hand". This is the
   TypeScript behaviour, deliberately preserved.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit, not a finding.

The highest-consequence classes here, in order, are:

1. A path that **writes `session-state.json` outside the sanctioned writer**
   (the invariant the whole set exists to restore).
2. A **refusal that does not refuse** — a running session that slips through,
   or a preflight that has already written something.
3. A **rollback that strands state** — any injected failure that leaves a
   file or directory behind, or corrupts one it restored.
4. A **manifest write that loses operator content** — a dropped comment, a
   reordered entry, or a silently-changed field on an entry the operation was
   not supposed to touch.

## Where to look hardest

- `_Transaction` undo ordering (files before the directories that hold them),
  and whether every write path actually goes through it.
- The parse-after-write guards: do they compare *semantically* (the reader's
  normalized view) rather than textually, and can any of them pass on a
  candidate that changed an untouched entry?
- The regexes ported from JavaScript: `$` in Python's `re.MULTILINE` does not
  match before `\r`, so CRLF handling was rewritten with explicit `(?=\r?\n|
  \Z)` lookaheads. A CRLF manifest or spec.md is a realistic input on Windows.
- `has_running_session` / `infer_legacy_status`: a legacy set with no
  `session-state.json` must still be seen as running.
