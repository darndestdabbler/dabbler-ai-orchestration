model_name: gemini-3-1-pro
model_id: gemini-3.1-pro-preview
provider: google
tokens: 8358 in / 2377 out
elapsed: 206.833s  truncated: false
---
### Question A — rendering layer and "resolved" states

**Soundness:**
The proposal to assert "the AI has been told and may be fixing it" under the pull is factually unsound. Under the pull, the framework cannot see the engine and cannot guarantee the instruction was read (Brief: *Pull mode: the engine sits in the person's own CLI*; *Question A: framework cannot see the engine at all*). The proposal to derive a `resolved` event from standing stops disappearing from `run.json` or decisions folding to `answered` in `owedDecisions.ts` is mechanically sound. 

**Risk:**
Softening "deadlock" to "paused" destroys the mechanical meaning of the event. A deadlock is specifically defined as the exact same `kind`, `step_id`, and undecorated reason occurring twice (`packages/router/src/drive.ts:2435`). Hiding this under "paused" masks a fatal infinite loop from the operator, guaranteeing wasted provider spend.

**Recommendation:**
Reject the rendering layer and vocabulary softening. Implement only the derived `resolved` event.
- **Issue** → No terminal feedback when an issue clears.
- **Location** → `tools/dabbler-ai-orchestration/src/router/dabblerTerminal.ts`
- **Fix** → Add state tracking for previously seen stops in `run.json` and `open` decisions in the ledger. When a poll shows a stop cleared or a decision folded to `answered`, emit a `resolved` event with the `good` tone. Retain the strict `kind` and `class` vocabulary (`drive.ts:461`).

### Question B — watcher and supervision

**Soundness:**
Putting the supervisor in the extension violates the monorepo's architectural boundary. The router owns lifecycle rules (Brief: *the router is the only thing that owns lifecycle rules*), and Rule 3 forbids duplicating them. The extension's poll currently only refreshes trees (`extension.ts:242`).

**Risk:**
Auto-nudging by injecting text into the engine's terminal via `sendText` risks double-spending a provider round if the engine is merely slow to respond, directly impacting the operator's Copilot seat budget (priced per user prompt). 

**Recommendation:**
Reject the extension-side supervisor.
- **Issue** → The watcher observes (`packages/router/src/driver.ts:860`) but nothing acts on its reading.
- **Location** → `packages/router` (CLI) and `packages/router/src/cli/session.ts`
- **Fix** → Add a `dabbler session supervise` daemon verb to the router. The extension launches this process in the background. The daemon acts only at the 3× multiple on the `acknowledgment` clock by raising an owed decision (`packages/router/src/owedDecisions.ts`) with the existing `recommended_action`, alerting the operator without spending a provider prompt.

### Question C — two lifecycles and opaque work rows

**Soundness:**
Renaming display labels in the VS Code tree is sound because row IDs on disk (`packages/router/src/progress.ts:851-857`) remain unchanged, preserving machine readability. Expanding the `work` row into multiple rows derived from `accepted_steps` (`drive.ts`) accurately reflects the driver's execution state.

**Risk:**
Option 3(b) (coupling the module workflow to sessions) introduces tight coupling between two independent state machines, violating Rule 3. The module workflow has its own independent approval gates, tests (`testphase.ts`), and review prompts (`stepreview.ts`).

**Recommendation:**
Adopt proposals C1, C2, and C3(a).
- **Issue** → The Work row is opaque and the Solution Explorer displays a stagnant 6-step lifecycle.
- **Location** → `tools/.../providers/workExplorerTreeModel.ts` and `SolutionTreeProvider.ts`.
- **Fix** → Implement C1 (map `declare` to **Plan**, `run-of-record` to **Test**) and C2 (expand `accepted_steps` into individual Work rows in `buildTaskRows`). For C3, execute (a): conditionally hide the module workflow UI (`solutionTreeModel.ts:337`, `540`) unless the repository's projection (`.dabbler/solution/projection.json`) explicitly shows entry via `workflow enter`.

### Question D — authoring and verifying models

**Soundness:**
Writing model preferences to `local-overrides.yaml` is sound for local overrides but problematic for verification. The proposal preserves the `require_provider_in` hard filter (`packages/router/src/route.ts:721`), meaning cross-provider verification structurally holds.

**Risk:**
Allowing operators to configure the verifier locally creates a bypass for the repository's baseline verification standard. Because `prefer` dictates ordering, an operator could select a cheap, weak model, circumventing the intended rigor of the cross-provider mandate. ASSUMPTION: The team relies on `dabbler.yaml` to enforce project-wide quality floors.

**Recommendation:**
Limit quick-pick configuration to the authoring/generator model.
- **Issue** → Operator wants UI-driven model selection, but allowing verifier overrides compromises test rigor.
- **Location** → VS Code extension commands and `local-overrides.yaml`.
- **Fix** → Create "Dabbler: Choose Authoring Model", writing the `generator` role preference to `local-overrides.yaml`. Refuse the implementation of a user-selectable verifier override. The verifier role ladder (`packages/router/router-config.yaml:69`) must remain governed by the distribution to enforce the no-skip mandate safely.

### Question E — local packages, bundling, solution repo

**Soundness:**
The proposed `local` resolve mode fundamentally breaks the framework's evidence model. The framework relies on the constraint that "a green build against a sibling checkout says nothing about the published package" (`packages/router/src/resolution.ts`). Bypassing the close phase refusal for an unpushed, machine-local artifact invalidates the digest-based guarantee of the run-of-record. 

**Risk:**
A central solution repository violates the core design principle that dependencies are "derived and never declared" globally (`solutionTreeModel.ts:53`). It creates a split-brain scenario between the central manifest and each repository's `solution-dependencies.json`.

**Recommendation:**
Reject `local` resolve mode, the solution repository, and framework-owned bundling.
- **Issue** → Operator needs a middle ground between slow remote publishes and session-blocking source mode.
- **Location** → `dabbler.yaml` packaging block.
- **Fix** → Utilize the existing `packaging` architecture. Allow the operator to configure a local feed URL in `dabbler.yaml`'s `push.argv`. The producer session completes its run-of-record and publishes to the local feed using standard mechanics. The consumer resolves via standard `feed` mode (`solutionDeps.ts`). No framework changes are required; this is purely configuration.

### Question F — looping unrequested sessions

**Soundness:**
The engine command prompt currently passes `--engine` and `--provider` on a looping `next` call (`tools/.../commands/sessionCommands.ts:123`), which cleanly but incorrectly triggers the `if (this.options.engine !== null)` start condition (`packages/router/src/drive.ts`).

**Risk:**
Relying on the engine to strip flags after the first call based on an English instruction in `AGENTS.md` is brittle. Engines will regress and repeat the exact CLI string they were launched with, resulting in continuous unrequested session starts and budget drain.

**Recommendation:**
Decouple session creation from progression.
- **Issue** → `session next` implicitly starts new sessions if `--engine` is present.
- **Location** → `packages/router/src/drive.ts` and `tools/.../commands/sessionCommands.ts`.
- **Fix** → Modify `Driver.register()` to completely reject session starts via `session next`. Session creation must exclusively occur via `dabbler session start`. Change the extension's launch prompt to invoke `dabbler session start --engine <e>`, which initializes the session and instructs the engine to loop `dabbler session next` (with no flags) until exit 0. Implement exit 0 for `done` when no session is in flight.

---

### Sequencing

The work must be ordered to respect lifecycle constraints and prioritize unblocking operator workflows:

1. **Session 1: Terminal & Visual Integrity**
   - *Scope:* `String(null)` bug, Solution Explorer auto-refresh, missing context-menu entries, terminal reveal fix. 
   - *Constraint:* Observability primitives must work before modifying lifecycle UI.
2. **Session 2: Work Explorer Expansion (Fixes Mechanical #6 & Question C1/C2/C3a)**
   - *Scope:* Rename `declare`/`run-of-record`, expand `accepted_steps` into distinct Work rows, hide Module Workflow unless entered.
   - *Constraint:* Solves the opaque "Work" row (mechanical fix #6). Dependent on Session 1's tree-refresh fixes to render correctly.
3. **Session 3: Lifecycle Safety (Question F)**
   - *Scope:* Rip session creation out of `session next`, enforce `session start`, implement exit 0 on `done`.
   - *Constraint:* Critical budget/safety fix. Must land before supervision (Session 5) to prevent nudges from starting phantom sessions.
4. **Session 4: Event Rendering (Question A)**
   - *Scope:* Implement `resolved` terminal event from ledger and cleared stops.
   - *Constraint:* Relies on the terminal reveal fix from Session 1.
5. **Session 5: Configuration (Question D)**
   - *Scope:* "Choose Authoring Model" quick-pick writing to `local-overrides.yaml`.
6. **Session 6: Supervision (Question B)**
   - *Scope:* `dabbler session supervise` daemon. 
   - *Constraint:* Must be last. Running background supervisors requires the session lifecycles (Session 3) to be strictly stable.

### The one thing to cut

**The entire Module Workflow (Question C / `packages/router/src/solution.ts:33`).** 
The Brief highlights that nothing in the session lifecycle advances it, it is disjointed from the core product loop, and the operator is completely confused by it. Hiding it (Option C3a) leaves abandoned code (verbs, tests, gates) dragging on monorepo maintenance. Per the repository's standing rule ("No new module without deleting one"), delete it completely. The framework's core value is session-based iteration; the 6-step component design lifecycle is dead weight.