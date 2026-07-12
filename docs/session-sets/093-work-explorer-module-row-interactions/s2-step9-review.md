# Step 9 — Guidance reorganization review (Set 093, last session)

Reviewed `docs/planning/project-guidance.md` and
`docs/planning/lessons-learned.md` for reorganization/drift.

## Outcome: one lesson recommended, deferred to the operator (ceiling)

**Recommendation (deferred):** add a portable lesson capturing this set's
strongest reusable tactic —

> **Close a converging concurrency-window regress with a structural
> primitive, then adjudicate the tail.** When a cross-provider verifier drills
> a file-mutation path and each round names a NARROWER TOCTOU / atomicity
> window (re-read, partial write, rollback clobbering a concurrent edit,
> staging race…), stop patching windows and close the whole CLASS with an
> ATOMIC write (temp → verify → rename — the target is never partially
> modified, so there is no rollback-vs-preserve dilemma). Portable `fs` has no
> atomic conditional-replace, so a residual cross-process window ALWAYS
> remains — that tail is edge-case exhaustion (Set 086): fix the concrete part
> (a unique staging path), adjudicate the rest with the operator, and stop.
> Set 093 S2 spent ~8 verification rounds patching windows before one
> atomic-writer refactor collapsed the class.

This passes the Set 085 admission test (recent recurrence, high miss cost —
~8 wasted rounds — weak automated detectability, no executable-gate
equivalent, expressible in <150 tokens). **It was NOT added** because
`lessons-learned.md` sits exactly at its 2,385-token preload ceiling, which
ratchets DOWN only; admitting new prose requires the operator to first make
room (archive an enforced/situational lesson) or authorize a ceiling edit.
Left for operator adjudication.

## No other changes recommended

`project-guidance.md` (Prefer removal over addition; the atomic-write
refactor is a textbook application) and `lessons-learned.md` remain
well-organized and accurate; no drift found against this set's changes.
