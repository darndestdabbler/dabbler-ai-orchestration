# The parity control for the TypeScript port

> Designed in session 22 of `docs/sessions/session-plan.md`; built in session
> 23; run before every verification round of sessions 23–36; retired in
> session 36 at the step that deletes the Python router. The decision that
> names this document is in `docs/sessions/decisions-log.md`.

## What it is, and what it is not

The port is correct when the TypeScript router, given the same repository
and the same verb, writes **the same bytes** the Python router writes —
to the record, and for a read-only verb to stdout — and exits with the
same code. This document specifies the check that says so.

It is a **declared deterministic control** — a `testing.controls` entry in
`dabbler.yaml` with kind `analyzer` and `required: true`. `ai_router.facts`
runs declared controls before a verification round and records each one's
exit code in `.dabbler/runs/deterministic-facts.jsonl` under the closed
vocabulary `pass` / `fail` / `not_applicable` / `unknown`. A red required
control returns the change to its author before a verifier is bought.

It is not a test: a test of test infrastructure is a banned kind, and this
check proves nothing about either router alone. It is not a verifier's
judgment: a verifier cannot read 29,000 lines for drift, and the control's
answer is an exit code, not an opinion. It keeps **no golden files**: both
outputs are computed at run time from the same input, so there is nothing
checked in that could go stale or be hand-edited.

## Where it runs

- Declared once, in session 23, as kind `analyzer` and `required: true`,
  beside `tsc --noEmit` (kind `typecheck`), ESLint (kind `lint`) and the
  generated-type staleness check (kind `compile`) — the first controls
  this repository declares.
- Runs on every `python -m ai_router.verify` from then on, through `facts`.

> **Amended in session 23, over two verifier rounds: the control has two
> comparisons, not one.** As designed it compared two routers, and there is
> no second router until session 25 — so a control declared in session 23
> would have returned exit 0 having compared nothing, writing a green
> `analyzer: pass` row on every round: a record saying parity was checked
> where nothing was. Not declaring it was worse, and correctly refused: it
> leaves the port with no required parity gate at all.
>
> The resolution is that parity has a half that needs only one router.
> **Determinism** — each corpus shape built twice and compared byte for
> byte after the same two normalizations — is a precondition for router
> parity being measurable at all: if a record write is not reproducible
> (a set iterated in hash order, a float formatted by locale, a digest
> over a timestamp), then a later router difference cannot be told from
> noise. It runs from session 23, it is what the control's answer rests on
> until session 26, and it is not a formality — it caught the
> digest-ledger defect on its first run, and removing that rule turns the
> control red today. **Router parity** is the second comparison and grows
> one case at a time from session 26. The control is red if either drifts.
- Runs by hand as `npm run parity` (workspace root) with the same script and
  the same exit codes, so a session sees drift before it asks for a round.
- Runs on the same machine and OS for both routers. **Cross-OS parity is not
  claimed**; path separators and line endings are whatever this host's git
  and this host's Python produce, and the TypeScript side is held to that.

  > **What that costs, measured in session 25.** Python's `print` writes
  > through a text-mode stream, so on Windows every line it emits ends CRLF
  > — to a console and to a redirect alike. Node writes the bytes it is
  > given. The first verb through the control differed on nothing but that,
  > on every line. So the TypeScript router writes through one seam
  > (`src/cli/output.ts`) that applies the platform's ending, and no verb
  > reaches `process.stdout` directly. The same asymmetry runs the other way
  > on **reading**: Python's text mode translates CRLF to LF before a parser
  > sees it, so `src/textfile.ts` does too — and a reader whose Python twin
  > opens the file in *binary* (`tomllib` takes bytes) deliberately does
  > not.
- Python stays installed in `.venv` until session 36 so the Python side can
  always be run. The control refuses (`unknown`, not `pass`) if either
  router cannot be executed.

## The corpus: one repository per lifecycle shape

Each shape is a real git repository with a real bare remote, built fresh at
every run into a temporary directory by a builder script that drives the
**Python** router — the reference implementation — from the same seed the
test suite already uses (`tests/conftest.py`, `_sandbox_template`: a seeded
working repository plus a bare `origin`, git configuration pinned for the
process). Nothing under the corpus is checked in as output.

> **Amended in session 23, as built.** A shape is built only when an active
> verb needs it, and its builder lands in the session that first needs it —
> the same rule the verbs follow, applied to the fixtures they run against.
> `fresh` and `in-flight` are built (they buy no model call, and session 23
> proved both end to end); `disputed`, `at-cap` and `moved-machine` need
> canned verifier text through the offline transport and land with the verbs
> that read them. A shape whose builder is missing stops the control at
> "could not run" (exit 2), never at a pass. `npm run parity -- --build
> <shape>` builds one by hand, and `npm run parity -- --self-check <shape>`
> builds it twice and compares the two copies — a builder that fails that is
> non-deterministic, and every parity run it fed would be flaky for a reason
> no diff would explain.

| Shape | What the builder does | What it exercises |
| --- | --- | --- |
| **fresh** | A repository with `dabbler.yaml`, a two-session plan, no `sessions.json`, no `.dabbler/runs/`. | Registration from nothing: the first state write, the plan seeding, the first activity-log entries. |
| **in-flight** | Session 1 started and declared; one source file edited; the selector run; a `preverify-targeted` row recorded. | The ordinary middle of a session: `affected`, `test_evidence record`, the declaration, `progress`. |
| **disputed** | Session 1 taken through round 1 with a canned `ISSUES_FOUND`; one finding disputed with a file-backed rebuttal; round 2 with a canned `WITHDRAWN`. | `rounds.jsonl`, `disputes.jsonl`, the verifier-output files, the fix-delta baseline, the round anchors. |
| **at-cap** | Session 1 taken to `max_rounds` with canned blocking findings and a remediation before the last round. | The two terminal states (`REMEDIATED_AT_CAP` / unresolved), the cap-landing row the framework writes without a verifier identity. |
| **moved-machine** | The disputed shape cloned through `origin` **without** the round refspec — an unmigrated clone — so `refs/dabbler/rounds/*` and the trees they anchor are absent from the clone's store; plus a second copy of that clone after `git fetch origin '+refs/dabbler/rounds/*:refs/dabbler/rounds/*'`, which brings the anchor commits and, with them, their trees. | On the unfetched copy: the missing-baseline message and the fetch it prints, `verify reanchor` and its refusals (only the last commit at or before the round is legal). On the fetched copy: `effective_baseline` resolving through the anchor, and `ledger.append_round`'s anchoring of the next round. |

The builder is deterministic: git author and committer identity and dates
are pinned through the environment, and the verifier is the **offline
transport** (`transports/offline`, ported in session 28) fed canned verifier
text from the corpus, so both routers see byte-identical verifier output.
Until session 28 the corpus drives only the verbs that buy no model call.

> **Amended in session 28, as built.** The offline transport is ported and
> `route` dispatches through it, so a canned verifier is now possible — but
> the three shapes that need one still have no builder, because the verb
> that would drive them is `verify` at session 33. What session 28 removes
> is the *blocker*, not the gap: the builders land with the verbs that read
> them, which is the rule the shape table already follows.

## The verbs

Every verb is run twice against two copies of the same shape — once by
`python -m ai_router.<module> …`, once by `dabbler <verb> …` — and the two
copies are compared afterwards. The list is the union of what the extension
spawns and what an engine runs by hand. Each verb enters the control in the
session that ports its module and stays in it for every later session.

> **Amended in session 25, as built.** Two things the table could not say.
>
> First, **`metrics` is the first verb through the control**, not one of
> session 26's writers: it is the only verb in session 25's batch, its
> Python side is a real command line, and its report is a pure function of a
> three-layer `config` load and a telemetry file. So the cross-router
> comparison begins in session 25 rather than 26, which is earlier than D159
> assumed and costs nothing — the substance D159 protected was that no
> session be handed an instruction it cannot follow.
>
> Second, **a case may declare an environment**, given to both invocations
> identically. The `metrics` case points `AI_ROUTER_METRICS_PATH` at a
> canned telemetry file the corpus builder writes under `.dabbler/`, so the
> report is a real comparison over four calls rather than the empty branch,
> and it is the same on a machine that has never routed anything. An env
> that differed between the two sides would compare two questions rather
> than two answers, so it is one function evaluated per side, not two.

| Verb | Shapes | Enters in session |
| --- | --- | --- |
| `metrics` | fresh, in-flight | 25 |
| `session start` / `declare` / `log` / `decision` | fresh, in-flight | 26 (writers), full from 31 |
| `progress`, `progress --json` | all | 31 |
| `modules` (list / create / retire) | fresh | 31 |
| `affected` | in-flight | 27 |
| `test_evidence record` (both stages) | in-flight | 27 |
| `verify` (offline transport), `verify dispute`, `verify adjudicate` | disputed, at-cap | 33 |
| `verify reanchor` | moved-machine | 33 |
| `ledger` reads (`latest_round`, the unresolved view) | disputed, at-cap | 26 |
| `approved_plan`, `plan_review` | in-flight | 32 |
| `session close --dry-run`, `session close`, `cancel`, `restore` | all | 31 |
| `bootstrap` | fresh | 34 |
| `packaging --dry-run` | in-flight | 34 |
| `discovery` (lock-file read and write from a canned catalog; no enumeration) | fresh | 28 |
| `seat_cost` against a fixture `session-store.db` | — (no repository) | 30 |
| `workflow` (the six-step driver, offline) | in-flight | 35 |

`discovery enumerate` is excluded: it needs the network and its answer is
not a function of the repository.

> **Amended in session 28, as built: `discovery enumerate` is compared after
> all, because the corpus takes the network away from it.** The exclusion
> above is right about a machine with keys — three live calls whose answers
> are the vendors' current catalogs, which are neither a function of the
> repository nor the same for both copies. So the corpus scrubs
> `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` and
> `DABBLER_GEMINI_API_KEY` alongside the four router variables it already
> scrubbed. Every vendor then fails as `no-api-key` before a socket opens,
> and what is compared is the record both routers fold that identical
> failure into: the merge that annotates a failed vendor instead of emptying
> it, a vendor gaining a status row it did not have, the providers sorted by
> name, unknown written by omission, the writer stamp and the digest. That
> is the **write** half the table's row asks for, and it is the only compared
> verb that writes a lock file. Scrubbing the keys is also load-bearing on
> its own: without it a parity run on the operator's own machine would spend
> three vendor calls per shape, every run.
>
> **Amended in session 29: one vendor keeps a fake key and a closed-port
> URL, so the case reaches a real transport failure.** With every key
> scrubbed all three vendors fail at `no-api-key`, which is a constant both
> routers already agreed on — so the shared failure vocabulary session 29
> introduced would have been asserted rather than checked. The corpus now
> gives openai a value that is not a key and points it at a closed loopback
> port. Nothing is sent: the connection is refused before a request is
> written. Both routers must then classify a refused connection into the
> same word (`network-error`) while the other two still write `no-api-key` —
> one case covering both halves of the field.
>
> **The port is allocated and released, not chosen, and round 1 of that
> session's verification is why.** The first attempt hard-coded
> `127.0.0.1:1`, and the case went green while comparing two different
> events: port 1 is on the WHATWG bad-port list, so Node rejected it with
> `Error: bad port` *before opening a socket* — no syscall, no connection —
> while httpx dialled it and was refused. A control that agrees for
> different reasons is worse than no control, because it reads as proof.
> The corpus now binds port 0, reads what the OS assigned and releases it,
> which is both certainly closed and certainly not on that list; the
> router's own tests assert the `ECONNREFUSED` in the failure chain before
> asserting the term, so the substitution cannot happen again unnoticed.
>
> Four cases, all on `fresh`: `status`, `drift`, `enumerate --dry-run` and
> `enumerate`. The seat catalog is **read** by the first three — it resolves
> relative to the config that names it, so both routers read the same real
> `ai_router/copilot-catalog.lock` — and it is not written by anything until
> session 30, which is where the table's "lock-file … write" belongs for the
> seat.
>
> **One line in these cases is wall-clock-derived and the normalizations
> cannot reach it**: `status`, `drift` and the dry run print a record's age
> as `f"{hours:.0f}h old"`, computed from each router's own `now`, and the
> two invocations are about a second apart. Two runs disagree only if that
> second straddles a half-hour-rounding boundary — roughly one run in two
> thousand — and the diff then says `5713h old` against `5714h old`, which
> is self-explaining and settled by re-running. It is recorded here rather
> than fixed, because both available fixes are worse: a third normalization
> is forbidden, and a `--now` flag would be a CLI knob invented for the
> control's convenience.

> **Amended in session 30: `seat_cost` enters with two cases, and the seat
> catalog's WRITE does not enter at all.**
>
> The `seat_cost` row is built as the table says — the corpus writes a canned
> `session-store.db` under `.dabbler/`, both copies are handed the same file
> through `--store`, and the verb reads it. Two cases rather than one, because
> the interesting half of this verb is the vocabulary it refuses in: the first
> asks for three ids (one with usage over two events, one known with no usage
> at all, one the store has never heard of) and must come back a **floor**
> with the credits, the dollars, the event count and the reason line agreeing;
> the second asks only for the id the store does not know and must come back
> **unmeasured** with no number at all and a non-zero exit. An absent
> measurement is never `0.0`, and the exit code is what tells a caller which
> it got. This is also the first compared verb whose input is another
> program's SQLite file, read by `sqlite3` on one side and `node:sqlite` on
> the other.
>
> **The seat catalog's write is NOT comparable, and saying so is the
> amendment.** The paragraph above says the write "belongs to session 30".
> The writer landed there; the case cannot. A `copilot refresh` that writes
> anything must first PROBE, and a probe is a billed premium request per model
> — the control would spend the quorum's cost twice per run, on the operator's
> own seat, every run. That is not a normalization problem or a fixture
> problem; it is what the record means. What the write has instead is the
> round-trip contract asserted in both suites against the real shipped lock
> (`dumps(load(x)) == x`, byte for byte), which is the property a partial
> refresh depends on, plus the writer stamp and the digest, which the
> **`discovery enumerate`** case already compares on the other record that
> shares this renderer.
>
> **`copilot refresh --dry-run` spends nothing and is still not a case.** It
> was built, run both ways, and its stdout is byte-identical — but Python
> reaches it as `python -m ai_router.transports.copilot`, and that import path
> makes runpy print a `RuntimeWarning` to stderr before the command runs. The
> module's own tail comment explains why (`ai_router/__init__` has already
> imported it by way of `route`). The control compares stderr on every verb,
> so the case would be red for the interpreter's bookkeeping rather than for
> anything either router did. Two ways out and both are worse than waiting:
> invoking Python as something other than `python -m` would compare an
> invocation no operator uses, and rearranging the Python package's imports is
> a change to the reference implementation to suit its own control. **It
> becomes comparable for free at the cutover**, when the Python side is gone
> — and a `--dry-run` case is worth adding then, because it is the only
> reading of the scope selection and the cost projection that costs nothing.

> **Amended in session 31: the lifecycle's judgment half enters, a case may
> declare a SETUP, and `docs/modules.yaml` joins the compared paths.**
>
> Ten cases land, across `session`, `progress` and `modules`: `session plan`
> and `modules create` on `fresh`; `session close --dry-run` on both built
> shapes, because a gate that differs by one row is this set's worst
> outcome and the dry run prints every row with its remediation; `session
> close` on `in-flight`, which prints the same rows and then refuses,
> proving that a close over a session with no round lands nothing on either
> side; `session cancel --force` and `session restore` on `in-flight`; and
> `progress --json` on both shapes plus `progress` with no flag on `fresh`,
> which is what proves the flag is inert rather than asserting it.
>
> **A case may now declare a `setup`** — one `python -m` invocation run on
> BOTH copies before the compared verb. `restore`'s only write path needs a
> cancelled session and no built shape carries one; the alternative was a
> sixth shape, which D176 named as the expensive thing. The setup runs
> through the Python router, which is how every shape is built already, so
> the case still compares exactly one verb. A setup that differed between
> the copies would be comparing two questions, so it is one function
> evaluated per side.
>
> **`docs/modules.yaml` is compared, and it is the one compared path people
> also edit by hand.** `modules create` rewrites the whole file through a
> YAML emitter on each side, so two routers that reformatted a tracked file
> differently would make every later diff of it lie. PyYAML and the `yaml`
> package are reached to each other with four options — sequences at their
> key's indent, single quotes, PyYAML's fold width (which allows the break
> at column 81 rather than before 80), and YAML **1.1**, which is what makes
> `yes`, `no` and `on` quote themselves. **Two inputs still emit
> differently and are recorded rather than papered over**: a scalar of
> exactly `y` or `n`, which the TypeScript emitter quotes and PyYAML does
> not, and a title carrying a newline, which the one writes as a `|-` block
> and the other single-quoted and folded. Both are legal YAML for the same
> value, neither appears in a kebab-case slug or an ordinary display name,
> and closing them means writing a PyYAML-compatible emitter — which is a
> session, not a port's side effect.
>
> **`session migrate` is not a case**, and that is a corpus gap rather than
> a divergence: every built shape is post-collapse, so there is no
> `docs/session-sets/<NNN-slug>/session-state.json` for the migration to
> read. Its refusals and its dry run are covered by the TypeScript suite and
> by the Python one, and a shape whose only purpose is one verb that runs
> once per repository is not worth ~12 s on every parity run.

> **Amended in session 32: the approved plan is compared through its caller,
> the `in-flight` builder gained a `python -c` step, and a third digest
> ledger names itself.**
>
> **No new case, and that is the finding.** The verb table lists
> `approved_plan`, `plan_review` on `in-flight` from this session, but
> neither module declares a command line — `verbs.ts` has said
> `pythonCli: false` for `approved-plan` since session 23, and
> `plan_review` has no entry at all. There is no `python -m` invocation to
> put on either side, so a case in the table's own shape cannot be written.
> What the plan has instead is a **caller**: `progress` folds it into the
> task rows, so the `in-flight` builder now writes and approves a real plan
> and opens its one step, and the existing `progress --json` case compares
> the fold. Before this, both routers agreed the task list was empty, which
> is the shape of a control that proves nothing — the same failure the
> session-29 port allocation records.
>
> **The builder reaches Python's writers directly, through `-c` rather than
> `-m`.** A plan whose content is not backed by a sanctioned write is
> refused on read by design, so a builder that wrote the JSON itself would
> construct a shape that only ever exercises the refusal. `pythonScript`
> runs `approved_plan.write_plan` / `approve_plan` and
> `ledger.append_step_event` in the reference implementation, which is the
> rule every shape already follows; `-c` is forced only because the module
> has no `__main__`. The step row's `recorded_at` is **pinned**, not read
> from the clock: every other stamp in the corpus is written by a router and
> reduced by normalization 1, and a value the *builder* authors would move
> between two builds of one shape for a reason no diff could attribute.
>
> **`approved-plan-writes.jsonl` joins `state-writes.jsonl` and
> `api-models.lock` as a digest ledger**, under the rule those two already
> state and for the same reason: each row is a sha256 over the whole
> `approved-plan.json` as one write left it, that file carries `approved_at`
> and each amendment's `recorded_at`, and it is compared in full beside the
> ledger. Measured rather than assumed — two routers writing the same plan
> produce an identical `approved-plan.json` and differ on exactly the two
> ledger rows whose digests cover a timestamp.
>
> **What is NOT reduced is the plan's own `plan_hash`.** It is bound over
> the core fields, which deliberately exclude every timestamp, so it is
> compared exactly — and it is the strongest single check in the corpus that
> both routers canonicalize JSON identically, because it is a digest over
> `sort_keys=True, separators=(",", ":")` output.
>
> **Say precisely what this case proves, because it is narrower than it
> looks.** Both copies' `approved-plan.json` and `step-execution.jsonl` are
> written by **Python**, and the compared verb is a read. So the case proves
> the two **readers** agree — which is the whole of what a CLI-level case
> can prove for a module with no CLI. The TypeScript **writer** is gated
> separately, by a differential test in the router suite ("the plan
> artifact, against the reference implementation"): it drives both writers
> over one input, compares the bytes, and hands the TypeScript output to
> Python's own `read_plan`, which recomputes both hashes and refuses on
> either mismatch. That test was falsified before it was trusted — flipping
> `sortKeys` to `false` in `coreBytes` turns it red.
>
> **`step-execution.jsonl` has no such differential test and its writer is
> unproven across routers.** `ledger.appendStepEvent` was ported in session
> 26 and is exercised by that session's suite on the TypeScript side alone.
> The **agency record** has neither, and cannot: it is not a file but the
> `agency` member of a round row (`ai_router/verify.py:773`, shaped by
> `rounds.schema.json`), so nothing can produce one until `verify` lands in
> session 33. Both are owed there, alongside the round cases that session
> already carries.

## The files compared

After both runs, the control walks the **union** of paths under each copy
that the router is allowed to write, and compares each path byte-for-byte
after the two normalizations below. A path present in one copy and absent
from the other is drift.

Compared:

- `docs/sessions/`: `sessions.json`, `activity-log.json`,
  `decisions-log.md`, `project-work-plan.md`, `change-log.md`.
- `.dabbler/runs/`: `state-writes.jsonl`, `test-runs.jsonl`,
  `deterministic-facts.jsonl`, and under `s<N>/`: `rounds.jsonl`,
  `disputes.jsonl`, `round-<R>-verifier-output.md`,
  `baseline-reanchors.jsonl`, `step-execution.jsonl`, `audits.jsonl`,
  `packaging.jsonl`, `approved-plan.json`, `approved-plan-writes.jsonl`,
  `plan-review.jsonl`.
- `copilot-catalog.lock`, and `.dabbler/api-models.lock` (added in session
  28, the one path under `.dabbler/` outside `runs/` that a router writes).
- `docs/modules.yaml` (added in session 31, the one compared path a person
  edits by hand as well; see that session's amendment for the two YAML
  emitter differences it does not cover).
- What `bootstrap` writes: the `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`
  fence, the pre-commit hook, `.gitignore`.
- The six-step workflow's `events.jsonl` and `projection.json` (from
  session 35).
- **The round anchors**: for every `refs/dabbler/rounds/s<N>/r<R>` the
  control compares the **tree** the anchored commit points at, and requires
  it to equal the row's `completion_tree` on both sides. The commit id
  itself is not compared (see normalization 1).
- **Every verb's exit code.** A verb that refuses on one side and succeeds
  on the other is drift even when no file differs.
- **The stdout and the stderr of every invocation**, after the same two
  normalizations. Not a list of which verbs' output counts: everything a
  verb emits is compared, on every verb.

  > **Amended in session 23**, taking D137's carried nit. The design named
  > read-only verbs' stdout (`progress`, the `ledger` reads, `session close
  > --dry-run`, `packaging --dry-run`, `affected`, `seat_cost`) and the
  > stderr of selected refusals. A verifier observed in session 22 that
  > "compare everything a verb emits" is both simpler and stricter than a
  > list — and a list is a thing to forget to add to. It is the rule as
  > built. The reasoning behind the old list still holds and is why the
  > rule matters: for a read-only verb the output *is* the record, and a
  > refusal's wording is what the operator reads.

Excluded, and why:

- `router-metrics.jsonl` — gitignored per-call telemetry carrying elapsed
  seconds; it is not the record. Nor is the corpus's canned
  `.dabbler/parity-metrics.jsonl`, which is an **input**: the allow-list
  covers `.dabbler/runs/` and nothing else under `.dabbler/`, so both copies
  are handed the same rows and what is compared is what each router makes of
  them, on stdout.
- `.lifecycle.lock`, `journal.lock` — transient.
- The run core's `journal.jsonl`, `heartbeat.json`, `run-projection.json` —
  retired, never ported (D88, decided in session 22).

## The two normalizations — and no third

Both outputs pass through the same two rewrites before comparison. They are
defined by the **shape of a value**, not by a list of field names, so a new
field cannot silently escape them.

1. **Timestamps.** Any ISO-8601 date or date-time string (with or without
   offset or microseconds) is replaced by `<ts>`. This covers `startedAt`,
   `recordedAt`, `dateTime`, `decidedOn`, the date in a decision heading,
   and the git dates inside an anchor commit — which is why anchor commits
   are compared by tree and not by id.
2. **Absolute paths.** Each copy's root directory, in both native and
   forward-slash spellings, is replaced by `<root>`. Repo-relative paths are
   left alone; they must match exactly.

Anything else that differs is drift, including key order in JSON,
whitespace, trailing newlines, float formatting, list order, and the
ordinal of a decision. That strictness is the point: the record is what a
reader diffs across sessions, and two routers that serialize the same facts
differently would make every future diff lie.

> **Amended in session 23, found by running it.** There is a place
> normalization 1 cannot reach as text: a **digest over content that
> carries a timestamp**. `.dabbler/runs/state-writes.jsonl` is one row per
> sanctioned write of `sessions.json`, each row the sha256 of that file's
> bytes — and `sessions.json` carries `startedAt`, so two runs can never
> agree on the digest even though the file it covers compares equal a
> directory away. The first self-check of the `in-flight` shape failed on
> exactly this. Such a ledger is therefore compared by **row count and row
> shape**: its `sha256:<hex>` values become `sha256:<digest>`, and what is
> proved is how many sanctioned writes happened and in what order, which is
> everything the ledger says that its payload does not.
>
> This is normalization 1 reaching a value it cannot reach as text — the
> same concession already made for a git commit id, compared by tree
> because a commit differs only through its dates. It is **not** a third
> rule and is not licence for one: a digest over content with no timestamp
> in it — every tree hash in the record, `completion_tree` included — is
> compared exactly, and a new digest ledger has to name itself here.

> **Naming itself, session 28: `.dabbler/api-models.lock`.** Its
> `[meta].content_digest` covers the record's own rendered text, and that
> text carries `written_at` plus a `last_error_at` per vendor that failed —
> so two runs a second apart can never agree on the digest while every line
> it covers compares equal two lines above it. Its `sha256:` value is
> therefore reduced the same way `state-writes.jsonl`'s is. It is the second
> and last such value in the record today; the seat catalog's digest will be
> the third when session 30 gives it a writer.

## Output and exit codes

- `0` — every compared path identical after normalization; a one-line
  summary names the shapes, verbs and path count.
- `1` — drift; stdout carries a unified diff of every differing path (after
  normalization), the shape and verb that produced it, and nothing else.
- `2` — the control could not run (a router missing, a builder failure);
  `facts` records `unknown`, never `pass`.

## Sequencing rules

- **Port order is the control's growth order.** A verb enters when its
  module is ported; nothing is compared before its TypeScript side exists,
  and nothing is dropped once it has entered.
- **The one legitimate break.** Session 36 adds `frameworkVersion` to
  session and round rows — the set's single record change. The control is
  run and recorded once more *before* that change and the Python deletion,
  and retired in the same step; it is never made to pass across the stamp.
- **A behaviour change is not a fix.** If the control fails and the honest
  repair is to change the Python side, that is a redesign, which this set
  forbids; the TypeScript side is the one that moves. The one exception is
  a Python defect found by the port, which is recorded as a decision and
  fixed on the Python side first, in its own commit, so the parity run that
  follows compares two routers with the same intended behaviour.
