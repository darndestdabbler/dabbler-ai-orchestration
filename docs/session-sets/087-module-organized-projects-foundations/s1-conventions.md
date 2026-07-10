# S1 verification conventions (read before reviewing)

## Workflow order (do not report the pre-close state as a finding)
This verification runs at **Step 6 of an 10-step session**, BEFORE close-out
(Step 8) — that ordering is the framework's design, not an omission. At
verification time it is therefore CORRECT and EXPECTED that:
- `session-state.json` says `status: "in-progress"` with `completedAt: null`
  and `verificationVerdict: null` (only the blessed `close_session` writer may
  flip these, and it runs after this verification);
- `session-events.jsonl` carries only `work_started`;
- `disposition.json` is absent or partial (it is authored after the verdict,
  then `close_session` validates it).
"The session is not closed yet" is the definition of Step 6, not a defect.
Review the session's WORK — the code, tests, and docs in the diff.

## Cross-round issue ledger (round 1 → 2 dispositions)
- R1 finding "manifest entries must require non-empty codeRoots/planPath":
  **dismissed with citation** — the operator-approved design
  (`docs/planning/module-organized-projects-recommendation.md` §2.4) shows the
  sanctioned integration-module entry as literally `codeRoots: []`, so
  requiring non-empty codeRoots would reject the design's own example; and
  Phase 1 is display-only (slug + title drive the Explorer tier), so
  planPath/codeRoots are carried, not consumed — their enforcement machinery
  is explicitly deferred to set 088 (spec Non-goals). Do not resurrect.
- R1 finding "wrong-shape manifest silently reads as no-manifest": **fixed**
  — `readModulesManifest` now warns on a present-but-wrong-shape manifest
  (not a mapping / no `modules:` list) before degrading to the implicit
  module; covered by a new test asserting the warning fires and the
  absent-file path stays silent.
- R1 finding "session not closed/dispositioned": **not a defect** — see
  Workflow order above.
- R2 finding "per-set unknown-slug warning fires when no valid manifest
  loaded, misreporting the condition": **fixed** — the per-set warning is
  now gated on a manifest actually having loaded (`modulesManifest !==
  null`); absent stays silent (designed fallback) and malformed warns once
  at manifest level only. New test covers all three conditions.
- R2 finding "test-count evidence inconsistent across artifacts (1289 vs
  1290)": **fixed** — the counts differed because each remediation round
  added tests; the Suite baseline section above now carries the single
  final total (1291 / 18) and labels the earlier numbers as chronological.

## Suite baseline (FINAL post-remediation totals — single source for counts)
- Extension unit suite (`npm run test:unit`): **1291 passing, 0 failing**
  after this session's changes (includes **18** new Set-087 tests in
  `src/test/suite/modulesManifest.test.ts`). Earlier artifacts recording
  1289/16 and 1290/17 were true at their timestamps (the chronological
  activity log is append-only); the round-1 and round-2 remediations each
  added tests. THESE are the final counts.
- `npx tsc --noEmit`: clean. `npm run compile` (esbuild): clean.
- `eslint src --ext ts`: **7 pre-existing errors** (5×`no-var-requires`,
  1×`no-regex-spaces`) in `consumerBootstrap.test.ts`,
  `prerequisites.test.ts:400`, `pythonInterpreter.test.ts`,
  `readSessionSetsPerfBenchmark.test.ts`, `scanAnnotationsForActiveSet.test.ts`
  — all on lines that predate this session; this session adds **zero** new
  lint problems (the new test file's `require("vscode")` carries an explicit
  eslint-disable, matching the pattern in `prerequisites.test.ts`).
- Layer 1 pytest: **2905 passed, 6 skipped, 1 failed** on the first run —
  the one failure (`test_drift_guard.py::test_real_repo_passes_all_drift_checks`)
  was **pre-existing at HEAD** (the Set-088 doc
  `docs/verification-loop-remediation-2026-07.md:94` quoted a banned
  stale-tier-framing bigram while describing the earlier e3e6a4d fix) and is
  **fixed in this session's diff** by rewording the quote (drift-guard file now
  25/25 green). No Python *source* was changed — the fix is a one-line doc edit.
- Playwright Layer 3: **all 19 specs fail in THIS local environment with one
  identical signature** — `launchVSCode` times out waiting for
  `app.firstWindow()` / the workbench activity bar; no assertion is ever
  reached. Reproduced **identically at clean HEAD with the session's changes
  stashed**, so it is an environment launch issue (agent shell cannot open the
  VS Code Electron window), not a regression from this diff. The CI matrix is
  the effective Layer 3 gate for this session; do not attribute these launch
  timeouts to the session's changes.

## Release contract
- Mid-set session: **no version bump, no CHANGELOG entry, no publish** —
  release prep happens at the set-terminal session (S4) per the set spec.

## By-design exclusions (do not report these as findings)
- **The webview protocol, view-model, host view, and webview client are
  untouched on purpose.** Session 2 of this set owns `ModulePayload`,
  `groupByModule`, `buildModules`, and the 3-level rendering. Session 1 is
  data-layer only (spec constraint).
- **`module` is a grouping attribute, never identity.** `RowPayload.slug`,
  `findSetBySlug`, prerequisite `{ slug }` syntax, and the merge-by-name key
  are unchanged BY DESIGN (operator-approved recommendation §2.5).
- **On a true name collision the Explorer still shows one winner row**
  (flagged with `duplicateNameError`), never both copies and never a blank
  view — ruled by the routed architecture decision saved raw at
  `s1-collision-check-architecture.json`. "Both copies with disambiguation"
  was explicitly rejected there (name-keyed actions would misroute).
- **A declared-but-unknown `module:` slug degrades to the implicit module
  with a console.warn** — grouping must never block a row (spec: "unknown/
  absent ⇒ implicit module"). The raw value is kept on `config.module` for
  later diagnostic surfacing.
- The identity-key separator is written as the TS escape `backslash-u0000` in
  template literals (a raw NUL byte in source is not representable).
- Matrix case 7 of the routed ruling (Phase-3 nested layout) is untestable
  through the public API today (discovery scans one level); it is covered
  by construction via the root-relative path in the identity key, and a
  code comment says so.
