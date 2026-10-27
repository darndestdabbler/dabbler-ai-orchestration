# Design consult, round 11: the wall as a hook — reliable, unburdening, and no more than it needs to be

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams on GitHub
Copilot seats first, Claude Code second**. Round 10 (`round10-brief.md`,
your answers, `round10-synthesis.md`) settled that the wall between an AI
engine and the source of sibling modules moves **from the disk (a sparse
clone per module session) to permissions over a regular checkout**. The
synthesis then framed the mechanism as an MCP server; the operator asked
"do we really need MCP?", and the measured answer is no: **both CLIs have
a pre-tool-use hook the framework can own**, so the framework's rule can sit
in front of the CLI's own tools instead of replacing them. That is now the
design, and this round asks how to make it **reliable and simple** — not
how to make it strong.

You have NO tool access. **Every claim about this repository must cite a
path or a number from this brief; mark anything you cannot ground here as
ASSUMPTION.** Where a CLI behaviour is marked *not measured*, name the probe
rather than asserting it.

---

## The operator's priorities for this round, verbatim

> Let's ask Sol and Gemini for recommendations concerning this new approach
> — with the caveat that **it must be reliable**. I would rather the
> blackboxing fail than the human operator be burdened with a lot of
> permissions decisions or the framework and AI arriving at an impasse.
> All things equal, I want the infrastructure supporting this to be **as
> simple and reliable as possible — no overengineering**.

These outrank round 10's "guarantee" language wherever the two conflict.
Read every question below with that ordering: **(1) never an impasse,
(2) never a burden of decisions on the human, (3) simple, (4) then as much
blackboxing as those three allow.** The earlier rules still hold beneath:
what skilled human developers would do; the PowerPoint test; human time
outranks AI time; a one-module solution keeps working exactly as today.

## The operator's process, verbatim, and the two follow-ups

> 1. Start with no restrictions.
> 2. Build the solution plan.
> 3. Build the solution structure/decomposition — which also creates
>    artifacts for permission sets for each module, which reside in a
>    folder that is off limits to AI.
> 4. At the start of each session, the framework updates the permissions
>    file.

The orchestrator's adjustment, accepted: the permission set is **derived
from `docs/modules.yaml` at session start**, not stored as a second
artifact that drifts from it; "off limits" is a rule over the manifest and
the framework's state files.

> So, if I just instruct my developers not to allow-all on individual AI
> chat sessions, we could use the hooks and they would be better. Correct?
> So, the only real risk here is if developers choose allow-all, and then
> it would widen what AI sees and does beyond what we would like. So, it
> will increase AI costs, but not necessarily be bad otherwise.

> So, if the user opens a terminal, types `copilot`, and then "start the
> next session" — will that apply the hooks and will the framework
> restrict permissions?

The orchestrator's answers, which you may contradict: yes, because the
hook file lives in the repository and the decision is made per call from
the session in flight; harm under a bypass is **bounded by the package
seam** (`PackageReference`, never `ProjectReference` — compile-time
coupling stays impossible whatever the AI read), which is why a check
rather than a guarantee is affordable.

---

## What is measured (2026-09-08, the operator's machine)

### Copilot CLI 1.0.83 — hooks (vendor reference, docs.github.com/en/copilot/reference/hooks-reference)

- Events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`,
  `preToolUse`, `postToolUse`, `errorOccurred`, `agentStop`.
- Location: `.github/hooks/NAME.json` per repository; `~/.copilot/hooks/`
  per user. Definition fields: `version: 1`, `type: "command"`, `bash`,
  `powershell`, `cwd`, `timeoutSec` (default 30), `env`. `copilot help
  commands` lists hooks among what `/env` shows as loaded.
- `preToolUse` stdin: `{ sessionId, timestamp, cwd, toolName, toolArgs }`.
  Stdout: `{ permissionDecision: "allow"|"deny"|"ask",
  permissionDecisionReason (required if deny), modifiedArgs }`. The reason
  is appended to the message the agent receives: *"Denied by user via
  preToolUse hook prompt: <reason>."*
- **Applies to all built-in tools** — `bash`, `powershell`, `view`,
  `create`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`,
  `ask_user`, `update_todo`, `task` — **and to MCP tools**.
- **Fail-closed on error**: a crash or non-zero exit denies the call even
  if stdout said allow. **Fail-open on timeout.**
- **Bypassed by `--allow-all-tools`**: "the tool executes regardless of
  hook decisions". `--allow-all` and `--yolo` include it; the env var
  `COPILOT_ALLOW_ALL` sets it; `/allow-all` sets it mid-session. The help
  calls `--allow-all-tools` "required for non-interactive mode".
- Not measured: whether hooks fire under `-p`; what `sessionStart`
  receives (the CLI version?); whether `.github/hooks` is found from a
  subdirectory working directory. Adjacent-product bug reports:
  github/copilot-cli #3874 (VS Code chat extension: `preToolUse` denial
  not honoured), #2540 (plugin-defined hooks not firing).

### Copilot CLI 1.0.83 — static permissions (`copilot help permissions`)

- Kinds: `shell(command:*?)` (exact command name or first-level
  subcommand; `:*` prefix), `write(path?)` (trailing-component match;
  absolute path to pin), `<mcp>(tool?)`, `url(...)`. **There is no
  `read(path)` kind.**
- `--available-tools` / `--excluded-tools` decide what the model can see;
  `--allow-tool` / `--deny-tool` decide prompting; "denial rules always
  take precedence over allow rules, even `--allow-all-tools`".
- Path permissions: "file access is restricted to paths within the
  current working directory and its subdirectories, plus the system
  temporary directory"; `--add-dir` widens; `--allow-all-paths` disables.
  `/add-dir` and `/cwd` exist as slash commands.
- Command sandboxing (experimental, `--experimental`): MXC; on Windows
  "ProcessContainer with BaseContainer" on supported versions;
  `sandbox.userPolicy.filesystem.{readwritePaths, readonlyPaths,
  deniedPaths}` in `settings.json`; "built-in file edits aren't
  OS-sandboxed, but still follow the same policy on a best-effort basis";
  the sandbox "still inherits your shell environment apart from a fixed
  blocklist".

### Claude Code 2.1.263

- `PreToolUse` hooks of the same shape as Copilot's; the framework already
  installs a **Stop** hook into `.claude/settings.json` at bootstrap
  (`packages/router/src/bootstrap/index.ts` ~320; the command is `dabbler
  session hook-stop --sessions-dir docs/sessions`; its rule is
  `StopGateDecision` in `packages/router/src/session.ts` ~2522).
- `permissions.deny/allow` with path-globbed `Read`/`Edit`/`Write` and
  `Bash(prefix:*)` patterns (vendor-documented; the framework has only
  ever set `blockReadsOutsideWorkingDirectories`, `checkout.ts` ~303).
- `--bare`: "skip hooks, LSP, plugin"; `--restricted`: "ignores user,
  project and local settings files (managed settings and `--settings`
  still apply)"; `--dangerously-skip-permissions` is what the headless
  driver passes today (`packages/router/src/engines.ts` ~160). Not
  measured: whether a hook's deny holds under `bypassPermissions`.

---

## What the framework already has, with paths

1. **The hook precedent.** `hook-stop` (above): one verb, invoked by the
   CLI's own hook mechanism, reading the session state and answering a
   decision. The proposed `hook-tool` is its sibling.
2. **A reliability lesson from that hook, recorded 2026-09-06.** The Stop
   hook keys on the *repository*, not on the driving process: a second
   Claude Code session opened in the same repository to *observe* a run
   was ordered by the hook to answer the live instruction and became a
   second caller of `next`. A per-repository `hook-tool` would likewise
   fire for **every** CLI in the repository — including a developer's
   unrelated chat in the same checkout while a module session is in
   flight — and the hook input carries the CLI's own `sessionId`, not the
   framework's.
3. **The scope.** `moduleScope(repoRoot, sessionsDir, shape, slugs)`
   (`packages/router/src/agency.ts` ~296): each named module's
   `codeRoots`, its own contract folder and every transitive
   dependency's, the root build files and solution file, its shared
   files, the sessions directory; never a sibling's `codeRoots`.
   `inScope(scope, rel)` (~377).
4. **The pull loop and its impasse rule.** `dabbler session next` returns
   `step`, `rejection`, `wait` or `done`; the engine reports with `session
   report`; **"three refusals of one step stop the session"**
   (`AGENTS.md`). The engine runs these verbs in the CLI's shell.
5. **Grants and owed decisions.** `packages/router/src/exposure.ts`:
   `grants.jsonl` (requested / granted / denied / revoked, append-only);
   a request is `raiseOwed` with `CLASS_VALUE_TRADEOFF` (~386), raised by
   `dabbler session next --request-grant <slug> --reason "…"`
   (`cli/session.ts` ~111), answered by `dabbler owed answer` or the
   extension's **Answer Owed Decision**. Blocking owed decisions hold the
   close.
6. **The gate.** `judgeExposure` (`packages/router/src/land.ts` 231–249)
   refuses on two clauses: sibling bytes under no grant (the clone's
   clause) and paths changed outside the session's scope (the clause that
   stays).
7. **Launch.** The extension's Start Session builds the CLI's argv
   (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`,
   `engineTerminalFor`; `createTerminal({ shellPath, shellArgs })`
   ~328–335); the headless drive spawns Copilot with `-p … --allow-all-tools
   --allow-all-paths --no-ask-user` (`engines.ts` ~218). Bootstrap commits
   its own scaffold (`cli/bootstrap.ts`, `commitOwnScaffold`), so a hook
   file it writes is tracked like `AGENTS.md`.
8. **Suites.** `dabbler.yaml` `testing.suites[].command` declares the
   commands the framework runs as checks and as the run of record.
9. **The one-module rule.** `checkout.ts` and `exposure.ts` refuse a
   single-module shape by name; nothing new may be asked of a one-module
   developer.

## What round 10 recommended that this round may overturn

Sol: six typed MCP tools; no shell at all; a probe of eleven cases with a
version-keyed `permissions.lock`; **refuse** the mediated session when the
probe fails; the framework never auto-approves any widening of scope.
Gemini: warn and continue on probe failure; hide the clone commands. The
operator's priorities above favour Gemini's failure posture and question
whether the probe, the lock and "no shell" are overengineering.

---

## The questions

**Q1 — The hook's own failure policy.** Copilot's hook is fail-closed on
error (if `dabbler` is not on `PATH` in a bare terminal, **every tool is
denied**) and fail-open on timeout. Given "never an impasse", should the
framework's hook deliberately **fail open** — allow and record — on any
internal error (unreadable state, missing manifest, exception), reserving
deny for one thing only (a rule it evaluated and understood)? What is the
minimum the hook must do per call to be fast enough that the 30 s timeout
is never the deciding factor on a Windows machine that starts PowerShell
for it?

**Q2 — What is worth denying at all.** Rank these by (impasse risk ×
burden) against (blackboxing value): (a) **writes** outside the module's
scope — the session was never scoped to change them; (b) **reads** of a
sibling's implementation; (c) reads of secrets; (d) destructive shell
commands; (e) the framework's own state and the manifest. Is the simplest
reliable wall "**deny writes outside scope, hard; sibling reads soft**"?

**Q3 — The soft read and the escape hatch without a human.** The operator
would rather the black box fail than be asked. Propose the exact shape:
deny a sibling read once with a reason that names the package and
contract; if the engine asks again *with a stated reason*, **allow it
automatically and record the self-grant** (path, reason, session) — no
owed decision, no human. Is that right? What should still reach a human
(writes outside scope? nothing?), and how does it interact with "three
refusals of one step stop the session"?

**Q4 — The shell.** Round 10 said no shell. The operator's priorities say
otherwise. Options: (i) allow the shell entirely, record every command,
deny only a **short fixed list** of destructive commands (`git push
--force`, `git reset --hard`, `git checkout -- .`, `rm -rf`, `git clean
-fd`…); (ii) allow `dabbler`, read-only git and the declared task commands
by string equality, deny the rest; (iii) round 10's no shell. Which never
impasses a .NET or Maven developer's loop (`dotnet build`, `dotnet test
--filter`, `mvn -pl`), and what does each cost in blackboxing? Note that a
shell read of a sibling (`cat`, `git show`) is a soft failure under Q3's
rule, not a breach.

**Q5 — Every CLI in the repository, or only the session's.** Item 2 above:
the hook fires for any CLI in the checkout. Is it acceptable — and simpler
— that while a module session is in flight, *every* Copilot or Claude Code
chat in that repository is scoped to that module? If not, what is the
simplest reliable way for the hook to know which process is the session's
engine (the `sessionStart` hook writing the CLI's `sessionId` into the
framework's run record at registration? a marker the framework's launch
sets in `env`? nothing — accept it)?

**Q6 — Bypass, coverage, and the close.** `--allow-all-tools`, `/allow-all`,
`COPILOT_ALLOW_ALL`, `--bare`. The hook still fires under allow-all and
can still record; `postToolUse` can show a denied call that ran anyway.
Should the close **refuse** a session whose coverage was partial, or
**record** it and close? The operator's priority says record. Say what
the record must carry so a team lead can read it, and what the framework
must never claim.

**Q7 — Attestation without a probe.** Round 10 wanted a version-keyed
`permissions.lock` and an eleven-case probe. Is that overengineering? The
alternatives: (a) the `sessionStart` hook records "hooks loaded, CLI
version X" into the run record — zero cost, per session; (b) one
deterministic self-check at `session start` (a canary the hook must deny;
if it is not denied, coverage is `unobserved` and the session continues);
(c) the probe and lock. Which is the least machinery that keeps the
record honest?

**Q8 — Copilot's headless drive.** `--allow-all-tools` bypasses the hook
and is "required for non-interactive mode". Is replacing it with explicit
`--allow-tool` per tool enough for `-p` runs never to prompt (not
measured — name the probe)? If a hook `ask` arrives with no human, what
should the hook answer? Is the headless drive worth mediating at all in
the first release, given that the operator's staff run interactive
sessions?

**Q9 — The bare terminal.** The operator wants a developer to be able to
type `copilot` and "start the next session". What must be true for that
to work reliably (the hook file tracked; `dabbler` on `PATH`; the seat's
`--model`), what fails safe and what fails confusingly, and what is the
one-line instruction to developers?

**Q10 — What not to build.** Name, explicitly, everything from rounds 8–10
that this design makes unnecessary and that should **not** be built or
should be demoted: MCP server, typed tool set, `permissions.lock`, the
probe, the OS sandbox, the exposure bytes measure, `module open`, grants
as owed decisions, the debugging overlay, Start Session's `-C` module
working directory, `--restricted`. For each: build, demote to opt-in, or
drop.

Then, once:

11. **The developer's day** — open, work, test, land, review — on a
    Copilot seat, in the simplest version you recommend, in two or three
    sentences each. Include the moment the AI hits the wall and what the
    developer sees.

12. **The session list**, minimal: each session ≤ 3 work steps, real
    dependencies marked →, Copilot before Claude Code, and the count. The
    orchestrator's current guess is six. Say if it should be fewer.

13. **The disagreement.** Where the orchestrator's answers to the operator
    (above) were wrong; where "simple and reliable" and "blackboxing"
    genuinely conflict and which way you would go; where you expect the
    other reviewer to over-engineer.

## What to answer

For Q1–Q10: **Soundness** (cited), **Risk** (the failure you would bet
on — an impasse or a burden counts as a failure here), **Recommendation**
(one, small). Then 11–13. Mark ASSUMPTIONs; name probes. Be direct: the
operator has asked for the simplest reliable thing, and will read
anything heavier as a defect.
