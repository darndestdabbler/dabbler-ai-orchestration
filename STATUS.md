# STATUS — 74 of 75 closed. PAUSED BEFORE PUBLISHING at the operator's word: significant changes come first

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> ## PAUSED BEFORE PUBLISHING, 2026-09-02
>
> The operator: *"Please pause and wrap up this session without publishing"*
> and *"We need to make some significant changes before publishing."* So
> session 74 closed with its work landed and **nothing was tagged**: no
> `vsix-v2.0.0`, no npm version, and the Marketplace still serves 1.0.4.
> Session 75 -- the trial -- is NOT started, because it exists to check a
> published artifact and there is none.
>
> **The publication brief is answered `publish` on the record**, from
> before the change of course. Nothing acts on that answer by itself --
> `dabbler release` has to be run and it is not -- but the next session to
> touch this should either re-raise it against whatever the significant
> changes turn out to be, or record a decision superseding it. An answered
> brief that no longer means what it says is the kind of thing this record
> is supposed to catch.
>
> ## THE DISTRIBUTION CHANGED, 2026-09-02: npm is retired
>
> **The operator's call, made while the npm publish was failing on its third
> first-run defect, and it was the right one: the premise had died and
> nobody had noticed.** npm was never needed. The extension BUNDLES the
> router — `esbuild.js` emits `dist/dabbler.cjs` beside `dist/extension.js`,
> and the terminal shim points at it — so the `dabbler` command that has
> driven every session since the port resolves to the installed VSIX and
> never to a registry. What npm bought was `npm i -g dabbler-ai-router` on a
> machine with no extension, which nothing here does. In v1 the PyPI
> dependency was real, because a Python CLI had no other delivery route; the
> port removed it, and continuing was following a plan whose reason had
> expired.
>
> **And the number is 2.0.0, not 2.8.0.** The Marketplace serves **1.0.4**
> (2026-08-18, twenty installs) and nothing 2.x has ever been published
> anywhere. 2.8.0 would tell a reader that seven minor releases happened
> since 1.0.4; they were bookkeeping between two people. 2.0.0 is greater
> than 1.0.4, which is all the Marketplace requires, and it says the true
> thing: one rewrite.
>
> **Session 74 does it** — `version.json` to 2.0.0 and stamped everywhere,
> `release.yml` deleted, `tagsFor` down to one tag (`vsix-v<version>`), the
> publication brief rewritten without an npm half, `--verify-install` asking
> the Marketplace instead of the registry, and every document that says `npm
> i -g dabbler-ai-router` corrected. csv-model feedback item 5 was never a
> defect in the product: it was a wrong instruction. **Session 75 is then
> the trial**, against what the Marketplace actually serves.
>
> **Nothing is owed on the credential side, and an earlier line here said
> otherwise — it was wrong. The evidence, so this is checkable rather than
> asserted:**
>
> ```
> $ gh api repos/darndestdabbler/dabbler-ai-orchestration/environments/marketplace/secrets
> {"total_count":1,"secrets":[{"name":"VSCE_PAT",
>   "created_at":"2026-05-05T01:19:31Z","updated_at":"2026-05-29T20:21:10Z"}]}
> ```
>
> `gh secret list` reads REPOSITORY secrets and there are none; `VSCE_PAT` is
> bound to the `marketplace` **environment**, which is where
> `publish-vscode.yml` reads it (`environment: marketplace`, then
> `secrets.VSCE_PAT`). Reading an empty repository-level list as "no secrets
> at all" was the mistake, and the corrected claim is checkable by anyone
> with the same command.
>
> **And it demonstrably works**, which is stronger than the secret merely
> existing: `vsix-v1.0.1` through `vsix-v1.0.4` were published by that same
> workflow on 2026-08-17 and 2026-08-18, and the Marketplace serves 1.0.4
> today. A publish job cannot succeed without the credential it authenticates
> with.
>
> The environment also requires a reviewer's approval, so a `vsix-v*` tag
> starts the publish and the operator approves it once. 2.0.0 goes out as a
> **stable** release.
>
> **The npm attempt left nothing behind.** No version was ever published;
> `v2.8.0` is deleted. Three workflow defects were found and fixed on the
> way, each only reachable after the one before it, and they are recorded
> here because the same shapes wait in any first publish: `npm pack` needs
> its `--pack-destination` to exist; `npm publish dist/x.tgz` resolves as a
> package SPEC and tried `git ls-remote ssh://git@github.com/dist/…tgz.git`,
> so the path needs a leading `./`; `--provenance` on an unseen package
> requires an explicit `--access public`. The fourth was not a defect at
> all — OIDC trusted publishing authorises against settings that only exist
> for a package that exists:
>
> ```
> npm error 404 Not Found - PUT https://registry.npmjs.org/dabbler-ai-router
> npm error 404  ... could not be found or you do not have permission
> ```
>
> It was always going to hit that once, and the answer is not to solve it:
> the product does not need the registry it was asking permission from.
> **Session 75 is the trial**: `dabbler release --verify-install` as a step
> check -- asking the Marketplace what it serves -- then acceptance criteria
> 1 and 2 from a clean profile, then item 5 of the audit closes on that
> verification. `docs/field-trial-70.md` holds the expected answers, written
> before the run.

> **Session 73 — the last two CI failures, and the tilde. CLOSED `VERIFIED`
> in one round, 2026-09-02 (`9a96d9c3`).** A `~` was not in `fixloop`'s
> path-token class, so a traceback naming any Windows 8.3 short name
> (`C:\Users\RUNNER~1\...`) implicated nothing and a fix round was handed an
> envelope with the failing file missing — a production defect that only a
> runner could show. `drive.test` asserted the spelling it was handed, as
> `packaging.test` had. And every script that exited by hand now sets
> `process.exitCode`: `check:types` had printed *31 generated module(s) match
> the schemas* and then failed the step on libuv's `UV_HANDLE_CLOSING`
> assertion, which is a control lying about its own result.

> **Session 72 — the rest of the runner's conditions. CLOSED `VERIFIED` in
> one round, 2026-09-02 (`3ac7826e`). CI went from about fifty failures to
> TWO of 1263.** `canonicalPath` now canonicalises the deepest ancestor that
> exists and re-appends the rest, so a not-yet-written file no longer keeps
> the spelling it was handed — session 71's own new test caught that on the
> runner. Every fixture repository declares its own `user.name`,
> `user.email`, `commit.gpgsign` and `core.autocrlf` through one `initRepo`,
> because the framework commits through its own `runGit` and a bare runner
> has no identity to borrow. And `bootstrap` was a THIRD production comparer
> of the same family: it staged its own scaffold with a raw `relative()`, so
> in a repository reached through an alias it committed nothing and reported
> the scaffold already committed.
>
> **`packages/router/scripts/aliased-temp-suite.mjs` reproduces the whole
> runner now** — `TEMP` aliased through a junction, `GIT_CONFIG_GLOBAL` and
> `GIT_CONFIG_SYSTEM` pointed at nothing, and `user.useConfigOnly` set so git
> refuses to guess an identity the way a runner does — and it takes the
> suites to run as arguments. It is why three causes were found in minutes
> instead of eight-minute round trips.
>
> **The two that remain are session 73.** A `~` in a path — every 8.3 short
> name has one — is not in `fixloop`'s path-token character class, so a
> traceback naming such a path implicates nothing: a production defect, not a
> test one, and the fix round's envelope silently loses the file the failure
> points at. And `drive.test` asserts the spelling it was handed, as
> `packaging.test` did. Beside them one flake: `check:types` prints *31
> generated module(s) match the schemas* and then exits 1 on a libuv
> assertion at `process.exit()`.

> **Session 71 — one canonical spelling for every path comparison. CLOSED
> `VERIFIED` in one round, 2026-09-01 (`4eff83c2`). CI IS STILL RED, and
> session 72 is the rest of it.**
>
> **What it fixed, and it was real:** `canonicalPath` and `repoRelativePath`
> now sit beside `repoRootFor` in `journal.ts` — git answers with its own
> spelling, a caller's is whatever they were handed, and Windows spells one
> directory several ways. Every comparison that DECIDES containment asks them
> now: the bookkeeping exclusion (`gates.ts`), the evidence digest
> (`testEvidence.ts`), the step-report filter (`drive.ts`), the plan envelope
> (`approvedPlan.ts`), the verifier's read scope (`agency.ts`, where a wrong
> answer is a security answer) and `solutionDeps`' crosses-out-of-this-
> repository test. Message formatting still uses `relative` and says so. The
> `sessions.json` failures that made twelve runs red are **gone from the
> runner's log**.
>
> **What it did not reach — four things, same family, all in session 72's
> plan.** (1) `canonicalPath` falls back to `resolve` for a path that does
> not exist yet, so it keeps the spelling it was handed and a comparison
> against a canonical root mismatches again — *session 71's own new test
> caught this on the runner*, which is the test doing its job. (2) The suite
> borrows the machine's git identity, and the runner has none, so a fixture's
> `git commit` fails with *please tell me who you are* and the driver's land
> phase stops. (3) `packaging.test` asserts the spelling it was handed. (4) A
> `fixloop` traceback frame carries a short-form path.
>
> **Two controls exist now and both are worth keeping:** a junction alias in
> `gates.test.ts` reproduces the runner's two spellings without a runner, and
> `packages/router/scripts/aliased-temp-suite.mjs` runs the failing suites
> with `TEMP` pointed at an alias — the runner's condition on this machine.
> It spawns vitest through `process.execPath` rather than `npx`, whose
> Windows `.cmd` form `spawnSync` refuses outright.

> **Session 70 — one version, and the trial written down before it runs.
> CLOSED `VERIFIED` in two rounds, 2026-09-01 (`e453bb58`).** Driven from my
> own CLI; zero engine invocations.
>
> **READ THIS FIRST: `Test` is red and has been since session 66 — twelve
> consecutive runs — and both release workflows are gated on a green `Test`
> for the tagged commit, so NOTHING CAN BE PUBLISHED until it passes.** The
> cause is one bug, and the runner's own log carries both halves of the
> evidence: `os.tmpdir()` hands the fixtures the 8.3 short form
> (`C:\Users\RUNNER~1\...`) while `git rev-parse --show-toplevel` answers with
> the long one (`C:/Users/runneradmin/...`). `gates.ts:sessionsRel` computes
> `relative(root, sessionsDir)` from those two unresolved spellings, so
> `setRel` is nonsense, the bookkeeping exclusion never matches, and
> `docs/sessions/sessions.json` counts as the session's own work — every test
> that declares a task list fails with *the working tree already carries 1
> change(s)*. It is green here because this machine's temp path has no short
> form. **Session 71 is that fix**, and `resolvedPath` already exists in
> `gates.ts` to expand it; check every other caller that compares a path
> against git's answer.
>
> **The plan's precondition for the trial was not met and could not be met.**
> Nothing is published: `registry.npmjs.org` has never served
> `dabbler-ai-router`, there is no `v2.*` or `vsix-v2.*` tag, and no
> `publication` brief had been raised. Nor could this session publish:
> `dabbler release` refuses a tree that is not clean and a driven tree is
> dirty until its land phase, **so the session that changes the version can
> never be the session that tags it**. That is `dabbler.yaml`'s own model — a
> session prepares a release, a tag push makes it — and the trial is now
> session 72, after the fix and after the operator answers.
>
> **One version, 2.8.0, stamped from one source.** `version.json` is the
> source; `npm run stamp:version` writes it into both manifests, the
> extension's dependency on the router and the lock file; `npm run
> check:version` fails on a stale one; and `releaseVersion` in `cli/release.ts`
> refuses to tag against a stale manifest, naming the file and the command.
> The first draft was one number in two manifests plus an equality check, and
> the verifier was right to call that a merge nothing stamps: it would come
> apart on the next bump. 2.8.0 rather than 2.7.0 because 65–69 landed after
> 2.7.0 was set and nothing was ever published as 2.7.0.
>
> **`docs/field-trial-70.md` is the trial, written before it is run** —
> criteria 1, 2 and 5 with their expected answers stated first, so the
> acceptance run is a test rather than a demonstration. **Criterion 5 is
> satisfied rather than restated**: all nine `csv-model` feedback items now
> carry a linked test (four written here — the icon geometry, the Solution
> Explorer's welcome, per-subcommand `--help`, and the file the freshness
> gate's remediation names) or, for item 5 alone, a dated deferred issue
> owned by the operator, closing on the recorded verification session 72 runs.
>
> The extension is **2.8.0** and unpublished, as is the router.

> **Session 69 — the round cap, and the Solution Explorer across
> repositories. CLOSED `VERIFIED` in two rounds, 2026-09-01 (`24e4fa5e`).**
> Driven from my own CLI through `dabbler session next`; zero engine
> invocations.
>
> **The round cap is no longer typeable on a driving call.** `session next`
> and `session drive` REFUSE `--max-rounds` — refused rather than ignored,
> because the option parser takes any `--flag value` pair and a silently
> dropped flag is worse than a stated limit. The cap is
> `verification.settings.max_rounds`, and for one run it moves only through
> `dabbler session plan amend --max-rounds N --reason … --approver …`, which
> writes `run.json` and appends the before, the after, **the rounds already
> run**, the reason and the approver to `amendments.jsonl`. **No gate reads
> the approver**, and the comments say so: an engine writes it, and a gate
> that trusted it would make the authorisation forgeable, which is worse than
> absent. What the row buys is that the claim exists and is reviewable —
> unlike session 68's `"max_rounds": 4`, which arrived with no reason at all.
> The driver's at-cap refusal now names the amendment instead of the flag.
>
> **Three location states, not two.** The projection carries `remote` and
> `declaredPath` beside `root`, and one exported rule in the tree model —
> `externalLocation` — decides *here* / *remote* / *unknown*, with the three
> context values following it. A known remote nobody has cloned is a command
> away; only an undetermined one needs a person. A declared path that is not
> there says so rather than claiming nobody said where it lives (round 1's
> nit). The four actions an absent row had none of are now `dabbler deps
> locate | clone | scaffold` — router verbs, because **the extension must
> never author `solution-dependencies.json`**: two writers for one tracked
> declaration drift, and only one of them can be schema-checked. The three
> writing verbs rewrite the projection afterwards, so the row the operator
> acted on stops saying the thing they acted on.
>
> **The upstream direction, without a second declared one (D254).** A
> repository appears in the Explorer because **its own declaration names this
> solution** — one home, owned by the repository the fact is about. So the
> projection gained `members`, both directions derived (`provides` off this
> repository's edges, `consumes` off that member's), and `usedBy` is
> untouched.
>
> **A work plan may name the repositories it needs.** Round 1's blocking
> finding was right: scaffolding only through a typed command still left the
> operator to remember the next repository. `driver-work-plan.schema.json`
> gained an optional `repositories: [{id, path?}]`, and `phasePlan` places
> each one when the plan is accepted — through `placeMember`, the single rule
> `deps scaffold` calls too. A shell is a directory, a `git init` and a
> membership declaration; no edge, no `produces`, no version. An existing
> declaration is left exactly as it stands, and a plan naming repositories in
> a repository with no `solution-dependencies.json` stops with that sentence.
>
> Two papercuts fixed on the way: `dabbler deps` resolved its repository root
> from `docs/sessions`, so it answered "not inside a git repository" in any
> repository that had never run a session — including one it had just
> scaffolded; it now falls back to the working directory.
>
> The extension is still **2.7.0** and predates 65 through 69.

> **Session 68 — the logic-tree harvest. CLOSED `VERIFIED` in five rounds,
> 2026-09-01 (`ce31a28d`).** Two of those five rounds were authorised by the
> operator past the cap of three; **D253** records why. Driven from my own CLI;
> zero engine invocations.
>
> **The reconciliation came first, and paid for itself.** All eighteen findings
> were read against the source before any was acted on
> (`docs/logic-harvest-68.md`): sixteen reproduce, and three claims do not —
> F3's "the budget stop's count increments so two never compare equal" (`invoke`
> refuses *before* spending an invocation, so they do compare equal, and a test
> now pins it), F14's "silent" (it is the loudest thing the framework says), and
> F15's "no Send channel either" (session 63 built one). Both reviewers assert
> things this codebase does not do; **take `gpt-5-6-sol`'s structural claims
> seriously and check `gemini-3-1-pro`'s scenarios before quoting them.**
>
> **What landed in the machine.** Verification's terminal states have an edge
> out: `noRoundReason` is stated once in `verify/rounds.ts` and asked by both
> its own refusals and `phaseVerify`, so a terminal row or a clean at-cap round
> **over an unmoved tree** advances to the run of record instead of stopping a
> correct session forever — and a *moved* tree stops with what to do, because a
> repair after the last reviewed round is unreviewed work. The UNRESOLVED cap
> has its own exit code (`EXIT_UNRESOLVED`), so the dispositions→fix→preverify
> →verify cycle cannot run on a finding that cites no path, and the consumed
> disposition set is cleared once its fix step is issued. Releasability has one
> owner: `phasePublish` reads the DECLARATION, and
> `published_when_releasable` demands an outcome of `published` and joins
> `EVIDENCE_GATES` so `--force` cannot skip it. The packaging outcome tokens
> moved to `ledger.ts` so the gate can ask without a cycle.
>
> **`dabbler session rebaseline`** gives *halted, being repaired* its edge:
> valid only while the run carries a stop, it records the absorbed paths and the
> reason to `repairs.jsonl`, moves `baseline_tree`, and raises an
> `accountability-signoff` decision. The driver's own files-changed refusal now
> names it. **The watcher gained its second rule** — `job-outstanding`, a job
> past the threshold whose log has stopped growing — because the rule shipped in
> 67 is quiet whenever a job runs and was blind in exactly the window a wedged
> round occupies.
>
> **THE LIFECYCLE MODEL WAS NOT ADOPTED, AND IS NOT IN THE TREE IN ANY FORM.**
> The plan made it binary — held to the code, or deleted — and holding it means
> every real transition declared *and* every declared transition observed. The
> suite drives 21 of 38 phase edges; six of the other 17 are self-loops a phase
> line cannot show at all. Three attempts to land less were refused by the
> verifier, each correctly: an `exercised` flag (an exemption), deleting the
> unexercised transitions (equality bought by narrowing the machine), and
> keeping the whole thing as a Markdown table under a "snapshot, not a source"
> disclaimer (a disclaimer is not a control; the rule is about the model, not
> the file extension). **Adopting it is a session**: instrument `setPhase` and
> the `Stop` constructor so self-loops are observable, then write the 17 tests.
> `docs/logic-harvest-68.md` names the price; the harvest's own copy stays in
> `C:\temp\dabbler-logic-harvest\`, outside the repository.
>
> **Twelve findings carried**, each with where it belongs: F1's entry question,
> F6 (the close is terminal before its own bookkeeping; push mode cannot
> recover), F7's job ceiling, F9 (`runRoundCap` exists and is unused), F10, F11,
> F12, F13, F14, F16, F17, F18. F6, F17 and part of F18 are one machine — the
> session-status one — and should land together.
>
> The extension is still **2.7.0** and predates 65 through 68.

> **Session 67 — the watcher, and the driver's blind spots. CLOSED
> `VERIFIED` in one round, 2026-09-01 (`de953825`).** Driven end to end from
> my own CLI through `dabbler session next`; zero engine invocations, which
> is what the pull is for.
>
> **`WORKERS_LOCAL` is 2.** The operator's call after a four-worker run of
> record made the host unusable and had to be killed. Measured on the
> twenty-core host: 20 workers 94 s wall / 873 s test time, 4 → 106 s /
> 352 s, 2 → 138 s / 262 s. A third more wall clock is what a machine you
> can still type on costs. `WORKERS_CI` stays 1.
>
> **`lastActivityAt` reads the driver's directory.** It read the ledger, the
> activity log and the verification rounds and never `driver/run.json`,
> `instruction.json` or `report.json` — so mid-session 66, two hours in with
> eight steps accepted, it answered with the registration and
> `possiblyStalled` was true through the whole productive stretch. It now
> reads all three through the driver's own readers.
>
> **The watcher line.** The rule that separates the two silences — *an
> instruction issued, no answer written since it was issued, no tree change
> since, past the threshold* — is stated ONCE, in `driver.ts`:
> `watcherReading` (pure), `readWatcher` (the reader) and `treeTouchedAt`
> (a `git status --porcelain` probe that skips `.dabbler/`), exported from
> `index.ts` alongside `stalledAfterSeconds`. The Dabbler terminal renders
> it as `watcher since=Ns state=instruction-outstanding` in `warn` — a new
> `lineTone` case, no new machinery — asking the rule at most twice per
> threshold so the probe is never a git call per 500 ms poll. The headless
> case rides the interrupt poll `invoke` already runs, on the driver's own
> log channel; no companion process was needed. **The answer side is the
> answer FILES, not the run record**: `issue()` writes the instruction and
> saves `run.json` a millisecond later, so a rule comparing `updated_at` to
> `issued_at` reads "answered" for every outstanding instruction there has
> ever been. The headless test is what caught it.
>
> **The driver reads `verify`'s reason.** `phaseVerify` re-reads the refusal
> from the job log (`jobLogTail`, on the deterministic path a job name
> gives). A stale pre-verification precondition now heals — `setPhase
> ("preverify")`, which is exactly the run that makes it true again —
> bounded at two by `preverify_heals` on `run.json`, and the stop it
> eventually raises carries verify's own words instead of the one sentence
> every refusal used to arrive in. That sentence is why the deadlock
> classifier called a red control and stale evidence the same impasse.
>
> **`session plan amend` is the ordinary move.** Two steps needed a file the
> plan had not declared; the engine signs its own amendment and the
> before/after lands in `amendments.jsonl`. Cheaper and more honest than
> working around the envelope.
>
> The extension is still **2.7.0** and predates 65, 66 and 67.

> **Recorded, 2026-09-01, after sessions 65 and 66 — the csv-model
> papercuts, the publish gap, and CI's first green run in weeks.** Both
> closed `VERIFIED` in two rounds each. **The plan now runs to 70 and the
> renumbering is landed**, as a doc-only commit between sessions on the
> operator's call, 2026-09-01: 67 is the watcher and the driver's blind
> spots, 68 is the logic-tree harvest and the control that holds it to the
> code, 69 is the Solution Explorer going multi-repository, and the
> publication trial is 70. **Register 67 with `--total-sessions 70`.**
>
> Landing it here rather than inside session 67 was deliberate, and it
> avoids repeating a defect the ledger already carries: `healTitle` protects
> the stored title of any session that has run, so a planning session that
> renumbers its own plan registers under the *outgoing* title and keeps it
> forever. That is why the ledger's row for session 65 reads "The half of
> the trial that needs a published router" when 65 was the papercuts — it
> registered before its own amendment landed. Session 67 will now register
> under the title the plan already declares. The 65 row is wrong on the
> record and is not hand-editable — `owed` has no `raise` verb, only `list`
> and `answer`, so nothing outside a session can file it. **Session 68
> records it as a decision**: whether a title frozen at registration should
> follow a plan the same session renumbered, or whether the record is right
> to keep what it stored and only the projection should say so.
>
> **Session 65 — the papercuts the csv-model trial found.** `windowsHide` on
> the two spawn paths in `checks.ts` (the console windows that stole the
> operator's cursor); the Dabbler terminal's band re-opened per physical
> line, so a stop carrying git's multi-line stderr no longer staircases; the
> teal band replaced by a neutral gray with per-event tones, and the verdict
> and test outcome read from `rounds.jsonl` and `test-runs.jsonl` rather
> than scraped from job bytes; `dabbler.terminalLocation` (default
> `editor`); `Dabbler: Show Framework Terminal`, with a closed terminal
> forgotten so it can be rebuilt; the land stop that said `fatal:` when a
> repository simply has no remote; `affected` no longer claiming no suite is
> declared when one is merely not `expensive`; the heredoc rule added to
> `SHARED_BODY` so bootstrapped projects get it; the `api-models.lock`
> warning given an owner (bootstrap says it once; `session start` never
> calls a vendor); and `start()` refusing to re-register an in-flight
> session under a contradicting identity — while an OMITTED field now
> carries the record forward instead of being erased, which is the bug the
> verifier caught in my own test.
>
> **Session 66 — the publish gap, CI, and the spinner.** CI had been red
> since before session 63 and the reason was not what it said: the
> repository declared no line endings, every text file is stored LF, and
> `core.autocrlf` is true on `windows-latest`, so a fresh clone wrote CRLF
> and all 31 generated modules compared unequal. `check:types` is the FIRST
> step of that job, so typecheck, lint, the 1218-test router suite and the
> bundles had not run at all in that time. One `.gitattributes` line fixes
> it; reproduced in a scratch clone before planning, and nothing was hiding
> behind it. `staleFiles` also now compares lines rather than the bytes
> between them, so the control can never again blame the schemas for a
> checkout setting. Then: a `publish` phase between `land` and `close` for a
> releasable session (it cannot go earlier — `packageSession` asks the close
> gates, and `working_tree_clean` and `pushed_to_remote` are false before
> the land); the `published_when_releasable` close gate, which packaging
> OMITS from its own preconditions because asking it of packaging by
> packaging refuses the first publication for not having happened;
> `secret` made optional for a feed that is a path on disk, failing safe on
> anything it cannot identify as local; the managed body's publishing claim
> made true and scoped to releasable sessions; `windowsHide` on the last
> four `spawnSync` sites via one `hiddenSpawn` in `journal.ts` (the only
> module low enough to hold it without a cycle); and the spinner — drawn
> only at column 0, so it can never sit on a runner's partial line and erase
> it, which is what the verifier caught.
>
> **Not yet active on the operator's machine.** `dist/` is gitignored, so a
> session always runs under the PREVIOUS build — session 66's own close ran
> six gates, not seven, and that is correct. The router was rebuilt after
> the close and now carries everything. **The extension is still 2.7.0 and
> predates both sessions**: the spinner, the tones, `terminalLocation` and
> Show Framework Terminal are inert until it is repackaged, installed with
> `--force` (same-version republish leaves seats stale) and the window
> reloaded.
>
> **Four framework defects found by walking into them; (1)–(3) are session
> 67 and (4) is session 68.**
> (1) `lastActivityAt` never reads the driver's run record, so
> `possiblyStalled` was `true` through two hours of productive work and
> would have looked identical during the forty minutes the engine actually
> was stopped — it cannot discriminate at all. (2) The driver stops in
> `verify` and re-runs it forever when `verify` reports the preverify
> evidence stale, instead of re-entering `preverify` as `phaseRunOfRecord`
> already does; this cost a full 24-file cycle and made the operator paste a
> command by hand. (3) The deadlock classifier compares the driver's own
> wrapper text, so two unrelated refusals were called a deadlock. (4)
> Repairs made during a stop belong to no step, so a report omits them and
> is refused — there is a real state (halted, being repaired) with no
> reporting edge out of it. (2) and (3) are one fix: the driver reading
> `verify`'s reason rather than only its exit code. (4) is session 68's
> rather than 67's because it is the harvest's own question 7 — a repair in
> a state with no edge to record it — and designing that edge twice is
> worse than designing it once with the critique in hand.
>
> **Test load is a live operator concern.** A 4-worker run of record made
> the host unusable mid-session and had to be killed; the run was redone at
> one worker via `CI=1` in the environment, which reaches vitest through the
> job runner and changes no tracked file. Session 67 lowers `WORKERS_LOCAL`
> to 2. Session 66 ran ~6 full-ish suites, only ONE of which was the run of
> record — the other five were preverify cycles forced by stops, which is
> why defect (2) is the bigger lever. Separately, the machine showed 4.35 GB
> of compressed memory and a live `TiWorker` (Windows Update) during the
> stall; the operator wants diagnostics later, and the tests may have been
> the straw rather than the load.
>
> **Open proposals, not scheduled.** (a) The run of record moves to CI, with
> a `run_of_record_green` close gate reading the CI conclusion — master
> receives the commit as usual, but the ledger never says `VERIFIED` until
> CI confirms. (b) The operator's extension of it: push a scratch branch for
> preverify too and observe the result, which defeats the "preverify gates
> verification, which precedes the push" objection. Both need CI's trigger
> widened beyond `master`, both are per-repository escape hatches rather
> than defaults, and `--shard` is what makes CI faster than local rather
> than slower. The write-up, with the accounting, is now in
> `docs/sessions/session-plan.md` under "Candidate: the run of record moves
> to CI", after session 70 — it was in a scratch directory and would have
> gone with it.
>
> **Running in parallel, outside this repository.** A logic-tree harvest:
> serialize the framework's decision machine and have `gpt-5-6-sol` and
> `gemini-3-1-pro` critique it for gaps proactively. Plan and the watcher
> specification are in `C:\temp\dabbler-logic-harvest\`, driven by a second
> engine beside this repository and read-only against it. **Session 68 is
> what receives it**, and that session — not the harvest — decides whether
> the model is adopted, and writes the control that holds it to the code if
> it is. It targets the state-machine gaps, not implementation slips — say
> so to anyone who expects it to replace preverify or the verifier.

> **Recorded, 2026-09-01, after session 64 — the deck exists.** Closed
> `VERIFIED` in two rounds. `docs/onboarding/dabbler-onboarding.pptx`,
> generated by `build-deck.mjs` (pptxgenjs), screenshots captured from
> the running 2.7.0 extension by `capture-screens.mjs` and — for the
> driving and stopping slides — `capture-walk.mjs`, which ran a real
> driven session on a scratch repository (`C:/temp/s64-walk`, absolute
> paths, the D251 rule held) and photographed the two terminals, the
> moving rows, the interrupt toast and the attention row live.
> `walk-notes.md` records what a person had to type in a fresh window —
> the folder-trust prompt and the CLI's first approval ask — and three
> observed quirks, noted as evidence for whichever session fixes them,
> none a stop. **The operator's open question is answered AS DESIGNED:**
> the four CSV repositories are declared rather than built, the Solution
> Explorer screenshot is real over the declared solution, and no slide
> is a mockup of a screen that does not exist. `verify-deck.mjs` is the
> session's one test — it opens the built deck, holds it to the build
> script's slide manifest, checks every screenshot is embedded, and
> enforces the two readability rules (every command copy-pasteable, no
> naked decision IDs) over extracted slide text. Round 1's Major (the
> central screenshot was staged by a separate automation rather than the
> documented Start path) was fixed and re-verified; four nits stand on
> the record. **The session-62 at-cap repair is now reviewed and
> confirmed**: three Starts in one window, each new CLI split beside the
> one Dabbler terminal, earlier CLIs standing alone — `walk-notes.md`
> carries the observed terminal table. The `REMEDIATED_AT_CAP` on 62's
> row keeps its honest verdict; the review it lacked is on this record.
>
> **65 is amended with the operator's one-version directive** (recorded
> 2026-08-31, after an install showed router 2.0.0 beside extension
> 2.7.0): the router stops carrying its own number and takes the
> extension's — one version, stamped from one source, read by
> `dabbler --version`, the ledger's `frameworkVersion` and both release
> tags; the release order (router before the extension) is unchanged,
> only the numbers merge. 65 remains the operator's to trigger: it runs
> when the decision to publish is taken, and not before.

> **Recorded, 2026-08-31, after session 63 — the escape route is built.**
> Closed `VERIFIED` in two rounds. What landed, from the session's own
> close-out: stops are **classified** — a stop on the same step with the
> same reasons twice running says `deadlock`, and a judge-produced reason
> cites its rule by name; the guide's "When the framework stops" section
> carries the **diagnosis protocol** (read the framework's account first;
> verify the claim against code; fix framework source in the tree on THIS
> repository — the 60/62 precedent — and report `blocked` with an owed
> item on a consumer repository, where dabbler is an installed package;
> never touch the records) with three pointer lines in the managed body,
> re-bootstrapped here; **`dabbler triage`** assembles a stop's artifacts
> and asks a provider that is not the working engine for a
> schema-validated classification with a minimal amendment; the
> **unattended ladder** runs second provider → third provider → an owed
> decision carrying the raw artifacts, no rung loops, every rung
> terminates at the human, and a gate-relaxing amendment is only ever a
> recorded human choice; **`session interrupt` queues against a stopped
> run** and the resume drains it as `sent: <text>`; **`session plan
> amend`** is the affordance 62 lacked, reason and approver on the
> record; and the **readers of driver records accept unknown properties**
> while writers stay strict — "Execution record unreadable" is reserved
> for damage, and the installed-extension schema skew class is dead.
> Round 1 raised two Majors, both telling: adviser routing failures
> **bypassed the ladder's human floor**, and triage amendments were
> discarded — the owed "Amend step" choice wasn't wired to `plan amend`;
> both fixed and re-verified in round 2 (two nits stand on the record:
> `stopArtifacts()` trims what "raw artifacts" promises, and the generated
> amendment command isn't directly executable as printed). Extension
> **2.7.0**, installed; unpublished like the rest. The deck (64) and the
> trial (65) stand as re-cut — the deck's walk still owes the review of
> 62's at-cap terminal repair.

> **Recorded, 2026-08-31, after session 62 — the entry is built, and the
> plan gains the escape route.** Session 62 closed **`REMEDIATED_AT_CAP`**
> at four rounds: round 1 (full) two Majors and two nits, rounds 2 and 3
> fix-delta each finding a terminal-placement Major, and the round-3
> repair — a cached split Dabbler terminal is now moved beside the CLI a
> later Start creates — landed at the cap **unreviewed**. The deck's walk
> (64) exercises exactly that workflow (several Starts in one window) and
> doubles as the review. What landed: the managed body says one thing —
> call `dabbler session next` and do what it says until `done` — and this
> repository's `AGENTS.md` is re-cut from it; **Start opens the person's
> own CLI** in a terminal at the root (opening sentence in argv where the
> CLI takes one), *Start Unattended Session* keeps headless `drive`, and
> Stop/Send survive only for extension-launched drives; the **Dabbler
> pseudoterminal** shows the framework's work and nothing else — phase
> lines, job logs byte-for-byte (the runners' colours and ✓ arrive whole),
> working/waiting indicator, the band, theme-aware — and carries **no
> engine chat, ever**; a **framework stop or owed decision is loud**: the
> attention row with the brief in its tooltip, the toast with the
> recommended option, the badge, the QuickPick whose items carry each
> option's consequence, answered through `owed answer` in-process; engine
> renders **strip CSI/OSC** so the colour bleed is dead code from the next
> build. Extension **2.6.0**, walked on a scratch repository from the
> installed build. Mid-session history worth keeping: the judge deadlock
> (step-files must-include vs the unchanged rule made `managed-body`
> unanswerable; fixed by the operator's direct order, outside the session,
> riding in its verified diff — and `session interrupt` proved to be
> refused against a stopped run, so there was no way to coach the resume),
> and a poll-timer leak in the new pseudoterminal that held the test
> process open, caught by the hanging suite and fixed with `unref` +
> `clearInterval` in the same remediation.
>
> **The re-cut: session 63 is the escape route; the deck is 64 and the
> trial 65.** Designed with the operator across the day's three stops:
> stops classified (`deadlock` = same step, same reasons, twice running;
> rules cited by name); the attended path as a diagnosis protocol in the
> guide with three pointer lines in the managed body (fix framework
> source in the tree on THIS repo — 60/62 precedent; `blocked` + an owed
> item on a consumer repo, where dabbler is an installed package); one
> `dabbler triage` verb both modes call (cross-provider, schema-validated
> classification with a minimal amendment); the unattended ladder with a
> floor (second provider, third provider, then an owed decision with the
> raw artifacts — no rung loops, every path ends at a human, and the
> framework never relaxes a gate on its own authority); a Send that
> queues against a stopped run; `plan amend` with reason and approver on
> the record; and the reader-tolerance fix for the installed-extension
> schema skew. The ledger heals at the next `session start`, as before.

> **Recorded, 2026-08-31, after session 61.** Session 61 — the pull —
> closed `VERIFIED` in three rounds, driven by `session drive` with Opus.
> What landed: **`dabbler session next`** advances the session one move
> per call and prints the instruction JSON as the only thing on stdout
> (`divertOut` sends every inner verb's chatter to stderr, so a parser
> reads clean JSON and a person still sees it all); `drive` and `next`
> are **one loop with the seam at `converse`** — push invokes the engine
> there, pull returns the outstanding instruction — same `advance`, same
> `judge`, same phases. The framework's long work (a verify round, the
> complete suite, the close) runs as a **detached job** (`jobs.ts`): the
> runner writes its exit to a status file by write-then-rename, the pid
> answers only "is anything still running", and a job with no process and
> no status is a **stop**, not a silent re-run — a machine that restarts
> mid-round does not spend a second round unrecorded. `next` answers a
> running job with `kind: wait` and `retry_after_seconds` — a tool call,
> not a sleep. **Resuming by recency is gone**: Claude Code takes
> `--resume <session_id>` from the first invocation's `init` event, Codex
> `exec resume <thread>` from `thread.started`, and the Copilot seat —
> which reports no conversation id at all — now runs **every invocation
> as a fresh conversation** carrying the instruction file's context and
> no other: a re-read is a price, the wrong conversation is a wrong
> answer. **D252**: `drive` stays as the unattended half (CI, overnight,
> the extension's Start today); retiring it would have deleted a measured
> capability and left Start with nothing to call. The guide is re-cut
> pull-first, `drive` one section at the end. Round 1 raised three
> Majors, all remediated (Copilot still resumed by recency; `next` lost
> `--max-rounds`/`--transport` between calls; a `rejected-thrice` stop
> re-judged the same answer and stopped again); rounds 2 and 3 were
> fix-delta `VERIFIED` with two nits on the record. No extension change;
> still 2.5.0.
>
> **Owed to 62, from the operator watching 61 run:** colour bleeds in a
> real terminal — a green ✓ (or red text) at a line's end stays on for
> the lines after. Diagnosed: the engine's tool results carry the test
> runners' ANSI, and `clip` in `engines.ts` truncates at a character
> count, which can cut a colour's reset off while keeping its opener;
> `clip` also collapses whitespace but strips no escapes. The renderers
> must strip CSI/OSC from engine-derived text before speaking it — in the
> terminal it bleeds, and in the "Dabbler: Engine" channel a raw escape
> would land inside the grammar's scopes as garbage. The Dabbler
> terminal's job-log passthrough (62, step 4) stays raw on purpose: there
> the runners' colours arrive whole, resets included. Also owed: the
> Start split — Start opens the person's CLI (the staff-facing default),
> a separate command keeps launching headless `drive`, and Stop/Send
> survive only for that. 62 is the extension session; it is on the plan.

> **Recorded, 2026-08-31, after session 60 — the first session this
> repository drove itself, and the plan re-cut for the pull.** Session 60
> closed `VERIFIED` in three rounds, driven end to end by `dabbler session
> drive` with Opus on Claude Code: plan accepted, four steps, eight
> invocations, verification with dispositions, run of record, commit,
> push, close. It stopped once — the engine reported step `prefix`
> `blocked` after finding a real bug in `spawnProgram`'s `.cmd` branch
> (`cmd /s` strips the first and last quote of the line, so a shim under
> `C:\Program Files` became `'C:\Program' is not recognized`; 58's shim
> test had no space in its path) — fixed it in `checks.ts` with a
> falsifying test, and said truthfully that the running bundle could not
> load the fix. The resume was one command from a terminal on the rebuilt
> `dist`, since Start and the PATH shim both run the installed bundle.
> Round 1 raised three findings (the driver loading configuration from
> the invoking repository rather than the driven one; the grammar missing
> the error scope on a blocking verdict; the guide's provenance claim),
> round 2 one Major and the nit, round 3 the nit only; the guide step was
> amended on the record in round 2 (not every example could come from the
> fresh walk, and the guide now says which walk each came from). What
> landed: `drive` → `dabbler` on every line the driver speaks; the
> "Dabbler: Engine" channel under a `dabbler-drive` language with a
> TextMate grammar on standard scopes; `docs/driving-a-session.md`
> re-cut; extension **2.5.0**, unpublished. The driven close writes
> `project-work-plan.md` and the change-log, not this file — this block
> is the operator-side record.
>
> **Two findings from the run, both on the plan now.** (1) `claude -p
> --continue` resumes the most recent conversation in the directory: after
> the resume, the driver's invocations 4–8 ran on top of an unrelated
> interactive Claude Code session that was newer (`engine-01..03.log`
> carry session `7a3a4490…`, `engine-04..08.log` another) and appended
> their turns to it. Any interactive session in the same directory
> hijacks a driven run; the fix is `--resume <id>` from the first `init`
> event (Codex: the thread id, never `resume --last`). (2) The colour, ✓
> and spinner the operator liked in the terminal were vitest and mocha on
> a real TTY through `test-evidence run`'s `stdio: "inherit"` — the router
> styles nothing. An Output channel can never show that; a terminal
> always will.
>
> **The direction: the engine stays in the person's own CLI.** The
> operator's adoption call: the staff trust the Copilot CLI and Claude
> Code as they are, rejected an earlier extension for doing too much, and
> would read a driven session that replaces their CLI with an Output
> channel as a home-made CLI worse than Copilot's. So the framework goes
> to the background as a **pull** — no driver process; `dabbler session
> next` advances the state machine on disk each call and returns the next
> instruction, long work backgrounded with `kind: wait` — and the engine
> is the person's interactive session, with its own spinner, chat, ask-user
> and Esc. It is not the spike's *await*: nothing waits and nothing can be
> orphaned. **Sessions 61 and 62 are that work** (61 the verb, the
> background jobs, `drive` over `next` or retired, resume-by-id if kept,
> the guide; 62 the entry — the managed body reduced to one sentence,
> Start opens the CLI in a terminal, a *Dabbler* pseudoterminal for the
> framework's work with the runners' output passing through, loud stops
> as attention rows, toasts, the badge, answered from a QuickPick);
> **the deck is 63 and the publication trial 64.** The ledger was not
> hand-edited: 61 and 62 were historyless rows, the projection heals
> titles on read, and the next `session start` grows the ledger to 64.
> Start on 61 from the installed 2.5.0, or the terminal command in
> `docs/driving-a-session.md`, is how it begins — and 61 changes the
> driver, so expect the same rebuild-and-resume from `dist` if it stops.

> **Recorded, 2026-08-31, after session 59: the plan is re-cut once more.**
> Watching the first driven sessions in "Dabbler: Engine" showed one
> block of default-coloured text, the driver's lines and the engine's
> told apart only by the `│`. Three surfaces were weighed — a
> LogOutputChannel (level colours and a filter; a doubled clock, no
> palette), a language and TextMate grammar on the existing channel
> (every line class coloured through the theme's own scopes; no
> background, no router change), and a Pseudoterminal (full ANSI, a
> background band on the engine block, a typed Send) — and the operator
> chose the grammar now, with the band (#165044 dark / #87decd light, on
> the engine block only) deferred until a few drives have been watched
> under it. The prefix `drive` becomes `dabbler`: the operator weighed
> `📢` and `ⓓ` and took the word — typeable, greppable, one width in
> every font, and a dimmed word costs nothing once the grammar lands.
> **Session 60 is that work**, inserted after 59; **the deck is 61 and
> the publication trial 62.** The ledger was not hand-edited: 60 and 61
> are historyless rows, so the next `session start` re-titles them from
> the plan's headings and grows the ledger to 62 (`buildSessionsArray`
> in `writers.ts`, `healTitle` in `progress.ts`), and the projection
> heals titles on read, so `dabbler status` and the Work Explorer already
> show the new names on 60, 61 and 62. **The deck (61)
> knows:** its screenshots of the channel are taken after 60 lands,
> never from 59's plain block; its example lines carry the `dabbler`
> prefix; and it gets a slide between 6 and 7 for driving a session.
> **Owed to 60:** the walk the verifier keeps asking for — Start pressed
> from the installed extension — is 60's as much as 61's, and
> `docs/driving-a-session.md`'s line-kind list should say `engine:`
> (what `engines.ts` prints for the engine's words), not `text`.

> **Recorded, 2026-08-31, after session 59.** Session 59 — the last of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised two
> Majors: one was fair and is built (a Send made while no invocation was
> running was discarded at the next boundary while the extension said
> "Sent" — the driver now **defers** it and the next instruction carries
> it first among its `reasons` as `sent: <text>`, including the race
> where the poll takes a request as the engine exits on its own; a Stop
> halts wherever it is next seen); the other ("child process despite the
> in-process requirement") was **disputed with line-cited evidence and
> withdrawn** in round 2, because D251 had recorded the amendment and its
> three reasons before the round. Its deliverable is **D251**: **Start is
> the launch.** The Work Explorer's Start Session picks the engine (and
> the model: optional for Claude Code and Codex, required for a Copilot
> seat and refused by name before anything spawns) and runs `dabbler
> session drive` — as a **child process of the extension host** on the
> editor's own Node, the same bundled `dabbler.cjs` the terminal shim
> runs, through the router's own `spawnProgram`/`terminateTree` (now
> exported for exactly this caller). The plan's word "in-process" was
> **amended with evidence**: `standIn` holds one root and throws for a
> second caller, the in-process router serialises verbs, and `capture`
> buffers a verb's output until it returns — a drive is one verb that
> lasts the session, and in-process it would have queued Stop behind
> itself and shown its output at the end. Everything the driver prints
> lands live in the **"Dabbler: Engine"** output channel; the task rows
> move by themselves; the status bar shows **Stop** and **Send to
> engine** while a drive runs (also on the palette under
> `dabbler.driving`). **Stop needed `--stop`**: a plain interrupt
> re-invokes the engine, so `session interrupt --stop` is new — the driver
> ends the invocation and halts with `interrupted` on `run.json` (a ninth
> stop kind, with the person's reason); the session stays in flight and
> the same Start resumes; a stop that arrives between invocations is
> honoured at the next boundary. **Send** is the plain interrupt. The
> copy-prompt commands (Start the next session, Run Prompt, Send Back,
> Respecify, the left-click clipboard half, the Copy Prompt submenu) are
> **gone**: the framework sends, nobody pastes.
> **`docs/driving-a-session.md`** is the developer's guide, linked from
> README and quick-start, its examples copied from a real walk.
> **Walked live** with Haiku on Claude Code on a scratch repository
> through the exact command line the extension launches: two plan
> refusals (Haiku *printed* the answer command instead of running it —
> `enginePrompt` now says "RUN the shell command … printing it is not
> [the answer]", and a third walk had the plan accepted on the first
> invocation), a stale-seq refusal from the report verb that Haiku fixed
> itself, a Send mid-step honoured (one-line `greet`, no JSDoc, as told),
> `check-passed`, `report-accepted`, then Stop landing as `interrupted`
> with the Work row reading `Driver stopped (interrupted): …`. The press
> of the button itself is the operator's (the verifier's standing nit):
> extension **2.4.0** is built and installed here, unpublished like
> 2.0.0–2.3.0. Six extension tests, two router tests; **1181 router
> tests**, 148 extension tests.
>
> **An incident, on the record (D251).** A `git checkout -- .` and `rm -rf
> .dabbler …` meant for the scratch repository ran in this repository
> (the chain began with `cd` here): every uncommitted edit was reverted
> and **this machine's untracked `.dabbler/` — the round records, test-run
> rows and driver ledgers of sessions 22–58 — was deleted and is not in
> git.** Tracked state and history were restored from HEAD, the session
> was re-registered and re-declared on a clean tree with the same task
> file, and every edit was redone from the session's own record; nothing
> under the tracked tree was lost. A second, smaller misfire launched a
> `session drive` in this repository (one read-only plan invocation,
> stopped; `.dabbler/runs/s59/driver/run.json` says so). The rule is now
> in memory and in D251: destructive commands for a scratch checkout run
> in their own command with absolute paths, never after a `cd` here, and
> every walk verb carries `--sessions-dir`. **The operator should know**
> that the Work Explorer's verification detail for sessions 22–58 on this
> machine is gone (the work computer's ledger is separate; the round refs
> pushed under `refs/dabbler/rounds/` by each close survive on the
> remote); the closes that consumed that evidence are unaffected.
>
> **Owed to 64, the deck (60, 61, then 63, across the re-cuts above).**
> The deck shows the driven lifecycle as 61–63 reshape it; its walk's
> several Starts in one window review 62's at-cap terminal repair; and
> pressing Start on the next session from the installed extension is the
> walk the verifier still wants. **Left
> open:** 58's nit stands, narrower — `run.json` does not say whether an
> invocation is in flight, though nothing sent is lost any more. The
> interrupted invocations in the walk ended by the ten-second tree-kill
> fallback as often as by Claude Code's control message (`exit=1
> seconds=10`) — measure why before the deck promises "gentle".

> **Recorded, 2026-08-31, after session 58.** Session 58 — the third of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised two Majors:
> one was fair and is built (engine children had no POSIX process group, so
> a tree kill would have orphaned the tool the engine was running — the
> `detached` rule now lives inside `spawnProgram` for every caller, proven
> by a test that kills a real grandchild); the other asked for the plan's
> `text`/`-s`-when-quiet argv and was **disputed with line-cited evidence
> and withdrawn** in round 2, because D250 had already recorded that the
> plan's step 4 ("identical bytes on the ledger") forbids it. Its deliverable is
> **D250**: the engine adapter. **One spawn**, `checks.spawnProgram`: an
> `.exe` with no shell, a `.cmd` shim through `cmd.exe` with every argument
> quoted, and the declared checks, the Copilot seat and the engines all go
> through it — both branches proven with a real shim in the suite. **Three
> argv shapes, measured** off the installed CLIs' `--help` (`engines.ts`):
> Claude Code `-p --input-format stream-json --output-format stream-json
> --verbose --dangerously-skip-permissions [--model] [--continue]` with the
> prompt as a stdin user message; Copilot `-p <prompt> --model M
> --allow-all-tools --allow-all-paths --no-ask-user [--continue]` (model
> required, refused by name without it); Codex 0.151.0 `exec --json [-m]
> --dangerously-bypass-approvals-and-sandbox <prompt>`, then `exec resume
> --last …` (cwd-scoped). `--engine-argv` is now optional and overrides;
> gemini has no shape and is refused by name. **`driver.engine_output:
> stream | quiet`** (`dabbler.yaml`; `--show-engine` overrides one run)
> decides what the terminal shows and never what `engine-<NN>.log`
> records — the plan's `text`/`-s` when quiet was dropped because it
> contradicted the plan's own "identical bytes on the ledger"; `stream`
> shows Claude's thinking / tool / text / result lines and only the `init`
> system event, Copilot's own lines, Codex's completed JSONL items. **The
> interrupt, one path:** `dabbler session interrupt --reason "<text>"`
> writes `interrupt.json` (refused when nothing is being driven; cleared at
> registration); the driver polls it every half second, ends the
> invocation, writes `# interrupted (<reason>)` on the transcript, and
> re-issues the same instruction as `kind: interrupt` under a new seq with
> the reason first among `reasons`, then re-invokes with `--continue`.
> **Measured:** Claude Code's single-process variant honours a
> `control_request{interrupt}` on stream-json stdin — `control_response`,
> `result: error_during_execution`, process alive, context kept (it knew it
> had reached 4) — so the Claude Code adapter ends an invocation through
> that message and closes stdin at the `result`; Copilot and Codex get a
> tree kill, which is also the fallback ten seconds after a control message
> that ended nothing. `session.interrupt` is on the in-process contract for
> 59's Stop. Every `engine-invoked` line reports `invocation=N/max`. 57's
> `done` question: no CLI is invoked to read it, on any engine. Eight
> tests; **1179 router tests**; the extension changed only where its test
> stub implements the widened contract.
> **Round 2's nit, left because the tree was verified:** `session interrupt`
> cannot tell whether an invocation is running — a request made between
> invocations succeeds and is then discarded (logged as
> `interrupt-discarded`), and one written in the instant between the
> driver's discard and the spawn still ends the new invocation. Closing it
> means `run.json` saying an invocation is in flight, which is a schema
> change for 59 to take if Stop needs the truth rather than the log.
>
> **Owed to 59.** Start becomes the launch: `session drive` with the
> registered engine and no `--engine-argv`; Stop and Send are `session
> interrupt`; the attention row exists already. The developer's guide
> documents the driven lifecycle, `driver.engine_output`, the interrupt,
> and what a stopped loop looks like. **Noted.** The Codex renderer follows
> Codex's documented JSONL item shapes; the CLI is not installed here and
> its output was not measured live — the first driven Codex session should
> read its transcript against the rendered lines.

> **Recorded, 2026-08-31, after session 57.** Session 57 — the second of the
> driver set — closed `VERIFIED` in two rounds. Round 1 raised three Majors:
> one was fair and is built (a stopped loop is now an **attention row** —
> `buildTaskRows` reads `run.json` and blocks the first phase not done with
> the stop's kind and reason); two were disputed with line-cited evidence
> and **withdrawn** in round 2 (the verb holds a disposition set against the
> round *before* writing, so an incomplete set never reaches disk — now a
> test case; and `driver.max_invocations` is snake_case like every key in
> `dabbler.yaml`, the D248 precedent). Its deliverable is **D249**: **`dabbler
> session drive`**, the loop in `packages/router/src/drive.ts` that runs a
> session from registration to close by calling the lifecycle's own verbs
> — `session start`, `session declare` from the engine's plan, `test-evidence
> run` for the affected tests and the run of record, `verify`, `verify
> dispute` for a rejected finding, one commit and one push, `session close`
> — so a driven session leaves exactly the record a typed one leaves and the
> task rows move for the same reasons. Every report is judged in one place
> (seq, step, files exactly what the tree changed since the last accepted
> step, the step's `argv` checks green through the controls' executor) and
> refused with every reason; three refusals stop the loop. Blocking findings
> go back as a `rejection` carrying every finding; a `fix` becomes a
> `fix-round-N` step checked by every plan step's check, a `reject` becomes
> a dispute; red affected tests and a red run of record go back the same
> way. The plan and the dispositions travel through **`session report
> --answer-file`** (56's owed item 1): the verb stamps the framework's
> members, refuses one the engine typed differently, and refuses a file
> inside the ledger. **`driver.max_invocations`** in `dabbler.yaml` (snake_case;
> repository-owned; default 24) bounds the engine; a stopped loop closes
> nothing, writes why to the ledger's fifth file **`run.json`** (`driver-run`:
> phase, accepted steps, baseline tree, counters, `stop`), and the same
> command re-runs from the phase it reached — a different engine name is
> refused. One adapter ships: `commandEngine(argv)`, spawned per instruction
> with no shell, `{instruction}` substituted; **`--engine-argv` is required
> on the CLI until 58** adds the built-in argv per engine. Nine tests, a
> scripted engine in-process against the offline verifier. 56's owed nit (2)
> is taken (`[\s\S]*` in the path patterns). No extension change.
> **A lesson bought by the first run of record, which was red:** the drive
> tests each run a whole session (5–8 s alone) and vitest's default test
> timeout is 5 s; under the four-worker full suite three of them timed out,
> and a timed-out drive keeps running against a torn-down config. The
> `describe` now carries `{ timeout: 120_000 }`; a third round verified the
> change and the run of record was taken again. A test that spawns real
> work needs its own bound, and the bound is not a sign the work is slow.
>
> **Owed to 58.** The adapter proper: `resolveProgram` preferring an `.exe`,
> the quoted `.cmd` branch, the three argv shapes, `--continue` from
> `EngineInvocation.first`, stream/quiet with the stream-json renderer over
> `emit`, and the interrupt. **For 59.** The attention row already exists in
> the task rows (blocked, "Driver stopped (kind): reason"); Start becoming
> the launch needs no new projection field for it. **Noted.** A driven session's `done`
> instruction is written but the engine is not invoked to read it — on a
> seat that is a premium request that buys nothing; 58 decides whether a
> CLI needs the closing turn.

> **Recorded, 2026-08-31, after session 56.** Session 56 — the first of the
> driver set — closed `VERIFIED` in two rounds. Its deliverable is **D248**:
> the driver's contract. Four schemas under `packages/router/schemas/` with
> generated types — `driver-instruction` (`seq`, `kind` ∈ step | rejection
> | interrupt | done, per-kind required members, `answer_schema` +
> `answer_command` on every kind but `done`, refused on `done`),
> `driver-report` (`status` ∈ done | blocked, repository-relative
> `files_changed`, `tests_run`, `notes`), `driver-work-plan` (`task`,
> `releasable`, ordered steps with unique ids, expected files and **at least
> one** `argv` check each) and `driver-disposition` (per finding `fix` |
> `reject`; a reject carries `reason` and `evidence_paths` so it can become
> a dispute; the reader **holds the set against the recorded round** and
> refuses a repeated index, an index the round lacks, or a blocking finding
> left unanswered). Round 1 bought both bolded tightenings: the verifier's
> two Majors were `checks: []` closing a step on the engine's word, and a
> disposition set that could omit a finding. The driver's ledger is
> `.dabbler/runs/s<N>/driver/` — `instruction.json`, `report.json`,
> `plan.json`, `dispositions.json`, `engine-<NN>.log` per invocation —
> owned by the new `driver.ts`: whole-file, atomic, the CURRENT answer, and
> a `LedgerError` on read when a file does not validate.
> **`dabbler session report`** (`--seq --step --status --files --notes
> [--tests]`) is the engine's one verb: it normalises paths, shapes,
> validates and writes; it refuses a report no instruction asked for and
> one where the instruction asked for a different answer; it judges shape
> only. Substance — the outstanding seq, the step asked for, the files the
> tree changed, the check — is session 57's driver, in one place. Field
> names are snake_case (not the spike's camelCase) to match the ledger's
> neighbours. Seven tests; **1162 router tests**. No extension change.
>
> **Owed to 57.** (1) How the work plan and the dispositions travel from
> the engine into the ledger — the report verb carries a step report only,
> so 57 widens the verb (an `--answer-file` it validates and copies) or
> adds a sibling; `answer_command` on the instruction is whatever line 57
> picks. (2) Round 2's nit, left because the tree was verified: the path
> pattern's `.*` does not span a literal newline, so `src\n/../widget.py`
> passes the `..` lookahead — use `[\s\S]*` when the schema is next
> touched. (3) A lesson for every session, not just this one: the
> `extension` suite's `final-full` binds to the **whole** tree, so it must
> be run and recorded each session even when no extension file changed —
> the close refused once here for exactly that.

> **Recorded, 2026-08-31, evening.** The long-haul direction below was
> **proven the same day** in a standalone spike (`D:\Projects\dabbler-driver-spike`):
> a scripted five-step session driven by the framework, with Haiku on Claude
> Code and Luna on the Copilot seat, in an *await* variant (the engine blocks
> on a signal file) and a *resume* variant (the driver invokes the engine per
> step with `--continue`). All four trials passed with no human nudge; one
> seat session per Copilot run; ~5 premium requests per driven run. The
> operator chose **resume**, saw the engine's live output preserved
> (`--engine-output stream|quiet`, identical transcripts), and agreed the
> interrupt is the driver ending the invocation and re-invoking with
> `--continue` and the reason. **The plan is reordered:** sessions **56–59**
> are the driver set (schemas and the report verb; `session drive`; the
> engine adapter with stream and interrupt; Start becomes the launch plus the
> developer's guide), the deck is **60** and the publication trial **61**. The
> spike found two things worth carrying: an engine CLI must be spawned as an
> `.exe` with no shell or with quoted arguments for a `.cmd` shim, and only
> Claude Code's `init` system event is worth showing.

> **Recorded, 2026-08-31, latest.** Session 55 was inserted from the
> operator's screenshot of session 54 and closed `VERIFIED` in one round.
> Its deliverable is **D247**: the Work Explorer's task rows are **derived
> from the lifecycle's own records** — *Register* from `startedAt`,
> *Declare* from the declaration, *Work* from the pre-verify evidence,
> *Verify* from the rounds ledger, *Run of record* from the `final-full`
> row, *Close* from the status — and the seeding, the two bookends and
> `dabbler session log` (CLI, in-process router, contract) are **deleted**.
> Nothing an engine types moves a row; the open row is the first not done.
> `test-evidence record` now stamps the session on the row. Proven on the
> session's own rows before its verdict. The plan was renumbered: the deck
> is **56**, the publication trial **57**. Extension **2.3.0** is built and
> installed here, unpublished like 2.0.0–2.2.0; 1155 router tests.
>
> **The operator's long-haul direction, recorded for the block after 57.**
> The framework drives the lifecycle and calls AI as a service: an engine
> asked to "start the next session" resolves it and launches the framework;
> the framework asks the authoring AI for a work plan, hands back each step,
> calls the verifier (which `dabbler verify` already does, with a schema-
> validated round), routes findings back for disposition, runs the suite,
> and closes. Every answer the framework acts on is **structured against a
> schema** and refused mechanically when it does not validate; prose the AI
> writes (decisions, change log, close-out) is markdown for people and the
> framework never interprets it; code and tests the framework compiles and
> runs but never reads. `dabbler workflow` (session 35) is the seam to grow.
> Plan it as a set: the ask/answer schemas first, then the driver, then an
> authoring adapter per engine, then the extension's Start becomes the
> launch. Two cautions to decide up front: per-step calls need the prior
> step reports, not the transcript, or later steps degrade; and a verifier
> that writes tests against its own findings needs the authored-tests
> envelope kept.

> **Recorded, 2026-08-31, later.** Session 54 closed `VERIFIED` in one
> round. Its deliverable is **D246**: `packages/router/vitest.config.ts`
> caps the suite at **four workers locally and one in CI** (both bounds —
> vitest defaults the minimum to the core count). Measured whole-suite on
> the twenty-core host: 20 workers 94 s wall for 873 s of test time, 4
> workers 106 s for 352 s, 2 workers 138 s for 262 s; twenty was
> contention, and four costs twelve seconds while leaving sixteen cores
> free. The suite command in `dabbler.yaml` did not change. `config.test.ts`
> is now hermetic against `DABBLER_TRANSPORT` — the clear-and-restore sits
> at file scope, because four of its blocks resolve the transport, not one.
> The run of record was taken with the variable set in the shell.
>
> **Found while running it, not built: the Work Explorer's task rows are
> narration.** `session start` registers the session and leaves its own
> *Register* row in progress until an engine types `dabbler session log`;
> the *Affected* row waits for the same even though `affected` and
> `test-evidence record` run inside the framework; the step keys truncate
> at the first `.`, so "Make `config.test.ts` hermetic" rendered as *Make
> config*. The declare bookend opens one row and deliberately moves nothing
> else (`session.ts`, `advanceStepsAtDeclare`: a verifier upheld that the
> middle belongs to `session log`). The operator's reading, from the
> screenshot: confusing, and the same thing that never worked before. The
> proposal is in the section below, and it is the operator's to take.

> **Recorded, 2026-08-31.** Session 53 was inserted ahead of the publication
> trial from three pieces of operator feedback, and closed `VERIFIED` in one
> round. Later the same day the plan was reordered so the trial is **last
> (56)**: 54 caps the router suite's workers, 55 is the operator onboarding
> deck, and the trial runs when the operator decides to publish. Until the
> next `session start`, the ledger's row 54 still carries the trial's old
> title; `session start` re-syncs titles from the plan. Its deliverable is **D245**, which
> supersedes D104: the Work Explorer groups sessions under status buckets
> again — In Progress and Not Started ascending, Complete and Cancelled
> descending, empty buckets not rendered, counts dimmed on the headers, In
> Progress expanded and the rest collapsed, a close date on every finished
> row. Closed sessions that stopped at the cap are no longer attention rows;
> they sit under a collapsed *Information* bucket. The scaffolded session 1,
> `PLAN_PROMPT`, the bootstrap hand-off line and the extension walkthrough
> now tell the engine to **ask the operator what the project is** instead of
> guessing it from the folder (an engine did exactly that on a fresh
> project). `solution.yaml` declares this repository a one-component
> solution, so the Solution Explorer renders here. Extension **2.2.0**, built
> and unpublished like 2.0.0 and 2.1.0 before it.
>
> Two things noted and not built. (1) `packages/router/test/config.test.ts`
> is not hermetic against `DABBLER_TRANSPORT`: with the variable set in the
> shell, three `resolveTransport` tests fail; the run of record was taken
> with it cleared for the process. Clear it before the suite, or fix the
> test to. (2) The operator floated an Information bucket that also lists
> work done outside any session; nothing records such work today, so it
> needs a data source before it needs a row.

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

## What is waiting on you

**Nothing that blocks work.** The next sessions run from the `.vsix`.
**Taken, 2026-08-31, as sessions 55–57 (D247–D249).** The task rows move
themselves; the driver has its contract (56) and its loop (57). **Next is 58,
the engine adapter**, then 59 (Start becomes the launch); then **60, the onboarding deck** —
install the current `.vsix` first on a fresh machine — and **61, the
publication trial**, when you publish.


One decision is open, and it is yours to take when testing is finished,
not before: whether to publish `dabbler-ai-router` to npm and the extension
to the Marketplace.

    dabbler owed list          # read the brief
    dabbler owed answer --id publication --choice publish   # when you are ready

The extension bundles the router and calls it in-process, and the `dabbler`
command in a VS Code terminal is the extension's own shim, so nothing you
are testing waits on npm: session 53 ran on an unpublished router, and
`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.2.0.vsix` installs
with `code --install-extension`. What a publish buys is people who are not
you, outside VS Code — a Codex or Copilot CLI user in a plain terminal, and
a consumer repository's pre-commit hook run from one — and it buys session
56, whose `dabbler release --verify-install` can only ask the public
registry.

Publishing is the one act here that cannot be taken back — npm refuses
`unpublish` after 72 hours and a Marketplace version slot is never reusable —
which is exactly why it waits for the end of testing rather than the start.
When you do publish, it is router first and then the extension, at whatever
version is current then; the brief's `publish` answer does both in that
order and you run no git command. Earlier text in this file and in the
brief called this "the one thing waiting on you"; that framing came from
how sessions 49–50 phrased the acceptance criterion, and it overstated the
case.

## Where things are

**53 of 56 closed.** Sessions 37–50 were the DX block; 51 was the bounded
remediation the field trial mandated; 52 walked the startup experience; 53
brought the Work Explorer's buckets back and made session 1 ask. Next: 54
caps the router suite's workers, 55 is the operator onboarding deck, 56 is
the publication half of the trial and runs when you publish. The trial's full
record is `docs/field-trial-50.md`.

**Eight of `csv-model`'s nine feedback items are closed, with the code that
closed each one named.** The ninth is the publication decision above.

### What the block built

- **Sessions 37–40 — the operator's own surfaces.** A survey of 24 extension
  files (`docs/extension-dx-survey.md`, 13 findings); planned sessions
  projected so a repository stops reading as finished; owed decisions as a
  record with a class, a severity and a brief; task rows rendering at last,
  folded from the `plan-step` rows `session start` has always written.
- **Sessions 41–43 — setup, naming, liveness.** The icons that rendered with a
  line through them (`width="16mm"`); setup that creates the folder and runs
  `git init` itself; the pane renamed "AI Orchestration" with Solution and
  Work Explorers under it; an attention view over what is stalled and what is
  owed.
- **Sessions 44–48 — the multi-repository half.** `solution-dependencies.json`
  carries the edge and never the pin; the graph is the union of what every
  reachable repository declares, with `usedBy` derived; source-mode switching
  that makes git submodules unnecessary and refuses to let its evidence count;
  packaging detected and written for you; the Solution Explorer rendering and
  navigating the whole solution; one VS Code window over all of it.
- **Session 49 — the release path**, which is the section above.
- **Sessions 50–51 — the trial, and what it found.**

### Three sessions closed `REMEDIATED_AT_CAP`

44 and 45 hit the round cap; their final repairs are unreviewed code. 46
through 51 all closed `VERIFIED`, five of them inside two rounds. The
verification loop was not gentle and it was right more often than I was: a
dispute in session 40 was upheld against me, session 45's fourth round caught
that a self-reported test duration cannot prove when a run happened, and
session 48's first round caught a workspace generator whose paths would have
resolved into the wrong directory on its only path.

### Two things the trial found in what you read

Both fixed. `raiseOwed` was idempotent on a decision's *id*, so a brief
corrected in code never replaced the one on disk — live, and it would have
had you reading a recommendation the code had since reversed. And
`test-evidence --help` documented only `record`, omitting the framework-timed
`run` that a session now needs.

A third finding, F-50-4, was withdrawn in session 51: I had misread
`dabbler status` during the trial, printing its top-level keys and concluding
that fields nested under `repository` were missing.

### Still current, written at session 40

**Task rows render for the first time** — the Work Explorer's
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
