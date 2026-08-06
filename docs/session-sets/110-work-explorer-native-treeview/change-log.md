# Set 110 -- Work Explorer Native TreeView

## Release

- Extension version: `0.49.0`, staged in `tools/dabbler-ai-orchestration` as
  `dabbler-ai-orchestration-0.49.0.vsix` (63 entries, 1.42 MB).
- `0.49.0` supersedes `0.48.0`, which was staged during this session but never
  published; `0.48.0`'s narrow-panel fix and template link corrections ship for
  the first time in this artifact.
- The `0.49.0` CHANGELOG entry's claims are verified in two places, and the
  split is stated rather than blurred. `scripts/verify_vsix_claims.py` checks
  everything decidable **from the artifact** — manifest shape, per-row action
  gating, submenu wiring, packaged assets, shipped and deleted code — and passes
  14/14; it prints "ALL ARTIFACT CLAIMS VERIFIED", not "all claims verified",
  because a zip file cannot expand a tree row. The **behavioural** claims (lazy
  expansion, the fourth level, malformed/duplicate ledger handling, icon
  application, severity moving to tooltips) are verified by the Layer 2 and
  Layer 3 suites, which ran green on this tree. The script's docstring carries a
  claim-by-claim map naming which gate covers each one.
- Publishing and release tagging remain operator-gated.
- The staged release replaces the hand-rolled Work Explorer tree with a native
  VS Code `TreeView`, adds lazy four-level expansion, platform context menus,
  and a conditionally-present Setup & Status webview.

## Session 4 validation

- Copilot seat preflight: passed; catalog refreshed with 11/18 models across
  Anthropic, Google, and OpenAI.
- TypeScript typecheck: passed.
- Layer 2: 1,870 passing, 1 pending.
- Layer 3: 33/33 passed in 8.0 minutes on the final release-of-record run,
  taken after the last code change.
- First full Layer 3 attempt: 32/33; the single failure was the performance
  fixture timing out while constructing 500 sets through hundreds of separate
  Python/Git operations. The harness now batches that construction.
- Native-tree performance after: 3,073.5 ms / 3,745.5 ms / 5,531.5 ms
  view-open to first row at 10 / 100 / 500 sets.
- Webview performance before: 5,344.5 ms / 5,293 ms / 5,605.5 ms at the same
  scales.
- **The fourth scale (0 sets) is measured, and it is the one that answers the
  question the set was opened for.** An empty repo has no set row for the
  real-host first-paint probe to wait on, so the empty scale lives — for both
  the before and the after — in the host-side pipeline harness
  (`scripts/perf-harness.ts`), the same instrument that produced Session 1's
  `s1-perf-measurements.json`. Re-run on the shipped native code, five reps,
  medians: 102.2 ms before, 133.7 ms and 137.6 ms across two back-to-back after
  runs (`s4-perf-measurements.json`, `s4-perf-rerun.json`). At 0 sets the
  pipeline is 99% one `git worktree list` subprocess (137.6 ms pipeline against
  a 135.1 ms spawn), and that spawn is a scale-independent control in code this
  set never touched. **Empty-tree startup cost is host-side discovery, not tree
  rendering, and the migration did not fix it.** That is the "no better on empty
  startup" answer the spec asked for, stated plainly rather than omitted. The
  conclusion is an internal ratio within a single run, so it survives the fact
  that the before and after runs were taken on different hardware (`cpus: 20` /
  `node v25.8.1` versus `cpus: 14` / `node v24.19.0`); cross-run absolute deltas
  do not, and are not claimed.
- UAT remediation: **withdrawn and replaced.** The activity-bar contribution was
  changed to an authored light/dark pair, and verification round 2 found that
  `contributes.viewsContainers` rejects any non-string `icon` — VS Code's
  `isValidViewsContainer` drops the whole container, so the Dabbler activity-bar
  entry would not have appeared at all. It now contributes one shared
  `media/activity-bar-icon.svg` string, guarded by a new Layer 2 gate
  (`viewsContainerIcon.test.ts`). The operator's underlying contrast complaint
  is **not fixed** and could not have been fixed that way: the activity bar
  paints its icon through a CSS mask, so the SVG's own fill is discarded, and
  the two contributed files carried byte-identical path data anyway. See
  `s4-remediation-round-2.md`.

The migration improves all three final measurements but misses the explicit
`<1,000 ms` startup criterion at every scale. Startup performance is an
explicit deferred residual with its own follow-on session; it is not silently
waived. Clearer session-node labels are also deferred to a separate follow-on.
See `s4-walk-evidence.md`.

## Clone/setup defects fixed during S4

- Playwright's Python harness now prefers the repository `.venv`, preventing a
  bare system Python from failing with `ModuleNotFoundError: yaml`.
- Large performance fixtures are created in one harness operation and one Git
  commit instead of one subprocess/commit/push per set.
- Extension Host unit-test paths no longer assume `process.cwd()` is the
  extension root; the launcher passes `DABBLER_EXTENSION_ROOT`, while the
  ordinary Mocha runner retains its current-directory behavior.

## Deferred / operator-owned

- **Startup performance.** The `<1,000 ms` view-open-to-first-row criterion is
  missed at every populated scale, and the empty scale is host-side discovery
  the migration cannot touch. The operator has deferred this to its own
  follow-on session rather than accepting or waiving it here; the measured miss
  stands on the record.
- **Clearer session-node labels.** Raised by the operator's UAT walk, deferred
  to its own follow-on session.
- **The activity-bar mark still reads as too dark on light themes.** Raised by
  the operator's UAT walk, reported fixed in error, and now reopened: the
  container icon is masked and takes its colour from the theme, so this cannot
  be answered from a per-theme asset. It needs either a silhouette change or a
  theme-colour answer, and belongs to a follow-on.
- **The invalid-manifest UAT path was not walked** — no workspace with a broken
  `docs/modules.yaml` was available to the operator. Its automated coverage in
  `work-explorer-tree.spec.ts` remains green, and the gap is recorded rather
  than attested.
- **An unresolved measurement anomaly, with a named suspect.** Per-set `scan`
  cost is ~3.7–4.3x its Session 1 value in both after-runs, more than the 1.3x
  the scale-independent `git_spawn` control shows, and the only scan-path change
  (`normalizeLedgerSessions`) reshapes an already-parsed array with no added
  read or stat. The harness metadata records that the before and after runs were
  taken on different hardware and runtimes (`cpus: 20` / `node v25.8.1` versus
  `cpus: 14` / `node v24.19.0`), which makes the environment the better-supported
  candidate than the code. That is a candidate, not a proof; the follow-on
  starts with a same-machine re-measurement.
- Publishing the VSIX and pushing release tags remain operator actions.
