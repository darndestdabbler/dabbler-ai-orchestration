# STATUS — session 26 of 35 landed: the record, and the first writes compared across two routers

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Recorded, 2026-08-28.** Session 26's deliverables are decisions
> **D170–D172** in `docs/sessions/decisions-log.md`; session 25's are
> **D163–D169**, session 24's **D150–D162** and session 23's **D138–D149**,
> plus the amendments inside `docs/ts-port-parity-control.md`. This file
> summarises them; the decisions are the record.

## Where things are

- **Session 26 is closed `VERIFIED`** — 2 rounds (gpt-5.6-sol over the API).
  Round 1 raised two Major findings; **both were disputed and both were
  withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **The record is ported.** `ledger` (901), `writers` (881) and `journal`'s
  surviving slice (~150) became **~4,000 TypeScript lines across ten
  files**, with **74 vitest tests**. Everything under `.dabbler/runs/` and
  `docs/sessions/` is written there and nowhere else.
- **D129 sized this session at three modules; it is nine (D171).**
  `writers` cannot be ported alone. It imports `progress` (session 30) for
  the status vocabulary, the derived view and the invariants it folds a
  state through before writing it; `evidence` (session 27) for the
  filenames at the sessions root and the digest ledger every sanctioned
  write appends to; and `gates` (session 30) for the working-tree question
  the declaration refuses on. Each is ported as a named slice in a file
  named for its Python module — 302 Python lines in all — the way session
  25 ported `transports/copilot`'s timeout slice. Porting the writer
  without the reader would put a second statement of what a legal record is
  inside the module that produces them.
- **`session start` / `declare` / `log` / `decision` are real; the rest of
  the verb is refused by name.** Nothing `writers` writes is reachable
  except through those four, so without them ~4,000 ported lines would have
  entered no comparison at all. `contracts/verbs.ts` moves `session` to
  `portedInSession: 26`; `cli/session.ts` refuses `close`, `cancel`,
  `restore`, `plan` and `migrate` and names session 30. **Session 30 keeps
  the lifecycle's judgment half** — the five gates, the boundary reversals,
  the legacy migration — and its scope is unchanged by this.
- **The parity control compares nine verb cases over 45 paths**, up from
  one: `metrics`, `session start` (fresh + in-flight), `declare` (fresh),
  the already-declared **refusal** (in-flight), `log` (in-flight) and
  `decision` (both shapes). The refusal case is deliberate — a refusal's
  wording is what the operator reads, and it exercises a branch no passing
  case reaches.
- **It found a real defect on its first run, in the one row it had just
  appended.** Python's `open(path, "a", encoding="utf-8")` takes the
  platform default newline, so on Windows every `.dabbler/runs/` JSONL row,
  `sessions.json` and the activity log carry CRLF — while the files opened
  with `newline=""` or `newline="\n"` carry LF. Node writes the bytes it is
  given. The rule is **per file**, and getting it wrong in either direction
  is drift: `journal.platformNewlines` is the one seam, and every writer
  whose Python twin takes the default goes through it.
- **Two seams earned their existence by making other files smaller.**
  `pythonJson.ts` is `json.dumps`: the `", "` separator, `ensure_ascii`
  (including DEL, which is ASCII and which CPython still escapes), the
  astral surrogate pair, and CPython's float `repr` — which moved here out
  of `lockfile.ts`, so the seat catalog's TOML, the metrics ledger and every
  record row now get one answer. It was **checked against CPython over 13
  shapes × 3 modes: all 39 identical**. `schema/validate.ts` is the ajv
  wrapper `config.ts` had privately; the error *location* matches Python's
  `jsonschema`, the error *wording* is explicitly not claimed (D165).
- **D160 is discharged (D170).** `test_evidence.surface_digest` omits an
  unreadable path instead of hashing the literal word `"deleted"`, so a
  deletion moves the freshness digest once — when the file goes — and the
  commit that records it moves nothing. It is its own commit, as the
  control's sequencing rules require, and it rode in the working tree
  rather than landing before the session, so the verifier saw a change to a
  gate. **The trap in `AGENTS.md` is now history rather than a warning.**
- **The corpus declares both discovery records fresh.** `session start`
  warns for every discovery record that is absent, undated or overdue, and
  an absent one is stale whatever the threshold says — so a corpus without
  them would make every registration comparison a comparison of
  `discovery`, which lands in session 28. `.dabbler/api-models.lock` is
  written with a fixed date and the overlay puts both thresholds past any
  age they can reach. That second half matters on its own: the checked-in
  seat catalog is dated 2026-08-19 against a 720 h threshold, so **without
  it the control would have turned red around 2026-09-18** for a reason no
  diff of the change would explain.
- **Round 1's two findings were both real questions and both correctly
  disputed.** The first said malformed `sessions.json` is silently replaced
  rather than refused — true, and it is *Python's* behaviour
  (`progress.py:441-452`, `writers.py:398-414`); making TypeScript refuse
  would have turned the control red, and the specification forbids that
  repair in as many words. The second asked for a round-append parity case
  — unreachable, because `ledger` has no Python command line and the only
  verb that appends a round is `verify`, at session 32 on shapes with no
  builder until 28. Both halves that *were* actionable were fixed: an
  `existsSync` probe that turned a deleted-file race into a throw where
  Python returns null, and six direct tests over `appendRound` including
  the anchor. **The disputes cost 11,590 tokens and settled both.**
- **Suite: 944 Python (5:28) / 207 router vitest (18 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** The Python
  suite gained one test (D170's). `packages/router` is now ~7,400 lines of
  source (1,400 generated) and ~2,100 of tests.

- **Session 25 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API), round 1 blocking and correct, round 2 clean on the fix delta. Claude
  Code / claude-opus-5[1m] orchestrator. All five gates passed at the first
  attempt; nothing was forced.
- **Seven modules are ported.** `config`, `secret_resolver`, `identity`,
  `verdict`, `lockfile`, `runtime_mode`, `metrics` — 1,841 Python lines
  becoming **2,790 TypeScript across fourteen files**, with **122 vitest
  tests** answering for the 98 Python tests. The extra files are the seams:
  `paths`, `textfile`, `version`, `cli/output`, and the two forward
  dependencies (below).
- **Both routers read ONE copy of the bundled data.** `router-config.yaml`,
  the schemas and the prompt templates are read from `ai_router/` by both,
  resolved through `src/paths.ts`, which finds the package by walking up for
  its own `package.json` — the same code runs from `src/` under ts-node and
  from `dist/` after esbuild, and a fixed number of `..` would be silently
  wrong in one. A second copy of that data would drift, and the control
  compares two routers reading the same input. Session 33/35 decides what
  the package ships with when Python leaves.
- **`metrics` is the first verb the port makes real**, and the parity
  control's **first cross-router case** — a session earlier than D159
  assumed, because `contracts/verbs.ts` has said `metrics` lands in session
  25 since it was written. Both routers produce byte-identical stdout,
  stderr and exit code on `fresh` and `in-flight` (**D163**).
- **Landing one verb found two defects six more library ports would not
  have (D166).** `python -m ai_router.metrics` printed a runpy
  `RuntimeWarning` on *every* invocation, because `__init__` imports
  `route` and `route` imported `metrics` at module scope; `route` now
  imports `record_call` inside the one function that calls it, which is how
  `verifyjob` already reached it. And **session 23's bundled `dabbler.cjs`
  died on its first line**: esbuild's CommonJS output has no
  `import.meta`, so any module locating itself by it resolved `undefined`.
  Nothing had noticed because no verb was implemented, so nothing in the
  bundle had ever read a file. `build.mjs` now defines it from `__filename`.
- **`config` load enters the control through `metrics`; `verdict` parse
  could not.** `verdict` has no command line and is reached only through
  `verify` (session 32), so its case lands there. It was proved instead
  against **every verifier output this repository holds — 71 files, three
  vendors — parsed by both implementations and compared structurally:
  identical on all 71** (**D163**). That is evidence, not a control.
- **Four cross-language byte differences are settled in Python's favour
  (D165):** line endings in both directions (`cli/output.ts` writes the
  platform's ending because Python's `print` does; `textfile.ts` reads
  universal newlines because Python's text mode does, and the TOML reader
  deliberately does not, because `tomllib` takes bytes); `int` versus
  `float` via a `tomlFloat` marker; CPython's float `repr`; and
  `json.dumps`'s separators and non-ASCII escaping. **Schema error
  *wording* is explicitly not claimed** — `ajv` and `jsonschema` word and
  order errors differently, and matching them would be a second
  implementation of a rule.
- **Both owed rulings with a deadline here are discharged.** **D159**: session
  23's step 5 is reworded. **D161**: `facts.run_control` now keeps a passing
  control's own output in the record, and a silent control records that it
  was silent — with each parity case declaring, in the type system, what a
  green row for it proves (**D167**).
- **Round 1's finding was real and is the reason to keep the loop.** The
  control claimed a "three-layer config load" the corpus never exercised:
  there was no `local-overrides.yaml` in it. That is D161's own failure mode
  arriving in the session that implemented D161. The corpus now carries one,
  written per repository and **load-bearing rather than scenery** — it is
  what points `metrics` at the canned telemetry, so with it the report reads
  4 calls and without it 110. The corpus also scrubs `AI_ROUTER_CONFIG`,
  `AI_ROUTER_METRICS_PATH`, `DABBLER_TRANSPORT` and `DABBLER_NO_ROUTER` from
  the child environment: an operator with the first one set would have made
  both routers read their config and skip both layers, wrong together, which
  is the one failure a comparison cannot see.
- **Suite: 943 Python (5:12 at `-n 2`) / 133 router vitest (6 s) / 153
  extension mocha / 14 Playwright; all four declared controls green.** The
  Python suite gained one test (D167's). `packages/router` is now ~4,700
  lines of source (1,400 generated) and ~1,300 of tests.

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
| **D164 — the port** | `identity.resolve_session_orchestrator_identity` is **not ported**. It is the one function in `identity` that reads a repository rather than a block, and it reads state through `progress` — session 30. Writing a second reader of `sessions.json` to reach it early is the drift the port exists to remove, so it lands in session 30 as a wrapper over `resolveOrchestratorIdentity`. No test covers it today on either side; the Python suite's eleven identity tests are all against the block-level core. |
| **D168 — shared design** | `parseVerificationResponse` tests the head with `startsWith("VERIFIED")`, so a look-alike (`VERIFIED_NOT_REALLY`) classifies as VERIFIED. **Faithful to Python, and deliberately not fixed in the port** — an improvement on one side only is exactly the drift parity exists to catch. Blast radius is small (the token chooses a parse branch, not an outcome: `classifyBlocking` is severity-derived, and `validateSessionVerdict` refuses the token exactly). If a boundary is wanted it goes into Python first and crosses with a parity case that feeds a look-alike to both — session 32. |
| **D169 — cost to watch** | The parity control takes **~150 s** per run, because it builds four corpus repositories by driving the Python router, and it runs inside every `verify`. That is already comparable to a verifier round's wall time, and the case table only grows. Sessions 26–34 should watch it; caching a built shape across cases is the obvious lever if it becomes the bottleneck. |
| **D122 gap** | No path by which a verifier reviews a remediated-at-the-cap fix. Sessions 12 and 17 ended that way, so their last fixes are unreviewed today. |
| **D116** | A targeted-run form for filter-style runners (Maven `-Dtest=`, `dotnet test --filter`) plus the audit rule that checks one. "A session, not a patch." The port's vitest path-list form does not need it. |
| **D124** | Record the round cap on the round row as `verify.py` writes it; the unresolved-session view reads the live cap for a historical session. |
| **D126 nit 1** | `append_round` must refuse when the tree resolves and the anchor fails (`ledger.py`). Carried across the port unchanged (session 26). |
| **D114 nit 2** | `build_task_rows` renders a leaf, not a refusal, when `approved-plan.json` is missing while `step-execution.jsonl` carries an open step. |
| **D130 (was D88)** | Not owed — decided. The operator's override window on retiring the run core is open until session 34 starts. |
| **D134** | Round-1 change sets measure HEAD's raw tree against a snapshot that drops `.dabbler/`, so a repository that tracks its ledger reports it as deleted. Moot here since D135 and **confirmed moot** — session 23's first selection reported zero `selection_unknown` rows against 208 in each of 19–22 (D144). Latent elsewhere. If fixed on the Python side, do it before session 27 ports `affected`. |
| **D147 — RULED (D159), DONE in 25** | Session 23's step 5 is reworded: the control is declared and required from session 23, running the comparison that needs one router; the cross-router comparison joins it with the first ported verb. That verb turned out to be `metrics`, in session **25** rather than 26 — earlier than the ruling assumed, and costing nothing, because what the ruling protected was that no session be handed an instruction it cannot follow. Closed. |
| **D149 — CLOSED (D170), session 26** | Deleting a tracked file moved the whole-tree digest across the commit, because `git ls-files` still lists a tracked-but-deleted path and `surface_digest` wrote it a literal `"deleted"` hash. It cost session 23 a re-run and session 24 a forced close. **Fixed at the git seam as D160 ruled**: an unreadable path is omitted rather than marked, so a deletion moves the digest once and the commit that records it moves nothing. The marker string no longer appears anywhere in the router. Landed in its own commit before session 26's port, so the parity control compared two routers with the same intended behaviour, and it rode in the working tree so the verifier saw a change to a gate. |
| **D158 — framework** | `session close --force` promotes EVERY open session to complete, and its help says only "bypass bookkeeping gates". It cost session 24 a damaged ledger and a restore. Three fixes owed: say what the flag does; refuse (or require a second flag) when it would promote sessions that are not in flight; and stamp `forceClosed` on the session's row rather than the repository, so the ledger can say which session forced a close. Until they land, the trap lives in `AGENTS.md`'s preamble. |
| **D152 — RULED (D162)** | `ModuleVerbs.list`/`retire`, and several `VerifyVerbs`/`WorkflowVerbs` option names, describe a Python surface that does not exist in those shapes (`ai_router.modules` has only `create`; `verify dispute` takes `--finding`). Sessions 30/32/34 port those modules — reconcile the contract against what is ported rather than inheriting a shape nothing ever ran. |
| **D155 / D116** | The extension's mocha suite is still not a declared suite, so `affected` selects nothing for `tools/dabbler-ai-orchestration/` and session 24's largest change set had no recordable pre-verification evidence. Measured why it is not a one-line declaration: `targeted_command` appends the selected paths, and mocha MERGES a path list with its `spec` (both from the flag and from `.mocharc.json`) rather than being narrowed by it, so the bare command cannot mean "everything" while the appended form means "these". `runs_whole` would be false. It needs a runner entry point — D116's shape. |
| **Session 24 estimate** | "Net negative TS lines" was not met (+178 in the extension). `implements Router` requires all 32 methods and twenty of them refuse, which still costs their signatures. Not a defect; a fact about the contract's width, worth knowing when sizing sessions 30–34. |
| **D145/D146 — RULED (D161), DONE in 25** | Implemented as **D167**: `facts.run_control` keeps a passing control's own output in the record (capped at the same 1,500 characters a failure is), and a control that prints nothing on success records that it printed nothing — so "had nothing to say" and "said something the record dropped" are no longer the same row. Each parity case declares a `proves` string beside it, so a case added without saying what it proves does not typecheck. Closed. |
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

1. **Session 27 of 35 — evidence, checks, test evidence, affected.**
   `evidence` (902), `checks` (1,001), `test_evidence` (807), `affected`
   (564) — 3,274 lines, ~72 tests. **Two of those four are already part-way
   here**: `src/evidence.ts` carries the sessions-root filenames, the round
   anchor, the digest ledger and `resolveSessionsDir` (session 26), so
   session 27 grows that file rather than creating it, and D170's fix means
   `surface_digest` is ported once, correctly, rather than twice.
   `snapshotWorktreeTree` and `changedPathsBetween` are also already in
   `src/journal.ts`, which is where `checks` and `evidence` reach for them.
   **`affected` and `test-evidence` both have real Python command lines and
   both are already in the corpus builder**, so session 27 can add their
   parity cases without waiting for a shape it does not have — the first
   session since 25 for which that is true without argument.
2. **Read `docs/ts-port-parity-control.md` before planning any session
   from here.** Its verb table is the growth order, and session 26 is the
   proof that the *plan's* line counts are not the session's: four forward
   dependencies and a verb slice were needed before a single ported byte
   could be compared. Session 27's inventory line should be read the same
   way — as a floor.
3. **A Python design question is owed to the operator, from D171's round-1
   dispute.** A malformed or hand-edited `sessions.json` or
   `activity-log.json` is *silently replaced* rather than refused, in both
   routers, today: `read_raw_session_state` returns `None` for unparseable
   JSON and `_read_or_create_activity_log` builds a fresh log from any read
   failure. A verifier called that Major and it is a fair call. It was not
   fixed here because a behaviour change inside a port session is the one
   failure a parity comparison cannot see — both routers would be wrong
   together. **It is a redesign and it needs a ruling**: refuse and fail
   closed, or keep replacing and say so. If it is to be fixed, the cheapest
   moment is *after* session 35, when there is one implementation again.
4. **D162 is per-command, from session 30**: reconcile the `Router`
   contract against what is actually ported, defaulting to trimming.
   `modules retire` plausibly earns building; `modules list` probably does
   not; `--finding-index` is just a correction to `--finding`. Session 26
   adds one input to that: `ledger` is declared `extensionFacing` with
   `pythonCli: false`, and nothing has ever called it — `pythonSpawnRouter`
   refuses both its methods. It is a candidate for trimming rather than
   building.
5. **What sessions 25 and 26 leave for their successors.** `identity`'s
   session-level entry point is owed to session 30 (D164); `verdict`'s
   parity case and the `VERIFIED` look-alike question are owed to session
   32 (D163, D168); the round-append parity case is owed to session 32 for
   the same reason (D171's round-1 dispute, withdrawn on that basis); the
   parity control's cost is owed watching by everyone (D169) — it is now
   nine cases rather than one, and each case builds two repositories.
6. **D130 override window** — the operator can still override retiring the
   run core, until session 34 starts.
