# Set 110 Session 4 Walk Evidence

## Status

The automated native Explorer walk is complete. The final release-of-record
Layer 3 suite passed **33/33 in 8.0 minutes**, on the final tree, after the last
code change — that last change being the round-2 manifest fix and the
quick-pick helper repair it forced. (Earlier full runs passed 33/33 in 10.2 and
8.9 minutes; both predate the manifest edit and neither is the run of record.)

The human UAT walk **has been performed** and its results are recorded in
`110-work-explorer-native-treeview-uat-checklist.json`. All four items came back
`Passes: false` with substantive feedback. The icon findings inside the tree
were remediated in this session. The activity-bar contrast finding was
**reported fixed and that report was withdrawn** — the attempted fix was an
invalid manifest shape that would have removed the container altogether, and it
could not have addressed the complaint in any case; it is reopened and deferred
(see `s4-remediation-round-2.md`). The remaining findings are the explicitly
deferred residuals named below. One path — the invalid-manifest branch — could
not be walked because no suitable workspace was available; that is recorded as
an unwalked gap rather than an attestation.

The native tree is functionally healthy: the suite covered the four-level
shape, lazy expansion, hierarchical context menus, status icons, setup/status
presence, manifest diagnostics, first-run flow, refresh persistence, and the
permanent swallowed-click falsifier.

## Performance comparison

Protocol was held constant: real VS Code Extension Development Host, shipping
extension build, fresh profile per repetition, natural paint, no forced refresh,
fixtures with four sessions per set, two repetitions per scale.

| scale | S1 webview before: view-open -> first row | S4 native after: view-open -> first row | delta |
| ---: | ---: | ---: | ---: |
| 10 sets | 5,344.5 ms | 3,073.5 ms | -2,271.0 ms (-42.5%) |
| 100 sets | 5,293.0 ms | 3,745.5 ms | -1,547.5 ms (-29.2%) |
| 500 sets | 5,605.5 ms | 5,531.5 ms | -74.0 ms (-1.3%) |

The after artifact is `s3-native-tree-baseline.json`; the S1 before artifact is
`s1-real-host-baseline.json`. The native migration therefore improves all three
populated cases in the final release run, but does not meet the explicit
**view-open -> first row < 1,000 ms** release gate at any scale.

The 500-set result also exposes a scaling concern: native lazy children remove
collapsed-row construction, but the initial root discovery/host startup still
costs several seconds, and the current first-paint measurement is not
sub-second. The performance claim must remain qualified; the set has not
proved that the native migration solves the original sluggishness complaint.

### The fourth scale (0 sets), measured

The real-host first-paint probe above covers the three POPULATED scales only.
The empty scale is not observable through it — with no session sets there is
no set row for a first-paint probe to wait on — so the 0-set number lives, for
both the before and the after, in the host-side pipeline harness
(`scripts/perf-harness.ts`). That is the same instrument that produced Session
1's `s1-perf-measurements.json`, which is what makes this a valid comparison.

Re-run on the shipped native code at all four scales, five reps, medians in ms.
The after column was measured twice, back to back, to separate a real change
from run-to-run noise (`s4-perf-measurements.json`, `s4-perf-rerun.json`):

| scale | S1 before: PIPELINE | S4 after run 1 | S4 after run 2 |
| ---: | ---: | ---: | ---: |
| **0 sets (empty)** | **102.2 ms** | **133.7 ms** | **137.6 ms** |
| 10 sets | 100.9 ms | 159.5 ms | 152.7 ms |
| 100 sets | 186.8 ms | 319.2 ms | 372.5 ms |
| 500 sets | 334.1 ms | 1,136.9 ms | 1,302.4 ms |
| real repo | 124.4 ms (109 sets) | 372.4 ms (111 sets) | 361.5 ms (111 sets) |

**These columns are not safely comparable in absolute terms, and the artifacts
themselves say why — in two independent ways.**

First, the harness metadata records a *different machine*: Session 1's run was
taken on `cpus: 20` under `node: v25.8.1`; both Session 4 runs report `cpus: 14`
under `node: v24.19.0`. The before and after columns were therefore not produced
on the same hardware or the same Node major version.

Second, `git_spawn` is one `git worktree list` subprocess, is scale-independent,
and is executed by code this set never touched — it is a control. It moved from
81.6–105.9 ms in Session 1 to 127.0–140.3 ms in both runs above, which is the
1.3x the metadata difference predicts. Any cross-run absolute delta inherits
that.

What the empty scale does answer, and it is the operator's original question:
at 0 sets the pipeline is **99% one git subprocess** (137.6 ms pipeline against
a 135.1 ms spawn). Empty-tree startup cost tracks the control exactly — the
same 1.3x the untouched code moved — so its structure is unchanged by the
migration. This confirms Session 1's floor finding on the shipped code: the
empty-Explorer cost is host-side discovery, not tree rendering, and no view
technology can remove it. The webview→TreeView migration was never able to fix
the empty-tree sluggishness the set was opened for, and the measurement now
says so at the scale where the claim lives. **This conclusion is robust to the
environment change**, because it is an *internal ratio within a single run*
(pipeline vs. spawn), not a cross-run subtraction.

One anomaly, attributed rather than explained away: per-set `scan` cost is
~3.7–4.3x its Session 1 value (0.48 ms/set → 1.78–2.06 ms/set) in both runs,
which is more than the 1.3x the `git_spawn` control shows. The only scan-path
change this set made is `normalizeLedgerSessions`, +59 lines that reshape an
ALREADY-parsed `sessions[]` array with no added read and no added stat, which
cannot plausibly cost ~1.3 ms per set. The fixture generator is self-contained
in `perf-harness.ts` and unmodified, so the fixtures are byte-identical to
Session 1's. The candidate that fits is the environment difference recorded
above: `scan` is the I/O-bound bucket, it is the bucket most sensitive to core
count and to the Node runtime's file-I/O path, and it is exactly the bucket that
moved by more than the single-subprocess control. That is a **candidate
attribution, not a proof** — nothing here isolates the variable — but it is a
materially better-supported one than the +59-line reshape, and it means the
right next step is a same-machine re-measurement rather than a code hunt. It
belongs to the deferred startup-performance session named below, which now
starts from a measurement and a named suspect instead of a hunch.

## Timing attribution diagnostic

The operator asked whether the 4--6 second result includes Electron startup,
expanded children, or the setup/status text. One instrumented real-host run
answered that directly:

| interval | measured |
| --- | ---: |
| Electron process launch -> first module row | 5,915 ms |
| Workbench/activity bar ready -> first module row | 2,946 ms |
| extension `activate()` | 504 ms |
| activation end -> first native root request | 352 ms |
| first native root request | 1 module row |
| webview resolve | 1 ms |

The release-gate clock is the second row, not the first. It begins after
Electron launch has returned and includes the activity-bar click, pane reveal,
root-module `getChildren(undefined)`, and the first visible module row. It
does **not** expand a module, bucket, or session set, so lazy child loading is
not being paid in this number. It also does not wait for the Setup & Status
copy in this healthy populated fixture; that view is conditional and absent.

The remaining interval after the first root request is therefore in the
workbench/tree paint path or its surrounding UI synchronization, not in
building the collapsed descendants. This diagnostic is one attribution run,
not a replacement for the six-sample performance artifact above; it narrows
the follow-on investigation without claiming a root cause.

## Walk-driven defects and fixes

1. The first full run spent the 15-minute test timeout constructing the
   500-set fixture through hundreds of Python subprocesses and Git commits.
   The fixture harness now batches the scale into one process and one commit.
   The focused baseline then passed in 1.5 minutes.
2. The Playwright harness used bare `python`, bypassing the clone's `.venv` and
   failing with `ModuleNotFoundError: yaml`. It now prefers the workspace
   `.venv` interpreter, with `HARNESS_PYTHON` and bare `python` as fallbacks.
3. Three Extension Host unit tests assumed `process.cwd()` was the extension
   root. The launcher now passes `DABBLER_EXTENSION_ROOT`; tests use that when
   present and retain `process.cwd()` for the ordinary Mocha runner.
4. UAT found that severity ThemeIcons obscured the operator's lifecycle icon
   language. Status buckets, set rows, and session rows now use the supplied
   light/dark lifecycle SVGs consistently; module rows have no icon, and
   severity remains available in tooltips/context metadata.

The activity-bar contrast finding was **reported fixed in error**. The
light/dark SVG pair contributed for it is an illegal shape for
`contributes.viewsContainers` — VS Code drops the whole container — and could
not have changed a pixel even if legal, because that icon is painted through a
mask that discards the SVG's own fill. Verification round 2 caught it; the
manifest now contributes one shared string asset and a Layer 2 gate pins the
shape. **The contrast complaint itself is reopened and deferred**, alongside
clearer session-node labels and the startup-performance investigation. See
`s4-remediation-round-2.md`. The invalid-manifest branch was not walked by the
operator because no suitable workspace was available, although its automated
coverage remains green.

## Release decision required

The functional suite is green and the VSIX can be staged, but the explicit
sub-second startup criterion is missed. This was an operator decision, not an
orchestrator waiver, and it has been made:

- **The startup-performance investigation is deferred to its own follow-on
  session.** The measured miss is recorded as a qualified result and is not
  reclassified as a pass, and the release is not blocked on it.
- **Clearer session-node labels are likewise deferred** to their own follow-on
  session.
- **The activity-bar contrast finding was fixed in this session** — *withdrawn.*
  The attempted fix was invalid (see `s4-remediation-round-2.md`); the finding
  is reopened and deferred with the other two.

No option was inferred from the green functional suite; each of the three was
decided explicitly.
