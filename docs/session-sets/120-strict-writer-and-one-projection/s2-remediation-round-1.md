# Remediation — Set 120 Session 2, Round 1 (discovery, spec-conformance lens)

**Round 1 finding (Major, Correctness):** `--migrate --in-place` can
rewrite records even when the premise check would have stopped the
migration. The CLI handles `--check-premise` and `--migrate` as
independent branches; the migrate branch calls `migrate_all(...)`
directly with no premise check.

**Verdict: ACCEPTED. Real defect, correctly graded Major, fixed.**

## Why it is right

The spec's step 3 is *"Falsify the ruling's premise before acting on
it… If any does, stop and report."* I did exactly that **as an
operator** — ran `--check-premise`, read all 38 hits of the first
word-level net, narrowed it, adjudicated the one survivor, and only then
migrated. The executed migration is therefore safe, and nothing on disk
is wrong.

But I encoded that ordering as *my own discipline* rather than as the
tool's behaviour, and then wrote a changelog entry inviting consumer
repos to run `python -m ai_router.step_status_drift --migrate --in-place`
against their own history. A consumer's history has not been through my
premise check. So the shipped artifact promised a safeguard it did not
enforce — which is the defect class this repo keeps re-learning: a rule
that lives in prose and not in code is not a rule, it is a hope.

The finding's failure scenario is concrete and reachable: a `completed`
step whose session never closed, or which was later re-logged as
`blocked`, gets flattened to `complete` — laundering exactly the
qualified outcome the operator's ruling was scoped to avoid.

## The fix

**The premise check is now a precondition of the write path, at both
entry points.**

- `premise_blockers(scan_root)` returns every premise flag that has not
  been read and settled.
- `migrate_all()` computes them once for the scan. **One unadjudicated
  flag anywhere refuses the entire run** and writes nothing — because
  the ruling was given for a population that had been falsified as
  lossless, and a partially-falsified population is not that
  population.
- `migrate_file()` checks for its own set when called directly, so a
  library caller that bypasses `migrate_all` is equally fail-closed.
  `migrate_all` passes `premise_checked=True` to avoid re-deriving the
  same answer 109 times; that parameter is a memo, not a bypass — there
  is no flag or environment variable that turns the check off.
- The refusal names the flagged occurrences and tells the caller what to
  do: run `--check-premise`, read every flag, and either correct the
  record or record the reading.

The escape hatch is deliberately *adjudication*, not `--force`. To
proceed past a flag you must state why the flag does not mean what it
appears to mean, which is the same bar this session held itself to for
Set 061 S4.

## Falsifier

`test_an_unadjudicated_premise_flag_refuses_the_write` plants the
defect rather than reviewing the code for it (L-112-1): two sets, one
clean and one whose session never completed, then asserts

1. `migrate_file()` on the flagged set refuses and writes nothing,
2. `migrate_all()` over the scan refuses **every** file and writes
   nothing,
3. both files are byte-identical afterwards, and
4. the negative half — with the flagged set out of scope via `--only`,
   the clean set still migrates — so the refusal is about the evidence
   and not a tool that never writes.

## Blast radius

None on disk. The migration that already ran is unchanged and remains
correct; this only prevents a future run that skipped the check. The
changelog entry that advertised the command to consumer repos now names
the enforced precondition.
