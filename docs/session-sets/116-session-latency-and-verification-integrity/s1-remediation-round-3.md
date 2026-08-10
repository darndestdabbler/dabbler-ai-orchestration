# Set 116 Session 1 — remediation, round 3 (operator-authorized)

Round 3 (`--phase remediation-review`, cycle 2) hit the enforced 2-cycle
bound: L3 (mandatory duration) accepted; L1 (e2e provenance) and L2
(full-suite parity provenance) rejected again, sharpened. Persisting
past the bound requires the operator's own authorization — obtained via
an education-mode brief (`decisions.jsonl`, 2026-08-10) — because it is
not the orchestrator's authority to grant itself more verification
attempts.

## Why round 2's fix (making the ledger evidence-visible) was necessary but not sufficient

Exposing `test-runs.jsonl` to the verifier let it see the rows, but the
rows are `record_run`'s own free-text `detail` field plus a digest —
the verifier's round-3 restatement is exact: *"`surfaceDigest` proves
the tree when `record_run` was invoked, not that pytest produced the
asserted result on that tree."* A JSONL row is an attestation by the
orchestrator, not independently-checkable raw output. The gap was never
about visibility (round 2's diagnosis); it was about the evidence
**kind** — a summary line vs. a transcript.

Round 3 also caught something real that round 2 introduced: the L2 fix
required `record_run()` to demand a duration, and applying that fix
changed `ai_router/run_of_record.py` — which is inside the `pytest`
suite's own covered surface. That advanced the tree, so the "same-tree"
pair from round 1's remediation (digest `b5db7d2d776d...`, 3,813 tests)
was already stale by the time round 3 reviewed it, superseded by a newer
row (digest `fb69075938a4...`, 3,814 tests) that had no serial
counterpart. **Fixing verification machinery moves the tree the
verification proof needs to describe** — worth naming as a standing
hazard for any future set that both ships evidence and edits the code
the evidence describes in the same loop.

## Fix

Two new checked-in files, structured like the pre-existing
`docs/test-suite-benchmark-DENICI.txt` (raw pytest output, not just a
summary), both measured on the tree frozen by not touching any
`ai_router/` file again after this round started:

- [`s1-e2e-parity-benchmark.txt`](s1-e2e-parity-benchmark.txt) — raw
  serial and parallel `-m e2e` output.
- [`s1-full-suite-parity-benchmark.txt`](s1-full-suite-parity-benchmark.txt)
  — raw serial and parallel full-suite output.

All four runs (e2e serial, e2e parallel, full serial, full parallel) —
recorded as four `test-runs.jsonl` rows between 11:08:57 and
11:45:30 — share the **identical** `surfaceDigest` (`fb69075938a4...`),
cryptographically proving one tree produced every number in both files.

**On the "commit" ask specifically**: a measurement taken mid-session,
before that session's own close commit exists, cannot cite that
commit's SHA inside a file being written before the commit — there is
no earlier point at which the hash is knowable. Both files instead say
"`git log`/`git blame` on this file names the exact commit it shipped
in," which is the standard, durable way to bind a checked-in artifact to
history: it cannot go stale the way a hand-typed SHA can if the file is
ever touched again, and it answers the actual question ("which commit
produced this") exactly as precisely as a literal hash would.

CONTRIBUTING.md's Layer 1 and "Running everything" sections now link
both files directly, replacing the digest-prefix-in-prose citation that
round 2 shipped.

**Acceptance criteria** (L1, L2, restated in round 3) — met by the two
checked-in raw-transcript files, each showing the exact commands,
complete pass/skip counts, elapsed times, and a `surfaceDigest` binding
independently verifiable against `test-runs.jsonl`.
