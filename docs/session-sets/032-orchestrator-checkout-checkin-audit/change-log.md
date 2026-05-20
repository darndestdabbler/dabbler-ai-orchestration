# Set 032: Orchestrator check-out / check-in — audit cycle

**Status:** COMPLETE (2 of 2 sessions complete; closed 2026-05-19)
**Created:** 2026-05-19
**Cost:** ~$0.102 routed (S1 $0.044 incl. R-A + R-B verification +
S2 $0.058 = $0.020 spec cross-review + $0.038 R-A verification).
GPT-5.4 via manual paste = $0.00.
**Forecast:** $0.10–$0.40 (spec); **actual: ~$0.10** — landed
inside the forecast band.
**NTE ceiling:** $1.00 (operator-confirmed at Session 1 start).
~$0.90 headroom remained at close.

---

## Context

Set 029 Session 6 closed mid-iteration on the
`Set Orchestrator…` / Writer Log architecture question with cross-
provider rounds (Gemini Pro R1, GPT-5.4 R1+R2) endorsing migration
to a check-out / check-in coordination model — but with three Highs
(H1 writer authority, H2 single source of truth, H3 hard vs.
advisory) and two open questions (OQ1 field merge, OQ2 events as
types or aliases) unresolved.

Per [[feedback_audit_then_spec_for_substantial_features]], the
operator chose the audit-then-spec pattern: Set 032 is the AUDIT
half (resolve the must-resolves, author the implementation spec);
Set 033 is the IMPLEMENTATION half (executes the authored spec).

Pre-audit artifacts (proposal.md, proposal-addendum.md, both
engines' R1 + R2 verdicts) are FROZEN at
`docs/proposals/2026-05-19-orchestrator-tracking-architecture/`
([[project_set_032_033_orchestrator_checkout_checkin]]).

---

## Session 1: Resolve Highs + open questions via cross-engine consensus (COMPLETE 2026-05-19)

**Verdict:** VERIFIED after Round A REJECT + one fix + Round B PASS.

**What was routed:**

- Authored
  `docs/proposals/2026-05-19-orchestrator-tracking-architecture/audit-resolution-request.md`
  (9.5k chars; the spec's 2–4k estimate proved low) — each of
  H1/H2/H3/OQ1/OQ2 carries pre-audit recommended verdict + rationale +
  implication + reject-alternative call-out + out-of-scope fences.
- Gemini Pro audit-resolution call: routed succeeded ($0.008,
  2572 in / 520 out). Confirmed all 5 originals.
- GPT-5.4 audit-resolution call: routed 429ed after 3 attempts;
  recovered via manual paste per the pre-audit pattern. Confirmed
  all 5 originals AND raised a sixth must-resolve item: H4 (holder
  identity key — given the orchestrator block's mutable fields,
  conflict-equality needs explicit rules).
- H4 follow-up: authored `audit-resolution-h4-request.md` + routed
  through Gemini Pro ($0.004, 1221 in / 231 out). Gemini REFINED
  the engine-only pre-audit answer to `engine + provider` composite
  (future-proofing for Claude-via-Anthropic vs. Claude-via-Bedrock).
- Operator adjudication on H4 divergence (GPT permitted any stable
  subset; Gemini specified composite) via `AskUserQuestion` =
  **lock the composite**.

**Six verdicts locked** (full reasoning in
[`proposal-addendum.md`](../../proposals/2026-05-19-orchestrator-tracking-architecture/proposal-addendum.md)
§9):

| Item | Verdict |
|---|---|
| **H1** Writer authority | Router-only writes; hooks become invokers |
| **H2** Single source of truth | `session-state.json` canonical; `.dabbler/orchestrator.json` RETIRED |
| **H3** Hard vs. advisory | Hard coordination at write time + explicit operator override (refusal error names holder + release paths) |
| **H4** Holder identity key | `engine + provider` composite |
| **OQ1** Field merge | Merge into existing `orchestrator` block; +2 nested fields (`checkedOutAt`, `lastActivityAt`) |
| **OQ2** Events as types or aliases | Aliases — no ledger schema change |

**Round A verification (gemini-pro, $0.013):** REJECTED on one
must-fix — H3 refusal-error-content (the audit packet specified
the refusal error must name holder + release paths, but the
addendum §9 / README only listed the release paths without saying
the error message must contain them). Patched both files.

**Round B verification (gemini-pro, $0.019):** all 6 verdicts
VERIFIED with quoted cross-reference to both source files for
each. No new must-fix items.

**Session 1 routed spend:** ~$0.044 of $1.00 set NTE.

---

## Session 2: Draft Set 033 implementation spec + close-out (COMPLETE 2026-05-19)

**Verdict:** Spec authored, cross-reviewed by Gemini Pro
(approve-with-suggestions), suggestions applied, audit-input README
updated to reflect "implementation spec authored" state, change-log
authored, session verification + close pending at change-log
authorship time (filled in at close).

**What was authored:**

- [`docs/session-sets/033-orchestrator-checkout-checkin-implementation/spec.md`](../../session-sets/033-orchestrator-checkout-checkin-implementation/spec.md)
  — REPLACES the placeholder. 6-session implementation plan
  threading the 6 locked verdicts through Steps / Creates / Touches /
  Ends-with / Progress-keys per the canonical spec template.
  Per-session split per Session 1's `ai-assignment.md`
  recommendation:
  - **S1** — State machine on `session-state.json` +
    `start_session` refactor (H1 + H3 + H4 + OQ1)
  - **S2** — Marker retirement (H2) + `resolveActiveSet()` →
    `listInProgressSets()` + banner removal
  - **S3** — UI rename (`dabbler.setOrchestrator` →
    `dabbler.checkOutOrchestrator`) + Command Palette
    "Release Check-Out" + Claude hook refactor to invoker (H1)
  - **S4** — Layer-3 Playwright coverage (multi-set rendering,
    refusal error content per H3, force-override, release-checkout
    command, same-orchestrator re-attach)
  - **S5** — Queueing / polling feature using H4's identity
    predicate
  - **S6** — `close_session` cross-tier check-in (Full +
    Lightweight) + canonical doc updates (schema, close-out,
    workflow) + cross-repo CLAUDE.md notification + PyPI release
    + Marketplace publish

- `docs/session-sets/033-orchestrator-checkout-checkin-implementation/session-state.json`
  — `totalSessions: 6`; session titles updated to match the
  authored spec.

- Spec total cost forecast: **$0.45–$1.25** (factoring in the
  pre-shipped Set 032 audit).

**Cross-provider review of the drafted spec:**

- Authored `spec-review-request.md` — narrow 5-axis prompt
  (verdict traceability, sequencing, missing surface area, scope
  creep, risk coverage) with explicit "approve / approve-with-
  suggestions / must-fix" framing constrained to ~500 words.
- Gemini Pro: routed via `route_spec_review.py` ($0.020,
  10643 in / 677 out). **Approve-with-suggestions** with two
  refinements:
  1. S6 Step 1: `close_session` on an already-null `orchestrator`
     should be an explicit successful no-op (idempotence).
  2. Risks section: add R7 for `listInProgressSets()` performance
     in repos with many session sets, with a benchmark note.
- Both suggestions applied to
  `033-orchestrator-checkout-checkin-implementation/spec.md`.
- GPT-5.4 manual-paste not invoked — Gemini's verdict was
  approve-not-must-fix and the suggestions are small.

**audit-input README updated:**

- Status header flipped from "audit resolved" to "audit-then-spec
  cycle complete"; Set 033 spec link added (replacing
  "placeholder spec currently" note).
- Artifact table extended with the Session 2 spec-review artifacts.
- Cost record extended with Session 1 verification + Session 2
  spec-review spend (~$0.079 total architectural-decision spend
  across all rounds).
- "What ships across Sets 032 + 033" reframed past-tense for the
  audit and spec-authoring work.

**Round A verification (gemini-pro, $0.038):** VERIFIED — no
must-fix. All 6 verdicts traced, both cross-review suggestions
confirmed applied, per-session sequencing internally consistent
(S1 writer → S2 reader → S3 UI → S4 tests → S5 queueing → S6
close-out), README + change-log accurate, no load-bearing
omissions. Round B not required.

**Session 2 routed spend:** ~$0.058 ($0.020 spec cross-review +
$0.038 Round A verification).

---

## What Set 032 ships (the audit deliverable)

This set's deliverable is a markdown document, not code. Concretely:

- `docs/proposals/2026-05-19-orchestrator-tracking-architecture/proposal-addendum.md`
  §9 — 6 locked verdicts with cross-provider trail.
- `docs/proposals/2026-05-19-orchestrator-tracking-architecture/README.md`
  — status header + must-resolves table flipped to RESOLVED; Set 033
  spec linked.
- `docs/session-sets/033-orchestrator-checkout-checkin-implementation/spec.md`
  — fully authored, cross-reviewed implementation spec replacing
  the placeholder. Set 033 can execute this as-is.
- `docs/session-sets/033-orchestrator-checkout-checkin-implementation/session-state.json`
  — title-aligned with the authored spec.

Set 033 starts from a fully-vetted implementation spec; no
architecture decisions remain open.

---

## Risks closed

- **R1 (engine divergence):** Closed. Both engines confirmed all
  5 originals; H4 divergence between GPT (permissive) and Gemini
  (composite) resolved by operator adjudication.
- **R2 (spec sequencing missteps):** Closed via Session 2 cross-
  provider review. Gemini Pro approved sequencing without
  suggestions; the two applied suggestions tighten idempotence
  and risk coverage rather than re-ordering.
- **R3 (audit-input artifact drift):** Closed. Pre-audit
  artifacts remained frozen; updates landed in addendum §9 +
  README's "audit resolution" section, not in `proposal.md`.

---

## Pattern notes for future sets

- **Manual-paste GPT fallback is now a known-stable pattern.**
  Three of three GPT-5.4 routed calls in this architecture
  decision cycle (R1, R2, audit-resolution) hit 429; all three
  recovered cleanly via manual paste. The pattern is durable —
  don't budget for routed GPT under sustained reasoning workload
  ([[feedback_split_large_verification_bundles]]).
- **`ai_router.query` over `ai_router.route` for deterministic
  Gemini calls.** Session 1's verification + Session 2's spec
  cross-review both used `ai_router.query(model="gemini-pro", ...)`
  because route() would have picked gpt-5-4 from the bundle's
  complexity score and gpt-5-4 was the blocked path
  ([[feedback_ai_router_route_result_handling]] + the JSON-dump
  invariant).
- **Audit-then-spec cycle worked as designed.** Two sessions, one
  audit + one spec-authoring, ~$0.10 total. The fact that GPT-5.4
  raised H4 mid-audit (after confirming the originals) is exactly
  the failure mode the audit cycle exists to catch — a single
  implementation set running the original 5-item spec would have
  shipped without H4's identity rule and either silently picked
  one or hit it as a runtime bug.

---

## Next

Set 033 implementation, beginning at S1 (state machine on
`session-state.json` + `start_session` refactor). Forecast
$0.45–$1.25 across 6 sessions.
