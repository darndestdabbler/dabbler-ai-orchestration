model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 7920 in / 16519 out
elapsed: 246.834s  truncated: false
---
## A — alarmist language and resolution

### 1. Soundness

- **Issue →** A router-owned rendering layer is the right boundary only if it is a pure projection of the existing stop record. It must not independently reinterpret lifecycle rules.  
  **Location →** Refusals and deadlocks are defined in `packages/router/src/drive.ts:385,432,2435`; stop records retain `kind`, `class`, `reason`, and `step_id` at `packages/router/src/drive.ts:2477`.  
  **Fix →** Export one router-owned `renderStop(stop, mode)` function and have the terminal, status output, and Work Explorer consume it. Preserve the raw rule token and reason in details.

- **Issue →** “The AI has been told and may be fixing it” is false under pull. The router has emitted an instruction, but it cannot know that the engine read it or remains active.  
  **Location →** Pull has no supervisor, and the router runs only when the engine calls it; the pull-mode triage ladder is skipped entirely in `packages/router/src/drive.ts:2435-2477`.  
  **Fix →** Use state language: “Dabbler paused after the answer did not include a plan. Next action: the engine must submit a plan.” Never describe unobserved AI activity.

- **Issue →** Disappearance of a stop is not necessarily resolution. A different stop may have replaced it, and an AI working-tree change is not accepted lifecycle evidence until another call advances the record. Attention rows are intentionally derived from records.  
  **Location →** `run.json.stop` is the standing stop record at `packages/router/src/drive.ts:2477`; attention rows are derived by `tools/.../providers/workExplorerTreeModel.ts:968`; task progress is derived in `packages/router/src/progress.ts:906`.  
  **Fix →** Emit “Progress resumed past the previous pause” only when the old stop identity disappears and the phase or step advances without an immediate replacement stop. Emit “Decision answered” when an owed decision folds from `open` to `answered` in `packages/router/src/owedDecisions.ts`.

- **Issue →** `awaiting` cannot be derived from `kind` alone as proposed. `deadlock` is a `class`, not a `kind`, and expected action also depends on pull versus unattended operation.  
  **Location →** Stop `class` is `"first" | "deadlock"` and deadlock detection is defined at `packages/router/src/drive.ts:2435`; pull skips unattended triage.  
  **Fix →** Derive presentation from `(kind, class, mode)`, with an explicit exhaustive table and a test for every known combination.

### 2. Risk

- **Issue →** Replacing “stopped” with an unqualified “paused” can make the operator believe a process is still running and wait indefinitely. The current invocation has actually ended; only the session remains in flight.  
  **Location →** The current stderr text explicitly says the session remains in flight and the same command resumes it at `packages/router/src/drive.ts:2477`. Pull has no supervisor while the engine is silent.  
  **Fix →** Render: “Session paused; this command has ended. The session remains in flight.” Then name the next actor and action.

### 3. Recommendation

- **Issue →** The proposal conflates presentation, durable evidence, and claims of remediation.  
  **Location →** Stop semantics live in `packages/router/src/drive.ts:385-461`; terminal tones live in `tools/dabbler-ai-orchestration/src/router/dabblerTerminal.ts:181-195`.  
  **Fix →** Build the single router rendering function, add honest `good` transitions named “Progress resumed” and “Decision answered,” and retain raw `STOPPED`/`DEADLOCK` diagnostics in expandable details. Do not add AI self-reported “resolved” events.

---

## B — watcher supervision

### 1. Soundness

- **Issue →** The extension is the correct scheduler but the wrong owner of supervision policy. Putting threshold rules, permitted actions, and deduplication in the extension would duplicate router lifecycle rules, contrary to standing rule 3.  
  **Location →** Watcher policy inputs and recommendations already live in `packages/router/src/driver.ts:774,860`; the extension’s 30-second timer only refreshes trees at `tools/dabbler-ai-orchestration/src/extension.ts:242`.  
  **Fix →** Add a router command such as `dabbler session supervise --once`. The extension invokes it periodically and renders its result; the router owns clock evaluation, ladder level, identity, and deduplication.

- **Issue →** A daemon verb is unnecessary. Scheduling belongs to the process already alive, while policy remains in the router command.  
  **Location →** Under pull there is no router supervisor, while the extension is alive and polling at `tools/dabbler-ai-orchestration/src/extension.ts:242`.  
  **Fix →** Use an idempotent `--once` command rather than another long-lived process with separate startup, shutdown, and recovery semantics.

- **Issue →** An acknowledgment timeout does not distinguish abandonment from an engine thinking without touching the tree. The watcher records absence of observable activity, not engine state.  
  **Location →** Acknowledgment, liveness, and progress are inferred from files and logs in `packages/router/src/driver.ts:774-860`.  
  **Fix →** Never turn the acknowledgment reading alone into an automatic provider prompt.

- **Issue →** An owed decision is the wrong default escalation when no actual decision has been identified. “The engine is quiet” is an attention condition, not necessarily a human choice.  
  **Location →** Owed decisions are append-only `raised | answered | superseded` decisions in `packages/router/src/owedDecisions.ts`; Work Explorer already derives a liveness attention row at `tools/.../providers/workExplorerTreeModel.ts:968`.  
  **Fix →** Escalate the existing liveness row and include `clock` plus `recommended_action`; do not manufacture an owed decision solely from elapsed time.

### 2. Risk

- **Issue →** The likely failure is a paid user prompt sent while the engine is legitimately thinking. Capping one nudge per silence limits repetition but does not make the first spend justified.  
  **Location →** All three clocks use `verification.stalled_after_seconds`, and progress permits jobs to write for `JOB_SPIN_MULTIPLIER = 5` thresholds in `packages/router/src/driver.ts:774-860`; the operator’s premium-request constraint is stated in Question B.  
  **Fix →** Make nudging an explicit operator action that shows it may spend a USER prompt. Do not invoke `sendText` automatically.

### 3. Recommendation

- **Issue →** The watcher currently drops its most useful fields and performs no safe escalation.  
  **Location →** `clock` and `recommended_action` are produced at `packages/router/src/driver.ts:860` but omitted by `tools/dabbler-ai-orchestration/src/router/dabblerTerminal.ts:757`.  
  **Fix →** Build `session supervise --once`: at 1× return and display the full recommendation; at 2× mark “operator nudge available”; at 3× raise the existing liveness attention severity. Record emitted ladder levels against the existing watching identity and `supervision.jsonl` identified in session 80. Do not auto-nudge.

---

## C — two visible six-step workflows

### 1. Soundness

- **Issue →** Option (b) is unsound. Session progress cannot safely advance the component workflow because that workflow has independent commands, reviews, tests, and approval gates. Naming a component in session work does not prove those gates ran.  
  **Location →** The component workflow is defined at `packages/router/src/solution.ts:33` and advanced only through `packages/router/src/cli/workflow.ts` and `workflow/commands.ts`; it has `stepreview.ts` and `testphase.ts`.  
  **Fix →** Choose option (a): hide inactive workflow state instead of coupling the machines.

- **Issue →** Option (c) preserves the underlying contradiction. Tooltips cannot explain why a lifecycle that nothing advances remains at `1/6` forever.  
  **Location →** The row and progress bar are rendered at `solutionTreeModel.ts:337,540`; the Contract wording is at `solutionTreeModel.ts:347-353`; projection rewrites are limited and watched only at `SolutionTreeProvider.ts:46`.  
  **Fix →** Show `N/6`, the progress bar, and expected Contract rows only after `workflow enter` has occurred. Continue showing components, existing contracts, and edges otherwise.

- **Issue →** The task-row proposal is not merely a label change. Expanding one `work` row into N rows changes the row set and requires stable derived identities.  
  **Location →** The current six rows are fixed at `packages/router/src/progress.ts:851-857`; `work` is one aggregate row at `packages/router/src/progress.ts:1024`; step completion is available through `run.json.accepted_steps` and `step-execution.jsonl`.  
  **Fix →** Use derived identities such as `work:<step-id>`, preserving the underlying lifecycle record rather than claiming the row IDs themselves are unchanged.

- **Issue →** Calling `declare` simply “Plan” overstates its completion condition. The row ends when `session declare` appends a `task-declaration`, not when an independently specified plan-approval event occurs.  
  **Location →** The completion rule is stated for `declare` in `packages/router/src/progress.ts:851-857`; declaration refusal wording is at `packages/router/src/drive.ts:1464`.  
  **Fix →** Label it “Plan declared” or “Declare plan.” Use the tooltip to state the exact recorded event.

### 2. Risk

- **Issue →** Wiring the workflows would create false progress: a normal session could visually advance a component past reviews and gates that only workflow commands perform.  
  **Location →** Nothing in the session lifecycle currently advances the component workflow; its independent machinery is in `packages/router/src/cli/workflow.ts`, `workflow/commands.ts`, `stepreview.ts`, and `testphase.ts`.  
  **Fix →** Keep the state machines independent and gate visibility on explicit workflow participation.

### 3. Recommendation

- **Issue →** The default view exposes an inactive specialist workflow as though it were universal.  
  **Location →** The two unrelated six-step projections are implemented in `packages/router/src/progress.ts:851-857` and `packages/router/src/solution.ts:33`.  
  **Fix →** Implement option (a). Separately render session tasks as `Register → Plan declared → Work 1…N → Verify → Test (run of record) → Close`, with one placeholder Work row before a plan exists. This changes existing projections rather than adding a module, consistent with the “No new module without deleting one” rule.

---

## D — authoring and verification models

### 1. Soundness

- **Issue →** The proposal still risks mislabelling the router’s `generator` as the authoring model. Under pull, the coding author is the external engine model passed with `--model`; the router does not select it.  
  **Location →** Router roles are configured at `packages/router/router-config.yaml:69`; engine registration carries its own model, while `route(content, {role, ...})` selects internal roles at `packages/router/src/route.ts:721`.  
  **Fix →** Call the two user-facing choices “Coding engine model” and “Cross-provider verification preference.” Keep “Router generation preference” as a separate advanced control.

- **Issue →** A machine-local override is the correct scope for preference ordering. Tracking exact model identifiers in `dabbler.yaml` would contradict that file’s stated separation between repository facts and distribution registry facts.  
  **Location →** Precedence is packaged `router-config.yaml`, repository `dabbler.yaml`, then gitignored `local-overrides.yaml`; the principle is stated at the head of `dabbler.yaml`.  
  **Fix →** Store verifier ordering in `local-overrides.yaml` and the coding-engine default in extension machine-local storage used by Start Session.

- **Issue →** Selecting a verifier does not bypass the no-skip mandate, because verification still runs and provider exclusion still applies. It can, however, lower verification quality by elevating a weak but enabled model over the curated preference list.  
  **Location →** Cross-provider exclusion is enforced by routing at `packages/router/src/route.ts:721`; the curated verifier ordering is in `packages/router/router-config.yaml:69`.  
  **Fix →** Allow reordering only among models already named in the packaged `verifier.prefer` list and marked verifier-enabled. Do not allow every unnamed eligible registry model to be prepended.

- **Issue →** “One-line prepend” is under-specified because the brief does not define array-merge behavior across YAML layers.  
  **Location →** Config precedence is specified, but merge semantics for `prefer` arrays are not given.  
  **Fix →** **ASSUMPTION:** implement and test an explicit effective-order operation rather than relying on generic YAML array replacement.

### 2. Risk

- **Issue →** The likely failure is quiet quality degradation: a user chooses a cheap enabled verifier, assumes it is merely a preference, and actually places it ahead of the stronger packaged ladder.  
  **Location →** Unnamed models currently qualify after named models, while the proposed picker would promote one to the front; packaged ordering is at `packages/router/router-config.yaml:69`.  
  **Fix →** Restrict choices to the curated role list and show the effective post-exclusion ladder before saving.

### 3. Recommendation

- **Issue →** One picker currently combines three different concepts: coding engine, router generation, and verification routing.  
  **Location →** The distinction follows from `packages/router/router-config.yaml:69` and `packages/router/src/route.ts:721`.  
  **Fix →** Build a machine-local “Choose Models” command with two primary choices: coding-engine default and verifier ordering. Preserve `require_provider_in`, provider exclusion, escalation, and no-skip verification. Do not permit repositories to pin an exact verifier in tracked `dabbler.yaml`.

---

## E — local packages, bundles, and a solution repository

### 1. Soundness

- **Issue →** `local` is a genuine third provenance state but not a third package-resolution mechanism. Mechanically it is feed resolution; semantically it is an unpublished, machine-local artifact requiring different evidence and release gates.  
  **Location →** Current edge modes are `"feed" | "source"` in `packages/router/src/solutionDeps.ts`; source-mode guarantees and refusals are defined in `packages/router/src/resolution.ts`.  
  **Fix →** Model `local` explicitly for policy and presentation, but implement package consumption through the existing feed mechanics.

- **Issue →** “The producer commit is pushed” is not sufficient evidence. A local package may have been built from a dirty producer tree, different tooling, or different packaging inputs, and a later remote publication may rebuild different bytes from the same commit.  
  **Location →** The current evidence premise is an exact tracked-tree surface digest, while `packages/router/src/resolution.ts` refuses source mode because sibling-checkout success says nothing about the published package.  
  **Fix →** Require an immutable local artifact with an attestation containing producer remote, commit, producer surface digest, effective pack argv, version, and artifact digest.

- **Issue →** “Commits after the build stamp” is not a sufficient freshness rule. It misses uncommitted tracked changes and does not identify the exact package bytes consumed.  
  **Location →** The proposal’s freshness test is commit-based, while the framework’s stated close evidence uses a surface digest over every tracked file.  
  **Fix →** Compare the producer’s current tracked-surface digest with the attested producer digest, and record the consumed artifact digest in the consumer’s run-of-record evidence.

- **Issue →** Treating a local artifact exactly like a published feed can record a green suite against bytes that are never published. The failure occurs when the remote push rebuilds or relabels instead of promoting the exact tested artifact.  
  **Location →** Existing packaging uses declared `pack.argv` and `push.argv` in `dabbler.yaml`; the driver’s releasable publish phase performs pack then push.  
  **Fix →** For releasable work, either push the exact tested bytes unchanged and verify the digest from the declared feed, or restore from the remote feed and rerun the run of record. A pushed source commit alone must not satisfy the gate.

- **Issue →** Automatically rebuilding local packages changes the boundary stated by resolution: it currently declares and swaps but does not install, restore, or build.  
  **Location →** That boundary is explicit in the header of `packages/router/src/resolution.ts`; packaging execution is separately declared in `dabbler.yaml`.  
  **Fix →** Start with an explicit “rebuild local artifact” action using the producer’s existing `packaging.pack` declaration. Do not add cross-repository background builds or fetch hooks in the first version.

- **Issue →** A mandatory solution repository would create a second source of truth if it repeats dependencies, bundle membership, or repository-owned release facts. Per-repository edge ownership is deliberate.  
  **Location →** Consumers are “derived and never declared” at `solutionTreeModel.ts:53`; owner-specific edges live in `solution-dependencies.json`; `solution.yaml` and `dabbler workspace` already provide solution aggregation.  
  **Fix →** Do not create a framework-mandated solution repository. If a project independently uses one, restrict it to ownerless coordination facts: solution documentation, an authorised release manifest, and bundle definitions. It must not redeclare dependency edges.

- **Issue →** Composite packages are a project packaging convention, not yet a lifecycle primitive. Framework ownership would require new artifact identity, versioning, verification, promotion, rollback, and approval semantics.  
  **Location →** The framework currently knows per-repository `pack.argv` and `push.argv` through `dabbler.yaml`, with no bundle lifecycle in `packages/router/src/generated/driver-run.ts:28`.  
  **Fix →** Let projects express composite packaging through existing declared packaging commands and documentation. Do not add a bundle state machine.

### 2. Risk

- **Issue →** The most likely failure is a false release signal from mutable local bytes: package version X is built from a dirty checkout, cached locally, tested green, and later rebuilt clean for the remote feed with different contents. The proposed “producer commit is pushed” condition still passes.  
  **Location →** Local-feed freshness and pushed-commit gating are proposal E; current source-mode refusal exists specifically to prevent unpublished dependency evidence from satisfying close in `packages/router/src/resolution.ts`.  
  **Fix →** Make local artifacts immutable and content-identified. Record exact producer and artifact digests, and forbid releasable close until those tested bytes are promoted unchanged or the consumer reruns against remote bytes.

### 3. Recommendation

- **Issue →** The complete proposal combines dependency resolution, automatic building, release promotion, bundling, and repository topology; that is not a one-session feature.  
  **Location →** Existing responsibilities are split among `packages/router/src/solutionDeps.ts`, `packages/router/src/resolution.ts`, `dabbler.yaml`, and `solutionTreeModel.ts:411`.  
  **Fix →** Build only an evidence-safe local-artifact mode first:
  1. Unique immutable local version and attestation.
  2. Explicit producer pack action using existing `packaging.pack`.
  3. Consumer run-of-record records the artifact digest.
  4. Non-releasable sessions may close against that evidence.
  5. Releasable sessions require exact-byte promotion or a rerun against the remote feed.
  6. Add `stale-local` from digest comparison.

  Do not build a solution repository or composite-package lifecycle as part of this work.

---

## F — `next` starts unrequested sessions

### 1. Soundness

- **Issue →** `--start-next` preserves the wrong abstraction. `next` should advance or report the current lifecycle, not register another unit of work.  
  **Location →** `Driver.register()` currently starts a session whenever `--engine` is present and no session is closing in `packages/router/src/drive.ts`; the extension supplies those flags in `tools/.../commands/sessionCommands.ts:123`.  
  **Fix →** Remove registration from `session next`. Starting work must be an explicit `session start` operation.

- **Issue →** Returning `done` with exit 0 when nothing is in flight is correct for an idempotent pull loop. A usage refusal makes the documented “until done” loop terminate as an error.  
  **Location →** The current launch prompt is at `tools/.../commands/sessionCommands.ts:123`; the current no-session refusal is in `Driver.register()` in `packages/router/src/drive.ts`.  
  **Fix →** Make flagless `session next` return `kind: "done"` with “Nothing is in flight.”

- **Issue →** Push needs engine configuration and ownership of one fixed session; it does not need permission to chain into the next session.  
  **Location →** Push is `dabbler session drive --engine <name>` and follows the phase machine at `packages/router/src/generated/driver-run.ts:28`.  
  **Fix →** Have `drive` capture one session ID at launch and exit when that ID completes. If push may start work, require an explicit `drive --start` or a preceding `session start`; never infer another start after completion.

### 2. Risk

- **Issue →** The current failure is deterministic, not hypothetical: the launch prompt repeats flags that `Driver.register()` interprets as permission to start N+1, while dropping them produces a refusal.  
  **Location →** Prompt: `tools/.../commands/sessionCommands.ts:123`; registration behavior: `packages/router/src/drive.ts`; contradictory managed guidance: `AGENTS.md`.  
  **Fix →** Change CLI semantics and the launch prompt in the same session so there is no compatibility window that still starts unrequested work.

### 3. Recommendation

- **Issue →** `next` currently combines transition and registration.  
  **Location →** `Driver.register()` in `packages/router/src/drive.ts`.  
  **Fix →** Make `next` transition-only. Use `session start` as the pull-mode start door; return clean `done` when idle; make push explicitly start or attach to exactly one session and terminate when that session completes.

---

## Sequencing

Every numbered item below is one day-sized session and must end with the requested full suite green, cross-provider verification, and commit.

| Session | Scope | Constraint |
|---|---|---|
| **1** | **F:** Remove implicit registration from `next`; add idle `done`; update the launch prompt and push’s one-session boundary. | **Real:** Prevents unrequested sessions before further walkthroughs. CLI and prompt must change atomically (`packages/router/src/drive.ts`, `tools/.../commands/sessionCommands.ts:123`). |
| **2** | Mechanical: fix `String(null)` coercion and the two missing context-menu entries. | **Convenience:** Small bounded fixes grouped together. **ASSUMPTION:** the brief supplies no paths for these three fixes. |
| **3** | **A** plus the mechanical “terminal never reveals itself” fix: central stop rendering, honest paused wording, good-toned “Progress resumed”/“Decision answered,” and terminal reveal. | **Real within the session:** Revealing the terminal is necessary for the new terminal messages to be useful (`tools/dabbler-ai-orchestration/src/router/dabblerTerminal.ts:181-195`). |
| **4** | **C task projection** plus the opaque Work-row mechanical fix: stable per-step Work rows and clearer lifecycle labels. | **Real within the session:** Both modify `buildTaskRows` and the aggregate work projection (`packages/router/src/progress.ts:906,1024`). |
| **5** | **C Solution Explorer option (a)** plus the already-scoped refresh gap: hide inactive workflow progress and Contract placeholders; fix refresh behavior. | **Real within the session:** A stale view would make the visibility correction appear broken (`SolutionTreeProvider.ts:46`, `solutionTreeModel.ts:337-353`). |
| **6** | **B:** Add router-owned `session supervise --once`; display `clock` and `recommended_action`; persist ladder deduplication; no automatic nudge. | **Convenience:** Doing A first lets supervision reuse established wording and tones. Watcher semantics already exist at `packages/router/src/driver.ts:860`. |
| **7** | **D:** Add machine-local coding-engine default and curated verifier reordering with an effective-ladder preview. | **Independent:** No semantic dependency on A–C or E (`packages/router/router-config.yaml:69`, `packages/router/src/route.ts:721`). |
| **8** | **E1:** Add local-edge schema, immutable local versioning, producer attestation, and explicit local pack action; keep resolution disabled until evidence is complete. | **Real:** Producer identity and artifact evidence must exist before consumers can rely on local artifacts (`packages/router/src/solutionDeps.ts`, `packages/router/src/resolution.ts`). |
| **9** | **E2:** Resolve consumers from attested local artifacts; record the consumed digest; permit only non-releasable close under local evidence. | **Real:** Depends on session 8’s artifact and attestation format. Existing close refusals are defined in `packages/router/src/resolution.ts`. |
| **10** | **E3:** Add exact-byte remote-promotion/rerun gates and `stale-local` in Solution Explorer. | **Real:** Promotion gates and freshness require consumer evidence from session 9; the existing drift vocabulary is at `solutionTreeModel.ts:411`. |

The ordering of sessions 2, 4, 5, and 7 is otherwise convenience. Session 1 is the safety prerequisite; session 3 should precede session 6 if supervision consumes the shared rendering contract; sessions 8–10 have genuine evidence-format dependencies.

## The one thing to cut

- **Issue →** Cut the automatic 2× engine nudge entirely.  
  **Location →** The watcher observes files and logs but cannot distinguish thinking from abandonment at `packages/router/src/driver.ts:774-860`; pull has no engine supervisor, and the operator states that each USER prompt can spend premium budget in Question B.  
  **Fix →** Provide the recommendation, escalating visibility, and an explicit operator-triggered nudge only. A timeout is evidence of silence, not permission to spend.