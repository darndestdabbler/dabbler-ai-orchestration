# Design consult, round 10: the wall moves from the disk to the permission — mediated tool use over a regular checkout

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams, on GitHub
Copilot seats first and Claude Code second**. You answered rounds 6–9 on
the modules block. Round 8's synthesis chose the **sparse, blob-filtered
clone per module session** as the wall between an AI engine and the
source of sibling modules; sessions 100–108 built it and sessions 113–120
walked it end to end on .NET and on Maven.

**This round does not re-open that engineering judgment.** The operator
has looked at the built thing and decided that, whatever its merit as
engineering, it is not what the product's default should be. The
question put to you is *how to build the alternative well*, not whether.

You have NO tool access. **Every claim you make about this repository
must cite a path or a number from this brief. Mark any claim you cannot
ground here as ASSUMPTION.** Do not invent paths. Where a claim is about
a CLI's behaviour that this brief marks *not measured*, say what probe
would settle it rather than asserting it.

---

## The operator's decision, verbatim

Three messages, in order, on 2026-09-08.

> Question ... are we just overcomplicating things with sparse clones?
> Will the human operator get confused with this?

> What if instead of doing sparse clones, we eliminated reading, writing,
> and executing tool use except via the framework and the framework used
> rules to restrict AI to reading and writing files that were relevant to
> the module? That way, we don't need sparse cloning, the human operator
> can see everything, and we are merely restricting AI's operations. The
> framework may have to write permissions files for each CLI — and it may
> need a session at the beginning to make sure that permission structures
> in a CLI have not changed. Your thoughts?
>
> It might also be a good way to impose additional security on the work
> at hand.

> Copilot is actually more important than Claude Code right now because
> all my staff use Copilot. But I would like support for both Copilot and
> Claude Code. In essence we identify a set of permissions that deny all
> operations except something like `framework.request(op, args)` and the
> framework applies rules based upon the session's needs and blackboxing
> plan.
>
> Yes, let's get a consult from Sol and Gemini — but let's be clear here
> ... even though sparse cloning may have been a superior solution in
> terms of engineering, it isn't ideal for a number of reasons. The
> permissions-based approach provides a light solution over what is
> essentially a regular repo/project/solution.
>
> We will need an escape hatch — just in case the framework denies an
> operation that is really needed, AI can explain why it is needed, and
> the human can adjudicate.

The governing rules are unchanged from rounds 6–9: (a) what skilled human
developers would do; (b) the PowerPoint test — the design fits on one
slide a team lead recognises; (c) simpler, more reliable, more
performant; (d) lower AI cost, but human time outranks AI time; (e) the
customer is a .NET or Java team, on Copilot seats; (f) **a solution with
ONE module keeps working exactly as today, with nothing new asked of its
developer** (round 9's governing requirement, unchanged); (g) informed
input, then decide.

---

## Why the operator moved: what the walk measured

The clone's cost was measured in seconds before rollout
(`docs/design/module-checkout-preflight.md`: 1.4 s per clone, under 10 s
for clone + restore + build + test). Nobody measured confusion. The walk
then did:

- **The designer got it wrong twice.** `STATUS.md` for sessions 118–120:
  "The walkthrough was wrong twice, and is corrected." A module session
  started in the full checkout instead of its clone **cannot close and
  cannot be rescued** — the exposure gate refuses once a sibling has
  source, and a grant cannot help because a grant widens a focused clone
  and the full checkout is not one.
- **Two folders for one repository.** The developer's VS Code window is
  on the full checkout; the engine edits a clone under a parent
  directory. The full checkout is stale until pulled, and nothing pulls
  it (session 123's gap C, `docs/sessions/session-plan.md`). The Start
  Session button cannot start a module session at all (gap A: `--module`
  appears nowhere in `tools/dabbler-ai-orchestration/src`).
- **Debugging across the seam is a ceremony**: grant, overlay, reload,
  revoke (`docs/design/consults/round8-synthesis.md`, "Debugging across
  the seam").
- **The defect ledger splits by layer.** Sessions 120, 118 and 123's three
  gaps are defects of the *clone* layer. Sessions 111, 113, 115 and 119
  are defects of the *package* layer (a Maven module could not consume a
  sibling as a package until 119) — those exist under any design and are
  the ordinary cost of black boxes.

The operator's summary is the last line of the decision above: the
permissions approach is a light layer over a regular repository, and
that is worth more than a guarantee the developer routes around.

---

## What stays, in every design: the package seam

Nothing in this round touches the black box itself. A sibling is
consumed as a **committed package** behind **designed contracts**
(`packages/router/src/packages.ts`, `packModule`; `modules/<slug>/
contract/`; `docs/modules.yaml` with `dependsOn` and `deployables:`,
`packages/router/src/modules.ts`). The consumer's project says
`PackageReference`, never `ProjectReference`
(`docs/design/module-checkout-poc.md`). Round 8 ranked designed
abstractions and contract tests *above* absence as the thing that
removes the **reason** to read a sibling; that ranking stands. What
changes is only the *enforcement* layer that sat on top.

---

## What the framework already has toward the operator's design, with paths

Read these as seams, not as the design. Most of the proposal is
assembling them.

1. **The framework already writes a Claude Code permission file.**
   `packages/router/src/checkout.ts` `writeEngineSettings` (around line
   303) writes `.claude/settings.local.json` in the focused clone, setting
   `permissions.blockReadsOutsideWorkingDirectories: true` and keeping
   every other key. `packages/router/src/bootstrap/index.ts` (around line
   320) installs a **Stop hook** into `.claude/settings.json` whose
   command is `dabbler session hook-stop --sessions-dir docs/sessions`;
   its rule is in `packages/router/src/session.ts` (`StopGateDecision`,
   around line 2522): a `step` or `rejection` blocks the turn, a `wait`
   blocks once due. So "the framework writes permission files per CLI" is
   a thing it does today, for one engine, for one hook.

2. **The scope is already one function.** `packages/router/src/agency.ts`
   `moduleScope(repoRoot, sessionsDir, shape, slugs)` (around line 296):
   each named module's `codeRoots`, its own contract folder and every
   transitive dependency's, the root build files and the solution file
   at the root, its shared files, and the sessions directory — **never a
   sibling's `codeRoots`**. `inScope(scope, rel)` (line 377) is the
   membership test. The verifier and the exposure manifest both read it.

3. **The verifier's writes are already framework-executed.** The header of
   `agency.ts`: the verifier "holds no write tool on either transport —
   it emits the file it wants in its answer, and the framework writes the
   bytes. So a write can be refused outright, and is: a path outside the
   test root this repository declares never reaches the filesystem." Its
   *reads* on the seat path are the CLI's own `glob`/`grep`/`view` tools,
   which the module "cannot refuse … what it can do is declare the limits
   to the verifier and then measure the round against them".

4. **The exposure manifest and grants.** `packages/router/src/exposure.ts`:
   written at `session start` and again at the close; for every sibling,
   the implementation bytes under its `codeRoots` in the working
   directory (target zero); the grants in force; the files changed outside
   scope. Grants are append-only rows in `grants.jsonl` (requested /
   granted / denied / revoked). **A grant request is an owed decision**:
   `raiseOwed` with `CLASS_VALUE_TRADEOFF` (around line 386), answered by
   the operator through `dabbler owed answer` or the extension's
   **Answer Owed Decision** command (`dabbler.answerOwedDecision`); the
   engine asks with `dabbler session next --request-grant <slug> --reason
   "…"` (`packages/router/src/cli/session.ts`, around line 111). The
   close gate `exposure_within_ceiling` in `packages/router/src/land.ts`
   refuses bytes nobody signed for. **This is the escape hatch's seam,
   already built: a refusal with a reason becomes a decision the human
   answers in the Work Explorer.** The owed-decision classes are
   `verification-reduction`, `external-consequence`, `value-tradeoff`,
   `accountability-signoff` (`packages/router/src/owedDecisions.ts`,
   lines 71–74).

5. **An ACP client exists and is wired to nothing.** `packages/router/src/
   acp.ts`: four verbs (open, send, receive, cancel) over two protocols —
   the Agent Client Protocol (`copilot --acp`, JSON-RPC over stdio) and
   Claude Code's `stream-json`. The client answers the agent's
   `session/request_permission` from a **policy the connection states**
   (`allow` answers allow-once, never allow-always; `deny` rejects). Two
   facts from `acp.ts` matter here: `clientCapabilities: { fs: {
   readTextFile: false, writeTextFile: false }, terminal: false }` (line
   450) — the client currently declines to provide the file system and
   the terminal, which the protocol allows a client to provide; and
   `session/new` is sent with `mcpServers: []` (line 463) — the client can
   hand the agent MCP servers at session creation. Measured on Copilot CLI
   1.0.83 (`docs/acp-walkthrough.md` §5): **an edit asks permission and a
   read does not** — "the seat asks for edits and not for reads. What
   'permission' gates is the seat's decision, and the policy only answers
   what it is asked." Claude Code's permission channel over stream-json
   (`--permission-prompt-tool stdio`, a `can_use_tool` control request)
   is written from the SDK's protocol and **not run against the CLI**.

6. **Two ways an engine runs a session, and the framework sees them
   differently.** (i) *The person's own terminal*: the extension's Start
   Session (`tools/dabbler-ai-orchestration/src/commands/
   sessionCommands.ts`, `runStartSession`, `engineTerminalFor`) picks the
   engine and model in quick-picks, opens the person's CLI at the
   repository root with the opening sentence — as argv for Claude Code,
   typed-not-sent for `copilot` and `codex` (`ENGINE_CLI`, line 105) —
   and shows the framework's terminal beside it. The framework then sees
   only what the engine *reports* (`dabbler session report`) and judges it
   at the next `dabbler session next`; it does not see the engine's tool
   calls. (ii) *The headless drive*: `dabbler session drive` spawns the
   engine as a child process per step (`packages/router/src/engines.ts`):
   Copilot with `-p <prompt> --model <m> --allow-all-tools
   --allow-all-paths --no-ask-user` (around line 218); Claude Code with
   `-p --input-format stream-json --output-format stream-json --verbose
   --dangerously-skip-permissions` (around line 160). Every Copilot
   invocation is a fresh conversation. The verifier's seat path
   (`packages/router/src/transports/copilot.ts`, `buildArgv`, around line
   919) runs `copilot -p … --allow-all-tools --available-tools
   view,grep,glob --no-custom-instructions --output-format json` — the
   one place the framework already restricts a CLI's tool universe, and
   it works: "once the tool universe is read-only, 'allow all' allows only
   read-only tools."

7. **The pull loop and the step's checks.** `dabbler session next` returns
   `step`, `rejection`, `wait` or `done` (`AGENTS.md`); each step's own
   checks, the verification rounds, the run of record, the commit, the
   push and the close are the framework's to run, not the engine's. The
   framework hashes the tree before and after a step's checks and refuses
   a report whose tree moved. So the lifecycle's executions are already
   mediated; what is not mediated is the engine's *working* — its reads,
   edits and builds between one instruction and the next.

8. **The single-module solution has none of this.** `checkout.ts` and
   `exposure.ts` refuse a single-module shape by name; `moduleScope`'s
   non-module form is the changed paths plus declared dependencies plus
   the sessions directory (`agency.ts`, just above line 296). Round 9's
   requirement holds: nothing new may be asked of a one-module developer.

---

## The two CLIs' permission surfaces, measured on the operator's machine on 2026-09-08

**GitHub Copilot CLI 1.0.83** (`copilot --help`), the ones that matter:

| flag | what the help says |
| --- | --- |
| `--acp` | Start as Agent Client Protocol server |
| `-C <directory>` | Change working directory before doing anything |
| `--add-dir <directory>` | "Allow file access to a directory and load its `.github/skills` and `.github/agents` as trusted configuration (can be used multiple times)" |
| `--allow-all-paths` | "Disable file path verification and allow access to any path" — **so path verification is ON by default**, and the trusted set is the working directory plus `--add-dir` |
| `--available-tools[=tools...]` | "Only these tools will be available to the model" (the verifier uses it today, item 6) |
| `--excluded-tools[=tools...]` | "These tools will not be available to the model" |
| `--allow-tool[=tools...]` / `--deny-tool[=tools...]` | permission to use / not use, without prompting; syntax from the help's own examples: `--allow-tool='shell(git:*)' --deny-tool='shell(git push)'`, `--allow-tool='write'`, `--deny-tool='MyMCP(denied_tool)' --allow-tool='MyMCP'` — **an MCP server's tools are named `Server(tool)`** |
| `--allow-all-tools` | auto-approve; "required for non-interactive mode" |
| `--allow-url` / `--deny-url` / `--allow-all-urls` | URL and domain allow/deny; deny takes precedence |
| `--additional-mcp-config <json>` | "Additional MCP servers configuration as JSON string or file path (prefix with @) … augments config from `~/.copilot/mcp-config.json` for this session" |
| `--no-ask-user` | disables the `ask_user` tool |
| `--assisted-approval` | "Review tool permission requests with the assisted-approval safety judge" — experimental, behind a flag |
| `--yolo` / `--allow-all` | all three allow-alls at once |

**Not measured for Copilot, and the probe that would settle each:**
whether path verification governs the *paths a shell command touches* (a
`shell(cat ../model/src/Person.cs)` from a module working directory) or
only the CLI's own file tools; whether `--available-tools` can name an
MCP server's tool *alone*, leaving the model no native file tool, and
whether the model still works usefully that way; whether a hooks
mechanism exists (none appears in `--help`); whether Copilot's ACP
implementation routes reads through a client that advertises
`fs.readTextFile: true` (the walkthrough measured with it `false`);
whether the seat's `view` ever asks permission under any flag (measured:
it does not over ACP).

**Claude Code 2.1.263** (`claude --help`):

| flag | what the help says |
| --- | --- |
| `--restricted` | "removes the built-in tools that run commands or code (Bash, PowerShell, REPL and the other code-running tools) and WebFetch unless `--tools` names them, and ignores user, project and local settings files (managed settings and `--settings` still apply; add `--strict-mcp-config` to skip MCP servers too). Also confines the file tools to the working directories (`--add-dir` included), refuses bypassPermissions" |
| `--tools <tools...>` | "the list of available tools from the built-in set. Use `""` to disable all tools, `"default"` to use all tools, or specify tool names (e.g. `"Bash,Edit,Read"`)" |
| `--settings <file-or-json>` | additional settings from a file or a JSON string |
| `--allowedTools` / `--disallowedTools` | e.g. `"Bash(git *)"` |
| `--permission-mode <mode>` | acceptEdits, auto, bypassPermissions, manual, dontAsk, plan |
| `--permission-prompts <target>` | with `--print`: `host` (the SDK host or `--permission-prompt-tool`) or `none` ("anything that would prompt is denied automatically") |
| `--mcp-config <configs...>` / `--strict-mcp-config` | load MCP servers from files; use only those |
| `--add-dir <directories...>` | additional directories tools may access |
| hooks | exist (`--include-hook-events`; the framework's own Stop hook, item 1); **PreToolUse hooks that can deny a call with a reason are documented by the vendor and not measured in this repository** |

Path-globbed `permissions.deny` rules on `Read`/`Edit`/`Write` are
documented by the vendor and **not measured here**; the framework has
only ever set `blockReadsOutsideWorkingDirectories`.

**Codex and Gemini** are out of scope by the operator's ruling (Copilot
first, Claude Code second, "support for both").

---

## The proposal, as the operator states it

1. A permission set per CLI that **denies every operation except
   something like `framework.request(op, args)`**.
2. The framework applies **rules** to each request, derived from the
   session's needs and the blackboxing plan (the module manifest).
3. The framework **writes the permission files** for each CLI.
4. Something at the beginning **checks that the CLI's permission
   structures have not changed** — the operator said "a session"; the
   orchestrator's sketch below says a probe.
5. An **escape hatch**: when a needed operation is denied, the AI explains
   why it is needed and the human adjudicates.
6. The same mechanism is expected to give **security** beyond
   blackboxing.

## The orchestrator's sketch — to be critiqued, not adopted

- **The request tool is an MCP server the framework runs** (`dabbler mcp`
  over stdio), handed to Copilot by `--additional-mcp-config @<file>` (or
  `mcpServers` in ACP `session/new`) and to Claude Code by `--mcp-config
  … --strict-mcp-config`. Its ops **mirror the native tools** — `read`,
  `list`, `search`, `edit`, `write`, `run` — rather than one opaque
  `request(op, args)`, because the engines are tuned to those shapes and
  the CLIs render them (diffs, previews). Native tools are removed:
  Copilot `--available-tools Dabbler(...)` or `--excluded-tools
  view,grep,glob,edit,create,shell…`; Claude Code `--restricted --tools
  "" --mcp-config … --strict-mcp-config --settings <generated>`.
- **Rules are derived, never written**: `moduleScope` for paths; the
  session's declared plan for the files it names; a denylist for secrets
  (`.env`, key files, `local-overrides.yaml`); a denylist for destructive
  commands (`git reset --hard`, `git push --force`, `rm -rf`, `git
  checkout -- .`); `run` limited to the verbs `dabbler.yaml` declares
  (build, test, the ecosystem's pack) plus read-only git, with parameters
  the framework determines. Generated per session into an untracked file;
  a single-module solution generates the same rules it effectively has
  today (everything in the repository, secrets and destruction denied).
- **Every request is a row** in the session's run directory; the exposure
  manifest becomes a record of *attempts* — reads outside scope tried and
  refused, ops granted under which decision — which is the measure round
  8's objective 2 ("fewer unnecessary reads") always wanted and absence
  could never produce. The close gate measures that instead of bytes on
  disk.
- **A denial explains itself** in the tool result ("outside module
  `persister`'s scope; `model` is consumed through its package and
  `modules/model/contract/`; ask for a grant with a reason if you need
  its source"), and the **escape hatch is the existing grant**: the
  engine asks with a reason, an owed decision is raised, the human answers
  in the Work Explorer, the rule set widens for this session and the
  record says so.
- **A probe, not a session**: at `session start`, if the CLI's version
  string is not in `permissions.lock`, launch it headless against a
  specimen (read a sibling file; write outside scope; `git show` a
  sibling) and expect three refusals; record the outcome by version; a
  failed probe refuses to start the session with the reason. Precedent:
  `packages/router/copilot-catalog.lock` for the seat's model catalog.
- **Copilot has a native alternative** worth weighing: `-C
  modules/<slug>` as the working directory with `--add-dir` for each
  dependency's `contract/`, `packages/`, the root build files and
  `docs/sessions`, so the CLI's *own* path verification refuses a
  sibling's source with no MCP server at all — for the person-driven
  terminal especially, where the framework cannot mediate.
- **The shell is the hole**, and it is what the clone was solving: in a
  full checkout, `cat`, `Get-Content`, `git show HEAD:<path>`, `git
  grep`, `git log -p`, or a build of the sibling's project all read
  sibling source without touching a file tool. Two honest answers: no
  shell for the engine (named `run` verbs, framework-executed), or a
  check rather than a guarantee, stated as such.
- **The clone is demoted to opt-in**, not deleted: the hardened-lite
  profile for a team that has watched an engine wander. Sessions 104,
  105 and 120's code stays alive under the walkthrough test.

---

## The questions

**Q1 — The op set.** One opaque `framework.request(op, args)` versus a
small typed set mirroring native tools. What does an engine lose when its
native `view`/`edit`/`shell` are gone — the CLI's diff rendering, its
edit previews, the model's tuning to its own tool shapes — and does a
Copilot seat model still work well with only MCP tools? What is the
smallest op set that keeps a session effective, and should `run` be a
shell at all?

**Q2 — Copilot first.** Which Copilot mechanism carries the wall, for
each of the two modes (the person's own terminal; the headless drive):
(a) `--available-tools` naming only the framework's MCP tool; (b) native
path verification with `-C modules/<slug>` and `--add-dir`; (c) ACP
hosting with the client providing `fs` and `terminal`; (d) a combination.
Say for each whether it is a guarantee or a check, what it costs the
developer, and which of the *not measured* items above it depends on.

**Q3 — Claude Code.** The same, given `--restricted`, `--tools ""`,
`--settings`, path-globbed deny rules, PreToolUse hooks and `--mcp-config
--strict-mcp-config`. Where the two CLIs differ in kind, say what the
framework should present as one rule and what it must present as two.

**Q4 — The shell.** A .NET team's dev loop is `dotnet build` and `dotnet
test` between edits, and a Java team's is `mvn`. Named `run` verbs from
`dabbler.yaml` versus a shell with a denylist versus no shell with the
framework running the step's checks only when the engine reports. Which
would such a team accept, and what does each do to the guarantee?

**Q5 — Rules and the escape hatch.** What the rule set is derived from
and where it lives; how the single-module solution stays exactly as
today; and the escape hatch's precise shape — denial → reason → owed
decision → human answer → widened rule for this session, recorded — using
the seams in item 4 above. Where must a denial *not* be contestable
(secrets? destructive commands?), and where must the framework never be
the one to decide?

**Q6 — The probe and the lock.** What specimen, what cadence, where it is
recorded, and what a failure does: refuse to start, or start as a check
with a warning? The operator asked for "a session at the beginning"; say
what a session gives that a probe does not, if anything.

**Q7 — The exposure record and the close gate.** What is honest to
measure per engine and per mode (attempted reads outside scope; denied
ops; granted ops; and, where nothing is mediated, nothing), what
`exposure_within_ceiling` becomes, and what the record should say when
the engine ran in a mode the framework could not observe.

**Q8 — Security beyond blackboxing.** The same rule set can deny reads of
secrets, destructive git, and network egress (`--deny-url`), and yields
an audit of every tool call. State plainly what that protects against
(the model) and what it does not (the machine; a hostile user; an
environment variable that any spawned process can read — which is why
"no shell" is the only protection for the `DABBLER_*` keys). What should
the framework claim, and what must it never claim?

Then, once:

9. **The developer's day** under the design you recommend — five moments
   (open; work; test; land; review) — as a .NET team lead on a Copilot
   seat would recognise it, in two or three sentences each. The developer
   opens one folder and sees the whole repository.

10. **The session list.** Which of the clone block's pieces are demoted
    to opt-in, deleted, or kept as is (`checkout.ts`, `exposure.ts`'s
    bytes-on-disk measure, the `exposure_within_ceiling` gate, `module
    open`/`grant`/`revoke`/`preflight`, the extension's Open Module and
    Widen for Debugging, session 123's gaps A and C); and the new
    sessions in order, with real dependencies marked →, each small enough
    for one AI session with at most ~3 work steps. Copilot's path is
    built before Claude Code's.

11. **The disagreement.** Where the orchestrator's sketch is wrong; where
    the operator's "deny all except `request()`" is right in a way the
    sketch waters down; where you expect the other reviewer to be wrong.

## What to answer

For Q1–Q8: **Soundness** (with a cited path, flag or number per claim),
**Risk** (the failure you would bet on), **Recommendation** (one,
concrete, small enough to build). Then 9–11 once. Mark every claim you
cannot ground in this brief as ASSUMPTION, and for every *not measured*
CLI behaviour you rely on, name the probe.

Be direct. The operator has asked for review, not endorsement — and has
already decided the direction; what is wanted is the best version of it.
