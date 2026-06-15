# Consensus Journal — Verification-Surface Strategy

> Carried alongside `proposal.md` per the Set 065 spec (S3 step 5). This records
> the cross-provider consensus that shaped the proposal: (1) the pre-065 design
> discussion (gpt-5.4 + gemini-2.5-pro, ~$0.037, captured in the parked planning
> memo) that **locked the design decisions** before the set ran, and (2) the
> in-set routed analysis that resolved the one remaining open question.

---

## 1. Pre-065 design discussion — decisions locked by consensus

A multi-turn design discussion on 2026-06-14 (operator + gpt-5.4 +
gemini-2.5-pro, with an Opus tiebreaker on one point) converged on the following
**before** any session ran. The proposal implements these; they are recorded
here so the proposal's shape is traceable to the consensus rather than to the
orchestrator's self-opinion.

- **Cadence: end-of-SET, not per-session.** Unanimous (operator + GPT + Gemini).
  Path-aware critique is a whole-set pass, not a per-session bolt-on.
- **Tier placement: tier-ORTHOGONAL third verification surface.** A per-set
  attribute locked at set start (mirrors `verificationMode`). **Not** a Full-tier
  bolt-on — Lightweight's existing `out-of-band-or-none` mode is already this
  pattern.
- **Automation tension resolved as per-set opt-in** (`none | advisory |
  required`), **not** universal-mandatory — preserves Full's walk-away promise.
  `required` reuses the content-aware close-out gate that `dedicated-sessions`
  already implements.
- **Predicate for `required` is *derived*, not a guessed risk list:** the set
  changes cross-artifact contracts / indexes / wiring / shared schema — exactly
  where a stateless snippet-fed verifier is structurally blind.
- **Naming: drop "devil's advocate"** (invites theatrical negativity); use
  **Path-Aware Critique**.
- **Strategic fork resolved as both / phased:** institutionalize the *manual*
  critique now (zero marginal metered cost, proven), **instrument it** (log
  prompts / responses / verdicts), then build the agentic verifier. The
  CLI/adapter route makes "agentic" much cheaper than building an agent from
  scratch.
- **Gemini's cannibalization thesis** (if path-aware exists on both tiers, the
  per-session routed call — Full's sole differentiator — may be low-value) was
  accepted as the **motivating hypothesis**, with the explicit caveat that the
  retrospective is order-poisoned and cannot settle it — hence the forward A/B.

### Candidate-design analysis carried from the discussion

- **Contract-test / CDC gate — verdict ~75% right.** True on the *probeable*
  share; it **relocates** independent judgment (to the contract) rather than
  eliminating it. Three holes catalogued with fixes: Hole 1 (contract-design
  bias → independent contract review), Hole 2 (coverage undecidable; presence ≠
  absence → residual novel critique), Hole 3 (Goodhart → held-out / fresh tests).
  Evidenced failure mode: green-but-unwired (test at the wrong level).
- **TDD as pre-registered falsifiers** — the gift is *pre-commitment*
  (Popperian), not the suite. Make-or-break caveat: author-independence (author
  tests inherit author blind spots). Honesty guards: write against spec not impl;
  green ≠ safe; don't force-fit inspection-only claims.
- **Governing complexity/quality rubric** — overhead *location* beats magnitude;
  prefer deterministic + out-of-band + gated-by-blast-radius +
  net-neutral-or-negative; reject in-band + universal + additive-only. Plus the
  self-application warning: 065 must not become the complexity it warns against.

> The raw turn-by-turn transcript of this discussion was not committed to the
> repo at the time (it predates the set); its decisions are preserved verbatim in
> the planning memo `project_set_065_verification_empirics_planned.md` and are
> reproduced above so the proposal is self-contained.

---

## 2. In-set routed analysis — the open question (S3)

The one design fork left open by the pre-065 consensus — *can one agent author
the contract / falsifiers and also implement, and still get the pre-commitment
benefit?* — was routed for independent input rather than self-opined
(`route(task_type="analysis")` → **gemini-pro / gemini-2.5-pro**, $0.0101; raw
output in the set dir at `s3-openq-analysis.md`).

**Independent verdict (corroborates the in-set reasoning):** gate on
blast-radius.
- Same-agent is **sufficient** for low-blast-radius / probeable work under
  **strict temporal separation + immutability** of the falsifiers (pre-commitment
  guards implementation drift but not a flawed premise).
- **Independence is mandatory** for high-blast-radius / cross-artifact / ambiguous
  / novel work, where the risk is *specification* error (Hole 1) — an agent
  cannot critique its own foundational assumptions.
- Source the independent author cheaply: default to the cheap routed verifier for
  deterministic contract tests; escalate to the path-aware critic to critique the
  *contract itself* only for the highest-risk changes.

This resolution is §6 of the proposal and feeds the unifying single-predicate
rule (§7): the **same** blast-radius gate decides path-aware `required`,
contract-author independence, and push-vs-pull delegation.

---

## 3. Final proposal verification

The proposal itself was cross-provider verified at S3 close-out; see the set
dir's `s3-verification*.md` for the raw verifier output (saved, never edited).
