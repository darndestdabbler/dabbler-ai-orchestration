# Session 3 decision-time consensus — engine-file consumer table

**Set:** `056-engine-agnostic-doc-authority-and-version-status`
**Session:** 3 of 3 — Complete centralization + close
**Decision owner:** claude / anthropic / claude-opus-4-8 (effort: high)
**Date:** 2026-06-02

---

## The decision (punch-list item 3, `s2-validation.md` §5)

The `## Consumer repos` 3-row table was duplicated in all three engine
files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) **and** canonical in
`docs/repository-reference.md` → `Documentation authority and release
status` — 4 copies, already drifted (`CLAUDE.md` header `ai_router`;
`AGENTS.md` / `GEMINI.md` header the vestigial `ai_router copy`).

- **Option A** — keep the contract-permitted duplicate in all three engine
  files; only align the drifted header.
- **Option B** — drop the table from all three engine files; rely on the
  already-present `## Shared repo facts` pointer into the canonical
  engine-agnostic section (which already carries the table). Removes 3 of
  4 copies and permanently kills the header-drift vector.

The locked S1 contract (`s1-audit-record.md` §3.3) **permits** the
duplicate ("may be duplicated … for convenience") but does not require it.
The S2 cross-provider verifier (`gemini-2.5-pro`) independently argued for
removal. Punch-list item 3 marked this an explicit S3 decision and the
spec's optional-design-check note invites cross-provider consensus when a
choice is genuinely two-sided.

## Why this went to consensus (not a unilateral call)

This set's entire reason for existing is "out-of-band edits to shared docs
without a recorded decision trail." A keep-vs-remove choice with a contract
permission on one side and an operator directive + prior verifier on the
other is exactly the genuinely-ambiguous case the spec routes through
cross-provider consensus before `AskUserQuestion`. Recording the decision
here *is* the trail.

## Consensus result

**Verifier/advisor:** `gemini-2.5-pro` (google), independent of the
claude/anthropic decision owner, via direct `providers.call_model` (see
[`run_s3_consensus.py`](run_s3_consensus.py)). **Cost:** $0.003793
(1010 in / 253 out, `end_turn`).

```json
{
  "recommendation": "B",
  "confidence": "high",
  "rationale": "The project's explicit charter is 'complete centralization' to 'KILL three-way drift.' The duplicated table has already drifted, proving that this specific duplication-for-convenience model is a failure in practice. Option B is the only choice that permanently eliminates this vector of error and maintenance overhead, directly fulfilling the core mandate of the change set. Relying on the existing pointer is the purest implementation of the stated design goal.",
  "risks_of_choice": "The only risk is trivial: a user must perform one extra click to see the canonical table. Given the technical audience and the explicit goal of eliminating maintenance debt, this is an acceptable and negligible trade-off.",
  "dissent": "The strongest argument for Option A is that the locked contract explicitly permits the duplication for user convenience. This indicates that a previous architect valued the user-experience benefit of an at-a-glance table over the risk of drift for this small, ostensibly stable piece of information. Choosing A respects that original intent and avoids removing information that users might find convenient in its current location."
}
```

## Decision: **Option B (pointer-only).** LOCKED.

Drop the `## Consumer repos` table from `CLAUDE.md`, `AGENTS.md`, and
`GEMINI.md`. The existing `## Shared repo facts` pointer already routes
readers to the canonical consumer table in `docs/repository-reference.md`.

**Grounds:** the consensus advisor (high confidence), the S2 verifier, and
the operator's "complete centralization, period" directive all converge on
B; the table had *already drifted*, demonstrating the duplication-for-
convenience model fails in practice for exactly this fact; §3.3 permits but
does not require A. The dissent (one extra click; original architect valued
the inline table) is acknowledged and judged negligible for a technical
audience that already has a one-line pointer in every engine file.

**Consequence:** punch-list item 4 (consumer-table header drift) is now
**moot** — the drifted table is removed, not realigned.
