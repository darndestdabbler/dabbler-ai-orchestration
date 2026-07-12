# Fan-out experiment memo — Set 096 Session 1 (spec step 2)

> **Question (operator, 2026-07-12):** do K same-state parallel reviews
> harvest the latent findings a sequential loop trickles out over rounds,
> and is that cheaper than sequential rounds? The answer sizes the
> `INITIAL_DISCOVERY` fan-out Session 2 builds into `verify_session`.
> **Run:** 2026-07-12, BEFORE any Set 096 design commitment (the prompt
> used the then-shipped v2 template + the operator rubric in the
> conventions block — exactly the Set 095 R18/R20 regime — plus an
> exhaustive-enumeration discovery framing).

## Design

- **Frozen state:** scratch worktree at `b16dd58` — the exact tree Set
  095's second clean rubric round (R20) verified; all 39 remediated
  Majors are fixed in it. Evidence assembled by `verify_session`'s own
  `assemble_evidence` with `--diff-base 34d4149` (the 095 pre-session
  ref); the 095 set-dir review machinery excluded (disclosed in the
  bundle as excluded tracked paths, and named in the conventions block).
- **Identical bundles:** all four calls received the byte-identical
  130,010-char prompt (112,316 evidence chars).
- **Runs:** a, b, c = gpt-5-6 (the `session-verification` pin; anthropic
  excluded), independent calls. d = gemini-3-1-pro (anthropic + openai
  excluded). No `session_set`/stamp on any call — experiment rows can
  never masquerade as this session's verification or corroborate a close.
- **Cost:** $0.80 total (a $0.271, b $0.241, c $0.238, d $0.047) plus a
  $0.024 routed overlap analysis — under the ≤ $2 budget.

## Raw finding sets

Immutable routed artifacts: `s1-fanout-run-{a,b,c,d}.md` (raw responses),
`s1-fanout-findings.json` (parsed sets), `s1-fanout-analysis.md` (the raw
routed overlap/sizing analysis, gemini-pro).

| Run | Model | Verdict | Issues (C/M) | NITS | Distinct findings (matched) |
| :-- | :-- | :-- | :-- | :-- | :-- |
| a | gpt-5-6 | ISSUES_FOUND | 3 | 4 | 7 of 16 (44%) |
| b | gpt-5-6 | ISSUES_FOUND | 3 | 7 | 10 of 16 (63%) |
| c | gpt-5-6 | ISSUES_FOUND | 1 | 5 | 7 of 16 (44%) |
| d | gemini-3-1-pro | VERIFIED | 0 | 0 | 0 of 16 (0%) |

16 distinct findings after same-point matching (F1–F16 in
`s1-fanout-analysis.md` §1; the matching and matrix arithmetic were
re-checked by the orchestrator against the raw sets and are consistent).

## Overlap matrix (distinct findings, Issues + NITS pooled)

| Pair | Intersection | Union | Jaccard |
| :-- | :-- | :-- | :-- |
| a–b | 2 | 15 | 0.13 |
| a–c | 3 | 11 | 0.27 |
| b–c | 4 | 13 | 0.31 |
| a–d / b–d / c–d | 0 | 7 / 10 / 7 | 0.00 |

**The same-model pairwise overlap is LOW (Jaccard 0.13–0.31).** Three
independent same-model, same-prompt, same-state calls returned largely
disjoint finding sets — direct confirmation of the Set 095
salience-limited-reviewer analysis, now measured at the finding level.

## Marginal yield and coverage

- Single run captures **44–63%** of the observed pool (mean 50%).
- K=2 same-model captures **69–94%** depending on the pair (mean **81%**;
  the routed analysis' "94%" is the best pair a∪b, not the expectation —
  orchestrator correction).
- The third same-model run added **1** new finding (F16); the
  cross-provider run added **0**.
- Union saturation is unknown (three productive runs cannot bound the
  true latent pool), but the yield curve flattened hard: 7 → +8 → +1 → +0.

## Decorrelation read (run d)

gemini-3-1-pro returned **VERIFIED with zero findings** — not even the
clear-cut mechanical nits (filename collision F7, prompt-injection F11).
The routed analysis reads this as **under-finding, not stricter grading**,
and the orchestrator concurs: a rubric-strict grader would still have
*reported* the observations (as NITS — the framing explicitly requested
them); it reported nothing. For this provider pair, cross-provider mixing
in a **discovery/harvest** role reduces yield per dollar; provider
diversity retains its value in the **verdict** role (severity
calibration, false-positive control — and the standing cross-provider
verification invariant is untouched by this experiment).

## Severity-stability caveat (orchestrator observation)

F2 (hotfix drill validates only the changed module before tagging) was
graded **Major by run a and NIT by run c** — same model, same prompt,
same state. And this twice-VERIFIED state yielded 5 rubric-graded Majors
once the framing demanded exhaustive enumeration. Two readings coexist:
the discovery framing surfaces genuinely latent findings sequential
rounds missed (the routed analysis' read — the finding content supports
it), and/or exhaustive framing inflates severity at the margin. Either
way the design implication is the same and matches the operator's phase
direction: **separate the harvest role (discovery, all severities,
exhaustive) from the blocking-verdict role (rubric-graded severity on
the deduplicated union)** — do not let one call do both jobs.

## Sizing recommendation (feeds Session 2's `--phase discovery`)

1. **Discovery fan-out K=2, same model** (the pinned session-verification
   verifier), identical bundles, independent calls; merge and dedupe the
   two finding sets. Expected harvest ~81% of the observable pool at
   ~$0.50 and one round of wall-clock — vs the 095 sequential baseline
   (17 rounds, $4.88, serial remediation between every round).
2. **Supplementary discovery** (the spec's `SUPPLEMENTARY_DISCOVERY`,
   only when discovery yields C/M, before any remediation): the measured
   evidence favors **same-model with completeness-critic framing**
   (prompt-decorrelated) over provider switching for *harvest*; a
   different-provider pass is worth keeping as the *decorrelated
   verdict signal* on high-stakes findings, not as a finder. When a
   third family is available it may still be preferred for independence
   — Session 2 should encode provider-diversity as a *preference knob*,
   not a hard rule (config: `verification.discovery.fan_out: 2`,
   `verification.discovery.provider_diversity: same-model` defaults,
   values operator-tunable).
3. **K=3 is not worth it as a default** (+$0.25 for +1 finding here);
   the third slot's budget is better spent on the supplementary pass
   contingent on C/M findings.

## Threats to validity

- n = 1 artifact state, docs-heavy deliverable, one provider pair; the
  16-finding pool is what three runs observed, not the true latent pool.
- The severity grades are single-call judgments (see F2 instability);
  the phased design re-grades the union, which mitigates this.
- Run d's zero-harvest is one call by one model on one artifact — it
  motivates the *preference* default, not a ban on cross-provider
  discovery.

## Deferred to the operator (out of this set's scope)

The 5 rubric-graded Majors (F1–F5) are latent findings against the
**shipped Set 095 deliverables** (`docs/tutorials/module-team-hello-world.md`
and its review prompt) — most materially F5/F6 (the walkthrough never
pins the `unittest` test-framework contract its CI enforces, and Part
10's entry-point assumption), F1 (`reviewDecision` treated as
enforcement proof), F3 (ADVISORY caps can suppress proven failures), F4
(owner-roster gap), F2 (hotfix drill's module-only validation before
tagging). Whether these warrant a follow-up docs set is an operator
call; this set's scope is the verification machinery, and the findings
are recorded here (with raw artifacts) rather than silently dropped.
