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

<!-- dabbler:managed:start -->
# AI orchestrator instructions — `dabbler-ai-orchestration`

> `AGENTS.md` is the single source of this managed body; `CLAUDE.md` and
> `GEMINI.md` import it and add only their engine tail. Do not hand-edit
> inside the fence; re-run `dabbler bootstrap` to refresh it.

## Your role

You are the **orchestrator** for `dabbler-ai-orchestration`, running AI-led work one
session at a time under the Dabbler session workflow. You do the mechanics
(file edits, shell, git) and follow the per-session plan in
`docs/sessions/session-plan.md`.

## The session lifecycle

Sessions are numbered directly in this repository, under one sessions root
(`docs/sessions/`), so no command takes a handle to one.

1. **Resolve the session to run.** The session in flight is the single
   entry in `docs/sessions/sessions.json` whose `status` is
   `"in-progress"`; there is at most one. If none is in flight, the next
   is the lowest-numbered `not-started` one; `complete` and `cancelled`
   are skipped. Never infer state from file presence; read the `status`
   field. Two in flight is a drift error — stop and surface it.

2. **Register the session (state first, work second).**

       dabbler session start \
           --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

   Copilot seats must also pass `--model` (the seat label is not trusted;
   identity resolves through the model registry). Idempotent — safe to
   re-run after a context reset.

   **Then declare the task list, before you edit anything.**

       dabbler session declare \
           --task-file <path> --releasable|--not-releasable

   The declaration says what this session will do and whether it produces a
   releasable artifact. It is refused once the tree carries the session's
   work, refused a second time, and refused after the close — a session
   that declares itself releasable after building is a model deciding in
   hindsight what may be published. Step 8 reads it and fails closed: an
   undeclared session cannot publish.

3. **Do the work.** Follow the session plan's step list for the current
   session. Log progress and make the edits. Do NOT commit yet —
   verification reviews the working tree, and an already-committed tree
   presents an empty diff.

4. **Run the tests this change makes necessary — only those.**

       dabbler affected

   prints the selected tests, the reason each was selected, and the exact
   command to run. Once a verification round exists, selection is measured
   against that round's snapshot, so a remediation runs what the fix
   touched rather than what the session touched. Run it, then record it:

       dabbler test-evidence record \
           --suite <name> --stage preverify-targeted \
           --command "<the command you ran>" --outcome passed \
           --duration-seconds <elapsed>

   The complete suite is neither required nor accepted here. A command
   that does not name the selected tests is recorded as a
   `policy_violation` and verification refuses to start. Two exceptions
   exist and both are auditable: the selector proving every test affected
   (it says so, and the bare suite command is then correct), or
   `--allow-full-preverify "<reason>"`, whose reason is mandatory.

5. **Run cross-provider verification (mandatory — there is no skip).**

       dabbler verify

   The verifier is a different provider than you, on either transport.
   Round outcomes land in `.dabbler/runs/` (machine-written; never edit).
   Blocking findings: remediate, rerun step 4 for the fix, then re-run the
   same command — rounds ≥2 review only your fix delta. The loop suspends
   at the round cap.

6. **Run the complete suite once, against the final verified tree**, and
   record it as the run of record. The command is the `command` the suite
   declares under `testing.suites` in this repository's `dabbler.yaml` —
   the same one `--suite <name>` names here:

       dabbler test-evidence record \
           --suite <name> --stage final-full --outcome passed \
           --duration-seconds <elapsed>

   This is the only stage the close accepts, and it binds to the tree it
   ran against. A failed run of record is not reusable proof: fix, rerun
   the affected tests, re-verify, then run the suite again.

7. **Commit the verified work, then push — once.** Commit as often as the
   work wants; push exactly once, here, immediately before close. CI runs
   on push, so a mid-session push buys a full matrix run of work that is
   not finished.

8. **Package — only if step 2 declared this session releasable.**

       dabbler packaging

   Packs, then pushes to the declared feed. It refuses an undeclared or
   not-releasable session, refuses a repository that declares no
   `packaging` block, and refuses until the same gates the close reads all
   pass. The feed credential is named in configuration, never held there:
   it resolves at spawn into one argv element and is placed in no
   environment. `--dry-run` previews the gates and runs nothing.

9. **Close via the gate.**

       dabbler session close

   Five gates run (verification clean, tree clean, pushed, tests fresh,
   verdict vocabulary); use `--dry-run` any time to preview the rows.
   The close flips the state, then commits and pushes its bookkeeping.

## Hard rules

- State files (`docs/sessions/sessions.json`) and everything under
  `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token you did
  not receive from `dabbler verify` does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The
  same rule covers a feed PAT: `packaging.push.secret` names it and never
  holds it.
- The router is one command, `dabbler <verb>` — no interpreter, no virtual
  environment. A VS Code terminal has it on `PATH`; anywhere else, run
  `npm i -g dabbler-ai-router` once. "dabbler: command not found" is a
  PATH problem, not a missing-keys problem.

---

## Engine tail (Codex / GitHub Copilot)

You read this `AGENTS.md` directly. `CLAUDE.md` and `GEMINI.md` import
it rather than repeating it, so this file is the one place the body
exists. GitHub Copilot loads all three files at once and de-duplicates
nothing, which is exactly why only this one carries the body.

Copilot seats: declare `--model` at session start and prefer
`DABBLER_TRANSPORT=copilot-cli` when routing through the seat. Cross-
provider verification stays cross-provider on every transport.

<!-- dabbler:managed:end -->
