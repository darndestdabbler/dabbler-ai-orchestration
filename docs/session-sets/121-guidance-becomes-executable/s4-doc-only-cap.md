> **Regenerated at close-out.** Every number below comes from
> `python -m ai_router.measure_doc_only_cap
> docs/session-sets/121-guidance-becomes-executable` — the table via
> `--markdown`, the raw report via `--json`. Nothing here is hand-copied. A
> session cannot measure the round that reviews it, so this artifact is
> regenerated as the last act before close and states the traffic recorded at
> that moment; the shipped module, not this file, is the durable answer.

# Session 4 Step 4 — did the doc-only cap fire?

Raw report: [`s4-doc-only-cap-measurement.json`](s4-doc-only-cap-measurement.json).

The tool calls the shipped predicates (`is_doc_only_issue`,
`is_documentation_path`, `is_blocking_issue`) rather than reimplementing the
rule, so this measures the cap and not a model of it. Its falsifiers are in
`ai_router/tests/test_measure_doc_only_cap.py`, including a planted doc-only
Major proving the `capped` counter can be non-zero — without it, the zero below
would be indistinguishable from a counter structurally stuck at zero (L-112-1).

## The answer

> **The cap did not fire. Not once, on any finding, in any round, in any of the
> four sessions — the first genuinely prose-heavy work since it shipped.**

Per the spec, that is a **successful outcome of this step**: it is the answer
the sequencing note asked for, and it is now evidence rather than an assumption.

## Per round

| artifact | S | R | findings | cited `evidencePaths` | doc-only | code-only | **mixed** | capped |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `s1-issues.json` | 1 | 1 | 4 | 4 | 0 | 4 | 0 | **0** |
| `s1-issues-round-2.json` | 1 | 2 | 1 | 1 | 0 | 1 | 0 | **0** |
| `s1-issues-round-3.json` | 1 | 3 | 1 | 1 | 0 | 1 | 0 | **0** |
| `s1-issues-round-5.json` | 1 | 5 | 1 | 1 | 0 | 0 | 1 | **0** |
| `s2-issues.json` | 2 | 1 | 7 | 7 | 0 | 3 | 4 | **0** |
| `s2-issues-round-2.json` | 2 | 2 | 1 | 1 | 0 | 0 | 1 | **0** |
| `s2-issues-round-3.json` | 2 | 3 | 1 | 1 | 0 | 0 | 1 | **0** |
| `s3-issues.json` | 3 | 1 | 3 | 3 | 0 | 1 | 2 | **0** |
| `s3-issues-round-2.json` | 3 | 2 | 1 | 1 | 0 | 0 | 1 | **0** |
| `s4-issues.json` | 4 | 1 | 2 | 2 | 0 | 0 | 2 | **0** |
| `s4-issues-round-2.json` | 4 | 2 | 1 | 1 | 0 | 0 | 1 | **0** |
| **TOTAL** | | | **23** | **23** | **0** | **10** | **13** | **0** |

## What the numbers say

**1. Path citation is universal, and stayed universal.** 23 of 23 findings
named `evidencePaths` — 100%, holding the jump Set 119 S1 produced (0 of 581
across sets 057–117). The mechanism the cap depends on is healthy. Nothing here
is a citation-adoption problem.

**2. Not one finding was doc-only.** Zero, across four sessions whose
deliverables were guidance prose, a config block, two lints, a ledger and a
measurement module. The spec predicted this was possible and asked for it to be
measured rather than assumed. It is now measured.

**3. Mixed citations are the reason, and they are now the clear majority.**
13 of 23 findings (**57%**) cite documentation *and* code together. The spec
measured 5 of 13 (38%) while it was being authored and named this as *"the
plausible failure mode"*. On this set it did not merely persist — it grew.
**Session 4's own findings are the sharpest case: all three cite doc and code
together, and not one is doc-only**, on a session that changed almost nothing
but documentation. The cap requires **every** named path to be documentation,
so all 13 kept their declared severity.

**This is not a defect in the reviewers.** It is the correct behaviour for the
work. A verifier reviewing a change to `guidance-lifecycle.md` that describes
what `guidance_ledger.py` does will read both files and cite both, because the
finding *is* that the two disagree. On prose that documents code, doc-and-code
is the honest citation — and honest citation defeats the cap.

**4. Rounds per session did not move.** The completed metered rounds are
`{1: 6, 2: 5, 3: 4, 4: 4}` (only `round-completed` ledger rows count;
`operator-authorization` rows record permission, not a round that ran — S4's own
verification caught this session counting them, see the residual note below).

> **The pre-cap median of 4.0 is not directly comparable, and the difference is
> structural rather than caused by the cap.** It was measured over sets
> 111–116, which predate the *phased* loop. Every session here spends one round
> on `--phase supplementary`, which is a deliberate harvest before remediating,
> not a re-round opened by a finding. Netting that round out gives 5, 4, 3 for
> sessions 1–3 — a median of **4.0**, exactly the pre-cap figure.
>
> **The honest statement is that the cap moved rounds neither up nor down,
> because it never applied to anything.** It cannot be credited or blamed for a
> number it did not touch.

## The counterfactual, which is a measurement and not a proposal

Of the round artifacts carrying a blocking finding, a majority carried *only*
mixed-citation blockers — 6 of 11.
Every one of them is a late remediation-review round, which is where round cost
concentrates.

So the question *"would widening the cap to mixed citations have helped?"* has a
concrete size.

**That question is not answered here, and this session did not act on it.**
Spec decision 5 is explicit: the cap's design is settled and operator-attested,
this set may measure it and report, and widening it to cover mixed citations
*"would be a verification reduction"* requiring a fresh operator ruling. The
constitution's carve-out is harder still — anything that reduces verification is
never self-authorized, and `decision_journal` refuses to write it. The number
exists so the operator has something to rule on. It is not a recommendation.

**And the argument against widening is strong enough to state**, because the
measurement alone reads as an argument for it. The rounds in question found real
defects, not wording. S1 round 5 found a wrapper contradicting what it wrapped.
S3 round 2 found `close_session` treating valid `G-*` ids as unknown. S4's own
round 1 found this very measurement counting authorization rows as verification
rounds — a false number in the session's headline deliverable, cited against
`measure_doc_only_cap.py` *and* `s1-rounds.jsonl` *and* the report, which is
precisely a mixed citation. **A cap that suppressed mixed findings would have
suppressed the finding that corrected this document.**

The doc-only cap's justification was that the findings it suppresses are
*wording*. Nothing in this measurement suggests mixed findings are wording — on
this evidence they are where the real defects were.

## What this sizes

The spec deferred the judgment-heavy triage of `project-guidance.md`'s prose
entries and said this measurement should size it. It does, in the direction that
matters: **prose-heavy work in this repo does not generate doc-only findings**,
so a future triage set must not budget for the cap to shorten its loop. Plan it
at the full pre-cap round cost.
