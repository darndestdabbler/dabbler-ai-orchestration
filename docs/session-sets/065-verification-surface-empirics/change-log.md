# Change Log — Set 065: Verification-Surface Empirics

> **Set complete.** 3 of 3 sessions, all cross-provider VERIFIED. A
> research/proposal set: produces evidence and a scored, verified proposal — it
> ships **no** production code and **no** release. The production work is a
> future implementation set (see `next-set-rec.md`).
> **Closed:** 2026-06-14.

## What this set answered

Whether the **path-aware adversarial critique** should be promoted to a
first-class workflow stage, whether per-session **routed** cross-provider
verification still earns its keep once path-aware critique exists, and — if
path-aware is automated — via which integration surface. The deliverable is a
data-grounded, rubric-scored proposal, not a workflow change.

## Sessions

### Session 1 — Retrospective bake-off (VERIFIED)
Mined harvester Sets 008–012 (n=5), each of which ran both a single-validator
routed verification and a path-aware GPT+Gemini critique.
- **Deliverables:** `bake-off-results.md`, `bake-off-data.json`,
  `forward-ab-design.md`.
- **Findings:** 12 unique real defects path-aware caught that routed missed
  (mostly Major; two wrong-data/structural Criticals C9, C3); **~92% probeable**;
  context-access (012 C3, same-provider isolation) and provider-diversity (010)
  both real and entangled at n=5; **"is routed worth keeping" is unanswerable**
  retrospectively (order confound) → a forward A/B (Experiment A capability +
  Experiment B cadence) is the clean instrument.
- **Verification:** gpt-5.4, R1 ISSUES_FOUND (1 Major + 3 Minor) → R2 VERIFIED.

### Session 2 — Integration-surface spike (VERIFIED)
Hands-on, read-only spike: which surface can run path-aware critique headless.
- **Deliverables:** `spike-report.md`, `spike_first_party_adapter.py`,
  `copilot-trace-sample.jsonl`, `first-party-trace-sample.json`.
- **Findings: GO** — path-aware critique can be a routed call. A first-party
  httpx tool-loop adapter (~$0.024/run, metered BYOK) and the GitHub Copilot CLI
  (subscription, Claude-only on the seat tested) each caught both catch-classes
  3/3 with confirmed tool use. **Primary recommendation: the first-party
  adapter** (multi-provider control + anti-bias deterministic-servant ownership +
  httpx-only footprint); Copilot CLI the $0-marginal alternative for seat-holders.
- **Verification:** gpt-5.4, R1 ISSUES_FOUND (1 Major + 2 Minor, calibration) →
  R2 VERIFIED.

### Session 3 — Synthesis proposal (VERIFIED) — this session
Consolidated S1 + S2 + the pre-065 consensus into one scored, verified proposal.
- **Deliverables:**
  `docs/proposals/2026-06-14-verification-surface-empirics/proposal.md`,
  `consensus-journal.md`; routed open-question analysis `s3-openq-analysis.md`;
  routed next-set recommendation `next-set-rec.md`; this `change-log.md`.
- **Recommendations (each scored against the complexity/quality rubric):**
  - **(a) Promote Path-Aware Critique** as a tier-orthogonal per-set attribute
    `none | advisory | required`, multi-provider, end-of-set, with `required`
    auto-gated by blast radius. **ADOPT.**
  - **(b) Keep per-session routed verification unchanged for now** — do not
    demote/retire on current evidence; its cadence defense is plausible but
    unmeasured. **Decision deferred to the forward A/B (Experiments A *and* B).**
  - **(c) Manual now → automated later**, phased: institutionalize + instrument
    the manual critique, build the first-party adapter (primary), Copilot CLI the
    alternative. **ADOPT.**
  - **(d) Pre-registered falsifiers: ADOPT** for the ~92% probeable share;
    **contract-test/CDC gate: ADOPT** for fully-encodable functionality *with*
    the three hole-fixes (independent contract review, held-out fresh tests,
    residual novel critique). **Reject** working-agent per-claim mid-session
    falsifier authoring.
  - **Open question resolved (blast-radius-gated, corroborated by routed
    gemini-pro analysis):** same-agent may author falsifiers/contract *and*
    implement for low-blast-radius / probeable work under strict
    temporal-separation + immutability; **independence is mandatory** for
    high-blast-radius / cross-artifact / ambiguous-novel work.
  - **Unifying rule:** one *core* blast-radius predicate (`P_task` for
    task-level delegation-mode + author-independence; `P_set = any(P_task)` for
    the set-level `required` gate), plus a named heuristic extension
    (ambiguity/novelty) for author-independence only.
- **Verification:** gpt-5.4, R1 ISSUES_FOUND (5 Major + 1 Minor, all
  consistency/calibration) → R2 (3 residual) → R3 (1 residual) → **R4 VERIFIED**,
  no new inconsistency.

## Verification method

`verification_method: api` — cross-provider `session-verification` routed to a
different provider than the Claude orchestrator (gpt-5.4) every session.

## What this set deliberately did NOT do

No edits to `close_session`, `router-config.yaml`, the extension, or guidance
docs; no CLI adapter shipped (S2 was a throwaway spike); no PyPI / Marketplace
release. The routed keep/demote/retire decision is explicitly deferred to a
future forward A/B.

## Recommended next set

`mode2-pull-verifier-adapter` (routed rec, gemini-pro): build the first-party
tool-loop adapter as the production Mode-2 engine *and* the forward-A/B execution
vehicle — the foundational prerequisite for the rest of the proposal's
sequencing. ~4 sessions, ships a release. See `next-set-rec.md`.

## Cost

Routing + verification this session: open-question analysis $0.0101 (gemini-pro)
+ proposal verification 4 rounds $0.169 + $0.127 + $0.100 + $0.049 = $0.445
(gpt-5.4) + next-set rec $0.0033 (gemini-pro) ≈ **$0.46**. No metered spike cost
this session (no code run).
