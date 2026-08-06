# Session 4 verification conventions

> Up-front conventions block for the S4 verification prompt (repo rule,
> promoted from L-064-10). State the baseline, the release contract and the
> by-design exclusions BEFORE the work to be reviewed, so the round spends its
> findings on real defects instead of re-deriving the agreed starting point.

## Severity rubric (L-095-1 — carry until it ships in the template)

Grade by **CONSEQUENCE**: probability the stated failure scenario
materialises for a real user × impact on the deliverable's objectives. Low
probability **OR** low impact is **Minor**, even when technically correct.
**No plausible failure scenario ⇒ Minor by definition.** State the scenario
concretely; a finding that cannot name one is a nit.

## What this round is

**This is round 3. Rounds 1 and 2 both found blocking Majors; all three are
fixed.** Raw outputs: `s4-verification.md`, `s4-verification-round-2.md`.
Responses: `s4-remediation-round-1.md`, `s4-remediation-round-2.md`.

Round 1 (google/`gemini-3.1-pro-preview`) — 2 Majors:

1. **Missing release deliverables** — fixed: `package.json` `0.48.0` → `0.49.0`,
   a `[0.49.0]` CHANGELOG entry, and `dabbler-ai-orchestration-0.49.0.vsix`
   built (63 entries, 1.42 MB), with its contents checked against every
   CHANGELOG claim by the re-runnable
   `tools/dabbler-ai-orchestration/scripts/verify_vsix_claims.py` — 11/11 PASS.
2. **Missing empty-startup (0-set) measurement** — fixed: the pipeline harness
   re-run at all four scales, twice (`s4-perf-measurements.json`,
   `s4-perf-rerun.json`), and the honest answer recorded in
   `s4-walk-evidence.md`: empty-tree cost is 99% one `git worktree list`
   subprocess, so the migration did **not** fix the sluggishness the set was
   opened for.

Round 2 (`gpt-5.5`) — 1 Major, and it was a genuine shipping defect:

3. **`contributes.viewsContainers.activitybar[0].icon` was a `{light, dark}`
   object**, which VS Code's `isValidViewsContainer` rejects — it requires
   `typeof icon === 'string'` and the caller skips the entire array, so the
   activity-bar container would not have registered. Fixed: one shared string
   asset `media/activity-bar-icon.svg`; the per-theme copies deleted; a new
   Layer 2 gate `src/test/suite/viewsContainerIcon.test.ts` (falsified against
   both the object shape and a per-theme string); `verify_vsix_claims.py`
   corrected, because it had **asserted the broken object as the expectation**;
   the false CHANGELOG "Fixed" claim withdrawn to a **Known issues** entry.

Round 1's nit (empty `IsOtherItem` placeholders in the returned UAT checklist)
is also addressed. Re-reporting any settled finding is not a finding; assessing
whether the fixes are *adequate* is in scope.

## Correction to this file, which misled round 2

The round-2 edition of this block stated that "no product code changed during
this remediation" and used that to say Layer 3 need not be re-run. **That was
wrong**: `package.json` is product, the manifest had been edited after the last
full Layer 3 run, and the edit was exactly the defect round 2 found. The claim
is withdrawn. Layer 3 has since been re-run in full on the final tree.

## Suite baseline

| layer | command | result |
| --- | --- | --- |
| Layer 2 (unit) | `npm run test:unit` (mocha + ts-node + vscode-stub) | **1870 passing, 1 pending** |
| Layer 3 (Playwright) | `npx playwright test` | **33 passed / 0 failed (8.0m)**, on the final tree, after the last code change |
| typecheck | `npx tsc --noEmit -p .` | clean |
| VSIX claims | `python scripts/verify_vsix_claims.py ...0.49.0.vsix` | **11 / 11 PASS** |

Layer 2 went 1866 → 1870: the four new tests are the `viewsContainerIcon`
gate. No test was deleted.

**`npm test` (Layer 2 via @vscode/test-electron) does not launch** on VS Code
1.128+ (`bad option: --no-sandbox`) — a standing environment failure recorded
before this set. The `ts-node` + `vscode-stub` path above is the sanctioned way
to run the same suite and is what the baseline reports.

**Lint** carries the same pre-existing errors/warnings as Sessions 2–3, all
`no-var-requires` / `no-regex-spaces` in files this session does not touch.
Findings that re-report them are not findings.

## Release contract

- **The release is staged, not published.** `0.49.0` is built and verified;
  **publishing to the Marketplace and pushing release tags are operator
  actions** and are deliberately not performed. "No git tag" and "not on the
  Marketplace" are the intended state, not omissions.
- **`0.49.0`, not `0.48.0`.** `0.48.0` was staged before this set and never
  published. `0.49.0` supersedes it and carries its narrow-panel fix and
  template link corrections forward, so that work ships for the first time in
  this artifact. The `0.48.0` CHANGELOG section is intentionally left standing
  as the record of when the work was written. Historical `0.48.0` references in
  `activity-log.json` and the S1–S3 notes are accurate-as-written and are not
  stale references.
- `dist/extension.js` is rebuilt and committed because the repo tracks it. It is
  a build artifact, not hand-authored, and is excluded from the evidence diff.

## By-design exclusions — do not report these as defects

1. **The `<1,000 ms` startup gate is MISSED, knowingly, and is not waived.**
   Final view-open→first-row is 3,073.5 / 3,745.5 / 5,531.5 ms at 10 / 100 / 500
   sets against a `<1,000 ms` criterion. The operator has **deferred the
   startup-performance investigation to its own follow-on session** rather than
   accepting, waiving, or blocking on it. Reporting the miss as undisclosed is
   not a finding — it is stated in `change-log.md`, `s4-walk-evidence.md`, and
   the UAT checklist. Reporting that the *deferral itself* is inadequately
   justified is in scope.
- **The activity-bar contrast complaint is OPEN, not fixed.** The attempted fix
  was withdrawn as invalid. The container icon is masked by VS Code and takes
  its colour from the theme, so no per-theme asset can answer it; the CHANGELOG
  says so in a **Known issues** entry rather than claiming a fix. Reporting that
  the complaint is unresolved agrees with the text and is not a finding.
- **`media/light/activity-bar-icon.svg` and `media/dark/activity-bar-icon.svg`
  are deleted on purpose.** Their path data was byte-identical to the retained
  `media/activity-bar-icon.svg`; keeping them would preserve the false belief
  that this contribution point is themed. `media/light|dark/` still hold the
  four STATUS glyphs, which genuinely need the pair.
- **`media/dabbler-ai-orchestration-icon-2.svg` is now unreferenced.** It is the
  previously-shipping activity-bar asset, left in place rather than deleted
  during a close-out; removing it is cosmetic and out of scope.
3. **The invalid-manifest UAT path was not walked** — no workspace with a broken
   `docs/modules.yaml` was available to the operator. Its automated coverage in
   `work-explorer-tree.spec.ts` is green. This is recorded as an unwalked gap,
   deliberately not as an attestation.
4. **All four UAT items came back `Passes: false`.** That is the operator's raw
   returned artifact and is not edited to look better. The icon findings and the
   activity-bar contrast finding were remediated in-session; the remainder are
   the deferrals above.
5. **One `IsOtherItem` row is retained** in the checklist with an empty
   `HumanAction`/`Expectation`. It is kept deliberately because it carries real
   operator feedback ("Session nodes could have clearer labels") which is the
   origin of deferral 2. The three genuinely-empty placeholders were removed.
6. **The before/after pipeline numbers are not comparable in absolute terms**,
   and the evidence says so. The harness metadata records different
   environments (`cpus: 20` / `node v25.8.1` before versus `cpus: 14` /
   `node v24.19.0` after) and the untouched `git_spawn` control moved ~1.3x.
   The empty-scale conclusion is stated as an **internal ratio within a single
   run** precisely so it survives that; cross-run absolute deltas are explicitly
   not claimed.
7. **The `scan` anomaly is labelled a candidate attribution, not a proof.**
   ~3.7–4.3x per-set scan cost is pointed at the environment difference rather
   than at `normalizeLedgerSessions`, and the write-up says outright that
   nothing isolates the variable. Reporting it as unproven agrees with the text.
8. **Round 1's raw artifact `s4-verification.md` is not edited.** It still reads
   ISSUES_FOUND. That is the rule (verifier output is never rewritten), not a
   stale document.

## What is genuinely new and deserves the review's attention

- **`scripts/verify_vsix_claims.py`** — the mechanism that discharges "vsix
  contents verified against every CHANGELOG claim". Worth checking that its nine
  checks actually correspond to what the `0.49.0` entry claims, and that none is
  vacuous. Note the deliberate non-substring test for the deleted renderer: the
  bundle retains ~20 explanatory comments naming `CustomSessionSetsView`, so the
  check matches `class`/`new` definitions only.
- **The `[0.49.0]` CHANGELOG entry** — specifically whether every claim it makes
  is true of the shipped artifact and of the code, including the supersedes-
  `0.48.0` framing.
- **`s4-walk-evidence.md`'s fourth-scale section** — whether the empty-startup
  conclusion is actually supported by the numbers cited, and whether the
  environment caveat is applied consistently rather than selectively.
- **`s4-remediation-round-1.md`** — whether the two Majors are genuinely
  discharged rather than argued away.
