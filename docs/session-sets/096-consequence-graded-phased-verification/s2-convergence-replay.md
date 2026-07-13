# Convergence replay — Set 096 Session 2 (spec step 5, the set's falsifier)

> **Question:** does the phased, consequence-graded loop converge —
> bounded rounds, materially lower cost — on the exact corpus whose
> sequential ungraded loop did not (Set 095: 17 non-converging rounds /
> 39 fresh Majors / $4.88 before the first rubric-graded clean round)?
> This is a **loop-shape demonstration on the remediated corpus and its
> latent findings, not a defect-for-defect A/B against the original
> 39-Major workload** — see *Two qualifications* below before quoting
> the numbers.
> **Run:** 2026-07-12, end-to-end through the shipped `--phase`
> machinery (the actual CLI code paths, live routed calls), on the
> frozen Set 095 pre-close corpus.

## Design

- **Frozen state:** scratch worktree at `b16dd58` — the exact tree Set
  095's second clean rubric round (R20) verified; all 39 remediated
  Majors are fixed in it. Deliverable under review:
  `docs/tutorials/module-team-hello-world.md` + its companion review
  prompt. Evidence assembled by the CLI itself with `--diff-base
  34d4149` (the 095 pre-session ref); both session-set dirs excluded
  (disclosed as excluded tracked paths) — the same regime as the S1
  fan-out experiment, whose identical bundle was 112,316 evidence chars
  vs 108,839 here.
- **Loop:** the real shipped commands, in the documented order —
  `--phase discovery` (fan-out K=2 from the shipped config, identical
  bundles) → `--phase supplementary` (completeness-critic, same-model
  default) → one remediation batch + settlement sidecars → `--phase
  remediation-review` (tree-to-tree fix delta + auto-ledger) → one
  bounded re-cycle. Verifier per the pinned session-verification route:
  gpt-5-6 (anthropic excluded — the scratch state file mirrors this
  session's orchestrator identity).
- **Isolation:** the replay's routed calls are stamped against the
  scratch set (`096-s2-replay`, session 1), so they can never
  masquerade as, or corroborate, this real session's verification
  (different set slug AND session number). Raw artifacts preserved here
  as `s2-replay-*`; the scratch worktree is removed after the run.

## The run, round by round

| Round | Phase | Result | Cost |
| :-- | :-- | :-- | :-- |
| 1 | discovery (K=2, identical bundles) | ISSUES_FOUND — 4 Majors, **disjoint across the two calls** (call 1: ADVISORY-cap masking; call 2: hotfix-drill validation, reviewDecision-as-enforcement, CODEOWNERS circularity) | $0.4532 |
| 2 | supplementary (completeness critic) | ISSUES_FOUND — **1 genuinely new Major** (post-cleanup auditability: branch deletion breaks the review's merged-work audit); **zero re-reports** of the round-1 findings | $0.2364 |
| — | remediate once against the merged 5 | fixes to both tutorial docs; sidecars written | — |
| 3 | remediation-review (fix delta, 5.3k-char diff) | ISSUES_FOUND — fix verdicts **2 accepted / 1 rejected / 2 accepted-with-modification**; 1 new **in-hunk** Major (the new copy-paste validation block did not gate the tag push on test failure — a fix-induced defect, caught inside the fix hunks exactly as the phase scopes it) | $0.1009 |
| 4 | remediation-review (cycle 2) | **VERIFIED — 6/6 fix verdicts accepted, zero findings** | $0.0552 |

**Totals: 4 rounds, 6 routed calls, $0.8457, one remediation batch plus
one micro-fix — converged exactly at the bounded totals (2 discovery
passes, 2 remediation-review cycles).**

## Against the Set 095 baseline

| | Set 095 (sequential, ungraded → rubric) | This replay (phased, rubric in template) |
| :-- | :-- | :-- |
| Rounds to a clean verdict | 17 non-converging + rubric R18 (replicated R20) — ~20 total | **4** |
| Cost | $4.88 through R17 | **$0.85** |
| Fix-induced churn | ~1/3 of later findings were defects in remediation-added content, discovered a round late on full-bundle evidence | 1 fix-induced defect, caught **in the fix hunks, same round family**, fixed for $0.06 |
| Harvest shape | most-salient handful per round, reshuffled by every fix | 4 Majors in one fanned-out round (disjoint call sets — Jaccard 0 on Majors between calls), +1 from the decorrelated critic pass |

Two qualifications, stated plainly:

1. **The corpora are not identical in defect content.** The 095 baseline
   loop was finding (and inducing) its 39 Majors on a moving tree; this
   replay started from the remediated tree and harvested the **latent**
   findings the S1 fan-out experiment first exposed (F1–F4 class) plus
   one new one. What the replay demonstrates is therefore the loop's
   SHAPE on a real corpus — bounded convergence, up-front harvest,
   fix-delta scoping catching a fix-induced defect — not a
   defect-for-defect A/B. The cost/round comparison stands as the
   operational difference a session actually experiences.
2. **Same verifier family throughout** (gpt-5-6, anthropic excluded) —
   matching the 095 regime, so the delta is attributable to the loop
   structure and template, not a verifier swap.

## Machinery observations (all live-path, no seams faked)

- The fan-out merged envelope carried per-issue `discoveryCall` and the
  `discoveryBaselineTree` snapshot; `--phase remediation-review`
  resolved that baseline across two intervening rounds and diffed
  tree-to-tree (the fix delta reads added files as content, not
  deletions).
- The supplementary pass's do-not-re-report block held: one new Major,
  zero duplicates — prompt decorrelation worked as the S1 memo
  predicted (same-model default; the cross-provider knob stayed off).
- The auto-ledger rendered rounds 1–2 as settled (non-empty sidecars =
  settlement evidence) and the review verdicts referenced them by name;
  `fixVerdicts` parsed into the round-3/4 envelopes and the round-4
  clean verdict enumerated all 6 accepted.
- Remediation-review evidence is small (fix delta), so late rounds are
  cheap: $0.10 → $0.06 as the delta shrank.

## Side product for the operator

The five Majors are real defects in the **shipped** Set 095
deliverables (the S1 memo deferred F1–F5 to the operator; this replay
re-found four of that class and added the auditability gap). The full
remediation — reviewed and VERIFIED by the replay's own loop — is
preserved as [`s2-replay-fix.patch`](s2-replay-fix.patch) (169 lines,
both tutorial docs), ready to apply to `main` under whatever docs set
the operator chooses to schedule. This set's scope remains the
verification machinery; the patch ships as evidence, not as landed
work.

## Raw artifacts (immutable)

`s2-replay-discovery-{a,b}.md`, `s2-replay-supplementary.md`,
`s2-replay-remediation-review-{1,2}.md` (raw verifier outputs);
`s2-replay-findings-round-{1,2,3}.json` (merged envelopes, with
`phase` / `discoveryBaselineTree` / `discoveryCall` / `fixVerdicts`);
`s2-replay-remediation-notes-{1,2,3}.md` (the settlement sidecars);
`s2-replay-fix.patch`.
