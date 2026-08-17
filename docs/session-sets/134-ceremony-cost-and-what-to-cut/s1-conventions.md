# Session 1 verification — up-front conventions

Read this before the evidence. It states the baseline, the by-design
exclusions, and the severity rubric, so Round 1 spends its findings on real
defects rather than on the agreed baseline (project-guidance G-010).

## What this session is, and is not

This is a **measurement session**. Its entire deliverable is one analysis
document, `s1-ceremony-attribution.md`, plus the routed `ai-assignment.md`
ledger, one `decisions.jsonl` record, and the machine-written lifecycle
files. **It ships no product code by design** — see the set's rule below.

## By-design exclusions — do not report these as findings

1. **No production code changed, and none should have.** The set spec's
   standing rule is *"No new module. Every deliverable is a measurement
   document, a deletion, a parameter change, or an edit to an existing
   file."* The spec explicitly cites the 2026-08-15 out-of-band analysis —
   done with read-only scripts and no framework change — as "the existence
   proof that Sessions 1 and 2 need to build nothing." A finding that this
   session should have shipped a module, a new CLI, or new instrumentation
   is **contrary to the spec** and should not be raised.
2. **The analysis scripts are deliberately not in the diff.** Four read-only
   instruments were written and run from the session workspace
   (`~/.copilot/session-state/<id>/files/`), never in the repo, precisely so
   the set adds no module. Their inputs are all committed artifacts and every
   number in the document is reproducible from them. Their absence from the
   diff is intentional, not an omission.
3. **`pathAwareCritique` is deliberately absent from the spec** (default
   `none`), and the spec explains why: buying an optional multi-provider
   stage in a set about reducing ceremony would be self-refuting. Do not
   report the missing stage.
4. **No test suite is owed.** `run_of_record affected` reports *"No declared
   suite's input set intersects this change (0 paths)."* Under the
   constitution a suite this session did not touch is not owed at all. There
   is therefore no suite baseline to state and no run of record to produce.
5. **`requiresUAT: false` and `requiresE2E: false`** are set-level and
   permanent here. No rendering surface is touched.

## Known repo baseline, unrelated to this diff

- `mocha` carries one **pre-existing** failure, tracked since Set 133 S1:
  `fileSystem.test.ts` *"a symlinked artifact is digested, exactly as the
  Python writer does"* (Set 114 S3). It only executes on a Windows shell
  privileged enough to create a symlink. It is a named residual with an
  owner and is not this session's.

## The severity rubric this round should apply

Grade by **consequence**: probability the stated failure scenario reaches a
real user × impact (project-guidance G-013). Low probability **or** low
impact is **Minor**. **No nameable failure scenario is a nit, not a Major.**
Please state an explicit severity token from {Critical, Major, Minor} for
every finding — the set's Session 2 is specifically about severity-field
drift, so an unrated or prose-valued severity here would be ironic and is
worth avoiding.

## Where scrutiny is genuinely wanted

This session's job was to re-derive numbers and it **contradicts the spec it
serves**. That is the highest-value thing to attack:

1. **Is the headline claim sound?** The document concludes the published
   2.3× "does not survive re-derivation" because the ratio ranges
   1.01×–2.96× across six method variants. Is that a fair test, or is one
   variant obviously the right one and the range manufactured?
2. **Is the burst-logging argument correct?** The claim is that 44% of
   pre-cap step intervals under one second mechanically deflate pre-cap
   min/step, so the spec's step-*count* control does not rule out an
   instrumentation artifact. Check the logic, not just the number.
3. **Is the dating sound?** The document asserts the 2026-08-07 cohort split
   *is* Set 111's landing date and that Set 111 built the instruments the
   post-cap cohort is measured with. Two spec corrections ride on similar
   evidence (Set 128 → Set 114 for the step skeleton; Set 116 reframed as a
   cost reduction).
4. **Are the disqualifications honest?** C3, C4 and C5 are rejected on
   measured grounds. A reduction session that disqualifies its own
   candidates should be checked for motivated reasoning in *either*
   direction.
5. **Does the journaled decision sit at the right authority?** It is recorded
   as `ai` / `goal-over-letter`. The set's hard carve-out is that anything
   reducing verification is the operator's. The document's position is that
   declining to publish a single corrected ratio reduces nothing and that
   both verification-reducing candidates (C1's stop-earlier variant, C2)
   are recorded as operator-owned and surfaced rather than proposed.
   If that boundary is drawn wrongly, it is a **Major**.

## Numbers you can check against the artifacts

Every figure in the document is derived from committed files:
`session-state.json` (255 completed schema-v4 sessions), `activity-log.json`
(step completions), `sN-rounds.jsonl` (246 rounds across 69 sessions, first
row 2026-08-07 03:16), and `test-runs.jsonl` (188 runs with durations, first
duration 2026-08-10).

**Round 1 correction, already applied.** Round 1 raised one Major: the
document drew operative conclusions from `ai_router/router-metrics.jsonl`,
which is **gitignored and untracked** (`.gitignore:7`) and so cannot be
reproduced from a fresh checkout, against a spec that requires committed
artifacts only. Accepted without argument. All model-latency figures are now
quarantined as **non-operative**, removed from the values Sessions 2 and 3
inherit, and marked strikeable without changing any candidate's measured
minutes. If any latency-derived claim still reads as operative, that is a
live defect worth reporting.
