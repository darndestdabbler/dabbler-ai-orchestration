# Consult round 14 — gemini (`gemini-3.1-pro-preview`)

Answered 2026-09-14T08:53:22.657Z in 55s; 4502 in / 1731 out tokens.

---

**Proposal 1 — raise the verification round cap from 3 to 7**

*   **Verdict:** ADOPT WITH AMENDMENT because 7 rounds cover almost all long sessions automatically, but the manual reopen verb should be deleted to truly eliminate the human burden.
*   **Design:** Change `verification.settings.max_rounds` to `7` in `packages/router/router-config.yaml` and `packages/router/src/config.ts`. Delete the `verify reopen` command entirely from `packages/router/src/drive.ts` and the CLI. Do not build a convergence rule, as calculating whether findings are "new" requires fragile text comparisons that fail the PowerPoint test. If a session hits the 7-round cap, it terminates with `remediated_at_cap` and stops. Any session failing after 7 rounds is genuinely stuck and requires the operator to intervene via `session plan amend` or a new session. 
*   **The one risk:** A hallucinating AI burns tokens looping 7 times on unfixable errors.
*   **Mitigation:** The AI token cost for four extra loops is negligible compared to interrupting a human developer's workflow.
*   **What a skilled human team does:** A senior reviewer returns a PR for 2-3 async revisions, but if it remains broken, they stop typing and jump on a call (the equivalent of hitting the cap and stopping).

**Proposal 2 — after the first release, every session releases unless it cannot**

*   **Verdict:** ADOPT WITH AMENDMENT because tracking "first release" within the framework adds fragile state, whereas relying on CI's environment approval already provides the exact gating the operator wants.
*   **Design:** Replace the `releasable` boolean with an optional `hold_release_reason` string in `packages/router/schemas/driver-work-plan.schema.json`. Remove the `publication:<version>` decision from `packages/router/src/owedDecisions.ts` and delete the `published_when_releasable` gate from `packages/router/src/gates.ts`. When `hold_release_reason` is empty, `packages/router/src/drive.ts` calls `dabbler packaging` blindly. The CI environment approval acts as the single human consent, fulfilling the operator's intent without changing the framework's state. Versioning defaults to a patch bump based on commit history (ASSUMPTION) when humans are out of the loop.
*   **The one risk:** The framework automatically packages an undesired version during an intermediate refactoring session.
*   **Mitigation:** The target CI environment still requires a human click to actually push to the final feed, acting as the ultimate safety net.
*   **What a skilled human team does:** Developers merge to `main` and let the CD pipeline automatically build and stage the release, approving it only at the final deployment gate.

**Proposal 3 — eliminate owed decisions**

*   **Verdict:** ADOPT AS STATED because the module over-gates the AI process and annoys the operator with questions that can be replaced entirely by startup checks or defaults.
*   **Design:** Delete `packages/router/src/owedDecisions.ts`, `cli/owed.ts`, and `owedDecisionCommands.ts` entirely. Replace setup questions (`git-remote`, `testing-suites`, feeds) with option (ii): hard refusals during `session start` that name the required fix and exit immediately. Replace `module-grant` with option (i): an automatic grant recorded in `activity-log.json`, as gating read-only access within a repository is over-engineering. Replace `driver-stop` by doing nothing, as the terminal stop message already carries the exact same context and is implicitly answered by the user typing `session next`. No decision class requires a chat prompt or toast (option iii).
*   **The one risk:** A focused session reads a sibling module's source automatically without explicit human consent, potentially pulling in unnecessary architectural context.
*   **Mitigation:** The read access is documented transparently in `activity-log.json`, providing auditability without interrupting the session flow.
*   **What a skilled human team does:** Developers do not pause their work to ask a tech lead for permission to read a sibling module's code; they just read it and document the dependency if one is taken.

**Proposal 4 — non-goals in the plan, and both roles told that over-engineering is forbidden**

*   **Verdict:** ADOPT WITH AMENDMENT because explicit non-goals in the work plan provide concrete evaluation boundaries, but generic instructions about "simplicity" in system prompts are usually ignored or weaponized.
*   **Design:** Add an optional `non_goals` array to `packages/router/schemas/driver-work-plan.schema.json`, which the engine derives from scope constraints in the session plan. Pass this array verbatim into the context for `packages/router/prompt-templates/verification.md`. Add a rule to the verification template that building a non-goal is a blocking Major finding, with the failure scenario being "unauthorized scope expansion creates unreviewed maintenance surface." Place nothing about "simplicity" into `prompt-templates/system-prompts.md` or `AGENTS.md`. Do not add mechanical signals like diff size, as this constitutes the exact over-engineering the proposal warns against.
*   **The one risk:** The reviewer AI misinterprets a legitimate structural refactoring as a violation of a non-goal and blocks the session.
*   **Mitigation:** The blocking finding must explicitly cite a violated `non_goal` from the work plan, anchoring the rejection in concrete text rather than subjective simplicity.
*   **What a skilled human team does:** Tech leads explicitly define out-of-scope items during sprint planning so engineers know exactly where to stop building.

**Ordering**
- Session 1: Raise the verification cap to 7 and delete `verify reopen` (`packages/router/router-config.yaml`, `packages/router/src/config.ts`, `packages/router/src/drive.ts`).
- Session 2: Add `non_goals` to the work plan schema and verification template rubric (`packages/router/schemas/driver-work-plan.schema.json`, `packages/router/prompt-templates/verification.md`).
- Session 3: Replace `releasable` with `hold_release_reason` and delete the `publication` owed decision (`packages/router/src/gates.ts`).
- Session 4: Delete the entire owed decisions module, commands, and tests, replacing setup questions with hard startup errors (`packages/router/src/owedDecisions.ts`, `cli/owed.ts`, `owedDecisionCommands.ts`).

**What NOT to build**
- Tracking whether "the first release has happened" inside the framework state. We must avoid complex state machines; CI already tracks deployment environments.
- Mechanical diff-size or file-count checks to enforce simplicity. Valid structural refactors will trigger them and cause endless loops, violating the "simpler, more reliable" directive.
- "Be simple" generic text in system prompts. Models lack the context to evaluate software simplicity abstractly and will use the prompt to justify skipping necessary edge-case handling.
- Any replacement for `verify reopen`. If 7 rounds fail, the AI cannot fix it without human intervention.

**Disagreements you expect**
- The other advisor might argue that deleting `module-grant` without a replacement prompt allows the AI to blindly couple modules without oversight. My answer is that reading sibling source code is safe, and any harmful architectural coupling will be caught by the reviewer analyzing the actual fix delta against the plan's goals.
- Another advisor might insist on a database file or config entry to track the "first release" state for Proposal 2. My answer is that duplicating CI environment state into the `.dabbler` ledger violates the "simpler, more reliable" rule; letting the plan default to ship and relying on the existing CI gate fulfills the operator's intent with zero new code.
