# STATUS — 40 of 50 closed: task rows render at last, and two sessions in a row hit the round cap

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Recorded, 2026-08-30.** Session 38's deliverable is the planned-session
> projection; it recorded no decisions, and its three lessons are in the
> section below. Session 37's deliverables are decisions
> **D240–D243** in `docs/sessions/decisions-log.md`, and its survey is
> `docs/extension-dx-survey.md`. Three of the four were found by *running*
> the session rather than by planning it, and each one changes a later
> session: D240 (session 40's premise), D242 (session 39 owes the extension
> suite before session 41), D243 (the suite is not hermetic).

> **Recorded, 2026-08-29.** Session 36's deliverables are decisions
> **D231–D238**; session 35's are **D224–D230**;
> session 34's are
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
> moved up one and the plan ran to **36** (D188). Live guidance was
> renumbered; the append-only decisions log and the older sections of this
> file were **not**, because they were true when written. So "ported in
> session 29" in anything written before 2026-08-29 means what is now
> session 30, "session 31" means 32, and so on to the cutover, which was 35
> and is now 36.

## Where things are

**40 of 50 closed. Task rows render for the first time** — the Work Explorer's
third level has been built and unexercised since the port, and the reason was
not a missing feature.

**Session 40 closed `REMEDIATED_AT_CAP`, the second in a row.** The round-3
repair is unreviewed code: `declare` opening only step 1, and `start` no
longer logging the register step. Session 41 should read that before building
on it.

- **The plan was wrong and was amended before any code was written.** D240 was
  right: `dabbler session start` has always seeded a session's steps into
  `activity-log.json` — one `plan-step` row per numbered step, with a stable
  key — and `session log` moves them. `buildTaskRows` folded
  `approved-plan.json` against `step-execution.jsonl` instead, and nothing in
  the lifecycle writes either. **Two mechanisms for one purpose, and the tree
  read the one nobody wrote.** The planned task-file schema and `session step`
  verb were withdrawn on the record; the estimate went from 18 tests to 10.
- **The framework owns two bookends and no more.** `declare` opens the first
  step; recording the run of record closes the last. Everything between is
  `session log`, which already exists, already refuses a step it cannot
  resolve, and already journals.
- **`approved-plan.json` keeps its own job** — envelope, risk flags, amendment
  ledger for verification scope — and stops being the tree's source. The
  `ApprovedPlanReader` seam that reached it is retired.
- **D244:** `session start` no longer logs the register step. It used to write
  it complete, on the reasoning that the call IS the register step and the
  machine should record what it did — principle (g), and right in general. But
  a step `start` has moved is a step `declare` cannot open. Registration is
  still recorded in `sessions.json`, which is where a reader looks for it.

> **A dispute was filed and UPHELD against it, and the adjudication is the
> thing to carry.** `declare` had been completing step 1 and opening step 2,
> because step 1 reads "Register; declare" and is genuinely finished once
> declare returns. The verifier's answer: *semantic desirability cannot
> override an explicit transition requirement — if the requirement is
> undesirable, amend the plan rather than implement a different state machine
> quietly.* This session had already amended its plan once and then built
> something its own amended text did not describe, which is a unilateral
> substitution. Session 36 learned the same thing and it did not transfer.
>
> **The dispute also cost the round that would have reviewed the fix.** Filing
> it changed no code, so round 3's delta-only review had nothing to look at
> and re-raised three nits that round 2 had already confirmed resolved. Two
> sessions have now landed unreviewed in a row.

**Two sessions at the cap is worth the operator's attention.** The cap is
repository policy (`verificationRoundCap`), not a session's to change, and
nothing here suggests changing it — but sessions 39 and 40 both spent rounds
on the same shape of mistake: defending an interpretation instead of either
delivering the stated requirement or amending it first.

## Where things were at session 39

**Session 39 closed `REMEDIATED_AT_CAP`, not `VERIFIED`, and that is the first
thing to know about it.** Four rounds; round 3's repair was made and the cap
left it unreviewed. Every gate passes and `verification_clean` says so out
loud: *no verifier saw the repair.* It is not a waiver — nothing was accepted
over a standing finding — but **the round-3 delta is unreviewed code and
session 40 should read it first.** That delta is: `state` and `severity`
persisted on every owed-decision row, and the YAML list-indentation fix in
`appendSuitesToProjectConfig`.

- **Verification stops claiming things it did not check.** `checkTestRunFresh`
  returned a pass whenever no declared suite was expensive, which is how
  csv-model closed session 1 at a clean 5/5 with nothing runnable. A gate that
  cannot see its own precondition now reports **SKIP**, and a **sixth gate**,
  `owed_decisions`, does the refusing. Two rules that read as a contradiction
  are ordered as the rubric already orders them: nothing blocks on a person for
  a *judgment call*, and verification reduction is not a judgment call. Work
  runs to the end; what stops is the record calling itself verified.
- **`.dabbler/runs/owed-decisions.jsonl` is the new record**, append-only and
  repository-scoped because an unanswered question outlives the session that
  raised it. `dabbler owed list` prints the brief; `dabbler owed answer`
  settles one and **the framework writes the file** — for the suite question it
  writes `testing.suites` itself. Severity is derived from the class and never
  settable per call.
- **D242 is closed.** The extension is a declared suite (`runs_whole`: the npm
  script's glob is baked in, so naming a file would *add* to it). `dabbler.yaml`
  was also mapped to nothing and fell through to the smoke test while being the
  file that declares the suites; it is `repo_wide` now.
- Also: `--help` works after a subcommand on `session` and `test-evidence`, with
  a real per-subcommand options table; the malformed-suite message names
  `dabbler.yaml`; and a `none-selected` evidence outcome the framework
  **verifies by re-running the selection** rather than trusting.

> **The lesson of this session is about the second and third rounds, not the
> first.** Round 1's four Majors were all real and all cheaply fixed. Rounds 2
> and 3 were the same finding twice, and both times the defence was an
> interpretation rather than a delivery. Round 2: refusing to touch an existing
> suites list looked like a safe refusal and was a **deadlock** — the blocking
> question could be raised and never answered through the framework. Round 3:
> the record should carry `state` and `severity` on its rows, which this
> session's own plan says in plain words; two rounds were spent arguing that a
> state token does not belong in an event log. The design argument was
> reasonable and it was not the point. **Two of four rounds bought nothing but
> a concession that should have been made in round 2, and that is what spent
> the cap.**

**Owed to session 40 (D240, still standing):** `session start` already seeds a
session's plan steps and `session log` ticks them; what is missing is the join
to the projection the tree renders. Session 40 must re-derive its approach from
both mechanisms before writing code — it is likely much cheaper than planned.

**Both suites are now measured.** A session that changes only `tools/` selects
the extension suite and owes it a run of record. Every close from here records
two.

## Where things were at session 38

**Sessions 37 and 38 of 50 are closed VERIFIED.** The ledger reads 38 of 50,
and `dabbler status` now says so for the right reason rather than by accident.

- **Session 38 closed the defect `csv-model` found and the framework could not
  see.** `progress.ts` consulted `session-plan.md` only when the ledger was
  absent, so a planning session whose whole deliverable was new headings closed
  on a record that said the project was finished. The plan is now read on every
  projection; a session it declares that the ledger has not reached projects as
  **`planned`**, `totalSessions` counts those rows, and the close prints what
  comes next. Two rounds: round 1 raised one Major and two nits and **all three
  were correct**.
- **The Major is the one to remember.** This session defined `not-started` as
  "registered, and not begun" and then left plan-only repositories — the state
  every project is in before its first `session start` — still saying exactly
  that for sessions nothing had registered. All twelve new tests called
  `registerSessionStart` first, so the path was uncovered. The verifier had
  `agency: none` and could not read the tree; it inferred the gap from the
  guard condition and the shape of the tests.
- **`planned` cannot be stamped where it would seem natural.**
  `validateInvariants` accepts only the ledger's four statuses *and* requires
  contiguous numbering, and it runs over the derived view — so the state is set
  in the projection loop, after validation. Stamping it in `sessionsFromPlan`
  makes a fresh repository report an invariant violation instead of its
  sessions. The schema gained a separate `projectedSessionStatus` rather than
  widening the vocabulary shared with tasks.
- **The existing suite caught a regression this session introduced.** The first
  implementation appended plan rows over a ledger that was present and
  unparseable — replacing a broken record with a cheerful guess, which is the
  distinction `ledgerExists` exists to keep. The test that names it failed and
  was right.

> **A trap this session hit and the next one should not.** `dabbler` runs from
> `packages/router/dist/`, which is gitignored and rebuilt only on demand. A
> session that edits router source and then runs a `dabbler` verb **runs the
> previous build**. Session 38's own close printed a line from pre-remediation
> code and looked like a defect in work that was already committed and correct.
> It was harmless here because the stale code was a message. It would not be
> harmless if the change were to a gate: the close would have judged the
> session with the logic the session had just replaced. **Run `npm run build -w
> dabbler-ai-router` after touching router source and before running any verb
> that reads it.**

**Owed before session 41, from session 37 (D242):** `tools/` is covered by no
declared suite, so `dabbler affected` selects zero tests for an extension-only
change. Sessions 41, 42, 43 and 47 are all extension-heavy. Session 39 owes the
declaration.

**Also owed to session 40 (D240):** `session start` already seeds a session's
plan steps and `session log` ticks them; what is missing is the join to the
projection the tree renders. Session 40 must re-derive its approach from both
mechanisms before writing code.

## Where things were at session 37

**Session 37 of 50 is closed, and the block it opens is the operator's.**
Sessions 37–50 turn the framework toward the person operating it, planned
against the operator's eight DX principles of 2026-08-30, `csv-model`'s
nine-item feedback log, the RACI proposal in `docs/raci-fable.md`, and a
parallel review of the plan's first draft by `gpt-5-6-sol` and
`gemini-3-1-pro`.

- **Session 37 was a survey, and it is `docs/extension-dx-survey.md`.** Thirteen
  findings across 24 files and 4,029 lines of extension, each with an owning
  session. Two were fixed in the session because they needed no design
  decision; the rest were filed, not fixed. Four Majors, three of which sit on
  the "create a project" journey — the one a new developer meets first.
- **The eight status icons were declared in millimetres.**
  `width="16mm" height="16mm"` against a 16-unit viewBox, rendered in a 16-pixel
  tree row: about 60 CSS pixels of intrinsic size. That is the probable cause
  of `csv-model` feedback item 1, which its own session filed as unverifiable
  because a session has no view of the rendered UI. Static reading found what
  looking could not.
- **Three decisions, and the one that matters most was not in the plan.**
  D242: `tools/` is covered by no declared suite, so `dabbler affected`
  selected **zero tests** for a change set of two extension sources and eight
  extension assets, and this session could have closed green having run
  nothing. That is `csv-model` item 3's defect on this repository. It is
  assigned to session 39 and **must land before session 41**, because 41, 42,
  43 and 47 are all extension-heavy. The extension suite was run by hand
  instead: 123 passing, exit 0.
- **D240 corrects session 40's premise before session 40 starts.** `dabbler
  session start` already seeds a session's plan steps from its step list —
  this session's own start printed six, each with a `stepKey`, and `session log`
  ticks them. Session 40 was planned as though those steps did not exist. They
  do; what does not exist is the join to the projection the tree renders, since
  `buildTaskRows` folds an `approved-plan.json` nothing writes while the seeded
  rows sit in the activity log. Two mechanisms, one purpose, and the tree reads
  the one nobody writes. Session 40 must re-derive its approach from both.
- **D241 records what the survey deliberately did not change.** Six sites move
  text from the framework to an engine through a person. Removing them means
  building an executor, which is RACI open item 1 and the operator's decision,
  not a survey's.
- **One RACI cell is corrected rather than followed.** It marks the Solution
  Explorer a live defect because the projection's only writer was Python and
  was deleted at the cutover. `writeProjection` is TypeScript and six sites
  call it; the tree is empty because nothing scaffolds a manifest, the one
  read-only verb computes without writing, and there is no `viewsWelcome`.
  Session 42 wires rather than builds.

**The sessions are strictly sequential.** The ledger holds one `in-progress`
entry, `declare` takes the lifecycle lock, and session 37 has now amended the
step lists of 39, 41, 42, 43 and 47 — two more than it planned to, because the
survey found findings they owned.

## Where things were at session 36

**The port is done.** Sessions 22–36 replaced a Python package and a
TypeScript renderer over it with one TypeScript implementation. There is no
`ai_router/`, no `tests/`, no `pyproject.toml`, no `pytest.ini`, no Python CI
job, no Python suite in `dabbler.yaml`, and no parity control — the control
compared two routers and there is one. A project that adopts this framework
installs **nothing**: the extension bundles the router, calls it in-process,
and puts `dabbler` on the integrated terminal's PATH run on the editor's own
Node.

- **Session 36 is closed `VERIFIED`** — **3 rounds** (gpt-5-6-sol over the
  API), Claude Code / claude-opus-5[1m] orchestrator, all five gates green at
  the first attempt, nothing forced. **The whole set's acceptance test is
  that this paragraph is true**: the rounds, the disputes, the run of record,
  the gates and the close were all performed by the TypeScript router, in a
  tree with no Python in it. The ledger reads **36 of 36 complete**.
- **Rounds 1 and 2 raised the same two Majors and round 2 is the one that
  mattered.** Both rounds said `dabbler packaging` cannot publish this
  repository and that the round row spells the stamp `framework_version`.
  Two evidence-backed disputes were filed and **both were upheld** — and the
  verifier did not contradict a fact in either. What it said is that
  establishing why a requirement cannot be met *proves the missing capability
  rather than satisfying the requirement*, and that a unilateral substitution
  is not an amendment. **That is right, and it is the lesson of this
  session**: a session that cannot follow its plan must amend the plan on the
  record, not argue with the finding. Round 3 verified.
- **Round 1's most valuable finding was a nit, and it was a defect this
  session introduced.** Rewriting the release workflow dropped `!vsix-v*`
  from its tag trigger. GitHub's `v*` glob matches `vsix-v2.0.0`, so every
  Marketplace tag push would have started the router's npm workflow and
  failed its classify job. No control could see it — the YAML parses and the
  workflow is syntactically fine — and the old file's own comment had
  explained the exclusion, which is exactly the comment a rewrite drops.
  **A rewrite of a working file inherits its constraints or loses them
  silently.**
- **Round 3 verified with two nits, both about the amendment's own wording,
  and both were corrected AFTER the close.** One said the amendment credited
  "a third round" with upholding the findings when round 2 did; the other
  said the step-6 amendment left the supporting acceptance check ("seat cost
  is recorded for every session 22–36") contradicting it. Both are fair and
  both are fixed. **They could not be fixed before the close**:
  `session-plan.md` is not a lifecycle-written file, and `verification_clean`
  compares the worktree to the verified tree — a session editing the plan it
  is running against is drift, which is what that exclusion list exists to
  say.
- **The parity control's last run is D231, and it is recorded with the trees
  it ran against.** 5 shapes, 48 verb cases, 402 paths, all identical, exit
  0 — the same figures as session 35, which is the second thing it records:
  the first half of this session moved the extension off the spawn and put
  three new seams into the router package (`workdir.ts`, the capture in
  `cli/output.ts`, `inProcess.ts`), and every verb writes through two of
  them. 402 identical paths afterwards is the evidence that none of it
  changed what a verb says or writes. The Python tree
  (`52b0c51c`) and the TypeScript tree (`f8e93b7e`) are named in the
  decision, so the claim is checkable rather than remembered.
- **`InProcessRouter` reaches every verb through its own command-line
  handler** (D232), with `capture` collecting what the handler wrote and
  `standIn` answering the paths it did not name. Reaching past the handler
  into the module would have been a second implementation of the argument
  checking and the refusal wording — the extension would then show an
  operator a sentence the terminal never says. The three answers with a
  schema call their module directly, because rendering an object to JSON to
  parse it back is a round trip nothing needs.
- **`process.chdir` was not available, and that is why `workdir.ts`
  exists.** The extension host is one Node process shared with every other
  extension. `workingDirectory()` is now the one answer to "where is the
  router standing", replacing three scattered `process.cwd()` calls, and
  `standIn` refuses to nest rather than let two verbs resolve half their
  paths against each other.
- **A verb runs on the caller's thread, which bounds what the extension may
  ask for.** The projection is a few file reads behind an mtime cache;
  `session cancel` is a click the operator is watching. `verify` and
  `workflow` buy models and run suites, and they belong in the terminal,
  which is where the lifecycle runs them. A future session that wants
  `verify` behind a button needs a worker, not a smaller comment.
- **The bundle carries a `package.json` that says what it is** (D233), and
  that is the load-bearing part of the asset move. `PACKAGE_ROOT` walks up
  for a manifest NAMING the router; inside a VSIX the nearest one above
  `dist/extension.js` is the extension's, so the walk would have run off the
  top of the filesystem on the first config load — on somebody else's
  machine, with nothing to fall back to. `esbuild.js` writes a two-line
  manifest beside the bundle and copies the router's runtime data next to
  it, taking the asset list from the router's own `files` rather than
  restating it.
- **The terminal shim stopped resolving a package it does not ship.**
  `require.resolve("dabbler-ai-router")` answered correctly in a workspace
  and could not answer at all in a VSIX, because `.vscodeignore` excludes
  `node_modules`. That was survivable while the shim was a convenience; it
  is the operator's only hand-run surface now. The extension builds
  `dist/dabbler.cjs` itself and the shim looks beside itself — proved
  directly: `node tools/dabbler-ai-orchestration/dist/dabbler.cjs status`
  reads this repository's ledger and finds its own schemas.
- **`engines.vscode` is `^1.135.0`**, which is D131's rule rather than a
  guess: the lowest VS Code whose extension host carries an unflagged
  `node:sqlite`, *found by running the check on that release*. 1.135 is the
  one that has been measured, so it is the floor until a lower one is.
- **`frameworkVersion` is the set's one record change and nothing is
  back-filled** (D234). A row without the stamp was written before the stamp
  existed, and filling it in with today's version would replace a fact with
  a guess nobody can check. The session stamp is carried across rebuilds
  beside `startedAt`; the round stamp is written in `appendRound` rather
  than at the three call sites that build a row, because a stamp a caller
  can forget is absent on the row that most needed it.
- **The verb table shed the port's scaffolding** (D235). `pythonModule`,
  `pythonCli` and `portedInSession` are gone; `contracts.test.ts` now holds
  the table and the registry to each other in both directions. `ledger` and
  `approved-plan` leave the table (libraries, no command line) and stay on
  the contract, where `InProcessRouter` implements both for the first time.
  `ledger.unresolved` is trimmed outright — declared in session 23 and never
  implemented on either side, which is D162/D152 exactly. **`progress` is
  gone and `status` is the one name**: the alias existed because the
  extension spawned `progress`, and it calls a method now.
- **`--irreversible-delete` is what made this session reviewable at all**
  (D236). Deleting `ai_router/` and `tests/` makes `git diff HEAD` **2.3
  MB** — four times the cap, and roughly 600,000 tokens of removed Python
  with the twenty lines that are not a deletion somewhere inside it. git's
  own flag drops the removed LINES and keeps every `deleted file mode`
  header: **256,668 characters**, inside the cap, nothing hidden.
- **The session plan is AMENDED, and that is the operator's to reverse**
  (D238). Two of session 36's steps ask for what the implementation cannot
  do — publish two artifacts through a packaging block that models one, and
  bump a version discriminator the round record has never had. Rounds 1 and
  2 both raised them as Major and both of round 2's acceptance criteria
  named the same resolution: *or the governing plan must be formally amended
  before the session claims completion*. The amendment is written into
  `docs/sessions/session-plan.md` beside the steps it changes, so a reader
  of the plan meets it rather than finding it in a decision. **It changes
  what this session was required to deliver**, which is not a model's call
  to make silently — it names what the plan asked, what was done instead,
  and what reversing it would cost.
- **The release path is the two tag-driven pipelines, not the packaging
  block** (D237). `dabbler packaging` refuses this repository and is right
  to: the block describes one pack and one push, and there are two artifacts
  and two registries. `release.yml` publishes to npm now instead of PyPI
  (same tag shapes, same OIDC, same green-Test gate); the `Test` workflow
  lost its Python job. **Both artifacts sit at 2.0.0 and the tag push is the
  operator's** — it is irreversible, it goes to two public registries, and
  the credentials live in GitHub environments rather than on this machine.
- **`packaging.ts`'s `recordedAt` writes Python's rule** (D223, discharged):
  microseconds, and no fraction at all when the value is whole. It had
  millisecond precision and wrote `.000` where the reference omitted the
  fraction; nothing compared it then and this is the commit where the
  record's timestamp format changes for anybody.
- **Three vendor calls, 139,326 tokens, no seat** (D239) — 125,632 in /
  13,694 out, all `gpt-5-6-sol` over the direct API. Second most expensive
  session of the port behind session 35's 147,120, and a different shape: the
  three rounds are comparable in size because rounds 2 and 3 carried
  file-backed disputes and then a plan amendment into an otherwise small fix
  delta. **Disputing is not free** — a rebuttal rides the prompt whole.
- **Session 36's own ledger row carries no `frameworkVersion`, and that is
  correct.** `session start` ran through the Python router at 18:42, before
  the stamp existed; the three round rows, written after it, all carry
  `framework_version: 2.0.0`. The one session that spans the cutover records
  it by the absence, which is what the field was designed to mean.
- **The Playwright layer was ported and is NOT exercised by this session.**
  It built its fixtures by running Python snippets and pinned a
  `dabblerSessionSets.pythonPath` that no longer exists as a setting; it now
  spawns the extension's own `dist/dabbler.cjs` for the CLI verbs and runs
  the router's source under Node's type stripping for the two writes that
  must go through a sanctioned writer. It is not a declared suite and does
  not run in CI, so this is a coherent harness rather than a verified one.
  **What would verify it is one Layer-3 run on a machine with the VSIX
  installed.**

### Session 35, still current

- **Session 35 is closed `VERIFIED`** — **3 rounds**, one finding disputed and
  **withdrawn**, one disputed and **upheld against a dispute that was wrong**
  (gpt-5-6-sol over the API), Claude Code / claude-opus-5[1m] orchestrator.
  Round 1 raised three Majors; round 2 raised two more, one of them a defect
  the remediation itself introduced.
- **The plan's paragraph and D129's inventory are two records of one
  decision, and they disagreed** (D224). The session plan lists `fixloop`
  (563) and `testphase` (345) on the run core's deletion list; D129 puts both
  on the **port** list and says why in its own table — `workflow` imports
  them, so they are the six-step driver's remediation loop and tests phase.
  `facts` is on the plan's deletion list too and is what `verify` runs on.
  **The real shape was six modules ported and three deleted**, 3,102 lines and
  127 tests rather than the paragraph's 2,194 and 99 — a session planned
  against the prose would have been planned at two-thirds of its size.
- **The import audit is necessary and was again not sufficient.** Twenty-one
  symbols across six modules, all resolving, with the git seam in `journal.ts`
  where D129 said it would be. It cost minutes and it is what turned the
  plan/inventory conflict into a decision instead of a deletion. It did not
  catch that `dabbler.yaml` still selected deleted test files; the verifier
  did.
- **`test_runcore_checks` drives `checks` through the run core's own command
  line** (D225). D129 kept it on the grounds that its subject is `checks`
  rather than the run core it is named for. That was right about the subject
  and wrong about the driver: all twenty tests go through `cli("check",
  "--run", ...)`, so the file cannot import once `runcli` is gone. It is
  deleted, and `packages/router/test/checks.test.ts` — which says in its first
  line that it is the port of that file — already carries the behaviours at 22
  tests. **The Python suite lands at 832, which is exactly D129's predicted
  total**; the entry was right about the number and wrong about which twenty
  made it up.
- **`ai_router/checks.py` has no Python test driving it directly for one
  session.** Recorded rather than papered over. It is not uncovered — the TS
  port has `checks.test.ts`, the parity control compares every verb that runs
  a check, and session 36 deletes the module.
- **`[project.scripts] dabbler` pointed at `ai_router.runcli:main` and went
  with it**, which settles the collision session 34 left open: the terminal
  shim, the managed fence and the commit guard all name `dabbler`, and until
  now a `pip install -e .` put a second unrelated one on the same PATH.
- **`dabbler status` exists, and the dispute that argued it should not was
  wrong** (D229). Round 1 called its absence a Major; the dispute cited that
  the verb had never been in `contracts/verbs.ts`; round 2 upheld the finding
  with "adding `status` is not inventing an unsolicited verb when the
  governing plan names it." That is right. **D130 named the command when
  `dabbler` still WAS the Python CLI** (`[project.scripts] dabbler =
  "ai_router.runcli:main"`), so "`dabbler status` now reads the lifecycle's
  record" meant *keep the name, change what it reads* — and D162's
  no-invented-verbs precedent, which covers verbs no plan named, does not
  reach it. It is an alias: `statusVerb` delegates to `progressVerb` with the
  name it was invoked under, so there is one projection and the usage text
  says what the operator typed.
- **A dispute is only as strong as the kind of fact it cites.** Three of this
  port's disputes have been withdrawn against citations of what the code
  *does*. This session filed two: the one citing
  `ai_router/workflow.py:1221` — `--author-provider` optional in the
  reference implementation — was **withdrawn in full**; the one citing an
  *absence* was upheld. Absence proves a thing was not built, never that it
  should not be.
- **The remediation introduced its own Major, and the verifier caught it.**
  Removing the stale `when: ai_router/pricing.py` rule — a genuinely dead
  rule, whose trigger module was deleted back in session 8 — took three lines
  and orphaned the other three selects into the preceding rule. The YAML still
  parsed and every named path still existed, so the audit that prompted the
  removal was blind to it. **The rule is restored whole.** Out-of-scope
  tidy-ups in structured config are how a fix becomes a defect.
- **Deleting a dead deny-list entry silently widened an allow-list** (D228).
  The parity control's `EXCLUDED` carried four run-core records; nothing writes
  them now, so they were removed as dead configuration. `COMPARED` matches
  `^\.dabbler/runs/s\d+/.+$` — the whole directory — so those entries were what
  *bounded* that pattern rather than a description of files that exist. The
  suite went red on the first full run and they are restored, with a comment
  saying why they stay. "Nothing writes this any more" argues for deleting the
  writer and never on its own for deleting the rule that bounds a reader.
- **3,102 Python lines became 4,225 TypeScript across twelve files** — 1.36x,
  against the 1.32x running ratio (D227). The excess is the CLI: `workflow`
  has ten subcommands and argparse sub-parsers do not translate. `workflow`
  split four ways on the seams it already had — `log` (523: events, the
  transition judge both sides call, the fold), `commands` (564), `terminal`
  (302: the caps and the three terminal states, which read a folded state and
  a tree rather than the log), `project` (176) — plus `cli/workflow.ts` (381).
  The other five modules are one file each.
- **The parity control gains three cases and no shape** (D226). `solution.yaml`
  is eight lines added to the corpus **seed**, so every shape carries it for
  one `writeFileSync` per copy and no router invocation — a sixth shape would
  have been built twice on every round of every session that follows.
  `workflow enter` compares the *second* `enter`, which is the only version
  that exercises the fold, the transition judge and `sort_keys` at once;
  `workflow status --json` compares the projection as the extension receives
  it; `solution check` compares a rendered report. **`contractdoc` gets no
  case**, deliberately: its output goes to a caller-named path no compared
  pattern covers, and its diagram is a pure function driven by thirteen
  differential tests instead.
- **Parity: 48 cases, 402 paths, all identical**, across all five shapes.
- **Suite: 832 Python (4:54) / 964 router vitest (4:09, plus 4 live tests
  skipped); all four declared controls green.** Python is down 109 and
  TypeScript up 128 — the 127 ported plus the `status` alias's own.
- **One test needed a declared timeout.** `testphase.test.ts`'s
  two-ecosystem case spawns two real subprocesses, which is the claim it
  makes; under the whole suite's parallelism that outran vitest's 5 s default
  though it passed in isolation. It carries `30_000` and says why.
- **The verb table's announce-then-implement example is exhausted.**
  `contracts.test.ts` asserted the discipline by naming a declared-but-
  unregistered verb — `verify` until session 33, `workflow` until this one —
  and its own comment called that "a countdown". It now computes the set from
  the table and asserts each member names the session that lands it, so it
  stops needing an edit. Two qualify today: `ledger` and `approved-plan`, both
  `pythonCli: false`.
- **Three vendor calls, 147,120 tokens — the port's most expensive session**
  (D230), ahead of session 23's 136,020, with round 1 alone 86% of it. Rounds
  2 and 3 cost 5.6% of round 1's input each. **No seat transport was used**, so
  `seat_cost` has nothing to answer for this session and it is not comparable
  to the seat series.
- **The run core's two design documents are marked superseded, not deleted.**
  `docs/run-core-blueprint.md` (1,361 lines) and
  `docs/run-core-phase0-report.md` (425) describe an implementation that no
  longer exists in any tree. They stay because D130's authority rests on the
  evidence in them, and a decision whose reasoning has been deleted cannot be
  re-examined.

## Where things were at session 34

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

### Session 33, still current

- **Session 33 is closed `VERIFIED`** — **2 rounds** (gpt-5-6-sol over the
  API), and **both rounds were bought by the TypeScript loop**, not by
  Python. That is the session plan's step 7 taken literally and the first
  time the ported router has purchased a verdict for this repository's own
  record. Round 1 raised one Major and two nits; the Major was **accepted
  and fixed**, and one nit's obvious fix turned out to be drift (below).
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **`verify` (2,537 lines) is seven files, not the plan's five, and the
  verifier was right to say so** (D211). The constraint that mattered holds:
  `rounds.ts` is the largest at 716 and none exceeds 800. `errors.ts` (57)
  is the file the plan's list does not name and the one that most needed to
  exist — six seams return the same six exit codes, an orchestrator branches
  on them, and a refusal answering 3 where its twin answers 2 is drift no
  record could see. The other six are `prompts` (357), `rounds` (716),
  `disputes` (548), `reanchor` (272), `prepare` (325) and `steps` (620),
  plus `cli/verify.ts` (321). **3,200 Python lines became 4,232 TypeScript
  across ten files** — 1.32x, the ratio since session 25. The suite went
  686 → **771**.
- **`facts` (663 lines) had never been ported, and the consumer is what
  found it** (D210). D129 assigned it to what is now session 32 — "Session
  31 takes it", pre-renumbering — and session 32's own text in the session
  plan never named it. Nothing detected the gap: not the verb table, which
  carried `portedInSession: 32` silently; not the parity control, which had
  no `facts` case; not the suite. It surfaced when `verify`'s imports were
  written out. The port's four known sizing-error shapes are all questions
  asked of a module in isolation; **this is a fifth, asked of the sequence —
  a module's session assignment and the session plan's prose are two
  records, and nothing checks that they agree.**
- **One rule could not be ported by copying it, and the record cannot see
  the difference.** `facts.run_control` rewrites `python`/`python3` to
  `sys.executable` so a control runs in the router's own environment. There
  is no Python beneath this router to substitute, and after the cutover
  there is none in the product at all — so the RULE is ported rather than
  the substitution (`node` → `process.execPath`). `ControlFact.command`
  carries the DECLARED command and never the resolved argv, so both routers
  write the same bytes, which is what the two `facts` cases compare.
- **The parity control goes from 2 shapes / 28 cases / 179 paths to 5 / 42 /
  366, and got FASTER** (D213, D214). `disputed`, `at-cap` and
  `moved-machine` are built for the first time, each driven through the
  Python router's offline transport with scripted verifier text. A shape is
  now built **once** and copied per case — D169's named lever — and the
  measurement is the point: **161 s for 42 cases across 5 shapes, against
  193 s for 28 across 2.**
- **Round 1's Major was a vacuous corpus shape, and it is D207's defect in a
  new place** (D212). `moved-machine` cloned the working repository. Since
  D135 the session record and the run ledger are untracked, so the clone had
  neither — and every `verify reanchor` case passed by watching two routers
  agree that no session was in flight, while `baseline-reanchors.jsonl` was
  never written and never compared. A local `git clone <dir>` also
  **hardlinks the whole object store**, so even with the record restored the
  recorded tree would have arrived and taken the refusal branch. It now
  clones the **bare remote** (with `--branch main`, because a bare HEAD names
  the branch `init --bare` chose), copies the record across without the
  objects, and **asserts its own premise**: it reads round 1's
  `completion_tree` out of the copied ledger and refuses to build if
  `git cat-file -e` finds it. **A corpus shape that cannot fail is worse
  than a missing one** — it reports a pass for a comparison that never ran.
  The fix is measurable: **339 → 366 compared paths**, the 27 being the
  files the case exists to compare.
- **Caching changed what the determinism check is FOR, and three shapes
  genuinely lack it** (D213). It used to be a precondition — each case built
  the shape twice, so a non-reproducible shape surfaced later as router
  drift that was not one. Both copies now come from one build and are
  identical by construction. But once a shape records a round, its
  `completion_tree` hashes the working tree *including the lifecycle's own
  bookkeeping*, and two builds can never agree on it. A timestamp can be
  normalized; a hash over one cannot. So the object id is reduced **for the
  determinism comparison only** — the same concession `DIGEST_LEDGERS`
  already makes — and scoped to the question that needs it: **two builds are
  two clocks; two routers share one build.**
- **The richest judgement in the module is now compared without paying a
  model.** At the cap the loop decides which of the two terminal states this
  is *from the record*: the last round's finding cites `src/widget.py`,
  nothing has moved since, so the fix delta touches no cited path and
  REMEDIATED AT THE CAP is not earned. Both routers must reach UNRESOLVED,
  list the finding with its citation, and write no terminal row.
- **Four differential tests, and two sentences that were wrong are corrected
  in place** (D215). The closed-step row, the agency record, the
  deterministic-facts row, and **D168's look-alike verdict token** —
  discharged here rather than in 32, because the previous *Next* took D168's
  literal "session 32" without applying D188's renumbering. The parity doc
  claimed an agency comparison "cannot" exist before `verify` lands; what
  cannot exist is a *file* or a *CLI case*, and the fold could have been
  compared any time. A test comment claimed a `.venv`-only guard covers
  every machine with Python; it does not, and now says so.
- **A nit about fidelity whose obvious fix was itself drift** (D216). The
  verifier observed that unknown flags were silently ignored, so
  `--max-round` would run at the default cap. Refusing unknown flags looked
  like the fix — but running the same token through Python showed argparse
  **accepts** it, because argparse resolves any unambiguous prefix.
  Refusing it would have turned a working command line into an error for the
  same words. Both halves are ported: `verify step open --s x` now prints
  `ambiguous option: --s could match --sessions-dir, --step` on both
  routers, byte for byte. **A fidelity nit has to be checked against the
  reference, not against what the reference is assumed to do.**
- **944 pytest / 771 vitest, both green as `final-full`.** Seat cost (D217):
  **73,740 in / 14,299 out** over two rounds; round 2 cost 11% of round 1's
  input.

### Session 32, still current

- **Session 32 is closed `VERIFIED`** — **3 rounds** (gpt-5-6-sol over the
  API). Round 1 raised three Major: one accepted in part and fixed, two
  **disputed with file and line and withdrawn**. Round 2 verified. The close
  then **refused**, correctly, and round 3 was the answer. Claude Code /
  claude-opus-5[1m] orchestrator. Nothing was forced.
- **`agency` (921), `approved_plan` (590) and `plan_review` (812) are ported
  whole; `verifyjob` is ported as 56 lines, not 782** (D204). The session
  plan sizes that module at its pre-split figure; D129 splits it, and the
  retired ~680 lines are `cmd_verify` and its helpers, which import `runcli`
  and `runcore` and are deleted with them in session 35. Measured rather
  than inherited — `build_prompt`'s only caller in the whole package is
  `cmd_verify`, so D129's own criterion ("what `verify` and `route` import")
  names one function too many. **This error has already cost this port a
  session once**: D178 took `checks.plan` back out of `checks.ts` for the
  same reason. The suite went 618 → **690**; 2,379 Python lines became
  2,825 TypeScript across four files.
- **`route.ts` stops refusing itself by name.** The branch that threw "the
  auto-verification job … is ported in session 32" is gone, replaced by the
  real one and four tests: a `code-review` verified through a different
  provider, the metrics row bound to the model it reviewed, the paid-for
  answer surviving a verifier that cannot be reached, and a verification
  that does not verify itself.
- **The JSON seam gained `sort_keys` and `separators`, because the plan hash
  is a digest over them** (D206), checked byte-for-byte against CPython on
  five inputs. `sortKeys` orders by **code point** — JavaScript's default
  sort is by UTF-16 code unit, and the two disagree above the basic plane.
  **The proof is the artifact, not the option**: Python wrote and approved a
  plan the TypeScript `readPlan` accepted (which recomputes both hashes and
  refuses on either mismatch), and TypeScript wrote one Python accepted,
  same `plan_hash` on both sides.
- **Round 1's *nit* was the most valuable thing in the round, and it landed
  against a comment asserting the opposite of the truth.**
  `buildVerificationPrompt` filled its placeholders with JavaScript's
  `replace(string, string)`, which is neither global (Python replaces every
  occurrence) nor literal (`$&`, `` $` `` and `$1` expand against the
  match). Both are reachable from an ordinary routed response, because the
  text under review is substituted verbatim — any answer discussing shell or
  regex syntax was corrupted before the verifier read it. Fixed with
  `replaceAll` and a **function** replacement, the one form that is both.
- **D198's `ApprovedPlanReader` is registered, and proved through the built
  bundle rather than the source** (D207). Both routers now fold the same
  non-empty task row out of a real plan.
- **`approved_plan` has no CLI on either side, so it is compared through its
  caller — and that is the finding, not a shortcut** (D205). `ParityCase`
  compares `python -m <module>` against `dabbler <verb>`; `verbs.ts` has
  recorded `pythonCli: false` for `approved-plan` since session 23 and
  `plan_review` has no verb entry at all, so no case in the table's shape
  can exist. The `in-flight` builder now writes and approves a real plan and
  opens its step, and the existing `progress --json` case compares the fold.
  **Before this, both routers agreed the task list was empty** — which reads
  as proof and is not. 28 cases, **179 paths**, up from 137.
- **The plan WRITER is gated by a different instrument, and it was falsified
  before it was trusted.** Both copies' artifacts are Python-written, so no
  CLI case can reach the TypeScript writer. A differential test drives both
  writers over one input, compares the bytes, and hands the TypeScript
  output to Python's own `read_plan`. Flipping `sortKeys` to `false` in
  `coreBytes` turns it red.
- **A third digest ledger names itself**: `approved-plan-writes.jsonl` joins
  `state-writes.jsonl` and `api-models.lock`, under the rule those two
  already state — its rows are hashes over content carrying `approved_at`.
  The plan's own `plan_hash` is **not** reduced, and is the strongest single
  check in the corpus that both routers canonicalize JSON identically.
- **The close refused once, and the gate was right** (D209). Three edits
  made *after* round 2's VERIFIED — a doc paragraph, a test comment and a
  flake timeout — moved the tree, and `verification_clean` caught them.
  Earlier in the session a `close --dry-run` showed that gate passing, and I
  read it as licence; it passed because the edits had not been made yet.
  The gate does not ask whether a change was behavioural. **`--force` was
  not used and would have marked sessions 33–36 complete.** The correct cost
  was one cheap round.
- **A pre-existing flake was fixed because a run of record must be green.**
  `checks.test.ts` ("hands the child an allowlist") seeds a git repository
  and spawns Node twice against vitest's default 5 s; it passes in 1.3 s
  alone and timed out under full-suite load. It was failing on the baseline
  run before this session wrote a line. Re-running until green would have
  hidden it.
- **944 pytest / 686 vitest, both green as `final-full`.** Seat cost
  (D208): 53,419 in / 12,678 out to gpt-5-6-sol over three rounds; round 2
  cost 23% of round 1 while carrying three rebuttals as well as the fix
  delta.

### Session 31, still current

- **Session 31 is closed `VERIFIED`** — **1 round** (gpt-5-6-sol over the
  API), three minor findings and nothing blocking; the only session of the
  port so far to be verified on the first pass. Claude Code /
  claude-opus-5[1m] orchestrator. All five gates passed at the first
  attempt; nothing was forced.
- **The lifecycle is ported whole, and `cli/session.ts` refuses nothing.**
  `plan`, `close` (with `--dry-run` and `--force`), `cancel`, `restore` and
  `migrate` join the four writers session 26 landed, and `dabbler progress`
  and `dabbler modules` are verbs for the first time. Four modules,
  3,103 Python lines: `gates` (421), `session` (1,386), `progress` (1,050)
  and `modules` (246). The suite went 498 → **614**.
- **`gates` went first, as the session plan insisted, and the instruction
  paid for itself in a way that has nothing to do with the gates' logic**
  (D197). Almost everything `gates` emits is prose an operator reads when a
  close is refused, and a translation loses four things silently: em dashes
  (three of the five remediations carry one), Python's `repr` on a branch
  name and a verdict token, Python's `str` on `None`, and `int()` over
  `git rev-list --count`, which is `0` for anything non-integer rather than
  `NaN`. The first `close --dry-run` comparison was byte-identical, which
  fixed the wording as a fixed point before 2,700 more lines were written
  against it. `pythonStr` moved to `pythonJson.ts` beside `pythonRepr`
  (three modules now need it), and `writers.validateAndWriteState` is
  exported so `cancel`, `restore` and `migrate` land a record the way a
  registration does rather than through a second write path.
- **The import graph ran the wrong way once, and the answer is a refusal
  rather than a guess** (D198). `progress.build_task_rows` reads
  `approved-plan.json` through `approved_plan`, which is **session 32's**
  module — and porting its read half meant pulling ~250 of its 590 lines
  (the integrity check, the amendment fold, the risk-flag derivation, which
  itself reads `docs/modules.yaml`) into a session already carrying 3,103.
  Rendering an empty task list until then was the option that had to be
  refused: the projection would say "this session has no tasks" over a
  session that has seven, in the one field the Work Explorer renders as a
  list of what to do next, and no corpus shape carries a plan for the
  control to catch it. So `progress` declares an `ApprovedPlanReader` seam —
  the same shape `writers.usePlanParser` already uses — and, unregistered,
  `buildTaskRows` throws the moment a plan file exists. `buildProjection`
  already had the field for that answer: `tasksRefused`, beside an empty
  `tasks`. **Session 32 registers the real reader.**
- **`modules` has one subcommand on both sides, so the contract lost two**
  (D199, discharging D152 under D162's ruling). `ModuleVerbs.list` and
  `.retire` — and `ModuleRetireOptions` — are trimmed rather than stubbed:
  the manifest is create-only by design, and two of the extension's
  `refuse()` stubs existed only to satisfy an interface. They are gone. The
  read surface (`loadEntries`, `findEntry`, `parseEntries`) is ported whole
  even though no ported verb calls it yet, because `approved_plan` is its
  caller in session 32 and a module's readers are the module.
- **The first ported verb that writes YAML, and it is compared** (D200).
  `docs/modules.yaml` joins the compared paths — the one compared path
  people also edit by hand — because both routers rewrite the whole file on
  every `create`, and two emitters that disagreed would make every later
  diff of a tracked file carry noise nobody could attribute. Four options
  reach the `yaml` package to PyYAML: sequences at their key's indent,
  single quotes, fold width **81** (PyYAML's `best_width` is 80 and it
  allows the break past it), and **`version: "1.1"`** — the one that is easy
  to miss, because YAML 1.1 resolves `yes`/`no`/`on` as booleans and quotes
  them where the 1.2 core schema leaves them plain. **Two inputs still emit
  differently and are recorded rather than papered over**: a scalar of
  exactly `y` or `n`, and a value carrying a newline. Both are legal YAML
  for the same value; closing them means writing a PyYAML-compatible
  emitter, which is a session, not a port's side effect, and it is moot at
  the cutover.
- **The parity control gained a `setup`, and it is cheaper than a shape**
  (D201). `restore`'s only write path needs a cancelled session, and no
  built shape carries one — a shape is a lifecycle position and "cancelled
  then restored" is a transition. A case may now declare one `python -m`
  invocation run on **both** copies before the compared verb. It costs the
  control nothing it did not already trust: the corpus is built by driving
  the Python router, and this is one more of those invocations, made at case
  time. D176 had already priced the alternative — a sixth shape is the
  expensive thing.
- **Ten cases in, 28 total, 137 paths, still green.** `session plan` and
  `modules create` on `fresh`; `close --dry-run` on both shapes; `close` on
  `in-flight` (the rows, then the refusal, and nothing landed on either
  side); `cancel --force` and `restore` on `in-flight`; `progress --json` on
  both shapes and `progress` with no flag on `fresh`, which is what *proves*
  the flag is inert rather than asserting it. **`session migrate` gets no
  case**, and that is a corpus gap rather than a divergence: every built
  shape is post-collapse, so there is no legacy set directory to read.
- **`resolveSessionOrchestratorIdentity` landed as D164 planned** (D202): a
  wrapper over the block-level resolver, reading the record through
  `progress` rather than opening `sessions.json` a second time. Five tests
  cover it — the three selection branches and the two refusals — where the
  Python suite has none, which is the one place this session deliberately
  goes past its twin, and it is safe because it adds tests rather than
  behaviour.
- **A `progress --json` comparison against this repository's own 31-session
  ledger was byte-identical** on the first run, timestamp aside. That is the
  hardest single input either router has been handed — real rounds, real
  agency logs, real verdicts, a healed title — and it agreed before the
  corpus did.

### Session 30, still current

- **Session 30 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised one Major; it was **accepted and fixed**. Round 2 restated
  it on a narrower claim; that one was **disputed and withdrawn** in round 3.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **The seat's dispatch state machine is ported whole**, and `route`'s
  `copilot-cli` branch stops refusing itself by name — the refusal that
  `route.test.ts` asserted against session 30 is gone, replaced by five tests
  of the real branch. Spawn under a deadline, first-byte and total timeouts,
  the temp-file pull above 24,000 rendered units with its nonce footer and
  acknowledgement, the stderr taxonomy, and an unreadable catalog that stops
  dispatch instead of falling back to the API.
- **Two shape differences, both forced, neither in the record.** Python's two
  reader threads and their queue become one line pump feeding the same queue,
  because there is one thread; and `dispatch` is async, which is what `route`
  already expected. **The measurement is not allowed to differ**, so
  `subprocess.list2cmdline` is ported literally — trailing-backslash doubling
  included — because the inline-vs-handoff branch is chosen from its length,
  and a different number would send the two routers down different paths for
  the same prompt.
- **The catalog gained its writer, and a verb with it.** `dabbler copilot
  refresh` (D190): the absence of a refresh command IS the incident this
  record's design turns on, and a cutover that left the seat catalog
  unrefreshable from the router that dispatches off it would recreate it.
  `REFRESH_COMMAND` still names the **Python** invocation on purpose — both
  routers print that string and the control compares it — and re-pointing it
  is owed to the cutover.
- **Round 1's Major was a divergence, not just a bug.** `resolveProgram`
  walked PATH the way `cmd` and `where` do, so `copilot` resolved to the
  `.BAT` shim VS Code installs ahead of the WinGet `.EXE`. A shim can only be
  run by `cmd.exe`, whose command line stops at **8,191** where
  `CreateProcess` allows 32,767 — and the handoff only starts at 24,000, so
  every prompt in between would have failed before the CLI ran. Python found
  the executable; this router found the shim. Resolution now prefers an
  executable anywhere on PATH to a shim nearer the front, which is
  `CreateProcess`'s rule and the one `subprocess` follows (D195).
- **Round 2 asked for shim parsing and was refused (D196).** D174 had
  already measured and rejected it, and this shim has no executable target to
  find: `copilot.bat` is `@echo off` plus `powershell -ExecutionPolicy Bypass
  -File …\copilot.ps1 %*`. The residual — a machine with only a shim — is
  bounded identically on **both** routers, so fixing it on one side would be
  a capability divergence introduced by a port. **Every round ran with
  `agency: none`**, which is why the dispute cited file and line rather than
  asserting.
- **`seat_cost` is ported on `node:sqlite`**, `readOnly` (which is `mode=ro`);
  the WAL is read and `immutable` is not used, because `immutable` is what
  skips the WAL and undercounts a live store by ~7%. It is **fetched with
  `process.getBuiltinModule`, not imported** (D192): `node:sqlite` is absent
  from `module.builtinModules`, so resolvers strip the prefix and hunt for a
  package called `sqlite`. That answer needed no build config and no
  test-runner config; the `vitest.config.ts` written along the way was
  deleted.
- **The live seat probe reached the real CLI and the seat refused for quota
  (D193).** It spawned the actual `copilot`, measured 31,673 rendered units,
  took the **handoff** branch, wrote a 31 KB payload and dispatched — then
  got `You have exceeded your monthly quota`, which the taxonomy classified
  `quota-rate-class` from real stderr. **The ack-validated half of step 5 is
  therefore unproven** and is owed to a run after the quota resets; the test
  is committed behind `DABBLER_E2E=1`. A real failure is not nothing: no fake
  spawner could have produced it.
- **Seat cost is measured, and it is its own acceptance test.** The failed
  turn still cost credits, and both routers priced the same conversation
  against the CLI's live store identically — `measured`, **9.197 credits /
  $0.0920** over one event — agreeing with each other and with the CLI's own
  reported 9.2.
- **Parity: 18 cases, two of them new, all identical.** `seat-cost` enters
  with a **floor** case and an **unmeasured** case, over a canned
  `session-store.db` the corpus writes. The seat catalog's **write** does not
  enter and cannot: a refresh must probe, and a probe is a billed premium
  request per model. `copilot refresh --dry-run` spends nothing, was run both
  ways and is byte-identical — but Python's `python -m` path prints a runpy
  `RuntimeWarning` to stderr, which the control compares. It becomes
  comparable for free at the cutover (D194).


### Session 29, still current

- **Session 29 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major; it was **accepted and fixed**, not
  disputed, and round 2 was clean but for three nits describing one race.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **D173 and D185 are closed by one ruling (D187).** Both were the same
  complaint: the two routers wrote a different string into a record for the
  same event, because the string was the name of whichever library did the
  work. Both are now framework-owned vocabulary. This is a **record change,
  not a port session** — no module was translated, and both halves landed in
  Python first.
- **A failed enumeration has eight names and the list is CLOSED.** `timeout`,
  `network-error`, `http-error`, `parse-error` and `unknown-error` join the
  three the field already carried. An unmapped failure becomes
  `unknown-error` rather than contributing its class name: an open mapping
  breaks the byte comparison the first time either library raises something
  unanticipated — silently, in a committed file, on whichever machine hit it
  first. **The original class name is written nowhere**, because a second
  field would recreate the problem and excluding it from comparison would put
  a value in the record that nothing checks.
- **Timeout and unreachable stay apart**, against one advisor's suggestion to
  merge them into a single transport term. The remedies differ — raise the
  ceiling, or fix the URL — and a field whose whole job is to say why the
  entries are stale should not collapse "your ceiling is too low" into "your
  address is wrong".
- **Each side reads its own library's bases, not a list of leaf classes.**
  `httpx.TimeoutException` / `HTTPStatusError` / `TransportError` in Python;
  in TypeScript the two classes `transports/api` raises, plus an unwrap of
  Node's `cause` chain — because Node reports a refused connection as a
  `TypeError` whose cause carries `ECONNREFUSED`. A new leaf class in either
  library keeps working.
- **`run_absence_search` stamps `dabbler-absence-search/1` in both routers.**
  The field's job is not to name a regex engine but to overwrite what the
  reviewer claimed: a worker can say it searched and report a number, and
  this function re-runs the search and stamps its own answer. Naming an
  engine never did that job. It also ends an instability nobody had noticed —
  the Python value embedded the interpreter's PATCH version, so it moved on a
  `3.11.9` → `3.11.10` upgrade, inside one router, with no engine change.
- **Round 1's Major caught a green control that proved nothing, and it is
  the session's most useful output.** The parity case built to prove the new
  vocabulary pointed at `http://127.0.0.1:1`. Port 1 is on the WHATWG
  bad-port list: Node's `fetch` rejects it with `bad port` **before opening a
  socket**, while httpx dialled it and was refused. So the case compared a
  refused connection against a rejected URL and passed — the TypeScript
  classifier reached `network-error` through its `fetch failed` fallback
  rather than through a real transport failure. **A control that agrees for
  different reasons is worse than no control, because it reads as proof.**
  No test in either router would have caught it.
- **The corpus now allocates the port rather than picking one.** It binds
  port 0, reads back what the OS assigned, releases it and uses that —
  never a bad-port number, and never a port something might be listening on.
  `discovery.test.ts` asserts `ECONNREFUSED` in the failure chain **before**
  asserting the vocabulary term, and a second test pins `fetch`'s bad-port
  refusal from the other side, so the substitution cannot recur unnoticed.
- **The `enumerate` parity case now covers both halves of the field.** One
  vendor keeps a fake key and the closed-port base URL; the other two still
  fail at `no-api-key`. Both routers must write the same word for each, and
  the two records differ only in their timestamps and the digest over them —
  which is what normalization already handles. Still 16 cases over 85 paths.
- **Session 29 was inserted, and it cost a renumber (D188).** The lifecycle
  derives the next session from the completed ones, so it refuses an
  out-of-order number; inserting one meant moving Transport II to 30, the
  cutover to 36, and 38 lines of live guidance across 15 files. The
  append-only log and this file's older sections were deliberately left
  alone — see the note above. **Worth knowing for the next insertion:
  register, declare, *then* renumber** — `declare` refused the first attempt
  because the tree already carried 15 changes, and it was right to.
- **A future enhancement is recorded rather than built**, in
  `docs/operator-decisions.md`: session numbers should become insertable, so
  a session between 28 and 29 costs nothing. Two caveats went with it —
  **store it as a string or scaled integer, never a language float** (neither
  TypeScript nor Python has a native decimal type, and Python already writes
  `29.0` where JavaScript writes `29`, which is why `PythonFloat` exists);
  and **wait until the port leaves one implementation**, because a behaviour
  change made on both sides at once is the one thing parity cannot see.
- **Seat cost: 18,839 in / 6,570 out to gpt-5-6-sol over two rounds
  (D189).** The cheapest session of the port by a factor of two — the running
  total across seven is 537,282 verifier tokens, and the next cheapest is
  session 24 at 61,855. That is not a better process; it is a 200-line diff
  instead of a 2,276-line port, and the round-1 prompt is sized by the diff.
  Round 2 is 55% of round 1, the highest ratio recorded, which also means
  nothing: it is a fraction of a small denominator. In absolute terms round 2
  cost 6,666 tokens, the smallest verification round of the port.
- **One measurement the series has never covered.** The advisory consult
  that precedes a ruling — `gpt-5-6-sol` and `gemini-3-1-pro`, per the
  operator's standing directive — leaves no row in `router-metrics.jsonl`.
  Every seat-cost decision in this port measures verification only, so the
  series is comparable but incomplete.
- **Suite: 944 Python (5:45) / 391 router vitest (51 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared controls
  green.** Python test counts unchanged; vitest gained two.
- **Left deliberately.** Round 2's surviving nit is a time-of-check/
  time-of-use race: between releasing the allocated port and the routers
  connecting, another process could bind it, and both routers would then
  agree about whatever they found. The window is microseconds against an
  ephemeral range, the failure is loud (a 200 where a refusal was expected,
  in a control that diffs bytes), and the alternative is retry machinery in
  a corpus builder.

- **Session 28 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major and three nits; the Major was **disputed
  and withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **Six modules are ported.** `transports/base` (49), `transports/offline`
  (140), `transports/api` (292), `selection` (146), `route` (592) and
  `discovery` (1,057) — 2,276 Python lines becoming **2,879 TypeScript
  across seven files**, plus the `discovery` verb, with **90 vitest tests**
  answering for the 82 Python ones. `transports/copilot.ts` grew by 171
  lines: the seat catalog's READER.
- **`fetch` replaces `httpx`, which makes `route` async (D180)** — and that
  is the whole of the shape difference. Neither a promise nor a child
  process has a blocking form under Node, and a synchronous facade over
  either would stall the only thread there is; `checks.execute` took the
  same shape in session 27 (D174), and these are the last two. **The rate
  limiter's `threading.Lock` survives as a promise chain rather than being
  dropped as a Python artefact**: Node has one thread and the same hazard,
  and two awaited `wait()` calls would otherwise both pass the ceiling.
- **Two branches of `route` are refused BY NAME (D181), not skipped.** The
  `copilot-cli` transport names session 29; the auto-verification tail — a
  live branch, since the bundled config auto-verifies `code-review` — names
  session 31. A silent fallback to the API would put a cross-provider
  verification on the provider the operator was routing away from, and a
  dropped auto-verify would return an unverified result that reads as
  verified. Everything up to those two branches is real: prompt rendering
  and the over-budget refusal, the escalation triggers, the truncation
  heuristic, the exclusion assertion at the call site, the metrics row, and
  the whole API and offline paths. **The seat's half of selection is real
  too**, so session 29 inherits a transport to write rather than a rule to
  restate.
- **The parity control compares a lock-file WRITE, on 16 cases over 85
  paths (D182).** Four `discovery` cases on `fresh`: `status`, `drift`,
  `enumerate --dry-run` and `enumerate`. The specification excluded
  `enumerate` as needing the network — true on a machine with keys, so
  **the corpus takes the keys away**. Every vendor then fails `no-api-key`
  before a socket opens and both routers fold that identical failure into
  the same record, byte for byte including the writer stamp and the digest.
  The scrub is load-bearing on its own: without it every parity run on the
  operator's machine would spend three vendor calls per shape.
  `.dabbler/api-models.lock` joins the compared paths and **names itself as
  the second digest-over-a-timestamp**, as the specification requires.
- **One compared line is wall-clock-derived and no normalization reaches
  it.** Three of the four cases print a record's age as `f"{h:.0f}h old"`
  from each router's own `now`, about a second apart. They disagree only
  when that second straddles a rounding boundary — roughly one run in two
  thousand — and the diff then reads `5713h old` against `5714h old`, which
  re-running settles. Recorded rather than fixed: a third normalization is
  forbidden, and a `--now` flag would be a CLI knob invented for the
  control's convenience.
- **Two debts session 26 left by name are closed (D183).** `session start`
  emits its discovery warnings through the same fail-silent wrapper Python
  uses — a staleness check that could fail a registration would be a
  maintenance signal capable of causing an outage. And the seat lock file
  now has **one parser**: `identity`'s lenient reader collapsed into a
  wrapper over the real `loadCatalog`, which closed a latent divergence
  nobody had noticed — the old reader used the good entries of a malformed
  lock where Python resolves nothing.
- **The ported transport reaches all three vendors live (D184).**
  anthropic 1.3 s, openai 2.0 s, google 0.7 s, in `test/live.test.ts`,
  gated on `DABBLER_E2E=1` and skipped by the default run — an explicit
  opt-in rather than "are there keys here", because a developer with keys
  set must not discover that `npm test` spends money. OpenAI served
  `gpt-5.4-2026-03-05` for `gpt-5.4`, so the served-model notice fired
  against a real body rather than a canned one.
- **The disputed Major was wrong about which module writes what, and the
  rebuttal cost 3,400 tokens.** It read the plan's "`discovery` reads and
  writes `copilot-catalog.lock`" literally; but `ai_router.discovery` never
  writes that file (all four of its seat references are reads), its writer
  is in `transports/copilot.py`, and a refresh is *defined* as an empirical
  probe — so porting it would have pulled session 29's dispatch state
  machine into session 28. A writer without the probe could only mark a
  model `confirmed` with no evidence, which that file's own design forbids.
  The verifier withdrew on the first reading of the cited lines.
- **One nit was a real defect and is fixed with a test.** A Gemini 200 with
  no candidate — what a safety block returns — became the literal string
  `"undefined"` and would have passed every escalation trigger as an
  answer. Python indexes and raises, so the port now raises: an empty
  string would have been just as wrong, converting a blocked response into
  an escalation the record cannot tell from a model that answered with
  nothing. The same coercion in the Anthropic caller was fixed with it. Two
  other nits described Python's behaviour faithfully ported and were
  answered with a docstring rather than a change — `DispatchError`'s claim
  to cover exhausted API retries overstates what *either* router does.
- **A second D173-shaped question is owed a ruling (D185).** A failed
  vendor's recorded `last_error` is the failing library's own class name,
  so the routers write `TimeoutException` and `HttpTimeoutError` into
  `.dabbler/api-models.lock` for the same failure. Every byte difference
  before these two was settled in Python's favour (D165) because each was
  *formatting*; both of these are content. The parity corpus cannot see it
  — with no keys every vendor fails as the shared `no-api-key` constant.
  **Session 35 is the deadline for both**: after it one router remains and
  whichever string it writes becomes the answer by default rather than by
  decision.
- **Seat cost: 60,448 in / 10,443 out to gpt-5-6-sol over two rounds
  (D186).** Round 2 is **18%** of round 1's input, against 26% at session
  26 and 8% at 27. Six ported sessions have now spent 511,873 verifier
  tokens; session 28 is the third cheapest of them while being the second
  largest by Python lines ported.
- **Suite: 944 Python (5:58) / 389 router vitest (47 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared
  controls green.** Python test counts unchanged. `packages/router` is
  ~14,500 lines of source (1,572 generated) and ~5,500 of tests.
- **Left for whoever needs it, deliberately.** Round 2's surviving nit says
  the Gemini reader takes `parts[0]` only — which is exactly what Python
  does, so a multipart response truncates in both routers identically. It
  is Python's behaviour, not the port's. Separately, `pytest.ini` declares
  the `e2e` marker as excluded from the default run but `addopts` carries
  no `-m "not e2e"`; nothing is wrong today because no Python e2e test
  exists, and adding one without that flag would put live vendor calls into
  the run of record.

- **Session 27 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised four Major findings; **three were disputed and all three
  withdrawn**, and the fourth was accepted and fixed by *deleting* the
  function rather than repairing it. Round 2 raised one Major against that
  deletion; **disputed and withdrawn**. Round 3 was clean. Claude Code /
  claude-opus-5[1m] orchestrator. All five gates passed at the first attempt;
  nothing was forced.
- **Four modules are ported.** `evidence` (902), `checks` (1,001),
  `test_evidence` (815) and `affected` (575) — 3,293 Python lines becoming
  **4,159 TypeScript across six files**, plus two verb handlers, with **93
  vitest tests**. `evidence.ts` grew from session 26's 208-line slice to
  1,137; `checks.ts` is 1,306, the largest file in the package.
- **`affected` and `test-evidence` are real verbs, and both entered the
  parity control in the session that ported them** — the first time since 25
  that a session needed no forward dependency and no new fixture. Both
  already had a Python command line and both were already in the `in-flight`
  corpus builder, so the three new cases run against a shape the control was
  already building.
- **Twelve cases, and the control got FASTER: 90.7 s against ~150 s at nine
  (D176).** A new *case* on an existing shape is nearly free — the corpus
  build dominates and the new cases share it. A new *shape* is not, and
  sessions 28 and 32 add three. That is the amendment to D169's warning: the
  thing to watch is shapes, not cases.
- **Both digests are byte-identical across the routers.** The
  `preverify-targeted` case compares the covered-surface fold — sorted
  (path, content-hash) pairs, with the session's own bookkeeping and the run
  ledger left out; the `final-full` case compares the whole-tree fold the run
  of record binds to. `--duration-seconds 42` had to be written `42.0` by
  both, which is `PythonFloat` earning its keep in the first row either
  router appends.
- **Both routers snapshot this repository's live worktree to the same git
  tree id (D177).** `b6d8e262…` from each, over ~2,000 tracked and untracked
  files through a throwaway index. The plan asked for `completion_tree`
  parity; the control cannot compare one until a verb writes a round, which
  is `verify` in session 32 — so this is **evidence, not a control**, taken
  the way session 25 took `verdict`'s (D163).
- **Windows spawning is where Node and Python actually differ, and it is
  measured (D174).** `spawn("x.cmd", …)` is `EINVAL` on Node where Python
  appears to run the batch file directly — it does not: `CreateProcess`
  wraps a batch file in `cmd.exe /c`, so **both routers pay cmd's parsing on
  exactly these programs**. The port hands the shim to `%COMSPEC% /d /s
  /v:off /c` with each argument quoted itself, never `shell: true`, which
  would let a shell re-split a line the module built. An over-long command
  line is `ENAMETOOLONG` (libuv's mapping of Windows error 206, the same one
  Python's Copilot classifier reads), it is **thrown rather than emitted**,
  and `checks.isArgvTooLarge` is the one reader of it for session 29 to
  import. `execute` is async and takes no run id: the heartbeat it wrote is
  a run-core file (D130).
- **`checks.plan` is deliberately NOT ported (D178).** Round 1 found that it
  appends the whole selection to every suite's command where `forSuite`
  exists to prevent exactly that. Its only callers are `runcli.py:400` and
  `runcli.py:814` — measured — and the run core is deleted in session 34, so
  the repair is deletion: fixing it would have put a narrowing rule in the
  TypeScript router that Python lacks, in a function neither router calls.
  `CheckPlan`, `changedPathsFor`, `targetedSuiteCommand`, the four
  `FULL_ALLOWED_*` constants and `selectionUnknownPaths` went with it. This
  is the same cut D129 made for `journal` and `verifyjob`. **The per-suite
  guarantee still exists where it is reachable**, in
  `affected.runnableCommands` and `preverifyGate`, and is tested against a
  two-suite repository.
- **One deliberate record difference, owed a ruling (D173).**
  `run_absence_search` stamps the regex engine that produced the count;
  Python writes `python-re/<version>`, the port writes `node-regexp/<node>`.
  Every other cross-language byte difference was settled in Python's favour
  (D165) because each was a *formatting* choice; this one is content, on the
  one row whose purpose is provenance, and the engines genuinely differ.
  Nothing reaches it today.
- **Three of round 1's four findings described Python's behaviour faithfully
  ported, and two named functions with NO CALLER in either router.**
  `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
  `verify_worker_result` and `record_worker_result` are library surface the
  critique pipeline would drive, and it defaults to `off`. The verifier
  withdrew all three on that basis. What the commits added instead is the
  limit stated in each docstring, so no later reader assumes a guarantee
  that is not there.
- **Where Python states a rule twice, the port states it once (D175).**
  `pythonRepr` was about to have six copies; it now lives in `pythonJson.ts`
  beside `dumps`, `progress.ts` re-exports it and `critique.ts`'s private
  copy is deleted. `normaliseRel`/`matchingPrefixes` are stated once where
  Python carries byte-identical copies in `checks` and `test_evidence`.
  `gates`'s glob matcher is deliberately not shared: it is case-insensitive
  and `checks`'s is not.
- **Seat cost: 82,021 in / 16,256 out to gpt-5-6-sol over three rounds
  (D179).** Round 2 is 26% of round 1's input and round 3 is 8% — **a third
  round spent on a dispute is close to free**, which is the argument for
  writing the rebuttal out rather than remediating on reflex.
- **Suite: 944 Python (7:09) / 299 router vitest (50 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged on the Python side. `packages/router` is ~11,600 lines of source
  (1,572 generated) and ~3,900 of tests.

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

**The port plan is finished. There is no session 37; the next plan is the
operator's to cut.** What follows is what session 36 leaves owed.

1. **The release is one tag push away, and it is the operator's** (D237).
   Both artifacts sit at 2.0.0, both pipelines point at the right registries
   (`release.yml` → npm, `publish-vscode.yml` → the Marketplace), and both
   are gated on a green `Test` run for the tagged commit. Pushing `v2.0.0`
   publishes the router; pushing `vsix-v2.0.0` publishes the extension. Both
   are irreversible — npm will not let a version's files be replaced — and
   the credentials live in GitHub deployment environments rather than on any
   development machine, which is why no session takes this step.

   **Publish the router first.** The extension declares
   `"dabbler-ai-router": "^2.0.0"` and bundles it, so the VSIX does not need
   the registry — but a consumer who reads the manifest and tries to install
   the dependency does.

2. **The Playwright layer is ported and has not been run.** It built its
   fixtures with Python snippets and pinned an interpreter setting that no
   longer exists; it now spawns the extension's own `dist/dabbler.cjs` and
   runs the router's source under Node's type stripping for the two writes
   that must go through a sanctioned writer. It is not a declared suite and
   CI does not run it, so nothing in this session's record says it works.
   **One Layer-3 run on a machine with the VSIX installed is what would
   close this**, and it is worth doing before 2.0.0 is announced rather than
   after: Layer 3 is the only layer that has ever caught a webview layout
   regression.

3. **A first-run walk on a machine that has never had this framework.**
   Session 34 proved the zero-install claim with a scratch repository and a
   terminal; session 36 changed what "installed" means — the extension now
   carries the router, its schemas and its command in `dist/`. The claim is
   checked here as far as it can be (`node
   tools/dabbler-ai-orchestration/dist/dabbler.cjs status` reads this
   repository's ledger and finds its own bundled schemas), but the thing to
   walk is a real VSIX install on a machine with no Node project, no
   `node_modules` and no `.venv`.

4. **The `dabblerSessionSets.pythonPath` setting is gone from the manifest,
   and an operator who set it has a dead value in their settings.json.** VS
   Code does not warn about a setting no extension declares. Nothing breaks;
   it is worth a line in the release notes rather than code.

5. **The evidence protocol's two gaps still have no caller.**
   `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
   `verify_worker_result` and `record_worker_result` are ported and nothing
   calls them. `outputHash` is not re-derived from `rawOutput`, and a
   check's `evidence.pass.requires` contract is not enforced when its result
   is recorded. This passes to whichever session first turns
   `critique.pipeline` to `shadow`.

6. **The silently-replaced record is now cheap to fix, and it is still
   owed.** A malformed or hand-edited `sessions.json` or `activity-log.json`
   is *replaced* rather than refused: `readRawSessionState` answers `null`
   for unparseable JSON and the activity log is rebuilt from any read
   failure. A verifier called it a Major in session 26 and it is a fair call.
   **It is a redesign and it needs an operator ruling** — refuse and fail
   closed, or keep replacing and say so. It has been deferred through ten
   sessions on the grounds that two implementations would both have to
   change. There is one.

7. **`docs/ts-port-parity-control.md` and the run core's two design
   documents are superseded, not deleted.** Each carries a banner saying so.
   They stay because a decision whose reasoning has been deleted cannot be
   re-examined: D231 rests on the parity control's specification, and D130
   on the run-core blueprint.

8. **`BATON.md` at the repository root is stale** — a 2026-08-25 handoff
   that tells its reader work happens on `design/solution-decomposition`.
   `AGENTS.md` says `master` and is what an orchestrator reads first, so
   this is a trip hazard rather than a live contradiction. It was left alone
   deliberately: session 35's lesson is that an out-of-scope tidy-up is how
   a fix becomes a defect, and the cutover is not the session to test it.

9. **Two lessons from this session that generalise past the port.**
   - **A diff of a deletion is cost without information.** Removing the
     reference implementation made the evidence bundle 2.3 MB — four times
     the cap — and 95% of it was removed Python nobody would read.
     `--irreversible-delete` made it 257 KB with every deleted path still
     named. Any session that retires a module was paying this.
   - **An artifact that bundles a package has to let that package find
     itself.** `paths.ts` walks up for a `package.json` naming the router,
     which is correct in a checkout and in `node_modules` and answers
     nothing inside a VSIX. The fix was to make the bundle say what it is,
     not to teach the finder a fourth case.

---

**Session 35's superseded handoff**, kept because D224 is a correction to
it and the correction is only legible beside what it corrects:

### The brief, as session 35 received it

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
