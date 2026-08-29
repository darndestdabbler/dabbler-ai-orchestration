# STATUS — session 34 of 36 landed: bootstrap, packaging, and the `dabbler` command on the PATH

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Recorded, 2026-08-29.** Session 34's deliverables are decisions
> **D218–D223**; session 33's are
> **D210–D217** in `docs/sessions/decisions-log.md`; session 32's are
> **D204–D209**; session 31's are
> **D197–D203**; session 30's are
> **D190–D196**; session 29's are
> **D187–D189**; session 28's are
> **D180–D186**, session 27's **D173–D179**, session 26's **D170–D172**,
> session 25's **D163–D169**, session 24's **D150–D162** and session 23's
> **D138–D149**, plus the amendments inside
> `docs/ts-port-parity-control.md`. This file summarises them; the decisions
> are the record.

> **How to read a session number below this line.** Session 29 was inserted
> between 28 and what was then 29, so the port's remaining sessions each
> moved up one and the plan now runs to **36** (D188). Live guidance was
> renumbered; the append-only decisions log and the older sections of this
> file were **not**, because they were true when written. So "ported in
> session 29" in anything written before 2026-08-29 means what is now
> session 30, "session 31" means 32, and so on to the cutover, which was 35
> and is now 36. The ledger's dates carry the true order. The **Next**
> section at the foot of this file uses the new numbers.

## Where things are

- **Session 34 is closed `VERIFIED`** — **2 rounds**, the Major of round 1 disputed and **withdrawn** (gpt-5-6-sol over
  the API), Claude Code / claude-opus-5[1m] orchestrator. Round 1 raised one
  Major and one nit, **both describing the Python reference implementation
  rather than the port**, and the Major was disputed with three citations.
- **The managed fence and the commit guard now name `dabbler`, and the
  Python side moved first — because the hook has no byte-identical form**
  (D218). The session plan's step 2 and the parity control's compared-path
  list were in direct conflict: the plan says both files name the shim, the
  control says both are compared byte for byte and that the TypeScript side
  is the one that moves. **The hook settles it and the fence follows.**
  Python bakes in `sys.executable`; TypeScript's nearest value is
  `process.execPath`, a different absolute path outside the copy root that
  normalization 2 does not rewrite. There is no spelling of "each router
  names its own interpreter" that produces the same bytes — so either both
  write a PATH-resolved command or the control is red forever on a file the
  plan explicitly assigns to this session. Python moved in its own commit,
  and **every file `bootstrap` writes is now byte-identical between the two
  routers**, proved directly on two scratch repositories before the control
  was asked.
- **This repository's own three instruction files were NOT regenerated, and
  that is deliberate.** They still name `.venv/Scripts/python -m
  ai_router.<module>`, which is what a session in *this* repository actually
  runs while two routers exist — the preverify runs this session recorded
  were `python -m pytest`. Session 36 already owns rewriting them, and it is
  the commit that makes the new text true here.
- **`bootstrap` is the first compared verb to print a non-ASCII character,
  and it exposed a runtime difference rather than a router one** (D219).
  Python encodes `sys.stdout` with the console code page unless told
  otherwise, so an em dash leaves `print` as one cp1252 byte where Node
  writes three UTF-8 bytes. The control's letter says the TypeScript side
  moves — which here would mean **teaching a cross-platform command to emit
  cp1252**, and leaving session 36 to change it back silently in the commit
  that deletes Python. So `PYTHONIOENCODING=utf-8` is pinned in the corpus's
  `PINNED_ENV` beside the fixed committer date. It is an **input, not a
  third normalization**: it rewrites nothing after the fact, so the rule
  that the two normalizations describe everything that happens to an output
  once it exists still holds exactly.
- **The zero-install proof passed, and it found a commit guard that could
  never have resolved on Windows** (D220). `dabbler session start`
  registered session 001 in a repository with no `.venv` and no Python on
  `PATH` — but the first commit printed `dabbler: command not found` from
  the hook. The launcher was `dabbler.cmd`, correct for `cmd.exe` and
  PowerShell where PATH lookup consults `PATHEXT`; the guard is a
  `#!/bin/sh` script, and the shell git ships does not consult PATHEXT. It
  looks for a file named exactly `dabbler` and finds nothing.
  **Every commit on every Windows machine would have printed that line and
  been let through** — the guard installed, present, and inert.
- **Nothing on either side could have caught it, and that is the lesson.**
  The hook's failure direction is deliberate: anything that is not the
  guard's own verdict exits non-blocking, so the symptom is a line of stderr
  and a commit that succeeds. The parity control is green *and correct* —
  both routers write the same hook text, and the file they agree on is one
  neither of them can execute. **A control that compares two writers cannot
  see that what they agreed on does not run.** Only executing it on a
  machine with nothing installed produced it. The fix follows npm's own
  global shims: on Windows the extension writes **both** `dabbler.cmd` and
  an extensionless `dabbler` POSIX script, the latter with forward-slash
  paths because MSYS treats a backslash inside double quotes as an escape.
- **One shim limitation is documented rather than fixed.**
  `EnvironmentVariableCollection` applies to terminals only, so a commit
  made from VS Code's Source Control panel runs git in the extension host's
  environment, where `dabbler` is not on `PATH` and the guard exits
  non-blocking again. `npm i -g dabbler-ai-router` closes it, and the
  managed fence now says so for anywhere that is not a VS Code terminal.
- **The recipes the router PRINTS still name Python, deliberately** (D221).
  The proof's transcript shows three: `REFRESH_COMMAND`, which the handoff
  into this session already addressed to the cutover, plus `session start`'s
  next-step hint and the selector's recipe, which it did not. They are
  correct in *this* repository and wrong in a consumer one, and changing
  them would cost a third Python-side edit that D218's test does not
  license — these strings have a perfectly good byte-identical form, which
  is the one they have. **Session 36's step 5 should grep for
  `python -m ai_router` across strings the router prints**, not only across
  the docs it names.
- **1,891 Python lines became 2,433 TypeScript across six files** — 1.29x,
  in line with the 1.32x ratio since session 25. `packaging.ts` (829) and
  `cli/packaging.ts` (167); `bootstrap/` split four ways as `templates`
  (446), `detect` (285), `index` (250) and `env` (205), plus
  `cli/bootstrap.ts` (251). The extension gains `terminalShim.ts` (152).
  **`templates.ts` was generated from the Python source rather than
  transcribed**, then re-emitted one source line per rendered line, so the
  fence's 6,052 characters are byte-exact by construction and still
  reviewable.
- **The parity control gains two cases and the corpus gains no shape.**
  `bootstrap` on `fresh` compares the refresh path — three engine files, the
  guard, the ignore rule recognised, the refspecs. It does **not** reach the
  scaffold path, which is the one a consumer project takes: that needs a
  project carrying no plan and no config, which is a sixth shape built twice
  on every round of every remaining session, and it would not be enough on
  its own because neither `dabbler.yaml` nor `session-plan.md` is in the
  compared-path list. So the branch is driven against the reference directly
  in `differential.test.ts`, over a project with no build file and one that
  is four ecosystems at once — session 33's stated pattern, chosen over
  widening both lists. `packaging --dry-run` on `in-flight` reaches the
  releasability refusal and stops there, which is all a shape without a
  `packaging` block can reach.
- **Both documented `bootstrap` side effects were checked after every run,
  and neither fired.** `.gitignore` is untouched in this repository, and no
  transport preference was written: every invocation passed
  `--no-transport-detect`, including both sides of the parity case, because
  a comparison that persisted an environment variable on the host twice per
  round would be reaching outside the thing it compares. The user-scope
  `DABBLER_TRANSPORT=api` on this machine **predates the session** —
  `resolveBootstrapTransport` can only ever persist `copilot-cli`, never
  `api`.
- **63 TypeScript tests for the two ported modules against Python's 55**
  (after parametrize expansion), plus 2 scaffold differential tests and 5
  extension shim tests. The 8 extra are branches Python leaves untested and
  each is a distinct refusal: a block declaring one half and not the other,
  a push naming no feed, a push naming no credential, a non-positive
  timeout, a command that could not start, and refusing to file a dry run.
  None is a falsifier twin or a source-text assertion.

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
| **D196 — the shim-only ceiling, owed to the CUTOVER** | On a machine where `copilot` resolves only to a batch shim, `cmd.exe` runs it and the command line stops at 8,191 while the handoff waits until 24,000. **Both routers are bounded identically today** — `CreateProcess` wraps a batch file in `cmd /c` — so the fix is to lower the handoff threshold on the shim path, and `HANDOFF_THRESHOLD_UTF16_UNITS` is a constant both routers must agree on or they take different branches for the same prompt. Needs a session that may touch Python; session 36 is where there stops being a second side. Named in `defaultSpawner`. |
| **D190 — `REFRESH_COMMAND`, owed to the CUTOVER** | Every message about a stale, hand-edited or same-provider catalog names `python -m ai_router.transports.copilot refresh`, and **both** routers print it, which is why it was not changed. It is true today and becomes false the moment Python is deleted. Re-point it to `dabbler copilot refresh` in session 36, in the same commit that removes the Python module it names. |
| **D193 — the seat probe's second half** | The live handoff test reached the real CLI and took the handoff branch; the seat then refused for quota, so **no model read the payload and no acknowledgement was earned**. Run `DABBLER_E2E=1 npx vitest run test/live.test.ts -t handoff` once the operator's premium-request allowance resets. One billed turn. The failure message now dumps the whole metadata, so whichever way it goes the run is readable. |
| **D194 — one int/float approximation, four readings** | JavaScript has one number type, so the port stands `Number.isInteger` in for Python's `type(x) is int`. Consequences: a wire `outputTokens: 42.0` fails closed in Python and is accepted here; a seat reporting `premiumRequests: 1.0` would be written `1` here and `1.0` there; and `toFixed` rounds half away from zero where Python's `format` rounds half to even (`seat-cost`'s credits, and `metrics`' escalation percentage since session 25). One fix covers all four — a JSON reader that keeps the lexical int/float distinction, and a shared fixed-point formatter — which is why it is one row and was not half-done in a port session. |
| **D194 — `copilot refresh --dry-run` as a parity case** | Built, run both ways, stdout byte-identical, and **not** a case: `python -m ai_router.transports.copilot` makes runpy print a `RuntimeWarning` to stderr, which the control compares. Free to add at the cutover, and worth it — it is the only reading of the scope selection and the cost projection that costs nothing. |
| ~~**D173 — the port's one record difference**~~ **CLOSED in session 29 by D187**, together with D185, which was the same shape. Both routers now stamp `dabbler-absence-search/1`, and a failed enumeration is recorded in a closed eight-term vocabulary rather than under the failing library's class name. The route taken is the one this row called sanctioned: Python changed first, and the field names the rule rather than the engine. | *Nothing further owed.* |
| **D173 / round 1 — the evidence protocol has no callers** | `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`, `verify_worker_result` and `record_worker_result` are ported and **nothing in either router calls them**. Two real gaps sit inside them, both shared with Python and both recorded rather than repaired on one side: `outputHash` is not re-derived from `rawOutput`, and a check's `evidence.pass.requires` contract is not enforced when its result is recorded. The session that first drives the critique loop owns both, and the second one may belong at dispatch rather than at record — the loop's shape decides. |
| **D174 — consumer repositories** | A repository declaring `argv: ["npm", "test"]` for a check works under Python and would not have under the port without the shim resolution this session added. This repository declares every control as argv for `node` (D142), so nothing here exercises it. Session 33's `bootstrap` should say so where it writes a first `dabbler.yaml`. |
| **Round 1 nit — an argv suite is unrecordable** | `checks.load_checks` accepts a suite declaring `argv` and no `command`; `test_evidence.load_suites_checked` refuses it. Such a suite would run and be unrecordable, so it could never close. Latent — `argv` is used for controls, which that reader never sees — and **it may be the permissiveness rather than the refusal that is wrong**: a suite's command lands in the record as evidence, a control's does not. A session, not a patch, and adjacent to D116. |
| **Round 3 nits, both non-blocking and both carried** | (1) The Windows batch path still goes through `cmd.exe`, so `%VAR%` expansion remains — as it does on the Python side, for the same reason: a batch file is a cmd script. (2) `classifyPreverifyCommand` accepts a command that names every selected test *and* a broader directory. Both are Python's behaviour; changing either is a cross-router decision. |
| ~~**D176 — amends D169**~~ **DISCHARGED in session 33 (D213, D214)** | The three shapes it named unbuilt -- `disputed`, `at-cap`, `moved-machine` -- are built, and its premise is now inverted by caching: a shape is built ONCE and copied per case, so 42 cases over 5 shapes cost 161 s where 28 over 2 cost 193 s. The cost to watch has moved to the deterministic pass, which runs this control before every round. *Original text:* The parity cost to watch is a new SHAPE, not a new case: twelve cases run in less time than nine did. Three shapes are still unbuilt (`disputed`, `at-cap`, `moved-machine`) and each needs the offline transport plus canned verifier text. |
| **D164 — CLOSED in session 31 (D202)** | `identity.resolveSessionOrchestratorIdentity` is ported, as a wrapper over `resolveOrchestratorIdentity`, reading the record through `progress` rather than opening `sessions.json` a second time. Five tests cover the three selection branches and the two refusals, where the Python suite had none. *Nothing further owed.* |
| ~~**D168 — shared design**~~ **DISCHARGED in session 33 (D215)**, as a differential test rather than a parity case: `VERIFIED_NOT_REALLY` classifies as VERIFIED on both sides, and the test records the AGREEMENT so that the day either side tightens the token the other is told. *Original text:* | `parseVerificationResponse` tests the head with `startsWith("VERIFIED")`, so a look-alike (`VERIFIED_NOT_REALLY`) classifies as VERIFIED. **Faithful to Python, and deliberately not fixed in the port** — an improvement on one side only is exactly the drift parity exists to catch. Blast radius is small (the token chooses a parse branch, not an outcome: `classifyBlocking` is severity-derived, and `validateSessionVerdict` refuses the token exactly). If a boundary is wanted it goes into Python first and crosses with a parity case that feeds a look-alike to both — session 32. |
| ~~**D169 — cost to watch**~~ **RE-MEASURED AGAIN in session 33: 161 s for 42 cases across 5 shapes.** Caching a built shape was the lever it named and it more than paid for the three new shapes. | **193 s** for 28 cases across 2 shapes, against ~150 s for 12 cases — so more than doubling the case table cost ~28%, which confirms D176: the cost is a SHAPE, not a case, because a shape is what gets built twice per case that names it. The three unbuilt shapes (`disputed`, `at-cap`, `moved-machine`) all land with `verify` in session 33, and each will multiply against every case that uses it. **Caching a built shape across the cases that share it is the lever**, and session 33 is where it stops being optional. |
| ~~**D198 — the approved-plan reader**~~ **CLOSED in session 32 (D207).** | `progress.buildTaskRows` needs `approved_plan`'s `read_plan` and `effective_plan`, which land in session 32. Until a reader is registered through `useApprovedPlanReader`, a session with an `approved-plan.json` on disk gets `tasksRefused` where the task rows should be — deliberately, because rendering an empty list would say "this session has no tasks" over a session that has seven, and no corpus shape carries a plan for the control to catch it. Session 32 registers the real reader **and** should add a `progress --json` case on a shape that has a plan, which is the only thing that proves the two routers fold the steps the same way. |
| **D200 — two YAML emitter differences, moot at the CUTOVER** | `docs/modules.yaml` is compared and the common path is byte-identical, with four options reaching the `yaml` package to PyYAML (`indentSeq: false`, `singleQuote`, `lineWidth: 81`, `version: "1.1"`). Two inputs still differ: a scalar of exactly `y` or `n` (quoted here, plain in PyYAML) and a value carrying a newline (a `|-` block here, single-quoted and folded there). Both parse back to the same value and neither occurs in a kebab-case slug or an ordinary display name. Closing them means a PyYAML-compatible emitter for this document shape — a session, not a port's side effect — and it stops mattering the moment there is one emitter. |
| **D201 — `session migrate` has no parity case** | A corpus gap, not a divergence: every built shape is post-collapse, so there is no `docs/session-sets/<NNN-slug>/session-state.json` for the migration to read. Its refusals, its dry run and the cancelled-set fold are covered by both suites. A shape whose only purpose is a verb that runs once per repository, ever, is not worth ~12 s on every parity run — but if one is ever built for another reason, this case rides along free. |
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
| ~~**D152 — RULED (D162)**~~ **FULLY DISCHARGED**: the `modules` half in session 31 (D199), the `VerifyVerbs` half in session 33 (D216) -- `findingIndex` becomes `finding` because the flag is `--finding`, and `VerifyAdjudicateOptions` gains the `maxRounds` it always took. `WorkflowVerbs` remains owed to session 35. *Original text:* | `ModuleVerbs.list` and `.retire` -- and `ModuleRetireOptions` -- are trimmed from the contract: `ai_router.modules` has exactly `create`, and the manifest is create-only by design. Two of the extension's `refuse()` stubs went with them. **Still owed for the other half**: `VerifyVerbs`' option names (`verify dispute` takes `--finding`, not `--finding-index`) belong to session 33, and `WorkflowVerbs`' to session 35. |
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

1. **Session 35 of 36 — the six-step workflow ported, the run core retired.**
   `workflow` (1,363), `solution` (351), `contractdoc` (196) and
   `stepreview` (284) — 2,194 lines, 99 tests — are ported, and `runcli`,
   `runcore`, `runproject`, `facts`, `fixloop`, `testphase` — 4,396 lines,
   119 tests — are deleted with their tests, closing D88. **`facts` is on
   that deletion list and it is now a live dependency**: session 33 ported
   it because `verify` cannot open a round without it, so read D210 before
   deleting anything named there. The list was written when `facts` was
   believed unported.

   **Run the import audit first.** D210's fifth sizing-error shape is that a
   module's session assignment and the session plan's prose are two records
   and nothing checks they agree. Session 34 ran the audit before touching
   anything — 21 symbols across seven modules, all present — and it cost
   minutes. Session 35's four modules are the last chance for this to bite.

   **The audit is necessary and not sufficient, and session 34 is the
   proof.** It confirmed every import resolved and still missed that a
   Python test in a *third* file (`tests/test_step_execution.py`) asserted
   the pre-commit hook's text. The selector found it, not the audit. Grep
   the tests of every module you change, not only its imports.

2. **A parity case can be green on a file that does not run, and only
   execution finds it.** Session 34's zero-install proof caught a commit
   guard that could never resolve on Windows while the control compared it
   byte for byte and was right to pass. **Where a session ships something
   that is executed rather than read, execute it** — the control compares
   writers, and two writers agreeing says nothing about whether the artifact
   they agree on works.

3. **The parity control's cost is still the deterministic pass, and session
   34 spent none of it.** `facts` runs the control before every round at
   roughly 161 s a time. Session 34 added two cases and **no sixth shape**,
   deliberately: the case it could not reach from a shape is driven against
   the reference in `differential.test.ts` instead. That is the pattern to
   copy — a differential test costs one session, a shape costs every round
   of every session that follows.

4. **D130 override window — the operator can still override retiring the run
   core, until session 35 starts.** It is now next, so this window closes
   with the start of the session after this handoff.

5. **The Python-naming sweep is bigger than the two seat items, and there is
   now a transcript.** `REFRESH_COMMAND` and the 24,000 handoff threshold
   (D196) are still addressed to the cutover. Session 34's proof adds two
   more the handoff did not name: `session start`'s next-step hint and the
   selector's recipe both print `python -m ai_router.<module>` to an
   operator who may have no Python (D221). **Session 36's step 5 should grep
   for `python -m ai_router` across strings the router PRINTS**, not only
   across the docs it names. Everything in this class is correct today
   *because* there are two routers.

   **This repository's own `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` are on
   that list too.** Session 34 changed the generator, not the generated
   files: the fence here still names `.venv/Scripts/python -m
   ai_router.<module>`, which is what a session in this repository actually
   runs. Re-running `bootstrap` here is what refreshes them, and session 36
   is the commit that makes the new text true.

6. **One small fidelity gap is owed to the cutover** (D223).
   `packaging.ts`'s `recordedAt` writes millisecond precision where Python
   writes microseconds, and writes `.000` where Python omits the fraction
   entirely. Nothing compares it — normalization 1 collapses every timestamp
   and the schema wants only a non-empty string — so it is invisible until
   session 36, which is the commit where the record's timestamp format
   actually changes for anybody. `journal.ts:249` already implements
   Python's rule exactly, including the omit-when-zero case.

7. **The evidence protocol's two gaps still have no caller.**
   `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
   `verify_worker_result` and `record_worker_result` are ported and nothing
   in either router calls them. `outputHash` is not re-derived from
   `rawOutput`, and a check's `evidence.pass.requires` contract is not
   enforced when its result is recorded. This passes to whichever session
   first turns `critique.pipeline` to `shadow`.

8. **Cite file and line in a dispute, and it will hold.** The verifier has
   run with `agency: none` for six sessions and cannot open the repository,
   so an assertion about what the code says is worth nothing without a
   citation — and worth a great deal with one. Session 34's round-1 Major
   was withdrawn in full against three citations, and the round that did it
   cost **12% of round 1's input**, the cheapest second round the port has
   bought, because the fix delta was empty. **A dispute with no remediation
   is both the cheapest second round and the one most likely to be right:**
   nothing moved between the rounds, so it is a clean re-judgement rather
   than a review of new work.

9. **A Python design question is now FOUR sessions past the comfortable
   moment to ask it.** A malformed or hand-edited `sessions.json` or
   `activity-log.json` is *silently replaced* rather than refused, in both
   routers: `readRawSessionState` answers `null` for unparseable JSON and
   the activity log is rebuilt from any read failure. A verifier called that
   a Major in session 26 and it is a fair call. **It is a redesign and it
   needs an operator ruling**: refuse and fail closed, or keep replacing and
   say so. The projection is the one place that already distinguishes them —
   an absent ledger reads the plan, an unreadable one reports
   `invariantViolation` — so the shape of the honest answer exists at the
   read boundary. The cheapest moment to apply it everywhere is **after
   session 35**, when there is one implementation again.

10. **Read `docs/ts-port-parity-control.md` before planning any session from
    here.** Session 34 added two amendments and did not add a fifth
    normalization: what the `bootstrap` row reaches and what it deliberately
    does not, and why `PYTHONIOENCODING` is an input rather than a rule. It
    also recorded a **second exception** to "a behaviour change is not a
    fix", with a two-part test that should be applied strictly — the plan
    named the change, **and** the compared artifact has no byte-identical
    form without it. Both held for the fence and the hook. Neither holds for
    a convenience.
