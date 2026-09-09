# Design consult, round 10: Sol on the wall moving from the disk to the permission

model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 6745 in / 13115 out
elapsed: 229.296s  truncated: false (stop_reason: end_turn)
---
# Q1 — The op set

## Soundness

The operator is right about **exclusive mediation**: if native file and command tools remain available, the framework is advisory rather than the wall. The verifier already demonstrates the useful half of this pattern: `packages/router/src/transports/copilot.ts` around line 919 limits Copilot to `view,grep,glob`, and then `--allow-all-tools` only approves that reduced universe.

Do not expose one opaque `framework.request(op,args)`. Use typed MCP tools:

1. `read_file`
2. `list_files`
3. `search_text`
4. `apply_patch` — create, update, rename and delete, with an expected-content hash
5. `run_task`
6. `request_scope_grant`

That is smaller than mirroring every native tool while preserving the shapes coding agents need. `request_scope_grant` replaces the current shell-dependent invocation of `dabbler session next --request-grant ...` in `packages/router/src/cli/session.ts` around line 111.

The framework, not the engine, should perform every mutation. This follows the existing verifier model in the header of `packages/router/src/agency.ts`: the verifier emits desired bytes and the framework decides whether they reach the filesystem.

The CLI’s native diff and edit-preview experience may be lost. **ASSUMPTION:** an MCP `apply_patch` result containing the accepted unified diff, rejected hunks and resulting file hash will be usable, but may not render like native Copilot edits. Probe **COPILOT-MCP-UX** should run an in-scope create, multi-hunk edit, rename and rejected stale edit under Copilot CLI 1.0.83 and record both model success and terminal rendering.

Whether a Copilot seat model remains effective with only MCP tools is explicitly not measured. Probe **COPILOT-MCP-ONLY** should launch Copilot with only `Dabbler(...)` tools, complete a small read–search–edit–test task, and compare completion, retries and tool errors with the current native-tool route.

## Risk

The failure I would bet on is not raw model incapability; it is an incomplete tool contract. A simplistic `edit(path,text)` will produce stale overwrites, poor error recovery and more token-heavy rereads. **ASSUMPTION:** models will adapt adequately if tools have familiar names, structured errors and patch semantics, subject to **COPILOT-MCP-ONLY**.

A second risk is falsely believing native tools were removed. Copilot’s help documents `--available-tools`, and MCP permission names such as `Server(tool)`, but whether `--available-tools` can select only an MCP server is not measured.

## Recommendation

Build the six typed tools above. Do not expose a general shell and do not expose an opaque multiplexed request.

Make `apply_patch` the only mutation primitive and return the exact resulting diff. Before this becomes the default, require **COPILOT-MCP-ONLY** to prove that `--available-tools='Dabbler(...)'` both removes native tools and leaves the model useful. Until that probe passes, the permission profile is not ready to replace the clone profile.

---

# Q2 — Copilot first

## Soundness

| Mechanism | Person-driven terminal | Headless drive | Wall or check | Unmeasured dependency |
|---|---|---|---|---|
| **(a) MCP-only `--available-tools`** | Best primary mechanism when launched by the extension’s `engineTerminalFor` in `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`. | Best primary mechanism; replace the current broad invocation in `packages/router/src/engines.ts` around line 218. | A wall against model tool use **only if** native tools are actually absent and every provided tool is framework-mediated. | **COPILOT-MCP-ONLY**: prove MCP-only selection, native-tool absence and useful operation. |
| **(b) `-C` plus `--add-dir`** | Useful defense in depth, but not the primary wall. The developer can still keep VS Code on the repository root. | Also only defense in depth. | A wall for native file tools within documented trusted directories; only a check for shell access until measured. | **COPILOT-SHELL-PATH**: from `-C modules/<slug>`, attempt `shell(cat ../sibling/...)`, `git show HEAD:sibling/...`, `git grep`, PowerShell `Get-Content`, and an out-of-scope write. |
| **(c) ACP-provided `fs` and `terminal`** | Poor fit for the person’s normal terminal because the framework must own and host the protocol session. | Plausible later, especially if persistent Copilot conversations are wanted. | Not currently a wall: `packages/router/src/acp.ts` line 450 advertises both filesystem capabilities and terminal as `false`, and `docs/acp-walkthrough.md` §5 measured reads that did not request permission. | **COPILOT-ACP-FS**: advertise `fs.readTextFile/writeTextFile: true`, force reads and writes, and verify every access reaches the client. A separate terminal-routing probe must verify command execution reaches the host. |
| **(d) Combination** | Use (a), with the framework MCP enforcing `moduleScope`; leave native path verification enabled as defense in depth. | Same. ACP is unnecessary for the first release. | The claimed wall comes from exclusive MCP mediation, not from layered checks. | Depends on **COPILOT-MCP-ONLY**; does not depend on unmeasured shell path verification. |

Copilot’s current headless drive is the opposite of the desired policy: `packages/router/src/engines.ts` around line 218 uses `--allow-all-tools --allow-all-paths --no-ask-user`. Those flags must not remain in the mediated profile.

The person-driven terminal is enforceable only for the CLI process launched by the extension. The extension currently chooses and launches that process through `runStartSession` and `engineTerminalFor` in `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`. A developer can always open another unrestricted terminal; the framework must not claim control over that process.

## Risk

The highest risk is shipping (b) because it is easy and calling it mediation. Copilot’s path verification is on by default according to `--allow-all-paths`, but shell-path coverage is explicitly not measured. It also cannot express access to individual root build files without broadening directory trust through `--add-dir`.

The next risk is using ACP merely because `packages/router/src/acp.ts` already exists. Its current capability declaration at line 450 declines filesystem and terminal hosting, while its measured permission stream misses reads (`docs/acp-walkthrough.md` §5).

## Recommendation

For both Copilot modes:

- Start Copilot in the regular checkout.
- Provide only the Dabbler MCP tools through `--additional-mcp-config`.
- Select only those tools with `--available-tools`.
- Do not provide native shell, file, URL or edit tools.
- Enforce paths and operations inside the MCP server through `moduleScope` and `inScope` from `packages/router/src/agency.ts` around lines 296 and 377.

For the extension-launched terminal, this costs the developer one automatic version probe on first use of an unknown CLI version; otherwise the workflow remains the Start Session flow in `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`. For headless drive, it is transparent.

Do not use ACP in the first Copilot implementation. Keep `packages/router/src/acp.ts` as a later transport option.

---

# Q3 — Claude Code

## Soundness

Claude has a stronger documented launch surface for this design:

```text
--restricted
--tools ""
--mcp-config <generated-config>
--strict-mcp-config
--settings <generated-settings>
```

`--restricted` removes built-in command and WebFetch tools unless named, confines file tools to working directories, ignores user/project/local settings and refuses `bypassPermissions`. `--strict-mcp-config` prevents unrelated MCP servers from being loaded.

However, whether `--tools ""` leaves configured MCP tools available is not measured. Probe **CLAUDE-MCP-ONLY** must launch Claude Code 2.1.263 with the exact flag combination above, prove that Dabbler tools remain available, and attempt native `Read`, `Edit`, `Bash`, PowerShell and WebFetch operations.

Path-globbed `permissions.deny` and PreToolUse hooks are vendor-documented but not measured here. Probe **CLAUDE-DENY-HOOKS** should attempt direct sibling reads, edits, `git show`, shell reads and writes while recording both hook input and final filesystem effects. These should be defense in depth, not the primary wall.

The framework already writes Claude settings in `packages/router/src/checkout.ts` around line 303 and installs a Stop hook through `packages/router/src/bootstrap/index.ts` around line 320. The Stop decision remains governed by `StopGateDecision` in `packages/router/src/session.ts` around line 2522.

The common product rule should be:

> All model-visible filesystem mutations, source reads and task executions go through the same typed Dabbler tools and the same policy evaluator.

The engine-specific implementation must remain separate:

- Copilot: `--available-tools` plus `--additional-mcp-config`.
- Claude: `--restricted --tools "" --mcp-config --strict-mcp-config`, with generated settings and hooks only as defense in depth.

## Risk

The likely failure is assuming documented Claude controls compose exactly as expected. In particular, `--restricted`, `--tools ""`, MCP loading and Stop/PreToolUse hooks may interact differently from their independent help descriptions. That is why **CLAUDE-MCP-ONLY** must test the exact production argv rather than individual flags.

A second risk is duplicating policy in Claude JSON rules and in the MCP server. That creates two authorities and engine-specific drift.

## Recommendation

Use the MCP policy evaluator as the sole authorization authority. Generate only enough Claude configuration to remove native tools, load the one Dabbler server and preserve the existing Stop hook.

Do not make path-glob denies or PreToolUse hooks correctness dependencies until **CLAUDE-DENY-HOOKS** passes. Even after it passes, treat them as redundant detection and better denial messaging, not as a second policy implementation.

---

# Q4 — The shell

## Soundness

A shell denylist is not a sound wall. Blocking `cat`, `Get-Content`, `git show`, `git grep` and `rm -rf` still leaves equivalent interpreters, scripts, build hooks and language runtimes. The brief itself identifies the shell as the hole the clone previously closed.

No shell plus “wait until the engine reports, then run checks” is sounder but too weak for the normal edit–build–test loop. The lifecycle already reserves step checks, verification, commit, push and close for the framework (`AGENTS.md`, and item 7), but that does not give the engine rapid build feedback between instructions.

A typed `run_task` is the middle ground:

- task identifier, not command text;
- fixed executable and working directory;
- framework-chosen arguments;
- optional validated selectors such as project, module or test filter;
- captured output, exit status and duration;
- no shell expansion.

Tasks come from the proposed `dabbler.yaml` declarations: module-scoped `dotnet build`, `dotnet test`, Maven build/test and the existing ecosystem pack operation. The package boundary remains `PackageReference`, not `ProjectReference`, according to `docs/design/module-checkout-poc.md`.

A named build is still not an OS sandbox. Build and test processes can execute repository code and may read files or environment variables available to their process.

## Risk

The failure I would bet on is making `run_task` too rigid. Teams need targeted projects, test filters and sometimes restore/build variations. **ASSUMPTION:** a task plus validated selector model will cover the common .NET and Maven loop; validate it in the .NET and Maven walkthroughs that follow sessions 113–120.

The security risk is treating a named build as harmless. A build target or test can execute code, inspect the checkout and use inherited environment variables.

## Recommendation

Provide `run_task(taskId, selectors)` and no arbitrary shell.

Allow only declared build, test, restore/pack and read-only status/diff tasks. Do not pass raw argument strings. Run module-specific projects rather than a root solution build when the session is module-scoped.

Strip `DABBLER_*` and other framework credentials from every spawned task’s environment. **ASSUMPTION:** additional customer-specific environment filtering will be needed, but its source is not defined in the brief.

Classify the guarantee honestly: the framework guarantees the model cannot choose an arbitrary command; it does not guarantee what trusted build or test code does after an approved task starts.

---

# Q5 — Rules and the escape hatch

## Soundness

The authoritative rule set should be derived in memory from:

- module paths and transitive contracts from `moduleScope` in `packages/router/src/agency.ts` around line 296;
- membership through `inScope` around line 377;
- module relationships, `dependsOn` and `deployables:` from `docs/modules.yaml` and `packages/router/src/modules.ts`;
- the session’s named plan files;
- package operations through `packModule` in `packages/router/src/packages.ts`;
- fixed non-contestable secret and destructive-operation rules;
- active grants from `grants.jsonl`, managed through `packages/router/src/exposure.ts`.

Do not serialize a second editable rules language. The generated CLI configuration should only remove native capabilities and connect the MCP server. Record a policy hash and the inputs used to derive it in the session run record.

The precise contestable flow should be:

1. `read_file` or `apply_patch` is denied by `inScope`.
2. The tool result explains the denied path, current module, package seam and available contract path.
3. The model calls `request_scope_grant(slug, reason)`.
4. The framework appends a requested row to `grants.jsonl`.
5. `raiseOwed` creates a `CLASS_VALUE_TRADEOFF` decision in `packages/router/src/exposure.ts` around line 386.
6. The human answers through `dabbler owed answer` or `dabbler.answerOwedDecision`.
7. A grant or denial row is appended.
8. An approved grant widens the in-memory policy only for that session.
9. Every later operation records the grant decision that authorized it.
10. Revocation stops new operations but does not rewrite history.

This preserves the existing owed-decision classes in `packages/router/src/owedDecisions.ts` lines 71–74.

Non-contestable model denials should include:

- secret paths such as the proposed `.env`, key files and `local-overrides.yaml`;
- destructive repository operations;
- arbitrary shell or interpreter execution;
- force push and destructive reset;
- access to framework credentials.

The model may explain why it needs something, but those capabilities should not be granted through the session tool. A human can perform the operation independently and provide a sanitized result.

The framework must never autonomously approve scope expansion, external consequences, accountability sign-off or verification reduction. Those map directly to the owed-decision classes in `packages/router/src/owedDecisions.ts` lines 71–74.

## Risk

The orchestrator’s proposed single-module rule is wrong. “Everything in the repository, secrets and destruction denied” is a new restriction, while the governing requirement says a one-module solution must keep working exactly as today. `packages/router/src/checkout.ts` and `packages/router/src/exposure.ts` already refuse single-module shapes, and that boundary should remain.

Another risk is allowing repeated grant requests to become approval pressure. The append-only `grants.jsonl` history should preserve denied requests, and an unchanged request should return the existing denial rather than create unlimited owed decisions.

## Recommendation

Enable mediated permissions by default only for multi-module sessions. For a one-module shape, take the current path with no probe, MCP mediation, generated permission file or new prompt. Offer the security profile separately as an explicit opt-in; do not smuggle it into the module change.

Keep policy in the router process. Store only the derived policy hash, request audit and grant decisions in the session record. Scope exceptions are human decisions; secrets, arbitrary execution and destructive operations are not grantable model capabilities.

---

# Q6 — The probe and the lock

## Soundness

The proposed three-negative specimen is insufficient. A passing probe must prove both refusal and usability.

Use a temporary regular checkout specimen containing:

- module A source;
- module B source;
- a dependency contract;
- an in-scope editable file;
- an out-of-scope editable file;
- a fake secret;
- Git history containing sibling source;
- one allowed deterministic task.

For each engine and mode, test:

1. in-scope MCP read succeeds;
2. in-scope MCP patch succeeds;
3. allowed `run_task` succeeds;
4. sibling MCP read is denied and logged;
5. sibling MCP write is denied and leaves no change;
6. native file tools are absent or refused;
7. native shell is absent or refused;
8. `git show`, `git grep` and direct shell file reads are impossible;
9. the fake secret is denied;
10. an MCP denial can create, approve and consume a test grant;
11. a denied operation remains denied after a rejected grant.

Copilot requires **COPILOT-MCP-ONLY** in both interactive and headless forms. Claude requires **CLAUDE-MCP-ONLY** with its exact production flags. Do not rely on Copilot shell-path verification, ACP filesystem routing, Claude path globs or PreToolUse hooks unless their named probes also pass.

Record the attestation in the proposed `permissions.lock`, keyed by engine, exact version, launch mode, operating-system family, generated-config hash and MCP tool-schema hash. **ASSUMPTION:** operating-system family belongs in the key because command availability and process behavior differ; this is not measured in the repository. `packages/router/copilot-catalog.lock` is the existing precedent for a versioned seat capability lock.

Cadence:

- once in release CI for every supported tuple;
- once locally when a tuple is absent from the lock;
- again whenever tool schemas, launch flags or generated settings change;
- not on every known session start.

## Risk

A model-driven probe can pass accidentally because the model chose not to attempt the forbidden operation. The probe must verify tool inventory and server logs, not merely accept a textual refusal.

A warning-only failure would make the default wall knowingly unverifiable. That is worse than stating that the mode is unprotected.

## Recommendation

If the tuple is unknown, run the deterministic probe before the first multi-module session. If it fails, refuse the mediated module session and explain the failed case. Offer the opt-in clone profile as the protected fallback.

A one-module session bypasses this machinery, preserving the requirement represented by the existing single-module refusals in `packages/router/src/checkout.ts` and `packages/router/src/exposure.ts`.

A full “session at the beginning” adds only a human-observed usability exercise: whether the model plans and edits effectively with the reduced tool set. **ASSUMPTION:** that is useful as a release qualification, but it is not stronger security evidence than a deterministic probe and should not consume developer time at session start.

---

# Q7 — The exposure record and the close gate

## Soundness

The record must distinguish observation coverage by engine and mode.

| Mode | Honest measurement |
|---|---|
| MCP-only Copilot or Claude | Every MCP request received; allow/deny result; policy hash; affected paths; resulting diff/hash; task identifier; grant decision. |
| Copilot ACP with current capabilities | Permission requests the seat emits. `docs/acp-walkthrough.md` §5 proves edits request permission and reads do not, so read exposure is unobserved. |
| Native path-verification mode | Framework-mediated operations plus any CLI refusal the CLI reports; not all native reads or shell activity. |
| Unrestricted or independently launched CLI | No model tool-use coverage. Record `unobserved`; do not infer zero exposure. |
| Clone profile | Retain the existing bytes-on-disk evidence from `packages/router/src/exposure.ts`. |

Even in MCP-only mode, the framework cannot record a native-tool attempt that the CLI never exposed as a callable tool. It can claim that all **available framework tool calls** were mediated after the launch probe passes, not that it observed every model intention.

The current exposure manifest in `packages/router/src/exposure.ts` records sibling implementation bytes, grants and files changed outside scope at start and close. In a regular checkout, sibling bytes are expected to exist, so the zero-byte measure cannot remain the default gate.

`exposure_within_ceiling` in `packages/router/src/land.ts` should become profile-specific:

- **mediated profile:** no successful out-of-scope operation without an active human grant; no changed path outside scope or approved grant; no unaccounted task execution; attested launch tuple;
- **clone profile:** retain the existing sibling-byte ceiling and grant semantics;
- **unobserved mode:** cannot pass a protected module close as though exposure were measured.

Denied attempts should be recorded but should not fail close merely because they were attempted. They are evidence that the wall worked. Repeated or suspicious attempts may be highlighted for review.

## Risk

The likely error is relabelling “no logged request” as “no read.” That repeats the ACP mistake already measured in `docs/acp-walkthrough.md` §5, where reads produced no permission request.

The second error is dropping post-operation filesystem checks because tool mediation exists. Bugs in the MCP server or task runner could still change an unintended path. The existing changed-files component in `packages/router/src/exposure.ts` should remain.

## Recommendation

Replace the default bytes ceiling with an **authorized-effects ceiling**, while retaining changed-path verification:

- every successful effect has a request row;
- every out-of-base-scope effect cites a granted row in `grants.jsonl`;
- final changed paths are independently compared with `moduleScope`;
- the record states `complete`, `partial` or `unobserved` coverage.

If coverage is `unobserved`, print exactly that in the close record and refuse the protected close. Never print zero attempts or zero exposure.

---

# Q8 — Security beyond blackboxing

## Soundness

This design can protect against a cooperative or wandering model by:

- withholding native file and command tools;
- denying secret paths in the MCP policy;
- refusing destructive Git operations;
- omitting network tools;
- using Copilot’s documented `--deny-url` as defense in depth;
- using Claude’s `--restricted` removal of WebFetch;
- auditing mediated requests and effects.

It does **not** protect the machine from:

- a hostile human user;
- a second unrestricted terminal;
- a compromised CLI or MCP server;
- operating-system-level access;
- malicious repository build or test code;
- an approved process reading inherited environment variables;
- process-level network egress.

Copilot’s `--deny-url` governs the CLI’s URL tool surface; it is not a network sandbox for spawned processes. Claude’s `--restricted` removes built-in command and WebFetch tools, but it is likewise not an OS sandbox.

“No arbitrary shell” is necessary but not sufficient for `DABBLER_*` protection. The proposed `run_task` still spawns build and test processes, and those processes can read inherited variables. Therefore the runner must remove framework secrets from child environments.

## Risk

The failure I would bet on is product language drifting from “model tool-use control” to “secure sandbox.” The regular checkout deliberately leaves sibling bytes on disk, and this design controls the engine’s provided capabilities rather than the operating system.

A second risk is claiming “audit of every tool call” in ACP, native or independently launched modes. `docs/acp-walkthrough.md` §5 already disproves that for Copilot reads.

## Recommendation

Claim:

> Dabbler restricts and audits the tool operations made available to a framework-launched AI session, applies module scope and human-approved exceptions, and blocks specified dangerous operations.

Also claim coverage explicitly per session: `complete`, `partial` or `unobserved`.

Never claim:

- filesystem isolation;
- containment of hostile code;
- machine or user isolation;
- complete process/network mediation;
- complete observation outside the MCP-only attested mode;
- protection equivalent to a container, VM or the sparse clone.

Sanitize task environments, provide no arbitrary shell and describe named tasks as trusted executions rather than sandboxed ones.

---

# 9 — The developer’s day

## Open

The team lead opens the normal repository folder in VS Code and sees the whole solution. Start Session adds the missing module choice from session 123 gap A (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`), performs an automatic probe only for an unknown Copilot version, and opens the Copilot terminal beside the framework terminal.

## Work

Copilot reads, searches and edits through clearly rendered Dabbler tools; accepted changes appear immediately in the same checkout the developer has open. If it asks for sibling implementation, the denial points to the package and `modules/<slug>/contract/`; a justified exception appears as an owed decision in Work Explorer through `dabbler.answerOwedDecision`.

## Test

Copilot invokes named `dotnet build` and `dotnet test` tasks rather than constructing shell commands. The framework runs the declared module target, streams normal output, and records the task; the developer can still use their own terminal normally.

## Land

The existing lifecycle runs the step checks, verification rounds, run of record, commit, push and close as described in item 7 and `AGENTS.md`. `exposure_within_ceiling` checks authorized effects, independent changed paths, grants and launch attestation rather than demanding that sibling bytes be absent from the regular checkout.

## Review

The reviewer sees ordinary Git changes in the one checkout plus a compact exposure record: denied scope requests, approved grants, successful effects, task runs and observation coverage. There is no stale second folder, eliminating session 123 gap C for the default profile (`docs/sessions/session-plan.md`).

---

# 10 — The session list

## Clone-block disposition

| Piece | Disposition |
|---|---|
| `packages/router/src/checkout.ts` sparse-clone machinery | **Demote to opt-in hardened-lite.** Keep sessions 104, 105 and 120’s walkthrough coverage. Remove it from the default module start path. |
| `checkout.ts` `writeEngineSettings` around line 303 | **Refactor and keep where useful.** Claude launch/config generation moves to the regular-checkout adapter; clone-specific path settings remain only in hardened-lite. |
| `packages/router/src/exposure.ts` bytes-on-disk measure | **Demote to clone profile only.** It is not meaningful as a zero target in a regular checkout. |
| `exposure_within_ceiling` in `packages/router/src/land.ts` | **Keep the gate name; make semantics profile-specific.** Mediated mode checks authorized effects and changed paths; clone mode keeps the byte ceiling. |
| `module open` | **Demote to clone profile.** Regular mode stays in the repository root. |
| `grant` / `revoke` | **Keep and adapt.** They widen or narrow the in-memory mediated policy and remain append-only in `grants.jsonl`. |
| clone `preflight` | **Demote to clone profile.** Replace its default-role counterpart with the engine permission probe. |
| Extension **Open Module** | **Demote to clone profile.** It is unnecessary in the one-folder default. |
| Extension **Widen for Debugging** | **Delete from the regular profile; keep for clone profile.** Regular mode uses the existing owed-decision grant flow without overlay/reload ceremony. |
| Session 123 gap A | **Fix.** Add module selection and pass `--module` through `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`; the brief states `--module` currently appears nowhere under `tools/dabbler-ai-orchestration/src`. |
| Session 123 gap C | **Eliminated in the default profile.** The engine and developer use the same checkout. The opt-in clone profile still needs an explicit synchronization/status solution. |
| Package seam | **Keep as is.** `packModule` in `packages/router/src/packages.ts`, contracts under `modules/<slug>/contract/`, and `docs/modules.yaml` remain the black box. |
| `moduleScope` / `inScope` | **Keep as the policy core.** `packages/router/src/agency.ts` around lines 296 and 377. |
| Stop hook and lifecycle checks | **Keep as is.** `packages/router/src/bootstrap/index.ts` around line 320 and `packages/router/src/session.ts` around line 2522. |

## New sessions

Each session below has no more than three work steps. New-file locations are deliberately unspecified because the brief supplies no repository path for the proposed MCP server or permission lock.

1. **124 — Profiles and invariants**  
   Steps: define `regular-mediated` versus `hardened-clone`; preserve the single-module bypass in `packages/router/src/checkout.ts` and `packages/router/src/exposure.ts`; add profile-selection tests.

2. **124 → 125 — Policy evaluator**  
   Steps: extract reusable decisions around `moduleScope`/`inScope` in `packages/router/src/agency.ts`; add secret/destructive classifications; return structured allow/deny explanations.

3. **125 → 126 — MCP read surface**  
   Steps: add the `dabbler mcp` stdio entry point; implement `read_file`, `list_files`, `search_text`; test in-scope and sibling denials.

4. **125 → 127 — MCP mutation surface**  
   Steps: implement hashed `apply_patch`; make framework writes atomic; test create/update/rename/delete and stale-patch refusal.

5. **125 → 128 — Named task runner**  
   Steps: derive fixed tasks from `dabbler.yaml`; implement validated selectors and fixed working directories; sanitize child environments and record results.

6. **126 + 127 → 129 — Grant and audit integration**  
   Steps: add `request_scope_grant`; connect `raiseOwed` and `grants.jsonl` through `packages/router/src/exposure.ts`; record each request, decision and effect.

7. **126 + 127 + 128 → 130 — Copilot permission probe and lock**  
   Steps: build the specimen and positive/negative cases; run interactive/headless **COPILOT-MCP-ONLY**; record supported tuples in `permissions.lock`, following the precedent of `packages/router/copilot-catalog.lock`.

8. **130 → 131 — Copilot person-driven terminal**  
   Steps: change `engineTerminalFor` in `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`; pass MCP-only flags; verify one-folder interactive operation.

9. **130 → 132 — Copilot headless drive**  
   Steps: replace `--allow-all-tools --allow-all-paths` in `packages/router/src/engines.ts` around line 218; provide only Dabbler tools; preserve step output and cancellation.

10. **129 + 131 + 132 → 133 — Exposure and close gate**  
    Steps: add coverage classification and authorized-effects records in `packages/router/src/exposure.ts`; retain independent changed-path checks; update `exposure_within_ceiling` in `packages/router/src/land.ts`.

11. **131 + 133 → 134 — Extension module and adjudication UX**  
    Steps: close session 123 gap A in `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`; show denial/grant context through `dabbler.answerOwedDecision`; hide clone-only Open/Widen commands in the regular profile.

12. **133 + 134 → 135 — Copilot .NET walkthrough**  
    Steps: run open/work/test/land/review on a multi-module .NET specimen; verify package-only sibling consumption from `docs/design/module-checkout-poc.md`; fix only Copilot-path defects.

13. **135 → 136 — Claude permission probe**  
    Steps: implement **CLAUDE-MCP-ONLY** for the exact production flags; separately run **CLAUDE-DENY-HOOKS**; lock supported Claude tuples.

14. **136 → 137 — Claude interactive and headless adapters**  
    Steps: replace `--dangerously-skip-permissions` in `packages/router/src/engines.ts` around line 160 for mediated mode; generate strict MCP/settings inputs; preserve the Stop hook from `packages/router/src/bootstrap/index.ts`.

15. **133 + 137 → 138 — Hardened-clone compatibility and gap C**  
    Steps: keep sessions 104, 105 and 120’s clone walkthroughs passing; make clone grants/bytes use profile-specific gates; add explicit full-checkout synchronization or an unmistakable stale-checkout status for session 123 gap C.

16. **135 + 137 + 138 → 139 — Maven and single-module regression**  
    Steps: repeat the Maven package-consumption walk proven through sessions 113–120; prove one-module behavior takes the unchanged route; update operator documentation for guarantees and coverage labels.

---

# 11 — The disagreement

The orchestrator’s sketch is wrong in five places:

1. **“Rules are derived, never written” conflicts with “generated into an untracked file.”** The authorization policy should remain in memory; generated files should contain only engine capability configuration and a connection to the MCP server.
2. **The proposed single-module restrictions violate the governing requirement.** `packages/router/src/checkout.ts` and `packages/router/src/exposure.ts` already exclude single-module shapes; secrets/destruction mediation must be a separate opt-in there.
3. **Three refusal probes are insufficient.** They do not prove that allowed work succeeds, that native tools are absent, or that both interactive and headless argv behave identically.
4. **Replacing exposure entirely with attempts is unsound.** Attempts not routed through the framework are invisible, as Copilot reads already demonstrate in `docs/acp-walkthrough.md` §5. Keep independent changed-path verification from `packages/router/src/exposure.ts`.
5. **A destructive-command denylist is not a shell boundary.** The operator’s “deny all except request” direction requires removing arbitrary shell, not trying to enumerate dangerous spellings.

The operator’s formulation is right where the sketch waters it down: the framework must be the **exclusive capability path**. Native path checks, hooks and permission prompts are not equivalent if native tools or shell remain callable. The typed MCP set is not a retreat from `framework.request(op,args)`; it is the protocol-safe, model-usable implementation of it.

**ASSUMPTION:** the other reviewer is most likely to overrate Claude hooks or Copilot path verification because they are lighter than an MCP mediation layer. That would be wrong unless **COPILOT-SHELL-PATH**, **COPILOT-MCP-ONLY**, **CLAUDE-MCP-ONLY** and **CLAUDE-DENY-HOOKS** establish the exact production behavior.

The opposite error would be insisting that only the sparse clone can be called a guarantee. The clone remains the stronger disk-level boundary, as sessions 100–120 built and walked, but the chosen product can still make a narrower guarantee: **all tools made available to a framework-launched model are mediated and policy-checked**. It must stop there and never rebrand that guarantee as machine isolation.
