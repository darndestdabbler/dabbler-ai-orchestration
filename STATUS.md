# STATUS — session 24 of 35 landed: the extension talks to the interface, and Python answers

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Recorded, 2026-08-28.** Session 24's deliverables are decisions
> **D150–D162** in `docs/sessions/decisions-log.md`; session 23's are
> **D138–D149**, plus the amendments inside
> `docs/ts-port-parity-control.md`. This file summarises them; the
> decisions are the record.

## Where things are

- **Session 24 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the
  API), the round-3 finding **disputed and OVERRULED** by a third provider
  (gemini-flash/google). Claude Code / claude-opus-5[1m] orchestrator.
  **Closed through all five gates, at the second attempt.** The first
  close used `--force` to get past the freshness gate and marked sessions
  25–35 of the port plan `complete`, because `forced` promotes every open
  session — a forensic marker for abandoning a set, not a way past one
  gate. The ledger was restored from the pre-force commit, the full suite
  re-run, and the session closed normally with no `forceClosed` stamp.
  **D158** carries the whole of it, including the three framework defects
  it exposed; the traps are written into `AGENTS.md` so the next engine
  meets them before the tool.
- **The seam is in, and `src/router/` IS the Python implementation.**
  `pythonSpawnRouter` builds the argv and satisfies `Router`; `routerCli`
  runs it, echoes it and classifies the exit code; `pythonInterpreter`
  finds the interpreter; `projectionPayload` narrows what comes back;
  `host.ts` is the composition root and the only file callers import.
  Nothing outside the directory imports any of them. The one declared
  exception is `commands/bootstrapProject`, which creates a venv and
  pip-installs the router — it runs before there is a router to ask
  (**D154**). Session 35 changes one line in `host.ts`.
- **`types.ts` is deleted (D139's purpose served).** Its 209 hand-kept
  lines are the generated `ProgressProjection`, imported under the
  extension's own names by alias, so a schema change is a compile error at
  every call site. `SessionsRepository` — the extension's own row shape,
  never part of the projection — moved to `utils/fileSystem.ts`, where it
  is built.
- **The extension no longer emits TypeScript (D150).** Reading the
  router's types from source needs `allowImportingTsExtensions`, which
  TypeScript permits only under `noEmit`. Nothing consumed the emit:
  `dist/extension.js` is esbuild's, the unit suite runs the sources
  through ts-node, Playwright transpiles its own specs, CI typechecks with
  `--noEmit`. The one consumer was the `@vscode/test-electron` harness the
  extension's CHANGELOG records as broken and CI has never run;
  `src/test/runTests.ts` and `src/test/suite/index.ts` went with it.
- **The router package is importable at last (D151).** `main:
  src/index.ts` gave it no importable form — ts-node refuses to `require`
  any `.ts` under a `"type": "module"` package. `build.mjs` now emits
  `dist/index.cjs` beside `dist/dabbler.cjs`; `main` points at the bundle
  and `types` at `src/index.ts`, so a consumer type-checks against the
  source and links against the bundle with no declaration in between to go
  stale. `prepare` builds it, so `npm ci` produces it and neither CI nor a
  fresh clone needs a new step.
- **Two live defects surfaced and fixed.** `ai_router.modules create
  --title` is `required=True`, and the extension omitted it whenever an
  operator accepted the default title — New Module's likeliest path was
  sending an argparse usage error (**D153**). `troubleshoot` printed
  `python -m ai_router.report`, a module set 109 removed, beside
  per-session dollar figures the router has had no rate table to produce
  since then.
- **`PythonSpawnRouter` builds argv only for verbs read off the Python
  parser (D152).** A first pass implemented all 32 `Router` methods from
  the contract's option names, and three were wrong: `ai_router.modules`
  has exactly one subcommand (`create` — there is no `list` or `retire`),
  and `verify dispute` takes `--finding`, not `--finding-index`. The other
  twenty refuse by name. **Owed:** sessions 30/32/34 port those modules
  and should reconcile the contract rather than inherit a shape nothing
  ever ran.
- **Suite: 942 Python (5:03 at `-n 2`) / 11 router vitest / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged — no new tests, as the plan estimated. Net TypeScript in the
  extension is **+178 lines**, not the net-negative the plan estimated:
  `implements Router` requires all 32 methods, and the twenty that refuse
  still cost their signatures.

- **Sessions 22–35 are landed** in `docs/sessions/session-plan.md` (commit
  `d77a075a`, `totalSessions: 35`): the port of `ai_router` to TypeScript so
  the framework ships as one Marketplace artifact and a project holds only
  its own record — **D128**, operator. **Session 22 is closed
  `VERIFIED`** (3 rounds, gpt-5-6-sol over the API; every finding
  Minor). A prose session: Claude Code / claude-fable-5 orchestrator, no code,
  no test.
- **The inventory is decided (D129):** 38 modules ported, 4 merged, 3
  retired; 832 tests ported, 109 deleted. Three departures from the plan's
  default table, each from the import graph: `facts` is verification's
  deterministic-controls module (ported, session 31); `fixloop` and
  `testphase` are imported by the six-step `workflow` (ported, session 34);
  `journal` and `verifyjob` split — the git seam and the prompt/auto-verify
  functions are kept, their run-core halves retired. Only `runcli`,
  `runcore` and `runproject` retire outright.
- **D88 is resolved by the plan's default (D130):** the run core is retired
  and deleted in session 34. It is an orchestrator's application of an
  operator-set default; **the operator can override until session 34
  starts**, and nothing is deleted before then.
- **Runtime floor measured, not remembered (D131):** VS Code 1.135.0's
  extension host is Electron 42.8.1 / Node 24.18.1 and `node:sqlite` loads
  unflagged (`ELECTRON_RUN_AS_NODE=1 Code.exe -e …`); system Node 25.8.1
  likewise. Layout: `packages/router` (npm `dabbler-ai-router`, `bin:
  dabbler`) under root npm workspaces, esbuild bundling both into the VSIX.
  **Dependency ceiling (D132):** `yaml`, `ajv`, `smol-toml`; nothing native;
  a fourth is a decision in the log.
- **The parity control is designed (D133) and built (D141, D146):**
  `docs/ts-port-parity-control.md`, amended in three places by building it.
  It runs **two** comparisons and is red if either drifts: every corpus
  shape built twice through the Python router and compared byte for byte
  (from session 23), and every ported verb through both routers (from
  session 26). `npm run parity`, plus `--build`, `--self-check` and
  `--shapes` by hand.
- **Session 23 is closed `VERIFIED`** — 3 rounds, gpt-5-6-sol over the API,
  the third round's single finding **disputed and OVERRULED** by a third
  provider (gemini-flash/google). Claude Code / claude-opus-5 orchestrator.
  Its deliverables:
  - `packages/router` (npm `dabbler-ai-router`, `bin: dabbler`) under a
    root npm workspace with the extension; `tsc --strict`, ESLint, vitest.
    The CLI bundles to **`dist/dabbler.cjs`** — CommonJS as D131 says, but
    `.cjs`, because a `.js` under `"type": "module"` is an ES module
    whatever is inside it (**D138**).
  - **Types generated from every schema** into `packages/router/src/
    generated/`, checked in, with a `compile` control that fails when they
    are stale. A **twenty-first schema** was written — `progress --json`
    had none, and its only statement was the hand-kept `types.ts` this
    session exists to replace; it validates a real 35-session projection
    with zero errors and nothing reads it yet, so no behaviour moved
    (**D139**).
  - **The `Router` interface** — one method per verb, refusals as values
    over the published exit codes (0/3/4/other), and the schema-backed
    answers returning their generated types (`progress`,
    `approvedPlan.read`, `ledger.latestRound`). The `dabbler` verb list is
    one table; a verb is available when a handler is registered, so there
    is no session number to bump (**D140**).
  - **This repository's first declared controls**, all four kinds and all
    `required: true`: `compile` (type staleness), `typecheck`, `lint`,
    `analyzer` (parity). Green in ~16 s through `facts`. Each command is
    argv for `node`, because `facts` runs controls with no shell and
    `npm`/`npx` are shims argv cannot reach (**D142**).
  - **The `typescript` suite** declared beside `python`, with selection
    rules for every new path, so `affected` selects across both. CI
    installs at the workspace root on Node 24 and gains a `router` job.
- **The run ledger is no longer tracked (D135, operator):** `.gitignore`
  ignores `.dabbler/` whole, which is the rule `bootstrap` writes for every
  project. Rounds no longer travel between machines — a session finishes
  where it started — and the record of each session's rounds lives on the
  machine that ran it. As a side effect the selector's 208 false
  `selection_unknown` rows (D134, a latent defect kept owed at low priority)
  and the close's uncommitted-residue habit are gone from this repository.
- **Session 22's seat cost is measured (D136)** in the two currencies it
  had: the orchestrator's Claude Code context and the verifier's API tokens.
  No dollar figure — set 109 removed the rate table, and the router prices
  nothing.
- **Set 148 is complete: 21 of 21 sessions closed**, 2026-08-26 → 2026-08-28;
  19 `VERIFIED`, 2 `REMEDIATED_AT_CAP` (sessions 12 and 17, whose final fixes
  are unreviewed by construction — the D122 gap). Its acceptance is **D127**.
- **Router `dabbler-ai-router` 1.1.0** (tag `v1.1.0`); **extension 1.0.4**
  (tag `vsix-v1.0.4`). Both become 2.0.0 at cutover (session 35).
- **Suite: 942 Python (4:43 at `-n 2`) / 11 router vitest (0.8 s) / 153
  extension mocha (0.3 s); all four declared controls green.** The Python
  suite gained one test (the gate fix, D143) and about a minute, because a
  second expensive suite doubles the `git ls-files` spawns in every
  pre-verification gate call. `packages/router` is ~1,900 lines of source
  (1,400 of them generated) and ~200 of tests. `verify.py` is 2,537 lines
  and is ported as five files in session 32.

## Acceptance evaluation for set 148 — recorded as D127

Criterion met (session 20 ran end to end on the framework the set built);
check 1 (every plan item exactly once) met; check 2 (no skipped step, no
foreign verdict) met; **check 3 (seat cost measured from session 3 onward)
not met** — measured for sessions 1, 3, 4 and 5 only, and **not
back-filled** by operator decision. The step carries forward: every session
of the port plan carries "measure this session's seat cost" as a numbered
step, and session 22 executed it (D136). The full evaluation with its table
is D127; the previous version of this file carried it in full.

## Owed, from the record

| Source | What is owed |
| --- | --- |
| **D122 gap** | No path by which a verifier reviews a remediated-at-the-cap fix. Sessions 12 and 17 ended that way, so their last fixes are unreviewed today. |
| **D116** | A targeted-run form for filter-style runners (Maven `-Dtest=`, `dotnet test --filter`) plus the audit rule that checks one. "A session, not a patch." The port's vitest path-list form does not need it. |
| **D124** | Record the round cap on the round row as `verify.py` writes it; the unresolved-session view reads the live cap for a historical session. |
| **D126 nit 1** | `append_round` must refuse when the tree resolves and the anchor fails (`ledger.py`). Carried across the port unchanged (session 26). |
| **D114 nit 2** | `build_task_rows` renders a leaf, not a refusal, when `approved-plan.json` is missing while `step-execution.jsonl` carries an open step. |
| **D130 (was D88)** | Not owed — decided. The operator's override window on retiring the run core is open until session 34 starts. |
| **D134** | Round-1 change sets measure HEAD's raw tree against a snapshot that drops `.dabbler/`, so a repository that tracks its ledger reports it as deleted. Moot here since D135 and **confirmed moot** — session 23's first selection reported zero `selection_unknown` rows against 208 in each of 19–22 (D144). Latent elsewhere. If fixed on the Python side, do it before session 27 ports `affected`. |
| **D147 — RULED (D159)** | **A plan defect, and the one thing owed back to the operator from session 23.** Step 5 of session 23 asks for a control that runs a verb through **both** routers *and* for that control to be declared required — in a session the plan gives no second router. The adjudication resolved this session; it did not amend the plan. Decide whether step 5's wording changes or the first parity case moves earlier. The substantive answer is already scheduled either way: session 26 lands the first ported verb and its parity case. |
| **D149 — RULED (D160), reproduced in D157** | Deleting a tracked file moves the whole-tree digest across the commit, because `git ls-files` still lists a tracked-but-deleted path and `surface_digest` writes it a literal `"deleted"` hash. Session 24 proved it exactly: the run-of-record digest is reproduced bit-for-bit by taking the committed tree and re-adding five `path\0deleted` lines — no file content differs, and the Python suite's own `surfaceDigest` is unchanged. **The operator refused the second full run and the session force-closed instead.** Fix at the git seam (omit an unreadable path rather than hashing the word "deleted") or bind to the commit's tree. It changes a gate, so it is the operator's call — and session 27 ports `evidence`/`test_evidence`, so deciding before then is worth more than after. Until then every session that deletes a tracked file pays one extra full-suite run or one forced close. |
| **D158 — framework** | `session close --force` promotes EVERY open session to complete, and its help says only "bypass bookkeeping gates". It cost session 24 a damaged ledger and a restore. Three fixes owed: say what the flag does; refuse (or require a second flag) when it would promote sessions that are not in flight; and stamp `forceClosed` on the session's row rather than the repository, so the ledger can say which session forced a close. Until they land, the trap lives in `AGENTS.md`'s preamble. |
| **D152 — RULED (D162)** | `ModuleVerbs.list`/`retire`, and several `VerifyVerbs`/`WorkflowVerbs` option names, describe a Python surface that does not exist in those shapes (`ai_router.modules` has only `create`; `verify dispute` takes `--finding`). Sessions 30/32/34 port those modules — reconcile the contract against what is ported rather than inheriting a shape nothing ever ran. |
| **D155 / D116** | The extension's mocha suite is still not a declared suite, so `affected` selects nothing for `tools/dabbler-ai-orchestration/` and session 24's largest change set had no recordable pre-verification evidence. Measured why it is not a one-line declaration: `targeted_command` appends the selected paths, and mocha MERGES a path list with its `spec` (both from the flag and from `.mocharc.json`) rather than being narrowed by it, so the bare command cannot mean "everything" while the appended form means "these". `runs_whole` would be false. It needs a runner entry point — D116's shape. |
| **Session 24 estimate** | "Net negative TS lines" was not met (+178 in the extension). `implements Router` requires all 32 methods and twenty of them refuse, which still costs their signatures. Not a defect; a fact about the contract's width, worth knowing when sizing sessions 30–34. |
| **D145/D146 — RULED (D161)** | A reader of `deterministic-facts.jsonl` sees `analyzer: pass` and cannot tell what was compared; `facts.run_control` drops the detail on a green result. The verifier raised it across three rounds. Worth asking in session 26, when the analyzer gets its first cross-router case, whether a control should say what it proved. A Python behaviour change in the record — the operator's call. |
| **D119** | The solution level (one repository per library or service, plus an integrator) is not formalized. |
| Suite cost, the remainder | What is left is the loop's own git traffic (134 spawns in the slowest test). A fake git is still refused. The port's `journal.run_git` twin is where fewer round-trips per round would live. |

## Carried from the archived handoff, status not re-verified

Three items from the pre-148 *Next* list were not touched and were not
checked when this file was rewritten. Confirm or drop them:

- a round cap on `workflow review` (an unattended run keeps calling vendors);
- the Solution Explorer has not been screenshotted from a real VS Code;
- the CSV walkthrough is the wrong shape for a supervisor audience.

`.dabbler/runs/` is **not** tracked (D135, 2026-08-28), which is the
framework's own default; the archived "`.dabbler/` is git-ignored" item is
resolved by being true again.

## Next

1. **Session 25 of 35 — foundation modules.** `config` (640),
   `secret_resolver` (47), `identity` (235), `verdict` (419), `lockfile`
   (158), `runtime_mode` (84), `metrics` (258) — 1,841 lines, ~98 tests.
   Leaves of the import graph; everything above depends on them. `config`
   validates against the schema with `ajv`, and the rate-less routable
   entry still fails load. The parity control gets its first real work:
   `config` load and `verdict` parse over the corpus.
2. **All four owed decisions are RULED (D159–D162, operator).** Nothing is
   waiting on the operator.
   - **D159** — reword session 23's step 5; the first cross-router parity
     case stays in session 26. A one-line plan edit, owed at the start of
     the next session, so nobody is handed an instruction that cannot be
     followed.
   - **D160** — fix the freshness digest by omitting a path that cannot be
     read, instead of hashing the word `"deleted"` for it. **Must land
     before session 27** ports `evidence`/`test_evidence`, or it gets
     fixed twice in two languages.
   - **D161** — a passing control records what it proved. Land with or
     before session 26, so the analyzer's first cross-router case is
     recorded under the new behaviour.
   - **D162** — reconcile the contract per command as each module is
     ported, defaulting to trimming. `modules retire` plausibly earns
     building; `modules list` probably does not; `--finding-index` is just
     a correction to `--finding`.
3. **Read before session 26.** It lands the first ported verb *and* the
   parity control's first cross-router case, and the specification, D141,
   D146 and the empty `CASES` list in `packages/router/src/parity/run.ts`
   all point at it. Three corpus shapes (`disputed`, `at-cap`,
   `moved-machine`) have no builder yet and land with the verbs that read
   them.
4. **D130 override window** — the operator can still override retiring the
   run core, until session 34 starts.
