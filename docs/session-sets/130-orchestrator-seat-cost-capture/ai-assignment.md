# AI Assignment — Set 130

## Session 1 of 3 — The reader that refuses to guess

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic`.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** must be a non-`anthropic` effective provider, resolved by
model-registry lookup and enforced by the exclusion, as in Sets 128–129.

**Spec authoring, recorded here because it preceded registration.** This
set's `spec.md` was a reserved stub carrying an unsized two-session
sketch; it was authored in full before Session 1 registered, and the
decomposition decision is journaled in `decisions.jsonl`
(`goal-over-letter`, AI authority, reversible). The stub's premise was
re-derived against the live store rather than inherited — three of the
spec's six named traps (T4 WAL undercount, T5 self-measurement
truncation, T6 time windows cannot attribute) do not appear in the stub
and were found by measurement, and the stub's claim that routed cost is
*"correctly `$0.00`"* on a seat is false: Set 118 S1's five rounds
recorded `$0.0000` against 866.4 credits (`$8.66`).

**Operator direction, mid-session:** *"create a way to separate out the
main costs from the routed costs — if this isn't done already."* It is
not done. `router-metrics.jsonl` already distinguishes routed calls by
`transport` and flags them `billed_usage_unavailable: true`, but there is
no seat-cost measurement anywhere and no surface that breaks a total into
parts. The separation is this session's step 2 deliverable and is
structural, not presentational: the reader returns a **per-component
breakdown**, and a total exists only when every component in it is
measured.
