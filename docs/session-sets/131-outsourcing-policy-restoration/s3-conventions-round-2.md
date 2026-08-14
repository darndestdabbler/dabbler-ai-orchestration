# Conventions for round 2 (delta-scoped remediation review)

## What this round is, and what it is not

Round 1 (discovery, 2-way fan-out, both calls `gpt-5.5`, `anthropic` excluded)
returned **VERIFIED with 0 blocking findings** and two Nits — one per lens.
Under this repo's loop discipline a Minor-only round is effectively VERIFIED
and no remediation loop is owed.

Both Nits were fixed anyway, and that fix is why this round exists:
`post_round_delta` classifies the delta as **shipped-code (A4.2)** because the
one changed path, `docs/ai-led-session-workflow.md`, sits outside every
declared test surface. The obligation is exactly **one delta-scoped
remediation review**, not an open re-verification.

**Review the fix delta only.** New defects are admissible only within the fix
hunks. The round-1 substance stands; do not re-report round-1 nits, and do not
re-open settled ground.

## The delta, in full

Two edits, both inside `docs/ai-led-session-workflow.md` → *Rotation, and the
trade we declined*. No code, config, test, schema or other document changed.

1. **The 150–300K payback figure**, previously "inside ~30", is now a range
   with both endpoints named and attributed: ~31 inferences if the post-flush
   context lands near the measured 54K, ~42 if it settles at the 25–75K band
   average; ">300K" likewise becomes ~13–15. Verifier's arithmetic accepted in
   full.

2. **The matched-context table** now carries all four models and all five
   bands from `spec.md` with each cell's `n`, instead of two models and three
   bands, plus one paragraph explaining that the empty cells for
   `gemini-3.1-pro` and `sonnet-4.6` above 150K are the confound itself — those
   models were never asked to hold an orchestrator's context.

The per-finding reasoning and the payback arithmetic table are in
`s3-remediation-round-1.md`.

## Source of record for every number

`docs/session-sets/131-outsourcing-policy-restoration/spec.md`. Every figure in
the changed hunks must match it. The new table cells were copied from the
spec's own table (including the `26.71 (n=6, ignore)` cell, carried across with
its marker rather than dropped). The four payback endpoints are the only
*derived* numbers in the delta; they are shown as arithmetic in the remediation
sidecar and should be checked:

| case | before | after | saving | 400 / saving |
| :--- | ---: | ---: | ---: | ---: |
| 150–300K, post-flush at measured 54K | 17.18 | ~4.3 | 12.88 | 31.1 |
| 150–300K, post-flush at 25–75K average | 17.18 | 7.65 | 9.53 | 42.0 |
| >300K, post-flush at measured 54K | 35.77 | ~4.3 | 31.47 | 12.7 |
| >300K, post-flush at 25–75K average | 35.77 | 7.65 | 28.12 | 14.2 |

`~4.3` is the midpoint of the measured post-compaction range `~3.6–5.0`.

## By-design, unchanged from round 1

- Zero new tests (spec-declared for this session).
- No automatic compaction trigger, no orchestrator model change, no cost
  gating, no new store reads, no extension surface — all `spec.md` non-goals.
- `requiresUAT: false`, `requiresE2E: false`, `pathAwareCritique` absent.
- `docs/planning/lessons-learned.md` is not in the delta; the Step 9
  reorganization review runs after verification.
- Targeted suite after the last edit: 218 passed, 1 skipped, 0 failed. The
  required portion of the full suite runs at Step 8, after this round, per
  test-run policy A2.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding. State the concrete failure
scenario for anything rated Critical or Major.
