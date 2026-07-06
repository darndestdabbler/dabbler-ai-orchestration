## Session 1: Row-structured option layout for both sub-choice groups
### Recommended orchestrator
Claude Code claude-fable-5 @ effort=low
### Rationale
This session is a well-specified, mechanical refactoring of presentation-layer code (HTML-in-JS, CSS) and related tests. A frontier model can execute these direct code modification and generation tasks with minimal ambiguity.
### Estimated routed cost
low
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Restructure `transportProfileBlockHtml` and `verificationModeBlockHtml` | Route to Tier 2 `code_edit` task: provide `gettingStartedHtml.js` content and prompt for specific refactoring of the two function bodies. |
| 2 | Add minimal CSS | Route to Tier 2 `code_gen` task: provide HTML structure and prompt for theme-aware CSS for alignment and row separation. |
| 3 | Update Layer-2 render tests | Route to Tier 2 `code_edit` task: provide `gettingStartedHtml.test.ts` content and prompt to update selectors/structure while maintaining assertion logic. |
| 4 | Full Layer-2 suite + `tsc` green | Orchestrator direct action (`local_exec`): run test and build commands. |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $0.0097 (one `analysis` call, gemini-pro, for this file)
- Deviations from recommendation: the markup/CSS/test edits were done directly
  by the orchestrator instead of routed `code_edit`/`code_gen` tasks — each was
  mechanical, precisely specified by the spec, and within the delegation
  direct-work thresholds; routing would have added cost without changing the
  result. No `session-verification` call ran: `python -m ai_router.routed_gate`
  returned SKIP (exit 10 — 3 files, 1 module, no coupling triggers), the first
  genuine gate skip since the Set 068 cut-over, recorded in the activity log
  and disposition.
- Notes for next-session calibration: Session 2 touches `package.json`
  (version bump), which trips the routed gate's build/CI/config trigger — plan
  for a cross-provider `session-verification` call there. Layer-3 Playwright
  had one palette-open timeout flake (ARIA tree test); it passed clean on
  isolated re-run.

**Next-session orchestrator recommendation (Session N+1):** Codex CLI gpt-5.4 @ effort=low

---
## Session 2: UAT, screenshot, and release
### Recommended orchestrator
Codex CLI gpt-5.4 @ effort=low
### Rationale
This session is a procedural workflow of text generation (UAT checklist), file system operations (versioning, CHANGELOG), and CLI commands. Codex CLI is well-suited for these step-by-step, tool-and-file manipulation tasks.
### Estimated routed cost
low
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Author the per-set UAT checklist | Route to Tier 2 `text_gen` task: provide spec, path to previous examples, and prompt to generate `080-...-uat-checklist.json`. |
| 2 | Operator walk; remediate any findings | Orchestrator direct action (`local_exec`): standby. If findings require code changes, route as `code_edit` tasks (likely Tier 2). |
| 3 | Operator captures and stages screenshot; commit it | Orchestrator direct action (`local_exec`): run `git commit`. |
| 4 | Version bump, CHANGELOG, repository-reference, commit, push, tag | Orchestrator direct action (`local_exec`): run sequence of file edits (using Tier 1 `file_patch` tasks) and git/npm CLI commands. |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium
- Total routed cost: $0.1224 (two `session-verification` calls, gpt-5-4:
  R1 $0.0823 + narrow R2 re-verify $0.0385, plus a small routed
  `documentation` call for change-log generation)
- Deviations from recommendation: the operator started the session on
  Claude Code rather than the recommended Codex CLI (orchestrator choice
  is the human's; workflow Rule 7). The UAT checklist was authored
  directly by the orchestrator rather than routed as `text_gen` —
  matching the Set 079 precedent: the Set 078 bar requires re-grounding
  every literal string against current source and re-running the cited
  Layer-2 suites during authoring, which a snippet-fed routed call
  cannot do. Step 4's file edits and git/CLI work were orchestrator
  direct action as recommended.
- Notes for next-session calibration: the routed gate tripped on the
  release diff exactly as S1 predicted (package.json build-ci-config +
  multi-module), and the cross-provider verifier earned its cost —
  R1 caught a real doc-consistency overclaim (S080-S2-V1-001) between
  the repository-reference wording and the checklist's saved walk
  state. For future UAT-and-release sessions: commit the checklist
  BEFORE the walk, and expect one wording-consistency round when the
  walk state and release metadata are written in the same session.