# dabbler-ai-orchestration v2

Rebuild of the AI-led coding-session framework. Python package `ai_router`
(distribution `dabbler-ai-router`), plus a VS Code extension under `tools/`
(Session 3). The compatibility contract, module inventory, and session plan
live in the rebuild work plan; `STATUS.md` carries the inter-session handoff.

## Working branch

**Work happens on `master`.** Set 148 builds the session framework there,
per the standing trunk-based directive. Commit to it and push it.

`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are both merged into `master` and are finished. The experiment branch
carried the cheaper verification approach; the design branch carried the
framework specification. Neither is the place to commit now — taking either
one as the trunk strands work where nothing else can see it.

## Ground rules

1. **No new module without deleting one.** The module inventory in the rebuild
   work plan is the ceiling. *(Suspended for sets 142–147 — see "The envelope
   sets 142–147 run under" below.)*
2. **No guard may guard another guard.** Every gate must cite the concrete v1
   incident it would have prevented (the five kept gates each have one; see
   Session 2).
3. **One implementation of any rule, in one language.** TS renders; Python
   decides.
4. **Test budget is a ceiling: 480 Python / 215 TS.** One test per behavior.
   No falsifier-twin doctrine, no tests of test infrastructure, no source-text
   assertions (use ruff/ESLint), no migration-path tests, no tests asserting
   exact markdown strings. *(Numbers suspended for sets 142–147 — see "The
   envelope sets 142–147 run under" below. The one-test-per-behavior rule and
   the banned-test-kinds list are **not** suspended.)*
5. **The machine owns the record.** Nothing under `.dabbler/runs/` is ever
   hand-edited or exempted; no code path may accept a hand-written verdict.
6. **No process ceremony on this repo itself.** Plain git commits with plain
   messages. Do not use v1's session machinery, and do not build v2's own
   machinery around v2's development.
7. **Comments state constraints, not history.** No "Set NNN" archaeology. If a
   lesson matters, encode it structurally.
8. **LOC budgets are targets ±30%, not gates.** If a module wants to be 2× its
   budget, stop and reconsider the design instead of writing a justification.

> **Superseded, 2026-08-23.** The operator has set aside the ground rules and
> the envelope below for the duration of the rebuild — see
> `docs/operator-decisions.md`, which is the governing record. The text is kept
> because the constraints are restored once the replacement works. Read it as
> what returns, not as what is in force.

## The envelope sets 142–147 run under

The operator has relaxed ground rules 1 and 4 for sets 142–147, on the grounds
that the verification-pipeline rewrite is a replacement rather than an
increment. One envelope replaces both, measured against the post-141 baseline
and acting as a **ceiling for the whole sequence**, not a per-set budget to
spend down:

| Dimension | Baseline (`fa3c28c7`) | Ceiling | After 145 s1 | Headroom |
| --- | ---: | ---: | ---: | ---: |
| Python source | 12,650 LOC | **16,800** | 16,327 | **473** |
| Python modules | 25 | **33** | 29 | 4 |
| Python tests | 455 | **605** | 547 | **58** |
| TypeScript tests | 161 | **215** (unchanged) | 161 | 54 |

Measured over `ai_router/**/*.py` by raw line count; the suite figure is
`pytest --collect-only`. **Set 147 is cancelled**, so the sequence in flight
is 142–146 and set 146 closes it. The operator's relaxation window still
reads 142–147, because 147 is restorable; a restore reopens the budget
question rather than inheriting this table.

The headroom column is the point. Session 1 of set 145 alone spent 771 LOC
and 16 tests, so what remains does not cover the sequence at the rate it has
been running. The `verify.py` extraction relocates lines and creates no
headroom. Sets 145 and 146 must be planned against these numbers, not
against the entering counts their specs were written with.

Two rules survive the relaxation unchanged, because they are what the ceilings
were protecting:

- **One test per behavior.** No falsifier twins, no source-text assertions, no
  migration-path tests, no tests of test infrastructure.
- **A module earns its existence by making another module smaller.** New
  modules are permitted; new modules that only add are not. `verify.py` is the
  named target: this sequence must leave it **under 1,200 lines**, by moving
  code out rather than by adding beside it. It stands at **2,367** — it grew
  by 578 during set 145 session 1, so the extraction now has to move roughly
  1,170 lines, double what it was scoped for.

When the sequence ends — merged or killed — rules 1 and 4 resume with their
original numbers.

## Environment

- Windows 11, PowerShell primary. Python 3.11+; `.venv` in the repo root.
- Run tests: `.venv/Scripts/python -m pytest` (no live network outside the
  `e2e` marker).
- Provider keys via env vars: `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`. Never in config or logs.
- Transport preference: CLI flag `--transport` > `DABBLER_TRANSPORT` env >
  `transport.profile` in router-config.yaml > default `api`.

<!-- dabbler:managed:start -->
# AI orchestrator instructions — `dabbler-ai-orchestration`

> `AGENTS.md` is the single source of this managed body; `CLAUDE.md` and
> `GEMINI.md` import it and add only their engine tail. Do not hand-edit
> inside the fence; re-run `python -m ai_router.bootstrap` to refresh it.

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

       python -m ai_router.session start \
           --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

   Copilot seats must also pass `--model` (the seat label is not trusted;
   identity resolves through the model registry). Idempotent — safe to
   re-run after a context reset.

   **Then declare the task list, before you edit anything.**

       python -m ai_router.session declare \
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

       python -m ai_router.affected

   prints the selected tests, the reason each was selected, and the exact
   command to run. Once a verification round exists, selection is measured
   against that round's snapshot, so a remediation runs what the fix
   touched rather than what the session touched. Run it, then record it:

       python -m ai_router.test_evidence record \
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

       python -m ai_router.verify

   The verifier is a different provider than you, on either transport.
   Round outcomes land in `.dabbler/runs/` (machine-written; never edit).
   Blocking findings: remediate, rerun step 4 for the fix, then re-run the
   same command — rounds ≥2 review only your fix delta. The loop suspends
   at the round cap.

6. **Run the complete suite once, against the final verified tree**, and
   record it as the run of record. The command is the `command` the suite
   declares under `testing.suites` in this repository's `dabbler.yaml` —
   the same one `--suite <name>` names here:

       python -m ai_router.test_evidence record \
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

       python -m ai_router.packaging

   Packs, then pushes to the declared feed. It refuses an undeclared or
   not-releasable session, refuses a repository that declares no
   `packaging` block, and refuses until the same gates the close reads all
   pass. The feed credential is named in configuration, never held there:
   it resolves at spawn into one argv element and is placed in no
   environment. `--dry-run` previews the gates and runs nothing.

9. **Close via the gate.**

       python -m ai_router.session close

   Five gates run (verification clean, tree clean, pushed, tests fresh,
   verdict vocabulary); use `--dry-run` any time to preview the rows.
   The close flips the state, then commits and pushes its bookkeeping.

## Hard rules

- State files (`docs/sessions/sessions.json`) and everything under
  `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token you did
  not receive from `ai_router.verify` does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The
  same rule covers a feed PAT: `packaging.push.secret` names it and never
  holds it.
- Run the router through the project venv:
  `.venv/Scripts/python -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. "No module named
  ai_router" is an interpreter problem, not a missing-keys problem.

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
