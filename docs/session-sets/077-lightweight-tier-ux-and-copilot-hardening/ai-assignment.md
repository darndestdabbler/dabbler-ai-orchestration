# AI Assignment: Set 077 - Lightweight Tier UX and Copilot Hardening

This document specifies the recommended AI orchestrator assignments and routing decisions for each session in the set.

---

## Session 1: Comprehensive review baseline and triage

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
This session is dominated by large-context code review and architectural analysis across both TypeScript and Python codebases. Claude's large context window and strong reasoning capabilities are ideal for this kind of comprehensive initial assessment.

### Estimated routed cost
High

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Register session start; read guidance docs | `direct` |
| 2.   | Run the full pass | `direct:shell` |
| 3.   | Route `code-review` over the audit surfaces | `code-review` |
| 3.   | Save raw critique for `task_type: architecture` | `architecture` |
| 4.   | Triage findings against code | `direct` |
| 5.   | Write the structured findings artifact; update spec | `direct` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $2.18 (16 calls: analysis $0.03, architecture critique $0.34, six code-review bundles + gemini-pro auto-verifies ~$1.57, two session-verification rounds $0.24)
- Deviations from recommendation: none (session ran as recommended)
- Notes for next-session calibration: code-review bundles all routed to sonnet tier-2 with gemini-pro verification — no escalations, no truncation across ~390k chars of input; the six-bundle split held well under budget. Verification round 1 caught one real defect in an inline fix (OS-proxy case-folding); fixed and VERIFIED in round 2.

**Next-session orchestrator recommendation (Session 2):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 2 requires careful implementation of state management logic that spans webview JavaScript and extension TypeScript, a task well-suited to Claude's ability to reason across interconnected files.

---

## Session 2: Tier truth chain (Feature 1)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session implements a critical state-persistence chain from the webview UI (JS) through the extension (TS) to durable markers on disk. Claude's strength in tracking logic across file and language boundaries is essential for ensuring the "truth chain" is implemented correctly and without gaps.

### Estimated routed cost
Moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Fix webview state persistence | `direct:edits` |
| 2.   | Write durable tier marker; add read-precedence helper | `direct:edits` |
| 3.   | Re-point prompt builders at helper; remove fallbacks | `direct:edits` |
| 4.   | Add tier-mismatch advisory; fix guardrail path coupling | `direct:edits` |
| 5.   | Layer-2 tests: state survival, precedence, regression | `test-generation`, `code-review` |
| 5.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $1.41 (test-generation gemini-pro $0.06; code-review opus $0.57 + gpt-5.4 auto-verify $0.31; S3-recommendation analysis gemini-pro $0.002; session-verification gpt-5.4 rounds 1–3 $0.34 + $0.11 + $0.02)
- Deviations from recommendation: ran at effort=medium (recommendation said high) — medium proved sufficient; the routed code-review + three verification rounds provided the depth the higher effort was meant to buy.
- Notes for next-session calibration: routed test-generation output needed moderate adaptation (invented APIs, wrong state enums) — budget integration time or inline the contracts harder in the prompt. The code-review's Major (seed-clobbers-deliberate-flip) and the verifier's two findings (root-scoped state, sticky tierDirty) were all in the NEW webview-state semantics — the surface the spec called highest-risk; keep review+verification budget concentrated there in S3's form work. Routed gate: REQUIRED (blast-radius + breadth).

**Next-session orchestrator recommendation (Session 3):**
Claude Code claude-fable-5 @ effort=medium
Rationale: Routed analysis (gemini-pro, at S2 close) revised the original Codex recommendation: context continuity on the exact webview + scaffold surfaces S2 just reworked, and the ordering-sensitive pre-flight logic (fail before any durable write) benefits from the proven S2 workflow of direct implementation plus routed high-capability review.

---

## Session 3: Getting Started three-way choice and Python prerequisite (Feature 2)

### Recommended orchestrator
Codex CLI gpt-5.4 @ effort=medium

### Rationale
This session adds discrete UI elements to a webview form and implements a straightforward host probe, tasks that benefit from a strong code generator. Codex CLI is well-suited to generating the required HTML/JS snippets, TypeScript handlers, and associated tests efficiently.

### Estimated routed cost
Moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Extend form to three-way choice; route action | `direct:edits` |
| 2.   | Add Python host probe + warning; add friendly failure | `direct:edits` |
| 3.   | Verify/extend Troubleshooting appendix | `documentation` |
| 4.   | Make getting-started doc tier-aware | `direct:edits` |
| 5.   | Layer-2 + Layer-3 coverage for new states | `test-generation`, `code-review` |
| 5.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $1.38 (test-generation gemini-pro $0.10; documentation review gemini-pro $0.02 + gpt-5.4-mini auto-verify $0.03; code-review opus $0.61 + gpt-5.4 auto-verify $0.31; session-verification gpt-5.4 rounds 1–2 $0.26 + $0.06; S4-recommendation analysis gemini-pro $0.003)
- Deviations from recommendation: the original set-start recommendation for S3 was Codex CLI; the S2-close routed analysis revised it to Claude Code claude-fable-5 @ medium (context continuity on the S2-reworked webview/scaffold surfaces + the ordering-sensitive pre-flight), and the session ran as revised.
- Notes for next-session calibration: routed test-generation output again needed adaptation (missing param types, one omitted platform arg) BUT the adaptation pass surfaced a real production defect (the PATH probe was process-platform-locked; now parameter-driven) — treat routed test-gen as a review surface, not just a generator. The cross-provider layers each caught a distinct real Major the layer below missed: code-review auto-verify (directory-as-interpreter passes an exists-probe) and verification round 1 (probe counts python3 but the scaffold bootstrap spawned bare python) — keep both layers funded for the remaining scaffold-path sessions. Routed gate: REQUIRED (blast-radius + multi-module + breadth).

**Next-session orchestrator recommendation (Session 4):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 4 combines writing canonical documentation with modifying core Python router logic, playing to Claude's dual strengths in prose generation and complex code comprehension. (Confirmed at S3 close by routed analysis — gemini-pro: the close-out-path work mix is the canonical case the standing recommendation was selected for.)

---

## Session 4: Out-of-band self-completing verification (Feature 3)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session's work is a mix of authoring canonical documentation, rewriting user-facing prompts, and modifying core Python logic in the AI router. Claude is the strongest choice for its superior performance in both documentation/prose tasks and understanding/modifying complex Python business logic.

### Estimated routed cost
Moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Author canonical verification doc + template rendering | `documentation` |
| 2.   | Rewrite Evaluate prompts pointer-style | `direct:edits` |
| 3.   | Fix gate keying, add content-awareness, stand down gate | `direct:edits` |
| 3.   | Add verdict-line parser + tests in `ai_router` | `test-generation`, `code-review` |
| 4.   | Fix lazy-synth misclassification + add regression test | `direct:edits`, `test-generation` |
| 5.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $1.06 (documentation review gemini-pro $0.016 + gpt-5.4-mini auto-verify; test-generation gemini-pro $0.033; code-review opus $0.55 + gpt-5.4 auto-verify; session-verification gpt-5.4 rounds 1–4 $0.34 + $0.08 + $0.04 + $0.002; S5-recommendation analysis gemini-pro $0.005)
- Deviations from recommendation: ran at effort=medium (recommendation said high) — third consecutive session where medium plus routed review + multi-round cross-provider verification supplied the depth. Bundle F (spec: "defer-with-reason allowed") was landed in full rather than deferred.
- Notes for next-session calibration: the review/verify layers again each caught a distinct real defect class the layer below missed — the code-review auto-verify found the spec-review-prompt gate-laundering hole (fixed via the Scope: specification round marker), and verification rounds 1–2 caught three parser-grammar edges (underscore emphasis, WAIVED reason adjacency, malformed-WAIVED nulling). Keep verification budget concentrated on NEW grammar/contract surfaces. Routed test-gen again doubled as a review surface (its fake one-file bundle fixture exposed the loadTemplateBundle all-files contract). Routed gate: REQUIRED (blast-radius + multi-module + breadth).

**Next-session orchestrator recommendation (Session 5):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 5 modifies tightly-coupled logic across the Python backend and TypeScript frontend, requiring the deep cross-stack reasoning at which Claude excels. (Confirmed at S4 close by routed analysis — gemini-pro: the cross-stack state-consistency mix is the canonical case for the standing recommendation, with three sessions of track record.)

---

## Session 5: Verification owed — every surface says so (Features 4–5)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session involves complex, state-dependent logic that must be consistent between the Python router backend and the TypeScript extension frontend. Ensuring this alignment across the stack is a high-complexity task that leverages Claude's ability to hold and reason about large, interconnected contexts.

### Estimated routed cost
High

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Extend `validate_dedicated_verification`; add start-time refusal | `direct:edits`, `test-generation` |
| 2.   | Fix Explorer mode derivation to prefer activity log | `direct:edits`, `test-generation` |
| 3.   | Add `start_session` pending-verification banner | `direct:edits` |
| 4.   | Auto-route copy action; update row description | `direct:edits` |
| 5.   | Doc single-engine cross-provider pattern | `documentation` |
| 5.   | Full pass (Layer 3 included); verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $0.92 (test-generation gemini-pro $0.13 across two calls; code-review sonnet $0.30 + gemini-pro auto-verify $0.04; session-verification gpt-5.4 rounds 1–3 $0.36 + $0.08 + $0.008; S6-recommendation analysis gemini-pro $0.002)
- Deviations from recommendation: ran at effort=medium (recommendation said high) — fourth consecutive session where medium plus routed review + multi-round cross-provider verification supplied the depth. Bundle E secondary items landed in full.
- Notes for next-session calibration: the layered-review pattern held again but with a twist — BOTH the code-review and verification round 1 tripped over the same misleading field name (liveSession on complete sets); the durable fix was clarity-plus-fixture, not code change. Verification round 2's one Major was an evidence-bundle gap, not a code gap: the fixed file was UNTRACKED so `git diff` omitted it (L-064-9's class) — when re-verifying fixes in new files, paste the file source, not the diff. Round-1 verdict arrived token-less again; rounds now open with a mandatory-token instruction, keep that. Routed gate: REQUIRED (blast-radius + multi-module + breadth).

**Next-session orchestrator recommendation (Session 6):**
Claude Code claude-fable-5 @ effort=medium
Rationale: The main AI task in Session 6 is the path-aware critique, a holistic analysis of the entire set's changes, which is a core strength for Claude. (Confirmed at S5 close by routed analysis — gemini-pro: medium has sufficed for all five sessions; the critique's large-context demands justify the standing engine; no reason to deviate.)

---

## Session 6: UAT, path-aware critique, and coordinated release

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
The primary AI-leveraged task in this session is the path-aware critique, which requires a holistic analysis of all changes made throughout the set. Claude is the best engine for this `analysis` task type due to its ability to synthesize information from a large context and identify potential cross-provider issues.

### Estimated routed cost
Low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Build and install VSIX locally | `direct:shell` |
| 2.   | Author and walk UAT checklist | `direct` |
| 3.   | Run required end-of-set path-aware critique | `analysis` |
| 4.   | CHANGELOGs; bump versions; update docs | `direct:edits` |
| 5.   | Commit, push, CI/CD, confirm publish | `direct:shell`, `direct` |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 7):**
N/A (final session of set)