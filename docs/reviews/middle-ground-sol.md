# Middle-ground review

## 1. Verdict

Ship it with changes: preserve the two VS Code sections, keep the current Editable Components experience, and add Referenced Components as a bounded extension feature. Before release, pin every reference to a full commit, use deterministic .NET/Java extraction rather than AI summaries, enforce the black box within Dabbler through temporary clones and explicit context allowlists, version the manifest and derived surfaces, and repair the credential and record-authority defects. The smallest credible implementation is approximately **18 engineering days**. Within the accepted no-sandbox boundary, v1 can prevent inherited environment credentials from reaching check processes, but it cannot claim that code running as the Windows user is unable to read credentials stored elsewhere in that user’s profile. Costs below overlap and are not additive between sections.

## 2. Where it breaks first

### 1. Public API extraction selects the wrong artifacts

**Issue →** A repository is not necessarily one library. A .NET solution may contain several target frameworks, generators, test utilities, and copied dependency DLLs. A Java repository may produce several JARs, shaded JARs, or Gradle subprojects. Automatically scanning `bin`, `target`, or `build` will expose dependencies and tools as though they were the referenced component.

**Location →** No extractor exists yet. Do not add this data to `ProjectionComponent` in `tools/dabbler-ai-orchestration/src/providers/solutionTreeModel.ts`; `orderedComponents()` and `childrenOf()` currently model editable solution components and contracts.

**Failure scenario →** In week two, a multi-project .NET solution contributes thirty DLLs, including test frameworks and generated proxies. The displayed “public API” exceeds the model context limit and includes APIs the caller does not own. The equivalent Java failure is a fat JAR whose dependency classes are reported as the library API.

**Fix →** Require one selected `.csproj` or one Maven/Gradle module per reference, plus explicit output artifact globs. Fail on ambiguous or oversized output rather than silently including or truncating it. Cap v1 at 10,000 members or 2 MB of canonical surface text and ask the user to narrow the selector. **Cost: 4.5 days**, including both language extractors.

### 2. The black-box boundary is not a filesystem boundary

**Issue →** Read-only files remain readable. A sibling repository, workspace folder, or persistent clone can be traversed by a tool-capable agent. Git also does not prevent either reading or uncommitted edits.

**Location →** `tools/dabbler-ai-orchestration/package.json` currently permits a workspace-selected Python executable through `dabblerSessionSets.pythonPath`; project operations therefore run with the Windows user’s filesystem reach. Nothing in `solutionTreeModel.ts::childrenOf()` or `workExplorerTreeModel.ts::childrenOf()` creates an access boundary.

**Failure scenario →** A prompt asks the agent to diagnose a referenced API mismatch. The agent runs `Get-ChildItem .. -Recurse`, reads the sibling repository, and edits it directly instead of proposing a pull request.

**Fix →** Store only a remote URL and commit in the manifest. Resolve a selected local repository to its origin and HEAD, then clone the pinned commit into a short temporary directory, extract the surface, delete the clone, and only then call the model. The prompt builder receives the committed surface artifact, never an external path. A repair operation creates a new temporary clone only after an explicit operator action and destroys it after producing the PR. This is mechanical for Dabbler-mediated engines; generic Copilot tools running as the user remain outside that guarantee. **Cost: 1.5 days.**

### 3. The record still accepts events that do not prove what they claim

**Issue →** Scripted reviews can satisfy `reviewed`, approvals can occur without valid prior state, and steps can be entered in arbitrary order.

**Location →** `ai_router/workflow.py::_run_review()` records `simulated`; `workflow.py::fold()` never reads it and applies events without transition validation. `workflow.py::_main()` appends approval and entry events without checking current authority. `ai_router/verdict.py::is_doc_only_issue()` lets the verifier make its own finding non-blocking.

**Failure scenario →** A scripted fixture review marks a real component reviewed, the operator approves it, and an arbitrary `entered` event moves directly to a later step. The tree looks legitimate because `solutionTreeModel.ts::descriptorFor()` renders the resulting projection rather than revalidating it.

**Fix →** Add one `validate_transition()` function used both by `append()` and `fold()`. Simulated reviews remain visible but do not set `reviewed`; approvals require a live review and a current approval step; forward entry is sequential; returns may move only backward; event steps must match current state. Remove the documentation self-exemption from blocking classification. **Cost: 2 days.**

### 4. A credential blacklist either leaks new credentials or breaks builds

**Issue →** Removing only the three current vendor variables fails as soon as GitHub or Azure credentials are added. Conversely, passing an empty environment breaks `dotnet`, Java, temporary directories, and Windows process startup.

**Location →** `ai_router/checks.py::_spawn()` calls `subprocess.Popen()` without `env=` in both branches.

**Failure scenario →** Cross-repository PR support introduces an Azure token. The API keys are removed explicitly, but the new token is inherited by an AI-authored test. A later “fix” passes `{}` and Java fails because `PATH`, `SystemRoot`, or `JAVA_HOME` is absent.

**Fix →** Add `check_environment()` and pass its result from both `_spawn()` branches. Construct an allowlist containing only required Windows and toolchain variables, redirect `TEMP` and `TMP`, and explicitly exclude vendor keys, GitHub/Azure tokens, proxy credentials, `SSH_AUTH_SOCK`, and tool option variables such as `_JAVA_OPTIONS`. Add sentinel-based Windows tests. Do not describe this as same-user filesystem isolation. **Cost: 1 day.**

### 5. Document references become enormous or stale

**Issue →** “Documents in the repository” includes generated sites, vendored documentation, binaries, archives, and thousands of files. Model-generated summaries introduce another independently stale artifact.

**Location →** The current tree has no reference-document model. `workExplorerTreeModel.ts::stepNodes()` displays projected activity rows only and is not suitable for enumerating repository documents.

**Failure scenario →** A documentation repository contains `node_modules`, rendered HTML, PDFs, and copied standards. The extension tries to summarize all of it, refreshes for minutes, and later displays summaries produced from an older revision.

**Fix →** Limit v1 to explicitly selected UTF-8 Markdown, reStructuredText, and plain-text globs. Generate the table of contents mechanically from headings and use the title plus first prose paragraph as the summary. Key every entry by source commit and blob hash. Fail on unsupported encodings and excessive file counts rather than silently omitting files. **Cost: 1 day.**

### 6. Cross-repository PR creation fails on normal enterprise permissions

**Issue →** Creating a branch, pushing it, and creating a PR are three different permissions. GitHub and Azure DevOps also use different authentication and REST models. Fork-only contributors cannot use the shortest direct-branch flow.

**Location →** No provider implementation exists. `tools/dabbler-ai-orchestration/package.json` contributes no reference repair or provider-authentication command.

**Failure scenario →** The user can clone an Azure repository and create PRs in the browser but cannot push a branch to the owning repository. Dabbler completes the repair and then fails at the last step. Another user can push through Git Credential Manager but has no Azure PAT for the PR REST call.

**Fix →** Support direct branches only in v1 and test branch-push permission before generation. Use Git Credential Manager for clone/push, VS Code’s GitHub authentication session for GitHub PR REST calls, and an Azure DevOps PAT stored in `ExtensionContext.secrets` with Code Read & Write for Azure PR REST calls. Disable repository hooks for Dabbler-owned Git operations. Return an actionable “fork workflow not supported in v1” error before work starts. **Cost: 3.5 days.**

### 7. Windows paths and identities collide

**Issue →** URLs and display names are unsuitable as filenames or tree identities. Windows paths are case-insensitive, repository names can collide, and deep temporary clones can exceed tool-specific path limits.

**Location →** `workExplorerTreeModel.ts::setDescriptor()` relies on globally unique names for IDs. That invariant must not be copied to references. `solutionTreeModel.ts::descriptorFor()` similarly uses component names in IDs.

**Failure scenario →** Two organizations both expose `common`, or one reference is renamed. Expansion state transfers to the wrong row, generated surface files collide, or a Gradle checkout fails under a deeply nested temporary path.

**Fix →** Give each reference a generated immutable ID independent of display name, use it for tree IDs and artifact filenames, and clone under a short path such as `%LOCALAPPDATA%\Dabbler\r\<8-character-id>`. **Cost: 0.5 day.**

## 3. One-way doors

| One-way door | Location | Small change that keeps it open | Cost |
|---|---|---|---:|
| **An unversioned manifest becomes a permanent configuration format.** | Proposed `dabbler-references.json`. Do not place it under `.dabbler`; `ai_router/checks.py::snapshot_worktree_tree()` unconditionally removes `MACHINE_DIRNAME` from snapshots. | Add `schemaVersion`, immutable reference IDs, `access: "referenced"`, provider-neutral remote coordinates, full commit SHA, selectors, and a pointer plus digest for the derived surface. Never store credentials or machine-local paths. | **0.75 day** |
| **Mixing declarations and generated surfaces makes later migration and merge handling expensive.** | Proposed manifest and stored extraction output. | Keep declarations in `dabbler-references.json` and generated data in `docs/dabbler/reference-surfaces/<reference-id>.json`. Give the surface its own schema version, extractor version, source commit, input hashes, and content digest. | **0.75 day** |
| **Calling the extracted surface a complete contract creates dependencies on omitted behavior.** | Proposed referenced-component renderer; compare the stronger editable contract concept in `solutionTreeModel.ts::contractTarget()`. | Label it **Extracted callable surface**, not an editable contract. Preserve a `surfaceKind` field so behavioral contracts can be attached later without reinterpreting old data. | **0.25 day** |
| **Encoding Referenced versus Editable as component kinds contaminates the existing projection model.** | `solutionTreeModel.ts::ProjectionComponent.kind`, `orderedComponents()`, and `childrenOf()`. | Leave `ProjectionComponent` and `workExplorerTreeModel.ts` unchanged. Add a separate reference model/provider and map `access` to the two contributed views. | **0.5 day** |
| **AI-generated document summaries become stored truth.** | Proposed document surface artifact. | Use deterministic v1 summaries. If AI summaries are added later, store them as claims with model, prompt version, source blob hash, and generation time; never overwrite mechanical title/TOC data. | **0.5 day** |
| **A persistent “unlocked” flag turns one repair permission into permanent source access.** | Proposed repair command. | Make permission operation-scoped and memory-resident. Store only the resulting patch and PR metadata, not a reusable source-access grant or persistent external checkout. | **0.5 day** |
| **A modified external checkout becomes the only record of a proposed repair.** | Proposed repair workflow. | Store a text patch with diagnosed commit, PR base commit, changed paths, and patch digest before deleting the clone. Reject binary changes in v1. | **0.5 day** |
| **Using `activity-log.json` as status authority reverses its demotion.** | `workExplorerTreeModel.ts::stepNodes()`, `sessionDescriptor()`, and `stepDescriptor()`. | Keep it display-only: missing or malformed activity yields no child steps, and no gate or transition reads it. Add a regression test asserting that display steps cannot satisfy workflow evidence. | **0.25 day** |

A compatible manifest shape is:

```json
{
  "schemaVersion": 1,
  "references": {
    "ref_01K4Y8Q6H6M7": {
      "displayName": "billing-client",
      "access": "referenced",
      "kind": "dotnet",
      "remote": {
        "provider": "github",
        "url": "https://github.com/example/billing-client.git"
      },
      "revision": {
        "commit": "9f43d8498cb91bbd42108f33f5f731ae6efb170a",
        "label": "v2.4.1"
      },
      "selection": {
        "project": "src/Billing.Client/Billing.Client.csproj",
        "artifacts": [
          "src/Billing.Client/bin/Release/*/Billing.Client.dll"
        ]
      },
      "surface": {
        "path": "docs/dabbler/reference-surfaces/ref_01K4Y8Q6H6M7.json",
        "sha256": "..."
      }
    }
  }
}
```

## 4. The seven open questions

### 1. How is the public API extracted, per language?

**Answer →** Mechanically, from compiled artifacts; never from an AI summary.

- **.NET:** Build the selected pinned `.csproj`, then run a bundled helper based on `System.Reflection.Metadata` against only the selected DLLs. Do not use runtime reflection or execute assembly code. Emit public and protected types and members, inheritance, interfaces, overloads, generic constraints, parameter modifiers, constants, default values, nullability metadata, and public custom attributes. Keep separate entries for each target framework.
- **Java:** Build the selected pinned Maven or Gradle module, enumerate only selected project JARs, and run the pinned JDK’s `javap -protected -s -constants` for their classes. Record module exports, public/protected signatures, generic signatures, exceptions, annotations, and constants. Do not scan dependency JARs.
- Store canonical output with extractor/tool versions, artifact hashes, source commit, and selected project/module. If regeneration disagrees with the committed digest, show the reference as stale or invalid; do not silently replace it.

**Location →** Add a separate reference-surface service rather than extending `solutionTreeModel.ts::ProjectionComponent`. The resulting surface is rendered by the new Referenced Components provider.

**Cost → 4.5 days.**

### 2. What pins a referenced component?

**Answer →** A full 40-character commit SHA is authoritative. A tag or released version may be stored only as a display label. A branch name is never authoritative.

When upstream advances, nothing changes automatically. **Refresh Reference** resolves the new commit, regenerates the surface, shows the API/document delta, and updates the manifest only after confirmation. A local repository selection is accepted only if it has a remote and a committed HEAD; dirty working-tree content is ignored.

**Location →** Proposed `dabbler-references.json` and reference refresh command.

**Cost → 0.5 day.**

### 3. Is the black-box rule mechanically enforced or prompt-enforced?

**Answer →** It is mechanically enforced for Dabbler-mediated model calls and explicitly not claimed for arbitrary same-user agents.

Normal reference processing uses an ephemeral clone, extracts the committed surface, deletes the clone, and supplies only the surface artifact to the model. The external repository is never added as a VS Code workspace folder and its path never appears in the prompt. Repair creates a fresh clone only after the operator invokes **Prepare Repair**, and that permission expires when the operation ends.

This is stronger than prompt enforcement inside Dabbler, but Windows provides no way for this extension to prevent an unrelated Copilot terminal tool running as the same user from reading a separately existing sibling repository.

**Location →** New reference context builder; existing workspace execution exposure is visible in `tools/dabbler-ai-orchestration/package.json` under `dabblerSessionSets.pythonPath`.

**Cost → 1.5 days.**

### 4. What is the smallest cross-repository PR implementation for Azure DevOps and GitHub?

**Answer →** One provider-neutral repair flow with two small REST adapters:

1. Confirm direct branch-push permission before generation.
2. Clone the current target base after operator permission.
3. Generate and validate a text-only patch.
4. Record the diagnosed revision, base revision, patch digest, and changed paths.
5. Push a generated branch through Git Credential Manager with hooks disabled.
6. Create the PR through the provider REST API.
7. Delete the clone and retain the PR URL and patch metadata.

GitHub uses a VS Code GitHub authentication session with repository scope. Azure DevOps uses a PAT with Code Read & Write stored in `ExtensionContext.secrets`. Neither token is placed in Python’s environment or check-process environments. V1 supports `github.com` and `dev.azure.com`, direct branches, and existing repositories; forks and self-hosted servers land soon after.

**Location →** New commands contributed from `tools/dabbler-ai-orchestration/package.json`; the credential exclusion is enforced in `ai_router/checks.py::_spawn()`.

**Cost → 3.5 days.**

### 5. What generates document summaries, when are they refreshed, and what prevents drift?

**Answer →** V1 uses no model-generated summary. For each selected text document:

- the title is the first heading or filename;
- the summary is the first non-heading prose paragraph, length-capped;
- the expanded table of contents comes from headings;
- the record includes relative path, source commit, and blob hash.

The surface refreshes only when the pinned commit changes or the extractor version changes. A surface whose stored blob hashes do not match regeneration is invalid, not merely “possibly stale.” V1 supports UTF-8 Markdown, reStructuredText, and plain text; PDF, DOCX, generated HTML, and binary formats are excluded.

**Location →** New document surface extractor and Referenced Components virtual-document renderer, not `workExplorerTreeModel.ts::stepNodes()`.

**Cost → 1 day.**

### 6. Which parts are one-way doors?

**Answer →** Neither the JSON manifest nor the two-section tree is inherently a one-way door if the manifest is versioned, references have immutable IDs and explicit access mode, generated surfaces are separate versioned artifacts, and the two views are adapters over separate models. The expensive doors are unversioned identity, storing machine paths, treating extracted signatures or summaries as authoritative contracts, persisting source-access permission, and retaining a modified external checkout as the only repair artifact.

`tools/dabbler-ai-orchestration/package.json` already contributes two views. Use those view boundaries rather than adding reference variants to `solutionTreeModel.ts::ProjectionComponent` or changing `workExplorerTreeModel.ts`.

**Cost → 3.25 days across the safeguards listed in section 3; this overlaps the v1 implementation.**

### 7. Is displaying `activity-log.json` consistent with its diagnostic status?

**Answer →** Yes, provided it remains display-only. `workExplorerTreeModel.ts::stepNodes()` maps projected steps to rows; `sessionDescriptor()` makes a session a leaf when no steps exist; `stepDescriptor()` only formats labels, timestamps, and tooltips. None of those functions grants authority.

Keep missing activity as an empty child list, mark the rows as diagnostic progress, and add a test proving that activity rows cannot set `reviewed`, approve work, or satisfy a gate. Authority remains in the workflow event record.

**Cost → 0.25 day.**

## 5. The smallest v1

| Scope | Implementation | Cost |
|---|---|---:|
| **Credential containment** | Pass an allowlisted environment from both branches of `ai_router/checks.py::_spawn()`; exclude all vendor and provider credential variables; add Windows sentinel tests. | **1 day** |
| **Record authority** | Add transition validation to `workflow.py::append()` and `fold()`; refuse simulated evidence for live review; remove verifier-selected doc exemption; make `checks.py::changed_paths()` fail closed when `changed_paths_between()` returns `None`. | **2 days** |
| **Reference data format** | Add versioned `dabbler-references.json` plus committed, versioned, digest-bound surface artifacts outside `.dabbler`. | **1 day** |
| **Two extension sections** | Preserve `workExplorerTreeModel.ts` as Editable Components. Bind a separate provider to Referenced Components, default it collapsed, and render selected surfaces in read-only virtual documents. Preserve the existing icon and two-inline-action conventions. | **1.5 days** |
| **Pinned reference manager** | Add by remote URL or clean local repository, resolve full SHA, use short temporary clones, enforce immutable IDs, and refresh explicitly. | **1.5 days** |
| **.NET surface** | Selected-project build plus metadata-only extraction for explicit project DLLs and target frameworks. | **2.5 days** |
| **Java surface** | Selected-module Maven/Gradle build plus `javap` extraction for explicit project JARs. | **2 days** |
| **Document surface** | Selected UTF-8 text globs, mechanical summaries and TOCs, blob hashes, and bounded output. | **1 day** |
| **GitHub and Azure PRs** | Operation-scoped repair permission, text patch artifact, direct branch push through GCM, provider REST adapters, secret storage, and actionable permission failures. | **3.5 days** |
| **Windows acceptance suite** | Test .NET multi-targeting, Maven and Gradle modules, document limits, spaces/case collisions, private reference cloning, GitHub/Azure mocked APIs, extension packaging, and refresh behavior. | **2 days** |
| **Total** | One experienced engineer; approximately four working weeks, or roughly two weeks with extraction and provider work parallelized. | **18 days** |

### Explicitly outside v1

| Exclusion | Scope decision | V1 cost |
|---|---|---:|
| PDF, DOCX, binary, generated-site, and image summaries | Show unsupported format and require narrower document selectors. | **0 days** |
| GitHub or Azure fork workflows | Refuse before generation when direct branch push is unavailable. | **0 days** |
| Self-hosted GitHub Enterprise or Azure DevOps Server | Preserve provider-neutral manifest fields, but support only hosted endpoints. | **0 days** |
| Background following of branches or tags | References change only through explicit refresh. | **0 days** |
| Persistent external checkouts | Use temporary clones and committed surface/patch artifacts. | **0 days** |
| A claim of same-user filesystem isolation | State only the inherited-environment guarantee in v1. | **0 days** |

## 6. Prior `[must]` items re-ranked

### v1

| Prior `[must]` item | Re-ranked treatment | Cost |
|---|---|---:|
| Project checks must not inherit vendor credentials. | Implement directly in `ai_router/checks.py::_spawn()` with an allowlisted environment. | **1 day** |
| Simulated review must not satisfy live authority. | Enforce in `workflow.py::fold()` and transition validation. | **0.5 day** |
| Legal workflow order must be enforced. | Validate replay and append through one transition function in `workflow.py`. | **1 day** |
| A verifier must not exempt its own finding. | Remove the `is_doc_only_issue()` blocking exemption from `verdict.py::is_blocking_issue()` and `classify_blocking()`. | **0.25 day** |
| Changed-path measurement must fail closed. | Make `checks.py::changed_paths()` raise/refuse instead of returning `()` on Git failure. | **0.25 day** |
| Existing independent-review facts must remain projection-backed. | Add regression coverage showing the TypeScript trees render Python authority and do not recreate it. | **0.5 day** |

### soon after

| Prior `[must]` item | Re-ranked treatment | Cost |
|---|---|---:|
| Package Python with the extension instead of selecting workspace Python. | Freeze and bundle the framework, then retire `dabblerSessionSets.pythonPath` from `package.json`. | **3 days** |
| Store vendor credentials outside environment variables. | Move vendor keys to VS Code SecretStorage or Windows Credential Manager while preserving the current extension surface. | **2 days** |
| Bind approvals to exact artifacts and expected state. | Add candidate/surface digest and expected transition state to approval events. | **3 days** |
| Route all record writes through one append interface with provenance. | Consolidate `workflow.py::append()` and journal writes, recording framework and guidance versions. | **3 days** |
| Validate AI file operations against a path envelope. | Introduce typed file changes and reject absolute paths, traversal, links, and undeclared files before applying them. | **3 days** |
| Make domain labels and component kinds configuration-driven. | Replace hard-coded assumptions in `ai_router/solution.py::parse()` and `as_dict()` after the shortcut is stable. | **3 days** |
| Release components should move together. | Add an extension release manifest covering TypeScript assets, bundled Python, guidance, and extractor versions. | **2 days** |

### drop

| Prior `[must]` item | Re-ranked treatment | Cost |
|---|---|---:|
| Native browser control plane and loopback web application. | Drop from this system; the VS Code extension is the accepted surface. | **0 days** |
| Signed `winget` Windows application as the primary installer. | Drop; Marketplace installation and update remain primary. | **0 days** |
| Docker/WSL disposable workers as the first execution path. | Drop from the shortcut implementation; the operator explicitly deferred the sandbox. | **0 days** |
| Transactional snapshot promotion into the working tree. | Drop; v1 works directly in the current working tree. | **0 days** |
| Git-synchronized immutable event branch and shared Inbox. | Drop; retain the existing project files and projections. | **0 days** |
| Browser cookies, CSRF tokens, action tokens, and localhost origin controls. | Drop because there is no browser control plane. | **0 days** |
| Maintained code, document, and score worker images. | Drop because v1 runs declared host tools and does not ship workers. | **0 days** |
| Docker cache, image-digest, restore-network, and execution-network policy. | Drop because those controls belong to the worker architecture, not this extension implementation. | **0 days** |
| Compare-and-swap promotion and rollback staging. | Drop from v1 rather than partially simulating transactionality in the working tree. | **0 days** |

## 7. Build order for v1

### Day 1 — close the known authority and credential holes

**Cost: 1 day.**

1. Add a test around `ai_router/checks.py::_spawn()` that places sentinel vendor, GitHub, and Azure credentials in the parent environment, runs a child command, and proves they are absent while `PATH`, `SystemRoot`, `TEMP`, `DOTNET_ROOT`, and `JAVA_HOME` remain usable.
2. Add failing tests proving:
   - `ai_router/verdict.py::classify_blocking()` blocks a major Markdown finding;
   - `ai_router/workflow.py::fold()` does not accept a simulated review as live evidence;
   - an approval without a valid review is refused;
   - a non-sequential entry is refused;
   - `ai_router/checks.py::changed_paths()` refuses a `None` measurement.
3. Implement the `_spawn()` environment fix and the smallest verdict fix before adding reference credentials or executing external builds.

### Days 2–3 — make record replay authoritative

**Cost: 2 days.**

1. Add `workflow.py::validate_transition()`.
2. Call it from both `append()` and `fold()`.
3. Preserve simulated reviews in history while withholding `reviewed`.
4. Validate replay of existing fixtures and surface invalid historical events explicitly rather than rewriting them.

### Days 4–5 — establish reversible storage and the two views

**Cost: 2 days.**

1. Define and test the manifest and surface schemas.
2. Add immutable reference IDs and full-SHA pinning.
3. Add a separate referenced-components tree model.
4. Update `tools/dabbler-ai-orchestration/package.json` so Referenced Components defaults collapsed and Editable Components remains the existing AI Work Explorer.
5. Leave `workExplorerTreeModel.ts` and `solutionTreeModel.ts::ProjectionComponent` semantics unchanged.

### Days 6–10 — make one pinned code reference work end to end

**Cost: 5 days.**

1. Implement short-path temporary cloning and explicit artifact selection.
2. Implement .NET metadata extraction.
3. Implement Java JAR/`javap` extraction.
4. Commit canonical surface artifacts with provenance and digests.
5. Render each surface in a read-only VS Code virtual document.
6. Test multi-target .NET, Maven, Gradle, overloads, generics, attributes, module exports, and output limits.

### Day 11 — add bounded document references

**Cost: 1 day.**

1. Implement selected text globs, UTF-8 validation, heading TOCs, deterministic summaries, and blob hashes.
2. Add file-count and output-size limits.
3. Verify that no activity-log or document-summary data is used as workflow evidence.

### Days 12–15 — add proposed repairs and both PR providers

**Cost: 4 days.**

1. Add operation-scoped **Prepare Repair**.
2. Record diagnosed commit, PR base commit, changed paths, and patch digest.
3. Reject binary patches.
4. Implement direct branch push with preflight permission checks and disabled hooks.
5. Add GitHub and Azure DevOps REST adapters and secret handling.
6. Delete temporary clones after success or failure and retain the patch metadata and PR URL.

### Days 16–18 — Windows acceptance and packaging

**Cost: 3 days.**

1. Run real Windows .NET, Maven, Gradle, and document fixtures.
2. Test path length, case collisions, duplicate display names, dirty local repositories, unavailable commits, stale surface digests, private cloning, authentication cancellation, and branch-policy failures.
3. Verify the two-inline-action rule and stable tree IDs.
4. Package the extension and perform one clean-machine flow: add reference, inspect surface, refresh pin, prepare repair, and open one GitHub and one Azure DevOps PR.