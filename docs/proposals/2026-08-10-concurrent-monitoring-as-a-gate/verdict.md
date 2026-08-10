# Verdict — concurrent monitoring as a close gate

> **Ruling:** **Not adopted.** Two independent reviewers, given an
> identical prompt and no knowledge of each other, both blocked it and
> converged on the same five objections.
>
> **But the consultation was not wasted.** Two ideas came out of it that
> neither the operator nor the orchestrating model had — the **sealed
> audit plan** and **random blind mutation for recall measurement** —
> and both are cheap, both are independently useful, and **neither
> requires a concurrent monitor.** They are specified in §3 and §4.
>
> **Date:** 2026-08-10. **Reviewers:** `gemini-3.1-pro-preview` (96s),
> `gpt-5.6-sol` (223s). Full records in the sibling consensus files.

---

## 1. What was rejected, and why

The proposal — a second AI instance observing work as it happens, whose
accumulated observations satisfy `verification_integrity` — fails on five
counts. Both reviewers reached all five independently.

| # | objection | Gemini | Sol |
| ---: | :--- | :-: | :-: |
| 1 | Incremental observations are **not compositional**; it cannot *replace* final review | ✓ | ✓ |
| 2 | Anchoring is real; **artifacts-only is insufficient** | ✓ | ✓ |
| 3 | "Document the good" is **self-report, not proof of attention** | ✓ | ✓ |
| 4 | The **charter split** (tests own correctness) is unsound | ✓ | ✓ |
| 5 | **Do not gate on it** in this form | ✓ | ✓ |

**The decisive argument** is Sol's dilemma, and it is not escapable by
tuning:

> If the closing observation reviews only the digest or relies on the
> ledger, it misses final-state integration defects. If it independently
> reviews the complete final surface, **it is still a post-hoc review —
> with most of the original cost.** A digest proves identity and
> freshness, not examination or sufficiency.

The savings and the assurance cannot both survive.

**The most damaging specific finding** is Gemini's: roughly a third of all
findings are Completeness-class, and a concurrent monitor would be
**grading incomplete drafts for completeness.** The design would have
amplified the exact failure mode it was meant to remove.

**Two mechanisms were named that defeat the mitigations offered:**

- *Anchoring survives constraint #2* because **the order of operations is a proxy for reasoning** (Gemini). A monitor watching a flawed abstraction get built upon accepts the premise by step 5. Sol adds that a monitor can end up **validating its own requested fixes.**
- *The closing observation is compromised* by **self-consistency bias** (Gemini): a model that stamped ten parts "sound" will not then declare the whole broken.

**A technical gap invalidated the headline benefit.** The "coverage
ledger" was never defined: a concurrent observer **samples**, and without
a serialized write broker it misses edits between calls. No cadence,
atomic-snapshot protocol, failure policy, or call budget existed (Sol).

## 2. A factual error in the proposal, corrected

Constraint 7 claimed the orchestrator may reject verifier findings via
`fix-accepted` / `fix-rejected` / `accepted-with-modification`. **This is
inverted.** Those are verdicts requested **from the verifier** about the
orchestrator's *fixes* (`verify_session.py:2289-2313`), and a
`fix-rejected` is force-escalated to a blocking Major
(`verify_session.py:3524-3535`) under an explicit anti-laundering comment.
Both citations were checked against the tree.

What exists is **operator adjudication backed by deterministic evidence**
— Set 116 S3 dismissed a Major citing a passing test. That is a human
override, not a worker self-dismissal.

**Standing rule, adopted from Sol:** a rejected blocking finding requires
independent verifier acceptance, deterministic falsifying evidence, or
human adjudication. **Never the worker's own say-so** — that makes
independence cosmetic.

## 3. ADOPT — the sealed audit plan

**The best idea in the exchange, and neither party had it.**

> Generate and hash a **sealed audit plan from the spec, before
> implementation begins.** — GPT-5.6 Sol

**Why it matters.** Every anchoring mitigation discussed was behavioural —
*don't show the monitor the reasoning*, *use a different provider* — and
both reviewers showed those leak. The sealed plan defeats anchoring
**structurally**: the verifier is bound to what the spec *asked for*,
committed before any code exists, so there is nothing for the
implementation to anchor it to. It cannot be talked out of a requirement
that was hashed before the work started.

It also directly addresses Sol's sharpest coverage finding:

> **Missing implementation or missing tests — absence may never appear in a delta.**

A diff cannot show what is absent. A pre-committed audit plan can, because
it enumerates what *should* exist and is checked against what does.

**Sketch:**
- At set authoring or session start, derive checkable audit items from `spec.md` (its steps, its `Creates` / `Ends with` / `Progress keys` lines are already structured for this).
- Hash and seal it, exactly as verification templates are hashed today.
- Feed it to the closing verifier **alongside** the diff; the verifier reports per-item.
- Unmet items are Completeness findings with a provenance stronger than any the current loop produces — traceable to a requirement recorded before the work.

**Cost:** one routed call per session at authoring time, or zero if
derived deterministically. **Risk:** low; advisory first.

## 4. ADOPT — random blind mutation for recall measurement

**This answers the falsifier question better than either position in the
original debate.** The operator argued planted defects were unnecessary;
the orchestrating model argued they were required. Both were wrong at the
extremes.

> Use **random full audits and blind shadow mutations** to continuously
> measure recall. — GPT-5.6 Sol

**Why it matters.** `L-112-1` says a gate that only ever passes proves
nothing. The counter-argument — *documenting the good is self-evidencing*
— was refuted by both reviewers: a model can cite a real path and
hallucinate the relationship around it, and *"validating cited spans
proves access, not comprehension."*

Random blind mutation resolves it: **you do not plant a defect every
session, and you do not abandon falsification.** You plant one
occasionally, in an isolated copy, and measure whether it was caught. That
converts verifier quality from an article of faith into **a measured
recall rate** — the first time this framework would have one.

**Sketch:**
- Occasionally (say 1 in N sessions), run a shadow verification against a copy of the surface with a seeded defect.
- Record caught / missed in a recall ledger.
- Report the rate; **never block on it** — per Set 118's standing rule, everything new reports.
- A falling recall rate is the signal that a verification surface has decayed.

**Cost:** amortised — one extra routed call every N sessions.
**Risk:** low; runs against a copy and touches no session artifact.

## 5. ADOPT — Sol's charter split, replacing the one proposed

The proposal's split (*tests own correctness; verification owns coverage
and requirements*) was rejected by both reviewers. Gemini: tests only
catch what someone thought to test, and security, races and state-machine
deadlocks are exactly what a fresh reviewer catches. Sol: tests may be
*"written by the same worker"* and *"encode the same misunderstanding."*

**The replacement:**

- **Tests** — deterministic evidence for exercised behaviour.
- **Verification** — independent assessment of requirements, **test adequacy**, residual behavioural risk, and plausible counterexamples.

This keeps the operator's instinct — verification's marginal value is
*"where test coverage is lacking"* — while refusing to declare correctness
out of scope. **"Test adequacy" is the sharpest formulation of that
instinct anyone in the exchange produced.**

## 6. NOTED, not adopted — worker-declared checkpoint review

Both reviewers independently proposed the same replacement shape:
delta-scoped review at **explicit checkpoints** rather than continuous
observation — worker-declared "ready for review" (Gemini), or semantic /
high-risk checkpoints (Sol). Both keep the measured 12x evidence-scope
saving ($0.07 vs $0.88) without temporal anchoring.

It is **not adopted here** because it changes when the metered loop runs
and therefore interacts with Set 119's round budget and doc-only cap. It
should be evaluated **after** Set 119 lands, against that new baseline —
not designed against the loop Set 119 is currently changing.

## 7. Corroboration worth recording

Gemini's first prerequisite — *cap findings on non-code surfaces at Minor;
"your 91% noise rate disappears instantly without inventing new
architecture"* — **is Set 119 Session 1**, which was in flight while the
review ran. The reviewer was not told this.

Two independent reviewers, blind to the roadmap, pointed at the work
already in progress as the thing to do first. That is the strongest
available evidence that Set 119's sequencing is right, and it is worth
more than the rejected proposal.

## 8. Standing decisions from this consultation

1. **No verification surface may be judged by its own report alone.** Recall is measured (§4) or it is unknown.
2. **A rejected blocking finding requires verifier acceptance, deterministic falsifying evidence, or human adjudication** — never the worker's own reasoning (§2).
3. **Correctness is never out of scope for verification** (§5).
4. **Do not re-propose concurrent monitoring as a gate** without first defeating §1's compositionality dilemma. A design that cannot say how ten sound deltas prove a sound whole has not addressed the objection.
