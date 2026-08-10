# Concurrent monitoring as a close gate — the question put to two providers

> **Status:** consultation record, 2026-08-10. The proposal below was
> **not adopted**; see [`verdict.md`](verdict.md) for the ruling and for
> the two ideas that came out of it and *are* worth building.
>
> This file records what was actually asked, so the two consensus files
> can be read against it.

## Where the idea came from

While one Copilot CLI instance was executing Set 119 Session 1, a second
instance was in conversation with the operator — aware of the spec,
watching the work land, and commenting on it. The operator's question:

> *"What would be stopping us from doing that more formally — as a kind
> of proactive, parallel cross-verification?"*

## The measured problem it was aimed at

All measured, none estimated. Full basis in
[`2026-08-10-verifying-prose-is-where-the-time-went.md`](../2026-08-10-verifying-prose-is-where-the-time-went.md)
and [`2026-08-10-smaller-framework-target-state.md`](../2026-08-10-smaller-framework-target-state.md).

- Set 116 S3: **13 routed calls, $4.75.** The code was clean at round 1
  and stayed clean. Every Critical/Major after round 1 concerned the
  **wording** of a governance document, and **two of the three were
  introduced by fixing the previous one.**
- The session's one real code defect was caught by the **test suite**,
  before verification ran.
- Across **572 historical findings: 520 Major (91%)**, 3 Critical, 21
  Minor. A scale where 91% of findings block is not functioning as one.
- Roughly a third of findings are **Completeness** class.
- Cost is per-round and uniform: a one-sentence wording change costs the
  same routed round as a 200-line behaviour change.
- **A delta-scoped round cost $0.07; whole-session rounds cost
  $0.79–$0.88.** A 12x difference driven purely by evidence scope.

That last number is what made the idea attractive: a concurrent monitor
is delta-scoped by construction.

## The proposal as put to the reviewers

A second AI instance runs at the same time as the working orchestrator,
observes the work as it happens, and produces a running record whose
accumulated observations plus a closing observation would satisfy
`verification_integrity`.

Design constraints, as agreed in discussion before the consultation:

1. **Different provider** from the orchestrator (existing independence rule).
2. **Artifacts only** — diffs, file contents, spec, test output — **never the orchestrator's reasoning or chat stream.**
3. Its **own canonical, hashed prompt template** (the stamp mechanism requires a registered template id + hash).
4. Each observation produces a **stamped metrics row** (it is a routed call, so this is free).
5. A **closing observation bound to the final content digest**, to solve staleness.
6. It documents **what was sound as well as what was problematic**, with path citations for both — offered as a substitute for planted-defect falsifiers.
7. The orchestrator may **reject findings with a stated reason**.

**Claimed charter split:** tests own correctness; cross-verification owns
coverage gaps and requirement conformance.

**Claimed novel benefit:** a post-hoc round proves someone looked at the
*final* state; a monitor proves every *intermediate* state was observed —
a coverage ledger the current gate cannot ask for.

## A factual error in the proposal, corrected during review

**Constraint 7 was wrong**, and GPT-5.6 Sol caught it. `fix-accepted` /
`fix-rejected` / `accepted-with-modification` are verdicts requested
**from the verifier** about the orchestrator's *fixes*
(`verify_session.py:2289-2313`), not dispositions the orchestrator may
issue about the verifier's *findings*. A `fix-rejected` is force-escalated
to a blocking Major at `verify_session.py:3524-3535`, under an explicit
anti-laundering comment.

What exists is **operator** adjudication backed by deterministic evidence
— Set 116 S3 dismissed a path-aware-critique Major citing a passing test.
That is a human override, not a worker self-dismissal. The proposal
presented worker-rejects-auditor as existing machinery; it is not, and
building it would make independence cosmetic.

## Method

Both reviewers received an **identical prompt**, were given read access to
this repo, and were instructed to find what is wrong with the design and
explicitly *not* to validate it to be agreeable. Neither was told what the
other said. Neither was told that Set 119 was in flight.

| reviewer | model | elapsed |
| :--- | :--- | ---: |
| [`consensus-gemini-3.1-pro.md`](consensus-gemini-3.1-pro.md) | `gemini-3.1-pro-preview` | 96s |
| [`consensus-gpt-5.6-sol.md`](consensus-gpt-5.6-sol.md) | `gpt-5.6-sol` | 223s |

The orchestrating reviewer was Claude Opus 5 — which had helped shape the
proposal, and is therefore recorded here as an interested party rather
than a neutral one.
