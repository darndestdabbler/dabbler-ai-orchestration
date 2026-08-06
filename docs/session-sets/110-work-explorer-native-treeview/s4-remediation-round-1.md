# Session 4 — remediation of verification round 1

> **Round 1** was routed `session-verification` to **google /
> `gemini-3.1-pro-preview`** (2026-08-05 16:08, orchestrator provider excluded
> per the dynamic-exclusion rule). It returned **ISSUES_FOUND** with two
> blocking Majors and one nit. Raw artifact: `s4-verification.md` — not edited.
>
> Both Majors accepted in full. Neither was disputed or adjudicated around.

---

## Issue 1 — Missing release deliverables (version bump, CHANGELOG, VSIX)

*Severity: Major. Category: Completeness.*

**Correct on the facts.** Spec step 7 says *"Release: version bump, CHANGELOG,
vsix built and its contents verified against every CHANGELOG claim"* and the
session's Ends-with names *"a vsix staged for an operator-gated publish."* At
the time of the round the working tree carried no version bump, no CHANGELOG
entry, and no packaged artifact.

The near-miss worth recording: earlier steps of this session had built a
`0.48.0` VSIX twice and logged it as staged. That was not the deliverable.
`0.48.0` was **already-staged, never-published** work from before this set, so
rebuilding it does not stage *this* set's release — it restages someone else's.
The finding is really "the release has no version of its own," and the fix had
to be a new version rather than another build of the old one.

### The fix

- `package.json`: `0.48.0` → **`0.49.0`**.
- `CHANGELOG.md`: a `[0.49.0]` entry authored, which states in its own text that
  it **supersedes the unpublished `0.48.0`** and carries that version's
  narrow-panel fix and template link corrections forward so they ship for the
  first time in this artifact. The `0.48.0` section is left standing as the
  record of when that work was written.
- Built **`dabbler-ai-orchestration-0.49.0.vsix`** — 64 entries, 1.42 MB.

### The half of the requirement that is easy to skip

The spec does not ask for a VSIX; it asks for one **"verified against every
CHANGELOG claim."** A paragraph asserting that someone looked inside the zip is
not that, and it cannot be re-run after the next rebuild. So the check is a
script — `tools/dabbler-ai-orchestration/scripts/verify_vsix_claims.py` — that
opens the packaged artifact and tests each claim the CHANGELOG makes:

```
$ python scripts/verify_vsix_claims.py dabbler-ai-orchestration-0.49.0.vsix
PASS  version is 0.49.0 and the CHANGELOG's top entry matches  [package=0.49.0]
PASS  Work Explorer is a NATIVE tree (no webview type)  [type=<none>]
PASS  Setup & Status remains a webview, conditionally present  [when=dabblerSessionSets.setupNeeded]
PASS  activity-bar icon contributes a light/dark pair  [{"light": ..., "dark": ...}]
PASS  every light/dark icon asset is packaged (activity bar + 4 states)  [10 assets]
PASS  row actions are real context menus with the two submenus  [submenus=['dabblerWorkExplorer.openFile', 'dabblerWorkExplorer.copyPrompt']]
PASS  no packaged icon uses fill:currentColor (cannot work here)  [checked all packaged icons]
PASS  the deleted webview renderer is absent from the shipped bundle  [no class/new CustomSessionSetsView]
PASS  the native tree view id IS in the shipped bundle  [tree view id present]

64 entries in dabbler-ai-orchestration-0.49.0.vsix
ALL CLAIMS VERIFIED
```

One check deserves its comment in the source: *"the deleted renderer is absent"*
is **not** a substring search. The shipped bundle keeps around twenty comments
naming `CustomSessionSetsView` to explain where code moved from, so a bare
`in bundle` test would fail on prose. The check matches a definition or a
construction (`class` / `new`), which is the only shape that would mean the
deleted renderer still ships.

Publishing and tagging remain operator-gated and were not performed.

---

## Issue 2 — Missing performance measurement for empty startup (fourth scale)

*Severity: Major. Category: Completeness.*

**Correct on the facts, and it is the finding that mattered most.** Spec step 4
requires the session to *"Report the honest delta — including 'no better on
empty startup' if the scan was the cause"*, and the Ends-with requires
*"before/after performance numbers at four scales."* The evidence reported
10 / 100 / 500 and omitted 0.

The omission was not a rounding error in the write-up. The **whole set exists**
because the operator's Explorer felt sluggish, and Session 1's hypothesis was
that the cost is host-side scanning rather than rendering. The 0-set scale is
the one place that hypothesis is directly testable. Reporting only the populated
scales reported only the scales where the migration looks good.

### Why the number was missing, and where it had to come from

The three populated numbers come from the real-host first-paint probe
(`real-host-baseline.spec.ts`): open the view, wait for the first row. **That
instrument cannot measure the empty scale at all** — with no session sets there
is no row for it to wait on. So the empty number lives, for both the before and
the after, in the host-side pipeline harness (`scripts/perf-harness.ts`), which
is the same instrument that produced Session 1's `s1-perf-measurements.json`.
Using the same instrument on both sides is what makes it a comparison rather
than two unrelated numbers.

### The fix

Re-ran the pipeline harness on the shipped native code at all four scales plus
the real repo, five reps, medians. Run twice back to back, so a real change can
be separated from run-to-run noise: `s4-perf-measurements.json` and
`s4-perf-rerun.json`.

| scale | S1 before: PIPELINE | S4 after run 1 | S4 after run 2 |
| ---: | ---: | ---: | ---: |
| **0 sets (empty)** | **102.2 ms** | **133.7 ms** | **137.6 ms** |
| 10 sets | 100.9 ms | 159.5 ms | 152.7 ms |
| 100 sets | 186.8 ms | 319.2 ms | 372.5 ms |
| 500 sets | 334.1 ms | 1,136.9 ms | 1,302.4 ms |
| real repo | 124.4 ms (109 sets) | 372.4 ms (111 sets) | 361.5 ms (111 sets) |

**The answer, and it is not the flattering one:** at 0 sets the pipeline is 99%
one `git worktree list` subprocess — 137.6 ms pipeline against a 135.1 ms spawn.
Empty-tree startup is host-side discovery, not tree rendering. The
webview→TreeView migration could never have fixed the symptom the set was opened
for, and the measurement now says so at the scale where that claim lives. That
is the literal *"no better on empty startup"* the spec asked for.

### The comparison's own honesty problem, found while fixing this

Writing the fourth scale down forced a look at whether the before and after
columns are comparable at all. They are not, in absolute terms, and the
artifacts say so themselves in two independent ways:

- The harness metadata records **different environments**: Session 1 ran on
  `cpus: 20` under `node v25.8.1`; both Session 4 runs report `cpus: 14` under
  `node v24.19.0`.
- `git_spawn` — one subprocess, scale-independent, in code this set never
  touched — is a **control**, and it moved 81.6–105.9 ms → 127.0–140.3 ms, the
  ~1.3x the metadata difference predicts.

The empty-scale conclusion survives this, because it is an **internal ratio
within a single run** (pipeline versus spawn) rather than a cross-run
subtraction. The cross-run absolute deltas do not survive it, and are no longer
claimed.

This also let the `scan` anomaly be **attributed rather than left dangling**.
Per-set scan cost is ~3.7–4.3x its Session 1 value, more than the control's
1.3x; the previous write-up called it unresolved and pointed at
`normalizeLedgerSessions` only to rule it out. `scan` is the I/O-bound bucket
and therefore the one most sensitive to core count and to the Node runtime's
file-I/O path — which is exactly the bucket that should move by more than a
single-subprocess control when the machine changes. Recorded as a **candidate
attribution, not a proof**: nothing here isolates the variable. Its value is
that it changes the follow-on's first move from a code hunt to a same-machine
re-measurement.

---

## Nit — placeholder items in the returned UAT checklist

The operator's returned checklist carried four `"IsOtherItem": true` rows with
empty `HumanAction` and `Expectation`. Three were entirely empty and are
removed. **The fourth is kept**, because it is not a placeholder — it carries
real operator feedback (*"Session nodes could have clearer labels."*) which is
the origin of one of the two deferred residuals. Deleting it to satisfy a
tidiness nit would have deleted the evidence for a deferral.

---

## Collateral corrections made while remediating

Not raised by the round; found by re-reading the artifacts against the fixed
state, and fixed rather than left to rot:

1. **Stale `0.48.0` references.** `change-log.md` still announced the release as
   `0.48.0`, and the UAT checklist's `ReleaseLabel` still read *"Extension
   0.48.0 staged"* — both now `0.49.0`, matching `package.json`, the CHANGELOG,
   and the artifact. (Historical `0.48.0` mentions in `activity-log.json` and in
   the S1–S3 notes are left alone: they were accurate when written.)
2. **A dangling sentence in the release decision.** `s4-walk-evidence.md` read
   *"Options are:"* and then went straight to the operator's choice, so the
   options it promised were never listed. Rewritten to state the three decisions
   actually taken — startup deferred, labels deferred, activity-bar contrast
   fixed in-session.
3. **A stale status line.** The same file still said *"The human UAT walk is not
   yet attested"* after the walk had been performed and imported. It now states
   what the walk returned, that all four items came back `Passes: false` with
   substantive feedback, and that the invalid-manifest path was never walked
   because no suitable workspace existed — recorded as a gap, not an
   attestation.
4. **`change-log.md`'s "Deferred / operator-owned" section was pre-decision.**
   It still asked the operator to *"Decide whether the sub-second startup miss
   blocks release"* and said the UAT walk *"remains to be performed"*. Both had
   happened. Rewritten to record the decisions instead of re-asking for them.

---

## Suite state at this round

| gate | result |
| --- | --- |
| typecheck | clean |
| Layer 2 | 1,866 passing / 1 pending |
| Layer 3 — full, release of record | **33 passed / 0 failed (8.9m)** |
| VSIX claims | **9 / 9 PASS** on `dabbler-ai-orchestration-0.49.0.vsix` |
| verification round 1 | ISSUES_FOUND — 2 Major (both fixed here), 1 nit (fixed) |

No product code changed during this remediation. The Majors were both
completeness failures — a release that had not been cut, and a measurement that
had not been taken — so the fix is the release and the measurement, not a patch.
