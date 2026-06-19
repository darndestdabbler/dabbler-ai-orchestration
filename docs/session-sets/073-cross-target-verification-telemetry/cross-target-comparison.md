# Cross-target comparison — harvester (Set 072) vs platform (Set 073)

> **What this is.** A factual side-by-side of the two real verification-only matrix
> runs produced so far: Set 072's first external run on `../dabbler-access-harvester`
> and Set 073 S1's run on `../dabbler-platform`. It records the load-bearing
> **Gemini-pull replication** observation, the diff-shape / push-blindness contrast,
> the per-cell findings and false-positive read, and the cross-target aggregation
> exercise. The **authoritative replication verdict + the `verification-surface-
> strategy.md` §8 synthesis are Session 2's routed deliverables** — this note is the
> S1 evidence they build on, not the strategy update itself.
>
> **Both runs used the same matrix, framing, and orchestrator** — `push:anthropic ×
> {pull:openai, pull:google}`, both arms strong `adversarial-devils-advocate` framing
> (L-069-2 held: the matrix varies *provider*, not framing), orchestrator
> `anthropic/claude-opus-4-8`. So provider×surface is the only thing that varies
> between cells; the only thing that varies between *targets* is the codebase + diff.

---

## 1. Side-by-side telemetry

| | **harvester** (Set 072) | **platform** (Set 073 S1) |
|---|---|---|
| committed ref | `c11038e..e17bd41` (set-018 change) | `82a95ab..d66c449` (`Dabbler.CrudSlice` wrapper) |
| diff shape | 61,692 B / 854 lines / 16 files / **elided=true** | 60,901 B / 1,093 lines / 15 files / **elided=true** |
| underlying diff nature | **golden-output-dominated** (a ~23.7k-line golden regen the push snippet elides) | **source-dominated** (new C# CLI tool + its tests + 2 consuming `src/` files) |
| orchestrator | anthropic / claude-opus-4-8 | anthropic / claude-opus-4-8 |
| **Cell A — push=anthropic/sonnet, pull=openai/gpt-5.4** | push `VERIFIED` · pull `VERIFIED` · 1 finding | push `ISSUES_FOUND` · pull `ISSUES_FOUND` · 3 findings |
| **Cell B — push=anthropic/sonnet, pull=google/gemini-2.5-pro** | push `VERIFIED` · pull `VERIFIED` · **0 findings** | push `VERIFIED` · pull `VERIFIED` · **0 findings** |
| consolidated remediation report | 1 Minor (pull-only, unkeyed) | 3 Major (1 push-only, 2 pull-only; all unkeyed) |
| validators | matrix + remediation round-trip | matrix + remediation round-trip (`report-ok`) |
| skipped cells | 0 | 0 |

---

## 2. The load-bearing check: Gemini-pull is non-silent — REPLICATED (N=2)

**On both independent targets, the Gemini-pull-under-strong-framing cell returned a
clean `VERIFIED` verdict — a verdict, NOT silence.** The field study's "single weakest
pull configuration" (`pull=gemini-2.5-pro`), which it found *quiet on pull*, returns a
verdict under our strong devil's-advocate pull framing on a second codebase. The
Set 072 N=1 observation now has an independent second datapoint.

**Honest nuance (for the S2 verdict, not a contradiction).** "Non-silent" replicates
cleanly. But on the one target that had pull findings to surface (platform), Gemini-pull
returned **0 findings while GPT-pull returned 2 Major contract-drift findings** over the
*same* repo. So the *finding-yield* gap the field study described is **not** refuted by
this run — Gemini-pull is non-silent but lower-yield than GPT-pull here. The replication
is of the **verdict-not-silence** property, not of finding power. S2 should record the
replication as "non-silent: replicated; relative finding-yield: Gemini-pull still trails
GPT-pull on the target with real pull findings." Either way the live default-pull-
provider decision stays **held** (§5.1 / §8.3) — N=2 on one property does not move it.

---

## 3. Diff shape and push-blindness

Both diffs measured `elided=true`: the push dispatch caps the reviewed snippet at a
size budget (~61 KB here), so neither push arm saw the *whole* committed diff. The
material difference is **what the elision drops**:

- **harvester** — the underlying change was dominated by a ~23.7k-line golden-output
  regeneration, so the elided-away bulk was *generated noise*; push reviewed a snippet
  that was mostly non-load-bearing, and **pull was the load-bearing surface** (the
  field study's #1 caveat: push flips toward pull on large diffs).
- **platform** — the Set 072 harvester lesson was applied deliberately: a
  **code-focused** range was chosen (a `.cs`-dominated feature commit, no
  golden/`.db`/`pack-output` files), so the elided snippet is *real source*. Push here
  reviewed genuine code — and in Cell A it surfaced a Major (§4). Push was less blind on
  platform than on harvester, even though both diffs were elided.

So the cross-target pair gives a useful contrast: **push non-load-bearing on a
golden-dominated diff (harvester) vs. push a genuine reviewing surface on a
source-dominated diff (platform)** — both observed at the same ~61 KB elided budget.

A second observation worth keeping: the two **push** arms in the platform run used the
*identical* provider/model/diff (anthropic/sonnet over `82a95ab..d66c449`) yet returned
**different verdicts** — Cell A `ISSUES_FOUND`, Cell B `VERIFIED`. That is ordinary
single-shot LLM non-determinism on the push surface, and it is a reminder that a single
push cell is a noisy signal; the consolidated remediation report (which unions both
cells' findings) is the right unit, not any one cell's verdict.

---

## 4. Per-cell findings + false-positive read

**Platform (3 Major findings in the consolidated report; all unkeyed → over-split, safe):**

1. **Push-only, Major, Completeness** — flags that the *committed session-set bookkeeping*
   in the diff is internally inconsistent: `session-state.json` says `in-progress` /
   `completedAt: null` while `session-reviews/session-002.md` says "Verdict: Pass" and
   `router-metrics.jsonl` already carries the next-session routing. This is a push-only
   Major **repo-state / session-bookkeeping inconsistency** in dabbler-platform's *own*
   session artifacts at that commit, and it is **not a direct `Dabbler.CrudSlice` code
   defect** (the contradictory state is in the session-set artifacts, not the reviewed
   tool/tests). The evidence establishes that the inconsistency exists and is unrelated
   to the CrudSlice code path; **overall materiality/triage is left to dabbler-platform**
   (the consumer-handoff model), not adjudicated here.
2. **Pull-only (GPT), Major, contract-drift** — README + several docs name
   `docs/ai-led-session-workflow.md` as the SSOT, but that file is **absent** from the
   platform's `docs/` tree (dead SSOT link). A **real, useful repo-state finding** the
   path-aware pull arm found by reading the whole repo.
3. **Pull-only (GPT), Major, contract-drift** — `docs/platform-overview.md` claims "eight
   consumable libraries" but omits the packaged `Dabbler.Api.Querying` (a real
   docs↔packaging inconsistency). Also a **real, useful repo-state finding**.

Findings 2 and 3 are exactly the **consumer-handoff value** (§8.4): dabbler-platform can
remediate them directly from `platform-run/remediation-report.md` without re-running
verification. They are *repo-state* findings (pre-existing, surfaced by the path-aware
pull arm exploring the repo) rather than defects introduced by the reviewed diff — which
is expected behavior for the pull surface, and still useful.

**False-positive / nit-churn read.** Under the strongest framing, neither run
manufactured trivial-Minor churn (L-071-1 calibration holding): harvester produced 1
pull-only Minor *meta*-finding; platform produced 3 substantive-shaped Majors (1
push-only repo-state/bookkeeping inconsistency — not a CrudSlice code defect, materiality
for dabbler-platform to triage — and 2 genuinely useful repo-state findings). No
`pytest`-style semantic-equivalence nits.
The strong framing is producing substance, not noise, on both targets.

**Did the Set 072 pull-template instruction-tension meta-finding recur? NO.** On
harvester, GPT-pull emitted one Minor *meta*-finding complaining about a tension in our
own pull template ("mandatory early verdict submission vs. mandatory inspect-first
workflow"). On platform, GPT-pull emitted **substantive contract-drift findings instead —
the instruction-tension meta-complaint did not appear**. So the meta-finding is a **single
observation (N=1), not recurring**. This is the gate for S2's conditional, recurrence-
gated pull-template fix (spec item 5): **it did not recur → S2 records the single
observation and ships no template change / no release.**

---

## 5. Cross-target aggregation exercise (the real S3 aggregator on real inputs)

The first run of `aggregate_remediation_reports` on a **real, independently-produced**
remediation report (not a fixture):

- **Platform single-run backlog** — `platform-run/remediation-backlog.{json,md}`,
  produced from `platform-run/remediation-report.json`. `runCount=1`, 3 findings, every
  `corroboration=1` (a single run cannot corroborate). Round-trips
  `validate_remediation_backlog` (`report-ok`). This exercises the S3 aggregator + its
  validator end-to-end on a real input for the first time.
- **`MixedTargetError` contrapositive** — handing the aggregator the **harvester** report
  *and* the **platform** report together is correctly refused:
  `MixedTargetError: cannot aggregate remediation reports for different targets:
  ['dabbler-access-harvester', 'dabbler-platform'] (a backlog spans exactly one target)`.
  Confirms the one-target-by-construction guard on real cross-target inputs.

There is therefore **no merged two-target backlog** (it is impossible by construction and
out of scope per the spec); the cross-target view is **this side-by-side note**, not a
single mixed fix-list.

---

## 6. Summary for Session 2

- **Gemini-pull non-silent: REPLICATED (N=2)** — clean `VERIFIED` on both targets under
  strong framing. Record the replication verdict in §8 as *non-silent replicated*, with
  the honest finding-yield nuance (§2). Default-pull-provider decision stays **held**.
- **Push-blindness contrast** confirms the field-study caveat: push non-load-bearing on a
  golden-dominated diff (harvester), a genuine reviewing surface on a source-dominated
  diff (platform); both elided at the same ~61 KB budget.
- **Pull-template instruction-tension meta-finding: did NOT recur** → S2's conditional
  template fix does **not** fire; record the single observation, ship no release.
- The real S3 aggregator + its `MixedTargetError` guard are exercised on real,
  independently-produced inputs.
