# Consult round 14 — sol (`gpt-5.6-sol`)

Answered 2026-09-14T08:56:35.304Z in 247s; 4266 in / 11664 out tokens.

---

**Proposal 1 — raise the verification round cap from 3 to 7**

- **Verdict:** ADOPT AS STATED, because 7 would have completed 15 of the 16 sessions that exceeded 3 rounds, while every recorded reopen was approved and ultimately reached `VERIFIED` (`docs/sessions/sessions.json`).
- **Design:** Change `verification.settings.max_rounds` from 3 to 7 in `packages/router/router-config.yaml`; `verificationRoundCap` in `packages/router/src/config.ts` already reads it. Keep `terminateAtCap` in `packages/router/src/verify/rounds.ts`, the `cap-terminal-tree-moved` stop in `packages/router/src/drive.ts`, and `dabbler verify reopen` for the exceptional eighth round. Do not add convergence logic: the severity and probable-failure requirements in `packages/router/prompt-templates/verification.md` already suppress non-blocking churn, and a second termination rule fails the simplicity directive. Delete nothing.
- **The one risk:** More automatic rounds can spend additional direct-API money or Copilot credits before stopping.
- **Mitigation:** The hard cap remains, the existing rubric requires evidence and a probable failure scenario, and reopening still grants rounds rather than a verdict (`packages/router/src/verify/rounds.ts`; `packages/router/prompt-templates/verification.md`).
- **What a skilled human team does:** ASSUMPTION: It lets review-and-fix continue while concrete blockers are being resolved and escalates only when the review is genuinely stuck.

**Proposal 2 — after the first release, every session releases unless it cannot**

- **Verdict:** ADOPT WITH AMENDMENT, because ship-by-default is right after the first release, but a session with unresolved blocking reviewer findings also cannot be released under the machine-owned-verdict rule.
- **Design:** Define “first release happened” as the first successful packaging run in the framework’s machine record, the same kind of run required by `published_when_releasable` in `packages/router/src/gates.ts`; do not introduce an origin-tag convention or a hand-maintained declaration. Replace `releasable` in `packages/router/schemas/driver-work-plan.schema.json` with optional `release_hold`, whose presence requires a reason and an identified dependency on later work, while absence means ship. Before the first successful packaging run, `phasePublish` in `packages/router/src/drive.ts` asks `publish?` in the current interaction, records the answer in the activity log, and proceeds without an owed-decision row or follow-up verb. After that run, `phasePublish` publishes automatically; the CI environment approval remains because the framework cannot remove it, but the framework stops supplying the duplicate consent. A cap terminal with blocking findings standing does not publish and names `dabbler verify reopen`; it is recorded as unable to release, not converted into approval. Have the author choose `version_bump: patch|minor|major`, defaulting to patch and requiring a reason for minor or major, with the Primary Reviewer checking it; delete the bare `releasable` declaration, `session withdraw-release`, `publication:<version>` raising in `packages/router/src/owedDecisions.ts`, and the old releasable-specific close-gate logic.
- **The one risk:** ASSUMPTION: An AI-selected version bump may understate the compatibility effect of a change.
- **Mitigation:** Make the bump and any non-patch rationale part of the reviewed plan, so the independent Primary Reviewer checks it before `phasePublish`.
- **What a skilled human team does:** ASSUMPTION: It discusses the initial go-live, then continuously publishes independently reviewed and tested increments, withholding only incomplete or unsafe work.

**Proposal 3 — eliminate owed decisions**

- **Verdict:** ADOPT AS STATED, because the 44 recorded decisions were overwhelmingly transient driver stops and release confirmations, while durable decisions are already recorded independently in `activity-log.json`, `docs/sessions/decisions-log.md`, and `docs/operator-decisions.md`.
- **Design:** Delete `packages/router/src/owedDecisions.ts`, `cli/owed.ts`, the extension’s `owedDecisionCommands.ts` and its test, the Work Explorer and Dabbler Terminal references, the five `package.json` references, and the `owed_decisions` close gate. Replace `testing-suites` and `testing-suites-tests-exist` with an early refusal that names the missing or empty suite declaration in `dabbler.yaml`; replace `run-of-record-owed/s<N>/<suite>` with a close refusal naming the suite that must run and the host or runner problem. Replace `git-remote`, `feed-source:<feed>`, `packaging-feed`, and `packaging-secret` with preflight refusals that name the missing remote, feed, or credential-variable name and who must configure it. For `dependency-ownership:<pkg>`, default to external unless ownership is already established by the approved plan, and record that default; the initial plan discussion may correct it without creating a pending item. Replace `publication:<version>` with Proposal 2’s direct first-release question, default `module-grant:<sibling>` to granting the requested sibling source exposure and record it, and replace every `driver-stop-s<N>` row with a stop message containing the same reason and proposed amendment. No class requires anything outside defaults, immediate refusals, or a one-word question; `driver-stop` rows add nothing once the stop message carries both fields.
- **The one risk:** ASSUMPTION: A default may occasionally misclassify dependency ownership or expose sibling source that the operator would have preferred to keep outside the focused session.
- **Mitigation:** Record every default in the existing activity log and let the approved plan or an explicit operator instruction override it, without creating a pending decision.
- **What a skilled human team does:** ASSUMPTION: It uses sensible defaults, stops immediately on missing setup, and asks a short contextual question instead of maintaining a separate queue of unanswered decisions.

**Proposal 4 — non-goals in the plan and explicit prohibition of over-engineering**

- **Verdict:** ADOPT WITH AMENDMENT, because explicit non-goals and simplicity review are valuable, but unrequested work should block only when it violates a stated boundary and has a plausible, probable adverse consequence.
- **Design:** Add required `non_goals` to `packages/router/schemas/driver-work-plan.schema.json`, require at least one concrete item, and do not add a duplicate `goals` field because the session-plan section, `task`, and steps already state the work. In `planAsk` in `packages/router/src/drive.ts`, tell the author to derive non-goals from explicit exclusions in the session-plan section or from the nearest concrete boundaries of its task and steps. Carry those non-goals into each step instruction and into `buildTaskBlock` in `packages/router/src/verify/prompts.ts`. Add “Scope and simplicity” to `packages/router/prompt-templates/verification.md`: extra work is Major only when it violates a goal or non-goal and the reviewer identifies evidence, impact, and a plausible, probable failure scenario; otherwise it is Minor or a nit and cannot open a round. Put the operator’s value-and-simplicity sentence only in `planAsk` and `verification.md`, not in provider-wide system prompts or a customer `AGENTS.md`. Add no diff-size threshold, undeclared-file gate, dependency gate, score, or new subsystem; the reviewer already receives the fix delta and plan excerpt through `buildTaskBlock`.
- **The one risk:** The new criterion could encourage reviewers to manufacture “over-engineering” findings, reversing the clean-verdict protection already in `packages/router/prompt-templates/verification.md`.
- **Mitigation:** Require a violated explicit boundary and a probable adverse consequence, and retain the instruction that manufacturing a finding instead of returning `VERIFIED` is itself a failure.
- **What a skilled human team does:** ASSUMPTION: It names important out-of-scope work during planning, rejects materially risky extras in review, and ignores harmless implementation differences.

**Ordering:**

1. Add Proposal 4’s required non-goals and review criterion; replace the generic-only planning and verification wording, but delete no subsystem.
2. Raise the Proposal 1 cap to 7; change only `packages/router/router-config.yaml` and delete no command or terminal behavior.
3. Implement Proposal 2’s ship-by-default plan and publication path; delete `releasable`, `session withdraw-release`, the per-version publication decision, and the old releasable-specific gate behavior.
4. Remove Proposal 3’s owed-decision subsystem; delete its router module, CLI, extension command and test, UI references, package references, and close gate.

**What NOT to build:**

- Do not add a convergence rule beside the numeric cap; it creates a second explanation for when verification stops without evidence that it is needed.
- Do not add a release state machine, origin-tag convention, or manually maintained “continuous delivery enabled” flag; the successful packaging record is sufficient.
- Do not replace owed decisions with another pending-question table, inbox, dashboard, or answer verb; that would preserve the burden under another name.
- Do not ask a person to approve routine publication or version bumps after the first release; use the author’s plan, independent review, the complete suite, and the remaining CI environment rule.
- Do not publish a cap-terminal session while blocking reviewer findings stand; ship-by-default does not override the reviewer’s machine-owned verdict.
- Do not add diff-size budgets, undeclared-file failures, dependency-count limits, complexity scores, or non-goal linting; these would recreate the over-engineering the proposal is intended to prevent.
- Do not put customer-independent simplicity policy into a managed customer `AGENTS.md`; the brief says this repository’s `AGENTS.md` constraints do not travel to customer repositories.

**Disagreements you expect:**

- ASSUMPTION: Another advisor may prefer a cap of 5 to reduce AI cost; my answer is that 7 covers 15 of 16 long sessions in `docs/sessions/sessions.json`, while the operator has approved every recorded reopen.
- ASSUMPTION: Another advisor may propose convergence detection; my answer is that the existing reviewer rubric already distinguishes blocking findings from Minors and nits, while convergence adds another termination concept.
- ASSUMPTION: Another advisor may retain per-version publication consent because publishing is an external consequence; my answer is that the operator expressly preapproves publication after the first release, and CI still supplies the approval the framework cannot remove.
- ASSUMPTION: Another advisor may retain owed decisions for accountability; my answer is that accountability already lives in `activity-log.json`, `docs/sessions/decisions-log.md`, and `docs/operator-decisions.md`, while owed rows mainly duplicate stops and publication prompts.
- ASSUMPTION: Another advisor may allow an empty `non_goals` list; my answer is that this makes the requirement trivially evadable, while one concrete boundary can always describe what the session intentionally leaves unchanged.
- ASSUMPTION: Another advisor may make every unrequested addition a Major; my answer is that the existing rubric requires a probable failure scenario, so harmless extra work must remain Minor or a nit rather than manufacturing another round.
