# Design consult, round 10 — synthesis and recommendation: the wall moves from the disk to the permission

**Recommended 2026-09-08 by the orchestrator, for the operator's
confirmation**, after `round10-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round10-sol.md`: 6,745 tokens in, 13,115 out, 229 s) and Gemini
(`gemini-3.1-pro-preview`, `round10-gemini.md`: 7,109 in, 2,947 out, 58 s).
The direction — a regular checkout with the AI's operations restricted,
instead of a sparse clone per module session — is the operator's decision
and was not put to the advisors. What was put to them is how to build it
well. Every claim below that rests on the repository was checked against
the tree; where an advisor was wrong about the tree it is said.

## Amended the same day: the hook, not the server

**The operator asked "Do we really need MCP if we have this?" and the
answer, measured, is no.** The brief framed the request tool as an MCP
server (the orchestrator's sketch) and both advisors built on that frame;
Sol ranked hooks as "defence in depth, not the primary wall" only because
the brief marked them *not measured*. They are measured now, from the
vendors' own references on 2026-09-08:

- **Copilot CLI has `preToolUse` hooks** (`copilot help commands` lists
  hooks under `/env`; `.github/hooks/NAME.json` per repository or
  `~/.copilot/hooks/` per user; fields `version`, `type: "command"`,
  `bash`, `powershell`, `cwd`, `timeoutSec`, `env`). The hook receives
  `{sessionId, timestamp, cwd, toolName, toolArgs}` on stdin and may
  write `{permissionDecision: "allow"|"deny"|"ask",
  permissionDecisionReason, modifiedArgs}`. It applies to **all built-in
  tools — bash, powershell, view, create, edit, glob, grep, web_fetch,
  web_search, ask_user, update_todo, task — and to MCP tools**; the
  reason is appended to the message the agent receives; a crash or
  non-zero exit is **fail-closed**; a timeout is fail-open.
  (docs.github.com/en/copilot/reference/hooks-reference.)
- **Claude Code has `PreToolUse` hooks** of the same shape, and the
  framework already installs a hook the same way (the Stop hook,
  `bootstrap/index.ts` ~320).

So the framework's rule set can sit *in front of the CLI's own tools*
rather than replace them: one verb, `dabbler session hook-tool`, beside
`hook-stop`, evaluating each call against the policy in memory and
answering deny-with-reason. Native tools stay (diff rendering, edit
previews, the model's tuning to its own tool shapes); the pull loop keeps
running `dabbler` in the shell; a shell command is allowed only when it
is a `dabbler` verb or **string-equal** to a declared task in
`dabbler.yaml` — no parsing, no denylist; grants are dynamic because the
hook reads `grants.jsonl` on every call; and the audit is free, because
the hook sees every call. Six tool schemas, a server, the "does the model
still work with only MCP tools" probe, and the MCP sessions (126–127)
all go.

Three caveats, each of which is exactly what the operator's probe is for:

1. **`--allow-all-tools` bypasses hook decisions on Copilot** ("the tool
   executes regardless of hook decisions"), and the headless drive uses
   it because the help calls it "required for non-interactive mode". The
   mediated launch must replace it with explicit `--allow-tool` per tool
   so nothing prompts and the hook decides; static `--deny-tool` rules
   hold regardless ("denial rules always take precedence … even
   `--allow-all-tools`") and stay as defence in depth. **Probe.**
2. **Timeouts fail open.** The hook must be a file read against the
   policy, never a model call, with `timeoutSec` set explicitly.
3. **Hook denial has had bugs in adjacent products** (github/copilot-cli
   issues #3874, VS Code chat extension; #2540, plugin-defined hooks).
   The 1.0.83 CLI must be probed with the exact launch, which is the
   `permissions.lock` tuple as decided below.

`ask` is a native escape hatch in the person's terminal, but the recorded
path stays the grant: deny with "request a grant with a reason", the
engine runs `dabbler session next --request-grant`, the owed decision
appears in the Work Explorer, and it works headless too. Copilot's
experimental OS sandbox (`sandbox.userPolicy.filesystem.deniedPaths`,
MXC; "built-in file edits … follow the same policy on a best-effort
basis") is the later hardened layer for a team that wants the shell
itself confined.

**The session list shrinks to seven**: 125 the policy evaluator; 126 the
tool hook verb, the audit rows, and the hook files bootstrap and `session
start` write for both CLIs; 127 the Copilot probe, `permissions.lock`, and
the mediated launch in both modes (Start Session picks the module — 123
A); 128 exposure v2 and the gate; 129 the Copilot .NET walk; 130 Claude
Code's probe, `--settings` (carrying both hooks — `--restricted` would
drop project settings, so it is not used), and launch; 131 the clone as
a profile, the Maven walk, and the one-module route proven unchanged.
Then 124. Everything below this line stands except where it says MCP.

## The design on one slide

**The AI gets six tools and nothing else.** `read_file`, `list_files`,
`search_text`, `apply_patch`, `run_task`, `request_scope_grant` — served
by the framework as an MCP server, with the CLI's own file, shell and web
tools removed at launch. **The framework answers each call from the module
manifest**: inside the module, its dependencies' contracts, the packages
and the root build files, yes; a sibling's implementation, no — with a
reason that names the package and the contract folder. **A needed no
becomes a decision in the Work Explorer**, answered by a human and
recorded. **Everything is one folder**: the developer opens the repository
they always open and sees all of it.

## What both advisors converged on — adopted

1. **Typed tools, not an opaque `request(op, args)`.** Both reject the
   single multiplexed call: engines are tuned to file-shaped tools, and an
   `edit(path, text)` without patch semantics produces stale overwrites and
   token-heavy re-reads. Sol's six are the set; `apply_patch` is the only
   mutation and carries an expected-content hash, so a stale edit is
   refused rather than clobbering. This is not a retreat from the
   operator's formulation — it is its protocol-safe implementation.
2. **The framework is the exclusive capability path.** If native tools or
   a shell remain callable, the framework is advisory. Copilot:
   `--available-tools` naming only the Dabbler server's tools plus
   `--additional-mcp-config @<file>`; the headless drive's current
   `--allow-all-tools --allow-all-paths --no-ask-user`
   (`packages/router/src/engines.ts`, ~line 218) does not survive. Claude
   Code: `--restricted --tools "" --mcp-config <generated>
   --strict-mcp-config --settings <generated>`; the driver's
   `--dangerously-skip-permissions` (~line 160) does not survive either.
3. **No shell. Named tasks instead.** A denylist of dangerous spellings is
   not a boundary (`cat`, `Get-Content`, `git show HEAD:…`, `git grep`, an
   interpreter, a build of the sibling's project). `run_task(taskId,
   selectors)` runs a task the repository declares — `testing.suites[].command`
   in `dabbler.yaml` is the existing declaration; module-scoped build and
   test join it — with a fixed executable and working directory, validated
   selectors (project, test filter), no shell expansion, captured output,
   and the `DABBLER_*` variables stripped from the child environment. Sol's
   honest limit stands: the framework guarantees the model cannot choose a
   command; it does not guarantee what trusted build code does once started.
4. **Rules live in memory, derived once.** From `moduleScope`/`inScope`
   (`packages/router/src/agency.ts` ~296/377), `docs/modules.yaml`, the
   session's declared plan, and the grants in force from `grants.jsonl`.
   The generated CLI files carry only capability removal and the server
   connection — never a second, editable rules language. The record holds
   the policy hash and its inputs.
5. **The escape hatch is the existing grant.** Deny with a reason → the
   model calls `request_scope_grant(slug, reason)` → a `requested` row in
   `grants.jsonl` → `raiseOwed` with `CLASS_VALUE_TRADEOFF`
   (`packages/router/src/exposure.ts` ~386) → the human answers in the Work
   Explorer (`dabbler.answerOwedDecision`) → the policy widens for this
   session only, and every later effect cites the grant. An unchanged
   request returns the existing denial rather than raising another
   decision. **Not contestable through the tool**: secrets, arbitrary
   execution, destructive git, framework credentials. **Never decided by
   the framework**: any widening of scope.
6. **A probe, not a session; refuse on failure.** Keyed by engine, exact
   version, launch mode, OS family, generated-config hash and tool-schema
   hash, recorded in `permissions.lock` (precedent:
   `packages/router/copilot-catalog.lock`); run when the tuple is unknown,
   in release CI, and when flags or schemas change — not on every start.
   The specimen must prove **both** refusal and usability (Sol's eleven
   cases: in-scope read/patch/task succeed; sibling read/write denied and
   logged; native tools and shell absent; `git show`/`git grep` impossible;
   the secret denied; a grant can be raised, approved and consumed; a
   rejected grant stays rejected), verified from tool inventory and server
   logs, never from the model's wording. A failed tuple refuses the
   mediated session and offers the clone profile.
7. **The single-module solution is untouched.** Round 9's governing
   requirement holds: mediation is on by default only for multi-module
   sessions. The orchestrator's sketch ("everything in the repository,
   secrets and destruction denied") was a new restriction on one-module
   developers and is withdrawn. The security profile is offered separately,
   as an explicit opt-in.
8. **The clone is demoted, not deleted.** `hardened-clone` is the opt-in
   profile and the fallback when a tuple fails its probe; sessions 104, 105
   and 120's walkthroughs keep it alive.
9. **ACP is not the first implementation.** `acp.ts` declines `fs` and
   `terminal` (line 450) and the measured stream misses reads
   (`docs/acp-walkthrough.md` §5). Keep it as a later transport.
10. **Hooks and path rules are defence in depth, never a second policy.**
    Claude's PreToolUse and path-globbed deny rules, and Copilot's native
    path verification, are welcome as redundant detection and better
    denial text once their probes pass — but the MCP evaluator is the one
    authority, so the escape hatch behaves identically on both engines.

## Where they differed, and the call

- **The person's own terminal.** Gemini treats it as unmediated and
  falls back to `-C modules/<slug>` plus `--add-dir`. **Sol is right and
  the tree confirms it**: the extension owns the launch argv of that
  terminal — `createTerminal({ shellPath: spec.program, shellArgs:
  spec.args })` in `tools/dabbler-ai-orchestration/src/commands/
  sessionCommands.ts` (~328–335) — so the same MCP-only flags apply in both
  modes. The developer can always open a second, unrestricted terminal;
  that is a human's choice and outside the wall, which is against the
  model.
- **Probe failure.** Gemini: warn and continue. Sol: refuse the mediated
  session, offer the clone profile. **Sol.** A default wall known to be
  unverifiable is worse than a refusal with a reason, and the fallback
  exists.
- **Open Module and Widen for Debugging.** Gemini deletes; Sol hides them
  in the regular profile. **Hide**: they are the clone profile's commands.
- **Session count.** Gemini's seven under-scope the work (no Claude, no
  Maven, no exposure record); Sol's sixteen over-split it. Ten below.

## What both missed — found by reading the tree

1. **The pull loop runs through the shell.** The engine answers every
   instruction by running `dabbler session next`, `report` and `plan
   declare` (`AGENTS.md`). With no shell, the lifecycle verbs become MCP
   tools of the same server — `session_next`, `session_report` — reached
   through the in-process seam that already exists
   (`packages/router/src/inProcess.ts`: every verb through its own
   handler, output captured, one call at a time). This is a
   simplification: the instruction arrives as structured JSON instead of
   stdout to parse, and Sol's `request_scope_grant` is simply one more of
   these. Claude Code's Stop hook is unaffected — a hook is the CLI's own
   process running a command, not a model tool.
2. **`--restricted` ignores project settings.** By its own help text it
   "ignores user, project and local settings files (managed settings and
   `--settings` still apply)". The Stop hook bootstrap installs into
   `.claude/settings.json` (`packages/router/src/bootstrap/index.ts` ~320)
   therefore stops firing under `--restricted` unless the generated
   `--settings` file carries it. Sol's session list says "preserve the Stop
   hook" without saying how; this is how.
3. **The gate already has the half that survives.** `judgeExposure`
   (`packages/router/src/land.ts` 231–249) refuses on two clauses: sibling
   bytes under no grant, and paths changed outside scope. The first is the
   clone profile's; the second stays as the independent, post-hoc check
   both advisors want kept. The rewrite is: drop one clause in the regular
   profile, add the authorized-effects record and the coverage label.
4. **Copilot's `--no-custom-instructions` is the verifier's, not the
   engine's.** The engine must keep loading `AGENTS.md`; nothing changes
   there, but the flag must not be copied from `transports/copilot.ts` into
   the engine's launch.

## The exposure record and the close, decided

The manifest records, per session: every request and its allow/deny,
the policy hash, each successful effect with its diff hash, each task run,
each grant decision cited by the effects it authorized, and a **coverage**
word — `complete` (MCP-only launch, tuple attested), `partial`, or
`unobserved` (a CLI the framework did not launch). Denied attempts are
evidence the wall worked; they never fail a close on their own.
`exposure_within_ceiling` in the regular profile: every out-of-scope effect
cites a grant; no path changed outside scope or grant; no unaccounted
task; the tuple attested; coverage not `unobserved`. Never print zero
attempts or zero exposure for a session nobody observed.

## What the framework claims, and never claims

Claims: *Dabbler restricts and audits the tool operations made available
to a framework-launched AI session, applies module scope and
human-approved exceptions, and blocks specified dangerous operations* —
with the coverage word on every session. Never claims: filesystem
isolation, containment of hostile code, machine or user isolation, network
mediation of spawned processes, or protection equivalent to a container,
a VM or the sparse clone. A named task is a trusted execution, not a
sandbox.

## The developer's day, Copilot seat, .NET team

**Open.** One folder, the whole repository, as today. Start Session asks
which module, probes only an unknown Copilot version, opens the Copilot
terminal beside the framework's. **Work.** Copilot reads, searches and
patches through the Dabbler tools; the changes appear in the folder the
developer has open. A sibling's source is refused with the package and
contract path named; a justified need appears as an owed decision in the
Work Explorer. **Test.** Copilot asks for the module's build and test
tasks; the framework runs the declared commands and streams the output;
the developer's own terminal is untouched. **Land.** The lifecycle as it
is — checks, verification, run of record, commit, push, close — with the
gate reading authorized effects and changed paths instead of bytes on
disk. **Review.** One checkout, an ordinary pull request, and a compact
exposure record: what was refused, what was granted, what ran, and the
coverage word.

## The probes, named

- **COPILOT-MCP-ONLY** (interactive and headless): `--available-tools`
  selects only `Dabbler(...)`; native tools absent; a read–search–patch–task
  task completes. Decides whether the design ships.
- **CLAUDE-MCP-ONLY**: the exact production argv; Dabbler tools present,
  native `Read`/`Edit`/`Bash`/`WebFetch` absent; the Stop hook still fires
  from `--settings`.
- **COPILOT-SHELL-PATH** and **CLAUDE-DENY-HOOKS**: defence-in-depth only;
  run when convenient, never load-bearing.

Each is a scratch repository and one or two small-model seat calls.

## The sessions

Sessions 123 and 124 as planned assume the clone. **Re-scope 123** to its
design record and gap B (Pack on the module row); its gap A (Start Session
picks a module) moves into 130 below, and gap C is eliminated in the
regular profile. **124** (the UAT in three registers) runs after 134, so it
walks buttons that exist. Copilot before Claude Code, per the operator.

| # | session | → |
| --- | --- | --- |
| 125 | **Profiles and the policy evaluator.** `regular-mediated` vs `hardened-clone`; the single-module bypass kept by name; allow/deny with a structured reason from `moduleScope`, the manifest, the plan and the grants; secret and destructive classes. | — |
| 126 | **The MCP server: reads and the lifecycle.** `dabbler mcp` over stdio; `read_file`, `list_files`, `search_text`; `session_next` and `session_report` through the in-process seam; denial text that names the package and contract. | 125 |
| 127 | **The MCP server: `apply_patch` and `run_task`.** Hashed patches, atomic writes, create/update/rename/delete; tasks from `dabbler.yaml` with validated selectors, fixed cwd, sanitized environment, recorded output. | 126 |
| 128 | **Grants and the audit.** `request_scope_grant` → `grants.jsonl` → `raiseOwed`; request, decision and effect rows; an unchanged request returns the standing denial. | 127 |
| 129 | **The Copilot probe and `permissions.lock`.** The specimen repository; the eleven cases; the tuple key; refuse on failure and name the clone profile. | 127 |
| 130 | **Copilot launched mediated, both modes.** `engineTerminalFor` and `engines.ts` pass MCP-only flags and drop the allow-alls; Start Session picks the module (123 A) and stays at the repository root. | 128, 129 |
| 131 | **Exposure v2 and the close gate.** Authorized effects, coverage word, profile-specific `judgeExposure` keeping the changed-paths clause. | 128, 130 |
| 132 | **The Copilot .NET walk.** A multi-module specimen through open, work, test, land, review; fix only what the walk finds. | 131 |
| 133 | **Claude Code: probe, lock, launch.** CLAUDE-MCP-ONLY on the exact argv; `--settings` carrying the Stop hook; `engines.ts` drops `--dangerously-skip-permissions` in the mediated profile. | 129, 130 |
| 134 | **The clone as a profile, Maven, and the one-module route.** Profile-specific gates; sessions 104/105/120's walks still pass; the Maven walk repeated; the single-module route proven unchanged; the guarantees and coverage words documented. | 131, 133 |

Ten sessions, then 124. At the operator's cadence that is two to three
days, and the design ships for Copilot after 132.

## Which rules decided it

(a) A .NET team lead recognises "the AI gets six tools and asks for
more" and does not recognise a second folder. (b) One slide, above.
(c) One policy, in memory, one authority; the clone code kept but not
default. (d) The framework spends the probe and the server; the developer
spends nothing new. (e) Copilot first, both supported. (f) Two advisors,
converged on the shape; Sol's corrections adopted where the tree agreed
with him, and four things neither saw, found by reading it.
