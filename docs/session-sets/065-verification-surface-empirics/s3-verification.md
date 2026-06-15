# Set 065 S3 — Proposal verification (round 1)

> Cross-provider session-verification. Model: gpt-5-4 (gpt-5.4). Cost: $0.1690

---

- **Major — “One predicate” rule is internally inconsistent**
  - **Issue:** “**Independence is mandatory for high-blast-radius / cross-artifact / ambiguous / novel-reasoning work**” conflicts with “**Predicate (P): the unit of work changes cross-artifact contracts, indexes, wiring, or shared schema**” and “**one predicate … applied three times**.” `ambiguous` / `novel-reasoning` are outside the stated predicate.
  - **Location:** §6, §7, Executive summary `(open)` / “The unifying insight (§7)”
  - **Fix:** Either expand **P** everywhere to include ambiguity/novelty and label those additions as heuristic, or narrow §6 so independence is mandatory only when the stated **P** holds.

- **Major — Set-level gating contradicts task-level delegation**
  - **Issue:** “**Choose per task by whether context-assembly is the bottleneck**” conflicts with “**Implementation should compute P once per set and fan it out to the three decisions**.”
  - **Location:** §2, §7, §9 step 3
  - **Fix:** Define `P_task` for delegation-mode and author-independence decisions, and derive `P_set = any(P_task)` only for the set-level `pathAwareCritique: required` gate.

- **Major — Candidate 2 is scored against a stricter rule than the proposal actually adopts**
  - **Issue:** “**The make-or-break caveat is author-independence**” conflicts with §6’s “**Same-agent is sufficient — and is the default low-cost path — for low-blast-radius, probeable work**…”
  - **Location:** §5 Candidate 2, §6
  - **Fix:** Reword/re-score Candidate 2 so the invariant is pre-commitment + immutability, with author-independence required only under the gated high-risk conditions.

- **Major — Overhead/cost placement is overstated**
  - **Issue:** “**Institutionalize the manual critique now (zero marginal cost, proven)**” and “**Every adopted mechanism is out-of-band … Nothing lands on the working agent's critical path**” conflict with §5’s “**Manual = operator-minutes now**” and §6’s same-agent authoring path.
  - **Location:** Executive summary `(c)`, §5 Candidate 4, §6, §8
  - **Fix:** Change “zero marginal cost” to “zero marginal metered API cost” and state explicitly that same-agent falsifier/contract authoring is upfront in-band authoring cost, while independent critique/gates are out-of-band.

- **Major — Mode-2 generalization beyond verification overstates the evidence**
  - **Issue:** “**The same asymmetry applies to code-generation, documentation, and analysis — verification is merely where we measured it**” is broader than the demonstrated evidence, which is verification-only.
  - **Location:** §2
  - **Fix:** Recast this as a hypothesis/design extrapolation and limit the evidence-backed recommendation to verification/path-aware critique unless other task types are tested.

- **Minor — Candidate 1 is mislabeled as deterministic**
  - **Issue:** “**PASS (out-of-band, gated, deterministic harness)**” is inaccurate for a model-based path-aware critique; only the servant/tooling is deterministic.
  - **Location:** Executive summary table, row (a)
  - **Fix:** Change to “PASS (out-of-band, gated)” or explicitly qualify that determinism applies only to the tool/servant layer.

Verdict: ISSUES_FOUND
