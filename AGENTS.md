# dabbler-ai-orchestration v2

The AI-led coding-session framework: one TypeScript implementation under
`packages/router`, published as the npm package `dabbler-ai-router` with a
`dabbler` command, plus the VS Code extension under `tools/` that bundles it
and calls it in-process. The session plan and the decisions log live under
`docs/sessions/`; `STATUS.md` carries the inter-session handoff.

**There is no Python in this repository.** The rebuild started as a Python
package with a TypeScript renderer over it, and sessions 22–36 ported the
whole of it; session 36 deleted `ai_router/`, its suite, and the parity
control that held the two implementations to each other. An instruction, a
document or a comment that names `python -m ai_router.<module>` is describing
something that no longer exists — the equivalent is `dabbler <verb>`, with
the same arguments.

## Working branch

**Work happens on `master`**, per the standing trunk-based directive. Commit
to it and push it.

`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are both merged into `master` and are finished. The experiment branch
carried the cheaper verification approach; the design branch carried the
framework specification. Neither is the place to commit now — taking either
one as the trunk strands work where nothing else can see it.

## Ground rules

1. **No new module without deleting one.** The module inventory in the
   rebuild work plan is the ceiling.
2. **No guard may guard another guard.** Every gate must cite the concrete v1
   incident it would have prevented (the five kept gates each have one; see
   Session 2).
3. **One implementation of any rule.** It was "in one language, TS renders and
   Python decides" while there were two; there is one now, and the rule is
   the same one it always was — a rule stated twice is a rule that drifts.
4. **Test budget is a ceiling: 215 TS.** One test per behavior. No
   falsifier-twin doctrine, no tests of test infrastructure, no source-text
   assertions (use ESLint), no migration-path tests, no tests asserting exact
   markdown strings.
5. **The machine owns the record.** Nothing under `.dabbler/runs/` is ever
   hand-edited or exempted; no code path may accept a hand-written verdict.
6. **No process ceremony on this repo itself.** Plain git commits with plain
   messages. Do not use v1's session machinery, and do not build v2's own
   machinery around v2's development.
7. **Comments state constraints, not history.** No "Set NNN" archaeology. If a
   lesson matters, encode it structurally.
8. **LOC budgets are targets ±30%, not gates.** If a module wants to be 2× its
   budget, stop and reconsider the design instead of writing a justification.

> **Superseded, 2026-08-23.** The operator has set aside the ground rules for
> the duration of the rebuild — see `docs/operator-decisions.md`, which is the
> governing record. The text is kept because the constraints are restored once
> the replacement works. Read it as what returns, not as what is in force.
>
> **The port's own envelope is spent.** Sets 142–147 ran under a relaxation of
> rules 1 and 4 measured in Python lines, modules and tests; there are none of
> those left to measure. Rule 4's number above is the TypeScript half of the
> original, and the port's own budget is in the session plan under "Test
> budget for sessions 22–36".

## Traps that have already cost a session

Read these before reaching for the tool they name. Each is here because a
session hit it, not because anyone imagined it.

### `session close --force` closes the WHOLE PLAN, not one session

Its help says "bypass bookkeeping gates, never evidence; stamps
forceClosed". What it does not say is in `writers.flipStateToClosed`:

> `forced` promotes every open session — a forensic marker, not a shortcut.

Every session not already `complete` or `cancelled` is flipped to
`complete`. Session 24 used it to get past one bookkeeping gate and marked
sessions 25–35 of the port plan finished. `forceClosed` is also stamped at
the REPOSITORY level, so the record cannot even say which session forced
it.

**Use it only to abandon a whole plan deliberately.** It is never the way
past a single gate. If a gate is wrong, prove it is wrong, record the
proof, and satisfy the gate anyway — a five-minute test run is cheaper
than a damaged ledger, every time. See D157 and D158.

### FIXED in session 26: the freshness gate and a deleted tracked file

`testEvidence.surfaceDigest` used to hash every path `git ls-files`
reported and write the literal string `"deleted"` for one it could not read.
A deleted-but-tracked file contributed a `path\0deleted` line; committing
dropped it from `ls-files` and that line left the digest. No file's content
changed, and `test_run_fresh` failed anyway and asked for another full run.
It cost session 23 a re-run and session 24 a forced close.

**It no longer happens.** An unreadable path is omitted rather than marked,
so a deletion moves the digest once — when the file goes — and the commit
that records it moves nothing. D160 ruled it; D170 landed it. This entry
stays only so a session that meets the symptom in an older checkout knows
what it is looking at.

### Repairing state: `sessions.json` is state, `activity-log.json` is history

If the ledger must be recovered from git, restore **`sessions.json` only**.

`activity-log.json` is append-only, and two things derive from it:
decision numbering (`ordinal = decision entries + 1`) and
`decisions-log.md`, which is RENDERED from it and is not a source. Rewinding
the activity log therefore rolls the decision counter back, and the next
decision recorded silently overwrites the last real one when the log is
re-rendered. Session 24 did exactly this and lost the operator's D157 until
it was restored from the later commit and re-rendered with
`writers.renderDecisionsLog`.

## Environment

- Windows 11, PowerShell primary. Node 22.18+; nothing else to install.
- Run the suite: `npx vitest run --root packages/router` (no live network
  outside the tests marked live, which skip without keys).
- Run the router by hand: `node packages/router/dist/dabbler.cjs <verb>`
  after `npm run build -w dabbler-ai-router`, or `dabbler <verb>` from a VS
  Code terminal once the extension has installed its shim.
- Provider keys via env vars: `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`. Never in config or logs.
- Transport preference: CLI flag `--transport` > `DABBLER_TRANSPORT` env >
  `transport.profile` in router-config.yaml > default `api`.
- Git Bash heredocs mangle backslashes on this host — write files with
  your editing tools, never with a heredoc.

<!-- dabbler:managed:start -->
# AI orchestrator instructions — `dabbler-ai-orchestration`

> `AGENTS.md` is the single source of this managed body; `CLAUDE.md` and
> `GEMINI.md` import it and add only their engine tail. Do not hand-edit
> inside the fence; re-run `dabbler bootstrap` to refresh it.

## Your role

You are the **orchestrator** for `dabbler-ai-orchestration`, running AI-led work one
session at a time under the Dabbler session workflow. You do the mechanics
— file edits, shell, git — and the framework owns the lifecycle: it tells
you what to do next, one move at a time, and you do that and ask again.

## How to run a session

Sessions are numbered directly in this repository, under one sessions root
(`docs/sessions/`), so no command takes a handle to one.

    dabbler session next --sessions-dir docs/sessions

One call, one move: it judges whatever answer is outstanding, advances the
session, and prints the next instruction as JSON on stdout. Do what the
instruction says, run the command it names as `answer_command` — running
it is the answer — and call `next` again, until it says `done`. That is
the whole loop, and there is nothing to remember between calls: the
framework holds the state.

**`start` registers the session; `next` never does.** Registering is a
separate verb, and it is the one that carries who is working:

    dabbler session start --sessions-dir docs/sessions \
        --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

A Copilot seat adds `--model` (the seat label is not trusted; identity
resolves through the model registry). **Every `next` call carries none of
them** — the session is in flight and its identity is on the record, and a
`next` that names an identity with nothing in flight is refused rather
than starting work nobody asked for.

`next` with nothing in flight answers `done`. That is the honest end of
the loop, not an error: it means there is no session to advance.

## What comes back

Four kinds of instruction, and no fifth:

- **`step`** — work to do. Its `ask` says what; do it, then report with
  the `answer_command`, naming every file you changed and nothing else.
- **`rejection`** — the answer was refused, and `reasons` says why. Fix
  it and answer again; three refusals of one step stop the session.
- **`wait`** — the framework is running something that outlasts a tool
  call. Nothing is owed but another `next`, after the seconds
  `retry_after_seconds` names; `log` is where the work is being written.
  It is a call you make later, never a sleep you hold.
- **`done`** — the session is over and closed. Stop.

Everything the framework now does for itself happens inside those calls:
declaring the work, selecting and running the tests a change makes
necessary, cross-provider verification and its remediation rounds, the
complete suite as the run of record, the commit, the push, and the close.
None of them is yours to run, and none of them is yours to skip ahead to
— the instruction in hand is the whole of what is asked.

**The framework owns the clock, the state and the sequencing.** An
instruction that names a command is answered by running that command —
never by waiting on a condition that your own next call is what causes.
A `wait` answered by watching `run.json` for its job to clear waits
forever: only the `next` you did not call clears it.

**A session that declared itself releasable also publishes**, between the
push and the close, and the framework does that for itself too. A session
that declared `--not-releasable` publishes nothing, which is most of them:
releasability is declared at the start, before the work, and is never
decided afterwards. If a releasable session reaches the close with no
packaging run on its record, the close refuses — a session that was
supposed to ship and did not must not read as one that shipped.

## When the framework stops

- Read the framework's own account before the scrollback: `dabbler status`,
  the `stop` on `.dabbler/runs/s<N>/driver/run.json` with its kind and its
  class, the outstanding instruction's `reasons`, and the transcripts.
- Where the framework is source in this tree you may fix it, and the fix
  rides in this session's own diff; where it is an installed package,
  report the step `blocked` with the diagnosis and raise an owed item.
- Never touch the record, a verdict or a gate to get past a stop. The whole
  protocol is the *When the framework stops* section of dabbler's
  `docs/driving-a-session.md`.

## Hard rules

- State files (`docs/sessions/sessions.json`) and everything under
  `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token the
  framework did not hand you does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The
  same rule covers a feed PAT: configuration names it and never holds it.
- The router is one command, `dabbler <verb>` — nothing to install beside
  the extension: it ships inside the VSIX, and a VS Code terminal has it
  on `PATH`. Anywhere else, run `node "<extension dir>/dist/dabbler.cjs"
  <verb>`. "dabbler: command not found" is a PATH problem, not a keys one.

## Writing files

**Write files with your editing tools, never with a shell heredoc.** On a
Windows host the shell is usually Git Bash, and a heredoc there eats
backslashes: `\n` arrives as a newline and `\\` as one backslash, so
JSON escapes, regular expressions and Windows paths are silently
corrupted on the way to disk. Nothing fails — the file is written, and
it is wrong. The same goes for `echo` and for `printf` with a format
string you did not escape twice.

**Nothing may touch the working tree between a report and the `next`
that judges it.** The framework hashes the tree before and after a
step's checks, and an edit made while one is running refuses the report
— correctly, because a check run against a tree that moved under it
proves nothing about either version. Finish the step, report it, and
wait for the answer before starting the next one.

---

## Engine tail (Codex / GitHub Copilot)

You read this `AGENTS.md` directly. `CLAUDE.md` and `GEMINI.md` import
it rather than repeating it, so this file is the one place the body
exists. GitHub Copilot loads all three files at once and de-duplicates
nothing, which is exactly why only this one carries the body.

Copilot seats: declare `--model` on the first call, the one that
registers, and prefer `DABBLER_TRANSPORT=copilot-cli` when routing
through the seat. Cross-provider verification stays cross-provider on
every transport.

<!-- dabbler:managed:end -->
