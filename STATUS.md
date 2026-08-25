# STATUS — the framework runs, and the instructions are tested against three models

**Branch: `design/solution-decomposition`.** Not `experiment/verification-pipeline-v3`,
which the section below describes and which is no longer where work happens.
Nothing is merged to `master`.

## Where things are

**The six-step framework is built and has been run end to end on a real
solution.** `solution.py` declares what a solution is, `contractdoc.py` renders
contracts as tables with generated diagrams, `workflow.py` folds state from an
append-only log, and `stepreview.py` sends a step's output to two vendors that
did not write it. The VS Code Solution Explorer reads a projection the driver
publishes.

**The walkthrough is at `examples/csv-walkthrough/` and every command in it has
been run from a bare shell.** Step 1 was reviewed by real vendors over six
rounds; steps 2–6 were served from `scripted-reviews/` and every such round is
stamped `simulated` so it can never be read as cross-vendor evidence.

**Suite: 759 Python, 179 TypeScript, lint clean.**

## What running it actually exposed

**Five defects in the new code, none of which reading it would have found:**

1. **The review prompt asked for a shape `verdict.py` cannot parse.** Two real
   reviews came back as unparseable blobs, three findings collapsed into one row
   with no severity. A round-trip test now pins prompt and parser together.
2. **A blocked step could never reach the developer.** `needsApproval` was
   `step in APPROVAL_STEPS and not blocked`, so the human gate was shut exactly
   when it was needed. **Five real cross-vendor rounds on one plan produced four
   Major findings every time, each round's genuinely new and correct** — a prose
   document has no bottom, so "no Major findings" is not a state anyone reaches.
   The gate now outranks the block, and an approval over live objections records
   how many it overrode.
3. **`route()` ignores `exclude_providers` on the offline path**, so a scripted
   run would have recorded two reviewers that were one queue. Checked in
   `stepreview` too, and scripted rounds are marked.
4. **`contractdoc` asserted coverage it never had** — a hardcoded tick in a
   "Tested" column on every clause, referencing no test.
5. **`solution check` printed the manifest's declared step in the same shape
   `workflow status` prints live progress**, so one screen said step 1 and the
   other step 6 with nothing to say which was which.

**There is still no round cap on `workflow review`.** An unattended run keeps
calling vendors. The approval gate means work can move; it does not make the
reviewers stop.

## The instruction-testing method

**Walkthroughs and UATs are now checked by driving deliberately weak models
through them as if they were the reader.** `scripts/uat_follow.py` is the
harness; `scripts/skimcheck.py` redacts a document to what a skimmer sees and
audits paragraphs for a point sentence. The writing rules are in
`docs/skim-resilient-writing.md`.

**The first run never finished** — confused on 22 of 28 turns, because none of
the documented commands ran as printed. **The current document passes all three
of Luna, Gemini Flash and Haiku, from three vendors, under skim redaction.**

**The method produces false findings in two distinct ways, and both look real.**
A harness bug gets scored against the document (four of those so far), and a
weak model confabulates (Haiku invented a contract clause that does not exist).
**Reproduce every finding by hand before acting on it.**

## What the walkthrough proved about the framework

**A contract change is the interesting case and it fired on a real defect
rather than a staged one.** Building the parser proved the line-accounting
invariant wrong; `csv-parser` returned to step 3 naming `csv-app` as affected,
`csv-model` stayed at 6/6, and the contract went 1.0.0 → 1.1.0. **`app.run` is
byte-identical between step 5 on mocks and step 6 on the real parser**, which is
the claim the six steps exist to make.

## Next

**The framework has been reconceived around supervisors** —
`docs/framework-reconception.md`, reviewed by GPT-5.6 Sol at
`docs/reviews/sol-on-reconception.md`. Staff supervise AI engines and do not
write code, so components are a durable graph, work packages are bounded and
own sessions, contract formalization sits inside the decomposition gate, and
cross-provider review runs per work package rather than per session.

**The CSV walkthrough is the wrong shape for that audience** and is marked so at
the top. It teaches a developer's day. The rebuild is two decisions, a handoff
and an inbox.

1. **The operator walks through it himself**, knowing the shape is wrong.
2. **`.dabbler/` is git-ignored**, so a team cannot see each other's progress and
   a fresh clone starts with no history. This needs a shared event source before
   anyone relies on it.
3. **A round cap on `workflow review`.**
4. **The Solution Explorer has not been rendered in a real VS Code.** A drawing
   of the intended tree exists; nothing has been screenshotted from the product.

---

# STATUS — after set 144 (the plan is pre-registered, hashed, and cannot answer the completeness question)

- **Set 144 is complete on `experiment/verification-pipeline-v3`.** All three
  sessions VERIFIED over `copilot-cli` — session 1 by gemini-3.1-pro-preview
  after adjudication overruled every disputed finding, sessions 2 and 3 by
  gpt-5.5/openai (rounds 4 / 3 / 2). Nothing merged to `master`.
- **A plan is a machine-owned artifact now.** `approved-plan.json` is
  schema-validated, written only through the sanctioned writers, hashed at
  approval, and immutable afterwards except by an appended amendment. The
  hash covers every field but `amendments`, so an append never moves it, and
  a write ledger tells a true append from a rewritten history. A step with no
  evidence contract cannot be written; a plan with more than seven steps
  cannot be written; the schema refuses both, so no reviewer is ever asked to
  count.
- **Checking it is free until it cannot be.** The mechanical checks run
  first and settle the round alone. The cheap model reads what survives
  against fixed checklist text — approve, amend, or human, per step. A
  revision that does not touch the objected-to fields bounces with **no model
  call**. Premium review fires only on derived high risk or a second
  objection, and the record names which trigger fired.
- **Amendments carry the change, not a note about it.** `added_files` widens
  the amended step's envelope, `evidence_contract` replaces its proof, and
  `effective_plan` folds them over a core that is never rewritten. Risk is
  re-derived from the widened envelope, so a supervisor cannot amend past the
  review its own risk earns. Only the amended step is re-checked.
- **The outside-the-plan test is mechanical.** `compare_to_envelope` diffs the
  working tree against the declared envelope; set difference decides and no
  model is asked. **Set 145 has to call it** — this set built the mechanism,
  not the caller.
- **Suite: 531 green.** Envelope: **15,556 LOC / 29 modules / 531 Python
  tests** against 16,800 / 33 / 605; TS unchanged at 161. `verify.py` is still
  **1,789** and must end below 1,200 — **set 145 session 3 owns that
  extraction**, and it is now the only structural debt the sequence has left.

## What the replay could not answer, and what it did

`scripts/plan_replay.py` replays all 16 closed sessions of 136–141 and
publishes counts to the set's `replay-136-141.md`. **The result is negative
and is reported as one:** 14 of 15 measurable sessions would have needed an
amendment against an envelope reconstructed from spec-named files. That is
the reconstruction failing, not the design — a spec names two to eight files
and a session touches three to twenty-five. **The amendment rate cannot be
estimated from history; set 145 must measure it against authored envelopes,
and 146 is where the decision on it belongs.**

The usable half is the distribution: escapes concentrate in the source tree
(45) and the test tree (43). **A step whose evidence contract says a test
proves it must declare that test in its envelope**, or it amends its plan the
moment it writes the test. Set 145 should author envelopes from the evidence
contract, not from the spec's prose.

Of 16 verification findings on disk, exactly 1 cited only files inside the
reconstructed envelope. `coverable` is the ceiling of what this measurement
can claim — a declared proof *could* have covered it. Whether it *would* have
is the completeness question, and **pre-registration cannot answer it by
construction**: a weak criterion inside the envelope passes. What it does
guarantee is that the criterion could not be rewritten once the code was
seen. Sets 145–147 must not be written as though it guarantees more.

## Decisions taken during set 144

- **The plan is a new artifact, not a reused one.** `spec.md` is
  hand-editable and its seeding is one-shot; `review-claims` v1 has no
  evidence field, blesses claiming nothing, and is frozen shut. Neither was
  bent to fit.
- **Ceremony is excluded structurally, not by a flag.** Register, affected
  tests, verification, the run of record, close-out and the documentation
  pass never enter a plan, because a step kind a supervisor sets is a step
  kind a supervisor sets wrong.
- **`change-log.md` is lifecycle-written.** Close-out writes it, close-out is
  never a plan step, so no envelope may declare it — and counting it would
  refuse every session for obeying the lifecycle. It joins
  `session-state.json` and `activity-log.json`. **`spec.md` deliberately did
  not join them:** a session editing its own spec mid-flight is the drift the
  plan exists to catch.
- **Those three filenames now have one declaration.** `gates`, `facts` and
  `test_evidence` each had their own copy and the plan work was about to add
  a fourth; they read `ledger.LIFECYCLE_WRITTEN_SET_FILES` instead, beside
  `MACHINE_DIRNAME`, which owns the same record-versus-work distinction.
- **The test forecast ran low again.** 18 forecast, 55 spent. Session 3 alone
  forecast 3 and spent 7. Across 142–144 the pattern holds: estimates made
  before the behaviours are enumerated understate them. **Set 145's forecast
  should be read as a floor.**

**Next: set 145** (step execution — and the `verify.py` extraction), then 146
(measure then enable), 147 (session walkthroughs).

---
# STATUS — after set 143 (the framework stopped assuming its subject was Python)

- **Set 143 is complete on `experiment/verification-pipeline-v3`.** All three
  sessions VERIFIED by gpt-5.5/openai over `copilot-cli` (rounds 2 / 3 / 2).
  Nothing merged to `master`.
- **Every change in the set was a deletion**, and the arithmetic is published
  in the set's `change-log.md`. Against baseline `9e5a1111`: **14,473 →
  14,007 LOC** (−466), **27 → 27 modules** (0), **477 → 476 Python tests**
  (−1), TS unchanged at 161. Per module: `affected.py` 804 → 697,
  `evidence.py` 944 → 774, `facts.py` 810 → 621 — and no other module
  changed, so those three deltas are the whole.
- **Selection is declared, not parsed.** `PACKAGE`, the AST import graph and
  `test_*.py` discovery are gone. A repository states its test roots, its
  test-file glob, and which tests answer for which path. The reasons that
  remain carry no language knowledge. An unmappable path still records
  `selection_unknown`, runs the declared smoke tests, and raises a risk.
- **Quote provenance is a digest, a line range, and byte-exact text.**
  `PARSED_SUFFIXES` and `ast.parse` over reviewed source are gone, so a quote
  from a `.cs`, `.java`, `.ts` or `.sql` file is now checked as rigorously as
  one from a `.py` file. Today's residual is honest: line-range provenance
  proves *where* a quote came from, not *what construct* it is. A check
  needing that difference is a check for a deterministic analyzer.
- **Changed-line coverage is gone from the code, the config and the
  dependencies**, and the skip path went with it. Coverage existed only to
  police an exemption; remove the exemption and nothing needs policing.
  **Every step gets its model check** — sets 145 and 146 must not rebuild it.
  The git-side changed-line extraction stays, as review context on the fact
  record that nothing is judged by.
- **Suite: 476 green.** Envelope: **14,007 LOC / 27 modules / 476 Python
  tests** against 16,800 / 33 / 605. `verify.py` is untouched at **1,777**;
  it must end below 1,200, and set 145 session 3 owns that extraction.

## What the set could not do, and said so

The set's acceptance criterion demanded the framework be smaller on all three
counts. **Module count did not fall**, and the criterion was re-scoped in
session 3, with operator authorization, to measure and publish the number
rather than require it to move. The three assumptions removed were spread
*inside* `affected.py`, `evidence.py` and `facts.py`, each of which still has
work to do; none was a module that could go, and deleting an unrelated one to
move the number is arithmetic theatre.

The test estimate missed the same way. The set forecast returning **11** and
returned **1** (−1, +1, −1 across the sessions). The forecast assumed a
deleted feature takes its tests one for one, but the deletions landed in a
few tests each covering several behaviours, and the surviving behaviours
still need their one test. LOC is where the subtraction shows: **−466**, or
3.2% of the framework.

## Decisions taken during set 143

- **Elimination, not pluggability.** A language-provider registry was the
  obvious answer and the wrong one: it adds an interface plus one
  implementation per ecosystem, and buys an inference nobody asked for.
- **Targeted selection is an economy, not a proof.** The proof is
  `final-full` against the final verified tree. A stale selection rule costs
  a late discovery there and cannot ship a defect — which is what makes a
  declared mapping an acceptable replacement for an inferred one.
- **Three stale skip-path passages were corrected** in the specs for sets 144
  and 145, all left behind by the resequencing.
- **Session step lists changed from set 145**, and are written into the specs
  for 145, 146 and 147. The full-suite run is its own plan row rather than a
  clause on the verification row — it is a separately recorded stage bound to
  its own digest, and burying it hid the run of record from the activity log.
  Technical/educational documentation is a plan row **after close**, alongside
  STATUS.md, for the same reason STATUS.md lands there: content written after
  the verified snapshot fails `verification_clean`. "Affected tests as
  preverify" replaces the longer wording. Set 144 keeps the old lifecycle rows
  and names both new ones as lifecycle, so its plan schema still excludes them.
- **Plan step keys are derived, not declared.** `plan_step_key` truncates the
  step's first clause to six words, which produces keys like
  `close-out-and-the-end-of`. `stepNumber` is the stable address and the key
  is a label, so nothing is broken — but **set 144 session 1 now owns** giving
  sessions and steps one authored slug, used by `spec.md`, `activity-log.json`
  and the plan's `step_id` alike, with the derived key as the fallback.

**Next: set 144** (the approved plan), then 145 (step execution), 146
(measure then enable), 147 (session walkthroughs).

---
# STATUS — after set 142 (the cheap proof runs first, and the machine insists)

- **Set 142 is complete on `experiment/verification-pipeline-v3`.** All three
  sessions VERIFIED by gpt-5.5/openai over `copilot-cli` (rounds 2 / 5 / 3).
  Nothing merged to `master`.
- **The lifecycle is now mechanical, not advisory.** `verify` refuses to
  dispatch without an accepted `preverify-targeted` record for the current
  surfaces, and the refusal names the targeted command. A full-suite run is
  not ordinary pre-verification evidence; the two auditable exceptions are
  the selector proving every test affected, and `--allow-full-preverify`
  with a non-empty reason. `final-full` is the run of record, bound to its
  tree digest, and it alone satisfies `test_run_fresh`.
- **Changed-line coverage is real, and it earns its keep — and set 143
  removes it.** The declared suite command carries
  `--cov ... --cov-report=json:.dabbler/coverage.json`, so the fact comes
  from the run the selector prescribes. Session 3's own coverage fact found
  an unreachable branch in the change that introduced it. Only executable
  statements count: a changed comment is not a gap. Coverage's data file
  lives under `.dabbler/` — a stray `.coverage` in the repo root is an
  unmappable changed path, and would turn the very command the selector
  printed into a `policy_violation`. It works; it is going anyway, for the
  reason set out below.
- **Deterministic controls read `pass | fail | not_applicable | unknown`.**
  This repository declares none, so all four read `not_applicable`. A tool
  that cannot be launched reads `unknown`, and a required `unknown` is red —
  never a quiet `pass`.
- **Suite: 477 green.** Envelope: **14,473 LOC / 27 modules / 477 Python
  tests** against 16,800 / 33 / 605. `verify.py` is **1,777** (from 1,926);
  it must end below 1,200, and set 145 session 3 owns that extraction.
- **Set 143 is expected to move the envelope down**, not up: every change in
  it is a deletion.
- **Set 142 spent 22 tests against an estimate of 14.** The budget
  arithmetic in the later specs has been corrected: 477 now, 466 after 143,
  483 after 144, 502 after 145, 512 after 146.

## The language-neutrality gap, and what it changed

The framework is *written* in Python, which is fine. It also **assumes its
subject is Python**, which is not. Three places, and only three:

- `affected.py` hardcodes `PACKAGE = "ai_router"` and builds its dependency
  graph with `ast.parse`. The selector's two strongest reasons —
  module-ownership and dependency-edge — therefore work only for *this*
  repository. Any other codebase, Python included, falls through to
  `selection_unknown`.
- `evidence.py` pins quote provenance to `PARSED_SUFFIXES = (".py",)` and
  matches enclosing AST node chains.
- `facts.py` reads only coverage.py JSON.

**The direction is elimination, not pluggability**, and all three make the
framework smaller: delete the AST import graph in favour of declared rules;
replace AST quote provenance with digest-pinned line-range provenance; keep
one small stdlib reader per report format behind the seam that already
exists. Cobertura and JaCoCo are both XML with per-line hit counts.

This is critical, and it is **set 143 — the next set to run**, authored as
`143-language-neutral-by-subtraction`. It goes ahead of the approved plan
because 144 freezes an evidence-contract schema at v1 the moment it hashes
one, and that schema must not be written around coverage that 143 removes;
and because 144's derived risk flags — *public interface*, *integration
module* — are exactly where the next language assumption would enter.

**The skip path is settled: it goes, and changed-line coverage goes with
it.** Coverage existed for one job — letting a step skip its model check
safely — and was needed only because the other two skip conditions are
author-declared. Remove the exemption and there is nothing left to police.
**Every step gets its model check.** Three alternatives were rejected:
falsifier twins (double the tests for no new behavior; real mutation
testing does prove discrimination but needs an engine per language and
heavy compute), execution logging (coverage hand-rolled — same information,
more overhead, and it edits the code under test), and verifier-authored
tests with stubs (fixes an author shaping the test to the code, but assumes
work always starts from nothing, so refactors and config work route around
it).

Two consequences, both deliberate. Review spend is **not** a function of
step count — the diff is partitioned across steps, not duplicated, so seven
step-sized reviews come to about one session-sized review plus a constant
per call, and a narrow context is cheaper to reason over besides. Losing the
skip costs exactly the reviews of the steps that would have skipped: the
all-deterministic, all-green ones. And since nothing mechanical judges test
quality, the step reviewer's fixed checklist must ask *would this evidence
actually tell us the step worked* — a question, not a subsystem. Set 145
carries it. 144's seven-step cap survives on its own merits: it bounds what
the plan reviewer holds in view at approval, and a session wanting twenty
steps is more than one session.

Granularity is not the lever: whole-file collapses to "was the module
imported", true almost always; symbol-level is the right human unit but
needs an AST per language, so it would *increase* coupling. Line-level was
never the language-specific part — only the report reader was.

## Other decisions taken during set 142

- **The approved plan carries only the session's own steps**, never
  register, verification, the run of record, or close-out, and a session
  declares at most seven — refused by the schema at write time. Encoded in
  144 and 145.
- **The spec step lists across 142–147 had verification before the tests.**
  Corrected in all fourteen; the code always enforced the right order.
- **STATUS.md lands as its own commit after a set closes**, not inside the
  session commit — a content edit after the verified snapshot fails
  `verification_clean`.

**Next: set 143** (language neutrality by subtraction), then 144 (the
approved plan), 145 (step execution), 146 (measure then enable), 147
(session walkthroughs).

---
# STATUS — after set 141 (the critique contracts exist, and decide nothing)

- **Set 141 is complete on `experiment/verification-pipeline-v3`.** All
  three sessions VERIFIED by gpt-5.5/openai over `copilot-cli` (rounds
  2 / 3 / 3). Nothing merged to `master`; the merge is one deliberate
  decision after set 145 passes the plan's §11 gates, not a sequence of
  partially enabled sets.
- **Nothing reads any of it.** `verify` and `session close` behave exactly
  as they did at `8be18fb8`: same rounds, same verdicts, same five gates.
  The pipeline is `off` by default, `shadow` is the only other accepted
  value, and `enforce` is refused at load by the name of the set that will
  enable it.
- **Suite: 455 green**, which is set 141's whole 11-test allocation
  (444 + 11).
- **The re-scope decision is RESOLVED, and sets 142–145 were rewritten**
  (2026-08-19, commits `2e21d53c` and `6839fbbe`). The operator answered
  the 12-slot shortfall by relaxing the constraint rather than shrinking
  the work: **ground rules 1 and 4 are suspended for sets 142–145**,
  replaced by a +33% envelope on this baseline — **16,800 LOC / 33 modules
  / 605 Python tests / 215 TS tests**. The old allocation (10/13/8/6 = 37)
  is void. **No set is blocked; 142 is next and may begin.**
- **The design changed with it.** The manager/worker critique pipeline is
  replaced by a plan-first, step-wise design: proof declared before code,
  deterministic tools first and free, a model reading one step's diff
  rather than a session bundle, and the framework committing each step.
  New allocations are 142: 14, 143: 16, 144: 20, 145: 10 — sixty tests,
  reaching 515 of 605. Two rules survive the relaxation: one test per
  behavior, and a new module must make another smaller (`verify.py` is
  1,886 lines and must end below 1,200).
- **Three constraints the rewrite holds and must not be traded away.**
  Session-level cross-provider verification stays mandatory with no skip
  or waiver — the step-level check is a different granularity. A step may
  skip its model check only when all its evidence is deterministic, all
  green, **and** changed-line coverage shows every changed line executed.
  The framework commits per step and **never pushes**: CI runs on push to
  `master` and on PRs against it, so the push is one act at close.
- **The framework checks the worker, and the check checks the quote.** A
  quote is re-read from the *reviewed tree* by digest — never the
  worktree, which keeps moving — re-hashed, and matched against the
  enclosing AST node chain. The kinds a quote must satisfy are derived
  from the check's own `Kind:dotted.name` vocabulary, not from the row
  answering it: an optional worker-declared `ast_kind` would have made
  the discrimination opt-in for the party it constrains, which is what
  round 1 caught. The seeded fixture spells `os.system(cmd)` inside a
  string literal precisely so that a quote of it cannot answer a check
  about calls.
- **A blocked result has no way back.** Blocked for `unprovable-absence`,
  `authorized-pulls-insufficient`, `bounds-exhausted` or
  `tooling-unavailable` means the check has no `pass` in its future at
  all. The exits are the plan's ladder — deterministic test or analyzer,
  a narrower check, adjudication, human review — and a later attempt with
  more context or tools is a bigger budget, which is not evidence about
  the code. Round 2 was right that letting re-executed evidence discharge
  it reopened exactly the door the plan closes.
- **A result for an unregistered check is refused** (round 2's second
  finding): an unregistered `check_id` carries no objective, no scope and
  no evidence contract, so accepting one turned the quote contract off at
  the moment a worker named a check nobody wrote.
- **Absence is measured here or not at all.** The worker declares query,
  kind and closed scope; the framework re-runs it and records scope,
  query, tool version and count. A declared count that disagrees with the
  re-run is refused rather than corrected, and a scope resolving to no
  searchable file is refused outright — absence proved over nothing is
  the cheapest false proof there is.
- **`tests/fixtures/critique-roundtrip/` is the seeded round trip** —
  `widget.py`, `claims.json`, `checks.json` — travelling from `verify
  prepare` through the real writers and the real verifiers to a validated
  result, with no model called anywhere. Sets 142–145 should extend it
  rather than build a second one.
- **Test execution order is the plan's, not habit's** (§2.4): targeted
  runs before verification, the full suite after, as the run of record.
  Set 142 makes that enforceable; here it was followed by hand.
- **This environment still has no provider API keys** — seat transport
  only, so the `api` path stays unexercised and routed verification is
  unpriced.


- **Released: `dabbler-ai-router` 1.1.0 is on PyPI** (2026-08-19), tag
  `v1.1.0` on `3ebda389`. The release workflow builds from the tagged
  commit, so the stale `dist/` artifacts in the working tree were not
  what shipped — they were built at 06:05, before this set started, and
  contain none of it. Published wheel verified after upload: it carries
  `run_refresh`, the writer stamp, the fractional-sample coercion and the
  `local-overrides` tier; its bundled `router-config.yaml` still reads
  `profile: api`; its lockfile pins CLI 1.0.80; and `local-overrides.yaml`
  is not in it. **Correction to the note below: PyPI had 1.0.8, not
  1.0.0** — tags v1.0.1–v1.0.8 had all published. Rebuild `dist/` locally
  before trusting it for anything.
- **The VS Code extension was not released.** `tools/` has zero changes
  since `vsix-v1.0.4`; the Marketplace pipeline (`publish-vscode.yml`,
  `vsix-v*` tags) is a separate track and nothing warranted a bump.
- **Set 139 session 3 is done; the set is closed.** The seat catalog
  lockfile is machine-written end to end. `refresh --quorum --dry-run`
  projected **2** premium requests on the live seat at CLI 1.0.80, the
  real run spent exactly that, re-dated the pin from 1.0.68, and left the
  15 unprobed entries byte-identical. Full record, with the before/after
  diff, in
  `docs/session-sets/139-seat-catalog-refresh/s3-refresh-evidence.md`.
  **Nothing in this set required a human to open the lockfile in an
  editor** — which is the outcome the missing writer made impossible.
- **Hand-editing is now detectable.** The writer stamps `written_by`,
  `written_at` and a `content_digest` over what it wrote; `load_catalog`
  reports three states — `machine-written`, `hand-edited` (contents
  disagree with the stamp, *including* a stamp whose digest line was
  deleted), `unstamped` — and the last two surface as warnings in the
  same channel as version drift. Detection, not enforcement: the seat
  still loads. The digest covers rendered **content**, not mtime,
  because the lockfile is committed and every checkout rewrites mtime.
- **Every stale-catalog message now names the refresh invocation.** The
  drift warning, the missing-provenance refusal, the fewer-than-two-
  providers refusal, and `route.py`'s two lockfile errors. The absence
  of that verb is the whole incident: an operator told the file is
  wrong, and handed no command, edits the file.
- **`claude-opus-4.7` failed its probe with `invalid-model`** and kept
  its 1.0.68 confirmation with `last_probe_error` recorded beside it —
  the merge rule demonstrated on the live seat rather than in a fake. A
  withdrawn model and a policy-blocked one return the identical CLI
  error, so nothing is inferred from it.
- **`premiumRequests` is fractional, and the coercion now says so.**
  Round 1 of verification returned one Major and it was right: the seat
  reports `0.33` for `claude-haiku-4.5` and `0` for `gpt-5-mini`, and
  session 1's coercion read every float as malformed. The seat's
  *cheapest* models therefore recorded as unknown-cost, an unknown sorts
  after every known sample, and `--quorum` picked `claude-sonnet-4.6` at
  1.0 over `claude-haiku-4.5` at 0.33. `_coerce_probe_premium_requests`
  now accepts any finite non-negative int or float; a bool, string, list,
  negative or non-finite value is still not a count. The writer renders a
  float through `repr` — the shortest text that reads back as the same
  float — so the sample survives a rewrite and the digest holds. **The
  quorum now costs 1.33, not 2**; the set's acceptance criterion names 2,
  which is what it cost while the cheapest model read as unknown. The
  invariant is untouched: the sample is a one-call observation, never a
  price, and it never feeds model selection.
- **Every quorum-relevant sample was re-measured post-fix** and came back
  identical (`no change: all 3 probed entries answered exactly as the
  lockfile already records`), so no stale v1 value is hiding behind a
  float the old coercion discarded.
- **Test fixtures were decoupled from the live seat record.** Four tests
  asserted exact values of `ai_router/copilot-catalog.lock`, so an honest
  refresh broke the suite — pressure to edit the record to make tests
  pass, which is the pathology this set exists to remove. The behaviour
  tests now read a frozen `tests/fixtures/seat-catalog.lock`; only the
  two contracts that must hold for *any* lockfile (byte-for-byte round
  trip, universe declares every id) still read the shipped file.
- **Suite: 475 green**, 5 free against the 480 ceiling. Session 3 added
  7 tests against an 8–12 estimate.
- **Docs.** `README.md`'s transport-precedence list, `docs/quick-start.md`
  and `docs/schema-reference.md` all now carry `local-overrides.yaml`
  (where it lives, never published, unknown keys refused at load, the
  seat-only worked example) and the refresh flow with its cost table.
  `schema-reference.md` documents the lockfile schema, the declared
  candidate universe, and the writer stamp.
- **The packaged default is untouched and must stay that way.**
  `ai_router/router-config.yaml` still reads `transport: profile: api`;
  this machine reaches the seat through `local-overrides.yaml` with
  `DABBLER_TRANSPORT` unset and no `--transport` flag.

# STATUS — after set 140 (the cancelled scope is gone; 1.1.0 is built, not published)

- **Set 139 is next, and it is now the only open set.** Its spec was
  amended during 140: it absorbs the `local-overrides.yaml` project-local
  config tier, as session 1 step 2, because all three of its sessions
  dispatch through `copilot-cli` and cannot today without a per-command
  flag. Estimate is now **41–55** against **50 free** slots, so the
  re-scope trigger written into its spec is live, not decorative — if the
  count trends to the top of the range by the end of its session 2,
  re-scope session 3 rather than spending the margin.
- **Done (set 140, 1.1.0).** Set 138's dormant code is gone: 2,577 lines
  and 51 tests. `verify.py` and `ledger.py` were restored to their
  pre-138 state rather than patched — set 138 touched each in exactly one
  commit and that commit was purely additive, so the file-level restore
  was the exact surgery. Kept deliberately: `PromptTooLargeError` and the
  truncation refusal in `route.py`, `parse_set_config`, the `modules.py`
  manifest extension, and the `module:` key in every spec. Shipped:
  `session log`, plus two stale-doc corrections.
- **The instruction files are consolidated, and the reason matters.**
  Verified against vendor docs 2026-08-19: **Copilot CLI loads
  `CLAUDE.md`, `GEMINI.md` and `AGENTS.md` all at once, whatever the
  model, and de-duplicates nothing** — file loading is a *client*
  property, not a model one. Claude Code does **not** read `AGENTS.md`
  natively; Gemini CLI does not either without a `context.fileName`
  opt-in. Both do expand `@file` at load time, which is a loader
  directive rather than a request the model may decline. So: `AGENTS.md`
  carries the managed body, `CLAUDE.md` and `GEMINI.md` carry
  `@AGENTS.md` plus their tail at 9 lines each. `GEMINI.md` is restored —
  v1 wrote three engine files and the v2 rebuild wrote two while its own
  tail claimed Gemini read `AGENTS.md`. **This repo's ground rules moved
  from `CLAUDE.md` to `AGENTS.md`**: they had been outside the fence in
  `CLAUDE.md` only, so a Codex session never saw them.
- **Publishing is prepared and stopped.** `pyproject.toml` and
  `__init__.py` are at **1.1.0**; sdist and wheel are in `dist/`. Minor,
  not patch: `session log` and the third instruction file are additive
  behaviour, and the removed `context_scope` surface never reached PyPI.
  **PyPI still has 1.0.0** (2026-08-15). The wheel carries no
  `context_scope.py`, no `pulls.schema.json`, and a bundled
  `router-config.yaml` that still reads `profile: api` — that default is
  correct for a fresh install with API keys and must not be edited to
  suit this machine, which is exactly what set 139's overlay is for.
- **Suite: 430 green** (475 → 424 → 430), 50 free against the 480 ceiling.
  Both sessions VERIFIED round 1 by gpt-5.5/openai over `copilot-cli`.
- **This environment still has no provider API keys** — seat transport
  only, so the `api` path is unexercised here. `DABBLER_TRANSPORT` is set
  at user scope but was absent from the VS Code process environment all
  session (the window predates the write), so every routed call used an
  explicit `--transport copilot-cli`. Restarting VS Code fixes it; set
  139's overlay removes the need for either.
- **The catalog lock still pins CLI 1.0.68 while the live seat reports
  1.0.80.** That is set 139's subject, and the drift warning fired on
  every verification this set.
- **Set 138's salvage is still outside the repo** at
  `.copilot/session-state/350c17da-bf29-422c-93ab-b828baf275db/files/set-138-salvage/`.
  Everything worth re-applying has now been applied; what remains there
  is the measurement, the verbatim verifier responses, and the two
  scope-only fixes that are meaningless without the cancelled code. The
  redesign discussion it feeds is still open and still unprejudged.

# STATUS — after set 138 was cancelled (read this before starting anything)

- **Run set 140 before set 139.** The lowest-numbered not-started set is
  139, but 139 estimates 36–48 new Python tests and the budget has
  **5 slots free** (475 of 480). Set 140 frees 51 by removing cancelled
  code. Starting 139 first walks into a wall at its first session.
- **Set 138 is cancelled**, during its own session 3, on its own
  measurement. `CANCELLED.md` carries the reason. Two premises failed.
  (1) *Billing*: the spec rejected an agentic pull because "it bills per
  turn", but Copilot and the direct APIs bill **per token**, so bundle
  size is the dominant cost and a bounded-scope *push* optimises the
  wrong variable — the same review measured 121,820 chars scoped vs
  16,233 monolithic, ~7.5× per round, forever. (2) *Contracts beat
  review*: the planted cross-file defect is caught by the existing
  pytest suite in 7 seconds at zero marginal cost, and is not expressible
  at all against a keyword-only API.
- **The correctness finding survives, and is worth keeping in mind.**
  With no ambient filesystem access, the same verifier returned **Major
  from the scoped bundle and VERIFIED from the monolithic one**, on both
  corpora — the monolithic path approved a repository whose main path was
  broken. The variable that matters is not scoped-vs-monolithic; it is
  whether the repository has enforceable contracts. `../certs` has no
  tests, and there the review was the only net.
- **Two findings for the redesign discussion, not yet acted on.**
  (1) Tier 2 resolved "direct callers" by whole-word match, so generic
  symbols (`log`, `main`, `start`) pulled most of the repo. (2) On
  `copilot-cli` run inside a repository the verifier holds read-only
  `view`/`grep`/`glob` over the workspace, so any context bound is
  advisory and an escalation channel is bypassable — a verifier can read
  a file instead of asking, and no ledger row records it. Demonstrated:
  an in-repo monolithic control caught the defect by opening a file its
  bundle never mentioned.
- **Salvaged outside the repo**, at
  `.copilot/session-state/350c17da-bf29-422c-93ab-b828baf275db/files/set-138-salvage/`:
  the full measurement, every uncommitted session-3 change as one patch,
  seven verbatim verifier responses, and the harness scripts. Its
  `README.md` separates what is reusable from what should not come back
  without the redesign. Set 140 session 2 draws the `session log`
  subcommand and the doc corrections from it.
- **Still on `main`, dormant**: set 138's sessions 1 and 2 — ~1,900 lines
  (`context_scope.py` 1,046, the `verify.py` scope fork ~545, the
  `pulls.jsonl` ledger and escalation CLI ~140) and 51 tests. Inert
  unless a repository ships `docs/modules.yaml`, and none does. Set 140
  removes them. Note that `tests/test_escalation.py` is **not** part of
  this — it predates set 138 and covers response escalation.
- **Do not `git revert` set 138's work commits.** Session 1 also deleted
  `prompting.py`, folded it into `route.py`, and replaced silent
  tail-truncation of a verification bundle with a named refusal
  (`PromptTooLargeError`). That fix is independent and must survive.
- Publishing: `pyproject.toml` is at **1.0.9**, PyPI has **1.0.0**
  (2026-08-15), suite green at 475. The current build is publishable;
  set 140 session 2 bumps and prepares the artifact, and publishing
  stays operator-gated.
- This environment has **no provider API keys** — seat transport only —
  so the `api` path is unexercised here. The catalog lock still pins CLI
  1.0.68 while the live seat reports 1.0.80; that is set 139's subject.

# STATUS — after set 137 (the Copilot seat transport works, and is exercised)

- Done (set 137, 1.0.9): the `copilot-cli` transport was dark on a
  seat-only install and is now the transport the repo verifies itself
  through. Two rebuild regressions fixed. (1) v1's Set 104 large-prompt
  file handoff, dropped in the v2 rebuild, is restored in
  `transports/copilot.py`: above `HANDOFF_THRESHOLD_UTF16_UNITS` (measured
  on the rendered argv, every OS) the payload goes to a temp file and `-p`
  carries only a bootstrap; a footer-only nonce fails the call closed as
  `handoff-incomplete` on an under-read; the payload is deleted in
  `finally` on every path. The OS size refusal also gets its own class,
  `argv-too-large`, instead of hiding inside `generic-unknown`. (2)
  `bootstrap` persists `DABBLER_TRANSPORT` at **user** scope by default —
  machine scope is `--machine-scope` and falls back, announced, when it
  cannot be honoured; the old HKLM-only write landed nowhere on an
  unelevated account and was the wrong default anyway when the admin
  account is a different user. Routed dispatches also pass
  `--no-custom-instructions` so a verifier is not handed the workspace's
  orchestrator instructions.
- Verified: 414 Python tests (≤480) green. Sessions 1 and 2 verified
  cross-provider **through `copilot-cli`** (claude-opus-5/anthropic
  orchestrator, gpt-5.5/openai verifier) — the repaired surface doing the
  verifying, and carrying real Majors back in S2 r1 and S3 r1 rather than
  rubber-stamping. Session 3's verdict is whatever
  `session-state.json` records; do not read this file for it. Live
  evidence in
  `docs/session-sets/137-copilot-cli-transport-remediation/s3-live-probe.md`:
  a 49,645-char prompt (49,794 UTF-16 units vs the 32,767 ceiling) returned
  facts planted at head, middle and tail with the ack validated and
  stripped; a 115,465-char run did the same in S1; the inline control below
  threshold still reports `handoff: false`; and a cold unelevated bootstrap
  lands `DABBLER_TRANSPORT=copilot-cli` in HKCU with HKLM untouched.
- Known gap, not fixed here: this set restored v1's Set 104 argv handoff,
  which by its own scope note fixes *transport only* — not model context
  capacity. `verify.py` still builds one monolithic bundle capped at 600 KB
  while the handoff triggers at 23 KB, so a very large session can now be
  shipped intact and still overrun comprehension. v1's second mechanism
  (`pull_verifier.py` / `pull_critique.py` / `path_aware_critique.py`,
  sets 065–069) has no v2 equivalent. Successor set planned.
- Carried forward: the catalog lock's meta `cli_version` disagreed with
  its own entries and is corrected to 1.0.68; only `gpt-5.5` is
  re-confirmed at 1.0.80, because only `gpt-5.5` was exercised. There is
  still no catalog-refresh command, so re-confirming the other 14 entries
  needs one probe each. PyPI has 1.0.0 (2026-08-15); this build is 1.0.9
  and publishing is operator-gated.

# STATUS — after Session 3 (extension as renderer, corpus migrated, packaged)

- Done: extension forked into tools/ and cut to a renderer — all six TS ports
  of Python logic deleted; tree renders from `python -m ai_router.progress
  --json` (async scan, mtime-keyed projection cache, file-presence fallback
  with a visible "install ai-router" message when python is unreachable).
  Commands 43 → 17 (15 user-facing + 2 internal). One-shot v3→v4 migrator ran
  over all 46 stale v1 sets (totals unchanged 119/13/1/1) then was retired
  (add 6a1e4b7, delete 5d041fb). Docs rewritten (README 142 / quick-start 132 /
  schema-reference 163 / MIGRATION-FROM-V1 47). Packaged: VSIX 1.0.0 (737 KB)
  + wheel; tagged v1.0.0.
- Verified: 325 Python tests (≤480) and 158 TS unit + 16 Playwright = 174
  (≤215), all green. Playwright drives a real VS Code against corpus fixtures
  through the real projection. Real-session e2e on a scratch repo: start →
  work → REAL cross-provider verification (anthropic orchestrator, openai
  verifier, $0.026, VERIFIED round 1) → 5 gates → close → push. LOC: Python
  7,776 (~9,000 budget), TS 5,034 src + 2,668 tests ≈ 7,700 (~7,500 target).
- Deviations (post-evaluation review, all deliberate): `modules.py`
  (110 LOC, create-only) stays — the plan's Session 3 keep-list requires the
  `python -m ai_router.modules` seam its own inventory omitted; recorded as
  a plan contradiction, not regrowth. `--transport` flag now exists on
  `python -m ai_router.verify` (full precedence: flag > env > profile >
  api). session.py reconsidered per ground rule 8: sanctioned artifact
  writers extracted to `writers.py` (488) leaving session.py at 745 for the
  flows it was told to absorb (lock+resolve+spec-parser+cancel/restore).
  Remaining S1 per-module overruns (copilot.py ~1.5x, selection.py ~1.5x,
  route.py ~2x incl. escalation loop) are accepted as-is: the code is
  e2e-verified and under the global budget; a simplification
  pass is deliberately deferred. Total Python after the writer extraction:
  7,855 vs the ~9,000 budget. PyPI already has a 1.0.0 (uploaded
  2026-08-15); publishing this build needs 1.0.1. Copilot lock still pins
  CLI 1.0.69 (re-probe before a live seat run).


