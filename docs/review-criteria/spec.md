<!--
  Repo-specific review criteria for session-set SPECS.

  This file is read by the Dabbler extension's `Copy: Spec-review
  prompt` command and embedded into the clipboard payload under
  "Operator review criteria (from docs/review-criteria/spec.md)".

  - Edit the bullets below to teach reviewers what THIS repo cares
    about most when scoping a session set.
  - Keep it short (≤ ~30 lines). The prompt is meant to be paste-
    able into any AI chat with file access.
  - Delete this file to fall back to the extension's default English
    spec-review instructions.
-->

When reviewing a session-set spec, weight the following:

- **Scope realism.** Can each session realistically be completed by a
  single orchestrator in one sitting (1–4 hours of focused work)?
  Flag any session whose stated deliverables span more than three
  loosely-coupled subsystems.
- **Verifiability.** Does the spec name concrete artifacts that prove
  completion (file paths, command outputs, test counts)? Vague "ship
  X" with no measurable signal is a yellow flag.
- **Prerequisites + non-goals.** Are the cross-set dependencies
  explicit, and are out-of-scope items called out so the orchestrator
  doesn't drift?
- **Audit-lock discipline.** If the set claims to implement a prior
  audit's verdict, the §2 "operator-locked premises" should match the
  audit doc exactly. Cite the verdict path.
- **Backwards compatibility surfaces.** Any change to shared schemas,
  CLIs, or extension command IDs must spell out the back-compat plan.
- **Repo conventions.** Defer to `docs/planning/project-guidance.md`,
  `docs/ai-led-session-workflow.md`, and `docs/repository-reference.md`
  for any shared rule the spec doesn't explicitly override.
