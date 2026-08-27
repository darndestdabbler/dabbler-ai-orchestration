# Native Dabbler Control Plane with Disposable Workers

A staff member keeps each project in a normal Windows folder and uses their preferred editor for files, while one local Dabbler web page shows the work, asks for decisions, and records progress. Dabbler calls the artificial-intelligence services, places proposed changes in a temporary Docker workspace, runs the project’s checks there, obtains an independent review from another vendor, and copies approved changes back only after they pass. Dabbler itself installs and upgrades as one signed Windows application; its user interface, framework, guidance, and temporary worker versions move together.

## 0. The plain-English paragraph and the slide

### Slide test

```text
┌──────────────────────────────────────────────┐
│ STAFF TOOLS                                  │
│ Browser dashboard + chosen editor            │
│ Normal Windows project folder: C:\Work\...   │
└──────────────────────┬───────────────────────┘
                       │ localhost:7337 + files
                       ▼
┌──────────────────────────────────────────────┐
│ DABBLER — WINDOWS CONTROL PLANE               │
│ UI, workflow, journal, AI broker, promotion  │
│ Signed app; never runs project commands       │
└───────────────┬──────────────────┬───────────┘
                │ snapshot/result  │ HTTPS
                ▼                  ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ DISPOSABLE WORKER        │  │ EXTERNAL SERVICES        │
│ One Docker container/job │  │ Anthropic, Google,       │
│ Build, test, render      │  │ OpenAI, Copilot, GitHub  │
│ Deleted after the job   │  └──────────────────────────┘
└──────────────────────────┘
```

### Moving-parts budget

A staff member must understand **four things** day to day:

1. **Project** — the normal Windows folder opened in Visual Studio, Rider, IntelliJ, Visual Studio Code, MuseScore, or another editor.
2. **Inbox** — the Dabbler page showing what needs human attention.
3. **Run** — one bounded piece of work moving from request through generation, checks, and review.
4. **Decision** — approve, return with a reason, or cancel.

The following exist but remain invisible:

- **Docker Desktop and Docker Compose** — Dabbler starts and removes workers automatically; staff never run Docker commands.
- **Worker images and volumes** — selected from project configuration and pinned by the Dabbler release.
- **AI credentials and routing** — stored in Windows Credential Manager and used only by Dabbler.
- **Snapshots, staging trees, hashes, and rollback copies** — internal parts of promotion.
- **The append-only event store** — rendered as the Inbox and run history rather than exposed as files.
- **Version manifests and schema migrations** — checked by `dabbler open` and reconciled by `dabbler update`.

They stay invisible because there is no supported day-to-day command or screen for manipulating them directly.

## 1. The architecture

### 1.1 What exists

#### Dabbler Windows application

A signed Windows application installed through `winget` provides:

- `dabbler.exe`;
- the Python framework packaged outside every repository;
- a React and TypeScript user interface embedded in the same application;
- baseline guidance and return schemas;
- the release manifest;
- the AI broker;
- the event store and projections;
- the transactional worker launcher;
- constrained Git commit, push, and record synchronization.

It listens only on `127.0.0.1:7337`. The browser receives an authenticated, HTTP-only, same-site session cookie. Write requests require the expected origin, current event state, artifact hash, and action token.

The application is installed under:

```text
C:\Program Files\Dabbler\
```

Machine-local state lives under:

```text
%LOCALAPPDATA%\Dabbler\
├── credentials-metadata\
├── records\<repository-id>\events\
├── staging\<run-id>\
├── logs\<run-id>\
└── releases\
```

Long-lived secrets remain in Windows Credential Manager, not these directories.

#### Project folder

The authoritative source remains in a normal Windows folder such as:

```text
C:\Work\HealthReporting\
```

The project contains only readable project declarations:

```text
dabbler.yaml
solution.yaml
guidance\
src\
tests\
docs\
```

It does not contain the Dabbler executable, a privileged Python environment, vendor credentials, or the authoritative event store.

#### Disposable worker

There are **zero running containers while idle** and normally **one container during a run**. The same worker may run twice sequentially:

1. **Restore mode** receives dependency manifests and limited network access.
2. **Execution mode** receives the complete candidate snapshot and has no network.

Three maintained images cover the required domains:

```text
ghcr.io/darndestdabbler/worker-code:2.0.0@sha256:<digest>
ghcr.io/darndestdabbler/worker-docs:2.0.0@sha256:<digest>
ghcr.io/darndestdabbler/worker-score:2.0.0@sha256:<digest>
```

`worker-code` contains:

- Eclipse Temurin Java 21;
- Maven 3.9;
- Gradle 8;
- .NET SDK 8;
- Git without remotes or credentials;
- standard test-result collectors.

`worker-docs` contains:

- Vale;
- markdownlint-cli2;
- Pandoc;
- Python-based internal-link, numbering, defined-term, and cross-reference checks.

`worker-score` contains:

- LilyPond 2.24;
- MuseScore 4 command-line rendering;
- MusicXML schema validation;
- MIDI inspection;
- the project’s declared range and playability checkers.

Dabbler generates an internal Docker Compose project for each run. Staff do not maintain a Compose file.

Worker runtime settings are:

```text
user: 10001:10001
read_only root filesystem: true
cap_drop: ALL
security_opt: no-new-privileges
Docker socket: absent
published ports: none
host source mounts: none
host profile mounts: none
execution network: none
working volume: dabbler-job-<run-id> mounted at /work
temporary output: /out, extracted with docker cp
```

The working volume resides in Docker Desktop’s Windows Subsystem for Linux storage, not on a `C:` bind mount. This avoids putting Maven, Gradle, NuGet, Git, and compiler metadata operations through the slow Windows-to-Linux file-sharing path.

Dependency caches are keyed by worker digest and dependency-lock hash:

```text
dabbler-cache-code-<image-digest>-nuget-<lock-hash>
dabbler-cache-code-<image-digest>-maven-<lock-hash>
dabbler-cache-code-<image-digest>-gradle-<lock-hash>
```

A restore writes a new cache version. Execution receives that cache read-only.

#### External services

Dabbler, not the worker, reaches:

```text
https://api.anthropic.com:443
https://generativelanguage.googleapis.com:443
https://api.openai.com:443
GitHub Copilot service endpoints:443
https://github.com:443
```

Provider base URLs are release-owned. A repository may select an allowed provider or role but cannot supply a replacement endpoint.

Restore-mode workers reach declared public package registries without receiving source files, Git credentials, vendor credentials, or the event store.

### 1.2 Transaction for one run

1. Dabbler snapshots the current project and records its base digest.
2. It excludes `.git`, local records, ignored secrets, credentials, and undeclared external files.
3. It creates a worker volume and a synthetic local Git repository with no remote, hooks, or credentials.
4. The framework provides AI engines with bounded, hash-identified project files.
5. AI output returns as a typed file-operation manifest.
6. Dabbler rejects absolute paths, `..`, links, special files, files outside the approved envelope, and excessive output.
7. Proposed files are applied only to the worker snapshot.
8. Dependency changes require an existing approval event before restore.
9. Restore mode receives only manifests, wrappers, and build configuration.
10. Execution mode builds, tests, lints, or renders with `network: none`.
11. A different vendor reviews the candidate and evidence.
12. Approval binds the human decision to the exact candidate digest.
13. Dabbler verifies that the Windows project still has the expected base digest.
14. It applies the candidate through a rollback-capable staging transaction.
15. It commits with repository hooks disabled and pushes only the configured project branch and record branch.
16. The worker and job volume are deleted.

If the project changed after the run began, promotion stops with:

```text
The project changed after this run started.
Nothing was copied back.
Choose “Refresh candidate” to replay the accepted change on the new base.
```

### 1.3 Shared record for one to three people

Each event is an immutable JSON file identified by a sortable unique identifier. Local events are stored under `%LOCALAPPDATA%\Dabbler\records` and synchronized to the repository’s protected `dabbler/record` branch.

Dabbler fetches that branch while the UI is open and folds all immutable events into the shared projection. Concurrent appends create different files and therefore merge without editing a shared JSON line.

Staff see one shared Inbox. They do not manage the branch.

### 1.4 Component table

| Component | Responsibility | What it can reach | What it must never reach |
|---|---|---|---|
| Staff tools | Edit files, inspect candidates, make human decisions | Windows project folder; `127.0.0.1:7337` | Vendor keys, worker internals, Docker socket, another user’s approval credential |
| Dabbler control plane | Own workflow, record, AI calls, worker lifecycle, validation, promotion, Git synchronization | Project folder; Windows Credential Manager; Docker CLI; fixed AI endpoints; configured GitHub repository | Execution of repository-selected builds, tests, scripts, hooks, package managers, or interpreters |
| Disposable worker | Apply candidate changes and run restore/build/test/render commands | Its own volumes; approved package registries during restore only | Windows project folder, host profile, authoritative `.git`, event store, vendor keys, Git credentials, Docker socket, AI services |
| AI services | Generate or critique typed artifacts | Only content explicitly submitted by Dabbler | Local files, the worker, approval endpoints, Git, the event store |
| GitHub | Store promoted commits and immutable event files | Configured source branch and `dabbler/record` branch | Vendor credentials, raw temporary logs, rejected worker files |

### 1.5 Required changes to the existing code

| Existing location | Architectural change |
|---|---|
| `ai_router/checks.py::_spawn` | Becomes worker-entrypoint code only. The Windows control plane must never call it against a project folder. |
| `ai_router/checks.py::execute` | Dispatches through the worker client and binds results to the candidate digest. |
| `ai_router/checks.py::changed_paths` | Fails closed when `changed_paths_between` returns `None`; it must not convert measurement failure into an empty change set. |
| `ai_router/checks.py::snapshot_worktree_tree` | Remains a digest primitive inside the synthetic worker repository, not a containment mechanism. |
| `ai_router/solution.py::parse` | Loads allowed stages and component kinds from validated domain configuration instead of the hard-coded `KINDS` and software-specific `STEPS`. |
| `ai_router/solution.py::as_dict` | Emits domain-configured labels while retaining stable generic stage identifiers. |
| `ai_router/transports/api.py::call_model` | Runs only inside the installed control plane; provider endpoints come from the signed release configuration. |
| `ai_router/transports/api.py::_call_anthropic`, `_call_google`, `_call_openai` | Resolve secrets from Windows Credential Manager through the control-plane secret backend, never from a worker environment. |
| `ai_router/router-config.yaml` | Keeps model and routing data in the release; project configuration may reference roles but not endpoints or secret names. |
| `ai_router/workflow.py::fold` | Enforces legal transition order and refuses simulated evidence for live transitions before the new UI can write decisions. |
| `ai_router/verdict.py::is_doc_only_issue` | Is removed as a blocking exemption; a verifier cannot select its own exemption by citing Markdown files. |
| `ai_router/journal.py::_Batch.append` | Writes immutable event objects through one event-store interface and stamps framework, guidance, UI, and worker provenance. |
| `tools/dabbler-ai-orchestration/package.json` | Stops being the required doorway. The existing extension becomes a read-only compatibility renderer and is not installed during normal setup. |

## 2. Day one, as a transcript

There are **four normal commands**, plus one repeat of `dabbler setup` if Windows requires a sign-out or restart while enabling the Windows Subsystem for Linux.

### Step 1 — install Dabbler

```powershell
PS C:\> winget install --exact --id DarndestDabbler.Dabbler `
>>   --accept-package-agreements --accept-source-agreements
```

They see:

```text
Found Dabbler [DarndestDabbler.Dabbler] Version 2.0.0
Downloading signed installer...
Installer signature verified: Darndest Dabbler LLC
Installing C:\Program Files\Dabbler\
Adding command: dabbler
Successfully installed
```

No Python installation is requested. The signed package contains the framework, UI, baseline guidance, and release manifest.

### Step 2 — provision the machine and authenticate

```powershell
PS C:\> dabbler setup
```

They see:

```text
Dabbler setup

[ok] Windows 11 supported
[installing] Git for Windows
[installing] Docker Desktop with WSL 2 backend
[ok] Docker Compose 2 available
[ok] Dabbler UI and framework: 2.0.0
[ok] Windows Credential Manager available

A browser window has opened for service sign-in.
```

The browser shows one setup page:

```text
GitHub Copilot       Sign in
Anthropic API        Add key
Google Gemini API    Add key
OpenAI API           Add key
```

The user completes the GitHub device flow and pastes the three API keys into password fields. The keys go directly to Windows Credential Manager and are never displayed again.

The terminal continues:

```text
[ok] GitHub Copilot authenticated
[ok] Anthropic credential tested
[ok] Google credential tested
[ok] OpenAI credential tested
[ok] Git Credential Manager available

Setup complete.
Worker images will download only when a project first needs them.
```

If Windows requires a restart:

```text
Windows must restart to finish enabling WSL 2.
Restart Windows, then run `dabbler setup` again.
No completed setup work will be repeated.
```

After restart:

```powershell
PS C:\> dabbler setup
```

They see:

```text
[ok] Git for Windows
[ok] Docker Desktop
[ok] Docker Compose 2
[ok] All four AI transports
Setup complete.
```

The restart cannot be removed because Linux containers on a previously unconfigured Windows machine require the Windows virtualization components to be enabled.

### Step 3 — open the project

For an existing GitHub project:

```powershell
PS C:\> dabbler open https://github.com/example/health-reporting.git `
>>   --to C:\Work\health-reporting
```

They see:

```text
Cloning into C:\Work\health-reporting...
Authenticating through Git Credential Manager...
Project type: dotnet-service
Required worker: worker-code 2.0.0
Downloading worker-code: 2.8 GB
This is a one-time download for this worker version.
```

After the pull:

```text
[ok] Project manifest
[ok] Solution graph
[ok] Record synchronized
[ok] Worker digest verified
[ok] Framework/UI/guidance release: 2.0.0

Dabbler is running at http://127.0.0.1:7337/
Opening your browser...
```

A cold image download should take approximately 3–15 minutes depending on the connection. A warm `dabbler open` should take 2–5 seconds.

### Step 4 — verify the environment

```powershell
PS C:\> dabbler doctor C:\Work\health-reporting
```

They see:

```text
Dabbler doctor — health-reporting

Application             2.0.0                         OK
User interface          2.0.0 / embedded hash match  OK
Baseline guidance       2.0.0 / hash match           OK
Project guidance        schema 1 / 7 files            OK
Worker                  worker-code / digest match    OK
Docker storage          WSL volume                    OK
Copilot                  authenticated                 OK
Anthropic               authenticated                 OK
Google                  authenticated                 OK
OpenAI                  authenticated                 OK
GitHub                  fetch and push                 OK
Authoritative execution disposable worker             OK

Ready.
```

## 3. Upgrade, as a transcript

### One-command upgrade

```powershell
PS C:\Work\health-reporting> dabbler update
```

They see:

```text
Checking signed release channel...

Installed release: 2.0.0
Available release: 2.1.0

Release 2.1.0 contains:
  framework          2.1.0
  user interface     2.1.0
  baseline guidance  2.1.0
  event schema       2
  domain schema      1
  worker-code        sha256:9d3...
  worker-docs        sha256:0b7...
  worker-score       sha256:a14...

Downloading application bundle...
Verifying signature... OK
Pulling worker-code... OK
Worker-docs and worker-score will remain lazy until used.
Testing record migration on a copy... OK
Testing project configuration... OK
No active run prevents the upgrade.

Installing release 2.1.0...
Starting Dabbler...
Health check passed.

Upgrade complete.
The previous release remains available for automatic rollback until
the first successful run closes.
```

The browser reconnects automatically and shows:

```text
Dabbler was upgraded from 2.0.0 to 2.1.0.
No project files changed.
```

### Version skew

A Dabbler release has one signed `release.json` containing:

- framework version and hash;
- UI version and asset hash;
- baseline-guidance version and hash;
- worker image aliases and exact digests;
- event and domain schema versions.

Framework, UI, and baseline guidance are not independently upgradeable.

If the current installation is already skewed:

```powershell
PS C:\Work\health-reporting> dabbler update
```

They see:

```text
Version skew detected:

  framework          2.0.0
  user interface     1.9.2      MISMATCH
  baseline guidance  2.0.0
  worker-code        sha256:71c EXPECTED sha256:9d3

No new run may start in this state.
Repair target: signed release 2.1.0

Replacing UI assets... OK
Replacing framework and guidance... OK
Pulling exact worker digest... OK
Removing unreferenced worker digest... deferred for rollback
Health check... OK

All release components now resolve to 2.1.0.
```

The rules are:

- **Framework, UI, and baseline guidance mismatch:** installation corruption; new work is refused and `dabbler update` repairs the complete bundle.
- **Worker digest mismatch:** the exact pinned digest is pulled before a run starts.
- **Project guidance:** versioned and hashed with the run, but not overwritten because it belongs to the project. An incompatible guidance schema blocks with a generated migration preview.
- **Existing records:** retain the versions that created them. They are never reinterpreted as though a newer release wrote them.
- **Active runs:** retain their original release pins until completion or cancellation. The updater downloads the new release but delays the final swap.
- **Interrupted update:** the old signed bundle remains active; partially downloaded assets are never selected.

There is no supported state where a new run combines independently selected framework, UI, guidance, and worker versions.

## 4. A developer’s day

### Task

Add a `GET /api/policies/{id}` endpoint to a .NET service, returning `404` for an unknown policy.

### 09:00 — pick up work

The developer opens:

```text
http://127.0.0.1:7337/
```

The home page is the Inbox. It shows:

```text
Ready
  Add policy lookup endpoint

Waiting for you
  None

Running
  None
```

They click **Add work** and type:

```text
Add GET /api/policies/{id}. Return the policy DTO when found and 404
when absent. Do not change the public DTO or add a dependency.
```

They click **Start**.

No terminal command is required.

### 09:01 — planning and generation

The UI changes to:

```text
Add policy lookup endpoint
1. Plan              complete
2. Candidate         running
3. Checks            waiting
4. Independent review waiting
5. Decision          waiting
```

Dabbler selects the relevant components and files from `solution.yaml`, asks the configured authoring engine for a typed candidate, validates the returned file manifest, and applies it in the worker.

The developer waits approximately **45–120 seconds**.

The UI does not stream tokens. It shows elapsed time and the current mechanical stage:

```text
Authoring candidate — 00:47
Files supplied: 8
Files returned: 3
Estimated remaining time: about 1 minute
```

### 09:03 — review the candidate

The UI shows:

```text
Candidate ready

Changed:
  src/Policies/PolicyEndpoints.cs          +24 -0
  tests/Policies/PolicyEndpointsTests.cs   +61 -0
  docs/api/policies.md                     +8 -1

Declared contract changes: none
Dependency changes: none
Files outside approved envelope: none
```

The developer sees a side-by-side diff with three buttons:

```text
Return with comment
Open in editor
Run checks
```

They click **Open in editor** if they want the full IDE. Dabbler opens read-only candidate copies from its staging directory; the authoritative project has not changed.

They spend approximately **2–5 minutes** reading the endpoint, test cases, and documentation.

They click **Run checks**.

### 09:07 — deterministic checks

Dabbler starts `worker-code` from its pinned digest. Docker container startup and snapshot transfer take approximately **2–5 seconds** when warm.

The UI shows:

```text
Checks

Restore        reused sealed NuGet cache          0:02
Compile        dotnet build --no-restore           running
Targeted tests dotnet test --no-build ...          waiting
Full tests     dotnet test --no-build              waiting
```

The actual configured commands are:

```text
dotnet restore HealthReporting.sln --locked-mode
dotnet build HealthReporting.sln --no-restore --configuration Release
dotnet test tests/Policies.Tests/Policies.Tests.csproj
    --no-build --configuration Release
dotnet test HealthReporting.sln
    --no-build --configuration Release
```

The worker has no network during build and test.

A normal targeted cycle takes **30–90 seconds**. The full suite depends on the repository; this example takes **2 minutes 10 seconds**.

The completed display is:

```text
Compile          passed   0:18
Targeted tests   12/12    0:31
Full tests       486/486  2:10
Tree mutated     no
Candidate digest 3c9f... 
```

Raw logs are behind **View diagnostic log**, visually separated from decision controls.

### 09:10 — cross-vendor review

Because the authoring engine was Anthropic, Dabbler selects an approved Google or OpenAI verifier.

The reviewer receives:

- the task and approved plan;
- relevant contracts;
- the exact candidate diff;
- deterministic check results;
- cited source files by content hash;
- fixed review guidance and return schema.

The UI shows:

```text
Independent review — OpenAI gpt-5.6-sol
Elapsed: 01:12
```

The developer waits approximately **1–3 minutes**.

The result is:

```text
Independent review: PASS

Blocking findings: 0
Advisory findings: 1
  The route documentation could include an example response body.

Disclosure:
  11 content hashes sent to OpenAI
  No secrets detected
  Classification: internal-source-approved
```

An advisory does not block. The developer can accept it into later work or return the candidate.

### 09:13 — approve and land

The decision panel states:

```text
You are approving candidate 3c9f...
Checks: 486 passed
Independent review: pass
Advisories: 1
Base project digest: 91ab...
```

The developer clicks **Approve and land**.

Dabbler:

1. confirms the project still matches base digest `91ab...`;
2. copies the candidate through staging;
3. verifies the promoted digest is `3c9f...`;
4. commits with repository hooks disabled;
5. pushes the configured branch;
6. waits for required GitHub checks;
7. merges according to the repository’s configured branch policy;
8. appends the landing event.

This normally takes **10–60 seconds**, plus remote continuous-integration time.

The final screen is:

```text
Landed

Commit       7e4c2a1
Branch       main
GitHub checks passed
Record synced
Worker deleted
Total elapsed time: 14 minutes
Human attention: approximately 5 minutes
AI calls: 2
```

## 5. Three domains on one framework

### 5.1 Shared structure

Every project uses the same framework concepts and files:

```text
dabbler.yaml       domain, worker alias, commands, artifacts, policies
solution.yaml      components, contracts, dependencies, current stage
guidance\          project-specific authoring and review guidance
```

Every run uses the same process:

```text
request
→ bounded plan
→ typed AI result
→ deterministic checks
→ independent review
→ human decision
→ transactional promotion
```

The core does not import a .NET, Java, document, or music adapter. It:

- validates configuration;
- substitutes declared parameters such as `{selected_tests}`;
- invokes declared argument arrays in a worker;
- collects declared files and machine-readable results;
- folds generic events.

Domain tools live in worker images. Domain behavior lives in `dabbler.yaml` and guidance.

### 5.2 .NET service

`dabbler.yaml`:

```yaml
schema: 1
domain: dotnet-service
worker: worker-code

components:
  allowedKinds: [service, library, database, integration]

commands:
  restore:
    argv:
      - dotnet
      - restore
      - HealthReporting.sln
      - --locked-mode

  build:
    argv:
      - dotnet
      - build
      - HealthReporting.sln
      - --no-restore
      - --configuration
      - Release

  targeted:
    argv:
      - dotnet
      - test
      - "{selected_test_project}"
      - --no-build
      - --configuration
      - Release

  final:
    argv:
      - dotnet
      - test
      - HealthReporting.sln
      - --no-build
      - --configuration
      - Release
      - --logger
      - trx

artifacts:
  required:
    - "**/TestResults/*.trx"

testing:
  rules:
    - when: src/Policies/
      select:
        - tests/Policies.Tests/Policies.Tests.csproj
```

A normal cycle is:

```text
locked restore → Release build → targeted tests → complete solution tests
```

TRX output is parsed mechanically. The framework never asks a model whether tests passed.

### 5.3 Policy and document suite

`dabbler.yaml`:

```yaml
schema: 1
domain: policy-suite
worker: worker-docs

components:
  allowedKinds: [policy, definitions, procedure, appendix, integration]

commands:
  targeted:
    argv:
      - python
      - /tools/policycheck.py
      - --changed
      - "{changed_files}"

  final:
    argv:
      - python
      - /tools/policycheck.py
      - --root
      - docs

  style:
    argv:
      - vale
      - docs

  render:
    argv:
      - pandoc
      - docs/policy.md
      - --output
      - out/policy.pdf

artifacts:
  required:
    - out/policy.pdf
    - out/policycheck.json

checks:
  required:
    - internal-links
    - numbering
    - defined-terms
    - obligation-consistency
    - vale
```

There is no compiler gate. Deterministic evidence consists of:

- cross-reference validity;
- stable section numbering;
- defined terms used consistently;
- required sections present;
- style rules;
- successful PDF rendering.

Substantive correctness receives cross-vendor review. Taste and wording preferences are recorded as advisory findings unless a project rule makes them objective.

### 5.4 Music-notation project

`dabbler.yaml`:

```yaml
schema: 1
domain: music-notation
worker: worker-score

components:
  allowedKinds: [movement, part, motif, arrangement, integration]

commands:
  validate:
    argv:
      - xmllint
      - --noout
      - --schema
      - /schemas/musicxml.xsd
      - score/main.musicxml

  range:
    argv:
      - python
      - /tools/check_ranges.py
      - --score
      - score/main.musicxml
      - --instruments
      - score/instruments.yaml

  render:
    argv:
      - mscore
      - --headless
      - --export-to
      - out/
      - score/main.musicxml

  final:
    argv:
      - python
      - /tools/check_score_artifacts.py
      - --pdf
      - out/main.pdf
      - --midi
      - out/main.mid

artifacts:
  required:
    - out/main.pdf
    - out/main.mid

checks:
  required:
    - musicxml-schema
    - instrument-ranges
    - artifact-render
  advisory:
    - playability
    - voice-leading
    - engraving
```

The musician edits in MuseScore on Windows. Dabbler’s worker validates and renders independently. Instrument range and schema failures block; aesthetic findings do not.

### 5.5 Java parity

Java uses the same `worker-code` image and configuration shape:

```yaml
commands:
  restore:
    argv: [mvn, --batch-mode, dependency:go-offline]
  build:
    argv: [mvn, --batch-mode, --offline, package, -DskipTests]
  targeted:
    argv: [mvn, --batch-mode, --offline, "-Dtest={selected_tests}", test]
  final:
    argv: [mvn, --batch-mode, --offline, verify]
```

Gradle projects declare equivalent `gradlew` argument arrays. No framework code changes.

### 5.6 Domain-as-configuration decision

The architecture **honors** “a domain is configuration, never a code path.”

The current implementation does not yet honor it because `ai_router/solution.py` hard-codes `KINDS`, `STEPS`, and software-specific titles. The architecture replaces those constants with schema-validated declarations loaded by `solution.py::parse`.

A domain-specific checker may contain code, but it is an ordinary executable tool inside a worker image. It is not imported by the framework and cannot alter framework control flow except through its declared exit code and output schema.

## 6. Security, proportionate

### 6.1 Prior ranked risks addressed

| Prior rank | Threat | Treatment |
|---:|---|---|
| 1 | AI-authored code shares credentials, Git authority, journal access, and authoritative files | **Addressed.** Project commands run only in a disposable worker without host mounts, credentials, authoritative Git data, journal access, Docker authority, or execution-time network. |
| 2 | Prompt injection reaches authorization | **Addressed structurally, not eliminated.** Models cannot call approval endpoints or append human decisions. Approval binds a human session to the exact candidate digest and expected state. |
| 3 | Uncontrolled disclosure to three vendors | **Addressed.** Provider/account/model, classification, prompt hash, guidance hash, and submitted content hashes are recorded for every call. Project policy limits approved vendors. |
| 4 | AI-added dependencies execute third-party code | **Partly addressed.** Dependency changes require approval; restore receives no source or credentials; build and test are offline. |
| 5 | Journal and logs expose sensitive data | **Partly addressed.** Secret scanning precedes append, raw logs have limited retention, Git receives no raw logs, and sensitive payload redaction is an append-only overlay. |
| 6 | Framework supply chain and workspace-controlled interpreter | **Addressed.** The framework is a signed Windows installation outside the repository. Workspace Python settings and `.venv` files cannot select the control-plane executable. |
| 7 | Browser or webview doorway attacks | **Addressed proportionately.** Loopback-only binding, authenticated session, origin and host checks, strict content security policy, inert rendering, and artifact-bound writes. |
| 8 | Container escape or renderer compromise | **Reduced but accepted.** Workers run non-root with dropped capabilities, no host mounts, no socket, and no network during execution. Docker and Windows remain trusted infrastructure. |

### 6.2 Obvious vulnerabilities closed

- AI-written tests cannot read vendor keys from inherited environment variables.
- A repository cannot replace Dabbler’s privileged Python interpreter.
- A generated `.vscode/settings.json` cannot redirect control-plane execution.
- Project commands and shell strings cannot run beside Git credentials or the event store.
- Worker deletion actually rolls back workspace effects because the authoritative project is not mounted.
- A model cannot approve its own work through Model Context Protocol tools or an event identifier.
- A worker cannot push Git objects or alter Git history.
- AI output cannot write outside its approved path envelope.
- A stale candidate cannot overwrite newer local work.
- Raw model output is rendered as escaped text away from approval controls.
- Provider credentials cannot be redirected to a repository-selected base URL.
- Framework, UI, guidance, and worker skew blocks rather than silently proceeding.
- Simulated review results cannot satisfy live transitions.
- Dependency restore and execution no longer share credentials or network authority.

### 6.3 Vulnerabilities deliberately accepted

| Accepted vulnerability | Why it is accepted |
|---|---|
| A compromised Dabbler application has the Windows user’s project, Git, Docker, and vendor authority | Eliminating this would require a separate privileged service, operating-system account, or remote control plane. That would materially harm setup and clarity. Signed delivery and a small control plane are proportionate at this scale. |
| An administrator or malware already running as the Windows user can alter local records | Protecting against a fully compromised endpoint requires hardware-backed signing and remote immutable storage. Git history and protected branches provide ordinary accountability, not forensic-grade non-repudiation. |
| Approved vendors receive approved source and evidence | Multi-vendor generation and review are product requirements. The control is disclosure policy and provenance, not pretending disclosure can be prevented after authorization. |
| A malicious package from an approved registry may compromise the restore container or poison its output | Dependency trust cannot be eliminated without operating a curated artifact repository. Restore is source-minimized and credential-free; execution is offline. |
| Restore-mode network access is not enforced through a dedicated domain-filtering proxy | Adding and operating another proxy would create a visible service and a fifth operational subsystem. Restore receives only manifests and build configuration. |
| Prompt injection may still influence a human reviewer | The system can prevent model authority but cannot prevent persuasive text from affecting judgment. The UI labels provenance, separates evidence from controls, and requires a digest-bound decision. |
| A Docker or Windows Subsystem for Linux escape remains possible | Containers reduce ordinary mistakes and common attacks; they are not a defense against a fully weaponized kernel exploit. Keeping Docker and Windows patched is proportionate. |
| Raw diagnostic logs exist locally for 14 days | They are necessary to diagnose failed builds. They are access-controlled to the Windows user, excluded from Git, scanned for common secrets, and deleted automatically. |
| Windows-only .NET Framework, desktop graphical-interface builds, kernel drivers, and hardware integration may require external continuous integration | Supporting those inside Linux workers would require Windows worker virtual machines and substantially more setup. Such projects use Dabbler for authoring and review but treat approved external CI as the final deterministic gate. |

## 7. Self-scorecard

| Objective | Score | Justification |
|---|---:|---|
| 1. Easy to set up and upgrade | **3/5** | Installation and upgrade are simple commands, but Docker Desktop, Windows virtualization, authentication, and the first multi-gigabyte image pull remain real first-day costs. |
| 2. Performant for developers | **4/5** | Editors and repositories remain native on Windows, while builds use Linux-native volumes and persistent dependency caches; snapshot transfer and container startup still add seconds. |
| 3. Flexible across Java, .NET, documents, and music | **4/5** | All required domains use configuration and maintained images, but unusual toolchains and Windows-only builds require new image contents or external CI. |
| 4. Secure within reason | **4/5** | The dominant privilege-co-location risk is removed without creating a staff-facing security workflow; endpoint, vendor, dependency, and control-plane compromise remain accepted risks. |
| 5. Streamlined | **4/5** | Staff use four concepts, one page, and three routine commands, but Docker and image lifecycle still exist beneath the surface. |
| 6. Aligned | **5/5** | The framework owns control flow, AI returns typed artifacts, mechanical checks decide mechanical facts, and humans alone authorize promotion. |
| 7. Desirable | **4/5** | The Inbox, live progress, diffs, time estimates, editor links, and one-click landing improve the current disconnected-window experience without forcing one editor. |

The weakest objective is **easy setup and upgrade**. Raising it from 3 to 4 would require either running generated code directly on Windows, sacrificing security, or operating remote workers, adding recurring infrastructure, identity, cost, and availability concerns.

## 8. What you gave up

### Whole-environment Docker Compose

Rejected: putting the UI, framework, proxy, and worker into one staff-managed Compose environment.

Cost of rejection:

- Dabbler needs a signed Windows installer in addition to worker images.
- The complete environment cannot be moved to another machine by copying one Compose file.

Benefit:

- The browser and control plane start quickly.
- Windows project files remain fast in native editors.
- Staff never attach to a container.
- Vendor authentication and Git Credential Manager remain native Windows experiences.

The setup-and-upgrade benefit survives through the signed application bundle, release manifest, lazy digest-pinned images, and one `dabbler update` command.

### Separate API proxy container

Rejected from the prior recommendation because the control plane no longer executes project code.

Cost of rejection:

- A compromise of Dabbler itself reaches vendor credentials.
- The AI broker cannot be upgraded independently.

Benefit:

- No extra service, port, token protocol, container authentication state, or debugging path.
- Copilot authentication remains in a dedicated native application directory.
- Worker code still has neither secret bytes nor credential-equivalent call authority.

This is a deliberate reduction in defense in depth to improve objectives 1 and 5.

### Worktree-only authoritative execution

Rejected.

Cost of rejection:

- Docker Desktop is required.
- Each run pays snapshot-transfer and container-startup overhead.

Benefit:

- The first shipped execution path has the correct authority boundary.
- Staff do not normalize running generated checks beside credentials and records.
- Rollback covers files, processes, and execution state rather than only Git changes.

### VS Code as the required surface

Rejected.

Cost of rejection:

- The existing extension is no longer the primary delivery channel.
- Deep editor-specific commands and Marketplace auto-update are not central features.

Benefit:

- Visual Studio, Rider, IntelliJ, MuseScore, and document editors are first-class.
- The supervisor interface has one implementation.
- Workspace interpreter selection no longer controls the framework.
- The UI and framework ship atomically.

This drops an earlier direction because it fails objectives 3, 5, and 7 for a mixed-editor team.

### Approval through Model Context Protocol

Rejected.

Cost of rejection:

- A supervisor cannot approve entirely from Copilot or another chat interface.

Benefit:

- Prompt-injected project text cannot directly exercise human authority.
- Approval remains a clear, visible, digest-bound action.

Read-only status access can be added later, but it is not part of this architecture.

### Central team server

Rejected at one-to-three-person scale.

Cost of rejection:

- Shared status depends on GitHub connectivity.
- The UI is local rather than available from any device.
- Event synchronization is near-real-time rather than a permanent live socket.

Benefit:

- No server, database, backup plan, service account, certificate, or on-call responsibility.
- Each person can work offline and synchronize later.

### Artifact repository and strict egress proxy

Rejected.

Cost of rejection:

- Approved public package registries remain a supply-chain and restore-egress risk.
- Builds are not fully hermetic.

Benefit:

- No Nexus, Artifactory, proxy rules, certificates, or package-mirroring ceremony.
- Existing Maven, Gradle, and NuGet workflows remain recognizable.

This drops part of the prior security recommendation because its operational cost is disproportionate for one to three people.

### Universal worker image

Rejected.

Cost of rejection:

- Three image digests must be released and tested.

Benefit:

- Document users do not download Java and .NET toolchains.
- Music users receive MuseScore and LilyPond without inflating every code worker.
- Images can be patched and cached according to their actual use.

### Token streaming and browser terminal

Rejected.

Cost of rejection:

- Developers cannot watch token-by-token output or open an interactive shell from the supervisor page.

Benefit:

- Half-formed model text cannot masquerade as evidence.
- Approval controls remain separate from hostile terminal and model output.
- The staff experience remains supervision rather than terminal operation.

### Forensic-grade immutable records

Rejected.

Cost of rejection:

- A compromised Windows or GitHub account can alter history.
- The record is operational evidence, not legally non-repudiable evidence.

Benefit:

- No signing keys, remote ledger service, write quorum, or records administrator.
- The Git-synchronized append model remains understandable and serviceable by a small team.

## 9. Build order

### 1. Package the read-only control plane

Build:

- signed `dabbler.exe` and `winget` package;
- embedded browser UI at `127.0.0.1:7337`;
- current solution and progress projections;
- release manifest and `dabbler doctor`;
- immutable event-store interface;
- read-only Git synchronization.

Existing dependencies:

- reuse projections produced by `ai_router/progress.py`;
- move renderer assets out of the required VS Code delivery path;
- retain the extension only as a compatibility reader.

Useful result:

- one shared project view and Inbox replace disconnected status windows before mutation is enabled.

Reversibility:

- **Fully reversible.** It reads existing state and does not change execution.

### 2. Correct record authority before enabling writes

Build:

- legal transition enforcement in `ai_router/workflow.py::fold`;
- refusal of simulated evidence for live transitions;
- removal of `ai_router/verdict.py::is_doc_only_issue`;
- one sanctioned append path through `ai_router/journal.py::_Batch.append`;
- decision binding to actor, action, artifact digest, expected state, and release provenance.

Useful result:

- browser decisions can be trusted to mean the same thing as command-line decisions.

Reversibility:

- **Schema-compatible but not casually reversible.** New events remain readable; old invalid transitions are reported rather than rewritten.

### 3. Ship one complete transactional code-worker slice

Build:

- `worker-code`;
- snapshot transfer into a Docker-managed volume;
- restore and offline-execution modes;
- worker client behind `ai_router/checks.py::execute`;
- fail-closed `ai_router/checks.py::changed_paths`;
- output manifest validation;
- compare-and-swap promotion with rollback;
- .NET and Java representative projects.

Acceptance thresholds on Windows 11:

```text
Warm worker start and snapshot transfer: <= 5 seconds for 10,000 files
Warm build slowdown versus native WSL build: <= 20%
No writable host source mount
No worker network during build/test
No worker access to credentials, journal, or Docker socket
```

Useful result:

- one authoritative .NET or Java run can generate, check, approve, and land safely.

Reversibility:

- **Worker implementation is replaceable; the transaction contract is not.** Later workers must preserve snapshot, evidence, and promotion semantics.

### 4. Move all AI traffic into the native broker

Build:

- Windows Credential Manager backend;
- fixed provider endpoints;
- Copilot CLI in a dedicated working directory with custom repository instructions disabled;
- per-call disclosure records;
- typed file-operation returns;
- provider-independent cross-review;
- cost and usage projections.

Change:

- restrict `ai_router/transports/api.py::call_model` and provider callers to the installed control plane;
- remove vendor secret names and endpoint overrides from project-controlled configuration.

Useful result:

- three APIs and the Copilot seat operate through one visible workflow without exposing credentials to generated code.

Reversibility:

- **Transport implementations are replaceable.** Disclosure event fields and credential separation remain stable contracts.

### 5. Make domains data-driven

Build:

- domain schema;
- configuration-driven component kinds and stage labels;
- generic argument substitution;
- `worker-docs`;
- `worker-score`;
- built-in .NET, Java, policy, and music project templates.

Change:

- replace hard-coded domain assumptions in `ai_router/solution.py::parse`, `as_dict`, `KINDS`, `STEPS`, and `STEP_TITLES`.

Pilot in order:

1. .NET service;
2. Java service;
3. policy suite;
4. music-notation project.

Useful result:

- the domain-general claim is demonstrated by two software stacks and two non-software domains.

Reversibility:

- **Templates and image contents are reversible.** The generic domain schema should stabilize before external projects depend on it.

### 6. Finish update, recovery, and human pilot

Build:

- transactional `dabbler update`;
- skew repair;
- orphaned-worker cleanup;
- log retention and redaction;
- automatic cache limits;
- interrupted-promotion recovery;
- accessible UI polish and time estimates.

Pilot measurements:

```text
Fresh setup time
First successful run
Warm startup time
.NET and Java build slowdown
Time spent diagnosing a failed run
Number of host-execution bypasses
Number of screens or terminals opened
Supervisor time per completed task
```

Release only if:

```text
A new staff member completes setup without project-specific help.
A normal day requires no Docker command.
Representative warm builds meet the performance threshold.
No authoritative project command executes on the Windows control plane.
Policy and score pilots complete without a framework code change.
```

Reversibility:

- **Operational defaults are reversible.** Event meanings, transaction identity, and human-authority boundaries are permanent design commitments.