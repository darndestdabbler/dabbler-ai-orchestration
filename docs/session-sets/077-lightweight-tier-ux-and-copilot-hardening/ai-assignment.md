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
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 3):**
Codex CLI gpt-5.4 @ effort=medium
Rationale: Session 3 involves adding well-defined UI elements and supporting logic, which aligns well with Codex's strengths in targeted code and test generation.

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
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 4):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 4 combines writing canonical documentation with modifying core Python router logic, playing to Claude's dual strengths in prose generation and complex code comprehension.

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
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 5):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 5 modifies tightly-coupled logic across the Python backend and TypeScript frontend, requiring the deep cross-stack reasoning at which Claude excels.

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
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 6):**
Claude Code claude-fable-5 @ effort=medium
Rationale: The main AI task in Session 6 is the path-aware critique, a holistic analysis of the entire set's changes, which is a core strength for Claude.

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