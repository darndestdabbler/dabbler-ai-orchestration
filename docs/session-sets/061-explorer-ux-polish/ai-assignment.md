# AI Assignment - 061-explorer-ux-polish

## Session 1: Lightweight legibility — `N/M+` fraction + tier marker

### Recommended orchestrator
anthropic claude-opus-4-7 @ effort=high

### Rationale
The work involves modifying multiple layers of the VS Code extension stack, from backend data parsing to frontend rendering logic and styling. Claude Opus's large context window and strong performance on component-aware TypeScript refactoring make it ideal for this multi-file implementation and testing task.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1    | Extend spec-config parsing for `tier` and `verificationMode`. | direct (mechanical) |
| 2    | Implement the D1 `+` fraction predicate logic and tooltip. | direct (mechanical) |
| 3    | Implement the D2 "lw" tier marker and tooltip. | direct (mechanical) |
| 4    | Implement and run unit tests for all new logic. | direct (mechanical) |
| 5    | Cross-provider verification of session goals. | route(session-verification) |

### Actuals (filled after the session)
- Orchestrator used: 
- Total routed cost: 
- Deviations from recommendation: 
- Notes for next-session calibration: 

**Next-session orchestrator recommendation (Session 2):**
anthropic claude-opus-4-7 @ effort=high
Rationale: The next session is a similar multi-layer extension modification task for which this orchestrator is well-suited.

## Session 2: Prerequisite UX — quiet marker + explanatory tooltip

### Recommended orchestrator
anthropic claude-opus-4-7 @ effort=high

### Rationale
This session is structurally similar to the first, modifying data derivation, the webview protocol, and client-side rendering. Claude Opus's proficiency with TypeScript and its ability to handle cross-cutting changes make it the best choice for implementing the new derivation logic and its UI counterpart.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1    | Extend `deriveBlockedByPrereqs` to return an unsatisfied list. | direct (mechanical) |
| 2    | Ship the list to the webview and render the marker/tooltip. | direct (mechanical) |
| 3    | Add `Open prerequisite spec` right-click action. | direct (mechanical) |
| 4    | Author the "Prerequisites and the blocked marker" docs section. | route(documentation) |
| 5    | Implement and run tests for derivation, rendering, and action. | direct (mechanical) |
| 6    | Cross-provider verification of session goals. | route(session-verification) |

### Actuals (filled after the session)
- Orchestrator used: 
- Total routed cost: 
- Deviations from recommendation: 
- Notes for next-session calibration: 

**Next-session orchestrator recommendation (Session 3):**
anthropic claude-opus-4-7 @ effort=max
Rationale: The next session's complexity increases, introducing a new command and a precise file-rewrite utility that warrants maximum effort.

## Session 3: `Switch tier…` action on not-started sets

### Recommended orchestrator
anthropic claude-opus-4-7 @ effort=max

### Rationale
This session introduces a new user-facing command and a file-rewriting utility, which requires high precision and an understanding of the VS Code API. Claude Opus at maximum effort is best suited for generating the robust rewriting logic and correctly wiring the new command into the extension's contribution points.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1    | Implement and test the pure spec-rewrite helper function. | direct (mechanical) |
| 2    | Register and implement the `dabblerSessionSets.switchTier` command. | direct (mechanical) |
| 3    | Implement guardrail warnings for the switch-to-full case. | direct (mechanical) |
| 4    | Implement and run tests for the rewrite helper, action, and guards. | direct (mechanical) |
| 5    | Cross-provider verification of session goals. | route(session-verification) |

### Actuals (filled after the session)
- Orchestrator used: 
- Total routed cost: 
- Deviations from recommendation: 
- Notes for next-session calibration: 

**Next-session orchestrator recommendation (Session 4):**
openai gpt-5.4 @ effort=medium
Rationale: The work shifts from complex code synthesis to procedural release mechanics, for which a CLI-oriented model is a better fit.

## Session 4: Operator UAT on a local build, then 0.30.0 release

### Recommended orchestrator
openai gpt-5.4 @ effort=medium

### Rationale
Session 4 is focused on release mechanics, involving file manipulation, version bumping, and running shell commands, rather than complex code generation. Codex CLI is optimized for these procedural, file-system-centric tasks, making it a more efficient choice than a code-synthesis-focused model.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1    | Author the ad-hoc UAT checklist JSON file. | route(documentation) |
| 2    | Build local `.vsix` and gate on operator UAT. | direct (mechanical) |
| 3    | On UAT pass, bump version and update `CHANGELOG.md`. | direct (mechanical) |
| 4    | Cross-provider verification of session goals. | route(session-verification) |
| 5    | Push `vsix-v0.30.0` tag on operator authorization. | direct (mechanical) |

### Actuals (filled after the session)
- Orchestrator used: 
- Total routed cost: 
- Deviations from recommendation: 
- Notes for next-session calibration: 

**Next-session orchestrator recommendation (Session 5):**
N/A
Rationale: This is the final session in the set.