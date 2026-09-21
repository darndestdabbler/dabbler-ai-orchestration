# Design consult, round 11 — synthesis and recommendation: the wall as a hook, built to fail soft

**Recommended 2026-09-08 by the orchestrator, for the operator's
confirmation**, after `round11-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round11-sol.md`: 4,472 tokens in, 15,531 out, 284 s) and Gemini
(`gemini-3.1-pro-preview`, `round11-gemini.md`: 4,693 in, 2,668 out, 57 s).
The operator's priorities for this round — never an impasse, never a burden
of decisions on the human, simple, then as much blackboxing as those allow
— were put to both advisors verbatim, and they converged on the same
answers to every question that mattered. Where they differed, the call is
made below and the tree was read to make it.

## Amended the same day: reads are watched, not hooked

The operator set a budget — 0.25 s per call is fine, 2 s is not unless the
hook is under 5 % of the session's time — and asked two questions: could
a persistent Node service make the hook faster, and could reads be
enforced *lightly*, by watching the CLI's own output and feeding back.
Three measurements answer both, and they change the shape above.

1. **The per-call floor is the shell, not the framework.** Copilot runs a
   hook by starting a shell and handing it the script; on this machine
   PowerShell 7 starts in 0.5–0.7 s, Git Bash in 0.25 s, and Node in 0.8 s
   (abnormally slow here; typically ~0.1 s). A persistent Node service
   removes Node's start but not the shell's, and so does evaluating the
   policy inside the shell script — which is simpler and needs no daemon.
   **No service.** The script reads a policy file the framework writes at
   session start and decides in-process; it calls `dabbler` only to
   record.
2. **Hooks take a matcher.** The vendor reference: `preToolUse` and
   `postToolUse` fire "only for matching tool names" (a regex against
   `toolName`). So the pre-hook is installed for **`edit|create|bash|
   powershell` only** — writes and shell, the minority of calls — and
   **reads (`view`, `glob`, `grep`) never start a shell at all.** Claude
   Code's hooks have the same `matcher`.
3. **Both CLIs already write the log the operator asked to watch.** Copilot:
   `~/.copilot/session-state/<sessionId>/events.jsonl`, live, one JSON
   record per event — `tool.execution_start` with `toolName` and
   `arguments` (the path), `tool.execution_complete`, `assistant.turn_start/
   turn_end`, and `session.start` carrying `copilotVersion`, `selectedModel`,
   `cwd` and `gitRoot`. Claude Code: `~/.claude/projects/<repo>/<session>.jsonl`
   with every `tool_use` block. Structured files, not terminal scraping.
   And the turn-end hook — Copilot's `agentStop`, Claude's `Stop`, which the
   framework already owns as `hook-stop` — receives **`transcriptPath`** and
   may answer `decision: "block"` with a `reason` that becomes the model's
   next prompt.

**The shape, amended.** Reads: no hook. At the end of each turn the
turn-end hook reads the transcript, finds any sibling-implementation read
outside scope, records it, and — the first time for that path — blocks
once with the reason (*"you read `<path>`, owned by `<slug>`; use
`<contract>`; if the implementation was needed, run `self-grant-read`"*).
Never twice for the same path: after that it only records. The extension
shows the record in the Dabbler terminal and the Work Explorer — the human
is *told*, never asked. Writes and shell: the matched pre-hook, ~0.5 s each
(0.25 s if Copilot honours the `bash` field on Windows — one probe), deny
outside scope and the short destructive list. Destructive commands are
also static `--deny-tool` rules, which cost nothing and hold even under
`--allow-all-tools`. Cost per turn: one shell start at turn end plus one
per write or shell call — on a 20 s turn with four reads and two edits,
about 1.5 s (7 %), or 0.75 s (4 %) with the bash field. The walk
measures it.

**Three things come free.** `session.start`'s `copilotVersion` and
`selectedModel` are the CLI-version attestation round 10 wanted a lock
for; `cwd`/`gitRoot` say which repository a chat is in; and the Copilot
`agentStop` hook, once installed, gives Copilot the same "answer the
outstanding instruction" enforcement that only Claude Code has today.
Option A on "which chat" stands: every chat in the folder is on the
session; the event logs make it observable rather than assumed. The
allowed-files list rides in the session's first instruction and behind
`dabbler session scope`, so the AI rarely meets the wall at all.

The five sessions stand with one change of content: 126 installs the
matched pre-hook *and* the turn-end hook for Copilot, and the policy file;
127 adds the transcript scan and the once-per-path feedback beside the
self-grant.

## The design on one slide

**One hook, in the repository, in front of the CLI's own tools.** Bootstrap
writes `.github/hooks/dabbler.json` (Copilot) and a `PreToolUse` entry in
`.claude/settings.json` (Claude Code), both calling `dabbler session
hook-tool`, the sibling of the existing `hook-stop`. **Three rules.** Writes
outside the module's scope: denied, with a reason (they could never pass the
close anyway). Framework state and the manifest: denied. A sibling's
implementation: denied *once*, with the package and contract named; on the
engine's stated reason, allowed and recorded as a self-grant — **no human
is asked, ever, at hook time.** **Everything else is allowed and recorded**,
the shell included, minus a short fixed list of destructive commands.
**The hook fails open**: any error inside it, `dabbler` missing, the policy
unreadable — allow, and say so in the record. **The close never refuses for
coverage**; it records `observed`, `partial` or `unobserved`, and keeps the
one gate that was always the real one: no path changed outside the scope.

## What both advisors converged on — adopted

1. **Fail open, deliberately.** Copilot's hook is fail-closed on a
   non-zero exit and fail-open on timeout; the framework's hook must be
   fail-open on every internal path, and reach `deny` only after loading a
   complete policy, understanding the call, and evaluating a known rule.
   **The tracked hook is a tiny PowerShell/bash shim** that captures
   `dabbler`'s output and emits `{"permissionDecision":"allow"}` with exit
   0 if `dabbler` is missing, malformed or non-zero — because a bare
   terminal without `dabbler` on `PATH` would otherwise deny every tool.
   The pre-commit guard bootstrap installs already fails in this direction
   (`terminalShim.ts`: "exits non-blocking, which is the direction it
   fails in by design").
2. **Deny writes outside scope, hard; sibling reads soft.** Both ranked it
   identically: framework state and `docs/modules.yaml` first (the scope
   from `moduleScope` *includes* the sessions directory because the
   verifier must read it, so the engine's write-protection of
   `sessions.json`, `activity-log.json`, `.dabbler/` and the manifest is a
   separate protected-path rule); out-of-scope writes second, with no
   self-grant; sibling reads third, soft; destructive shell fourth, as a
   guardrail; secrets last — protect only paths the framework itself
   knows, and never claim general secret protection.
3. **The self-grant.** Sol's exact shape, adopted: the first sibling read
   is denied with a reason of the form *"`<path>` is implementation owned
   by module `<slug>`; use `<contract path>` first; if implementation
   access is still needed, run `dabbler session self-grant-read --path …
   --reason …` and retry"*. The verb appends a session-limited row to
   `grants.jsonl` with actor `engine`, the path, the reason, the run and
   the CLI `sessionId` — and **never raises an owed decision**. Gemini's
   variant (allow the second identical call) is rejected because the hook
   cannot see the assistant's prose, so the reason would be unrecorded.
   Hook denials are not step refusals; the "three refusals of one step"
   rule (`AGENTS.md`) is untouched.
4. **The shell stays.** Option (i) unanimously: allow, record the command
   text and outcome, deny only unmistakable destructive forms (force-push,
   repository-wide hard reset or clean, checkout/restore of the whole
   worktree, recursive deletion of the root). No parsing, no allowlist of
   task strings — Sol's point that `testing.suites[].command` declares the
   framework's checks, not every command a developer's loop needs. A shell
   read of a sibling is a soft failure of blackboxing, not a breach, and
   the framework never claims shell coverage.
5. **No mediation of the headless drive in the first release.** Removing
   `--allow-all-tools` from `copilot -p` is unmeasured and could strand a
   run at a prompt; the operator's staff run interactive sessions. Keep
   `engines.ts` as it is, record headless coverage as `partial` or
   `unobserved`, and **never return `ask` from the hook** — allow with
   degraded coverage on uncertainty, deny on an understood rule.
6. **Coverage never blocks the close.** Record engine and CLI version (or
   `unknown`), the run and the bound CLI `sessionId`, the module slugs and
   policy hash, the coverage word with the exact evidence that degraded it
   (hook error, policy missing, canary executed, denied call then
   `postToolUse`, bypass flag seen), the counts of denials and
   self-grants, and the changed-path result from `judgeExposure`. Claim
   only what was observed; never isolation, never complete read coverage.
7. **One canary, no probe, no lock.** The version-keyed `permissions.lock`
   and the eleven-case probe are dropped by both. At a multi-module
   session's start the first instruction asks the engine to run `dabbler
   session canary`; the hook is hardcoded to deny it. Denied and recorded
   → `observed`. If the verb actually runs, it writes the fact itself →
   `partial`/`unobserved`, and the session continues. The canary is also
   the moment the CLI's `sessionId` is bound to the run.
8. **Drop, not demote.** Both advisors: the MCP server, the typed tools,
   the lock, the probe, the exposure-bytes clause, `module open` and the
   clone, the debugging overlay, Start Session's `-C` working directory,
   and Claude's `--restricted` (it ignores project settings and would
   drop the Stop hook). The OS sandbox stays a documented opt-in. Grants
   as *blocking owed decisions* become opt-in governance — the default is
   the engine's self-grant. This satisfies the returning ground rule ("no
   new module without deleting one") with room to spare:
   `checkout.ts`, the clone half of `exposure.ts`, `module
   open/preflight/grant/revoke`, and the extension's Open Module and Widen
   for Debugging go; `docs/design/module-checkout-poc.md` and
   `hardened-profiles.md` stay as the record of what a customer who needs
   a disk-level wall would get.

## Where they differed, and the call

- **Which CLI is the session's.** Gemini: an env marker set by Start
  Session; the hook allows everything when the marker is absent. Sol: bind
  the CLI `sessionId` to the run on the first `dabbler session next` (or
  the canary) the hook sees; enforce only for the bound id; a second CLI
  trying to claim a bound run gets one clear denial. **Sol** — it covers
  the bare terminal, needs no launch plumbing, and it *fixes* the
  2026-09-06 observer-session incident instead of re-creating it. The env
  marker is a free extra when the framework launches.
- **The bare terminal.** Gemini: "install `dabbler` globally". Sol: the
  shim fails open. **Sol**; npm is retired and the VSIX is the
  distribution. Inside VS Code every terminal already has `dabbler`
  (`terminalShim.ts` prepends the environment collection).
- **Hook cost.** Gemini wanted a lightweight script reading a static JSON
  instead of `dabbler`. **Measured, moot**: on the operator's machine
  PowerShell starts in 0.8 s, bare `node` in 0.8 s, `dabbler version` in
  0.9 s; the interpreters dominate and the framework adds ~0.1 s. About
  2 s per tool call against a 30 s timeout. The walk should say whether 2
  s on every `view` is tolerable; it is well clear of the timeout.
- **Session count.** Gemini five, Sol five, the orchestrator six. **Five.**

## Where the orchestrator was wrong, on the record

Both advisors corrected the same sentence, and they are right. "Harm under
a bypass is bounded by the package seam" is true of *coupling* — a
`PackageReference` still cannot become a `ProjectReference` — and false of
*damage*: a bypassed engine with a shell can read secrets, modify sibling
files, run destructive git, or send data. What bounds damage is git (a
committed tree), the short destructive-command list, and `judgeExposure`'s
changed-path clause at the close. The operator's summary "it will increase
AI costs, but not necessarily be bad otherwise" should read: *it costs
context, it forfeits the behavioural black box for that session, and it
removes the guardrails — and the record will say which sessions ran that
way.*

## The developer's day, Copilot seat, .NET team

**Open.** The regular checkout, one folder. Start Session — or a bare
`copilot` from the root — and "start the next session". The canary binds
the chat to the run and writes the coverage word. **Work.** Native tools,
native diffs. On a sibling read: one denial naming the module and its
contract; the AI reads the contract, or self-grants with a reason and
carries on. The developer sees no prompt. **Test.** `dotnet build`,
`dotnet test --filter`, `mvn -pl` in the shell as always; recorded. **Land.**
The lifecycle unchanged; coverage recorded, never a refusal; a path changed
outside scope still fails the gate. **Review.** An ordinary pull request and
a compact session summary: coverage, denials, self-grants with their
reasons, shell audit status, the gate result.

## The sessions — five

| # | session | → |
| --- | --- | --- |
| 125 | **The policy.** A compact per-run policy from `moduleScope`; protected paths; read/write/shell decisions with a structured reason; fail-open results; the one-module no-op. | — |
| 126 | **The hook.** `session hook-tool` beside `hook-stop`; the tracked shim written by bootstrap for both CLIs; the canary verb; binding of the CLI `sessionId` shared with `hook-stop`. | 125 |
| 127 | **Soft reads and the record.** `session self-grant-read` appending engine rows to `grants.jsonl`; coverage and decision events; the compact summary in the extension's session view. | 126 |
| 128 | **The close, the deletions, the walk.** Coverage non-blocking; `judgeExposure` keeps the changed-path clause and loses the bytes clause; the clone, `module open`, the overlay, Open Module and Widen for Debugging deleted; the multi-module .NET walk on Copilot. | 127 |
| 129 | **Claude Code.** `PreToolUse` beside the Stop hook in `.claude/settings.json`; the same binding, evaluator and record; the `claude-bypass-hook-deny` check before the headless flags change. | 128 |

Then 124 (the UAT in three registers) walks the result; 123 is re-scoped to
its design record and gap B.

## What is measured before building, and what is not

Nothing blocks the first session. Two facts are settled by session 126's
own tests on the real CLI rather than by a separate probe: the shape of
`toolArgs` for `bash`/`powershell`/`view`/`edit` on Copilot 1.0.83 (the
hook needs the command and path fields), and whether `.github/hooks` is
found from a nested working directory (until it is, "from the repository
root" is the one-line instruction). Whether a Claude Code hook's deny holds
under `--dangerously-skip-permissions` is checked in 129 before the driver's
flags change.

## Which rules decided it

(1) Never an impasse: fail open, soft reads, the shell kept, coverage never
refuses. (2) Never a burden: no owed decision is raised by the hook; the
human sees a summary, not a prompt. (3) Simple: one verb, one shim per CLI,
one canary, three rules; ten things dropped. (4) Blackboxing within those:
a wall that turns a sibling read into a recorded, reasoned act — and a gate
that still refuses what the session was never scoped to change.
