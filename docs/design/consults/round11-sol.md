# Design consult, round 11: Sol on the wall as a hook -- reliable, unburdening, no more than it needs to be

model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 4472 in / 15531 out
elapsed: 283.588s  truncated: false (stop_reason: end_turn)
---
## Q1 — The hook’s own failure policy

**Soundness.** Yes: the framework hook should return `deny` only after successfully loading a complete session policy, parsing the tool call, evaluating a known rule, and recording the decision. Copilot CLI 1.0.83 denies on hook crash/non-zero exit but allows on its 30-second timeout, so an uncaught error would create exactly the impasse the operator rejects. The policy can be derived once from `docs/modules.yaml` using `moduleScope`/`inScope` (`packages/router/src/agency.ts` ~296/~377), as the existing Stop hook already demonstrates reading session state from a CLI-owned hook (`packages/router/src/session.ts` ~2522).

**Risk.** A nominally “fail-open” `dabbler session hook-tool` is still fail-closed if `dabbler` is absent from `PATH`, because Copilot sees command-not-found/non-zero rather than the hook’s intended fallback. The other likely failure is doing YAML parsing, dependency traversal, Git work, or waiting for a log lock on every call until PowerShell startup plus hook work approaches the 30-second timeout.

**Recommendation.** Install a tiny tracked PowerShell shim that captures all `dabbler` output and emits `{"permissionDecision":"allow"}` with exit code zero if `dabbler` is missing, malformed, or non-zero. Per call, `hook-tool` should only read one compact policy snapshot, normalize one path or command, evaluate it, make one best-effort JSONL append without waiting for a lock, and emit JSON; no YAML, Git, dependency traversal, or subprocesses. A **`windows-hook-latency` probe** should measure cold and warm PowerShell calls on the operator’s Windows machine; do not claim the timeout can “never” decide without that measurement.

## Q2 — What is worth denying at all

**Soundness.** The existing scope already identifies module `codeRoots`, allowed contracts, root build files, shared files, and session files while excluding sibling `codeRoots` (`packages/router/src/agency.ts` ~296/~377). The close already refuses changed paths outside that scope (`packages/router/src/land.ts` 231–249), so rejecting a direct out-of-scope write early is consistent with the eventual result. The manifest and framework state need a separate protected-path override because the current scope includes the sessions directory (`packages/router/src/agency.ts` ~296), while the accepted process says those files are off limits to AI.

**Risk.** The largest risk is calling this a hard wall while allowing arbitrary shell: `bash` or `powershell` can read or modify files without using `view`, `edit`, or `write`. A generic “secrets” rule is also likely to produce either false confidence or a growing blacklist because no repository-wide secret-path declaration is identified in the brief.

**Recommendation.** Rank and handle the cases as follows:

1. **Framework state and `docs/modules.yaml`: hard deny read and write.** High integrity value and no intended session use.
2. **Writes outside `moduleScope`: hard policy deny, with no self-grant.** They cannot pass the existing changed-path gate anyway (`packages/router/src/land.ts` 231–249).
3. **Sibling implementation reads: one-denial soft wall, then automatic self-grant.**
4. **Destructive shell commands: deny only a tiny, explicit safety list.** Treat it as a guardrail, not containment.
5. **Secrets: protect only explicitly configured or already-known framework credential paths.** Do not build a secret classifier or claim general secret protection.

Thus the simple policy is “hard-deny direct out-of-scope writes and protected state; soften sibling reads.” It is not a hard filesystem boundary once arbitrary shell is allowed.

## Q3 — The soft read and the escape hatch

**Soundness.** A natural-language “stated reason” is not present in Copilot’s `preToolUse` input, which contains only `sessionId`, `cwd`, `toolName`, and `toolArgs`. The repository already has an append-only grant record in `packages/router/src/exposure.ts`, while its current human path goes through `raiseOwed` and `CLASS_VALUE_TRADEOFF` (~386), `dabbler session next --request-grant` (`packages/router/src/cli/session.ts` ~111), and **Answer Owed Decision**. That human path is unnecessary for a deliberately soft read wall.

**Risk.** Automatically allowing the second identical call cannot honestly record the AI’s reason because the hook cannot see the surrounding assistant prose. Reusing `--request-grant` unchanged would also create the blocking owed decision the operator explicitly does not want.

**Recommendation.** On the first sibling read, deny with a reason of this form:

> `<path>` is implementation owned by module `<slug>`. Use contract `<actual contract path>` first. If implementation access is still needed, run `dabbler session self-grant-read --path "<repo-relative path>" --reason "<why the contract is insufficient>"`, then retry. Do not reject the work step for this denial.

The new verb should append a session-limited self-grant to `grants.jsonl` with framework run ID, CLI `sessionId`, module slug, canonical path, reason, timestamp, and actor `engine`; it must not raise an owed decision. **ASSUMPTION:** `docs/modules.yaml` exposes a package display name; if it does not, report the module slug and actual contract path rather than inventing a package name.

No hook-time permission choice should reach a human. Out-of-scope writes remain denied without an approval escape; if that makes the planned step impossible, the engine reports a decomposition failure and the existing “three refusals of one step stop the session” rule applies (`AGENTS.md`). Hook denials themselves must not be counted as step refusals.

## Q4 — The shell

**Soundness.** Option **(i)** is the only option that reliably accommodates normal .NET and Maven iteration. Exact command allowlisting would have to anticipate variants such as `dotnet test --filter`, `mvn -pl`, wrappers, test selectors, environment setup, and diagnostics, while `dabbler.yaml` `testing.suites[].command` declares only framework checks and the run of record—not every development command. Option (iii) also prevents the engine from running the pull-loop verbs that currently execute through the CLI’s shell (`dabbler session next` and `session report`).

**Risk.** Option (i) gives up shell-level blackboxing: shell commands can read siblings, rewrite files, invoke another interpreter, or access the network. A destructive-command blacklist is easy to evade through aliases, reordered flags, scripts, or nested shells, and command logs can themselves contain credentials.

**Recommendation.** Choose **(i)**: allow shell, record bounded command text and outcome, and deny only unmistakable destructive forms such as force-push, repository-wide hard reset/clean, checkout/restore of the entire worktree, and recursive deletion of the repository root. Do not parse arbitrary shell or claim coverage of shell-mediated reads; only obvious sibling path operands should use Q3’s soft-read flow. **ASSUMPTION:** each CLI’s `toolArgs` exposes a stable command-string field and stable path fields; settle this with a **`copilot-toolArgs-shape` probe** and a **`claude-toolArgs-shape` probe** covering read, write, glob/grep, Bash, and PowerShell calls.

Cost by option:

- **(i):** lowest impasse risk, lowest shell blackboxing.
- **(ii):** substantial impasse risk and only apparent blackboxing, because allowed suite commands can themselves execute arbitrary scripts.
- **(iii):** maximal operational impasse for the existing shell-driven workflow.

## Q5 — Every CLI or only the session’s CLI

**Soundness.** Scoping every chat in the checkout is not acceptable. The 2026-09-06 Stop-hook incident already showed that a repository-scoped hook can turn an observing Claude session into a second caller of `next`; the hook receives the CLI’s `sessionId`, not the framework run ID. The extension can control launched arguments through `engineTerminalFor` and `createTerminal` (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts` ~328–335), but that does not solve a developer launching `copilot` manually.

**Risk.** A launch-only environment marker excludes bare-terminal sessions, while binding every `sessionStart` to whichever framework run is active recreates the observer-session bug. It is also not measured whether the hook subprocess inherits a marker set only on the CLI process.

**Recommendation.** Bind atomically on the first framework canary or `dabbler session next` call: the `preToolUse` event supplies the CLI `sessionId`, and the hook associates that ID with the one active run before allowing or denying the command. Thereafter, enforce module policy only for that bound ID; other chats are allowed and recorded as unbound. A second CLI trying to claim an already-bound run gets one clear denial rather than being allowed to become another caller. Reuse the same binding in `hook-stop` (`packages/router/src/session.ts` ~2522).

This relies on recognizing the command in `toolArgs`; the **`copilot-toolArgs-shape` probe** from Q4 settles that requirement. Do not rely on `sessionStart` containing a CLI version—the brief marks its payload as not measured; the settling probe is **`copilot-sessionStart-payload`**.

## Q6 — Bypass, coverage, and close

**Soundness.** Copilot’s `--allow-all-tools`, `--allow-all`, `--yolo`, `COPILOT_ALLOW_ALL`, and `/allow-all` bypass hook decisions, although hook and `postToolUse` events can still provide evidence. Claude’s `--bare` skips hooks, and the current headless drivers already use bypassing flags: Copilot uses `-p … --allow-all-tools --allow-all-paths --no-ask-user` (`packages/router/src/engines.ts` ~218), while Claude uses `--dangerously-skip-permissions` (~160). The durable correctness gate remains changed paths outside scope (`packages/router/src/land.ts` 231–249).

**Risk.** Refusing close solely because coverage was partial converts an advisory mechanism into an infrastructure impasse. Conversely, labeling a session “protected” merely because some hook events exist would mislead reviewers about bypasses, shell access, hook absence, and fail-open errors.

**Recommendation.** Coverage never blocks close. Record:

- engine and CLI version, or `unknown`;
- framework run ID and bound CLI `sessionId`;
- module slugs and policy-snapshot hash;
- hook/canary timestamps;
- coverage state: `observed`, `partial`, or `unobserved`;
- exact evidence for degradation: hook error, policy missing, canary executed, denied call followed by `postToolUse`, bypass flag observed, or event gaps;
- counts and details of denials, self-grants, protected-path attempts, and out-of-scope write attempts;
- shell-command audit status;
- final changed-path gate result from `judgeExposure` (`packages/router/src/land.ts` 231–249).

The framework must never claim isolation, complete read coverage, secret protection, or that denied operations did not execute. It may claim only the decisions and events it actually observed.

## Q7 — Attestation without a probe

**Soundness.** A `sessionStart` record proves only that one hook event ran; it does not prove that `preToolUse` is active or that decisions are honoured. It also cannot presently supply “CLI version X” because the Copilot `sessionStart` payload is explicitly not measured. An eleven-case, version-keyed `permissions.lock` was appropriate for a guarantee, but this design explicitly prefers continued operation and an honest record.

**Risk.** Option (a) would overstate coverage. Option (c) adds maintenance and version churn while still being bypassable by `--allow-all-tools`; refusing on probe failure would directly violate the new priority order.

**Recommendation.** Build option **(b)** only: one harmless canary call at multi-module session start.

- If the hook denies it and records the event, coverage becomes `observed`.
- If the canary executable runs, it records `partial` or `unobserved`, and the session continues.
- If a denied canary is followed by `postToolUse`, record `partial`.

The canary should also claim the CLI `sessionId` for Q5. Drop `permissions.lock` and the eleven-case live probe; retain ordinary unit tests for the policy evaluator. Use **`copilot-sessionStart-payload`** only if CLI-version capture from that event is later desired.

## Q8 — Copilot’s headless drive

**Soundness.** It is not measured whether `copilot -p` loads repository hooks, nor whether enumerating every tool through `--allow-tool` eliminates all prompts. The current headless invocation explicitly uses `--allow-all-tools`, `--allow-all-paths`, and `--no-ask-user` (`packages/router/src/engines.ts` ~218), and Copilot 1.0.83 documents `--allow-all-tools` as required for non-interactive mode.

**Risk.** Removing `--allow-all-tools` based on inference could strand a headless run at an unseen permission prompt. Keeping it means hook denials are bypassed, but that is less damaging under the operator’s priorities than hanging the run.

**Recommendation.** Do not mediate Copilot headless execution in the first release. Preserve the current functional flags, run the canary where possible, and record headless coverage as `partial` or `unobserved`; never return `ask` from the framework hook. On uncertainty, return `allow` with degraded coverage; on an understood rule, return `deny`.

Before changing the flags, run a **`copilot-p-explicit-tools` probe** that:

1. launches `copilot -p` with explicit `--allow-tool` entries but without `--allow-all-tools`;
2. invokes every built-in tool needed by the driver;
3. verifies hooks fire;
4. verifies a denied canary remains denied;
5. verifies the process never prompts or waits.

That probe also settles the separately unmeasured question of whether hooks fire under `-p`.

## Q9 — The bare terminal

**Soundness.** For a manual `copilot` launch, `.github/hooks/NAME.json` must be tracked; bootstrap already commits its own scaffold through `commitOwnScaffold` (`packages/router/src/cli/bootstrap.ts`), so the proposed hook can follow that precedent. `dabbler` must be on `PATH`, the CLI must be launched where repository hooks are discovered, and the developer must not use `--allow-all`, `--yolo`, `/allow-all`, or `COPILOT_ALLOW_ALL`. Whether `.github/hooks` is discovered from a nested working directory is explicitly not measured.

**Risk.** Without the fallback shim from Q1, missing `dabbler` causes every Copilot tool call to be denied. If the hook is not discovered, the opposite happens: work proceeds unrestricted while the developer may believe the wall is active. An unavailable `--model` also prevents the CLI session from starting; **ASSUMPTION:** the framework or team selects a model that must be enabled for that developer’s Copilot seat.

**Recommendation.** Support the bare path only from the repository root initially. The canary binds the manual CLI session and exposes missing/bypassed hooks as degraded coverage rather than stopping work. Run a **`copilot-subdir-hook-discovery` probe** before promising that nested-directory launches work, and a **`copilot-seat-model` probe** for every model the framework advertises.

One-line developer instruction:

> From the repository root, run `copilot` without any allow-all flag, then say “start the next session”; if coverage is reported partial or unobserved, continue normally but treat the module wall as off.

A one-module repository must skip the canary and mediation entirely, preserving the existing single-module refusal behavior in `checkout.ts` and `exposure.ts`.

## Q10 — What not to build

**Soundness.** The hook reuses the existing CLI-hook precedent (`packages/router/src/bootstrap/index.ts` ~320; `packages/router/src/session.ts` ~2522), the existing scope evaluator (`packages/router/src/agency.ts` ~296/~377), and the existing changed-path gate (`packages/router/src/land.ts` 231–249). That removes the need for a second tool protocol or a guarantee-oriented permissions stack.

**Risk.** The likely design failure is retaining every round 8–10 mechanism “just in case,” producing multiple overlapping enforcement layers whose disagreements create prompts, false failures, and debugging work.

**Recommendation.**

| Mechanism | Decision | Concrete treatment |
|---|---:|---|
| MCP server | **Drop** | The native `preToolUse` hooks cover built-in and MCP tools; do not add another transport. |
| Six typed tools | **Drop** | Preserve the CLIs’ native tools and normal .NET/Maven shell loop. |
| `permissions.lock` | **Drop** | No version-keyed guarantee is being made. |
| Eleven-case live probe | **Drop** | Replace it with the one-call canary from Q7. |
| OS sandbox | **Demote to opt-in** | Copilot’s sandbox is experimental, built-in edits are only best-effort, and it inherits most shell environment; it is not part of the default wall. |
| Sibling exposure-bytes measurement | **Drop** | A regular checkout already contains sibling bytes. Remove the sibling-bytes clause from `judgeExposure`, retaining the changed-path clause (`packages/router/src/land.ts` 231–249). |
| `module open` | **Drop** | The explicit self-grant-read command is the only read escape hatch needed. |
| Grants as blocking owed decisions | **Demote to opt-in governance** | Default read grants are engine self-grants recorded in `grants.jsonl`; do not call `raiseOwed` (`packages/router/src/exposure.ts` ~386) or block close. |
| Debugging overlay | **Drop** | Coverage and decision records are sufficient for the first release. |
| Start Session `-C` module working directory | **Drop** | Start from the repository root; scope comes from `moduleScope`, not current directory (`packages/router/src/agency.ts` ~296). |
| Claude `--restricted` | **Drop** | It ignores project/local settings, conflicting with the project-installed `.claude/settings.json` hook used by bootstrap (`packages/router/src/bootstrap/index.ts` ~320). |
| Sparse clone/per-module checkout | **Drop** | Round 10 already moved the wall from disk to permissions; do not preserve clone-era session infrastructure as a second path. |

Before claiming Claude mediation under the current `--dangerously-skip-permissions` driver (`packages/router/src/engines.ts` ~160), run a **`claude-bypass-hook-deny` probe** to settle the explicitly unmeasured question of whether a hook denial holds under `bypassPermissions`.

## 11 — The developer’s day

### Open

The developer opens the regular checkout at repository root, runs `copilot` without allow-all, and says “start the next session.” A harmless canary binds Copilot’s `sessionId` to the framework run and records coverage; Start Session can provide the same flow through `engineTerminalFor` (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts` ~328–335).

### Work

The AI pulls work through `dabbler session next`, operating against the scope derived by `moduleScope` (`packages/router/src/agency.ts` ~296). If it reads sibling implementation, it sees one denial naming the owning module and contract; it either uses the contract or records a reason through `self-grant-read` and continues, while the developer sees no permission prompt.

### Test

The AI runs ordinary `dotnet build`, filtered tests, Maven module commands, and diagnostics through the native shell. Commands are recorded, while the declared `dabbler.yaml` suites remain the framework’s checks and run of record.

### Land

The engine reports through `session report` and completes the existing pull loop. Coverage degradation is recorded but does not block close; changed paths outside the module scope still fail `judgeExposure` (`packages/router/src/land.ts` 231–249).

### Review

The developer reviews code and a short session summary showing coverage, denied operations, self-granted reads, shell-audit status, and the changed-path result. The summary does not claim isolation or complete visibility control; package seams still rely on `PackageReference`, never `ProjectReference`, as stated in the brief.

## 12 — The session list

Five sessions are enough; six would separate tightly coupled hook and record work without reducing implementation risk.

1. **Copilot — shared policy evaluator**
   1. Derive a compact per-run policy from `moduleScope` (`packages/router/src/agency.ts` ~296).
   2. Implement direct read/write/protected-path decisions and fail-open error results.
   3. Add evaluator and one-module no-op tests.

2. **Copilot — hook runtime and identity** → 1
   1. Add `hook-tool` beside `hook-stop` (`packages/router/src/session.ts` ~2522).
   2. Bootstrap the tracked Copilot PowerShell shim through `commitOwnScaffold` (`packages/router/src/cli/bootstrap.ts`).
   3. Add atomic canary/session binding shared with the Stop hook.

3. **Copilot — soft reads and coverage record** → 1, 2
   1. Add `session self-grant-read` and append engine grants to `grants.jsonl` (`packages/router/src/exposure.ts`).
   2. Add `observed`/`partial`/`unobserved` coverage and decision events.
   3. Surface the compact result in the extension session view.

4. **Copilot — launch, close, and integration tests** → 2, 3
   1. Keep interactive launches at repository root in `sessionCommands.ts` ~328–335.
   2. Make coverage non-blocking while retaining the changed-path clause in `land.ts` 231–249.
   3. Test canary bypass, missing `dabbler`, parallel chats, shell use, and one-module behavior.

5. **Claude Code — reuse the policy** → 1, 2, 3, 4
   1. Install `PreToolUse` beside the existing Stop hook in `.claude/settings.json` (`packages/router/src/bootstrap/index.ts` ~320).
   2. Reuse the same binding, evaluator, self-grant, and coverage record.
   3. Run the `claude-bypass-hook-deny` probe before changing the headless flags in `packages/router/src/engines.ts` ~160.

**Count: 5 sessions — four Copilot, then one Claude Code.**

## 13 — The disagreement

The orchestrator was too confident in saying a developer can always type `copilot` and inherit the wall merely because the hook file is in the repository. Nested-directory discovery is not measured, missing `dabbler` currently fails closed, allow-all bypasses decisions, and a repository hook does not know which framework run owns the CLI’s `sessionId`; the `copilot-subdir-hook-discovery`, `copilot-toolArgs-shape`, and canary tests settle those gaps.

The claim that bypass harm is “only higher AI cost” is also too weak. The `PackageReference` seam prevents introducing `ProjectReference` compile-time coupling, but bypassed shell and file tools can still inspect secrets, modify sibling files, run destructive Git commands, or transmit information; only changed paths are subsequently caught by `judgeExposure` (`packages/router/src/land.ts` 231–249).

“Simple and reliable” genuinely conflicts with blackboxing in three places. I would allow on internal failure, close with partial coverage, and allow normal shell because those choices avoid infrastructure impasses; I would still hard-deny direct out-of-scope writes and framework-state access because such changes cannot pass the existing close gate anyway. Sibling reads should be friction, not a human approval boundary.

I expect the other reviewer to over-engineer shell parsing, secret detection, version locks, live conformance probes, an identity daemon, OS sandbox composition, or a retained MCP layer. None of those improves the operator’s first three priorities enough to justify its new failure modes.
