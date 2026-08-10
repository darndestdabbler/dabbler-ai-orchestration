# Consensus — GPT-5.6 Sol

> **Model:** `gpt-5.6-sol`. **Elapsed:** 223s.
> **Prompt:** identical to the one given to Gemini 3.1 Pro; see
> [`proposal.md`](proposal.md) → *Method*. Reviewer was asked to find
> what is wrong and explicitly told not to validate the design to be
> agreeable.
>
> **Verbatim summary of the reviewer's findings.** Editorial framing is
> confined to this block. This reviewer cited repository line numbers; they
> were checked and are accurate.

## 1. Strongest objection — it cannot both replace final review and preserve its assurance

> Incremental observations are not compositional. Ten locally sound deltas
> do not prove the final integrated state is sound. Later edits can
> invalidate earlier conclusions, and cross-file defects may exist only in
> the final combination.

The dilemma it names:

> - If it reviews only the digest or relies on the ledger, it misses final-state integration defects.
> - If it independently reviews the complete final surface and impacted context, it is still a post-hoc review — with most of the original cost.
>
> A digest proves identity/freshness, not examination or sufficiency.

Cited: `verification_stamp.py:803-823` already recomputes a final
work-diff hash at close and *still* requires substantive review.

**Impact:** *"Either assurance is weakened or the expected savings
disappear. Concurrent monitoring can supplement the gate, but cannot
safely replace a fresh final review."*

## 2. The proposal's constraint 7 is factually wrong

> `fix-accepted`, `fix-rejected`, and `accepted-with-modification` are
> verdicts requested from the **verifier**, not unilateral orchestrator
> dispositions (`verify_session.py:2289-2313`). A verifier's
> `fix-rejected` is forcibly made blocking at lines 3518-3535.
>
> An orchestrator's remediation note is only a settlement assertion
> subsequently re-evaluated by the verifier. **Allowing the worker to
> dismiss its auditor merely by stating a reason makes independence
> cosmetic.**

**Required fix:** every rejected blocking finding needs independent
verifier acceptance, deterministic falsifying evidence, or human
adjudication.

*Both citations were verified against the tree and are correct.*

## 3. "Every intermediate state" is not technically defined

> A concurrent observer **samples** states unless all artifact writes pass
> through a serialized broker. It can miss multiple edits between calls.
> More frequent observation increases routed-call cost; less frequent
> observation invalidates the claimed coverage ledger.
>
> No cadence, checkpoint boundary, atomic snapshot protocol, failure
> policy, or total call budget is specified.

**Required fix:** claim coverage only over explicit immutable checkpoints,
each carrying a complete path/blob manifest; freeze and recompute the
final manifest before close.

## 4. Independence — provider-independent, not epistemically independent

> The artifact sequence still exposes the worker's framing through: which
> files and tests appear first; which evidence is supplied; how findings
> are remediated; repeated exposure to the monitor's own earlier
> hypotheses. The monitor can become anchored and then **validate its own
> requested fixes.**

Proposed mitigation: *"a fresh-context closing reviewer that first
inspects the final surface against an independently generated,
spec-derived audit plan before seeing the monitoring ledger."*

## 5. "Document the good" — self-report, not proof of attention

A shallow monitor can *"copy plausible claims from path names or tests;
cite one valid span while ignoring the rest of the file; produce generic
'sound because Q' statements; hallucinate a relationship around a real
citation."*

> Even automatically validating cited spans proves access, not
> comprehension or coverage.

Stronger mechanism proposed: **hashed retrieval/tool traces plus blind
shadow mutations or randomized challenge cases in an isolated copy.**
Positive citations are useful audit material, but not a reliability test.

## 6. What incremental review misses — nonlocal defects

> - Two individually correct edits that violate a global invariant together.
> - Producer/consumer or schema mismatches across checkpoints.
> - Later edits reverting earlier fixes.
> - **Missing implementation or missing tests — absence may never appear in a delta.**
> - Final contradictions across code, configuration, and prose.
> - Passing tests with a wrong oracle or inadequate environment.

## 7. Charter split — unsound as stated, with a better formulation

> Tests do not "own correctness"; they provide finite evidence about
> selected behavior. They may be written by the same worker, encode the
> same misunderstanding, use weak assertions, or omit concurrency,
> security, integration, and failure paths.

Its replacement:

> - **Tests:** deterministic evidence for exercised behavior.
> - **Verification:** independent assessment of requirements, **test adequacy**, residual behavioral risk, and plausible counterexamples.
>
> The verifier should not duplicate routine test execution, but
> correctness findings cannot be declared out of scope.

## 8. Would it gate? — Not yet. Eight prerequisites

1. Shadow deployment alongside the current gate.
2. Predeclared thresholds for defect recall, false blockers, cost, latency, availability.
3. Blind fault-injection and clean-control evaluations.
4. Immutable checkpoint manifests and an atomic final digest check.
5. A fresh-context final closer.
6. Machine-checked terminal disposition for every blocking finding.
7. Independent adjudication of worker-rejected findings.
8. A hard observation/cost budget and a post-hoc fallback.

Also flagged: the current gate deliberately makes the latest attempt
authoritative (`gate_checks.py:1633-1669`); equivalent anti-rollback and
ledger reconciliation would be essential.

## 9. Better design — hybrid, risk-adaptive verification

> 1. **Generate and hash a sealed audit plan from the spec before implementation.**
> 2. Track artifact/test checkpoints deterministically, without an AI call per state.
> 3. Run advisory delta reviews only at semantic or high-risk checkpoints.
> 4. Run one **fresh** final reviewer against the base-to-final diff, impacted context, and sealed audit plan.
> 5. Review remediation using only the fix delta.
> 6. Use **random full audits and blind shadow mutations** to continuously measure recall.

> This directly exploits the measured 12× evidence-scope saving while
> avoiding temporal anchoring and the false claim that intermediate-state
> observation proves final correctness.
