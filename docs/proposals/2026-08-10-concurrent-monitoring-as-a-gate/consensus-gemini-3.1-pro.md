# Consensus — Gemini 3.1 Pro

> **Model:** `gemini-3.1-pro-preview`. **Elapsed:** 96s.
> **Prompt:** identical to the one given to GPT-5.6 Sol; see
> [`proposal.md`](proposal.md) → *Method*. Reviewer was asked to find
> what is wrong and explicitly told not to validate the design to be
> agreeable.
>
> **Verbatim summary of the reviewer's findings.** Editorial framing is
> confined to this block.

**Overall:** *"a fatal architectural mismatch: it identifies a behavioral
problem (pedantic AI grading prose/completeness) and attempts to solve it
by increasing the surface area and frequency of the AI's observations."*

## 1. Strongest objection — the design weaponizes the core problem

> The stated pain point is that the verifier over-indexes on
> "Completeness" and wording, causing expensive, blocking loops. By making
> this monitor *concurrent*, you are now paying an AI to **grade
> incomplete rough drafts for completeness**. Every intermediate save that
> lacks a final test or a fully wired requirement will trigger a "missing
> requirement" or "coverage gap" finding. You are swapping a post-hoc
> nitpicker for a backseat driver.

Consequence named: an explosion in cost, and orchestrator context spent
adjudicating false positives on transient states — while the measured
root cause (prose-blocking) goes untouched.

## 2. Independence — no; the "boiling frog" effect

> Constraint #2 (hiding the reasoning stream) is insufficient because the
> **order of operations is a proxy for reasoning.** If the worker builds a
> fundamentally flawed abstraction in step 1, and builds upon it in steps
> 2 through 5, the monitor evaluates each step locally and accepts the
> premise. By step 5, it has completely bought into the worker's
> architecture.

A post-hoc reviewer instead gets *"a clean, shock-value look at the total
final state, forcing it to map the spec directly to the outcome without
being dragged down the worker's garden path."*

## 3. "Document the good" — no; defeated by hallucinated compliance

> LLMs are sycophantic by nature. An AI monitor can read a function name
> like `check_auth_integrity` and emit: *"I examined auth.py and it is
> sound because it securely verifies integrity."* This satisfies your
> structural requirement (it produced a finding, documented the good, and
> cited a path) without the model executing any logical rigor.

The distinction it draws: planted falsifiers test **discriminatory
power** — they prove the model can spot a negative. Documenting the good
*"only proves the AI can summarize a diff and append 'looks good' to it."*

## 4. What post-hoc catches — emergent and cross-cutting defects

> If change A (step 1) and change B (step 10) are locally valid but
> globally contradict each other or violate a systemic invariant, a
> concurrent monitor misses it because it evaluates increments.

And the closing observation does **not** rescue it:

> By the time the closing observation runs, the monitor's context window
> is heavily polluted with its own prior approvals. The LLM's
> self-consistency bias will overwhelmingly prevent it from suddenly
> declaring the whole system broken after it just spent 10 turns stamping
> the individual parts as "sound."

## 5. Charter split — structurally dangerous

> Tests only catch the correctness flaws the developer *thought to test
> for*. The most catastrophic correctness flaws — security
> vulnerabilities, race conditions, complex state machine deadlocks, or
> misinterpretation of external APIs — are precisely what deterministic
> tests miss and what a fresh-eyed AI reviewer is uniquely positioned to
> catch.

Delegating all correctness to tests *"gives up the highest-value
capability of an AI verifier."*

## 6. Would it gate? — **Block.** Prerequisites named

1. **Implement severity caps first.** Cap findings on non-code surfaces at Minor. *"If findings on prose/markdown cannot block a session, your 91% noise rate disappears instantly without inventing new architecture."*
2. **Cost-model the ledger.** A concurrent agent triggering on every state change *"could easily 10x the $4.75 cost you are trying to escape."*
3. **Draft-evaluation mitigation.** A strict mechanical barrier preventing Completeness findings on intermediate states.

## 7. Better design — declarative, delta-scoped checkpoint verification

> Instead of a concurrent streaming monitor, keep the post-hoc model but
> scope it to explicit, worker-declared milestones:
>
> 1. The orchestrator works entirely autonomously.
> 2. When the orchestrator finishes a specific requirement, it explicitly declares it "Ready for Review".
> 3. The verifier is invoked *only* on the delta mapped to that requirement (which your measurements show costs $0.07, not $0.88).
> 4. **Crucially:** hardcode the framework rule that findings outside executable code are capped at `Minor` and cannot block closure.

Claimed to deliver the coverage ledger, cut cost, and neutralize the
prose-nit loop *"without building a fragile, anchoring-prone concurrent
monitoring system."*

---

**Note for the record.** Prerequisite #1 — capping non-code findings at
Minor — was already in flight as Set 119 Session 1 when this review was
requested. The reviewer was not told that.
