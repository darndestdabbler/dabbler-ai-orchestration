# Critical Review: The Framework as the Only White Box

## Verdict

**Do not adopt.** The central abstraction is unenforceable as written: an AI coding engine is not merely a typed function call but an effectful actor that can mutate files, tests, tools, and external systems before the framework validates its return. Without transactional isolation and explicit effect control, the framework does not own the program counter or remain the only white box; it merely validates a report after an opaque actor has already changed the world.

## Blocking Findings

### 1. The AI boundary types the return but does not constrain the effects

**Issue →** The proposal treats schema validation as control over an AI call, while leaving the call’s side effects unspecified. A failed return does not undo work already performed.

**Location →** §1: “**the framework is the program; an AI engine is a function call**”; §2: “`ai_call(verb, artifact, inputs) → return-schema`”; §3: “per call, at runtime, fail closed — raw quarantined, round fails.”

**Concrete failure →** An implementation engine edits production code, weakens an acceptance test, modifies configuration, and then emits malformed JSON. The framework “fails closed” and quarantines the raw output, but the repository remains modified. A later retry starts from contaminated state and may pass the weakened test. P1 and P5 have already failed even though the return schema was rejected.

**Fix →** Replace `ai_call` with an effectful job protocol:

- immutable input snapshot;
- isolated workspace or sandbox;
- explicit filesystem, process, network, and tool permissions;
- no credentials capable of writing the journal;
- captured diff and side-effect manifest;
- schema and policy validation before commit;
- framework-controlled atomic promotion or rollback;
- timeout, cancellation, and resource budgets.

The function-call metaphor is acceptable only after these semantics exist.

### 2. Mandatory cross-vendor verification is described, not enforced

**Issue →** The project’s mandatory cross-vendor verification constraint is absent from the primitive, the invariants, and §9’s “must not change” list. “Instantiated twice” does not guarantee provider independence.

**Location →** §3: “**Cross-provider verification is box #1 instantiated twice**”; §2 defines only `(verb, artifact, guidance@version) → schema`; §9 does not preserve cross-vendor verification.

**Concrete failure →** A routing configuration sends both `produce(solution)` and `critique(solution)` to different models from the same vendor, or a provider outage causes a fallback to the authoring vendor. Both calls satisfy the declared schema. The framework records two successful calls and advances despite having skipped the mandatory independent verification.

**Fix →** Make independence a framework invariant, not configuration convention:

- every gated artifact records author provider and verifier provider;
- `author.provider != verifier.provider` is mechanically enforced;
- fallback to the authoring provider fails closed;
- provider identity, model identity, account/tenant, prompt version, and tool policy are recorded;
- adjudication cannot erase the missing-independent-verifier condition;
- add this invariant explicitly to §9 and WP-1.

Common-mode failure should also be addressed: distinct vendors receiving the same biased evidence selection are not independent in the relevant sense.

### 3. The proposed browser and MCP write paths have no authorization model

**Issue →** Echoing an event ID proves only that the caller saw or guessed an identifier. It does not prove human intent, identity, authority, freshness, or informed consent.

**Location →** §4: “approve/refuse as tool calls that must echo an explicit event id — **a confabulated approval structurally impossible**”; §5: “discrete POSTs through the sanctioned writers”; §6: “staff get a URL.”

**Concrete failure →** An MCP-enabled assistant reads the inbox, encounters prompt-injected repository text instructing it to approve the pending event, copies the visible event ID, and invokes the approval tool. The ledger accurately records an unauthorized AI-generated approval. Alternatively, a malicious page sends a cross-site POST to a localhost `dabbler serve` instance lacking CSRF protection.

**Fix →** Define a threat model before WP-8:

- authenticated actor identities and role-based authorization;
- TLS and secure deployment requirements;
- CSRF, origin, and CORS protections;
- unguessable, short-lived authorization challenges bound to actor and action;
- explicit human-presence confirmation for authorization events;
- no AI-agent credential capable of exercising human approval authority;
- idempotency keys, replay protection, and audit records;
- least-privilege separation between read, execute, and authorize capabilities.

Do not expose approval through MCP until a human-presence boundary exists outside the model’s tool loop.

### 4. Journal sequence numbers cannot support replay under the proposed multi-writer topology

**Issue →** A journal sequence number is only a valid SSE cursor if one authority allocates a total, monotonic order. Union-merging append-only records from multiple machines does not provide that property.

**Location →** §5: “**event id equal to the journal sequence number**”; §6: “WP-5 puts the record in git”; §10 acknowledges “WP-5’s union-merged, two-machine appends.”

**Concrete failure →** Machines A and B both append local event 418 while disconnected. A browser consumes A’s event and reconnects with `Last-Event-ID: 418`. Git later merges B’s different event 418. The server treats the client as current and never sends B’s event. Worse, A may approve a round extension while B refuses it, leaving the fold dependent on merge or filename order.

**Fix →** Choose and specify one consistency model:

1. **Single-writer authority:** the server durably sequences all authoritative events; offline clients queue commands rather than authoritative journal entries.
2. **Distributed event log:** events use globally unique IDs such as `(actor, counter)` plus causal metadata, and every conflicting command has explicit deterministic resolution semantics.

Do not use a git working tree as both transactional command store and SSE replay buffer. Serve a durable indexed event store and export its canonical record to git if git provenance is required.

### 5. Decisions are not bound to the state or artifact that was reviewed

**Issue →** An event ID alone does not prevent stale authorization. The proposal does not bind decisions to artifact hashes, projection versions, or unresolved preconditions.

**Location →** §1: “**a decision is a journal append**”; §4: tool calls “must echo an explicit event id”; §9: “A decision is a journal append through the sanctioned writers.”

**Concrete failure →** A supervisor opens an approval brief for decomposition version A. An engine subsequently changes a component contract to version B while the page remains open. The supervisor approves the original event ID, and the append is accepted against the new state. The record says “approved,” but the human never reviewed the operative contract.

**Fix →** Make authorization a compare-and-swap operation containing:

- event ID;
- actor identity and role;
- target artifact content hash;
- contract and guidance versions;
- projection revision or expected state;
- explicit action and rationale where required;
- expiry and supersession status.

Reject stale decisions and generate a new attention event when the reviewed material changes.

### 6. Terminal escalation has no checkpoint, atomicity, or compensation semantics

**Issue →** The proposal specifies termination and later refolding but not what happens to partial work, external effects, or context needed to resume safely.

**Location →** §1: “`ESCALATE(attention-event)`: **the call terminates**, the inbox files the event, and the framework resumes later with the decision as a parameter, state refolded from the journal.”

**Concrete failure →** An engine performs half of a repository-wide API migration and discovers an ambiguous compatibility requirement. It escalates. On resumption, a new call cannot reliably distinguish completed edits from planned edits and repeats some transformations. If the step also published a package, invoked a remote deployment, or migrated data, journal refolding cannot undo or reconstruct those effects.

**Fix →** Define escalation only at durable safe points:

- checkpoint the input snapshot, workspace diff, transcript summary, tool results, and outstanding intent;
- classify effects as uncommitted, committed, or compensatable;
- prohibit escalation after irreversible effects unless a recovery protocol is declared;
- resume from an explicit continuation token and state hash;
- permit the framework to suspend a job without keeping an AI process alive.

“Terminal” should terminate provider occupancy, not destroy resumable execution context.

### 7. “Domain as configuration” contradicts both adapters and mechanization

**Issue →** Domain-specific deterministic checks require executable domain-specific behavior. That is a code path, even if reached through dependency inversion. Moving semantics into AI guidance would violate P4.

**Location →** §7: “**a domain is configuration, never a code path**”; “Domain semantics live entirely inside the black box”; the same section lists adapters and deterministic checks for cross-references, term usage, notation, range, and playability.

**Concrete failure →** A legislation pilot needs a parser that resolves defined terms and cross-references. If it is only guidance, an AI judges those properties nondeterministically despite their being mechanizable. If a parser is implemented, selecting and invoking it is necessarily a domain-specific code path. The proposed guardrail therefore forces either a P4 violation or denial of the implementation it requires.

**Fix →** Replace the absolute rule with a plugin boundary:

- core modules depend only on a versioned `DomainAdapter` interface;
- adapters contain domain-specific executable checks;
- adapter discovery occurs through a registry or entry points;
- manifests select adapter capabilities without core imports;
- domain-neutral event and artifact invariants remain in core.

Delay generalized domain amendments until a second domain demonstrates that interface. “Thin adapter” is currently unfalsifiable; define measurable limits such as required capabilities, permitted dependencies, and which state-machine transitions may vary.

### 8. The verbs × artifacts grammar is not lossless and cannot be “configuration only”

**Issue →** The grammar omits actor, authority, lifecycle phase, evidence policy, side-effect policy, and transition semantics. Those dimensions determine what a call is allowed to do and whether its result can advance the workflow.

**Location →** §2: “**Adding an artifact type is a configuration row, never a code path**”; “One primitive: `ai_call(verb, artifact, inputs)`.”

**Concrete failure →** `produce(contract)` generates syntactically valid contract content. The generic schema accepts it, but the framework has no encoded distinction between a draft, a human-authorized baseline, an amendment proposal, and an operative contract. A configuration row cannot supply version negotiation, supersession, affected-package invalidation, stale-approval handling, or the requirement that the author must not authorize its own baseline.

The table also changes rather than merely compresses category 1: “work with human” becomes `produce(project-plan) — human-gated`, losing iterative negotiation semantics.

**Fix →** Model operations as workflow transitions, not linguistic pairs. At minimum, declare:

- actor and required independence;
- intent;
- artifact type and lifecycle state;
- input and output schema;
- permissions and effect policy;
- evidence requirements;
- authorization owner;
- legal successor states;
- retry and escalation behavior.

Allow new artifact types to require adapter code. Make configuration-only extension a goal proven per artifact, not an axiom.

### 9. The “one delivery channel” claim contradicts the retained extension channel

**Issue →** Shipping static assets in the wheel does not eliminate version skew between the Python service, extension shell, browser runtime, and MCP clients. §6 explicitly permits the extension to lag.

**Location →** §6: “**One artifact carries the UI, the framework... skew becomes structurally impossible**”; later: “**VS Code persists as the developer shell and is allowed to lag**.”

**Concrete failure →** Framework version 12 changes an approval endpoint or projection field. A version 9 extension shell loads or embeds version 12 assets but still applies version 9 message bridging, CSP rules, URI translation, or command handling. The UI renders incompletely or submits the wrong command shape. Static asset identity does not make shell behavior identical.

**Fix →** Specify separate compatibility boundaries:

- framework serves the renderer and advertises a versioned API;
- every shell performs a compatibility handshake;
- unsupported shell/framework combinations fail visibly;
- contract tests replay identical interaction traces through browser and webview;
- MCP has its own versioned protocol and cannot inherit compatibility by assertion.

“Divergence is impossible” is unfalsifiable as written. Make it falsifiable with a supported-version matrix and golden end-to-end behavior tests across every shell.

### 10. A weak-model panel cannot settle a human-facing surface decision

**Issue →** The proposed experiment measures whether a model can follow instructions, not whether a human can understand authorization consequences, detect stale evidence, recover from errors, or operate safely under interruption.

**Location →** §4: “**The doorway question is settled empirically... run the weak-model panel through each**.”

**Concrete failure →** A weak model completes all five touchpoints because buttons and event IDs are easy to locate. Human supervisors nevertheless approve the wrong contract because the browser hides provenance below the fold, misunderstand refusal consequences, or miss that a brief is stale. The proposed test passes while the reopened operator decision fails in production.

**Fix →** Do not reopen the extension-only decision on this evidence. Run a comparative human pilot with representative supervisors and measure:

- task completion and error rate;
- time to correct decision, not merely click completion;
- stale-state detection;
- comprehension of consequences;
- interruption and resume behavior;
- accessibility;
- recovery from server or network failure.

Keep the weak-model panel as an instruction-completeness test, not a proxy for human usability or authorization safety.

## Non-Blocking Findings

### 1. File presence is not an honest correctness field

**Issue →** Deterministic observability is being confused with meaningful validation.

**Location →** §1: “a generated file’s presence”; “a file whose presence it can test.”

**Concrete failure →** An empty or truncated contract file exists, so the framework advances despite having no usable contract.

**Fix →** Require artifact-specific parsing, schema validation, content hashes, completeness checks, and declared semantic evidence. Presence should prove only presence.

### 2. Unit tests written after the implementation retain confirmation bias

**Issue →** Splitting acceptance from unit tests does not remove solution-shaped test generation.

**Location →** §2: “`produce(tests)` — unit tests, at solution time.”

**Concrete failure →** The implementation model chooses a flawed algorithm, and the test model derives examples from that implementation’s behavior. Pre-registered acceptance covers broad outcomes but misses the defect.

**Fix →** Generate test obligations before implementation where practical, use an independent provider for solution-specific tests, and add mutation, property, and adversarial tests after implementation.

### 3. SSE replay is not “free”

**Issue →** An append-only record provides history, not bounded replay, indexing, fan-out, backpressure, or projection compatibility.

**Location →** §5: “the server replays from the record — **resumability for free, no broker**.”

**Concrete failure →** A year-old client reconnects with an obsolete event ID and forces a replay or fold over millions of events while live clients wait.

**Fix →** Define snapshots, compaction, cursor expiry, replay limits, backpressure, and projection-version migration.

### 4. Fixture replay does not establish a zero-token implementation path

**Issue →** Existing fixtures cover known read shapes, not new write, concurrency, security, and recovery behavior.

**Location →** §5: “**The entire surface can be built for zero tokens**.”

**Concrete failure →** The UI renders historical fixtures correctly but loses writes during reconnect because no fixture represents an ambiguous POST response followed by retry.

**Fix →** Narrow the claim to deterministic renderer development. Add generated and fault-injected fixtures for write races, malformed events, schema upgrades, authorization failures, and reconnect gaps.

### 5. “Findings are never erased” lacks correction and redaction semantics

**Issue →** Immutability cannot mean that false, defamatory, secret-bearing, or legally removable content remains exposed forever.

**Location →** §9: “**Findings are never erased**.”

**Concrete failure →** A verifier embeds a credential or personal information in a finding. Every served projection continues exposing it because deletion is forbidden.

**Fix →** Preserve audit history through tombstones, retractions, access-controlled redaction, and cryptographic references to quarantined originals.

### 6. Build-time interface enforcement is overstated

**Issue →** “Surface diff” and blocked-import tests cannot fully enforce dynamic loading, reflection, generated code, runtime configuration, or language-specific linkage.

**Location →** §3: component contracts are “**enforced at build time**.”

**Concrete failure →** A component passes static import checks but dynamically resolves an internal class name at runtime and breaks after a supposedly compatible release.

**Fix →** State enforcement coverage per language and combine static checks with runtime contract tests and consumer-driven integration tests.

### 7. Framework-version provenance is insufficient

**Issue →** A framework version does not identify the event schema, input artifacts, model, toolchain, or execution environment.

**Location →** §6: “Provenance gains a field: **the framework version that wrote each event**.”

**Concrete failure →** Two runs under the same framework version use different prompt revisions, model aliases, compiler versions, or input commits and produce incompatible evidence.

**Fix →** Record event-schema version, framework build hash, guidance and prompt hashes, provider/model identity, input artifact hashes, tool versions, adapter version, and relevant environment fingerprints.

### 8. “Two-minute brief” is an unsupported universal constraint

**Issue →** Some disputed findings cannot be responsibly adjudicated without inspecting source, logs, or a reproduction.

**Location →** §4: “The brief is already specified as decidable **without reading the code**.”

**Concrete failure →** A security finding depends on whether a sanitizer executes before or after canonicalization. A code-free summary makes both parties’ positions sound plausible, encouraging an uninformed authorization.

**Fix →** Treat two minutes as a target for triage. Define which classes may be decided from a brief and which require linked evidence or specialist review. Measure decision accuracy as well as time.

### 9. The claim that aesthetic findings cannot carry failure cases is false

**Issue →** Aesthetic requirements can be contractual and testable, while ostensibly objective findings can remain judgment calls.

**Location →** §7: “**Aesthetic findings cannot carry failure cases — so they record, never block**.”

**Concrete failure →** A commissioned score violates an explicitly required style, or a public-facing policy violates a mandated plain-language standard. Labeling the finding “aesthetic” makes a contractual defect non-blocking.

**Fix →** Determine blocking status from pre-registered acceptance authority, not a verifier-selected “aesthetic” label.

## Section 10 Attack Points

### 1. The compiled axiom

**Answer →** The compilation loses effect scope, authority, identity, resource limits, provenance, and transactional behavior. “Function call” suggests a bounded return boundary that does not exist when the engine can edit a repository or invoke tools.

The authorship-versus-state distinction resolves a vocabulary conflict but not the operational conflict. If an engine chooses decomposition, tool order, retries, or scope inside a call, it owns a nested program counter. That can be acceptable only if the framework declares the boundaries and validates the resulting effects before promotion.

**Reframe →** The question is not whether AI “leads.” It is whether delegated subprograms have explicit effect, budget, continuation, and commit boundaries. Rewrite the axiom as: the framework owns every authoritative state transition; AI may execute bounded, isolated jobs whose effects become authoritative only through framework validation and commit.

### 2. The grammar

**Answer →** Verbs × artifacts is not lossless. `negotiate`, `decompose`, `estimate`, `select`, `authorize`, and `amend` are not safely reducible to `produce` because they have different participants, evidence standards, and state transitions.

`adjudicate` is genuinely distinct from `critique`: critique produces an assessment; adjudication exercises authority over competing assessments. It should not be modeled as an ordinary `ai_call` unless the result is explicitly advisory. “Critique of a critique” does not authorize a gate transition.

**Reframe →** Adding more verbs will not solve the defect. The missing structure is actor × authority × lifecycle transition × evidence policy × effect policy. The grammar should describe workflow semantics, not only prompt intent.

### 3. The honest-fields corollary

**Answer →** “Verifiable or authored by an indifferent party” is insufficient. Indifference is neither observable nor stable. A verifier is selected, prompted, budgeted, and evaluated by the framework; it is not indifferent to producing findings or satisfying its instructions.

Path-aware pull creates selection bias even if every retrieved item is authentic. A verifier can request only paths likely to support its initial hypothesis, omit counterevidence, and then assign blocking severity.

**Reframe →** The problem is not merely party incentives; it is control over evidence selection and gate authority. Separate:

1. claim generation;
2. framework-controlled evidence collection;
3. independent severity assessment;
4. deterministic gate computation or human authorization.

Log all evidence requests, impose symmetric retrieval budgets, provide mandatory counterevidence classes, and blind verifiers where possible. Make “independence” an operationally testable property rather than “indifference.”

### 4. SSE on the journal

**Answer →** No, sequence numbers are not total enough under union-merged two-machine appends unless an unstated central allocator already exists. If a central allocator exists, offline local appends are not authoritative and the proposed topology must say so.

The record-as-bus design also couples live UI availability to successful fold, indexing, and storage access. Serving directly from a git working tree adds lock, merge, checkout, and history-rewrite failure modes that an event service does not have.

**Reframe →** SSE is not the primary design question. The primary question is the command and consistency model. Select authoritative ordering first; derive SSE cursors from that model afterward.

### 5. The guard line

**Answer →** “The UI is never more powerful than the CLI” is not a sufficient safety invariant. Capability parity says nothing about choice architecture or authorization quality.

Power leaks include:

- batch approval of unrelated events;
- preselected recommended actions;
- visual emphasis on “approve” over “refuse”;
- hidden provenance or consequences;
- stale tabs;
- notification frequency that trains reflexive dismissal;
- sorting that consistently favors one engine’s findings;
- optimistic UI that displays success before durable commit;
- keyboard shortcuts that bypass review;
- MCP or browser automation invoking nominally human commands.

**Reframe →** The issue is not excess power but unsafe mediation of existing power. Require neutral defaults, no batch authorization for high-risk actions, visible state hashes and consequences, stale-state rejection, durable-confirmation UI, and human-factors testing.

### 6. Terminal returns

**Answer →** Clarifications about ambiguous acceptance criteria, unavailable credentials, environmental choices, or destructive operations may arise after expensive analysis but before a safe commit. They can still terminate provider occupancy, but they cannot safely discard continuation state.

Forcing terminate-and-re-enter costs:

- repeated tokens and tool execution;
- context reconstruction errors;
- duplicate side effects;
- changed model behavior on resumption;
- longer lock duration on partially modified workspaces;
- pressure to guess rather than escalate.

**Reframe →** The choice is not “keep a conversational session open” versus “forget the call.” Use durable suspension: checkpoint the job, release the provider, await a typed decision, then resume from a validated continuation state.

### 7. Central serve

**Answer →** The proposal does not define who writes while the box is down. Allowing both central and per-machine authoritative writes creates conflicts; prohibiting local writes turns the server into a hard availability dependency.

Per-machine journaling does not reconcile cleanly without command preconditions and domain-specific conflict rules. Two syntactically mergeable decisions can be semantically exclusive.

**Reframe →** Specify a deployment topology and failure contract:

- single authoritative writer with durable queued commands and backup/restore; or
- distributed writers with causal IDs, conflict detection, and explicit resolution transitions.

Git mergeability is not application-level reconciliation.

### 8. The domain seam

**Reproduction limit →** The document provides no contents from `evidence.py`, `checks.py`, `affected.py`, or other source files. A claim that a named module currently leaks software assumptions cannot be reproduced from the supplied material and would be invented.

**Answer →** The document itself already contains a conceptual leak: it simultaneously requires domain-specific deterministic checks, executable adapters, “domain as configuration,” and domain semantics “entirely inside the black box.” Those claims cannot all hold.

The aesthetic classification is abusable in both directions. An author can call a contractual defect “taste,” while a verifier can dress preference as an objective defect. The label must not determine authority.

**Reframe →** Audit core modules against a concrete adapter interface and publish the dependency results. Determine blocking status from acceptance-contract provenance and authorized decision rules, not from “aesthetic” versus “defect” labels. Do not amend the core for domain neutrality before a second-domain pilot.

### 9. The UAT checklist

**Answer →** A recorded step removes work only if a later process consumes the record: partial-run resumption, release evidence, regression localization, accessibility review, or panel recalibration. If no named decision or recovery action consumes a field, mechanize-or-delete requires removing it.

Per-step completion can create checkbox pressure and false confidence. Completion records prove that a person clicked, not that the result was understood or correct.

The panel comparison stops paying when it does not change panel composition, guidance, acceptance criteria, or escalation thresholds. Collecting data indefinitely because it might someday be useful is automated ceremony.

**Reframe →** Pre-register each collected field’s consumer, retention period, and action threshold. Measure discrepancies with outcome validity, not click patterns. Disable calibration telemetry by default when no active calibration experiment exists.

## What the Document Gets Right

- **Load-bearing point →** Framework-observed evidence must outrank model self-report. Recommendations above preserve and strengthen this by requiring isolated effects and framework-controlled commit.
- **Load-bearing point →** Acceptance criteria should be established before implementation wherever possible. The correction is to preserve independence through later test generation as well.
- **Load-bearing point →** Human latency should not require keeping an AI process alive. Durable suspension and continuation are preferable to conversational waiting.
- **Load-bearing point →** A projection should be the UI’s read boundary, and sanctioned commands should be its write boundary. That separation is worth retaining after consistency and authorization are specified.

## What Is Missing

### 1. No explicit state machine

**Issue →** The proposal names events and projections but does not define legal states, transition preconditions, terminal states, or conflicting-command behavior.

**Failure →** Approval, refusal, cancellation, retry, and contract amendment arrive in different orders and produce implementation-dependent outcomes.

**Fix →** Publish a normative state machine with transition tables, invariants, idempotency rules, and model-based tests.

### 2. No transaction or recovery model

**Issue →** There is no definition of atomic work, rollback, compensation, crash recovery, or orphaned child handling.

**Failure →** The framework crashes after an engine edits files but before journaling completion; restart cannot determine whether to retry or adopt the partial result.

**Fix →** Define job leases, commit markers, write-ahead state, recovery scans, and compensation behavior.

### 3. No cancellation, revocation, or emergency-stop path

**Issue →** Typed approvals and terminal escalations do not cover a human revoking authorization or stopping unsafe work.

**Failure →** A credential leak or destructive command is detected while a long-running engine continues because no state transition can cancel it.

**Fix →** Add cancellation and revocation as first-class, high-priority commands with child-process termination and effect-containment semantics.

### 4. No actor or role model

**Issue →** “The human” is treated as one black box despite multiple staff, delegates, reviewers, administrators, and service identities.

**Failure →** A developer approves their own contract, or an operations user receives authority to adjudicate a security finding because both are merely journal appenders.

**Fix →** Define roles, separation-of-duty rules, delegation, expiry, impersonation controls, and actor provenance.

### 5. No data classification or retention policy

**Issue →** Journals, briefs, prompts, logs, findings, and model outputs may contain source code, credentials, personal information, or regulated material.

**Failure →** Central serving and indefinite append-only retention expose data beyond its original machine or permitted lifetime.

**Fix →** Define classification, encryption, access control, retention, redaction, backup, deletion, and incident-response requirements per artifact class.

### 6. No deployment trust boundary

**Issue →** “A small internal box” does not specify ownership, credentials, network exposure, filesystem isolation, patching, or tenant separation.

**Failure →** A compromised server can append approvals, alter projections, read logs, or serve modified static assets while preserving superficially valid journal entries.

**Fix →** Document deployment modes, trust assumptions, service identity, signing, secure bootstrapping, secret storage, and integrity verification.

### 7. No schema-evolution or downgrade strategy

**Issue →** Stamping framework version does not explain how old events are folded, how writers are upgraded, or whether downgrade is supported.

**Failure →** A new writer appends an event old clients silently ignore; an old writer then appends a transition invalid under the new state machine.

**Fix →** Version events independently, define migration and compatibility rules, and reject incompatible writers before they append.

### 8. No availability or disaster-recovery target

**Issue →** Central supervision introduces a service dependency without SLOs, backups, restore tests, or degraded modes.

**Failure →** The server fails during an approval window, the git checkout is corrupt, and nobody knows whether work should stop, queue, or continue locally.

**Fix →** Define recovery-point and recovery-time objectives, backup verification, read-only degraded operation, queued-command behavior, and failover ownership.

### 9. No cost model

**Issue →** The proposal adds a server, browser renderer, webview integration, MCP integration, cross-shell tests, event indexing, authentication, support, and domain adapters while discussing only token cost.

**Failure →** The project spends more engineering and operational effort maintaining three doorways than it saves in supervisor onboarding.

**Fix →** Estimate build and recurring costs per doorway, including security maintenance, browser compatibility, extension support, deployment, incident response, and user support. Set adoption thresholds.

### 10. No model-provider failure policy

**Issue →** Provider outage, throttling, model retirement, changed aliases, safety refusal, and regional unavailability are not addressed.

**Failure →** Cross-vendor verification cannot complete, but operators bypass it manually to unblock work because no supported paused state or replacement process exists.

**Fix →** Define provider health states, approved substitutions that preserve vendor independence, immutable model resolution, retry budgets, and explicit blocked-session behavior.

### 11. No common-mode verification analysis

**Issue →** Different vendors can share the same faulty specification, selected evidence, benchmark contamination, or generated tests.

**Failure →** Both author and verifier agree on a defect because the framework supplied the same misleading evidence package.

**Fix →** Vary evidence acquisition and verification guidance, require adversarial counterexamples, and measure verifier disagreement and escaped-defect rates.

### 12. No human-factors or accessibility requirements

**Issue →** The browser is justified by persona claims without keyboard, screen-reader, contrast, localization, interruption, or cognitive-load requirements.

**Failure →** The new “supervisor” surface excludes staff or makes consequential decisions harder to review than in the existing extension.

**Fix →** Add accessibility conformance and human authorization usability to acceptance criteria before changing the surface decision.

### 13. No operational observability for the framework itself

**Issue →** Raw child logs are discussed, but service health, failed folds, event lag, stuck jobs, replay gaps, rejected stale commands, and authorization anomalies are not.

**Failure →** The inbox appears quiet because projection processing is stuck, not because no attention events exist.

**Fix →** Define health checks, metrics, alerts, audit queries, and operator runbooks independent of the project journal.

### 14. No branch, rebase, or history-rewrite semantics

**Issue →** Putting the record in git introduces repository operations that do not preserve a simple append-only history.

**Failure →** A force-push, rebase, branch merge, or partial clone changes event visibility or duplicates previously folded events.

**Fix →** Specify canonical branch ownership, prohibited operations, event deduplication, signature validation, and recovery from rewritten history.

### 15. No migration or rollback plan for the existing extension

**Issue →** The proposal says nothing built is discarded but does not define coexistence, data migration, feature parity, or rollback criteria.

**Failure →** The browser pilot writes events the old extension cannot render, and rolling back leaves supervisors unable to inspect or reverse those actions.

**Fix →** Define a staged compatibility period, dual-reader tests, migration gates, rollback conditions, and the point at which old clients become unsupported.

## Concrete Recommendations

1. **[must] Change §1 and §2:** Replace the pure `ai_call` abstraction with a sandboxed, transactional AI job contract covering permissions, effects, validation, commit, rollback, cancellation, and continuation.

2. **[must] Change §3, §8 WP-1, and §9:** Encode mandatory cross-vendor author/verifier independence as a runtime invariant with fail-closed provider fallback and complete provenance.

3. **[must] Block WP-8:** Do not implement served writes or MCP authorization until an approved threat model, authentication design, authorization model, CSRF protection, and human-presence boundary exist.

4. **[must] Change WP-5 and §5:** Select a single-writer or explicitly distributed consistency model before assigning SSE event IDs. Do not use per-machine sequence numbers as global cursors.

5. **[must] Change §1, §4, and §9:** Bind every human decision to actor identity, role, target artifact hash, contract version, projection revision, expiry, and expected prior state.

6. **[must] Change §1 and WP-3:** Define durable suspension and continuation semantics for escalations, including safe points, checkpoints, partial effects, compensation, and restart behavior.

7. **[must] Change §2:** Replace verbs × artifacts as the normative grammar with workflow transition descriptors containing actor, authority, lifecycle, evidence, effect, retry, and escalation policies.

8. **[must] Change §7 and WP-0:** Replace “domain is configuration, never a code path” with a versioned executable adapter interface. Do not generalize core architecture until a second-domain pilot passes declared acceptance criteria.

9. **[must] Change §4:** Keep the existing operator surface decision in force until representative humans complete a comparative browser-versus-extension pilot with measured decision accuracy and stale-state detection.

10. **[must] Change §6:** Withdraw “skew becomes structurally impossible.” Define API compatibility negotiation, supported-version matrices, shell contract tests, and explicit failure for incompatible clients.

11. **[must] Change §4 and §8:** Defer MCP approval tools. Initially expose MCP as read-only; require authorization through a non-model-controlled human channel.

12. **[must] Add to WP-1:** Version event schemas independently and record framework build, prompt, guidance, provider, model, adapter, toolchain, environment, and input artifact hashes.

13. **[must] Add to WP-3:** Publish the authoritative state machine, transition preconditions, idempotency rules, conflict behavior, cancellation, revocation, and recovery semantics.

14. **[should] Change §5:** Add indexed snapshots, replay limits, cursor expiry, backpressure, projection migration, and fault-injected SSE tests.

15. **[should] Change §4 and §5:** Define actor roles, separation of duties, neutral authorization UX, no high-risk batch approval, and durable-confirmation behavior.

16. **[should] Change §7:** Determine blocking status from pre-registered acceptance authority rather than “aesthetic” classification.

17. **[should] Change §4’s UAT design:** Record a checklist field only when a named process consumes it; define retention and action thresholds for panel-calibration data.

18. **[should] Change §9:** Replace absolute non-erasure with immutable correction semantics supporting retraction, tombstoning, access-controlled redaction, and legally required deletion.

19. **[should] Add a delivery work package:** Define secure deployment modes, backup and restore, degraded operation, service SLOs, observability, patch ownership, and incident response.

20. **[should] Add acceptance tests across WP-3/WP-8:** Exercise concurrent decisions, stale approvals, duplicate POSTs, server crashes, partial AI effects, provider outages, git rewrites, schema upgrades, and client-version mismatch.

21. **[consider] Retain one renderer:** Use the framework server as the renderer source of truth, but treat browser, webview, and MCP as separately versioned and separately secured clients.

22. **[consider] Pilot browser supervision as read-only first:** Validate navigation, briefs, accessibility, and inbox behavior before introducing authoritative write operations.