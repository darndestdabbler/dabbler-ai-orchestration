# Security verdict

- **VS Code does not provide materially better security for this system.** It removes browser-origin attacks such as localhost CSRF and unauthenticated network access, but it does not isolate the Python framework, generated code, repository, environment credentials, git credentials, or journal authority.
- **Running the whole framework in Podman with access only to AI APIs and git is not meaningful containment.** Those channels can exfiltrate arbitrary data, and Java/.NET builds require additional dependency egress.
- **The correct boundary is a per-job, transactional worker with no git credentials, no journal-write authority, no ambient API keys, and offline test execution after a separate dependency-restore phase.**
- **The dominating threat is privilege co-location:** AI-authored code and AI-controlled tooling execute in the same credential and authority domain as the framework that holds vendor keys, git access, authoritative repository state, and gate records.

# Part 1 — VS Code versus a self-built surface

## 1. Extension host process model

**Issue →** VS Code’s extension host is process isolation for reliability, not a security sandbox for hostile extensions or hostile child processes. A desktop extension can read files available to the user, open network connections, spawn processes, and invoke VS Code APIs. Other installed extensions execute with comparable user privileges.

**Location →** `tools/dabbler-ai-orchestration/src/extension.ts::activate` registers local extension commands and providers. `tools/dabbler-ai-orchestration/package.json` declares a Node entry point through `"main": "./dist/extension.js"`. `tools/dabbler-ai-orchestration/src/utils/routerCli.ts::runRouterCli` calls `child_process.spawn`.

**Fix →** Treat the extension host only as a UI/control client. Do not place execution isolation, credential separation, or journal integrity claims on that boundary.

**Classification →** Real protection against a child blocking or crashing the workbench renderer; security theatre against AI-authored code, a malicious extension, or a compromised Python framework.

## 2. Webview isolation, CSP, and `asWebviewUri`

**Issue →** A VS Code webview does provide a meaningful renderer boundary: webview JavaScript does not directly receive Node.js, filesystem, or VS Code APIs. `asWebviewUri` and `localResourceRoots` constrain which local resources can be loaded, and a strict CSP can block arbitrary scripts and network destinations. None of these controls constrains what the extension does after receiving a webview message.

A compromised webview can still:

- send arbitrary messages through the extension’s message bridge;
- invoke every capability exposed by that bridge;
- fetch permitted remote resources if CSP allows them;
- navigate or open external links where enabled;
- display prompt-injected or deceptive authorization content;
- steal any authorization token placed in its DOM or JavaScript state.

`asWebviewUri` is resource URI mediation, not command authorization. CSP is supplied and maintained by the extension; it is not an automatic guarantee that the shared renderer will be safe.

**Location →** No webview creation or message handler appears in the supplied `tools/dabbler-ai-orchestration/src/extension.ts::activate`; the current implementation uses native tree views. The webview is proposed in document §4, not implemented in the supplied source.

**Fix →** If the webview is added, expose a narrow typed message protocol, validate every message in the extension, bind decisions to actor/action/artifact hash/current state, use nonce-based scripts and a default-deny CSP, and render repository/model content as inert text rather than trusted HTML.

**Classification →** Real protection against renderer XSS directly becoming filesystem or process access; ineffective once a permissive message bridge turns the extension into a privileged deputy.

## 3. `SecretStorage` versus environment variables

**Issue →** `SecretStorage` would materially improve the current design, but only if secrets remain outside spawned job processes.

VS Code `SecretStorage` keeps values in the platform’s protected credential storage and does not automatically inject them into extension children. A child receives a secret only if the extension retrieves and passes it. Environment variables have the opposite property: every ordinary descendant inherits them unless the parent supplies a scrubbed environment.

The current implementation uses environment variables:

- `ai_router/secret_resolver.py::_env_backend` reads `os.environ`.
- `ai_router/secret_resolver.py::resolve_secret` returns the value to callers.
- `ai_router/transports/api.py::_call_anthropic`, `_call_google`, and `_call_openai` retrieve live keys through `resolve_secret`.
- `tools/dabbler-ai-orchestration/src/utils/routerCli.ts::runRouterCli` omits the `env` spawn option, so the Python process inherits the VS Code process environment.

If the framework later spawns tests without an explicit clean environment, those tests inherit the same keys. That descendant behavior is an inference because the test-runner spawn source was not supplied, but it is the default subprocess behavior and matches the stated current operation.

`secret_resolver.py` does not create isolation. It centralizes lookup. Once the backend is `env`, the secret remains readable by every process sharing that environment.

**Location →** `secret_resolver.py::resolve_secret`, `secret_resolver.py::_env_backend`, `api.py::_call_anthropic`, `api.py::_call_google`, `api.py::_call_openai`, and `routerCli.ts::runRouterCli`.

**Fix →**

1. Store long-lived credentials in Windows Credential Manager through `SecretStorage` or a Python keyring backend.
2. Keep credential resolution in a control process outside the AI job.
3. Give test and build children a constructed allowlist environment, not inherited `process.env`/`os.environ`.
4. Put vendor authentication in an API proxy or broker so the job never receives the key.
5. Keep git credentials and journal-write credentials entirely outside the job.

**Classification →** `SecretStorage` is real protection against ambient inheritance and plaintext environment exposure. Merely replacing the resolver backend while still passing the retrieved value into the whole framework container would relocate the secret, not protect it.

## 4. Workspace Trust

**Issue →** Workspace Trust protects a developer before they elect to execute a repository. This product’s normal operation begins after that protection has been waived: it deliberately runs generated, untrusted code. Workspace Trust therefore cannot be the execution boundary.

It can still protect the framework’s control plane from repository-controlled configuration, but the extension does not use it for that purpose. The Python executable is workspace-configurable:

- `pythonInterpreter.ts::explicitPythonPathSetting` gives workspace-folder and workspace settings precedence.
- `pythonInterpreter.ts::normalizeExplicit` resolves relative executable paths against the repository.
- `routerCli.ts::runRouterCli` executes that selected path.
- `package.json` does not mark `dabblerSessionSets.pythonPath` as machine-scoped or security-restricted.

A malicious repository or AI-authored change to `.vscode/settings.json` can select a checked-in executable as the “Python interpreter.” Once the trusted workspace runs another Dabbler command, the extension executes that file with the user’s ambient credentials. The auto-detected workspace `.venv` creates a similar control-plane substitution path: AI-authored code with workspace write access can replace the interpreter or installed `ai_router` package.

**Location →** `pythonInterpreter.ts::explicitPythonPathSetting`, `normalizeExplicit`, `detectWorkspaceVenvInterpreter`, and `resolvePythonInterpreter`; `routerCli.ts::runRouterCli`; `package.json::contributes.configuration`.

**Fix →** Install the framework interpreter outside the writable repository, make its location machine-scoped, reject control-plane executables under the job workspace, and verify the installed package/version before privileged execution. Workspace Trust may remain an initial warning, but must not be cited as job containment.

**Classification →** Real protection against accidental execution while browsing an untrusted repository; security theatre once Dabbler intentionally runs the repository and allows it to select or modify the privileged interpreter.

## 5. Marketplace signing and update integrity versus `pipx`

**Issue →** The official VS Code Marketplace provides a stronger default distribution-integrity path than bare `pipx install` from PyPI: the client verifies Marketplace-delivered extension packages and updates through a managed publisher channel. It does not establish that the extension is safe, that the publisher account was not compromised, or that the bundled dependency graph was trustworthy.

`pipx` creates an isolated Python environment, but that is dependency isolation, not a hostile-code sandbox. A normal `pipx install` trusts:

- the PyPI project identity;
- the publisher account;
- the selected wheel or source distribution;
- unpinned transitive dependencies;
- any package build process needed for source distributions.

PyPI transport and package hashes protect normal download integrity, but `pipx install` does not by default enforce an operator-owned release manifest, dependency hashes, or publisher signature policy.

**Location →** Document §6 proposes `pipx install` and `pipx upgrade`. `tools/dabbler-ai-orchestration/package.json::scripts.package` builds the VSIX and lists the extension’s npm build/runtime dependencies.

**Fix →** Publish pinned wheels, generate a hash-locked dependency set, sign or attest the release artifact, pin container images by digest, and make the installed framework report and verify its build identity. Do not install the privileged control plane from a mutable workspace venv.

**Classification →** The Marketplace advantage is real but narrow: update-channel integrity. It does not compensate for executing Python and generated code with full user authority.

## 6. The existing Python shell-out collapses the meaningful boundary

**Issue →** The extension already delegates authoritative mutation to a Python process with the user’s privileges, workspace access, inherited environment, and selected working directory. That means:

- extension-host separation does not protect the repository or credentials;
- webview CSP does not constrain Python after a message reaches the extension;
- Workspace Trust no longer matters after execution begins;
- Marketplace verification covers only the extension artifact, not the selected interpreter, workspace venv, PyPI package, generated code, or project dependencies.

One control is correctly implemented: `routerCli.ts::buildArgv` and `runRouterCli` use argv-based spawning without a shell, so untrusted arguments are not interpreted as a shell command. That stops shell-string injection. It does not stop execution of a malicious selected interpreter or malicious Python module.

**Location →** `routerCli.ts::runRouterCli`, `buildArgv`, and `pythonInterpreter.ts::resolvePythonInterpreter`.

**Fix →** Move mutation and test execution into a separate per-job worker. Keep the extension and framework control plane unable to execute repository-selected binaries directly.

**Classification →** This is the dominant fact. The extension is a privileged launcher, not a sandbox.

## 7. Is the surface difference material?

**Issue →** The security difference is material only for attacks against the UI doorway itself. It is not material against the principal execution threat.

| Attack | Current VS Code surface | Localhost/shared web server |
|---|---|---|
| Cross-site form POST/CSRF | No HTTP write endpoint, so this attack is absent | Present unless writes require non-ambient authorization plus Origin/Host/content-type checks |
| Unauthenticated LAN access | Absent unless another extension exposes it | Present if bound beyond loopback or reverse-proxied without authentication |
| DNS rebinding against loopback | Absent | Present unless Host validation and authentication reject it |
| Browser extension/content-script compromise | Not the normal extension UI path | Can manipulate/read the browser surface depending on browser permissions |
| Webview XSS | Relevant only after the proposed webview exists; direct host access remains mediated | Ordinary web XSS can directly exercise same-origin server APIs and steal session state |
| Malicious VS Code extension | Can invoke OS capabilities independently and may invoke registered commands | Does not automatically gain server credentials, but can call an unauthenticated localhost endpoint |
| Malicious repository/generated test | Executes with ambient authority through Python | Executes with ambient authority if the server launches it the same way |
| Prompt-injected MCP assistant | No current MCP tool | Direct authorization path if approve/refuse tools exist |
| Compromised framework/Python dependency | Full user authority | Full service-user authority unless separately sandboxed |

**Location →** The current command surface is declared in `package.json::contributes.commands`; no approve/refuse or HTTP command appears there. The proposed browser, SSE, POST, and MCP paths are in document §§4–6.

**Fix →** Choose the surface for usability, then secure it as an untrusted client. Do not choose VS Code as an execution security control.

**Conclusion →** The difference between a VS Code extension and a properly secured loopback server is second-order. Both are dominated by AI-authored code running in the same trust domain as credentials, git authority, authoritative files, and journal writers.

## 8. Re-test of event-ID echo, MCP approval, and localhost CSRF

**Issue →** The event-ID finding stands. An event ID identifies an object; it does not prove identity, authority, freshness, reviewed content, or human intent. Sequence-based event IDs are also predictable.

The MCP attack is stronger than ordinary CSRF: the design intentionally gives a model-controlled tool loop the ability to perform the authorization. Prompt-injected content does not need to exploit the server; it only needs to persuade the assistant to call the documented tool with the visible event ID.

The localhost CSRF finding is not an existing code vulnerability because no `serve` implementation was supplied. It is a blocking design omission. If the future server accepts cookie-authenticated or unauthenticated simple POSTs without Origin/Host checks and an action-bound anti-CSRF value, an arbitrary website can trigger them. CORS alone does not stop a cross-origin form submission.

**Location →** Document §4 claims event-ID echo makes confabulated approval “structurally impossible”; §5 proposes discrete POSTs. No approve/refuse command exists in supplied `package.json`, and no server or webview handler appears in `extension.ts::activate`.

**Fix →**

- Keep MCP read-only.
- Require authorization in a separate human UI whose credential is unavailable to the model.
- Bind the decision to actor, action, event, artifact hash, expected state, and expiry.
- For loopback, require an ephemeral authenticated session, reject unexpected `Host` and `Origin`, disallow simple form content types for writes, and bind only to loopback.
- For a shared box, require TLS, named-user authentication, authorization roles, and audit records.

**Conclusion →** The current native VS Code path is genuinely less exposed to CSRF because it has no HTTP endpoint. It is not a stronger human-authorization boundary by itself. A proposed VS Code webview with an event-ID-only message handler would preserve the same authorization defect without the browser CSRF variant.

# Part 2 — Podman containment

## 9. What containment actually buys

**Issue →** Correctly scoped containment stops host and network attacks that the current design does not stop.

Specific examples:

1. **Host credential theft**
   - Current path: AI-authored test runs under the developer account and reads `%USERPROFILE%`, SSH keys, cloud configuration, browser data, or other project credentials.
   - Break point: a worker container receives only a job snapshot and does not mount the Windows profile, WSL home, credential stores, SSH agent, or host filesystem.

2. **Host persistence**
   - Current path: generated code writes startup entries, modifies shell profiles, schedules a task, or drops a binary outside the repository.
   - Break point: the container has no Windows host API or writable host path; its ephemeral filesystem is destroyed after the job.

3. **Internal-network probing and arbitrary exfiltration**
   - Current path: a malicious test or dependency opens HTTPS, DNS, SMB, or another socket to an attacker or internal service.
   - Break point: the worker has no direct network and can reach only an explicit proxy during authorized phases.

4. **Authoritative repository destruction**
   - Current path: generated code deletes or rewrites the real working tree and `.git`.
   - Break point: the worker receives a copy or snapshot without `.git`; only a validated diff is exported.

5. **Journal and gate tampering**
   - Current path: code running as the same user can edit journal files or invoke sanctioned writers.
   - Break point: the worker has no journal mount, journal credential, or control-plane IPC capable of appending decisions.

6. **Resource exhaustion**
   - Current path: a generated test consumes all CPU, memory, processes, or disk.
   - Break point: Podman CPU, memory, PID, storage, and timeout limits terminate the job.

**Location →** The current launcher is `routerCli.ts::runRouterCli`. The proposal’s job semantics are document §§1–3. No existing sandbox implementation was supplied.

**Fix →** Use rootless, ephemeral per-job containers with no host home mount, no `.git`, no journal access, no container engine socket, no host networking, no privileged mode, and explicit resource limits.

## 10. What “AI APIs and git only” does not buy

**Issue →** AI APIs and git are unrestricted data-export channels.

A process that can call a vendor API can put a stolen credential, source file, journal, or customer record into a model prompt. A process that can push to git can encode arbitrary data in commits, refs, tags, branch names, or repository objects. Restricting destination hostnames does not restrict payloads.

The configurable API endpoints create an additional credential risk:

- `api.py::_call_anthropic` sends `x-api-key` to `config["base_url"]`.
- `api.py::_call_google` sends `x-goog-api-key` to a configurable base.
- `api.py::_call_openai` sends an `Authorization` bearer token to a configurable base.

If repository-writable configuration controls those values, an AI-authored change can redirect the next credentialed call to an attacker. That repository-writability is an inference because configuration loading and location were not supplied.

**Location →** `api.py::_call_anthropic`, `_call_google`, `_call_openai`, and document §2’s model calls. The Google implementation correctly keeps the key out of the query string, but still trusts the configured base URL.

**Fix →**

- Do not give the worker vendor keys.
- Put an authentication proxy outside the worker; the proxy fixes the vendor hostname and attaches the credential.
- Reject custom API bases in production unless they are administrator-controlled.
- Do not give the worker git credentials or `.git`.
- Have the control plane validate and promote the diff, run secret scanning, then commit and push through a repository-scoped service identity.
- If source disclosure to vendors is prohibited, the only controls that close the channel are approved data minimization, a contractual vendor enclave acceptable for that classification, or a local model. An egress allowlist cannot close an intentionally permitted vendor payload channel.

## 11. Dependency egress makes the proposed boundary false

**Issue →** “Only AI APIs and git” does not survive a real Java or .NET build.

Java projects may require Maven repositories, Gradle plugin repositories, wrapper distributions, git dependencies, test containers, schema downloads, and private artifact servers. .NET may require NuGet feeds, SDK packs, workload manifests, npm for frontend assets, and private package sources. npm and pip add registries, lifecycle scripts, and build backends.

Allowing arbitrary registry and CDN egress during the AI job restores a large exfiltration and supply-chain surface. Hostname allowlists are also awkward because vendor and package services use CDNs and changing addresses. Podman network configuration alone is not a robust domain policy; use an explicit egress proxy and block direct DNS/network access.

**Location →** The mandated Java/.NET stacks are stated in document §0.2. Test/dependency execution source was not supplied.

**Fix →** Split execution into phases:

1. AI edit phase through a vendor proxy, without git or journal authority.
2. Manifest-diff inspection and policy validation.
3. Dependency restore in a credential-minimized container with only approved registries.
4. Cache the resulting packages in a job-specific or read-only cache.
5. Run compilation and tests with no network.
6. Export only the diff and evidence.

For one to three people, operating Artifactory/Nexus solely for this project costs more than it returns. Start with pinned repositories, lock files where supported, a proxy/allowlist, and reusable container caches. Add a repository manager only if private feeds or reproducibility justify it.

## 12. Rootless Podman on Windows 11

**Issue →** Podman on Windows adds a WSL2 Linux VM and therefore operational costs beyond a native Linux container.

| Area | Consequence | Cost classification |
|---|---|---|
| WSL2/Podman installation | Enables virtualization, creates and maintains the Podman machine, downloads large Java/.NET images | Mostly one-time setup; recurring image updates |
| Filesystem placement | Metadata-heavy Maven, Gradle, NuGet, npm, and git operations are materially slower when the workspace repeatedly crosses the Windows-to-WSL 9p/virtiofs/DrvFS boundary | Recurring real cost if the repository remains on `C:` |
| Repository in WSL ext4 | Restores much of the build performance, but Windows tools access it through `\\wsl$` or a remote-development integration | One-time migration plus recurring editor compatibility cost |
| Credentials | Windows Credential Manager and Windows SSH setup are not naturally identical to the Linux VM environment | One-time setup, but dangerous if solved by mounting the entire profile or copying long-lived keys |
| Git identity | `user.name`, `user.email`, line endings, file mode, and `safe.directory` must be configured in the Linux environment | Mostly one-time |
| Commit signing | Windows GPG/SSH signing does not automatically work inside the VM/container; forwarding an agent gives the job signing/authentication capability | Recurring friction if every AI commit must be signed inside the worker |
| Rootless ownership | UID mapping and synthetic Windows mount permissions can produce ownership, executable-bit, and cleanup problems | Recurring edge-case cost |
| Editor access | VS Code Remote-WSL is workable; Visual Studio, Rider, and IntelliJ workflows require separate validation and may not match local-Windows behavior | Recurring real cost across the mandated developer population |
| Debugging/test integration | IDE debuggers, test discovery, localhost ports, and file watchers must cross the VM/container boundary | Recurring real cost |
| VM startup and memory | Podman machine consumes memory and must be running before jobs | Small recurring cost |

Rootless Podman reduces the consequence of a container escape inside the Linux VM. It does not protect any Windows or WSL path deliberately bind-mounted into the container, and it does not make a mounted Podman socket safe.

**Location →** Primary Windows/PowerShell operation is stated by the operator. `pythonInterpreter.ts` contains extensive Windows-specific interpreter behavior, confirming that the current implementation is host-native.

**Fix →** Keep repositories used for contained builds in WSL ext4 or a Podman-managed volume, automate VM startup and image provisioning through `dabbler`, and keep commits/pushes in the host control plane so the worker needs neither Windows credentials nor signing keys.

## 13. Where the container belongs

**Issue →** Putting the entire framework in one container leaves the main assets together: API credentials, git credentials, journal authority, AI engine, generated code, and tests. It protects the host outside the container but does not protect the framework from its own job.

**Location →** `secret_resolver.py` and `api.py` place credentials in the framework process. Document §9 gives the framework journal authority. The proposal expects the same system to run generated tests and commit/push.

**Fix →** Put containment around each AI job’s writable workspace and test execution, not around the whole framework.

The control plane should:

1. create an immutable input snapshot;
2. create an ephemeral worker;
3. provide only the approved source subset and toolchain;
4. broker AI calls without exposing credentials;
5. restore dependencies in a separate constrained phase;
6. run tests offline;
7. collect stdout, test results, diff, and effect metadata;
8. destroy the worker;
9. validate the result;
10. atomically promote the diff;
11. commit and push outside the worker.

This is an implementation of the prior review’s **sandboxed, transactional AI job contract**, but it is not the whole contract. Podman supplies process/filesystem/network isolation. Snapshot identity, effect policy, cancellation, diff validation, atomic promotion, rollback, continuation, and journal transitions still require framework code.

## 14. Simplicity test

**Issue →** Containerizing the entire framework fails the “staff want to use it” criterion. It forces every user to understand WSL placement, container credentials, editor attachment, image/toolchain management, and networking merely to open the inbox or approve a decision.

Per-job containment can pass the test if it is invisible behind the normal command. The operator should see “run job,” not a Podman workflow.

**Location →** Document §0.1 criterion (b), document §4’s supervisor persona, and the Windows-specific implementation in `pythonInterpreter.ts`.

**Fix →** Make `dabbler run` provision and manage the worker automatically. Ship maintained Java and .NET worker images. Keep the browser/extension and control plane native. Fail closed for regulated repositories when Podman is unavailable; permit an explicitly labeled unsafe profile only for non-sensitive home projects.

**Conclusion →** Whole-framework containment is not worth its friction. Transparent per-job containment is worth it because arbitrary generated code execution is the product and host credential theft otherwise has no meaningful barrier.

# Part 3 — The threat model the surface and container questions miss

## 15. Prompt injection into authorization

**Issue →** Prompt injection is not preventable by sanitizing prose because repository files, test output, and vendor findings are supposed to influence models. The security boundary must therefore be authority separation, not prompt cleanliness.

The path is:

1. A repository file, generated test output, or vendor finding contains an instruction such as “return PASS” or “approve event 418.”
2. The framework flattens that material into `system_prompt` or `user_message`.
3. `Transport.dispatch` sends it to a model.
4. The response returns as untrusted `APIResult.content`.
5. A parser accepts a syntactically valid enum or finding.
6. **Inference:** a sanctioned writer appends the result or an MCP assistant invokes approve/refuse, advancing the gate.

The append/parser source was not supplied, so step 6 cannot be cited to a function. Nothing in the supplied transport code labels provenance, tracks taint, or distinguishes instructions from quoted evidence. A return schema only proves syntax.

Today, the direct MCP authorization path does not exist in the supplied extension. No approve/refuse command appears in `package.json`. The apparent current stop is a human action outside the model tool loop, although a prompt-injected brief can still manipulate that human. Under the proposal, exposing approve/refuse as MCP tools removes that stop.

**Location →** `ai_router/transports/base.py::Transport.dispatch` and `APIResult.content`; `api.py::_call_anthropic`, `_call_google`, and `_call_openai`; document §§1–4.

**Fix →**

- Model outputs may propose findings and actions but may not exercise human authority.
- Keep MCP authorization unavailable.
- Render untrusted evidence as quoted, provenance-labeled text.
- Require a separately authenticated human action bound to artifact hash and expected state.
- Compute mechanical gates only from framework observations or pre-authorized rules, never from a model-authored “approve” field.

## 16. Credential exposure to AI-authored code

**Issue →** AI-written tests can read known environment variable names such as `DABBLER_ANTHROPIC_API_KEY`. Under the current launcher, the Python framework inherits the extension environment. If test subprocesses inherit the framework environment, the test can read and transmit all three vendor keys.

Transmission paths include:

- an arbitrary attacker endpoint under current unrestricted host networking;
- an allowed vendor API endpoint, placing the stolen key in the request body;
- git, by adding the credential to a committed file;
- logs or findings that later enter the served record.

The same problem applies to a Copilot CLI credential or git helper/SSH agent if they are made available to the job.

A second conditional path exists through configuration: if an AI can modify `router-config.yaml`, configurable `base_url` and `api_key_env` fields can cause the framework itself to send an environment value to an attacker-selected endpoint.

**Location →** `routerCli.ts::runRouterCli`; `secret_resolver.py::_env_backend`; `api.py::call_model`, `_call_anthropic`, `_call_google`, and `_call_openai`.

**Fix →** Give jobs a clean allowlist environment, keep vendor authentication in an external broker, lock provider endpoint configuration outside the repository, remove `.git`, do not forward credential or signing agents, and perform push through the control plane.

`secret_resolver.py`’s indirection is orthogonal. It makes backend replacement easier; it does not prevent descendant processes from reading environment-backed secrets.

## 17. Supply chain in both directions

**Issue →** The framework has two independent supply-chain ingress paths.

**Framework ingress:**

- the VSIX build and its npm build dependencies;
- the Python wheel and transitive Python dependencies;
- `pipx upgrade` selecting a newly published version;
- Java/.NET worker base images and SDK packages;
- a workspace `.venv` writable by the AI job.

**Project ingress:**

- AI edits to `pom.xml`, Gradle files, `.csproj`, `Directory.Build.*`, `NuGet.config`, `package.json`, or Python dependency manifests;
- Maven/Gradle plugins and NuGet packages that execute build logic;
- npm lifecycle scripts and Python build backends;
- dependency confusion through newly introduced or reordered registries;
- git or URL dependencies that bypass normal registry policy.

Containerization limits host impact but does not make an intentionally downloaded malicious package trustworthy.

**Location →** Document §6 proposes PyPI/pipx delivery. `extension.ts::maybeOfferSetup` describes creating a workspace `.venv` and installing the router. `package.json` lists the extension’s dependency and build chain. Project restore code was not supplied.

**Fix →** Hash-lock framework dependencies, verify release artifacts, pin worker images by digest, move the framework environment outside the workspace, gate dependency-manifest and repository-source changes before restore, run restore without secrets, and run tests offline afterward.

## 18. The journal and served logs are exfiltration surfaces

**Issue →** Findings, briefs, model outputs, error excerpts, test output, file paths, personal data, and credentials can enter records that are intended to be immutable and centrally served.

“Raw output stays out of the journal” does not solve this:

- findings can quote raw output;
- model summaries can reproduce secrets;
- briefs intentionally aggregate evidence;
- `GET /logs/<step>` serves the raw logs directly;
- “findings are never erased” conflicts with credential revocation, privacy obligations, and legal deletion.

On a shared box, the proposal defines no reader authentication or per-project authorization. Therefore everyone who can reach the URL may be able to read every served projection and log; that is a design inference because `serve` is not implemented.

**Location →** Document §§5, 6, and 9. `base.py::APIResult.content` has no sensitivity classification. `base.py::APIResult.metadata` is an open dictionary with no redaction contract.

**Fix →** Classify journal fields, scan for secrets before append, keep raw artifacts in access-controlled quarantine, serve redacted projections, restrict logs by actor/project, apply retention limits, and replace “never erased” with immutable correction records plus access-controlled redaction or deletion of sensitive payloads.

## 19. Multi-vendor trust and state-government source

**Issue →** The design sends material to three independent external processors, multiplying disclosure rather than merely adding verification.

The code sends:

- Anthropic: `system_prompt` and `user_message` in `_call_anthropic`;
- Google: the same content in `_call_google`;
- OpenAI: `instructions` and `input` in `_call_openai`.

The supplied result type records a served model ID but not which source files, log fragments, findings, or classified fields were disclosed. `APIResult` does not include provider, account/tenant, request content hash, disclosure manifest, retention policy, or region. A caller may record some of these elsewhere, but no such code was supplied.

The actual posture therefore relies on unrecorded external facts: the API account tier, vendor contract, training opt-out, retention period, abuse-monitoring retention, processing region, subcontractors, and whether state-government source or data is contractually permitted.

**Location →** `api.py::_call_anthropic`, `_call_google`, `_call_openai`; `base.py::APIResult`; document §§0 and 3.

**Fix →** Before multi-vendor operation, approve a data-classification and vendor-processing policy. Record per call:

- vendor, account/tenant, endpoint, region, requested and served model;
- exact input artifact/content hashes;
- source paths or evidence identifiers included;
- data classification;
- prompt/guidance hashes;
- retention and training posture applicable at call time;
- operator authorization for exceptional disclosures.

If a repository’s classification is not approved for all three vendors, cross-vendor verification must use approved vendors, redacted artifacts, or local models rather than silently sending the same source everywhere.

## 20. Risk ranking

| Rank | Threat | Reason |
|---:|---|---|
| 1 | AI job shares credentials, git authority, journal access, and authoritative filesystem | Direct path from intended arbitrary code execution to credential theft, evidence tampering, persistence, and unauthorized push |
| 2 | Prompt injection reaches gate or MCP authorization | Converts ordinary repository/model content into authoritative state transitions |
| 3 | Uncontrolled disclosure to three vendors | Intended high-volume source egress with no demonstrated classification or disclosure ledger |
| 4 | AI-added project dependencies | Executes third-party code selected by an untrusted author during restore/build |
| 5 | Immutable/shared journal and log exposure | Concentrates secrets, findings, source excerpts, and potentially regulated data |
| 6 | Framework distribution and writable control-plane interpreter | A compromised package, workspace setting, or `.venv` gains all framework authority |
| 7 | Browser/webview doorway attacks | Important for writes and shared deployment, but narrower than the execution and authority collapse |
| 8 | Container escape or VS Code renderer compromise | Relevant after the larger credential and authority errors are corrected |

**Surface choice and whole-process containerization are second-order next to allowing AI-controlled code to share credentials and authoritative state with the framework.**

# Part 4 — Recommendations

1. **[must] Per-job transactional worker**
   - **Issue →** Generated code currently executes against the real trust domain.
   - **Location →** `routerCli.ts::runRouterCli`; document §§1–3.
   - **Fix →** Run each AI edit/build/test job in an ephemeral rootless Podman worker created from an immutable snapshot, without `.git`, journal access, host home mounts, engine sockets, or direct host networking; validate and atomically promote only its diff.
   - **Attack stopped →** Host credential theft, host persistence, authoritative repository destruction, direct journal tampering, and uncontrolled resource exhaustion.
   - **Setup friction →** Moderate: Podman/WSL installation, two maintained Java/.NET images, initial image downloads, and automated workspace transfer.

2. **[must] Remove credentials and authority from the worker**
   - **Issue →** A container holding API keys and git credentials still gives those assets to hostile code.
   - **Location →** `secret_resolver.py::_env_backend`; `api.py::_call_*`; `routerCli.ts::runRouterCli`.
   - **Fix →** Broker vendor calls outside the worker, construct a clean child environment, fix provider endpoints outside repository configuration, keep git/signing credentials in the control plane, and push only validated promoted changes.
   - **Attack stopped →** Tests stealing vendor keys, redirecting authenticated calls, pushing exfiltrated data, or forging journal/gate events.
   - **Setup friction →** Moderate to high: one local API proxy/broker, explicit process environments, and a control-plane git promotion path.

3. **[must] Keep authorization outside every model tool loop**
   - **Issue →** Prompt-injected evidence can direct an MCP assistant to approve its own work.
   - **Location →** Document §4’s approve/refuse MCP tools; `base.py::APIResult.content`.
   - **Fix →** Keep MCP read-only until a separately authenticated browser/native confirmation binds actor, action, artifact hash, expected state, and expiry; the model must not possess the confirming credential.
   - **Attack stopped →** Prompt-injected or confabulated approval and stale-state authorization.
   - **Setup friction →** Low to moderate: one confirmation endpoint and decision precondition model; one extra human click only at existing touchpoints.

4. **[must] Remove repository control over the privileged interpreter**
   - **Issue →** A workspace setting or writable `.venv` can replace the executable launched with live credentials.
   - **Location →** `pythonInterpreter.ts::explicitPythonPathSetting`, `normalizeExplicit`, `detectWorkspaceVenvInterpreter`, `resolvePythonInterpreter`; `package.json::contributes.configuration`.
   - **Fix →** Make the control-plane interpreter machine-scoped and outside the repository; reject workspace-relative privileged interpreters and verify the installed framework build before execution.
   - **Attack stopped →** A malicious repository or AI-authored `.vscode/settings.json`/`.venv` substitution gaining framework authority.
   - **Setup friction →** Low: one external managed environment and a migration from the workspace venv.

5. **[must] Separate dependency restore from offline execution**
   - **Issue →** Maven, NuGet, npm, and pip egress defeats a no-network job boundary.
   - **Location →** Document §0.2’s Java/.NET requirement; test runner source not supplied.
   - **Fix →** Gate dependency-manifest changes, restore in a secret-free container restricted to approved registries, cache artifacts, then compile and test with no network.
   - **Attack stopped →** Malicious tests or dependencies exfiltrating data and dependency-confusion packages entering during an unreviewed restore.
   - **Setup friction →** Moderate: lockfile/repository policies and reusable caches; do not deploy a full artifact repository unless private-feed requirements justify it.

6. **[must] Authenticate and constrain `serve` before enabling writes**
   - **Issue →** A loopback or shared server creates CSRF, DNS-rebinding, unauthorized-reader, and unauthenticated-write paths.
   - **Location →** Document §§4–6; no server implementation supplied.
   - **Fix →** Loopback-bind local mode, validate Host and Origin, require an ephemeral authenticated session and non-simple write requests, apply CSP and frame restrictions, and require TLS plus named-user authorization on a shared box.
   - **Attack stopped →** Malicious websites triggering localhost writes, LAN users reading records, and unauthenticated callers appending decisions.
   - **Setup friction →** Low for loopback tokens; moderate for shared-box TLS and identity integration.

7. **[must] Establish vendor disclosure policy and per-call provenance**
   - **Issue →** Three vendors receive flattened source/evidence without a demonstrated data-handling decision or disclosure ledger.
   - **Location →** `api.py::_call_anthropic`, `_call_google`, `_call_openai`; `base.py::APIResult`.
   - **Fix →** Approve vendor contracts by data classification and record which content hashes each vendor/account/model received.
   - **Attack stopped →** Unauthorized disclosure of state-government source or regulated data and inability to investigate a vendor exposure.
   - **Setup friction →** Moderate initial policy/legal work; low recurring cost if provenance is generated mechanically.

8. **[should] Add journal redaction and reader authorization**
   - **Issue →** Append-only findings and served logs can permanently expose credentials, personal data, or source excerpts.
   - **Location →** Document §§5, 6, and 9.
   - **Fix →** Scan before append, quarantine raw payloads, serve redacted projections, restrict project/log access, and support immutable tombstones with sensitive payload deletion.
   - **Attack stopped →** Credential or regulated-data leakage through findings, briefs, logs, backups, and the shared UI.
   - **Setup friction →** Moderate: field classification, projection changes, and a small redaction workflow.

9. **[should] Harden both delivery chains**
   - **Issue →** Marketplace delivery protects only the extension, while `pipx` and worker images remain separate privileged supply chains.
   - **Location →** Document §6; `package.json::scripts.package` and dependency lists.
   - **Fix →** Sign or attest wheels, hash-lock Python dependencies, pin container images by digest, generate an SBOM, and verify release identity at startup.
   - **Attack stopped →** PyPI account compromise, transitive dependency substitution, poisoned images, and silent framework downgrade.
   - **Setup friction →** Low to moderate: CI release changes and periodic dependency updates.

10. **[should] Move long-lived secrets out of environment variables**
    - **Issue →** Every normally spawned descendant inherits environment-backed credentials.
    - **Location →** `secret_resolver.py::_env_backend`; `routerCli.ts::runRouterCli`.
    - **Fix →** Add a Windows Credential Manager/keyring backend, remove API keys from the VS Code and shell environment, and retrieve them only in the external broker.
    - **Attack stopped →** Unrelated tools, logs, child processes, and generated tests reading long-lived keys from their environment.
    - **Setup friction →** Low: one-time credential import and backend configuration.

11. **[consider] Retain VS Code only as an optional client**
    - **Issue →** Treating VS Code as the security boundary preserves workspace/interpreter risks without solving job isolation.
    - **Location →** `extension.ts::activate`; `routerCli.ts::runRouterCli`; document §4.
    - **Fix →** Let VS Code render and submit authenticated commands to the same control plane, but do not let it launch repository-selected privileged processes.
    - **Attack stopped →** Compromise of the UI client directly becoming job, git, or journal authority.
    - **Setup friction →** Moderate implementation cost; low operator friction once installed.

**Adopt Podman containment:** **yes—but scoped to each AI job’s workspace, dependency restore, build, and test execution.**

**Keep VS Code as the surface for security reasons:** **no.**

**Expose approve/refuse over MCP:** **not until authorization requires a separate human-presence confirmation whose credential and completion path are unavailable to the model.**