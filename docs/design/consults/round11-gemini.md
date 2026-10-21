# Design consult, round 11: Gemini on the wall as a hook -- reliable, unburdening, no more than it needs to be

model_name: gemini-3-1-pro
model_id: gemini-3.1-pro-preview
provider: google
tokens: 4693 in / 2668 out
elapsed: 56.661s  truncated: false (stop_reason: end_turn)
---
**Q1 — The hook's own failure policy**
*   **Soundness**: Copilot's hook is "Fail-closed on error" and "Fail-open on timeout" (CLI 1.0.83). `preToolUse` stdout must return a JSON with `permissionDecision`.
*   **Risk**: A fail-closed default on internal framework errors (e.g., state unreadable) creates an immediate impasse across all tools, violating priority 1. A 30s timeout on Windows PowerShell creates unacceptable latency for every tool call.
*   **Recommendation**: The hook must deliberately **fail open** (return `allow` and log locally) on any internal exception. To beat the timeout, the hook script must be extremely lightweight (no deep framework imports) and read the session's scope from a static JSON file written at session start, rather than computing it dynamically per call.

**Q2 — What is worth denying at all**
*   **Soundness**: Scope is defined by `moduleScope(repoRoot, sessionsDir, shape, slugs)` (`packages/router/src/agency.ts` ~296). Priority 1 (no impasse) outranks Priority 4 (blackboxing).
*   **Risk**: Hard-denying sibling reads causes impasses when the AI needs API context to consume a dependency. Soft-denying writes risks framework corruption before the land gate.
*   **Recommendation**: The simplest reliable wall is exactly "deny writes outside scope, hard; sibling reads soft". Specifically: hard deny (a) writes outside scope and (e) framework state/manifest writes; soft deny (b) sibling reads and (c) secret reads. Rely on `judgeExposure` (`packages/router/src/land.ts` 231–249) as the absolute backstop against out-of-scope edits landing.

**Q3 — The soft read and the escape hatch without a human**
*   **Soundness**: "three refusals of one step stop the session" (`AGENTS.md`). The hook's reason is appended as *"Denied by user via preToolUse hook prompt: <reason>."* 
*   **Risk**: Passing an owed decision to a human violates priority 2 (never a burden). Denying three times triggers an impasse (priority 1).
*   **Recommendation**: Shape: On the first out-of-scope read, return `deny` with `permissionDecisionReason`: *"Out of scope package X. To proceed, call this tool again providing a justification in your arguments."* On the next call (identified via the session's state history or argument change), return `allow` automatically and record a self-grant. No human is involved, and the engine pushes through within two tries, avoiding the three-refusal limit.

**Q4 — The shell**
*   **Soundness**: `dabbler.yaml` `testing.suites[].command` declares commands the framework relies on. The brief notes "built-in file edits aren't OS-sandboxed". 
*   **Risk**: Banning the shell (iii) causes immediate impasses for standard developer loops (`dotnet build`, `mvn -pl`). A strict allowlist (ii) causes impasses on valid shell arguments. An exhaustive blocklist (i) is an infinite game in bash.
*   **Recommendation**: Option (i): Allow the shell entirely, record every command, and deny only a short, fixed list of destructive commands (`git push`, `git reset`, `rm -rf` outside scope). The true defense is the existing land gate (`judgeExposure` refusing "paths changed outside the session's scope"), which neutralizes shell-based perimeter breaches without imposing runtime impasses.

**Q5 — Every CLI in the repository, or only the session's**
*   **Soundness**: The hook is located at `.github/hooks/NAME.json` per repository and fires for all built-in tools. `preToolUse` stdin receives `sessionId`.
*   **Risk**: Intercepting unrelated developer chats in the same checkout will aggressively block human workflows, creating unacceptable friction. 
*   **Recommendation**: The framework's launch (`engineTerminalFor`, `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts` ~328) must inject a marker into the terminal's environment (`DABBLER_SESSION_ID`). *ASSUMPTION: The extension can pass environment variables to `createTerminal`.* The hook must check this environment variable; if absent, it instantly returns `allow` (fail-open), cleanly bypassing non-session CLIs.

**Q6 — Bypass, coverage, and the close**
*   **Soundness**: `--allow-all-tools` bypasses the hook entirely, executing the tool regardless of hook decisions (CLI 1.0.83). `postToolUse` still shows denied calls that ran.
*   **Risk**: Refusing a bypassed session at the close discards paid AI work and human time, violating priority 2.
*   **Recommendation**: Record it and close. The run record must include a `hookCoverage` enum (`Full`, `Bypassed`, `Unobserved`) determined by checking `postToolUse` anomalies or CLI flags. The framework must never claim to guarantee read isolation (since bypassing allows unrestricted reads), but can guarantee write isolation via the `judgeExposure` gate at land time.

**Q7 — Attestation without a probe**
*   **Soundness**: `sessionStart` is a valid hook. The hook mechanism executes `bash`/`powershell`. Priority 3 demands no overengineering.
*   **Risk**: The 11-case probe and `permissions.lock` are fragile, brittle against vendor updates, and over-engineered.
*   **Recommendation**: Option (b): One deterministic self-check at start. The framework injects a canary tool call at startup that the hook is hardcoded to deny. If the command succeeds anyway, coverage is marked `Unobserved` (or `Bypassed`), and the session continues without an impasse.

**Q8 — Copilot's headless drive**
*   **Soundness**: `--allow-all-tools` is "required for non-interactive mode". `engines.ts` ~218 passes `--allow-all-tools`. 
*   **Risk**: Removing `--allow-all-tools` from headless drives might hang the agent waiting for stdin, ruining automation.
*   *Probe to name*: Run `copilot -p ... --allow-tool bash --allow-tool read` and attempt a file read to see if it executes without a prompt in non-interactive mode.
*   **Recommendation**: Leave the headless drive bypassed (`--allow-all-tools`) for the first release. If a hook `ask` arrives without a human, the hook must return `allow`. Because the operator's staff primarily run interactive sessions, mediating headless runs is not worth the risk of automated impasses.

**Q9 — The bare terminal**
*   **Soundness**: The operator wants a user to type `copilot` and start the session. Hooks fail-closed if the `command` (e.g., `bash` calling a script) exits non-zero.
*   **Risk**: If `.github/hooks/dabbler.json` points to `./node_modules/.bin/dabbler` and it is missing, or `dabbler` is not on the user's global `PATH`, every single Copilot tool fails closed.
*   **Recommendation**: `dabbler` must be installed globally. If it fails (missing PATH), it fails confusingly (all tools mysteriously denied). The one-line instruction to developers must be: `npm i -g @dabbler/cli && dabbler bootstrap`.

**Q10 — What not to build**
*   **Soundness**: The priorities explicitly reject overengineering. 
*   **Risk**: Building these delays release and increases operational complexity for zero tangible operator value.
*   **Recommendation**:
    *   MCP server, typed tool set: **Drop**.
    *   `permissions.lock`, the 11-case probe: **Drop**.
    *   OS sandbox / `sandbox.userPolicy`: **Drop**.
    *   Exposure bytes measure: **Drop** (replaced by the hook's soft read log).
    *   `module open` (sparse clones): **Drop**.
    *   Grants as owed decisions (`raiseOwed` with `CLASS_VALUE_TRADEOFF`, `packages/router/src/exposure.ts` ~386): **Drop** (replaced by auto-allow self-grants).
    *   Start Session's `-C` module working directory: **Drop** (run from repo root).
    *   Debugging overlay: **Demote to opt-in**.
    *   `--restricted` / `--bare`: **Demote to opt-in**.

***

**11. The developer's day**
*   **Open**: The developer opens their standard repository in VS Code and clicks Start Session; the framework parses `docs/modules.yaml`, writes a static `.dabbler/permissions.json`, and starts Copilot with a `DABBLER_SESSION_ID` environment variable.
*   **Work**: The AI uses standard built-in tools (`bash`, `edit`) to modify files within the module's `codeRoots`.
*   **Test**: The AI runs `dotnet build` in the shell; it fails, so the AI loops and fixes the syntax error itself.
*   **Land**: The AI attempts to read a sibling package's `IPaymentService.cs`; it hits the soft wall, the hook denies it with an instruction to provide a reason, the AI retries with a reason, and the hook auto-allows and records the read.
*   **Review**: The developer runs `dabbler session land`; `judgeExposure` verifies no bytes changed outside the `codeRoots`, creates the PR, and attaches the run record detailing the auto-granted sibling read.

**12. The session list**
Total: 5 sessions (fewer than 6).
1.  **Commit hook scaffold**: Update `commitOwnScaffold` (`cli/bootstrap.ts`) to write `.github/hooks/dabbler.json` configured to call a lightweight JS script. (Copilot)
2.  **Hook runtime**: Build the lightweight pre-tool-use script that reads `DABBLER_SESSION_ID`, parses `.dabbler/permissions.json`, hard-denies writes, and soft-denies reads. (Copilot)
3.  **Scope injection**: Modify `engineTerminalFor` to inject the env var and dump `moduleScope` to `.dabbler/permissions.json` at startup. → 2 (Copilot)
4.  **Auto-allow self-grants**: Implement the state-check in the hook to auto-allow retried sibling reads, dropping `raiseOwed`. → 2 (Claude Code)
5.  **Clean up old walls**: Remove sparse clone logic (`module open`) and replace the byte-counting in `judgeExposure` (`packages/router/src/land.ts`) with a strict path-based gate. (Claude Code)

**13. The disagreement**
*   **Wrong operator answer**: The orchestrator claimed the harm of a bypass is "bounded by the package seam (`PackageReference`)... which is why a check rather than a guarantee is affordable." This is false. Bypassing hooks allows destructive shell access (e.g., `rm -rf`), meaning harm is bounded *only* by `judgeExposure` rejecting the PR at land time, not by compile-time coupling.
*   **Conflict & Resolution**: "Simple and reliable" directly conflicts with "blackboxing" on the sibling read issue. Blackboxing demands hard guarantees on reads; "simple and reliable" demands AI not impasse when it needs context. I sided entirely with simple and reliable (soft reads, auto-allow, no humans), as Priority 1 (no impasse) outranks Priority 4.
*   **Other Reviewer**: I expect Sol to over-engineer by insisting on dropping the shell entirely, forcing MCP tools, and demanding the 11-case probe and `permissions.lock` to mathematically guarantee the read wall. This will paralyze standard .NET/Maven workflows and violate the core directive to not over-engineer.
