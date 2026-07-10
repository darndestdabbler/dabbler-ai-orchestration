# Change Log — Set 088: External Verification-Loop Remediation Documentation

**Set:** `088-external-remediation-documentation` · **Sessions:** 1 · **Tier:** Full
**Closed:** 2026-07-10 · **Verdict:** WAIVED (operator-adjudicated; see below)

## What this set did

Formally captured — inside the session-set system — work that was necessarily
done **out of band**, so it is not lost from the project record:

- **The July-2026 verification-loop remediation** (`dabbler-ai-router` 0.32.0,
  publish operator-gated): the fix for the "runaway train" verification loop
  that refused to exit on Minor-only findings and whose anti-fabrication gates
  were bypassable. Governing principle installed: **the builder cannot release
  itself** — release needs different-provider evidence, computed by the
  framework, never asserted by the agent.
- **The salvage of the cancelled Set 086** — its Copilot-seat verification-
  integrity code had landed on `master` (orphaned `0.31.0`, red CI) and now
  ships inside `0.32.0`.

### Deliverables

- **`docs/verification-loop-remediation-2026-07.md`** — the durable record,
  after an independent-provider (`gemini-pro`, cross-verified `gpt-5-4-mini`
  → VERIFIED) documentation feedback pass. Material traceability corrections
  applied: a repo anchor grounding all commit hashes; the external
  `ssN-summary.md` provenance; the CI-fix commit refs (`e3e6a4d`, `2af75fc`);
  the Set 086 cancellation reference (`426808c` + `CANCELLED.md`); a
  `stamp-schema` gloss. Raw feedback record: `s1-doc-feedback.md`.
- **`docs/repository-reference.md`** — a Recent-version-walk pointer making the
  remediation doc discoverable and capturing the Set 086 cancellation/salvage
  linkage.

## Verification & adjudication

Mandatory cross-provider verification (`verify_session`, verifier `gpt-5-4`,
Anthropic orchestrator excluded) ran **two rounds**; both returned
`ISSUES_FOUND`. Both findings were **process/verifier category errors, not
defects in the delivered work**:

1. The circular *"the set isn't closed yet"* (no `change-log.md`, status
   in-progress, uncommitted) — unsatisfiable at verify time, because
   verification (Step 6) precedes close-out (Step 8+) by design.
2. A mistaken *"round-1 artifact is stale/false"* against an **immutable,
   append-only** verification record (round 2 correctly appended siblings after
   the one legitimate gap — missing feedback evidence — was fixed).

Per the bounded-round + no-resurrection + edge-case-exhaustion discipline (the
very discipline the 0.32.0 remediation installed), the loop **stopped at round 2
and escalated** rather than grinding a round 3 on an unsatisfiable demand. The
operator adjudicated both findings as non-defects (`s1-adjudication.md`) and
authorized an operator-attested close (`--manual-verify`). The verdict is
recorded **WAIVED** — honest: verification ran via `api` and returned issues the
operator waived as category errors, not a dishonest `VERIFIED`.

> This set is itself a live demonstration of the remediation working: a trivial
> doc set with little substantive surface drew the verifier into the circular
> close-state finding, and the fixed loop halted-and-escalated instead of
> churning.

## Step 9 — guidance reorganization review

**No preload changes recommended.** The instrumental observation (a verifier can
category-error on a low-content set's pre-close state) is captured in
`s1-adjudication.md` and this change-log rather than promoted into the
always-loaded preload, to respect the Set 085 guidance-slimming discipline. The
existing `[[severity-gated-verification-stop]]` and `[[no-skip-verification-mandate]]`
guidance already cover the principle.
