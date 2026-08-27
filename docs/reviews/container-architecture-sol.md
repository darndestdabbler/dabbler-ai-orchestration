# Container Topology Adversarial Review

## 1. Verdict

**Do not adopt.** The strongest reason is that the proposed control plane still “reads, writes, and executes solution files” while holding git integration and access to authoritative host-mounted state; the API proxy removes vendor keys from that process but leaves the dominant privilege-co-location failure substantially intact. This topology therefore does **not** resolve the top-ranked risk from my security review: AI-authored code can still damage the repository, tamper with records available through the mount, misuse git authority, or poison later privileged execution. It also leaves prompt injection into authorization, uncontrolled multi-vendor disclosure, dependency-install execution, journal/log exposure, and framework supply-chain compromise open. A narrower execution worker could resolve much of rank 1, but only if it owns the entire AI edit/build/test job, receives no authoritative bind mount, and promotes a validated result transactionally.

## 2. Attack the Architecture

### 2.1 The boxes do not each have one job

**Issue →** The “one job per container” premise is already false. The IDE container is simultaneously a UI, orchestrator, filesystem reader/writer, Python executor, git client, proxy client, and log renderer. Those responsibilities cross three trust levels: human authorization, framework control, and untrusted project execution.

A concrete failure is a repository-controlled check command executing in the same process environment used for orchestration. `ai_router/checks.py::load_checks` accepts repository-declared commands, while `ai_router/checks.py::_spawn` executes legacy command strings with `shell=True` and inherits the ambient environment. If the IDE container invokes this path, an AI edit to check configuration can run arbitrary shell code next to git and authoritative files.

**Location →**

- Diagram §1, IDE Container items 1–5.
- `ai_router/checks.py::load_checks`
- `ai_router/checks.py::_spawn`
- `ai_router/checks.py::execute`

**Fix →** The console may display, decide, and promote; it may not execute any repository-selected interpreter, command, hook, build, test, linter, or script. Move `checks.py::execute` and `_spawn` into the disposable worker.

---

### 2.2 The top-ranked privilege co-location remains

**Issue →** Moving API keys to the proxy addresses only one asset. AI-authored execution still shares authority with the mounted solution, likely `.git`, and any journal or projection reachable under that mount.

Concrete scenarios:

1. A generated check runs `git reset --hard`, deletes branches, or modifies hooks and configuration.
2. A generated script rewrites `.dabbler/journal.jsonl` or `.dabbler/solution/events.jsonl` if those paths are included in or reachable from the mounted folder.
3. A test alters source and then restores timestamps or content sufficiently to mislead a weak post-run check.
4. A generated file poisons a later privileged action—for example, changing check configuration so `checks.py::_spawn` executes a shell payload on the next run.
5. A generated `.vscode/settings.json` or `.venv` changes the executable selected by `pythonInterpreter.ts::explicitPythonPathSetting` or `detectWorkspaceVenvInterpreter` if any extension-side path remains active.

**Inference →** The diagram says “git integration,” not explicitly “push credentials.” Claude’s assertion that the IDE necessarily contains push credentials is not established. If it can push, however, either those credentials or a credential-bearing helper are reachable from the IDE container, and the failure applies.

**Location →**

- Diagram §1, IDE Container items 2, 4, and 5.
- `ai_router/checks.py::_spawn`
- `tools/dabbler-ai-orchestration/src/utils/pythonInterpreter.ts::explicitPythonPathSetting`
- `tools/dabbler-ai-orchestration/src/utils/pythonInterpreter.ts::detectWorkspaceVenvInterpreter`
- `tools/dabbler-ai-orchestration/src/utils/pythonInterpreter.ts::resolvePythonInterpreter`

**Fix →** Treat the entire AI edit/build/test lifecycle as one untrusted job. Give it a copied snapshot without `.git`, `.dabbler`, host credentials, or authoritative files. Promote only an inspected path-limited diff.

---

### 2.3 Host bind mounts defeat file-integrity isolation

**Issue →** A writable bind mount is a direct write capability to the host object it exposes. Container root filesystems, image immutability, and deletion of the container do not roll those writes back.

If a Solution Container receives the same writable host folder as the console, generated code can destroy or poison the authoritative workspace even though it cannot reach other host directories. Deleting the worker will not undo those writes.

Mounted log and cost folders also weaken evidentiary claims:

- A proxy compromise can rewrite its own receipts.
- A host process can alter the records outside the container.
- Secrets copied into logs persist in host backups after the container is destroyed.
- On Windows, broad file-sharing configuration may expose more paths to the Podman VM than the diagram implies.

**Inference →** The diagram does not state that all three containers share all mounts. The risk applies to every mount actually shared or writable; it should not be assumed away.

**Location →**

- Diagram §1 and topology paragraph.
- `ai_router/checks.py::snapshot_worktree_tree`, which excludes `MACHINE_DIRNAME` from a Git snapshot but does not protect the live mount.

**Fix →** Use a Podman-managed volume or container filesystem for the worker. Copy an immutable input snapshot in and extract validated outputs out. Do not put the authoritative host checkout on the worker’s writable hot path.

---

### 2.4 The API proxy contains key material, not key-equivalent authority

**Issue →** A client that can submit arbitrary prompts through the proxy can still exercise much of the credential’s value without reading the credential:

- spend the full budget;
- exfiltrate source or host-readable files in prompt text;
- select a more expensive or inappropriate model if model choice is caller-controlled;
- flood logs with attacker-chosen content;
- replay calls;
- misattribute costs unless requests carry authenticated job identity;
- probe vendor behavior and account limits.

The current direct transport also accepts configurable endpoints. `api.py::_call_anthropic`, `_call_google`, and `_call_openai` attach credentials to `config["base_url"]` or its derivative. If repository-controlled configuration reaches the proxy, a job can redirect an authenticated request to an attacker endpoint.

**Inference →** The supplied source does not show whether repository configuration can control the proxy’s provider configuration. The credential-redirection path is conditional on that data flow.

**Location →**

- `ai_router/transports/api.py::call_model`
- `ai_router/transports/api.py::_call_anthropic`
- `ai_router/transports/api.py::_call_google`
- `ai_router/transports/api.py::_call_openai`
- `ai_router/secret_resolver.py::resolve_secret`
- `ai_router/secret_resolver.py::_env_backend`

**Fix →** The proxy must own immutable provider endpoints, model allowlists, per-job capability tokens, request-size limits, quotas, and disclosure logging. The console must not pass arbitrary provider configuration through to it.

---

### 2.5 The topology hides a privileged container launcher

**Issue →** Something must create, stop, inspect, and delete Solution Containers. If the IDE container receives the Podman socket, a compromise can start a privileged sibling, mount arbitrary host paths, inspect other containers, or steal proxy credentials. That is worse than the original shared-process problem.

If the IDE does not receive the socket, the topology requires an unshown host launcher or daemon. The claimed three-box simplicity is therefore incomplete.

**Location →** No launcher or container-engine interface is specified in §1–§7.

**Fix →** Keep a small native `dabbler` launcher outside the containers. It owns rootless Podman operations and exposes no general container-engine API to the console or worker. This is one local process, not another staff-facing service.

---

### 2.6 The egress claim contradicts git and real builds

**Issue →** “Only the API Proxy Container reaches the outside world” is incompatible with two required behaviors:

1. If the IDE’s git integration pushes to a remote, the IDE also needs external egress.
2. Java and .NET dependency restoration needs Maven, Gradle, NuGet, SDK, plugin, and sometimes npm endpoints.

If the worker is simply allowed general network access during builds, generated tests and install hooks regain an exfiltration path. If no access is allowed, uncached builds fail and staff run them outside containment.

**Location →**

- Diagram §1, IDE Container item 4 and topology paragraph.
- `ai_router/checks.py::_spawn`, which applies no network restriction itself.
- Java and .NET requirements in `framework-white-box-direction.md` §0.2.

**Fix →** Delegate git push to the native control plane after promotion. Run dependency restore in a credential-minimized worker restricted to approved registries, then recreate or disconnect the worker for offline build and test.

---

### 2.7 No transactional promotion protocol exists in the diagram

**Issue →** Temporary execution is not transactional execution. The topology does not define:

- the input tree identity;
- how ignored files, submodules, symlinks, or Git LFS objects are handled;
- what output format crosses back;
- path and size limits;
- how deletes and renames are represented;
- how conflicts with concurrent host edits are detected;
- how validation binds to the exact promoted tree;
- how promotion is made atomic.

A malicious worker can return a patch containing path traversal, a symlink redirect, a huge binary, a special file, or changes outside the approved envelope. A naïve archive extraction can write outside the destination.

**Location →**

- `ai_router/checks.py::snapshot_worktree_tree`
- `ai_router/checks.py::changed_paths_between`

These functions create and compare Git trees; they do not create a worker, restore state, validate an exported patch, or atomically promote it.

**Fix →** Bind each job to an input tree digest and approved path envelope. Export a normalized file manifest or Git diff, reject special files and escaping paths, apply into a staging tree, re-run validation against its resulting digest, then replace or commit through the control plane.

---

### 2.8 The Producer role is a privileged file-read deputy

**Issue →** Letting model output instruct the console to “see and navigate” files creates a direct path-traversal and disclosure surface. A model can request:

- `../../Users/<name>/.ssh/config`;
- `.git/config` or credential-helper settings;
- `.dabbler` records;
- environment/config files containing secrets;
- symlinks that resolve outside the project;
- large binary files that exhaust memory or budget.

Canonical string prefix checks are insufficient because symlinks and reparse points can escape after validation.

**Location →** Diagram §1, IDE Container item 3(b).

**Fix →** Give the model opaque file handles from a precomputed snapshot manifest, not host paths. Reads must be rooted in the job snapshot, reject `.git` and `.dabbler`, refuse symlinks or resolve them within the snapshot, enforce byte limits, and record content hashes sent to vendors.

---

### 2.9 The Chronicler puts hostile text next to authority

**Issue →** Raw model or process output can contain HTML, Markdown links, ANSI controls, bidirectional text, fake buttons, fake success banners, and instructions aimed at the operator. Rendering it adjacent to approval controls enables deception even without code execution.

A concrete attack is output that visually reproduces the approval panel, claims verification passed, and places a malicious link over or beside the real control. If rendered as trusted HTML, this becomes XSS; if rendered as plain text, control characters and deceptive content remain.

**Location →** Diagram §1, IDE Container item 3(c). The supplied source does not include the renderer.

**Fix →** Render output as inert escaped text, strip terminal controls, visibly label its source and trust level, isolate diagnostics from approval controls, and never derive approval defaults from streamed content.

---

### 2.10 The console container is the most adoption-hostile box

**Issue →** Containerizing the supervisor/control plane gives limited security benefit because it still requires authoritative host mounts and git integration, while imposing Podman startup, filesystem sharing, browser/port plumbing, authentication persistence, and Windows path semantics. Renaming it from “IDE” to “Console” does not remove those costs.

Staff are most likely to bypass the system when a normal test, debugger, or file watcher is slower or unavailable inside the worker. Once they run the command from a host terminal, the record no longer describes the consequential execution.

**Location →** Diagram §1 and assessment §3.3.

**Fix →** Keep the console/control plane native and small; containerize only the proxy and disposable jobs. The operator should run one command and never attach to a container.

## 3. Attack the Assessment

### 3.1 “Every property … is present here as a box with one job”

**Issue →** This is false. A diagram box does not provide an immutable snapshot, constrained restore, offline execution, effect collection, validation, atomic promotion, legal state transition, or rollback. None of those protocols is specified.

The IDE box also demonstrably has multiple jobs, and the Solution Container is described only as a testing environment rather than the complete AI authoring transaction.

**Location →** Assessment §2, first paragraph.

**Fix →** Replace the claim with an explicit job protocol and acceptance tests. Do not treat spatial separation as equivalent to transactional semantics.

---

### 3.2 “The API Proxy Container solves the top-ranked risk by construction”

**Issue →** This is substantially wrong. It structurally separates API key bytes only if secrets exist solely in the proxy. It does not separate git authority, journal access, authoritative source, or proxy-equivalent spending and disclosure authority. The original rank-1 finding named all of those assets.

It also assumes proxy descendants cannot inherit keys. The current resolver is environment-backed by default through `secret_resolver.py::_env_backend`; any CLI launched by the proxy inherits that environment unless the proxy constructs a clean child environment.

**Location →**

- Assessment §2, second paragraph.
- `ai_router/secret_resolver.py::_env_backend`
- `ai_router/secret_resolver.py::resolve_secret`

**Fix →** Say the proxy addresses one subpart of rank 1. Require an uncredentialed worker and a constrained proxy API before claiming resolution.

---

### 3.3 “A container image has no such path”

**Issue →** Too absolute. An immutable image can remove repository control over the framework interpreter, but only if privileged execution never consults workspace settings, workspace `.venv`, PATH entries supplied by the project, repository hooks, or repository-declared commands.

Even with a fixed Python binary, `checks.py::load_checks` and `_spawn` allow repository-declared shell commands. Interpreter substitution is only one execution path.

**Location →**

- Assessment §2, “The repository can no longer choose the privileged interpreter.”
- `pythonInterpreter.ts::explicitPythonPathSetting`
- `pythonInterpreter.ts::detectWorkspaceVenvInterpreter`
- `ai_router/checks.py::load_checks`
- `ai_router/checks.py::_spawn`

**Fix →** Narrow the claim: a fixed, digest-pinned control-plane image removes the specific VS Code interpreter-selection path. It does not make repository-driven execution safe.

---

### 3.4 “The two-channel install disappears”

**Issue →** False unless releases are atomically pinned across the console, proxy image, worker image, vendor CLI versions, renderer assets, journal schema, and protocol versions. The proposal may replace two channels with three or more independently updated artifacts.

**Location →** Assessment §2, third bullet.

**Fix →** Define a release manifest that pins all image digests and protocol versions. One bootstrap command is one operator channel; it is not automatically one technical artifact.

---

### 3.5 “Every vendor call passes through one point”

**Issue →** This is a desired network policy, not a consequence of drawing the box. Vendor CLIs may contact authentication, update, telemetry, or auxiliary endpoints. Workers also need package egress, and git needs remote egress. Application intent does not enforce network reachability.

**Location →** Assessment §2, final paragraph.

**Fix →** Enforce network policy at container creation and record the actual destination. Keep direct provider configuration outside repository control.

---

### 3.6 “The IDE Container must not execute solution code”

**Issue →** This is correct and is the assessment’s strongest finding. I would have underweighted how directly item 5 nullifies the proxy split if this amendment had not called it out.

The supporting asset inventory is nevertheless overstated. The diagram does not prove that the IDE holds push credentials, mutable `ai_router` source, or a writable projection. Those are plausible inferences, not established facts.

**Location →** Assessment §3.1.

**Fix →** Retain the amendment, but distinguish stated assets from inferred ones. Extend it: the console must not execute repository-selected code indirectly through checks, hooks, interpreters, package managers, or preview generators.

---

### 3.7 “The mechanism is the mount, not the container”

**Issue →** This is directionally right for file integrity but too strong as a general security claim. A separate container with the same project mount can still provide real protections:

- PID and IPC namespaces prevent process inspection and signalling across the boundary;
- a network namespace can remove or restrict egress;
- cgroups can cap CPU, memory, processes, and disk pressure;
- a separate root filesystem can hide host home directories and control-plane binaries;
- dropped capabilities, seccomp, and non-root execution reduce kernel-facing authority;
- destroying the container removes persistence outside the shared mount.

Those controls do not protect files on the shared writable mount. The correct statement is: **the mount determines file blast radius; the container configuration determines process, network, resource, device, and root-filesystem blast radius.**

“Both containers have identical walls” is also false unless they are launched with identical namespaces, capabilities, devices, networks, users, seccomp policy, and resource limits.

**Location →** Assessment §3.2.

**Fix →** Require both a narrow data boundary and a hardened runtime boundary. A shared writable authoritative mount remains disqualifying, but the execution container is not worthless merely because one mount is shared.

---

### 3.8 “Given the same host mount … it adds a moving part and buys almost nothing”

**Issue →** “Almost nothing” is overstated. It can still stop host-home access, contain process-tree damage, enforce timeouts and memory limits, and remove direct network access. Those are material protections.

It does, however, buy almost nothing for repository and journal integrity if the shared mount contains those assets. It may also permit persistence by poisoning files that the console later executes.

**Location →** Assessment §3.2, final sentence.

**Fix →** Replace “almost nothing” with an asset-specific conclusion: it materially contains host/process/network effects but does not protect any writable shared file asset.

---

### 3.9 “A bad outcome costs nothing—the box is deleted”

**Issue →** False outside a fully transactional worker. Deleting a container does not reverse:

- writes through bind mounts;
- network disclosure;
- package-registry side effects;
- git pushes;
- cache poisoning;
- budget consumption;
- denial of service to the Podman VM;
- secrets copied into logs.

The assessment is right that accidental cleanup and build mistakes are routine. I would have underweighted that usability benefit: disposable execution is valuable even when no adversary is present. But rollback is a property of the data flow, not container deletion alone.

**Location →** Assessment §4.

**Fix →** Define which effects are ephemeral and prohibit all others. Reserve “rollback” for a job whose only export is a validated result.

---

### 3.10 “Half of this already exists in the code”

**Issue →** This is too generous. `checks.py::snapshot_worktree_tree` creates a Git tree object through a temporary index. It does not:

- create a Git worktree;
- check out that tree into an isolated directory;
- remove `.git` authority from a linked worktree;
- construct a clean environment;
- restrict network or resources;
- promote a result;
- restore after failure.

A linked Git worktree also points back to the repository’s common Git directory. It is not credential or repository isolation.

The function’s `git add -A` can invoke configured clean filters selected through attributes, and it writes blobs for untracked non-ignored files into the object database. That creates retention and privileged-filter concerns not acknowledged in the assessment.

**Location →**

- Assessment §5.
- `ai_router/checks.py::snapshot_worktree_tree`
- `ai_router/checks.py::changed_paths_between`

**Fix →** Describe the existing code as snapshot identity machinery only. Budget separately for workspace materialization, containment, output validation, and promotion.

---

### 3.11 “Recommended sequencing: worktree first”

**Issue →** This is the classic cheap-half trap for authoritative repositories. It closes the visible rollback problem while leaving the ranked security problem open. Once staff workflows, tests, and acceptance criteria are built around host execution, adding a worker later becomes a compatibility project rather than the completion of an unfinished feature.

“Decide the container on evidence” is also unsafe framing. Credential theft, record tampering, and unauthorized push are low-frequency, high-consequence events; an incident-free pilot is weak evidence that host execution is safe.

**Location →** Assessment §5.

**Fix →** Ship workspace transactionality and execution containment as one minimum vertical slice. Permit a worktree-only mode only when visibly labelled non-authoritative and technically prevented from handling regulated projects.

---

### 3.12 “Everything else here is straightforward”

**Issue →** This is materially too generous. The hard work also includes:

- securely launching sibling containers without exposing the Podman socket;
- snapshot transfer and atomic promotion;
- Java/.NET restore policy;
- Windows UID, file-mode, line-ending, and performance behavior;
- worker crash recovery;
- image/version compatibility;
- log redaction;
- concurrent-job conflict handling;
- tests requiring Docker/Testcontainers, databases, browsers, or local ports.

**Location →** Assessment §7, second bullet.

**Fix →** Treat proxy CLI authentication as one prototype risk, not the only difficult implementation area.

## 4. The Eight Attack Points

### 4.1 Does the proxy actually contain the credential?

**Answer →** It can contain the secret bytes, but an unrestricted caller still receives credential-equivalent call authority. It can exhaust budget, disclose arbitrary readable data in prompts, choose unauthorized models, replay requests, and inject deceptive text into logs.

The client cannot directly forge a proxy-owned append-only record if the proxy constructs every record field itself. It can still forge semantic content inside prompts and responses unless logs clearly separate trusted metadata from untrusted text.

`api.py::_call_anthropic`, `_call_google`, and `_call_openai` make endpoint ownership especially important because they attach credentials to configurable base URLs.

**Required conditions →**

- short-lived per-job capability;
- project and job identity;
- model/provider allowlist;
- request and token quotas;
- immutable provider endpoints;
- request-size and file-disclosure limits;
- proxy-generated timestamps, hashes, and cost fields;
- no caller-supplied log identity;
- clean environments for CLI subprocesses.

---

### 4.2 Is §3.2 right that the mount is the mechanism?

**Answer →** Only for filesystem asset exposure. Namespaces, cgroups, network isolation, capability dropping, a separate root filesystem, and an independent process tree remain real protections on a shared project mount. They can stop host-home access, process interference, arbitrary network use, and resource exhaustion.

For the narrow mount to protect the record:

- it must not include `.git`, `.dabbler`, logs, credentials, sockets, or the control-plane installation;
- it must not be the authoritative host checkout;
- it must not contain symlinks or reparse points escaping the workspace;
- the worker must have no Podman/Docker socket, host PID namespace, privileged mode, devices, SSH agent, credential helper, or host home;
- output must cross back through validation, not by leaving writes on a bind mount;
- tests must run without network after restore;
- the container must have explicit CPU, memory, PID, timeout, and storage limits.

---

### 4.3 Is worktree-first prudent sequencing or the classic trap?

**Answer →** It is the trap here. The worktree addresses rollback while leaving the ranked security objective—protecting credentials, git authority, and the record—unsatisfied. It is especially dangerous because the cheap milestone is user-visible and easy to declare complete, while the deferred part requires reworking command execution, dependency restore, debugging, filesystem assumptions, and promotion.

`checks.py::snapshot_worktree_tree` reduces neither OS authority nor network authority. A linked worktree also retains access to the repository’s common Git directory.

**Decision →** Ship the disposable workspace and execution boundary together.

---

### 4.4 What does the Chronicler enable?

**Answer →**

- XSS if model output is rendered as HTML or unsafe Markdown;
- deceptive links and fake controls;
- ANSI and Unicode control-character attacks;
- prompt-injected instructions aimed at the supervisor;
- forged “verified,” cost, or progress messages;
- accidental secret exposure from model or process output;
- approval bias when hostile output is visually adjacent to decision controls.

**Fix →** Escaped plain text, strict CSP, no active links by default, control-character filtering, source labels, separate diagnostic and authorization views, and no approval action embedded in streamed output.

---

### 4.5 Is the Producer role a path-traversal surface?

**Answer →** Yes. It is also a confused-deputy and disclosure surface. Model output controls a privileged file reader unless the framework substitutes safe handles for paths.

A canonicalized path can still escape through symlinks or Windows reparse points. A model can also request `.git`, `.dabbler`, ignored secrets, enormous files, devices, or network paths.

**Fix →** Build a snapshot manifest first and let the model request only manifest identifiers. Enforce root containment after link resolution, reject special files, cap bytes, and record hashes disclosed through `APIResult` calls.

---

### 4.6 Will three boxes remain three?

**Answer →** Not as currently drawn. Box count grows when implementation encounters:

1. a host-side Podman launcher because the console must not receive the engine socket;
2. a dependency-restore phase with restricted registry egress;
3. offline execution after restore;
4. git promotion and push outside the worker;
5. databases, browsers, message brokers, or Testcontainers required by integration tests;
6. a cache or artifact service for acceptable Java/.NET performance;
7. authentication/session persistence for vendor CLIs;
8. a shared journal writer if multiple staff use the system.

Several can be phases or child containers hidden behind one command rather than staff-facing services. The simplicity criterion should count concepts and required interactions, not runtime process count.

---

### 4.7 Is the Windows mounted-folder penalty a disqualifier?

**Answer →** It is a measure-then-decide issue, but the proposed host-bind hot path should not be the benchmarked default. Copying the snapshot into a WSL ext4 or Podman-managed volume may avoid most metadata overhead while preserving Windows-host control.

It becomes disqualifying if representative Java and .NET projects cannot meet an agreed startup and build-time threshold after using managed volumes, caches, and prebuilt images. Measuring only a `C:` bind mount would test a known poor design rather than container viability.

---

### 4.8 Which element is most likely to be routed around?

**Answer →** Mandatory execution through a slow or incomplete worker path. If debugging, package restore, file watching, integration services, or test discovery work better from the host terminal, staff will run there and later mark the framework step complete.

The console container itself is the second likely bypass target because it adds Windows/Podman friction without providing the principal security boundary.

**Fix →** Keep the console native, make worker invocation automatic, publish maintained Java/.NET images, support common test outputs, and measure bypasses during the pilot rather than merely asking whether staff completed tasks.

## 5. The Sequencing Question, Decided

**Decision → Both together.**

The first shippable unit must combine:

1. an immutable input snapshot;
2. a disposable job workspace;
3. execution inside a constrained worker;
4. no `.git`, `.dabbler`, host credentials, or authoritative bind mount;
5. controlled dependency restore followed by offline execution;
6. validated output collection;
7. atomic promotion by the control plane.

I revise my prior design review’s re-scoped B1 conclusion. A worktree-only minimum was too permissive for an authoritative workflow whose journal and git authority remain accessible under the same OS user. It is acceptable as a temporary developer convenience, not as the security milestone for this design.

The sequencing trap is not merely that later work might be forgotten. Worktree-first establishes the wrong interfaces:

- commands inherit host behavior;
- tests depend on host-installed tools;
- scripts assume host paths and credentials;
- acceptance tests validate rollback but not authority separation;
- staff normalize running outside the worker;
- the eventual container must break those assumptions.

Evidence that would change this decision would be:

- proof that no AI-authored or repository-selected code is executed at all;
- an alternative OS sandbox providing equivalent filesystem, credential, network, process, and resource isolation;
- a repository class with no sensitive source, no authoritative record, no git credentials, no external side effects, and an explicitly non-authoritative profile;
- representative Windows measurements showing that every practical containment implementation fails the adoption threshold even with managed volumes and maintained images.

Absence of incidents during a worktree-only pilot would not change the decision.

## 6. What Is Missing

### 6.1 Container-engine authority

**Issue →** The design omits who owns Podman and how workers are launched. Exposing the engine socket to the console collapses containment.

**Location →** No launcher is specified in §1–§7.

**Fix →** Use a native one-command launcher that owns container lifecycle and exposes no general engine API.

---

### 6.2 Input snapshot correctness

**Issue →** `snapshot_worktree_tree` does not define how the job handles ignored files, submodules, Git LFS, clean filters, generated assets, sparse checkouts, executable bits, symlinks, or line-ending conversion.

`git add -A` may invoke configured clean filters and stores untracked non-ignored content as Git objects. Sensitive temporary files can therefore persist in the object database even if never committed.

**Location →** `ai_router/checks.py::snapshot_worktree_tree`

**Fix →** Document snapshot semantics, disable or constrain filters for privileged capture, classify ignored inputs explicitly, and test submodule/LFS/symlink behavior.

---

### 6.3 Snapshot failure is not consistently fail-closed

**Issue →** `changed_paths_between` returns `None` on Git failure, but `checks.py::changed_paths` converts that to an empty tuple. Planning can therefore interpret “could not measure” as “nothing changed.”

**Location →**

- `ai_router/checks.py::changed_paths_between`
- `ai_router/checks.py::changed_paths`
- `ai_router/checks.py::plan`

**Fix →** Raise a blocking measurement error on `None`.

---

### 6.4 Output-import attacks

**Issue →** No one has defined safe worker output. Archives, patches, result XML, coverage files, and logs can contain path traversal, symlink, decompression-bomb, control-character, or parser attacks.

**Location →** No output protocol is specified.

**Fix →** Use a closed manifest schema, regular files only, normalized relative paths, byte and file-count limits, content hashes, and staging-tree application before promotion.

---

### 6.5 Concurrent edits and stale promotion

**Issue →** A job can start from tree A while a person or another job advances the authoritative tree to B. Blindly applying the result can overwrite or mismerge newer work.

**Location →** No compare-and-swap promotion rule is specified.

**Fix →** Promotion must require the expected base tree and fail on drift. Rebase or rerun explicitly; never silently merge an untrusted result.

---

### 6.6 Dependency manifests are executable authority

**Issue →** AI edits to Maven, Gradle, NuGet, npm, or Python dependency configuration select third-party code that runs during restore. Containerization limits host damage but does not make those packages trustworthy.

**Location →** Project restore implementation was not supplied. `checks.py::_spawn` will execute declared commands without dependency policy.

**Fix →** Gate manifest and registry changes before restore, use approved feeds, avoid secrets during restore, and run later phases offline.

---

### 6.7 Tests that require sibling services

**Issue →** Integration tests may need databases, browsers, message brokers, Docker/Testcontainers, privileged networking, or exposed ports. Granting a worker the container-engine socket to support Testcontainers is unacceptable.

**Location →** No integration-service policy is specified.

**Fix →** Declare supported sidecars launched by the trusted host launcher. Unsupported privileged test modes must fail visibly rather than falling back to host execution.

---

### 6.8 Resource exhaustion crosses container boundaries on Windows

**Issue →** Cgroups can limit a worker, but all Linux containers still share the Podman/WSL VM’s disk and memory envelope. Repeated jobs can fill image storage, caches, or WSL virtual disks and degrade the workstation.

**Location →** No quotas or garbage-collection policy is specified.

**Fix →** Set per-job memory, CPU, PID, timeout, and writable-layer limits; clean abandoned workers; cap caches; expose one “reclaim space” command.

---

### 6.9 Crash and restart semantics

**Issue →** The design does not say what happens when the console, proxy, Podman VM, host, or vendor CLI dies mid-job. Abandoned workers, half-written logs, stale locks, and ambiguous promotion state are likely.

**Location →** No recovery protocol is specified.

**Fix →** Give every job an ID and durable phase record. Startup must classify orphaned jobs as resumable, failed, or safe to delete; promotion must be idempotent.

---

### 6.10 Proxy authentication is operationally fragile

**Issue →** Copilot and Claude CLI authentication can expire, require device flow, depend on mutable home directories, and introduce vendor-specific background behavior. Mounting a complete home directory into the proxy would expose unrelated credentials.

**Location →** Assessment §7; CLI implementation was not supplied.

**Fix →** Mount only dedicated per-vendor authentication state, scrub child environments, use fixed working directories, and disable agent tools, plugins, repository discovery, and automatic updates where supported.

---

### 6.11 Direct API and CLI behavior are not equivalent

**Issue →** A “generic AI API” hides differences in tool use, context handling, retries, model identity, usage accounting, and authentication. Cost accounting may be authoritative for direct APIs but estimated or absent for CLIs, as acknowledged by `APIResult`.

**Location →**

- `ai_router/transports/base.py::APIResult`
- `ai_router/transports/base.py::Transport.dispatch`
- `ai_router/transports/api.py::call_model`

**Fix →** Record transport type, requested and served model, accounting quality, and retry count. Do not present CLI estimates as provider-authoritative cost.

---

### 6.12 Proxy logs become a sensitive data store

**Issue →** Request prompts, response excerpts, source paths, failures, and authentication diagnostics can contain secrets or regulated source. Host-mounted persistence and backups extend their lifetime.

**Location →** Diagram §1, API Proxy items 3–4; `APIResult.content` and `metadata` have no sensitivity schema.

**Fix →** Separate accounting metadata from payloads, redact before persistence, limit retention, and make raw payload logging opt-in per incident.

---

### 6.13 Internal service authentication is absent

**Issue →** Container network locality is not authentication. Any process reaching the proxy port may submit calls unless requests carry a capability. A compromised console can also impersonate other jobs.

**Location →** No proxy authentication protocol is specified.

**Fix →** Issue short-lived job-scoped tokens automatically through the trusted launcher. Staff should never manage them.

---

### 6.14 Git egress remains a covert channel

**Issue →** If the console or worker can push arbitrary Git objects, refs, tags, or branch names, git is an exfiltration channel independent of the API proxy.

**Location →** Diagram §1, IDE Container item 4.

**Fix →** Only the control plane may push. It must push the validated promoted commit to an allowlisted repository and ref policy.

---

### 6.15 Journal integrity defects remain architecture-independent

**Issue →** Containers do not fix the existing authority defects:

- `workflow.py::fold` does not enforce legal transition order;
- simulated reviews can satisfy live state in `workflow.py::fold`;
- `verdict.py::is_doc_only_issue` lets verifier-selected paths affect blocking;
- workflow, journal, and verification records are not one authoritative stream;
- contract approval remains caller-controlled.

A worker that perfectly contains code can still feed a framework that makes incorrect authority decisions.

**Location →**

- `ai_router/workflow.py::fold`
- `ai_router/workflow.py::_main`
- `ai_router/verdict.py::is_doc_only_issue`
- `ai_router/journal.py::_Batch.append`
- `ai_router/verify.py::run_round`

**Fix →** Correct these before describing the mounted record as trustworthy evidence.

---

### 6.16 Image and toolchain lifecycle

**Issue →** The topology adds privileged supply-chain artifacts: console image, proxy image, worker images, vendor CLIs, Java/.NET SDKs, and base operating systems. No pinning, signing, update, rollback, or compatibility policy is stated.

**Location →** No container manifests or release manifest were supplied.

**Fix →** Pin images and CLIs by digest/version in one release manifest, produce an SBOM, and make the launcher report the exact resolved set.

---

### 6.17 Container escape and kernel exposure

**Issue →** Rootless containers reduce impact but still process hostile build inputs through the shared WSL/Linux kernel. Compilers, archive readers, browsers, and native test dependencies expand the kernel and parser attack surface.

**Location →** No hardening profile is specified.

**Fix →** Run rootless and non-root, drop capabilities, prohibit privileged mode and devices, use default-deny seccomp where compatible, and keep Podman/WSL patched.

---

### 6.18 Debugging and interactive recovery

**Issue →** A no-PTY, disposable worker is secure but can be painful when a build hangs or an integration test needs inspection. Staff may bypass containment if the only diagnosis is a truncated log after several minutes.

**Location →** Design document §5 prohibits a supervisor PTY; worker diagnostics are unspecified.

**Fix →** Provide complete downloadable logs, retained failed-workspace snapshots without credentials, and a deliberate developer-only diagnostic command that preserves isolation and is recorded as non-authoritative.

---

### 6.19 Human usability evidence is still absent

**Issue →** Neither the three-box topology nor renaming the IDE proves staff will use it. Weak-model completion does not measure willingness to wait for images, diagnose worker failures, or avoid host execution.

**Location →** No human pilot results were supplied.

**Fix →** Measure setup time, first-job success, median startup overhead, build slowdown, diagnostic time, and number of host-execution bypasses with representative staff and projects.

## 7. Recommendations

1. **[must] Ship the disposable workspace and execution worker together as one feature.**  
   **Changes →** Move all repository-selected execution, including `ai_router/checks.py::execute` and `_spawn`, into a rootless ephemeral worker. Materialize an input snapshot without `.git` or `.dabbler`, validate outputs, and promote through compare-and-swap. Do not release a worktree-only authoritative mode first.  
   **Day-one setup friction →** **Moderate:** Podman/WSL installation, initial image downloads, and one automated environment check. Worth it because this is the control that resolves the top-ranked execution risk; staff should see only `dabbler run`.

2. **[must] Remove the console container and prohibit control-plane execution of project code.**  
   **Changes →** Keep a small native console/launcher outside the repository environment. It owns the journal, constrained file promotion, git push, and Podman lifecycle but never runs project commands. Retire privileged use of workspace-selected interpreters from `pythonInterpreter.ts::resolvePythonInterpreter`. Do not expose the Podman socket to any container.  
   **Day-one setup friction →** **Low and lower than proposed:** one managed `dabbler` installation instead of attaching to or authenticating inside a console container. This also removes the box most likely to be rejected.

3. **[must] Turn the API proxy into a constrained capability broker.**  
   **Changes →** Give each job a short-lived token, quota, project identity, model allowlist, and disclosure policy. Keep endpoint configuration inside the proxy; do not accept caller-supplied `base_url`. Scrub environments for vendor CLI children and retain secrets only in `secret_resolver.py::resolve_secret` inside the broker.  
   **Day-one setup friction →** **Low to moderate:** one-time vendor login or key import; tokens and policy are automatic. Worth it because merely hiding key bytes does not stop spending or exfiltration.

4. **[must] Use managed worker storage, not a writable authoritative host bind mount.**  
   **Changes →** Copy snapshots into WSL ext4 or a Podman-managed volume and export only validated results. Cost and work-log mounts remain proxy-owned; the console receives redacted read-only views.  
   **Day-one setup friction →** **Low:** additional temporary disk use and an initial copy per job, with no new operator step. It improves both integrity and Windows performance.

5. **[must] Define and enforce the promotion protocol.**  
   **Changes →** Bind jobs to an input tree digest and path envelope; reject symlinks, special files, traversal, oversized output, and stale bases; validate the exact staged output tree before commit and push. Retain `checks.py::snapshot_worktree_tree` only as one digest primitive.  
   **Day-one setup friction →** **None:** internal behavior only. Conflict failures become explicit rather than silently overwriting work.

6. **[must] Separate dependency restore from offline execution.**  
   **Changes →** Gate dependency-manifest changes, restore through approved registries without git/vendor credentials, then recreate or disconnect the worker before build and test. Trusted sidecars are launched only by the host launcher.  
   **Day-one setup friction →** **Low to moderate:** first restore may be slower and projects must declare registries. Reusable caches keep recurring friction small.

7. **[must] Constrain the Producer and Chronicler interfaces.**  
   **Changes →** Replace model-selected paths with snapshot manifest handles; enforce resolved-root containment and byte limits. Render output as escaped inert text, strip terminal controls, label provenance, and separate it visually from approvals.  
   **Day-one setup friction →** **None:** no staff setup. Some oversized or unsafe file requests will fail with a visible explanation.

8. **[must] Fix record authority before calling proxy logs or journals evidence.**  
   **Changes →** Enforce legal transitions in `workflow.py::fold`, prevent simulated reviews from advancing state, remove `verdict.py::is_doc_only_issue`, derive contract approvals, and consolidate authoritative events through `journal.py::_Batch.append`.  
   **Day-one setup friction →** **None:** internal correctness work. This is necessary because containment cannot repair a framework that accepts invalid authority transitions.

9. **[should] Publish one pinned release manifest.**  
   **Changes →** Pin proxy and worker images, vendor CLIs, framework build, schema versions, and Java/.NET toolchains by digest/version; report them in job provenance.  
   **Day-one setup friction →** **Low:** larger initial download and periodic controlled updates. Staff gain one update command and reproducible support information.

10. **[should] Add automatic resource limits and cleanup.**  
    **Changes →** Apply CPU, memory, PID, timeout, and writable-storage limits; classify and remove orphaned workers; provide one cache/space cleanup command.  
    **Day-one setup friction →** **None:** defaults are automatic. Large projects may require one documented profile adjustment.

11. **[should] Prototype representative Windows projects before committing to the worker images.**  
    **Changes →** Benchmark Java and .NET startup, restore, build, test, debugger diagnostics, file ownership, and output promotion using managed volumes rather than `C:` bind mounts. Set explicit adoption thresholds and count host bypasses.  
    **Day-one setup friction →** **None for staff outside the pilot; moderate for the one-to-three pilot users:** one benchmark run per representative project. This is the evidence criterion (b) actually needs.

12. **[consider] Offer an explicitly non-authoritative worktree-only profile for home projects.**  
    **Changes →** Label its results unsafe, forbid it for regulated repositories, prevent it from recording authoritative verification, and keep credentials out of its environment where possible.  
    **Day-one setup friction →** **None:** it is an optional faster mode. Its limitation must be mechanical and visible, not a warning staff can accidentally overlook.