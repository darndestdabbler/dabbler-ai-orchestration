# Consequence-Graded, Phased Verification Spec

> **Purpose:** Make the Set 095 verification-churn fix durable and
> framework-level: encode the operator's **consequence-based severity
> rubric** (Major = probability the stated failure scenario materializes
> for a real user × material impact on the deliverable's objectives) into
> the shipped `session-verification` machinery, and restructure the
> verification loop into **discovery → supplementary discovery →
> remediation-review** phases so churn cannot compound. Primary evidence:
> Set 095's loop (17 non-converging rounds / 39 fresh Majors under the
> ungraded prompt; **VERIFIED on the first round graded by the rubric** —
> R18, replicated R20), the salience-limited-reviewer analysis, and the
> operator's phase-design direction of 2026-07-12. Lesson carrier until
> this ships: L-095-1.
> **Created:** 2026-07-12 (operator-prioritized the same day — supersedes
> the routed 077-first ranking in Set 095's `s1-next-set-analysis.json`)
> **Session Set:** `docs/session-sets/096-consequence-graded-phased-verification/`
> **Prerequisite:** None (Set 095 complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # CLI/framework surfaces only; no UI change.
requiresE2E: false
pathAwareCritique: advisory   # Gate-machinery change — a second-surface critique is cheap insurance (Set 070 precedent).
prerequisites: []
```

---

## Project Overview

### The problem (measured, Set 095)

- Reviewers are **salience-limited, not context-limited**: bundles used
  ~25% of gpt-5-6's 272k window, yet findings latent since round 1 kept
  surfacing in rounds 5–16. Each pass returns the most salient handful;
  each fix reshuffles salience.
- **Ungraded severity does not converge**: 17 rounds, 39 blocking
  findings, all technically real, zero disputed, cost $4.88 — no clean
  round until the operator's consequence rubric entered the conventions
  block (R18: VERIFIED, zero findings; replicated R20).
- **~1/3 of findings were fix-induced** — defects in remediation-added
  content, i.e. churn the sequential loop manufactured.
- Cross-set corroboration: 091 = 6+6 rounds, 093 = 7+11, 094 = 8+2
  (operator-capped); 092's short 3+3 used a mixed verifier pool.

### The design (operator-directed, refined in the Set 095 session report)

1. **Consequence-graded severity, in the template** — not per-session
   conventions blocks.
2. **Phases**: `INITIAL_DISCOVERY` (all severities, exhaustive
   enumeration) → `SUPPLEMENTARY_DISCOVERY` (only when C/M found; runs
   BEFORE any remediation; decorrelated — different provider or
   completeness-critic framing) → `REMEDIATION_AND_REMEDIATION_REVIEW`
   (reviewer scoped to the fix delta + ledger; verdicts fix-accepted /
   fix-rejected / accepted-with-modification; new defects admissible only
   within the fix hunks; Minors recorded, never re-rounded).
3. **Empirical gate first**: the operator's fan-out question — do K
   same-state parallel reviews harvest the latent findings, and is that
   cheaper than sequential rounds? — is measured before the phase
   machinery is built, and sizes the discovery fan-out (same-model K vs
   cross-provider mix).

---

## Sessions

### Session 1 of 2: Fan-out experiment, rubric in the template, ledger machinery

**Steps:**
1. Register; read this spec, Set 095's `s1-cross-round-ledger.md` +
   `s1-issues*.json` (the evidence corpus), L-095-1, and the current
   `verify_session` / session-verification template / issue-parser code.
2. **Fan-out experiment (before any design commitment):** against a
   frozen artifact state (replay the Set 095 pre-close corpus via
   `--diff-base`-style evidence assembly on a scratch checkout), run K=3
   same-model discovery calls plus 1 cross-provider call with identical
   bundles; measure pairwise unique-finding overlap. Deliverable:
   `s1-fanout-experiment.md` (raw finding sets + overlap matrix + a
   sizing recommendation for the discovery phase). Budget ≤ $2.
3. **Rubric into the shipped template:** the consequence-severity
   definitions (verbatim from L-095-1 / the operator's 2026-07-12
   rubric) plus a **mandatory per-finding `failure_scenario`** with a
   probability justification; a finding without a plausible scenario
   grades Minor by definition. Template version bumped; the
   verification-stamp template hash and its pins updated.
4. **Issue schema + parser:** `sN-issues.json` gains an optional
   `failureScenario` field (tolerant parse; `docs/session-issues-schema.md`
   updated); `classify_blocking` semantics unchanged.
5. **Cross-round ledger as machinery:** `verify_session` auto-assembles
   the settled-points ledger from prior rounds' `sN-issues*.json` (+ a
   per-round remediation-note sidecar) and prepends it to the prompt —
   retiring the hand-carried ledger file for the no-resurrection function
   (the `--conventions-file` stays for suite baseline / scope).
6. Tests (template pins, parser, ledger assembly, rubric-text presence);
   docs touched in-flight; build + full suite; verify (mandatory — this
   session dogfoods its own rubric); disposition; commit + push;
   `close_session`; notify.

**Creates:** `s1-fanout-experiment.md`, template vN, ledger machinery +
tests.
**Touches:** `ai_router/prompt-templates/*session-verification*`,
`ai_router/verify_session.py`, `ai_router/verification*.py` (parser),
`docs/session-issues-schema.md`, tests.
**Ends with:** rubric + failure-scenario field live in the shipped
template (hash-pinned); ledger auto-carry proven by a unit-tested
assembly; the fan-out experiment memo recommends the discovery-phase
shape with measured overlap data; suite green; cross-provider VERIFIED
under the new rubric.
**Progress keys:** fanout-experiment-run, rubric-in-template,
issue-schema-updated, ledger-machinery-live, session-closed

### Session 2 of 2: Phased loop in verify_session, policy docs, release prep

**Steps:**
1. Register; read S1's experiment memo + shipped state.
2. **Phase modes in `verify_session`:** `--phase discovery` (exhaustive
   enumeration framing, all severities, raised output budget; fan-out
   per S1's sizing — sequential calls acceptable if parallelism is
   awkward in the CLI), `--phase supplementary` (auto-suggested when
   discovery yields C/M; prefers a different provider when a third
   family is available, else completeness-critic framing against the
   pass-1 findings), `--phase remediation-review` (evidence = fix delta
   since the discovery baseline + the auto-ledger; per-finding verdicts
   fix-accepted / fix-rejected / accepted-with-modification; new
   defects admissible only within fix hunks). Default invocation
   without `--phase` keeps today's behavior (compat).
3. **Loop policy rewrite:** `docs/ai-led-session-workflow.md` Step 6/7
   restructured around the phases with bounded totals (≤2 discovery
   passes; ≤2 remediation-review cycles before operator adjudication);
   `docs/session-constitution.md`'s Step 6/7 pointers and the
   bounded-round language updated to match (echo sweep per L-065-1).
   The severity gate and the operator's round-cap authority are
   preserved verbatim.
4. **Config:** discovery fan-out size + provider-diversity preference
   under `verification:` in `router-config.yaml` (values from S1's
   memo), documented inline.
5. **Convergence replay:** re-run the Set 095 corpus (frozen state)
   through the phased loop end-to-end once; record rounds/cost vs the
   095 baseline in the change-log (the falsifier for the whole set).
6. Tests; CHANGELOG + `dabbler-ai-router` version bump (release prep —
   publish stays operator-gated); build + full suite; verify
   (mandatory); disposition; end-of-set `change-log.md`; commit + push;
   `close_session`; notify; Step 9 review; advisory path-aware critique
   artifact per the recorded policy.

**Creates:** phase modes + tests, `s2-convergence-replay.md`,
`change-log.md`.
**Touches:** `ai_router/verify_session.py`, `router-config.yaml`,
`docs/ai-led-session-workflow.md`, `docs/session-constitution.md`,
`ai_router/CHANGELOG.md`, version metadata.
**Ends with:** the phased, consequence-graded loop is the default
documented Step 6/7 procedure; the 095-corpus replay demonstrates
bounded convergence at materially lower cost; compat path intact;
suite green; cross-provider VERIFIED; release prep complete
(operator-gated publish).
**Progress keys:** phase-modes-live, policy-docs-rewritten,
config-seeded, convergence-replay-recorded, set-closed

---

## End-of-set deliverables

- Consequence-graded severity + mandatory failure scenarios in the
  shipped verification template (L-095-1 retires into "encoded in the
  template" at the next guidance triage).
- The three-phase verification loop in `verify_session`, sized by the
  measured fan-out experiment, with the no-resurrection ledger as
  machinery.
- Step 6/7 policy docs rewritten; bounded totals; compat preserved.
- The Set 095 corpus replay demonstrating convergence — the set's
  falsifier.
