## Session 1: The `verify_session` CLI

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session implements a complex, standalone CLI from a detailed spec, requiring strong logical reasoning and greenfield code generation. Claude Code's flagship model excels at translating prescriptive requirements into robust, structured Python modules and corresponding test suites.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.1 | Implement `ai_router/verify_session.py` CLI logic. | Orchestrator (mechanical code generation) |
| 1.2 | Implement pytest suite for the new CLI. | Orchestrator (mechanical test generation) |
| 1.3 | Dogfood the CLI for this session's own Step 6. | Orchestrator runs the command; `verify_session` routes its task to a Full-tier cross-provider verifier. |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 2):**
Gemini Code Assist gemini-3-pro @ effort=high
Rationale: Session 2 involves targeted modification of existing gate logic and generating a complex test matrix, a core strength of Gemini's codebase-aware reasoning.

---

## Session 2: The verification-integrity close gate

### Recommended orchestrator
Gemini Code Assist gemini-3-pro @ effort=high

### Rationale
This session modifies sensitive, existing modules and requires a comprehensive test matrix covering many edge cases. Gemini Code Assist is well-suited for this surgical work, understanding existing code context and generating thorough, matrix-style tests to prevent regressions.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 2.1 | Implement disposition validation logic. | Orchestrator (mechanical code modification) |
| 2.2 | Implement the new gate check in `gate_checks.py`. | Orchestrator (mechanical code modification) |
| 2.3 | Ensure hard-block posture and refusal message. | Orchestrator (mechanical code modification) |
| 2.4 | Implement the pytest matrix for the new gate. | Orchestrator (mechanical test generation) |
| 2.5 | Dogfood the gate by closing this session. | Orchestrator runs `close_session`; this session's verification (from S1) will have been routed to a Full-tier cross-provider verifier. |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 3):**
Claude Code claude-sonnet-4-6 @ effort=medium
Rationale: Session 3 consists of wide but shallow changes across documentation and configuration files, making a fast and efficient model the right choice.

---

## Session 3: Instruction surfaces, UAT, and the two releases

### Recommended orchestrator
Claude Code claude-sonnet-4-6 @ effort=medium

### Rationale
This session is dominated by high-volume, low-complexity updates to documentation, templates, and configuration files. A cost-effective, fast orchestrator like Claude Sonnet is ideal for executing these precise, boilerplate-heavy tasks across a wide surface area.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 3.1 | Update template bundle and documentation. | Orchestrator (mechanical text editing) |
| 3.2 | Add advisory to `start_session`. | Orchestrator (mechanical code modification) |
| 3.3 | Update canonical docs for the CLI and gate. | Orchestrator (mechanical text editing) |
| 3.4 | Author UAT checklist. | Orchestrator (mechanical JSON generation) |
| 3.5 | Author path-aware critique and perform release prep. | Route critique to Full-tier for analysis; orchestrator for mechanical release boilerplate (versions, changelogs). |
| - | Session verification (Step 6) | Route to a Full-tier cross-provider verifier. |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)