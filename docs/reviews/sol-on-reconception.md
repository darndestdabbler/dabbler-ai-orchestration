# GPT-5.6 Sol on the reconceived framework

**2026-08-25.** Asked to attack the proposal in `docs/framework-reconception.md`,
not to bless it. Reproduced verbatim; the response to it is in that document.

---

## 1. Hierarchy

**No—the four concepts are useful, but `component → work plan` is the wrong hierarchy; components should form an architectural graph, while change-scoped work packages own sessions.**

- **Issue →** A component persists for the solution’s lifetime, while a work plan should terminate. A whole-life component plan becomes an append-only history. More importantly, features, contract changes, integration tests, migrations, and deployment work routinely span several components and cannot be nested honestly under one.
- **Location →** “A component gets a work plan” and the question of whether that plan is one session set for its whole life.
- **Fix →** Use two structures:

  ```text
  Solution
  ├── Component graph
  └── Work packages
      └── Sessions
  ```

  Each bounded work package references one or more affected components. Collapse “work plan” and “session set” into one object containing only objective, dependencies, acceptance criteria, affected components, and ordered sessions. What is lost is the ability to version a prose plan independently from its execution; that is not worth another lifecycle or UI level.

## 2. Supervisor-attention leakage

**The quiet half will not be quiet because the supervisor is still the scheduler, transport layer, and exception router.**

- **Issue →** `Copy Start the next session` requires a person to notice completion, select the next prompt, paste it into an engine, supply missing context, and recover interrupted runs. Multiplying session sets by component multiplies those handoffs. “Watching progress” is supervision, even if no approval button is involved.
- **Location →** “The supervisor copies a prompt from the tree and pastes it into an AI engine,” combined with “Sessions: build, test, verify — Silent.”
- **Fix →** Launch an entire work package once. An executor must advance sessions, persist context, run commands, update state, retry ordinary failures, and invoke reviewers. If infrastructure is explicitly rejected, describe the model honestly as **human-operated sessions**, not silent supervision.

- **Issue →** Normal engineering failures will be misclassified as “work sent back to an earlier step,” generating human interruptions. Full-suite failures caused by flakes, environmental faults, or unrelated regressions are especially likely to do this.
- **Location →** “Only two things break the silence” and the mandatory per-session lifecycle.
- **Fix →** Keep test failures inside an automated retry/repair loop. Escalate only when the approved scope, contract, acceptance criteria, or architectural decision must change. An ordinary failed test is not a human decision.

## 3. Artifact reuse

**As proposed, this is ceremony returning: existing rendering and backward compatibility do not justify making all four artifacts active process obligations.**

- **Issue →** Every independently maintained artifact adds writes, reconciliation, prompt context, and competing sources of truth. Having the AI perform the updates makes the ceremony cheaper, not free, and increases silent drift.
- **Location →** The blanket instruction that `spec.md`, `session-state.json`, `activity-log.json`, and `change-log.md` “should drive or document this process.”
- **Fix →** Assign each retained artifact one non-overlapping role:

  | Artifact | Decision |
  |---|---|
  | `spec.md` | Keep only as the authoritative objective, scope, and acceptance criteria for a bounded work package. It must not repeat `solution.yaml` or component contracts. |
  | `session-state.json` | Keep as minimal machine-owned operational state. Generate it; do not ask supervisors or models to narrate progress into it. |
  | `activity-log.json` | Make optional diagnostic output with retention limits. It must never be required reading or gate evidence. Remove it if engine and command logs already provide the same information. |
  | `change-log.md` | Generate from accepted work packages or version control at release time. Do not update it per session. |

  Preserve v1 compatibility through an adapter or legacy renderer, rather than preserving the old workflow semantics.

## 4. Cross-provider verification

**Do not run it per session; the cheapest policy that preserves vendor diversity is one focused independent review per bounded work package, with immediate review only for high-risk changes.**

- **Issue →** Per-session review repeatedly sends invariant context and reviews intermediate states that later sessions may replace. No cheaper policy can guarantee identical recall, but the valuable mechanism is independent semantic scrutiny—not the session boundary itself.
- **Location →** The proposed predictable session lifecycle and the open question about per-session cross-provider verification.
- **Fix →**
  1. Run deterministic tests, type checks, static analysis, and targeted security checks after every session.
  2. At the integration boundary, send the independent provider a compact packet: approved objective, relevant contract slices, final diff, changed tests, deterministic results, and unresolved assumptions.
  3. Ask it to identify semantic defects and inadequate tests, preferably by proposing executable adversarial tests rather than producing unrestricted prose.
  4. Have the primary engine resolve findings, then ask the reviewer to check only those resolutions—not begin another unrestricted review round.
  5. Trigger earlier independent review for public contract changes, authentication or authorization, data migrations, irreversible operations, security boundaries, or a diff exceeding the configured reviewability budget.

The measured “four new Majors every round” result rules out “review until clean.” Use a bounded review opportunity and explicit risk acceptance or escalation; otherwise verification has no token ceiling.

## 5. Open questions

**Use change-scoped sets, explicit attention events, checkpoint verification, and schema-driven AI planning.**

### 5.1 One session set or several

- **Issue →** A whole-life set never meaningfully completes and mixes unrelated changes, contract versions, and acceptance criteria.
- **Location →** Open question 1.
- **Fix →** Create one immutable work package per bounded change objective, potentially covering several components. Add another session while the same package remains open. Once accepted, do not reopen it; a later contract change creates a new package linked by `supersedes` or `causedBy`.

### 5.2 Computing “waiting on you”

- **Issue →** Inferring attention from statuses across solution, component, and session levels will create false positives and force supervisors to inspect the tree.
- **Location →** Open question 2.
- **Fix →** Maintain one extension inbox of explicit unresolved `attention-required` events. Each event should contain:
  - requested decision;
  - recommended option and alternatives;
  - reason automation cannot decide;
  - affected components and contracts;
  - evidence;
  - blocking status;
  - event to supersede or deduplicate.

  “Waiting on you” means such an event exists with `actor: human`; it must not be inferred from age, failure, or `In Progress` status.

### 5.3 Cross-provider verification per session

- **Issue →** Session boundaries are operational conveniences, not risk boundaries.
- **Location →** Open question 3.
- **Fix →** No by default. Verify independently at work-package integration, with the risk-triggered exceptions listed above.

### 5.4 What the AI needs to lead a work plan

- **Issue →** A prompt supplies behavior and a template supplies shape, but neither supplies authority, repository state, acceptance oracles, or escalation policy.
- **Location →** Open question 4.
- **Fix →** Give the planner a machine-readable work brief containing:
  - approved objective and exclusions;
  - base revision;
  - affected components, contract versions, and dependencies;
  - acceptance criteria and UAT instructions;
  - required test commands;
  - architectural and operational constraints;
  - allowed tools and mutation boundaries;
  - token/session budget;
  - explicit escalation conditions.

  Require a small schema-validated output: sessions, preconditions, expected changes, acceptance checks, and dependencies. Mechanically reject incomplete or circular plans. Use independent plan review only for high-risk packages; a routine human review would defeat the operating model.

## 6. Biggest unasked flaw

**The design starts autonomy one step too early: component contracts are executable design, yet their initial formalization has no approval gate.**

- **Issue →** The hierarchy calls a component “a black box with a contract, a version, consumers,” but the phase table gives contract formalization only “a glance.” Every component plan, implementation, test, and integration decision then depends on an unapproved baseline. A consistently wrong contract can pass all component-local tests, and because it is the initial baseline, it may never appear as a “contract change” that triggers attention.
- **Location →** The conflict between “Component — AI and human together,” the retained formal review of plan and design, and “Formalize the contracts — A glance; may object — No gate.”
- **Fix →** Fold baseline contract formalization into the existing component-decomposition approval rather than adding a third gate. That approval package should include interfaces, invariants, error semantics, versioning and compatibility rules, consumers, and acceptance examples. Cross-vendor review may continue finding new issues, so present unresolved findings and let the human accept the remaining risk; do not require a clean review. Any later semantic deviation becomes an explicit contract-change event.