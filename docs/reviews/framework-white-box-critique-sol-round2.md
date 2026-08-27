# Round-Two Critical Review: The Framework as the Only White Box

## Part A — Attack Point 8: Software Assumptions in Core Modules

### A1. The solution model is a software lifecycle, not a domain-neutral component graph

**Issue →** The strongest leak is not in `evidence.py`, `checks.py`, or `affected.py`. It is the foundational solution state machine. Components may be linguistically transferable, but the implemented kinds, phases, deliverables, approval points, and dependencies encode software construction.

A policy suite or score would have to pretend that:

- its components are `library` or `integration`;
- its lifecycle is `plan → decompose → contracts → mocks → integration → build`;
- it has signatures, callers, stand-ins, contract checks, and real implementations replacing mocks;
- its approving human is a developer.

This is not a thin adapter gap. It is the current ontology.

**Location →**

- `ai_router/solution.py`:
  - `KINDS`
  - `STEPS`
  - `STEP_TITLES`
  - `STEP_DELIVERABLES`
  - `APPROVAL_STEPS`
  - `KNOWN_COMPONENT_KEYS`
  - `parse`
- `ai_router/workflow.py`:
  - `fold`
  - `_run_review`
  - `_main`
- `ai_router/stepreview.py`:
  - `build_prompt`

`solution.parse` rejects every undeclared kind and field. `stepreview.build_prompt` explicitly says the solution is “being built in six steps” and imports the software-specific deliverables. `workflow._main` records approval by a literal `"developer"`.

**Fix →** Do not call this layer domain-neutral. Either:

1. keep it as the software solution profile and build a second profile after a real non-software pilot; or
2. extract a versioned workflow profile containing kinds, phases, deliverables, legal transitions, approval ownership, and artifact fields.

Do not reduce these semantics to prompt guidance. They govern state transitions and therefore belong in executable, versioned workflow definitions.

---

### A2. Deterministic checks are organized around tests and software tool categories

**Issue →** `checks.py` is configurable within software ecosystems, but its generic executor sits inside a test-specific policy:

- the stages are `targeted` and `final-full`;
- the principal objects are suites and tests;
- selection maps changed paths to test files;
- complete-suite execution is a special case;
- deterministic controls are limited to compile, typecheck, lint, and analyzer;
- a suite is always required.

A policy validator or notation checker can be forced into `testing.suites`, but the resulting record silently misstates what happened. A cross-reference checker is not a test suite merely because both are executable commands.

**Location →**

- `ai_router/checks.py`:
  - `STAGE_TARGETED`
  - `STAGE_FINAL_FULL`
  - `CONTROL_KINDS`
  - `SelectionConfig`
  - `load_selection_config`
  - `select_tests`
  - `load_checks`
  - `plan`
  - `_targeted_suite_command`
- `ai_router/affected.py`:
  - `SelectionConfig`
  - `select_tests`
  - `classify_preverify_command`
  - `preverify_gate`
- `ai_router/verify.py`:
  - `run_round`
  - `_step_deterministic_facts`
  - `run_step_close`

`verify.run_round` unconditionally enters the affected-test policy before model verification. `_step_deterministic_facts` explicitly adds `KIND_TESTS` facts for every declared suite.

**Fix →** Generalize one level, not all the way to an abstract domain engine:

- rename suites to executable checks;
- let checks declare a class such as `acceptance`, `consistency`, `lint`, `render`, `simulation`, or `test`;
- replace `test_roots` and `test_glob` with declared evidence-target mappings;
- retain the generic subprocess runner, tree digest, timeout, and mutation detection;
- keep software test-selection policy in a software profile.

The generic command runner already proves that domain-specific deterministic tools can be selected by configuration without importing adapters into core. That weakens my round-one claim that an executable in-process `DomainAdapter` is always necessary.

---

### A3. `affected.py` is language-neutral now, but not domain-neutral

**Issue →** The prior Python assumptions have been removed correctly: there is no AST import graph, package constant, or `test_*.py` discovery in the supplied `affected.py`. Selection is declared rather than inferred. That removes programming-language coupling, but the module still assumes every affected artifact is answered by tests, smoke tests, or a full suite.

A policy suite may instead map a changed definition to cross-reference checks and affected obligations. A score may map an instrumentation change to range checks, extracted parts, and mockup rendering. The present result shape cannot describe those answers without calling them tests.

**Location →**

- `ai_router/affected.py`:
  - `REASON_CHANGED_TEST`
  - `REASON_SMOKE`
  - `SelectedTest`
  - `SelectionResult.test_paths`
  - `is_test_file`
  - `select_tests`
  - `targeted_command`
  - `preverify_gate`

**Fix →** Preserve the declared-mapping design, which is simpler than adapters and has already removed language inference. Rename the selected object and reasons to domain-neutral terms, then place test-specific discovery and command rendering in the software profile.

---

### A4. Reproduced evidence requires a software-shaped executable transcript

**Issue →** `evidence.py` treats reproducibility as a command-like public entrypoint run in two pristine checkouts with exit codes and byte-identical output. That is strong evidence for software defects, but it is not a general definition of reproduction.

A policy failure case may be a fact pattern evaluated against two clauses. A musical failure case may be a notated passage, instrument assignment, rendered excerpt, or performer report. Those can be reproducible without being a CLI, public API, or test entrypoint.

**Location →**

- `ai_router/evidence.py`:
  - `PUBLIC_ENTRYPOINT_KINDS`
  - `ENTRYPOINT_AGENT_HARNESS`
  - `_validate_entrypoint`
  - `validate_transcript`
  - `validate_finding_evidence`
  - `authoritative_tier`
  - `UNPROVABLE_ABSENCE_LADDER`

**Fix →** Retain the current transcript as an `executable-replay` evidence type. Add evidence-type-specific schemas rather than weakening it into a universal bag of fields. A second domain should supply the next concrete evidence type.

---

### A5. Documentation is treated as behaviorless by file extension

**Issue →** This is the most dangerous leak relative to its removal cost. Any finding citing only `.md`, `.markdown`, `.rst`, or `.txt` files is automatically non-blocking. A policy suite will commonly consist almost entirely of those files. A Major contradiction in a regulation or policy can therefore be mechanically downgraded because of its storage format.

This is not merely incompatible with the proposal’s domain goal. It already contradicts the honest-fields corollary because the verifier controls `evidencePaths`, and those paths influence the branch.

**Location →**

- `ai_router/verdict.py`:
  - `_DOC_EXTENSIONS`
  - `_DOC_EXEMPT_SEGMENT`
  - `is_doc_only_issue`
  - `is_blocking_issue`
  - `classify_blocking`

**Fix →** Delete extension-based blocking policy. Blocking authority must come from the pre-registered acceptance contract or an explicit artifact policy written by someone other than the verifier.

---

### A6. Approval roles and contract authority are software-specific and internally inconsistent

**Issue →** The workflow names the approving party “developer,” only requires approval for `plan` and `decompose`, and deliberately excludes the separate `contracts` phase. Contract changes are approval-gated only when the caller supplies `--needs-approval`.

That is software-specific terminology, but the larger defect is authority being caller-selected. A policy amendment or score instrumentation change cannot safely rely on the author remembering to request approval.

**Location →**

- `ai_router/solution.py`:
  - `APPROVAL_STEPS`
- `ai_router/workflow.py`:
  - `fold`
  - `_run_review`
  - `_main`, especially the `approve` and `contract-changed` branches

**Fix →** Declare approval ownership and mandatory gates in the workflow profile. Derive them from the transition and artifact class; never accept an author-controlled `needsApproval` flag.

---

### A7. Git is a hard platform dependency, but not necessarily a software-domain leak

**Issue →** Evidence, journals, envelopes, disputes, close gates, and repository identity all assume a Git repository and file-backed artifacts. A policy suite or score stored in Git can use these mechanisms unchanged. Removing Git merely to claim domain purity would discard valuable deterministic infrastructure.

It becomes a domain leak only if the intended framework must supervise artifacts that cannot be represented as versioned files and command outputs.

**Location →**

- `ai_router/evidence.py`:
  - `repo_root_for`
  - `snapshot_worktree_tree`
  - `changed_paths_between`
  - `read_tree_blob`
  - `tree_paths`
- `ai_router/journal.py`:
  - `control_root`
  - `repository_id`
  - `worktree_id`
- `ai_router/gates.py`:
  - `check_working_tree_clean`
  - `check_pushed_to_remote`
  - `check_test_run_fresh`
- `ai_router/verify.py`:
  - `run_round`
  - `run_step_open`
  - `run_step_close`

**Fix →** Keep Git as an explicit platform contract for the one-to-three-person framework. State the honest boundary: “domains are general only when their authoritative artifacts are representable as versioned files and deterministic commands.” Do not spend engineering effort abstracting Git before a real domain disproves that boundary.

---

### A8. The manifest has no implemented kind-specific quarantine

**Issue →** Section 7 says kind-specific fields are quarantined inside kind-specific blocks. The current manifest has no such block. It has one closed field set shared by two software kinds, and unknown fields are refused.

**Location →**

- `ai_router/solution.py`:
  - `KINDS`
  - `KNOWN_COMPONENT_KEYS`
  - `_reject_unknown`
  - `parse`

**Fix →** Treat the section 7 schema as proposed, not existing. If implemented, keep a small common component envelope and one opaque, schema-versioned `kindConfig` block. Do not let core interpret that block.

---

### Cost ranking

| Rank | Leak | Removal cost | Keep or remove |
|---:|---|---|---|
| 1 | Six-step software lifecycle and component ontology | Very high; rewrites manifest, workflow, review prompts, projection, and approval semantics | **Do not remove yet.** Preserve as a software profile and prove a second profile first. |
| 2 | Test-centric deterministic-check policy | High; affects planning, preverification, step closure, records, and CLI language | Generalize narrowly around executable checks; retain software test policy as a profile. |
| 3 | Git-backed artifact and journal substrate | Very high with little demonstrated benefit | **Load-bearing; not worth removing.** Declare Git/file-backed artifacts as a platform constraint. |
| 4 | Executable-transcript definition of reproduced evidence | Medium | Keep as one evidence type; add others only from real pilots. |
| 5 | Closed manifest kinds and fields | Medium because projection and workflow consume them | Change only with the workflow-profile extraction. |
| 6 | Developer-specific approval terminology and caller-selected contract gates | Low to medium | Remove now because it affects authority, not merely naming. |
| 7 | Documentation-extension non-blocking rule | Low | Remove immediately. It is already wrong for software documentation and catastrophic for policy. |

### Judgment on “a domain is configuration, never a code path”

**Issue →** The literal guardrail is false of the existing system. The core imports and branches on software kinds, software phases, test-selection rules, software controls, developer approvals, and documentation exemptions.

My round-one conclusion remains substantially supported: the proposal denies implementation that its current architecture requires. The source makes the contradiction worse because `solution.py` is not a nominal seam waiting for adapters; it is a closed software schema.

The source also weakens one part of my original remedy. Set 143’s design, reflected in `affected.py` and `evidence.py`, shows that language-specific inference can be deleted in favor of declared mappings and byte-level provenance. Domain-specific deterministic tools can likewise be external commands selected by generic configuration. An in-process adapter interface is therefore not automatically necessary.

**Location →**

- Contradiction:
  - `ai_router/solution.py`: `KINDS`, `STEPS`, `STEP_DELIVERABLES`, `parse`
  - `ai_router/checks.py`: `CONTROL_KINDS`, `plan`
  - `ai_router/affected.py`: `select_tests`, `preverify_gate`
  - `ai_router/verdict.py`: `is_doc_only_issue`
- Evidence that configuration can work:
  - `ai_router/affected.py`: `load_selection_config`, `select_tests`
  - `ai_router/evidence.py`: `verify_quote`, `run_absence_search`
  - `ai_router/checks.py`: `load_checks`, `execute`

**Fix →** Replace the guardrail with:

> Core does not branch on domain names. Core may execute versioned workflow profiles and declared deterministic commands. The current six-step profile is software-specific. A second domain must prove the common profile boundary before it is generalized.

That is reachable. The current absolute claim is not.

---

## Part B — Round-One Findings Re-tested Against the Code

## Blocking findings

### B1. AI return typing versus unconstrained effects — CHANGED

**Issue →** The code has more effect control than the document revealed. Steps are anchored to a commit, constrained by a file envelope, checked after deterministic commands, snapshotted, and protected by a pre-commit guard. Check commands that mutate the candidate tree fail.

The remaining problem is narrower: these are post-effect validation and commit controls, not isolation. Work occurs in the shared working tree, and there is no shown sandbox, credential restriction, external-effect manifest, or rollback. The proposed general `ai_call` authoring primitive still does not exist.

**Location →**

- `ai_router/verify.py`:
  - `run_step_open`
  - `run_step_close`
  - `run_step_guard_commit`
- `ai_router/checks.py`:
  - `execute`
- `ai_router/evidence.py`:
  - `snapshot_worktree_tree`

**Fix →** Withdraw the demand for a complete transactional job platform before a pilot. Require the simpler invariant appropriate to this system: authoring runs in a disposable Git worktree, has no push/deploy credentials, and only framework-validated commits are promoted. External irreversible tools remain out of scope unless explicitly approved.

---

### B2. Mandatory cross-vendor verification is described, not enforced — ALREADY HANDLED

**Issue →** Withdrawn. The code derives the orchestrator’s provider, passes it as a hard exclusion, keeps that exclusion across retry, fails closed when no candidate survives, records both providers, and blocks close without a non-blocking ledger result. Step review additionally requires two mutually distinct reviewer providers and checks the providers that actually answered.

**Location →**

- `ai_router/identity.py`:
  - `resolve_model_provider`
  - `resolve_orchestrator_identity`
  - `resolve_session_orchestrator_identity`
- `ai_router/verify.py`:
  - `_dispatch_verification`
  - `run_round`
  - `_adjudication_exclusions`
- `ai_router/stepreview.py`:
  - `review`
  - `_review_once`
- `ai_router/gates.py`:
  - `check_verification_clean`

**Fix →** Finding withdrawn. A defense-in-depth gap in the session verifier is recorded separately in Part C; it does not restore the round-one claim that independence is merely documentary.

---

### B3. Browser and MCP write paths lack authorization — CONFIRMED

**Issue →** The underlying approval operation already lacks actor authentication and state-bound authorization. `workflow approve` can append an approval with the static actor label `"developer"`; there is no authenticated identity, role, freshness check, reviewed-artifact hash, or human-presence proof. Reusing this function through HTTP would expose the weakness rather than solve it.

The code makes the finding worse than expected: authorization is not merely unspecified for WP-8; the command intended to sit beneath WP-8 is currently authorization-free.

**Location →**

- `ai_router/workflow.py`:
  - `_main`, `approve` branch
  - `append`
- `ai_router/journal.py`:
  - `actor`
  - `_Batch.append`
- `ai_router/verify.py`:
  - `run_waive`

`journal.actor` constructs caller-supplied provenance; it does not authenticate it. `run_waive` uses TTY presence, which does not establish identity and can be exercised by an agent with a PTY.

**Fix →** Keep served writes blocked until commands require an operator identity and compare-and-swap precondition. MCP remains read-only.

---

### B4. Journal sequence numbers under union-merged writers — CHANGED

**Issue →** The current `journal.py` correctly obtains a total local order through one filesystem lock and one append authority. The proposed Git union topology is not implemented. Adopting it would remove a property the current journal depends on.

This is therefore a regression risk rather than an existing duplicate-sequence defect.

**Location →**

- `ai_router/journal.py`:
  - `journal_lock`
  - `_Batch.append`
  - `_check_sequences`
  - `read_events`
  - `tail_sequence`

**Fix →** Preserve one authoritative sequencer. Team clients may submit commands or export records through Git, but must not union-merge authoritative journals and continue treating `sequence` as a global SSE cursor.

---

### B5. Decisions are not bound to reviewed state — CONFIRMED

**Issue →** Approval carries a target name and count of open findings, not the reviewed artifact hash, event revision, expected state, or expiry. The fold accepts the event without verifying that a review exists or remains current.

The code makes the problem worse: even a stale-state check would be insufficient until legal transition preconditions exist.

**Location →**

- `ai_router/workflow.py`:
  - `_main`, `approve` branch
  - `append`
  - `fold`

**Fix →** Approval must include the reviewed projection revision and artifact/tree digest, and its writer must reject it unless the target is currently waiting for that approval against the same digest.

---

### B6. Terminal escalation lacks checkpoint and compensation semantics — CHANGED

**Issue →** The implemented verification loop already terminates between bounded calls and preserves durable trees, rounds, disputes, open-step commits, and closed-step snapshots. For those operations, “terminal return” is substantially safer than the document alone suggested.

The unresolved case is a future long-running authoring call with external effects. No generic escalation primitive or continuation protocol exists in the supplied code.

**Location →**

- `ai_router/verify.py`:
  - `run_round`
  - `run_step_open`
  - `run_step_close`
  - `record_dispute`
- `ai_router/journal.py`:
  - `write_heartbeat`
  - `read_heartbeat`

**Fix →** Do not build a universal continuation system now. Permit escalation only between framework steps or from a disposable worktree. Add richer continuation semantics only when an implemented job demonstrably needs mid-call suspension.

---

### B7. “Domain as configuration” contradicts mechanization — CONFIRMED

**Issue →** The contradiction is real and worse than the document showed. Core currently contains explicit software kinds, phases, test policy, control kinds, approval roles, and documentation blocking policy.

My original mandatory adapter remedy was too specific. The generic command runner and declared selection mappings show that executable domain behavior can remain outside core without an imported adapter.

**Location →**

- `ai_router/solution.py`: `KINDS`, `STEPS`, `STEP_DELIVERABLES`, `parse`
- `ai_router/checks.py`: `CONTROL_KINDS`, `load_checks`, `execute`
- `ai_router/affected.py`: `select_tests`
- `ai_router/verdict.py`: `is_doc_only_issue`

**Fix →** Replace the absolute guardrail with workflow profiles plus declared executable checks. Defer adapter infrastructure until a second domain proves that external commands and configuration are insufficient.

---

### B8. Verbs × artifacts is not a lossless normative grammar — CONFIRMED

**Issue →** The existing code demonstrates that lifecycle and authority cannot be recovered from a linguistic pair. `approved`, `returned`, `contract-changed`, dispute, adjudication, waiver, step open, step close, and amendment each have different preconditions and consequences.

The code makes the finding stronger: even the existing explicit verbs are unsafe where their transition rules are not enforced.

**Location →**

- `ai_router/workflow.py`:
  - `EVENTS`
  - `fold`
  - `_main`
- `ai_router/verify.py`:
  - `run_adjudication`
  - `run_waive`
  - `run_step_open`
  - `run_step_close`
  - `run_step_amend`

**Fix →** Keep verbs × artifacts as prompt-routing metadata only. State transitions remain explicit executable operations with preconditions.

---

### B9. “One delivery channel” versus a lagging extension — CONFIRMED

**Issue →** The current Python projection has no protocol version or compatibility handshake. A separately released shell can consume a changed projection without a mechanical compatibility decision. Shipping renderer assets in the wheel does not version extension-side bridge behavior.

The release history in `STATUS.md` also records separate Python and VS Code release tracks.

**Location →**

- `ai_router/workflow.py`:
  - `write_projection`
  - `project`
- `ai_router/solution.py`:
  - `as_dict`

Neither projection includes a projection-schema or API compatibility version.

**Fix →** Withdraw “skew becomes structurally impossible.” Add one integer projection/API version and fail visibly when a shell does not support it. A full enterprise compatibility matrix is unnecessary for the pilot.

---

### B10. Weak-model testing cannot settle human usability — STILL UNTESTABLE

**Issue →** The served supervisor UI does not exist in the supplied code, and `STATUS.md` says the operator walkthrough remains outstanding. Weak-model testing has exposed instruction defects but also produced harness bugs and confabulated findings. None of that measures human authorization comprehension.

**Location →**

- Existing projection boundary:
  - `ai_router/workflow.py`: `write_projection`, `project`
- Missing implementation:
  - no supplied `serve`, SSE, browser renderer, or MCP write handler

**Fix →** A representative operator must use the read-only prototype and then the write prototype. Measure wrong decisions and stale-state detection, not merely completion.

---

## Non-blocking findings

### N1. File presence is not an honest correctness field — CONFIRMED

**Issue →** `stepreview.read_artifacts` refuses a missing file but accepts an empty file. Existence is therefore sufficient to enter model review even when no content was delivered.

**Location →**

- `ai_router/stepreview.py`:
  - `read_artifacts`
  - `review`

**Fix →** Let each artifact declaration specify its minimum parser/schema. Presence remains evidence only of presence.

---

### N2. Post-implementation unit tests retain confirmation bias — CHANGED

**Issue →** The code now pre-registers an approved plan and evidence contract before step execution, which materially addresses confirmation-shaped acceptance. It does not implement the proposed `produce(tests)` operation, so the independence of solution-time unit-test generation remains unsettled.

`STATUS.md` correctly notes that pre-registration prevents rewriting but cannot prove criterion completeness.

**Location →**

- `ai_router/verify.py`:
  - `_approved_plan_for`
  - `run_step_open`
  - `run_step_close`

**Fix →** Keep pre-registered evidence contracts. Do not add a separate mandatory test-generation subsystem until escaped defects show it is needed.

---

### N3. SSE replay is not free — CONFIRMED

**Issue →** The current journal reader loads, sequence-checks, and optionally validates the complete journal before applying `after`. `_Batch` also reads and validates the complete journal before every append batch. Directly placing SSE replay on this path makes reconnect cost grow with total history.

The code makes the concern worse than the document suggested because no index or snapshot boundary exists.

**Location →**

- `ai_router/journal.py`:
  - `read_events`
  - `_Batch.__init__`
  - `tail_sequence`

**Fix →** For the pilot, maintain a small sequence-to-offset index and issue a reset/snapshot when a cursor is too old. No broker is required.

---

### N4. Fixture replay does not establish a zero-token implementation path — CONFIRMED

**Issue →** `STATUS.md` reports five defects found only by running the framework, including prompt/parser disagreement, an inverted approval gate, ignored provider exclusions on an offline path, false contract coverage, and ambiguous status output. Historical fixtures did not expose those interactions.

**Location →**

- Prompt/parser coupling:
  - `ai_router/stepreview.py`: `build_prompt`
  - `ai_router/verdict.py`: `parse_verification_response`
- Approval ordering:
  - `ai_router/workflow.py`: `fold`
- Provider exclusion defense:
  - `ai_router/stepreview.py`: `review`
- Status distinction:
  - `ai_router/solution.py`: `_main`

**Fix →** Narrow the claim to deterministic renderer development. End-to-end and fault-injected runs remain required for writes, routing, parsing, recovery, and approval behavior.

---

### N5. “Findings are never erased” lacks correction and redaction — CONFIRMED

**Issue →** Raw reviews are written verbatim, and the journal exposes no correction, tombstone, or redaction operation in the supplied API. Central serving would widen exposure of any secret or regulated datum included by a model.

**Location →**

- `ai_router/workflow.py`:
  - `file_review`
- `ai_router/journal.py`:
  - `append`
  - `read_events`
- `ai_router/verify.py`:
  - `run_round`, which saves raw output before parsing

**Fix →** Preserve append-only audit history while allowing projections to apply retraction and access-controlled redaction events.

---

### N6. Build-time component enforcement is overstated — CHANGED

**Issue →** The supplied code does not merely have incomplete build-time enforcement; it has no shown component-surface or blocked-import enforcement. `solution.parse` validates manifest shape, dependency names, and cycles. It does not compare interfaces or inspect imports.

`STATUS.md` also records that `contractdoc` once asserted every clause was tested through a hardcoded tick.

**Location →**

- `ai_router/solution.py`:
  - `parse`
  - `_check_cycles`

**Fix →** Describe current enforcement as graph/schema validation. Add interface enforcement only per supported stack, with explicit coverage.

---

### N7. Framework-version provenance is insufficient — CONFIRMED

**Issue →** The current record does not even contain the proposed framework-version field. Verification rows capture provider, model, transport, tree, and cost, but not prompt hash, guidance version, framework build, or event-schema version local to that row.

**Location →**

- `ai_router/journal.py`:
  - `_Batch.append`
- `ai_router/verify.py`:
  - `run_round`
  - `run_adjudication`

**Fix →** Record framework build, event schema, prompt/guidance hash, provider/model, and input tree. Defer full environment fingerprints unless reproducibility requires them.

---

### N8. The two-minute code-free brief is an unsupported universal constraint — CONFIRMED

**Issue →** The current adjudication path correctly includes the complete finding, rebuttal, cited evidence content, and current fix delta. That directly demonstrates that some decisions require primary evidence rather than a code-free summary.

**Location →**

- `ai_router/verify.py`:
  - `_adjudication_prompt`
  - `_cited_evidence_lines`
  - `run_adjudication`

**Fix →** Treat two minutes as a triage target. Preserve links and excerpts for decisions that require inspection.

---

### N9. Aesthetic findings cannot carry failure cases — CONFIRMED

**Issue →** The code already implements an equally unsafe proxy: documentation-only findings never block. This is worse than the proposed aesthetic label because it infers authority from file extensions and lets verifier-authored paths affect the gate.

**Location →**

- `ai_router/verdict.py`:
  - `is_doc_only_issue`
  - `is_blocking_issue`
  - `classify_blocking`

**Fix →** Determine blocking status from acceptance authority, not aesthetic labels, file extensions, or verifier-selected evidence paths.

---

## Part C — New Findings Revealed by the Code

### C1. There is no single authoritative journal

**Issue →** The source contains at least three record mechanisms:

1. `journal.py` writes `.dabbler/journal.jsonl` with sequence numbers, schema validation, fsync, and a lock.
2. `workflow.py` writes `.dabbler/solution/events.jsonl` directly, without sequence numbers, schema validation, locking, or fsync.
3. `verify.py` reads and writes through a separate `ledger` module.

The proposal’s “append-only record is the replay buffer” assumes one stream. The implemented solution workflow does not use that stream, so an SSE client on `journal.py` would miss workflow approvals, reviews, returns, and contract changes.

**Concrete failure scenario →** A supervisor approves a decomposition through `workflow approve`. The Solution Explorer sees the workflow projection, but an SSE endpoint tailing `journal.jsonl` emits nothing. Another client reconstructing state from the run journal continues to show the approval as pending.

Concurrent workflow writers can also interleave bytes in `events.jsonl`, because `workflow.append` opens the file directly with no lock.

**Location →**

- `ai_router/journal.py`:
  - `append`
  - `_Batch.append`
  - `read_events`
- `ai_router/workflow.py`:
  - `LOG_RELPATH`
  - `append`
  - `read`
  - `write_projection`
- `ai_router/verify.py`:
  - `run_round`
  - `record_dispute`
  - `run_step_open`

**Fix →** Before SSE or served writes, choose one authoritative event stream. Migrate workflow events and verification events into `journal.py`, or explicitly declare separate journals and build a durable merged projection with independent cursors. Do not claim one replayable record while keeping three.

---

### C2. Workflow commands do not enforce a state machine

**Issue →** `workflow.fold` computes state but does not validate transitions. The CLI can:

- approve a target that was never entered or reviewed;
- enter any phase from any phase;
- approve the same target repeatedly;
- send work “back” to a later phase;
- record a contract change in any state;
- append review events without checking the reviewed artifacts remain current.

This contradicts P1 more directly than the missing abstract state machine in the document: the implemented framework does not own legal control flow.

**Concrete failure scenario →** An engine invokes `workflow approve --component csv-parser` before any review. `append` accepts the event because `"approved"` is a known event name. `fold` creates default state for the target, marks it approved, and clears `waitingOn`.

**Location →**

- `ai_router/workflow.py`:
  - `append`
  - `fold`
  - `_main`

**Fix →** Put preconditions in sanctioned command functions under the same lock as append. Publish a small transition table and test every illegal command order.

---

### C3. Step-review independence is caller-asserted, not derived

**Issue →** Session verification derives author identity through `identity.py`. Step review instead accepts optional `--author-provider`. If omitted, the first reviewer may be the author’s provider. The second reviewer must differ from the first, but that only guarantees two reviewer vendors, not that both “did not write it.”

This directly contradicts `stepreview.py`’s module contract.

**Concrete failure scenario →** Anthropic authors a plan. The caller omits `--author-provider`. Routing chooses Anthropic and OpenAI as reviewers. The record presents two cross-vendor reviewers even though one reviewed its own vendor’s work.

**Location →**

- `ai_router/workflow.py`:
  - `_main`, `--author-provider`
  - `_run_review`
- `ai_router/stepreview.py`:
  - `review`

**Fix →** Remove the optional provider argument. Derive author identity from recorded execution provenance and fail closed when it cannot be resolved.

---

### C4. Simulated reviews influence live workflow state

**Issue →** Simulated reviews are marked, but `workflow.fold` ignores the marker. Their verdicts, findings, reviewers, and approval state are folded exactly like real reviews.

The comment “never allowed to read as a cross-vendor result” is therefore true only at display level, not at state-transition level.

**Concrete failure scenario →** A scripted review returns `clear` for a non-approval phase. `_run_review` appends it with `simulated: true`; `fold` marks the phase reviewed with no waiting party. Downstream code consuming the projection cannot distinguish “cleared by vendors” from “cleared by a fixture” unless it reinterprets history itself.

**Location →**

- `ai_router/stepreview.py`:
  - `StepReview.simulated`
  - `review`
- `ai_router/workflow.py`:
  - `_run_review`
  - `fold`
  - `project`

**Fix →** Simulated events must be non-authoritative. Keep them in a test namespace or make `fold` refuse to satisfy review transitions from them.

---

### C5. The verifier controls a field that changes whether its own finding blocks

**Issue →** A finding becomes non-blocking when all verifier-supplied `evidencePaths` use documentation extensions. The supposedly indifferent verifier therefore authors part of the branch condition.

This violates the honest-fields corollary in the proposal itself.

**Concrete failure scenario →** A verifier reports a Major security requirement omission and cites only `security-policy.md`. `classify_blocking` places it in `doc_capped_issues`, allowing verification to pass. The same finding without `evidencePaths` blocks.

**Location →**

- `ai_router/verdict.py`:
  - `_parse_evidence_paths`
  - `is_doc_only_issue`
  - `classify_blocking`

**Fix →** Remove extension-derived blocking. Evidence paths may support a finding but may not decide its authority.

---

### C6. Session verification lacks the returned-provider postcondition that step review already has

**Issue →** `_dispatch_verification` passes exclusions to `route`, but `run_round` never checks that `result.provider` actually survived the exclusion. `stepreview.review` does perform that check.

`STATUS.md` records the exact class of defect: the offline routing path once ignored `exclude_providers`. The code contains the defense in one pipeline and omits it in the other.

**Concrete failure scenario →** A new transport or routing regression ignores exclusions and returns the orchestrator’s provider. `run_round` records the result as valid cross-provider verification and can mark the session verified.

**Location →**

- Missing check:
  - `ai_router/verify.py`: `_dispatch_verification`, `run_round`
- Existing correct check:
  - `ai_router/stepreview.py`: `review`

**Fix →** After every dispatch, reject `result.provider` when it is in the exclusion set. Keep route-level exclusion as the primary control and caller-level verification as the postcondition.

---

### C7. Out-of-band state detection accepts rollback to any historical sanctioned state

**Issue →** `detect_out_of_band_write` accepts the current `session-state.json` when its hash matches any historical sanctioned write. It does not require the latest write, an append sequence, or a predecessor relation.

**Concrete failure scenario →** A user replaces current session state with an older, legitimately written version whose hash remains in `state-writes.jsonl`. The integrity gate reports no out-of-band edit because the hash is in the set.

The separate hash ledger is also best-effort and has no lock or schema validation.

**Location →**

- `ai_router/evidence.py`:
  - `record_state_write`
  - `detect_out_of_band_write`
- `ai_router/writers.py`:
  - `_validate_and_write_state`
- `ai_router/gates.py`:
  - `check_verification_clean`

**Fix →** Record an ordered writer event containing predecessor hash and new hash in the authoritative journal. Require the current file to match the latest sanctioned state event.

---

### C8. Dispute evidence is mutable after filing

**Issue →** A dispute stores path strings, not a tree digest or blob hash. `_cited_evidence_lines` later reads the current working tree. The “immutable dispute” can therefore present different evidence in the next round or adjudication.

**Concrete failure scenario →** An orchestrator files a dispute citing `src/parser.py:50-60`, then edits those lines before the next round. The verifier sees the new passage, not the evidence that existed when the dispute was recorded.

**Location →**

- `ai_router/verify.py`:
  - `record_dispute`
  - `_cited_evidence_lines`
  - `_prior_findings_block`
  - `_adjudication_prompt`

**Fix →** Store the cited tree digest and byte hash when filing. Render evidence through `evidence.read_tree_blob`, not the live filesystem.

---

### C9. Contract approval is optional and controlled by the caller

**Issue →** The document calls contract formalization the most important gate. The code places `contracts` outside `APPROVAL_STEPS`, and `contract-changed` waits for a developer only when the caller supplies `--needs-approval`.

This contradicts both the proposal and `solution.py`’s claim that approval gates are derived rather than caller-switchable.

**Concrete failure scenario →** An engine changes a component contract and invokes `workflow contract-changed` without `--needs-approval`. `fold` sets no waiting party, so consumers can proceed under an unapproved contract.

**Location →**

- `ai_router/solution.py`:
  - `APPROVAL_STEPS`
- `ai_router/workflow.py`:
  - `fold`
  - `_main`, `contract-changed` branch

**Fix →** Make contract-baseline and contract-amendment approval mandatory transitions. Derive the gate from the event type.

---

### C10. `workflow review` still has no round cap

**Issue →** Session verification has a configured cap, but the six-step workflow review has none. Every invocation spends two vendor calls. `STATUS.md` confirms that an unattended workflow review can continue indefinitely.

**Concrete failure scenario →** A prose plan continues producing four new Major findings per round. Automation repeatedly invokes `workflow review`, spending tokens without reaching an attainable terminal condition.

**Location →**

- Capped path:
  - `ai_router/verify.py`: `run_round`
- Uncapped path:
  - `ai_router/workflow.py`: `_run_review`
  - `ai_router/stepreview.py`: `review`

**Fix →** Add a per-target, per-phase review cap and route the capped state to approval, send-back, or recorded waiver. This is a small, load-bearing fix.

---

### C11. Check-planning converts Git failure into “no changed paths”

**Issue →** `checks.changed_paths` converts `None` from `changed_paths_between` into an empty tuple. `plan` then schedules no checks. The underlying primitive’s contract says callers fail closed, but this caller silently treats inability to measure as no work.

**Concrete failure scenario →** Git cannot resolve one tree or execute the diff. Check planning reports an empty touched set and runs nothing instead of refusing the stage.

**Location →**

- `ai_router/checks.py`:
  - `changed_paths_between`
  - `changed_paths`
  - `plan`

**Fix →** Raise `CheckConfigError` or a dedicated measurement error when the diff cannot be computed.

---

### C12. TTY presence is not a human-presence boundary

**Issue →** `run_waive` claims that refusing non-TTY input mechanically distinguishes an operator from an engine. Agents routinely operate PTYs and can type into prompts. The code proves only interactivity, not human authorization.

**Concrete failure scenario →** An agent running in an interactive terminal invokes `verify waive`, supplies a plausible attestation, and records an operator waiver without a person participating.

**Location →**

- `ai_router/verify.py`:
  - `run_waive`

**Fix →** Require a separately held operator credential or an out-of-band confirmation. Do not expose waiver capability to model-controlled credentials.

---

### C13. The journal’s stale-lock safety claim is false

**Issue →** `_lock_is_stale` returns true after ten minutes even when the recorded PID is alive. Reclaiming the path prevents the old holder from deleting the new lock, but it does not prevent the old holder from continuing to append. The token protects lock-file deletion, not exclusive journal access.

**Concrete failure scenario →** A process is suspended while holding the journal lock for more than ten minutes. A second process reclaims the lock and creates sequence 42. The first resumes with its preloaded journal and also appends sequence 42.

**Location →**

- `ai_router/journal.py`:
  - `_lock_is_stale`
  - `journal_lock._release`
  - `_Batch.__init__`
  - `_Batch.append`

**Fix →** Never reclaim solely by age while the owner PID is alive. Add a compare-before-append tail check so a stale in-memory batch cannot append after another writer advances the journal.

---

### C14. A `VERIFIED` response can describe a defect in prose and still clear

**Issue →** On the `VERIFIED` branch, the parser salvages issue blocks and bullets. It explicitly does not recover unbulleted prose. A response can begin `VERIFIED`, then describe a Major concern in ordinary paragraphs, and produce no findings.

**Concrete failure scenario →** A verifier writes `VERIFIED` followed by “The migration will corrupt existing records because…” as prose. `_parse_all_findings(..., salvage_body=True)` finds no issue block or bullet, and `classify_blocking` returns verified with no findings.

**Location →**

- `ai_router/verdict.py`:
  - `parse_verification_response`
  - `_parse_all_findings`
  - `_salvage_body_bullets`
  - `classify_blocking`

**Fix →** Make any substantive non-summary body under `VERIFIED` structurally invalid unless it conforms to an allowed summary schema. Preserve fail-closed behavior rather than trying to infer prose intent.

---

### C15. Two overlapping check-selection implementations are already diverging

**Issue →** `checks.py` duplicates selection structures and Git snapshot functions that also exist in `affected.py` and `evidence.py`. `verify.py` predominantly uses `affected.py`, while the separate check planner uses its own copies.

This violates the proposal’s “one white box” motivation at the mechanical level: there are multiple implementations of what changed and what tests answer for it.

**Concrete failure scenario →** A bug fix lands in `affected.select_tests` but not `checks.select_tests`. Preverification selects one command, while the newer check planner records a different selection for the same tree.

**Location →**

- Duplicated selection:
  - `ai_router/checks.py`: `SelectionConfig`, `select_tests`, `targeted_command`
  - `ai_router/affected.py`: `SelectionConfig`, `select_tests`, `targeted_command`
- Duplicated Git snapshots:
  - `ai_router/checks.py`: `snapshot_worktree_tree`, `changed_paths_between`
  - `ai_router/evidence.py`: `snapshot_worktree_tree`, `changed_paths_between`

**Fix →** Keep one implementation in `evidence.py` for tree primitives and one implementation for declared selection. Make both pipelines consume it before adding more domain abstraction.

---

### C16. Adopting Git-unioned journals would regress a strong current property

**Issue →** The current `journal.py` is more rigorous than the proposal’s union-merge direction: it validates every event, refuses sequence gaps, repairs only a torn final line, locks appends, fsyncs, and stamps caller-independent sequence and time.

Replacing this with per-machine union-merging would discard those properties unless a new distributed consistency protocol were built.

**Concrete failure scenario →** Two machines append locally valid sequence 100 events, merge them in Git, and leave `read_events` unable to satisfy `_check_sequences`. Relaxing that check to permit the merge would also weaken corruption detection.

**Location →**

- `ai_router/journal.py`:
  - `_split_records`
  - `_check_sequences`
  - `validate_event`
  - `_repair_and_append`
  - `_Batch.append`

**Fix →** Preserve the local sequencer and place a command service in front of it when sharing becomes necessary. Export to Git after sequencing.

---

### C17. Generalizing the six-step lifecycle now would risk deleting hard-won software controls

**Issue →** The code contains concrete controls earned from incidents: provider identity derivation, targeted preverification, tree-bound final evidence, envelope enforcement, post-command mutation checks, verdict allowlists, and close gates. A premature generic workflow rewrite could replace these with configuration rows that cannot express their invariants.

**Concrete failure scenario →** A generic `produce(solution)` transition records a valid schema and advances, but omits the targeted-test precondition, final-tree binding, or independent-provider exclusion currently enforced by specialized functions.

**Location →**

- `ai_router/identity.py`: `resolve_orchestrator_identity`
- `ai_router/verify.py`: `run_round`, `run_step_close`
- `ai_router/gates.py`: `check_verification_clean`, `check_test_run_fresh`
- `ai_router/verdict.py`: `validate_session_verdict`

**Fix →** Do not replace specialized transitions with a universal call table. Route prompts generically while retaining explicit authoritative transitions.

---

### C18. The code provides real evidence for domain-neutrality by subtraction

**Issue →** This is evidence in the proposal’s favor, but it cuts against the proposed adapter rhetoric. Quote provenance is byte- and span-based across file types, absence search is generic text over declared scopes, and affected-test mapping is declared rather than inferred from Python syntax.

**Concrete failure scenario avoided →** A Java, C#, SQL, or notation file can be cited and hash-checked without adding a language parser to core. A stale inferred dependency graph cannot silently select the wrong tests because selection is declared.

**Location →**

- `ai_router/evidence.py`:
  - `verify_quote`
  - `scope_paths`
  - `run_absence_search`
- `ai_router/affected.py`:
  - `load_selection_config`
  - `select_tests`

**Fix →** Continue subtraction. Remove software semantics from shared shapes only when they can be replaced by smaller declared primitives. Do not introduce plugins merely to appear extensible.

---

### C19. The code also makes the white-box direction more credible in three narrow areas

**Issue →** The proposal is not wholly speculative. Three mechanisms already support it:

- orchestrator identity is derived and fails closed for multi-provider seats;
- verdict parsing and persistence use closed vocabularies;
- the journal stamps sequence, time, event ID, repository identity, and actor envelope itself.

These mechanisms are worth preserving, but they do not rescue the proposal’s broader claims.

**Location →**

- `ai_router/identity.py`:
  - `resolve_orchestrator_identity`
- `ai_router/verdict.py`:
  - `normalize_severity`
  - `validate_session_verdict`
- `ai_router/journal.py`:
  - `_Batch.append`
  - `validate_event`

**Fix →** Build the narrow pilot around these existing controls rather than replacing them with a new universal grammar.

---

## Part D — Effect of Section 0 on the Verdict

### Simplicity test

Adopting all round-one recommendations would satisfy some forms of criterion (a) while failing criterion (b). A one-to-three-person operation does not need, before a local pilot:

- enterprise RBAC and delegation hierarchies;
- multi-tenant deployment design;
- full disaster-recovery SLOs;
- distributed event-log conflict semantics;
- exhaustive environment fingerprints;
- a universal workflow-description language;
- a plugin system before a second domain exists;
- compatibility matrices for clients that have not been built;
- a general compensation engine for external effects not currently allowed.

Those recommendations would turn a comprehensible local framework into a platform program.

Section 0 does not excuse defects that let the wrong provider verify, let simulated evidence advance state, let approvals apply without review, or let review spend run without a cap. Those are not enterprise concerns. They are direct failures of the framework’s own low-bar promise.

### Re-ranking the original `[must]` items

| Round-one recommendation | Revised rank | Simplicity judgment |
|---|---|---|
| 1. Transactional AI job contract | **[must], re-scoped** | A disposable Git worktree, no external write credentials, and framework-controlled commit are enough for this operation; a universal sandbox/compensation platform is not. |
| 2. Cross-vendor invariant | **Withdrawn** | Already implemented by `identity.py`, `verify.py`, `stepreview.py`, and `gates.py`; retain a returned-provider postcondition as a small hardening fix. |
| 3. Block served writes pending threat model | **[must], re-scoped** | Local authentication, CSRF/origin protection, state-bound commands, and no model-held approval credential are load-bearing; enterprise RBAC is not. |
| 4. Select consistency model before SSE | **[must]** | The current journal requires one sequencer; losing that makes replay and state wrong. |
| 5. Bind decisions to identity and state | **[must]** | Without this, the supervisor may approve something they did not review. |
| 6. General durable continuation semantics | **[should]** | Existing rounds and steps already provide durable boundaries; general compensation is premature. |
| 7. Replace grammar with workflow descriptors | **Withdrawn as a program of work** | Explicit command preconditions are necessary; a universal descriptor language is not. |
| 8. Mandatory executable adapter interface | **Withdrawn** | Declared mappings and external commands may suffice. Prove the need with a second domain. |
| 9. Human comparative pilot before changing surface | **[should]** | Criterion (b) requires an operator pilot, but it need not block read-only browser work. |
| 10. Full shell compatibility regime | **[should], reduced** | One projection/API version and visible refusal are enough for the pilot. |
| 11. Defer MCP approval tools | **[must], merged with served-write control** | A model-controlled channel cannot hold human approval authority. |
| 12. Exhaustive provenance | **[should], reduced** | Framework build, event schema, prompt/guidance hash, model/provider, and input tree are enough initially. |
| 13. Full authoritative state machine, cancellation, revocation, recovery | **[must], reduced** | Legal transition preconditions and idempotency are essential; a broad orchestration language is not. |

### Revised verdict

**Do not adopt the proposal as the governing architecture. Permit a constrained pilot after the current authority defects are fixed.**

The original blanket do-not-adopt verdict was too broad because it assumed a larger deployment and effect surface than section 0 and the source justify. The existing system already has strong Git snapshots, provider identity, verdict control, plan envelopes, and local journal mechanics. It does not need an enterprise transaction platform before trying a browser renderer.

The proposal still fails adoption because its central descriptive claims are false today:

- there is not one journal;
- workflow transitions are not enforced;
- contract approval is caller-controlled;
- simulated review can affect live state;
- the step author’s provider is optional;
- the domain-neutral layer is a hardcoded software lifecycle;
- the proposed distributed record would regress the current sequencer;
- the documentation exemption is already unsafe for the proposed policy domain.

The acceptable next move is not adoption. It is a local, read-only supervisor pilot built over a corrected authoritative projection, followed by narrowly secured writes.

---

## Part E — Revised Recommendation List

1. **[must] Fix current review authority and cost bounds.**  
   Change `workflow._run_review`, `workflow.fold`, `stepreview.review`, and `verify.run_round`: derive the step author’s provider; reject returned excluded providers; prevent simulated reviews from satisfying live transitions; add a per-target review cap.

2. **[must] Establish one authoritative event stream and enforce legal transitions.**  
   Change `workflow.append`, `workflow.fold`, the `ledger` call sites in `verify.py`, and `journal.py`: approvals, reviews, returns, contract changes, verification outcomes, and attention events must enter one sequenced journal through command functions that validate preconditions under the append lock.

3. **[must] Bind every consequential human command to reviewed state.**  
   Change approval, waiver, contract-baseline, contract-amendment, and future served writers to require operator identity, target event ID, artifact/tree digest, expected projection revision, and expected prior state; reject stale or repeated commands.

4. **[must] Preserve the journal’s single authoritative sequencer.**  
   Change §5, §6, and WP-5: do not union-merge authoritative per-machine journals. Queue commands to one writer and export the resulting journal to Git if shared provenance is required.

5. **[must] Remove verifier-controlled blocking exemptions.**  
   Change `verdict.is_doc_only_issue` and §7: blocking derives from pre-registered acceptance authority, not file extension, aesthetic labels, or verifier-selected evidence paths.

6. **[must] Constrain authoring effects with the smallest adequate mechanism.**  
   Change the proposed `ai_call` and step execution: authoring runs in a disposable Git worktree, has no push/deploy credentials, and becomes authoritative only through framework validation and commit. Defer universal sandbox and compensation machinery.

7. **[must] Keep MCP authorization out of the model tool loop.**  
   Change §4 and WP-8: MCP is read-only for the pilot. Human approvals and waivers require a separately authenticated channel not usable by model credentials.

8. **[must] Make contract authority derived, not optional.**  
   Change `solution.APPROVAL_STEPS` and `workflow._main`: contract baselines and amendments are mandatory approval transitions; remove caller-controlled `--needs-approval`.

9. **[must] Pin dispute evidence to the record.**  
   Change `verify.record_dispute` and `_cited_evidence_lines`: record tree digest, span, and content hash at filing and render from the pinned tree.

10. **[must] Repair state-write integrity.**  
    Change `evidence.record_state_write`, `detect_out_of_band_write`, and `writers._validate_and_write_state`: journal ordered predecessor/new hashes and require the current state to match the latest sanctioned write.

11. **[should] Build the browser surface read-only first.**  
    Change WP-8 sequencing: serve the projection, routes, inbox, briefs, and logs before accepting authoritative POSTs. Run the operator’s own day through it.

12. **[should] Add a minimal served-write security boundary.**  
    Change WP-8: localhost binding by default, authenticated operator session, origin/CSRF protection, idempotency keys, durable confirmation, neutral defaults, and no batch approval. Defer enterprise role hierarchies.

13. **[should] Add one projection/API compatibility version.**  
    Change `workflow.project`, `solution.as_dict`, browser bootstrap, and webview bridge: unsupported versions fail visibly. Do not claim shell skew is impossible.

14. **[should] Add bounded journal replay.**  
    Change `journal.read_events` and `tail_sequence`: maintain an offset index, define cursor expiry, and return a snapshot/reset response for old cursors. No broker is needed for the pilot.

15. **[should] Consolidate duplicate tree and selection logic.**  
    Change `checks.py`, `affected.py`, and `evidence.py`: one tree-snapshot implementation and one declared-selection implementation must serve every pipeline.

16. **[should] Record sufficient provenance, not exhaustive provenance.**  
    Change `journal._Batch.append` and verification rows: add framework build, event-schema version, prompt/guidance hash, provider/model, and input tree. Add tool/environment fingerprints only where they affect reproduction.

17. **[should] Add correction and redaction events before central serving.**  
    Change the journal schema and projection fold: findings remain historically present while projections can retract, supersede, or access-control secret-bearing content.

18. **[should] Treat the six-step lifecycle as a software profile.**  
    Change §7 and `solution.py` terminology before implementation. Do not advertise it as the domain-neutral core and do not build a plugin system until a policy pilot produces a second concrete profile.

19. **[should] Run a human surface pilot before replacing the extension.**  
    Change §4’s acceptance method: retain weak-model instruction tests, but measure operator decision accuracy, stale-state detection, interruption recovery, and willingness to continue using the surface.

20. **[consider] Generalize tests into declared executable evidence checks.**  
    Change `checks.py` and `affected.py` only after the policy pilot: preserve generic command execution, digest binding, timeout, and mutation detection while moving test-specific selection into the software profile.

21. **[consider] Collect per-step UAT data only for an active consumer.**  
    Change §4’s checklist: each stored field must name its recovery, release, or calibration consumer and retention period.

22. **[consider] Retain one renderer across browser and webview.**  
    Change delivery packaging so static assets come from the Python package, while treating browser, webview, and future MCP as separately secured protocol clients.

### Withdrawn round-one recommendations

- **Withdrawn:** Recommendation 2 as written — mandatory cross-vendor verification is already mechanically enforced.
- **Withdrawn:** Recommendation 7 as written — a universal workflow-transition descriptor language is unnecessary; explicit command preconditions are sufficient.
- **Withdrawn:** Recommendation 8 as written — a mandatory in-process `DomainAdapter` interface is not justified before a second domain.
- **Withdrawn:** Recommendation 19 as written — full deployment SLO, failover, and incident-response design is premature for a local pilot; reintroduce it only when central serving is authorized.
- **Withdrawn:** Recommendation 20 as written — the broad enterprise fault matrix is replaced by focused tests for stale approval, duplicate command, provider-exclusion regression, simulated evidence, journal crash, and incompatible projection version.
- **Withdrawn as absolute:** Recommendation 9’s prohibition on reopening the surface decision. Read-only browser experimentation may proceed before the comparative human pilot; replacement and authoritative writes may not.
- **Withdrawn as absolute:** Recommendation 10’s full compatibility matrix. A version field and fail-visible handshake are adequate initially.
- **Withdrawn as absolute:** Recommendation 12’s exhaustive environment provenance. Record only provenance that can change interpretation or reproduction.
- **Withdrawn as absolute:** Recommendation 6’s universal continuation and compensation protocol. Existing durable step and round boundaries are adequate until a concrete mid-call escalation requires more.