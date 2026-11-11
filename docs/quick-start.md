# Quick start

Prerequisites: git, and the `dabbler` command.

**Install the extension, and that is the whole of it.** The Dabbler AI
Orchestration extension bundles the router and puts `dabbler` on the
integrated terminal's PATH, run on the editor's own Node: there is no
package to fetch, no interpreter and no virtual environment. `dist/
dabbler.cjs` inside the VSIX is the same router the tree calls in-process,
so the terminal and the views cannot disagree about what the record says.

VS Code 1.135 or newer, and nothing else — inside the editor the router runs
on the Node that VS Code already carries.

Outside a VS Code terminal — another editor, a bare shell, or a commit made
from the Source Control panel, whose git does not inherit the terminal's
environment — run the same file directly. **That path needs a Node of its
own, 22.18 or newer**, because there is no editor to borrow one from:

```
node "<extension dir>/dist/dabbler.cjs" <verb>
```

There is deliberately no `npm i -g`: the router was published to no registry
as of 2026-09-02, because the extension already carries it and a second
distribution is a second thing to keep in step.

Then a way to reach models. Either a GitHub Copilot seat with the Copilot
CLI — the shipped default transport — or the direct provider APIs: put at
least two keys in env vars (`DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`) — verification needs a
second provider — and select that path with `dabbler configure --transport
api`.

**Install the Copilot CLI with WinGet**: `winget install GitHub.Copilot`,
which puts `copilot.exe` on PATH. Avoid the npm package
(`@github/copilot`): it puts a `copilot.cmd` shim there, and `cmd.exe` cuts
a prompt at its first newline. If you already have it, `npm uninstall -g
@github/copilot` first. The Solution Explorer's Vehicle row says which one
this machine has, and says so when it has no engine CLI at all.

**In VS Code, the Configuration comes first.** Open the folder and the
Solution Explorer shows its **Configuration** section before any project
exists: the authoring AI's vehicle and model, and who reviews it. Set them
there before setting the project up. A machine that has never read its
Copilot seat or its vendors' model lists reads them itself the first time
the section is shown — `dabbler discovery refresh`, free, with no prompt
sent — so there is a list to choose a model from.

![The Dabbler AI Orchestration views before a folder is open: the Solution
Explorer explains that it shows the Configuration first and offers Open
Folder; the Work Explorer says nothing has run here yet and offers Set Up
New Project.](guide/media/first-1-empty.png)

## 1. Bootstrap a project

From your project root:

```
dabbler bootstrap --project-dir .
```

This writes a fenced managed block into `AGENTS.md` and `CLAUDE.md`.
`AGENTS.md` carries the body; `CLAUDE.md` carries a one-line
`@AGENTS.md` import plus its engine tail, so the instructions exist in
exactly one place. Both are written because no single engine reads both:
Copilot reads `AGENTS.md` and Claude Code reads only `CLAUDE.md` — while
Copilot reads each of them and de-duplicates nothing, which is why only
one may hold the body. Claude Code expands `@file` imports at load time.
Existing files keep their user content; only the fenced section is
refreshed. Re-run the command any time to refresh it.

It also adds `.dabbler/` to the project's `.gitignore` (once; existing
rules are preserved). That directory is the router's machine-side
record — each verification round is written there *after* the tree
snapshot it describes, so a committed ledger would present itself to the
close gate as work done after verification.

![A new project's folder, csv-parser-dotnet, after it is set up: .dabbler,
docs, .gitignore, AGENTS.md, CLAUDE.md and
dabbler.yaml.](guide/media/first-2-files.png)

**It writes nothing outside the project.** `--transport
api|copilot-cli` sets the checkout's own vehicle, in its
`.vscode/settings.json`; omit it and the project's configuration decides.
Bootstrap used to detect a seat and persist `DABBLER_TRANSPORT` at user
scope, which shadowed whatever a later `dabbler configure` set, for every
repository on the machine. The variable is retired and nothing reads it;
if it is still set in your environment, unset it.

Into a project with no session plan yet, it also scaffolds the two setup
sessions into `docs/sessions/session-plan.md`. Choose
**Start Session** on the repository's row in the Work Explorer: session 1 authors (or imports)
`project-plan.md` under `docs/planning/` through the normal tracked pipeline
(register → work → cross-provider verification → close), and session 2
breaks that plan into the numbered sessions the rest of the repository
runs. Do not hand-author `sessions.json` — the first session start creates
it from the plan.

![The Work Explorer for csv-parser-dotnet with nothing run yet: two
sessions planned, 001 "Author or import the solution plan" and 002
"Challenge the plan, then break it into numbered
sessions".](guide/media/first-3-two-sessions.png)

![The Work Explorer after session 2: 001 and 002 complete, and 003
Skeleton, 004 Domain model, 005 CSV deserialization, 006 Database layer and
007 Console application planned.](guide/media/first-4-sessions.png)

Prefer the untracked route? The same prompts are available loose:

```
dabbler bootstrap --print-plan-prompt
dabbler bootstrap --print-decomposition-prompt
```

### 1b. The solution is its build files

Nothing is declared beside them. The Solution Explorer reads the root
`.slnx`, `.sln` or `pom.xml` — every `.csproj` or `pom.xml` under the
root where there is none — and shows each project, what it references and
what references it. A project reaches a sibling by project reference — a
`<ProjectReference>` listed in the root solution file for .NET, a dependency
at `${project.version}` listed in the parent `pom.xml` for Maven — and every
session runs in the repository itself. A repository with no build files is one
project: itself.

![The Solution Explorer for csv-parser-dotnet with its five projects:
PersonModel, CsvDatabase and CsvDeserializer (libraries), CsvParserApp (an
application) and CsvParser.Tests (a test project), opened to show that it
depends on the other four.](guide/media/first-5-projects.png)

## 2. Start a session

```
dabbler session start --engine <engine>
```

No command names a sessions root: there is one per repository and it is
derived from the working directory.
`--engine` is required — `claude-code` or `copilot`;
`--provider`, `--model`, and `--effort` record the seat identity
(Copilot seats must pass `--model` — the seat label is not trusted).
`codex` is accepted and recorded like any other name, and is left
undocumented here because it is **untested**: no session has been driven
through it. The lifecycle does not care which engine name it stores, so
nothing refuses it and nothing claims it was tried. The start registers
the session in
`sessions.json` and
seeds the spec's step list into `activity-log.json` once. It is
idempotent — safe to re-run after a context reset. It refuses to start
a session that is already in flight, re-open a completed one, or skip
ahead.

## 2b. Run it — the whole session, one command

In VS Code, **Start Session** does 2 and opens your AI's CLI with the one
sentence it needs. From a terminal, tell your AI to run:

```
dabbler session next --sessions-dir docs/sessions
```

That prints the first instruction. From there every answer asks for what
follows it: the AI does what an instruction says and starts its
`answer_command` — a `dabbler session report ... --next` — as a background
command, which stays open while the framework checks, tests, reviews,
commits and pushes, and prints the next instruction when it exits, until
one says `done`. The chat stays free for you the whole time, and no
framework process sits waiting for the AI. `dabbler session run` without
`--mailbox` invokes the registered engine per instruction itself, headless;
with `--mailbox` it is the older long-lived loop, kept as a fallback you
start by hand, under which the AI keeps `dabbler session wait` running
instead. Your whole vocabulary is **start, interact, cancel**: `dabbler
session interrupt --reason "..."` talks to a running session, and `dabbler
session cancel` is the way out. Everything else — instructions and reports —
is the machinery's conversation with the engine, not yours; you never type it.

In VS Code the Dabbler terminal sits beside your AI's and only watches: the
phase, who owes what and for how long, and each job's output. Closing it
changes nothing about the session, and reopening it shows where the session
is. An interruption reaches the AI with its next instruction; one sent with
`--stop` (Stop Session) ends the framework's work where it is, and asking
the AI to run `dabbler session next` carries on. The AI may cancel the
session it is working — `dabbler session cancel <its number> --reason
"<why>"` — and leaves your working tree as it was; cancelling any other
session, and `--force`, are yours.

## 3. Work the steps

Follow the spec's step list for the current session: make the edits and
run the tests. **Do not commit yet** — verification reviews the working
tree, and an already-committed tree presents an empty diff.

![The editor's own Test Explorer with csv-parser-dotnet's tests: 55 of 55
passed in CsvParser.Tests (net10.0), across classes such as
CsvPersonReaderTests, PersonRepositoryTests and
ProgramTests.](guide/media/first-6-tests.png)

There is nothing to log. The Work Explorer's task rows are the
lifecycle's six phases — *Register*, *Declare*, *Work*, *Verify*, *Run of
record*, *Close* — and each one is done the moment the verb that is that
phase writes its record: `session start` the first, the accepted plan --
which is the declaration -- the second, the pre-verification evidence record the third, a clean
`verify` round the fourth, the `final-full` record the fifth, and the
close the last. The open row is the first not done. No command moves a
row by hand, so a row that reads "in flight" is one whose record does not
exist yet, never one an engine forgot to tick.

### Executing an approved plan, one step at a time

When the session's work is pre-registered as an approved plan
(`approved-plan.json` under `.dabbler/runs/s<N>/`), the steps are executed
through the framework rather than freehand. One step is in flight at a
time:

```
dabbler verify step open   --step <step_id>
dabbler verify step status
dabbler verify step close 
```

`open` anchors the step to the current `HEAD` and prints the paths it may
touch. `close` then asks two questions, both free and both before any
model is paid anything:

1. **Did the work stay inside the declared envelope?** Git says what
   changed, the plan says what was declared, and set difference decides —
   no model is asked whether you stayed inside your own plan. A path
   outside is **refused**, as an amendment requirement rather than a
   warning. Either move the change back, or carry the widening on the
   record, where it is re-reviewed against the risk the wider envelope
   earns:

   ```
   dabbler verify step amend \
       --add-file <path> --reason "<why the declared envelope was wrong>"
   ```

2. **Is the deterministic evidence green?** The declared controls
   (`testing.controls`: compile, typecheck, lint, analyzer) and the tests
   the step's own changed paths select. A red required result comes back
   to you here, because an exit code has already settled what a reviewer
   would be paid to notice.

**You do not commit while a step is open.** `dabbler bootstrap` installs a `pre-commit` hook that refuses a manual
commit while a step is open and names the command that closes it. The
binding check is not the hook — `--no-verify` bypasses any hook — but
`step close` itself, which refuses when `HEAD` has moved off the commit
the step opened on.

A closed step's work therefore stays in the working tree, and the next
step opens on the same commit and sees it. That is expected: each close
records a snapshot of the tree, and the next step's change set is
measured from that snapshot rather than from the commit — so a plan's
steps close in sequence with no commit between them, and touching an
earlier step's file again is still your open step's work, refused unless
your own envelope declares it. The session's work is committed once the
last step is closed, and pushing stays a session-boundary act: once, at
close.

## 4. Verify (mandatory, before commit)
```
dabbler verify
```

- **Round 1** sends the full evidence: spec excerpt, `git status`, the
  complete working-tree diff, untracked file contents.
- **Rounds ≥ 2** send only the fix delta (a diff from the previous
  round's recorded tree snapshot) plus the prior unresolved findings.
- The **Primary Reviewer** is the role that returns the verdict, and it
  is defined as *not the author*. Where nobody has selected a model it
  resolves on a different provider than the orchestrator, on either
  transport; one retry excludes a failed provider.
- Each round appends one row to
  `rounds.jsonl` under `.dabbler/runs/s<N>/` — machine-written only, never
  edit it — with the raw reviewer output saved alongside.
- On blocking findings (`critical`/`major`): remediate, then re-run the
  same command. The loop suspends at the round cap
  (`verification.settings.max_rounds`, default 3). `dabbler verify
  --max-rounds` overrides it for a round you run by hand; inside a driven
  session the cap is not typeable at all and moves only through `dabbler
  session plan amend --max-rounds`, which records a reason beside who was
  working (see [driving-a-session.md](driving-a-session.md)).

### If a blocking finding is contested: dispute → adjudicate

A finding you believe is wrong is not remediated by grinding rounds.
The ladder, in order — every refusal along the way prints the next
rung's exact command:

1. **Dispute** — rebut the finding on the record. Evidence is
   mandatory (at least one existing repo path, optionally with a line
   range as `path:START-END`); prose-only disputes are refused. The
   next round presents the rebuttal beside the finding and the
   Primary Reviewer must UPHOLD it with reasons or WITHDRAW it.

   ```
   dabbler verify dispute \
       --round <R> --finding <F> --grounds "..." --evidence <path>
   ```

2. **Adjudicate** — at the round cap, with every blocking finding
   disputed, the **Auxiliary Reviewer** judges them. Its own definition
   is *not the author and not the primary*, so a third voice is what the
   role IS rather than a rule bolted on: no provider that orchestrated or
   reviewed a round is eligible. It judges each dispute
   (UPHOLD or OVERRULE, with reasons; it may not raise new findings)
   and writes one terminal ledger row. All overruled → the session is
   clear to close; any upheld → the session is unresolved. One
   adjudication per session, ever; no verification round may open
   after it.

   ```
   dabbler verify adjudicate
   ```

There is no third rung, and no waiver of a verdict: no verdict a person can
type exists anywhere in the loop. (A person may let a session past a stop
with `dabbler session waive`; the record keeps the verdict it truly had.) An undisputed session that reaches the cap
ends in one of two states the loop decides for itself — re-run the same
`verify` command and it records whichever the tree says it is:

- **Remediated at the cap** — every blocking finding of the last round
  was fixed (the tree has moved past the round that raised them) and the
  fix passed its own targeted tests, but the cap left it unreviewed. The
  work lands, labelled unreviewed, and the close gate says so.
- **Unresolved** — the tree has not moved, so nothing was remediated.
  Nothing lands but the record, and the close stays blocked.

Remediated-at-the-cap is not a waiver. A waiver accepted work over a
finding that still stood; here nothing stands, and what is unproved is
the repair rather than the complaint.

Then record the test run of record and commit/push the verified work:

```
dabbler test-evidence record \
    --suite <name> --outcome passed --duration-seconds <elapsed>
```

## 5. Close

```
dabbler session close
```

Five gates run: verification clean (reads the round ledger),
working tree clean, pushed to remote, test run fresh, verdict
vocabulary. All pass → the session flips state, and the close commits and
pushes its bookkeeping.

```
dabbler session close --dry-run
```

previews the gate rows read-only at any time. `--force` bypasses
bookkeeping gates only — never the evidence gates — and stamps
`forceClosed` in the state.

## Cancel and restore

```
dabbler session cancel <n> --reason "why"
dabbler session restore <n> [--reason "why"]
```

Cancel records the reason and the stamp on the session's own record and
preserves the status it had; restore returns that session — and only that
session — to it. `--force` cancels even with a session in flight.

## This repository's config (`dabbler.yaml`)

Tracked, at the project root, deep-merged over the packaged default. It
carries the three blocks a repository owns, behind a `schema_version`:

```yaml
# dabbler.yaml
schema_version: 1
testing:
  suites:
    - name: python
      command: python -m pytest
      covers: [src/, tests/]
      test_roots: [tests]
      test_glob: "test_*.py"
      test_name: "test_{name}.py"
      select: python -m pytest {paths}
packaging: {}          # omit entirely if this repository publishes nothing
paths:
  sensitive_paths: []
```

- **Tracked, unlike the gitignored `local-overrides.yaml`.** CI reads the suite command, the
  next machine reads how its tests are named, and `dabbler affected`
  refuses to run without them.
- A source file's tests are the tests named after it. `test_name` is the
  name they take, `{name}` standing for the source file's stem, and
  `select` runs a selection: `{paths}` the selected test files, `{names}`
  their class names. After each step the framework runs the tests named
  after what the step changed.
- `test_roots` and `test_glob` belong to a **suite**, not the
  repository: one that is Java and .NET at once has two of each.
- `packaging` says *how* a release publishes: a `pack` with a `push`, a
  `pack` alone whose artifacts are handed over from the run's package
  folder with a release tag, or `release: tag`. It is written by a
  packaging session of its own, and only a release session — headed
  `(release: <version>)` in the session plan — publishes.
- Providers, models, roles and transports are not declarable here.
  `AI_ROUTER_CONFIG` is not the way round that — a named config takes
  no layer at all, so it forks the whole registry rather than adding
  to it.

## This machine's configuration

Which engine authors, on which model, which models review, and how each is
reached are chosen in the Solution Explorer's **Configuration** section, or
with `dabbler configure`. Every choice is this repository's own and is
written to its committed `.vscode/settings.json`; the machine's
`preferences.json` holds only the default for a repository that names
none. A typed flag outranks the checkout, the checkout outranks the
machine, and the machine outranks what the distribution ships.
`DABBLER_TRANSPORT` and `transport.profile` in `local-overrides.yaml` are
retired. `dabbler configuration explain` names the layer that decided each
value. [The Configuration](guide/configuration.md) goes through it row by
row, with what a Copilot seat and direct API keys each need.

## Refreshing the model catalog

Reading what models this machine can reach costs nothing: each vendor's
metadata endpoint and the Copilot seat's reply to opening a conversation
state them, and no prompt is sent. `dabbler discovery refresh`, or
**Update the Catalog** on the Configuration row, writes the reading to
`ai-model-catalog.json` in this platform's per-user data directory
(`%LOCALAPPDATA%\dabbler\` on Windows), and is refused while a session is
in flight. See *Where the model lists come from* in
[The Configuration](guide/configuration.md).

## Talking to an agent over its own protocol

`dabbler agent` is a measuring instrument, adopted by nothing yet. It
opens a conversation with an agent through the one interface the
framework needs — open (fresh, or resumed **by id**), send a message,
receive structured events, cancel — and prints what was negotiated as a
first `{"kind":"open"}` JSON line (the handshake's reply and the reply to
opening the conversation, as the agent gave them); sends one prompt and
prints every event the agent produces as one JSON line on stdout as it
arrives; prints the turn's outcome as a final `{"kind":"turn"}` line; and
closes:

```
dabbler agent prompt "<text>" [--engine copilot|claude-code] [--model <id>]
                     [--resume <session id>] [--cwd <dir>]
                     [--permissions allow|deny] [--cancel-after <seconds>]
```

`copilot` (the default) speaks the Agent Client Protocol to `copilot
--acp`; `claude-code` speaks Claude Code's stream-json conversation. Both
are implementations of the same interface: tool calls arrive as `tool`
and `tool-update` events, not as screen paint; `--cancel-after` ends the
turn from the client's side and the final line says `cancelled: true`
whatever word the agent used. What a resume replays is the agent's to
decide: the Copilot seat sends the conversation's history back, and it is
printed before the turn with each event marked `replayed`; Claude Code
replays nothing, and the turn simply continues the named conversation.

**When the agent asks whether a tool may run, nobody is asked.** The
answer is a policy stated on the command line: `--permissions deny` (the
default) answers every request with the agent's reject option, and
`--permissions allow` with its allow-*once* option — never "always",
because the decision is the framework's and is not handed to the agent's
memory. A request that arrives after a cancel is answered `cancelled`.
What the Copilot seat actually answered on this machine is recorded in
`docs/acp-walkthrough.md`; the Claude Code implementation has been run
only against the scripted peer in its tests, and the walkthrough says so.

## The Work Explorer (VS Code)

Install the extension VSIX
(`code --install-extension dabbler-ai-orchestration-1.0.0.vsix`). The
AI Work Explorer view shows one row per repository in the window that
has a `docs/sessions/` ledger, its numbered sessions beneath it — `001`,
`002`, ... in ledger order, each with its status glyph — and, under the
in-flight session, its step rows. The tree is a pure renderer of

```
dabbler status --json
```

so what the extension shows is exactly what the gates read. A
repository whose projection cannot run shows no sessions and says so;
it never guesses a status from which files exist.

Row actions: the repository row opens the four sessions-root artifacts
(plan, activity log, change log, ledger) and carries **Start Session** and
**Close Session**. Start registers the session, starts the framework's loop
in a terminal of its own, and opens the engine you pick in its own CLI,
which answers each instruction the loop writes; nothing is copied for you
to paste anywhere. That whole flow, and what you will see, is in
[driving-a-session.md](driving-a-session.md).
A session row opens the plan at its own section, and carries cancel or
restore — a cancellation is a decision about one session.

## The Solution Explorer, across repositories

A solution is more than one repository, and each one declares only its own
half of the graph in a tracked `solution-dependencies.json`: which of its
dependencies are yours, and which repository builds each. The union of those
files is the graph — no superproject, no shared mutable state — and the
Solution Explorer renders it.

### Three location states, not two

A row for a package another repository builds says where that repository is
on **this machine**, and there are three answers rather than two:

| State | What it means | What you do |
| --- | --- | --- |
| here | a checkout is on this machine | **Open Repository**, **Open in New Window**, **Reveal in File Explorer** |
| not cloned here | the declaration names a remote, and nobody has cloned it | **Clone This Repository** — or point at a folder you already have |
| location undeclared | nothing says where it lives at all | **Say Where This Repository Is (Remote)**, **Point at a Local Folder**, or **Create This Repository** |

Only the last one needs a person. A known remote is a command away, and
collapsing the two into one word ("absent") asked a person in both cases and
offered them nothing to do in either.

Every action writes the declaration through the router, never by hand:

```
dabbler deps locate --repository csv-model --remote git@github.com:you/csv-model.git
dabbler deps locate --repository csv-model --path ../csv-model
dabbler deps clone  --repository csv-model
```

`locate` records a folder, a remote, or both, on every edge that names that
producer. `clone` refuses unless a remote is declared and no checkout is
already found, clones into the first declared search path, and records where
it landed. Nothing here is verified against the world: a remote that is not
reachable and a path that is not a checkout are reported states, and both are
better than a graph that says nothing.

### The repositories, including the ones nothing depends on

Under **Solution repositories** is every repository in the solution — this
one first — with what you take from it and what it takes from here. Both
directions are *derived*: your edges say the first, its edges say the second,
and neither is written down twice.

A repository is in that list because **its own declaration names this
solution**. That is the whole rule, and it is why a repository nothing yet
depends on can appear at all (D254).

### Scaffolding the next repository before it exists

A plan that spans repositories can put the ones it will need in front of you
now:

```
dabbler deps scaffold --repository csv-cli
```

It creates the directory beside this repository, runs `git init`, and writes
a `solution-dependencies.json` that declares which solution it is in and its
own id — no edge, no `produces`, no version, because a scaffold that guessed
at those would put a claim in the graph nobody made. The row appears
immediately, marked *placemarker — no edges yet*, so finishing one repository
leaves the next one visible instead of leaving you to remember it.

One VS Code window over all of them:

```
dabbler workspace
```

writes a multi-root `.code-workspace` under `.dabbler/` from the graph. It is
derived local state carrying paths only this machine has; it is never
committed.
