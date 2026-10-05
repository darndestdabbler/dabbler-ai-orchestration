# Design consult, round 10: Gemini on the wall moving from the disk to the permission

model_name: gemini-3-1-pro
model_id: gemini-3.1-pro-preview
provider: google
tokens: 7109 in / 2947 out
elapsed: 57.806s  truncated: false (stop_reason: end_turn)
---
**Q1 — The op set**

**Soundness**: Copilot supports removing native file tools (`--excluded-tools`, `--available-tools`) and injecting external ones (`--additional-mcp-config @<file>`). Claude Code natively supports stripping built-in tools (`--restricted`, `--tools ""`) and consuming MCP servers (`--mcp-config`, `--strict-mcp-config`). The operator’s single opaque `request(op, args)` and the orchestrator’s native-mirroring MCP both have architectural footing in these flags.
**Risk**: ASSUMPTION: Models trained heavily on their vendor's native tool schemas (diff-based edits, specific search schemas) will degrade in task completion if forced through a single multiplexed `request()` bottleneck, losing CLI rendering (diffs, previews) as the orchestrator sketch notes.
*Probe*: Whether `--available-tools` can name an MCP server's tool *alone*, leaving the model no native file tool, and whether the model still works usefully that way.
**Recommendation**: Reject the single opaque `request(op, args)`. Adopt the orchestrator's sketch: build an MCP server (`dabbler mcp` over stdio) providing `read`, `list`, `search`, `edit`, and `write` tools that match the native schemas, mapped internally to the framework's checks.

**Q2 — Copilot first**

**Soundness**: The framework currently operates in two modes: the person's own terminal (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`) and headless drive (`packages/router/src/engines.ts`). Copilot has `--available-tools`, `-C <directory>`, `--add-dir`, and ACP client scaffolding (`packages/router/src/acp.ts`).
**Risk**: The person's terminal mode escapes MCP tool mediation entirely if the human acts directly. Relying on path verification for the shell assumes it governs shell execution.
*Probe*: Whether path verification governs the paths a shell command touches, or only the CLI's own file tools.
*Probe*: Whether Copilot's ACP implementation routes reads through a client that advertises `fs.readTextFile: true`.
*Probe*: Whether the seat's `view` ever asks permission under any flag (which would make ACP viably strict).
**Recommendation**: 
- *Headless drive*: Use (a) `--available-tools` naming only the framework's MCP tool, plus `--excluded-tools view,grep,glob,edit,create,shell...`. This is a **guarantee**. Costs the developer nothing. Relies on the probe that `--available-tools` isolating MCP works.
- *Person's terminal*: Use (b) native path verification with `-C modules/<slug>` and `--add-dir` for contracts. This is a **check**, not a guarantee, because the framework cannot see the tool calls. Costs the developer nothing (VS Code opens the full root, terminal opens locally focused).

**Q3 — Claude Code**

**Soundness**: Claude 2.1.263 supports `--restricted` (confines file tools to working dirs, kills built-in bash/code), `--tools ""` (disables built-ins), and `--strict-mcp-config` (only MCP servers). Settings are already injected via `.claude/settings.local.json` (`packages/router/src/checkout.ts`).
**Risk**: Attempting to unify Copilot's `-C`/`--add-dir` logic with Claude's PreToolUse hooks will fracture the implementation. PreToolUse hooks are documented by the vendor but not measured here.
*Probe*: Whether PreToolUse hooks can deny a call with a reason.
**Recommendation**: The framework must present **two rulesets** mechanically, but one conceptual wall. For Claude Code, generate a session-specific settings file (via `packages/router/src/checkout.ts`), use `--restricted`, `--tools ""`, and `--strict-mcp-config`. Present the framework MCP exactly as in Copilot. Do not use PreToolUse hooks; handle the denials strictly inside the framework's MCP server responses so the escape hatch behaves identically across both engines.

**Q4 — The shell**

**Soundness**: A .NET team's loop requires `dotnet build` / `dotnet test`. Java requires `mvn`. The framework currently spins these via the pull loop checks (`dabbler session next`).
**Risk**: A shell is the ultimate hole. `git log -p ../sibling` or building a sibling project will read source code without touching a file tool.
*Probe*: Whether path verification governs the paths a shell command touches.
**Recommendation**: **No shell for the engine.** Drop all native shell access. Supply named `run` verbs derived from `dabbler.yaml` (build, test) exposed as an MCP tool. The framework executes them and hashes the tree (as it already does in `dabbler session next`). A .NET/Java team accepts this because their deterministic build steps don't require the AI to write raw bash; they just need the compiler output. This preserves the guarantee in headless mode.

**Q5 — Rules and the escape hatch**

**Soundness**: Scope logic exists in `packages/router/src/agency.ts` (`moduleScope`, line 296). Grant logic exists in `packages/router/src/exposure.ts` (`grants.jsonl`, `raiseOwed` with `CLASS_VALUE_TRADEOFF`). Single-module solutions already use a non-module `moduleScope`.
**Risk**: If the framework automatically adjudicates denials, it violates "human time outranks AI time" by guessing intent, or causes infinite AI retry loops for forbidden actions.
**Recommendation**: 
- *Rule derivation*: Derived dynamically from `moduleScope` (line 296) and written to an untracked, session-specific JSON ruleset. Single-module derives the repo root (its existing non-module scope).
- *Escape hatch shape*: Engine calls MCP `read` out of scope -> MCP returns tool denial with reason text -> Engine calls MCP `request_grant` tool -> Framework issues `raiseOwed` (`CLASS_VALUE_TRADEOFF` around line 386) -> AI pauses -> Human answers in Work Explorer (`dabbler.answerOwedDecision`) -> Framework appends to `grants.jsonl` -> Framework widens the active MCP ruleset -> AI resumes.
- *Uncontestable*: Secrets (`.env`) and destructive commands (`git reset --hard`) must return hard terminal failures.
- *Never decide*: The framework must never auto-approve a grant request.

**Q6 — The probe and the lock**

**Soundness**: The orchestrator suggests a probe instead of a session, comparing it to `packages/router/copilot-catalog.lock`. The operator suggested a session at the beginning to check permission structures.
**Risk**: Running a full "session" takes ~10 seconds (`docs/design/module-checkout-preflight.md`). Doing this on every CLI start will infuriate developers. A fast probe might fail due to transient CLI auth issues, locking the developer out of their own tool.
**Recommendation**: Use a **probe**, not a session. A session implies state management and UX overhead; a probe is a silent script. 
- *Cadence*: Run only on `session start` if the CLI version string is absent from `permissions.lock`.
- *Specimen*: Headless drive requesting `mcp_read` on `../sibling/src`. Expect a refusal string.
- *Failure mode*: Start as a **check with a warning**, logging to the terminal. Do not hard-refuse the start; if the CLI changed its schema, the developer still needs to do emergency work.

**Q7 — The exposure record and the close gate**

**Soundness**: `exposure_within_ceiling` (`packages/router/src/land.ts`) currently counts physical implementation bytes in the focused clone's target zero (`packages/router/src/exposure.ts`).
**Risk**: The person's terminal mode cannot be mediated at the tool-call level (the framework only sees `dabbler session report`). Measuring MCP attempts there is impossible.
**Recommendation**: 
- *Headless mode*: Measure attempted out-of-scope reads, denied ops, and granted ops by tracking MCP server logs. Write this to `exposure.json`.
- *Person's terminal*: Measure **nothing** at the tool level. Record the event as `"unmediated_terminal_session"`. 
- *Close gate*: Rewrite `exposure_within_ceiling` to assert that no files outside `moduleScope` were modified in the git tree (which the framework already hashes), checking against the `grants.jsonl` append-only rows. Drop the bytes-on-disk measure.

**Q8 — Security beyond blackboxing**

**Soundness**: The Copilot CLI supports `--deny-url`. The framework refuses test root escapes (header of `agency.ts`). The operator sees permissions as adding security.
**Risk**: Overpromising security on a developer's local machine. "No shell" protects the `DABBLER_*` env vars, but the developer has full terminal access.
**Recommendation**: 
- *Claim*: Protects against model hallucination, AI wandering, and accidental/prompt-injected out-of-bounds codebase edits or network exfiltration by the LLM. 
- *Never claim*: Never claim protection against a hostile user, machine-level malware, or a compromised package layer (Maven/NuGet).

---

**9. The developer's day**
- **Open**: The developer opens the full repository in VS Code, exactly as they do today. The workspace is pristine, with no extra folders, and `dabbler.yaml` sets the ecosystem context.
- **Work**: They click Start Session. The framework derives rules from `agency.ts`, writes local permission files per CLI, and launches the AI. The developer works in their regular source tree; if the AI tries to read a sibling, it gets a tool refusal and requests a grant, which the developer approves in the Work Explorer.
- **Test**: The AI invokes the framework's named `run` verb (`dotnet test`). The framework executes the ecosystem command and returns the output to the engine, without exposing a naked shell.
- **Land**: `dabbler session next` verifies the step. `exposure_within_ceiling` checks the git tree against `grants.jsonl` instead of counting clone bytes, ensuring no unapproved sibling files were altered.
- **Review**: The commit is pushed. The reviewer sees a standard PR from a single repository, completely unaware of the AI mediation layer or the rulesets that governed the session.

**10. The session list**
*Demotions & Deletions*: `checkout.ts` clone creation is demoted to opt-in ("hardened-lite"). `exposure.ts` bytes-on-disk measurement is deleted. `exposure_within_ceiling` is retained but rewritten to check git-tree diffs against `grants.jsonl`. Open Module and Widen for Debugging commands are deleted. Session 123's gaps A and C are deleted (n/a to full checkout).

*New sessions* (sized for ~3 work steps):
1. `cli-probe-lockfile`: Implement the version-check headless probe and `permissions.lock`.
2. `mcp-native-mirror`: Build the `dabbler mcp` server over stdio with `read`/`write`/`list`/`edit` mirroring native schemas.
3. `mcp-copilot-wiring` (→ `mcp-native-mirror`): Wire `--available-tools` and `--additional-mcp-config` in `packages/router/src/engines.ts` for headless Copilot. 
4. `mcp-claude-wiring` (→ `mcp-native-mirror`): Wire `.claude/settings.local.json`, `--restricted`, and `--strict-mcp-config` for Claude Code.
5. `terminal-passthrough-rules`: Generate `-C <dir>` and `--add-dir` args for the person's terminal mode in `sessionCommands.ts`.
6. `escape-hatch-integration` (→ `mcp-native-mirror`): Map MCP tool denials to `raiseOwed` and update `grants.jsonl`.
7. `exposure-gate-rewrite`: Rewrite `exposure_within_ceiling` to evaluate the git tree diff against `grants.jsonl` instead of bytes-on-disk.

**11. The disagreement**
- *Where the sketch is wrong*: The sketch assumes a completely naked shell is viable if we just "check" it, or that native tools can be deleted without performance consequences. Models are highly tuned to their native tools; ASSUMPTION: stripping them without a perfectly shaped MCP mirror will cripple edit accuracy.
- *Where the operator is right*: The operator's instinct to "deny all except `request()`" is structurally correct. A strict whitelist via MCP is the only mathematically sound way to build this wall on a local filesystem. The sketch waters this down by leaving native tools partially alive.
- *Where the other reviewer will be wrong*: The other reviewer will likely advocate for adopting the ACP client (`packages/router/src/acp.ts`) to handle this. But ACP currently sets `fs.readTextFile: false` (line 450), and building a full IDE filesystem shim just to mediate reads is drastically over-engineering what MCP handles natively via standard CLI flags today.
