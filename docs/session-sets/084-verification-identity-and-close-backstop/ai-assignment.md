## Session 1: Identity and dynamic verifier exclusion (F1 + F2)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session involves surgical modification of multiple sensitive, existing modules (`start_session`, `gate_checks`, the router) to enforce a single new source of truth for identity. Calibration from Set 083 shows `claude-fable-5` excels at this type of high-stakes, cross-file reasoning and robust test matrix generation, which is essential for preventing regressions in the core security posture.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.1 | Implement shared identity resolution helper. | Orchestrator-direct |
| 1.2 | Implement boundary enforcement in `start_session`. | Orchestrator-direct |
| 1.3 | Update `check_verification_integrity` to use the helper. | Orchestrator-direct |
| 1.4 | Implement dynamic exclusion in the router path. | Orchestrator-direct |
| 1.5 | Implement Layer-1 pytest matrix. | Orchestrator-direct |
| 1.6 | Dogfood the new exclusion path for this session. | Orchestrator runs `verify_session`, which routes its task to a cross-provider verifier (with exclusion). |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 2):**
Gemini Code Assist gemini-3-pro @ effort=high
Rationale: Session 2 implements the highest-risk structural change (the close backstop), requiring exceptional precision in modifying core lifecycle logic. Gemini's strength in codebase-aware reasoning and generating exhaustive regression tests for historical incidents makes it the best fit to ensure system integrity.

---

## Session 2: Stamped evidence and the close backstop (F3 + structural)

### Recommended orchestrator
Gemini Code Assist gemini-3-pro @ effort=high

### Rationale
This session implements the set's most critical and highest-risk structural change: moving verification into the `close_session` backstop. This modifies the core session lifecycle contract and requires flawless logic to avoid introducing new bypasses. Gemini Code Assist is recommended for its strength in surgical modification of existing, complex code and generating the comprehensive, matrix-style regression tests needed to cover three historical live incidents. Using a different top-tier model from S1 provides valuable cross-provider calibration on the most sensitive code.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 2.1 | Implement stamping logic in the metrics writer. | Orchestrator-direct |
| 2.2 | Tighten the evidence gate to require stamped rows. | Orchestrator-direct |
| 2.3 | Implement the close backstop logic in `close_session`. | Orchestrator-direct |
| 2.4 | Implement Layer-1 pytest matrix with incident regressions. | Orchestrator-direct |
| 2.5 | Dogfood the backstop by closing this session unverified. | Orchestrator runs `close_session`; the backstop logic within `close_session` makes the routed verification call. |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 3):**
Codex CLI gpt-5.4 @ effort=medium
Rationale: Session 3 is dominated by precise procedural work: documentation updates, structured UAT checklist generation, and a dual-release workflow. Calibration warns that release mechanics fail under less-capable models. Codex CLI's proficiency with procedural execution and structured data is ideal for ensuring error-free releases.

---

## Session 3: Instruction surfaces, incident-3 reproduction UAT, and the two releases

### Recommended orchestrator
Codex CLI gpt-5.4 @ effort=medium

### Rationale
This session is dominated by precise procedural tasks: updating multiple documentation surfaces, generating a structured JSON UAT checklist, and executing a dual-release workflow. Calibration data indicates this type of release work is prone to subtle errors ("registry-blind errors"). Codex CLI's proficiency with structured data generation and step-by-step procedural execution makes it the ideal choice to ensure the high-fidelity updates and error-free release mechanics required.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 3.1 | Update template bundle and documentation surfaces. | Orchestrator-direct |
| 3.2 | Generate the per-set UAT checklist JSON. | Orchestrator-direct |
| 3.3 | Perform critique and execute the dual-release process. | Orchestrator-direct |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)