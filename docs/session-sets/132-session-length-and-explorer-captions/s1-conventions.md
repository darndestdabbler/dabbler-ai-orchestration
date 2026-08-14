# Conventions for this round (read before reporting findings)

## What this session is

Set 132 Session 1 of 3, "Two captions, said plainly".

Two **unrelated** string-level changes to the VS Code extension, merged into
one session on purpose (the spec argues the case): both are Explorer-rendering,
so they share one expensive Layer 3 run instead of buying two, and a set of
their own would be dominated by per-set overhead.

1. **The sidebar header now reads `AI Work Explorer`.** It used to read
   `AI ORCH: WORK EXPLORER`.
2. **The close-out readiness row no longer says `not computed`.** For an
   un-run projection the readiness slot is now empty.

Sessions 2 and 3 of this set are a research/instrument-fix pass over
`ai_router/spec_admission.py` and a causality study. **Nothing in
`ai_router/` is touched by this session**, by design.

## The caption change, and why the obvious review is the wrong one

The header is **composed, not stored**. `package.json` contributes a
view-container `title` and a view `name`; VS Code decides the header from the
pair. Probed against a real workbench (this session, not read from VS Code's
source):

| container `title` | view `name` | rendered header |
| :--- | :--- | :--- |
| `AI Orch` | `Work Explorer` | `AI Orch: Work Explorer` |
| `AI Work Explorer` | `Work Explorer` | `AI Work Explorer: Work Explorer` |
| `AI Work Explorer` | `AI Work Explorer` | `AI Work Explorer` |

A single-view container merges its one view into the sidebar title and joins
the two names with `: ` **unless they are identical**. Set 123 S3 hit the
middle row — the same words twice — and fixed it by renaming the container to
`AI Orch`. Restoring the old container title *alone* would have reintroduced
that defect, which is exactly what the spec warned about. Making the two
strings equal collapses the join.

**Therefore the assertion is on the RENDERED header, not on the manifest
fields.** A manifest assertion would have passed happily for the middle row.
Please do not report the absence of a `package.json` assertion as a gap — it
is the deliberate design of `src/test/playwright/sidebar-caption.spec.ts`.

## Suite baseline

- `npx tsc --noEmit -p .` — **clean, exit 0**.
- `npx mocha … src/test/suite/workExplorerTreeModel.test.ts` — **78 passing,
  0 failing**. That is the Layer 2 module owning both changed renderers.
- Targeted Layer 3 (`sidebar-caption`, `work-explorer-steps`) — **5 passed**.
- `npm run lint` — **9 errors, 56 warnings, ALL PRE-EXISTING**. Every error is
  `no-var-requires` / `no-control-regex` in `src/test/suite/fileSystem.test.ts`,
  `prerequisites.test.ts`, `pythonInterpreter.test.ts`,
  `readSessionSetsPerfBenchmark.test.ts`, `scanAnnotationsForActiveSet.test.ts`,
  `walkStager.test.ts` — none of which this session touches. No file changed
  by this session produces a lint error or a new warning.
- No test was deleted, weakened, skipped or marked pending.
- **The full `npm run test:playwright` has NOT run yet, and that is the
  policy, not an omission.** Per this repo's test-run policy A2, no full suite
  runs before a cross-provider stage, because remediation from *this round* is
  a code change that would invalidate it. It runs at Step 8, after every
  code-changing stage, per L-064-12.

## Falsifiers were planted, not reasoned about (L-112-1)

Both new caption assertions were **proven by planting the defect into the real
tree, running the spec, and observing the failure**:

- Reverted the view `name` to `Work Explorer` → the spec failed with the
  observed value `"AI Work Explorer: Work Explorer"`, i.e. it reproduces the
  exact Set 123 S3 defect.
- Reverted the container `title` to `AI Orch` → `openDabblerContainer` timed
  out on the `aria-label*=` selector, which proves the harness-selector
  coupling the spec warned would otherwise fail silently and everywhere.

The manifest was restored and re-verified green after both plants.

## Release contract

- The extension's `changelog.d/0130-set-132-s1-changed.md` fragment is written
  this session. `python -m ai_router.changelog check --target extension`
  passes.
- **No version bump.** The extension is not published this session; publishing
  is operator-only.
- `change-log.md` for the set is **Session 3's** declared deliverable in
  `spec.md`, not an omission here.
- No `ai_router/` changelog fragment, because `ai_router/` is untouched.

## By-design exclusions — please do not report these as findings

1. **`tools/dabbler-ai-orchestration/changelog.d/0060-set-123-s3-removed.md`
   still says the container is `AI Orch`.** It is a **frozen migrated
   fragment** listed in `changelog.d/.baseline.json`; editing it makes
   `changelog check` fail on "an edited migrated fragment". The new Set 132
   fragment therefore **supersedes it by name** in its own text. Journaled in
   `decisions.jsonl` (`defer-to-existing-gate`).
2. **Historical `AI Orch` hits under `docs/session-sets/123-*` are records,
   not stale echoes.** Set 123's spec, activity log, disposition and
   change-log describe what Set 123 did. Rewriting them would falsify history.
   A repo-wide sweep confirmed **no live current-state doc** still claims the
   old caption.
3. **`closeOutGlyph` does not give `absent` a glyph of its own** — `absent`
   and `stale` both take `not-started`. That is unchanged behaviour from
   before this session. The operator's ruling was that the **timestamp** is
   the signal; the rewritten test asserts the absent row is distinguishable
   from a *clean* row (which is dated and takes `done.svg`), which is the
   distinction Set 127 S2 actually cared about.
4. **`closeOutSummary` returns `""` rather than `undefined` for `absent`.**
   `stepDescriptor` composes the row description with
   `[started, readiness].filter(Boolean)` and `closeOutDescriptor` assigns it
   straight to `TreeItem.description`; both render nothing for `""`. Proven in
   the host by the Layer 3 assertion that no rendered row contains
   `not computed`.
5. **`requiresUAT: false`.** Both changes are static strings that Layer 3
   asserts directly; `project-guidance.md` reserves the human walk for what
   automation genuinely cannot check. The spec argues this explicitly.
6. **Sessions 2 and 3 have not run.** `ai_router/spec_admission.py` still
   miscounts nested ordered lists (D1) and still classifies ceremony by
   mention (D2). Both are Session 2's assigned work. This is a
   spec-scheduled window, not an oversight.
7. **No `ai-assignment.md`.** Sets 125–128 and 131 all closed without one and
   `close_session` writes the routed next-orchestrator recommendation itself
   (`sN-next-orchestrator-routed.md`). No gate requires the file.

## Three things I want adversarial attention on

1. **Is `name: "AI Work Explorer"` a regression anywhere the header is not
   the only surface?** The view `name` is what shows if the operator drags
   the view into the panel or another container, and `contextualTitle` is
   what shows when it is displayed outside its own container. I set all three
   strings identical. Name a surface where "AI Work Explorer" reads wrong
   *because* it is no longer distinguishable from the container.
2. **Is the empty readiness slot actually legible, or did we trade a clear
   phrase for silence?** The operator ruled that the missing `as of HH:MM` is
   the signal. But note the honest limit: a **stale** projection and a
   projection with **unmet obligations** are also undated (they render
   `stale — 1 blocking` and `1 blocking, 1 advisory`). So "undated" is not
   uniquely absent — "empty" is. If you think an operator can misread an
   empty slot as "nothing to do", say so and name the failure scenario; that
   is a real candidate finding and I would rather hear it than defend it.
3. **Does the exactly-one-occurrence falsifier over-fit?** The spec asserts
   `rendered.match(/Work Explorer/g).length === 1`. If a future caption
   legitimately drops the words "Work Explorer" entirely, that assertion
   fails for the wrong reason. I judged that acceptable because the test's
   whole subject is this caption, and `toHaveText(CAPTION)` would fail first
   anyway — but it is coupling worth naming.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding. Please state the concrete
failure scenario for anything you rate Critical or Major.
