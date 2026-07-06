# AI Assignment — 082-omit-verification-mode-from-full-tier-scaffolds

> Authored via `route(task_type="analysis")` (gemini-pro, $0.0108) at Session 1
> start per workflow Step 3.5. Actuals appended at each session close.

## Session 1: Conditional template line + tier-gated marker

### Recommended orchestrator
Codex CLI gpt-5.4 @ effort=high

### Rationale
The session requires coordinated, multi-file changes to TypeScript logic, templates, and Layer-2 tests, with a strict requirement for byte-identical output on one tier. A high-capability orchestrator is necessary to manage these cross-file dependencies and implement the logic precisely.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | `spec.md.template`, `consumerBootstrap.ts`, template `README.md`: Implement conditional whole-line token. | Direct orchestrator file-work |
| 2 | `gitScaffold.ts`: Gate marker-write logic to Lightweight-only; preserve existing markers on Full. | Direct orchestrator file-work |
| 3 | Sibling audit: Analyze `buildSessionGenPrompt` and grep other templates. Pin behavior with new L2 test. | routed (code_analysis) then direct orchestrator file-work |
| 4 | Regenerate `full` fixture. Update L2 test suites (`consumerBootstrap`, `coldStartSnapshot`, `gitScaffoldCore`). | Direct orchestrator file-work |
| 5 | `spec-md-schema.md`, `session-set-authoring-guide.md`: Add one-line omission notes. | Direct orchestrator file-work |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 (effort not declared)
- Total routed cost: $0.23 (analysis $0.011; session-verification R1 $0.159 + R2 $0.064, both gpt-5-4)
- Deviations from recommendation: operator launched Claude Code instead of the recommended Codex gpt-5.4 (Rule 7 — the human controls orchestrator choice). Step 3's sibling audit was done directly rather than routed: it was a grep + read of two known files, mechanical per the delegation thresholds.
- Notes for next-session calibration: verification R1 returned a context-gap Major (the fixture-contract fact that the golden tree never carries `.dabbler` markers was missing from the evidence bundle); a one-line fixture-contract note in the conventions block would have saved a round (~$0.06).

**Next-session orchestrator recommendation (Session 2):**
Claude Code claude-fable-5 @ effort=medium
Rationale: Session 2 is primarily prose and structured JSON generation, which is well-suited to a cost-effective and capable Tier-2 model.

## Session 2: Cold-start UAT and release

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
This session focuses on generating a structured JSON checklist and updating documentation like the CHANGELOG. A cost-effective orchestrator is sufficient for these prose and data-structure authoring tasks.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Author the per-set UAT checklist JSON file with detailed, per-tier validation steps. | Direct orchestrator file-work |
| 2 | Operator walk of UAT checklist and remediation of any findings. | Manual action; direct orchestrator file-work for fixes |
| 3 | Run critique, version bump, author CHANGELOG, update reference, commit, and push. | routed (path_aware_critique) then direct orchestrator file-work |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium (matches recommendation)
- Total routed cost: $0.1663 metered (cross-provider `session-verification` on
  gpt-5-4: R1 $0.1041 format-noncompliant bare verdict + R2 $0.0622
  wording-compliance re-run, max_tier pinned 3 per L-064-7, VERIFIED) + the two
  pull-critique arms (openai:gpt-5.4, google:gemini-2.5-pro), which the pull
  executor does not record as routed-call rows in router-metrics.jsonl
- Deviations from recommendation: none on orchestrator. The routed gate tripped
  on the release-prep diff (package.json/package-lock.json = build-config
  trigger + breadth), so session-verification ran even though the session
  shipped no production code.
- Notes for next-session calibration: final session — no next session. For
  future release sessions: gpt-5-4 returned a bare 'No defects found.' on a
  clean review despite the templated Response Format; the wording-only re-run
  cost an extra $0.06. The critique's one Major (tier-model.md echo) shows the
  L-065-1 echo-sweep should include docs/concepts/ when a set changes a
  spec-schema contract.
