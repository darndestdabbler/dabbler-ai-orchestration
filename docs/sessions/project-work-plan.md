# Project work plan — sessions

**Written by `ai_router.writers` as a fold of `activity-log.json`.**
Hand edits are overwritten by the next append. The record is the log;
this page is one view of it.

---

## The plan

Build the session framework specified in `docs/session-framework-spec.md`,
in the order set by `docs/session-framework-plan.md`, as seventeen numbered
sessions — each one developed, tested, cross-provider verified and closed
under the existing router machinery.

**Milestone A — a session runs end to end** (sessions 3–9): the credential
allowlist, record authority, these two files, the verifier's limited agency
surface, selection by role, and model discovery.

**Milestone B — the loops** (sessions 10–12): the code review loop, the
verifier authoring tests the framework runs, and the full suite with its
bounded fix loop.

**Milestone C — packaging** (session 13): pack and push to the feed, gated
on the releasability each session declares below.

**Milestone D — the extension** (sessions 14–17): collapse session sets,
then the sessions view, project setup, and the unresolved-session view.

The ordering change to know about: the plan puts "collapse session sets" at
A3; this set runs it at session 14, because A3 removes the machinery this
sequence runs on and collapsing it early would strand every session after
it.

## Sessions

| # | Session | Releasable | Declared |
| ---: | --- | --- | --- |
| 1 | Verify the design before anything is built | — | not declared |
| 2 | Verify this breakdown against that design | — | not declared |
| 3 | The credential allowlist (plan A1) | — | not declared |
| 4 | Record authority (plan A2) | — | not declared |
| 5 | The two files, framework-written (plan A4) | no | 2026-08-27 |
| 6 | The verifier's read surface (plan A5, first half) | no | 2026-08-27 |
| 7 | The test-write path (plan A5, second half) | no | 2026-08-27 |
| 8 | Selection by role, and the death of the tier ladder (plan A6) | no | 2026-08-27 |
| 9 | Model discovery (plan A7) | yes | 2026-08-27 |
| 10 | The code review loop (plan B1) | no | 2026-08-27 |
| 11 | The verifier authors tests, the framework runs them (plan B2) | no | 2026-08-27 |
| 12 | The full suite and its bounded fix loop (plan B3) | no | 2026-08-27 |
| 13 | Packaging to the feed (plan C) | no | 2026-08-27 |
| 14 | Collapse session sets (plan A3) | no | 2026-08-27 |
| 15 | The sessions view (plan D1) | no | 2026-08-28 |
| 16 | The task level (plan D1, second half) | no | 2026-08-28 |
| 17 | The tracked project config (precondition for D2) | no | 2026-08-28 |
| 18 | Project setup as two sessions (plan D2) | no | 2026-08-28 |
| 19 | The unresolved-session view (plan D3) | no | 2026-08-28 |
| 20 | A round baseline that survives the trip (root cause of D98) | no | 2026-08-28 |
| 21 | Close out set 148 on the record, and make the loop tests cheap | no | 2026-08-28 |
| 22 | Decide the inventory before anything is translated | no | 2026-08-28 |
| 23 | Contracts — types from schemas, the Router interface, and the controls | no | 2026-08-28 |
| 24 | The extension talks to the interface, and Python answers | no | 2026-08-28 |
| 25 | Foundation modules | no | 2026-08-28 |
| 26 | The record — journal, ledger, writers | no | 2026-08-28 |
| 27 | Evidence, checks, test evidence, affected | no | 2026-08-28 |
| 28 | Transports I — API, offline, routing, selection, discovery | no | 2026-08-28 |
| 29 | One vocabulary for a failure, one stamp for a measurement | no | 2026-08-29 |
| 30 | Transport II — the Copilot CLI state machine and seat cost | no | 2026-08-29 |
| 31 | The session lifecycle | no | 2026-08-29 |
| 32 | Verification support — agency, verifyjob, the approved plan | no | 2026-08-29 |
| 33 | The verification loop | — | not declared |
| 34 | Bootstrap, packaging, and the `dabbler` command on the PATH | — | not declared |
| 35 | The six-step workflow ported, the run core retired | — | not declared |
| 36 | Cutover — the extension calls in-process, and Python leaves | — | not declared |

### Session 5 — The two files, framework-written (plan A4)

**Releasable: no.**

Make `project-work-plan.md` and `decisions-log.md` framework-written (plan
A4): sanctioned writers in `writers.py`, a fixed shape, and a `session`
CLI seam so a model supplies content and never structure, filename,
ordering, identity or time.

Build the §3.a task list beside the numbered session list — each session
declaring what it will do and whether it produces a releasable artifact —
because session 13 gates packaging on a declaration nothing wrote.

Backfill this set's own decisions log through the new writer, from the
hand-kept records of sessions 1 through 4.

### Session 6 — The verifier's read surface (plan A5, first half)

**Releasable: no.**

Build the read half of the verifier's agency surface on the Copilot path: list
files by pattern, search file contents by pattern, and read a file's contents.

Scope the surface to the session's changed files and their declared
dependencies, never the whole repository. Budget a fixed number of reads per
round. Log every list, search and read into the round record.

Enforce read fidelity per spec section 4.a: either the verifier reads the bytes
on disk, or the round records that a transform was applied. The secret-scrubbing
layer rewrites credential-shaped text, so a scrubbed read must be marked as
transformed rather than presented as the file. Do not weaken the scrubber.

Stamp a direct-API round as `agency: none`, so a round that could not look is
never reported as equivalent to one that could.

This session builds framework internals and publishes no package.

### Session 7 — The test-write path (plan A5, second half)

**Releasable: no.**

Build the fourth operation of the verifier's agency surface: create or modify a test file. The verifier proposes a test-file write in its response; the framework applies it. The model never touches the filesystem, and it holds no write tool on either transport. Writes are confined to the test root this repository declares under testing.selection -- a proposal naming a path outside it, or a path that is not a test filename, or a round that granted no write at all, is refused by the framework rather than discouraged by the prompt. Every proposal lands on the round's agency record with its outcome and, when refused, the reason. The write grant is off in a code-review round; the tests loop of spec section 3.c.ii turns it on.

### Session 8 — Selection by role, and the death of the tier ladder (plan A6)

**Releasable: no.**

Selection by role, and the death of the tier ladder (plan A6).

One change, not two: rates are the current sort key for candidate ordering, so
pricing cannot be removed until the declared preference order replaces it.

1. Lift `roles` out of `transports.copilot-cli` to a top-level `roles:` block and
   give both transports one role resolver. The direct-API path resolves the
   `verifier` role against the model record instead of walking tiers, keeping its
   existing reachability (provider enabled, API key resolves) and exclusion
   filters.
2. Make the preference order ordering-only on both paths: a model absent from
   `prefer` still qualifies and merely sorts after the named ones, unconditionally
   rather than only when an exclusion is active.
3. Assert `verifier.provider != author.provider` at dispatch, immediately before
   the call, not only as a selection filter.
4. Delete `pick_model`, `next_escalation_model`, `estimate_complexity`,
   `pricing.py`'s cost arithmetic, and the load-time rate check.
5. Delete the shipped pricing surfaces: per-token rate fields and `confirmed_on`
   on the model records in `router-config.yaml`, the schema keys that admit them,
   and dollar-denominated reporting in `metrics.py` and `route.py`.
6. Ship the seat as the default transport: `transport.profile: copilot-cli`, and
   follow the change through the staff-facing documentation. Precedence is
   unchanged — flag, then env, then profile — so the direct-API path stays
   reachable and merely stops being the default.
7. Affected tests as preverify; cross-provider verification; full suite as the
   `final-full` run of record; close through the gate.

Net deletion. Est. 12 Python tests, with more deleted than added.

### Session 9 — Model discovery (plan A7)

**Releasable: yes.**

# Session 9 of 148 — Model discovery (plan A7)

Build the direct-API half of §5.b/§5.c: enumeration, one staleness check over
both records, and the drift diff. The seat keeps its probe-based refresh
because a probe costs premium requests; enumeration bills no tokens.

1. **Extract the lockfile primitives.** Move the restricted-TOML renderer,
   the writer stamp, the content digest and the provenance verdict out of
   `transports/copilot.py` into `ai_router/lockfile.py`. One implementation,
   so the API record cannot drift from the seat catalog in how it is written
   or how a hand edit is detected. `copilot.py` gets smaller; the seat
   lockfile must round-trip byte for byte and keep its recorded digest.

2. **Enumerate each vendor's models endpoint** (`ai_router/discovery.py`):
   Anthropic `GET /v1/models`, OpenAI `GET /v1/models`, Google
   `GET /v1beta/models`, each paginated to exhaustion and each carrying the
   key in a header, never a query string. A metadata request bills no
   tokens, which is why the default cadence is 24 hours.

3. **Write the record through the sanctioned writer, dated.**
   `ai_router/api-models.lock` — `[meta]` plus `[[models]]`, the same shape
   the seat catalog uses, stamped and digested. One record per key set.

4. **A field a vendor stops reporting degrades to unknown, never to
   unsupported.** An absent field is written by omission; a merge never lets
   a fresh unknown overwrite a known value; a provider whose enumeration
   failed keeps its prior entries and records the failure beside them.
   Capability metadata never filters a candidate.

5. **One staleness check reading both records.** Age of the API record
   against `discovery.max_age_hours` (24) and of the seat catalog against
   `discovery.seat_max_age_hours`; both warn, both name the exact invocation
   that resolves them, neither blocks. Surfaced by `session start`.

6. **Refresh never happens inside a session.** `discovery enumerate` refuses
   while any session set has a session in flight — a session that changes
   its own verifier pool has edited the conditions of its own review.

7. **The drift diff (§5.c).** Models in a record and named in no role;
   models named in a role and absent from both records; the age of each
   record against its threshold. Reported, never closed silently.

8. Config and schema: a `discovery` block naming the record and the two
   thresholds.

9. Affected tests as preverify, cross-provider verification, the full suite
   as the run of record, close-out.

**Releasable:** yes. This is framework code with no operator-specific data
in it; the record it writes is seat/key-set local and is regenerated, not
shipped.

### Session 10 — The code review loop (plan B1)

**Releasable: no.**

Bound the code review loop (plan B1).

`workflow review` has no round cap today, so an unattended run keeps calling
two vendors for as long as it is invoked. This session gives that loop the
same bound the session verifier already has, and the same three terminal
states — reusing what session 3 built rather than inventing a fourth.

1. Count review rounds per target per step, folded from the event log, and
   reset the count when work enters a step or is sent back to one.
2. Refuse to open a round past the configured cap (`verification.settings.
   max_rounds`, 3). One implementation of the rule, in one place: no second
   cap constant.
3. Stop early when only Minor findings remain — `classify_blocking` already
   decides that, so the loop reads its answer instead of re-deriving it.
4. Reach exactly one of the three terminal states of spec §3.c.i, derived
   from the folded log rather than written by a caller: verified;
   unresolved; remediated at the cap. The remediation test is the one
   `verdict.unremediated_findings` already applies — a blocking finding is
   shown remediated when the artifact it cited changed since the round that
   raised it, which means the `reviewed` event must record what each
   artifact's content was at review time.
5. No terminal state waits for a person and none can be typed by one: the
   state is computed, no event asserts it, and the developer approval on the
   solution driver's two approval steps neither produces one nor holds one
   back.
6. Surface the round count and the terminal state in `workflow status` and
   in the projection the extension renders — Python decides, TypeScript
   renders.

Not in scope: the session verifier's loop (already capped since session 3),
the tests loop (B2, session 11), the full-suite fix loop (B3, session 12),
and the solution driver's developer approval steps, which belong to the
decomposition product rather than to this framework's session lifecycle.

### Session 11 — The verifier authors tests, the framework runs them (plan B2)

**Releasable: no.**

Build the tests phase of spec 3.c.ii: the verifier authors test files through the session 7 write path with the write grant on, the framework runs them through checks.execute and reports the exit code, and a bounded test-fix loop (cap 7) carries its round count into the terminal outcome.

### Session 12 — The full suite and its bounded fix loop (plan B3)

**Releasable: no.**

Build spec §3.d (plan B3): the complete suite runs against the tree that
includes the verifier's authored tests, and a red run opens a bounded fix
loop whose scope is enforced by the framework rather than requested by the
prompt.

The envelope is the feature. A fix round is handed only the failing test
names, their output, and the files the failures implicate; its writes are
confined to the session's own diff plus those implicated files, decided
through the existing `changed_paths_between` machinery; a write outside
that envelope is refused before any bytes are written. No finding is
solicited during a fix round — an unrelated observation is recorded and
never acted on.

The loop carries the same bound and the same three terminal states as the
tests phase, so a suite that never goes green ends by itself.

Not releasable: this session builds framework code and publishes no
package.

### Session 13 — Packaging to the feed (plan C)

**Releasable: no.**

Build lifecycle step (f) — packaging — as `ai_router/packaging.py`, a
`packaging:` configuration block with its schema, a machine-written packaging
record, and the CLI that runs it.

1. **`pack`, then `push`.** The declaration names both. `pack` runs once;
   `push` runs once per artifact it produced.
2. **Releasability is read, never decided here.** It comes from the task list
   declared at step (a) through `writers.session_is_releasable`, which fails
   closed — a session that never declared cannot publish.
3. **The order is proved by the evidence the close gates already read.** No
   second opinion about whether verification, the run of record, the clean
   tree and the push happened; packaging asks the same predicates, because a
   gate guarding a gate is how two answers to one question get written.
4. **The PAT is in no environment at all.** It resolves through
   `secret_resolver` by declared name and is substituted into a single argv
   element at spawn. Both processes are given `checks.child_env()`, so nothing
   in the parent environment is inherited either. The recorded command keeps
   the placeholder, and captured output is scrubbed of the value. A push
   declaration that names no secret is refused at load: ambient credentials
   would make the guarantee unprovable.
5. **`pack` writes to a fresh per-run directory** under the session's run dir,
   so the artifact set is by construction the product of this run and no stale
   build can be published by accident. It also keeps `pack` from dirtying the
   tree that was just verified.
6. **The record is machine-written** to `.dabbler/runs/<set>/s<N>/packaging.json`
   and schema-validated on read, like every other record under that root.
7. **The shipped `router-config.yaml` declares no packaging block.** This
   repository publishes to no feed, and a repository that declares none
   publishes nothing. The schema carries the shape; the config carries the
   reason it is absent, as `testing.controls` already does.

**Not releasable.** This session builds the publish path; it does not publish.
There is no feed declared for this repository, and declaring itself releasable
to exercise its own new code would be the hindsight §3.a exists to prevent.

### Session 14 — Collapse session sets (plan A3)

**Releasable: no.**

# Session 14 — Collapse session sets (plan A3)

Sessions are numbered directly in a repository. The set level is removed from
the CLI and from the state files, and this set's own state is migrated forward
so sessions 15 through 17 register, verify and close under what this session
builds.

1. **One sessions root per repository.** `docs/sessions/` replaces
   `docs/session-sets/<NNN-slug>/`. Set resolution (a bare set number resolved
   against a scan root, `SetNotFoundError`, `SetCollisionError`,
   `SESSION_SETS_DIRNAME`) is deleted, not renamed.

2. **The state files lose the set.** Schema v5 `sessions.json` carries the
   numbered session list with no `sessionSetName` and no set-level status —
   a repository has sessions, not sets of sessions. `activity-log.json`,
   `decisions-log.md`, `project-work-plan.md`, `change-log.md` and the session
   plan source move up to the sessions root.

3. **`--session-set-dir` is removed from every CLI** — `session`, `verify`,
   `affected`, `test_evidence`, `packaging`, `metrics`, `facts`,
   `approved_plan`, `plan_review`, `progress`, `bootstrap`. Nothing addresses
   a set, because there is no set to address. `cancel` and `restore` act on a
   session number.

4. **The run ledger loses the set component.** `.dabbler/runs/<set>/s<N>/`
   becomes `.dabbler/runs/s<N>/`, and the migration moves the existing rounds
   rather than abandoning them — the ledger is machine-written on both sides
   of the move.

5. **Migration, applied to this set.** `session migrate` folds a legacy set
   directory forward into the sessions root. It is run against
   `docs/session-sets/148-the-session-framework` in this session, and the
   proof is that this session's own verification, full suite and close run on
   the migrated record.

6. **The extension stops passing a flag that no longer exists.** The
   invocation layer is updated here. The sessions view itself — the tree
   model, the row actions, the two-inline-actions rule and the operator's
   four status icons — is session 15's work, and splitting the view across
   two sessions would leave it half-collapsed in between.

7. **Delete more tests than are added.** The set-resolution and set-level
   status tests go with the concept they cover; what is added covers the
   collapsed resolution and the migration.

**Not releasable.** This session publishes no package; it changes the shape of
the record that packaging reads.

### Session 15 — The sessions view (plan D1)

**Releasable: no.**

Session 15 — the sessions view (plan D1, first half).

1. Collapse the Work Explorer's set level. The tree becomes status
   buckets over the repository's own numbered sessions; the module
   grouping and every set-shaped row, descriptor, action and scan path
   go with it. Deletion, not construction.
2. Point the view's data layer at the repository-level projection that
   session 14 shipped -- `python -m ai_router.progress --json` now emits
   `{repository, sessions}` and takes no set handle. TypeScript renders;
   Python decides, and nothing is re-derived from a state file in TS.
3. Keep the operator's status icons exactly as they are: the same four
   filenames, resolved by name through the shared icon map out of
   media/light/ and media/dark/, passed to TreeItem.iconPath as a
   {light, dark} pair. No `fill:currentColor` consolidation.
4. Preserve the surviving row actions and the at-most-two-inline-actions
   rule, asserted by the menu-registry test as it is today.
5. Label a session row with a three-digit zero-padded number. One
   formatter owns the padding, and the padding is presentation only:
   the plan headings, sessions.json, the run ledger and every --session
   argument keep the plain integer.
6. Heal a stale stored title. A re-cut plan leaves moved not-started
   sessions carrying the titles that used to sit at their numbers --
   sessions 16 and 17 are in that state now. A not-started session with
   no history has no title worth preserving against the plan's.

Out of scope, and named so no round reopens them: the task level below
the session and the execution-record watcher (session 16), project
setup (session 18), and the unresolved-session view (session 19).

Not releasable. This session publishes no package; it changes the
extension's tree and the projection's title healing only.

### Session 16 — The task level (plan D1, second half)

**Releasable: no.**

Build the task level below the session in the VS Code sessions tree: rows read from approved-plan.json (step_id, intent) with execution state folded from .dabbler/runs/s<N>/step-execution.jsonl via ledger.read_step_events / open_step / closed_step_ids; never from activity-log.json. One open step at most, rendered not recomputed. An unreadable execution record refuses rather than falling back to the last good row. The file watcher covers .dabbler/runs/*/step-execution.jsonl so a step opening or closing refreshes the row on the event rather than on a 30-second poll.

### Session 17 — The tracked project config (precondition for D2)

**Releasable: no.**

# Session 17 — The tracked project config (precondition for D2)

Give a repository a tracked place to declare the facts CI and the next machine
must agree on, and stop the gitignored overlay from being able to rewrite them.

## 1. A third config source, tracked: `dabbler.yaml`

- New `ai_router/schemas/dabbler.schema.json`: `schema_version` (required),
  `testing`, `packaging`, `paths`, `additionalProperties: false`.
- `config.py` resolves three sources instead of two. Precedence: packaged
  `router-config.yaml`, then the repository's `dabbler.yaml`, then
  `local-overrides.yaml`. Providers, models, roles and transports stay in the
  package: those are distribution facts.
- An explicitly-named config (argument or `AI_ROUTER_CONFIG`) still takes
  neither layer. A named config is the whole answer, and that rule now covers
  the tracked file for the same reason it covered the overlay.

## 2. The overlay stops being able to say anything it likes

- The overlay gets its own schema: the router-config schema with the
  repository-owned blocks removed.
- A top-level key the repository owns (`testing`, `packaging`, `paths`) is
  refused by name in `local-overrides.yaml`, with the refusal saying where it
  belongs. A gitignored machine file must not be able to replace a suite
  command or a packaging feed under the run of record's name.

## 3. `paths`, and the one repository fact filed in the wrong block

- `run_policy.sensitive_paths` becomes `paths.sensitive_paths`. Which paths of
  a repository are sensitive is a fact about that repository, not about the
  machine running it, and while it sat in `run_policy` the overlay could
  silently empty it. `runcore.py` reads the new location; `run_policy` gets
  smaller.

## 4. Suites become plural in fact, not only in the schema

- `test_roots` and `test_glob` move from `testing.selection` onto each suite,
  because a repository that is Java and .NET at once has two of each.
- `SelectionConfig` carries `scopes` — one `(suite, roots, glob)` per suite.
  `names_a_test` matches any scope. `testing.selection.test_roots` and
  `.test_glob` leave the vocabulary, so a stale declaration is refused rather
  than read as a second source.
- `AgencyGrant` carries the same scopes in place of one root list and one
  glob; `testphase`, `verify` and `fixloop` pass them through.
- `SUITE_FIELDS` is declared once and shared, so `test_evidence`'s suite
  parser and `checks`'s cannot disagree about what a suite may say.

## 5. One selection loader, not two

`affected.py` and `checks.py` each carry a byte-identical copy of the
selection declaration block (`SelectionConfig`, `load_selection_config`,
`select_tests`). `checks.py` keeps it; `affected.py` imports and re-exports.
Changing the shape of a declaration twice, in two copies, is how they drift.

## 6. This repository migrates its own `testing` block

`testing` moves out of `ai_router/router-config.yaml` package data and into a
tracked `dabbler.yaml` at the repository root — suites, controls and the two
hundred lines of selection rules. A rule set that has only ever been read from
the package it ships in has never proven it can be read from a repository.
The selection rules gain a `dabbler.yaml` entry of their own.

## 7. Tests

Around 12–14 Python tests: the three-source precedence and its ordering, the
overlay's refusal of each repository-owned key, a `dabbler.yaml` that fails
its schema, `paths.sensitive_paths` firing the escalation trigger, per-suite
scopes selecting across two ecosystems, and a stale
`testing.selection.test_roots` being refused.

## Releasable

Not releasable. This is a configuration-surface change with no artifact to
publish; the package version is unchanged.

### Session 18 — Project setup as two sessions (plan D2)

**Releasable: no.**

Make project setup — the framework's own sessions 1 and 2 — available to a
repository that is not this one, and runnable end to end without anything
waiting on a person.

1. A bootstrapped repository projects its two setup sessions before the
   router has ever written to it. `build_projection` reads the session plan
   when there is no ledger and renders those sessions as not-started, so the
   plan is the declaration of what exists and the ledger stays unwritten.
2. The scaffold carries a tracked `dabbler.yaml`, so the first real session
   in a new project can declare its suites and reach step 4 of its own
   lifecycle instead of being refused by `test_evidence` and guessed at by
   `affected`.
3. The on-ramp says what it costs: bootstrap's own scaffold must be
   committed before session 1 declares, and bootstrap says so rather than
   leaving the first `declare` to refuse.
4. The Work Explorer shows that repository — one row, its two setup
   sessions, the start-the-next-session affordances — and is honest that
   nothing has run there yet. Neither setup session is an approval gate and
   no row offers one.

### Session 19 — The unresolved-session view (plan D3)

**Releasable: no.**

Build the unresolved-session view: a session that stopped at the cap is
read at planning time, from the record, in the Work Explorer.

1. The projection folds each session's rounds ledger into one verification
   summary -- what stopped, at which round, the findings with vendor and
   severity, what the verifier looked at, whether the round had agency at
   all, whether any read it relied on was transformed, and which of the
   three terminal states it reached. Python decides; the extension renders
   it and re-derives nothing from the ledger.
2. The Work Explorer renders that summary under the session row, with the
   findings as rows, and refuses rather than guesses when the rounds ledger
   is unreadable. The watcher and the projection cache cover rounds.jsonl,
   so the view moves on the event rather than on the poll.
3. Three actions on such a session: send it back (a copied prompt that
   hands the record back to an engine), respecify it (the plan opened at
   the session's own block), cancel it (the existing cancel, passing
   --force only for the unresolved terminal, because an unresolved session
   cannot close). No approve-over action exists anywhere, and nothing holds
   an engine open.

### Session 20 — A round baseline that survives the trip (root cause of D98)

**Releasable: no.**

Make a verification round's baseline portable by construction, so a session
that changes machines resolves its own fix delta instead of recovering onto a
wider one (root cause of D98, left open at D98 and D100, scheduled as this
session by D103).

1. Anchor each snapshot as it is recorded: `ledger.append_round` wraps the
   round's `completion_tree` in a framework-authored commit and points
   `refs/dabbler/rounds/s<N>/r<R>` at it, in the same call that appends the
   row; the row records the anchor commit. The test asserts the anchored
   commit's tree hashes identically to the recorded `completion_tree`.
2. Push the refs, because `git push` will not: the close pushes the session's
   round refs after its bookkeeping push and reports a dropped ref the same
   way it reports a dropped branch. The clone's `remote.<name>.push` also
   carries the round pattern, so the operator's own mid-session push -- the
   push that actually moves a session between machines -- carries them too.
3. Fetch them: `evidence.ensure_round_refspecs` writes the
   `+refs/dabbler/rounds/*:refs/dabbler/rounds/*` fetch refspec (and the push
   pattern) into the clone's remote configuration; `bootstrap` calls it, which
   is how an existing clone is migrated. Acceptance is a two-checkout test:
   record a round in A, push, fetch in B, and resolve the baseline in B
   without `verify reanchor`.
4. Decide the retention rule and record it as a decision: one ref per round
   per session, kept forever; nothing deletes them.
5. `verify reanchor` stays, with its refusals unchanged; `affected`'s
   missing-baseline hint names the fetch before it names the recovery.
6. Affected tests as preverify, cross-provider verification, the full suite
   as the run of record, close-out.

Not releasable: this repository declares no packaging block.

### Session 21 — Close out set 148 on the record, and make the loop tests cheap

**Releasable: no.**

Session 21 of 21: close out set 148 on the record, and make the loop tests cheap.

Three deliverables, nothing else:

1. Record set 148's acceptance evaluation as a decision in the decisions log (decider: orchestrator), in the substance STATUS.md carries it: criterion met, checks 1 and 2 met with their noted splits and exceptions, check 3 (seat cost measured from session 3 onward) NOT MET, with the four measured sessions listed and the operator's 2026-08-28 decision that the figure is not back-filled. The step carries forward into every future session plan; the figure does not.

2. One git seam. Delete the checks.py copies of snapshot_worktree_tree and changed_paths_between; runcli.py, verifyjob.py and workflow.py import them from evidence. Route the remaining direct git spawns in journal.py and ledger.py through evidence.run_git, so one function is the only place the router spawns git. Net negative lines, no behaviour change, no new test.

3. Make the loop tests cheap without faking git. Measure first (pytest --durations, sandbox_repo setup timed separately from the loop). Then: build the seeded repo and bare remote once per session and copytree per test; pin the suite's git environment (GIT_CONFIG_GLOBAL empty, gc.auto=0, core.fsmonitor=false, commit.gpgsign=false, core.autocrlf=false); drop fixture git calls whose result no test reads. Target: no test above 1.5 s and the final-full run of record under 3:00 at -n 2, against session 20's 379 s. If measurement shows the loop's own per-round git calls dominate, stop at the seam and record the number.

Then affected tests as preverify, cross-provider verification, the full suite as the final-full run of record (which is also the step-3 measurement), and close-out with STATUS.md pointing at the decision number and the new suite time.

### Session 22 — Decide the inventory before anything is translated

**Releasable: no.**

Session 22 of 35: decide the inventory before anything is translated.

A prose session, verified the way sessions 1 and 2 were. It writes no code and adds no test. Its deliverables are decisions in the decisions log and one design document:

1. The port inventory as a decision (decider: orchestrator): for each of the 45 Python modules, port, retire, or merge, with its line count and the test file(s) that drive it. The plan's default (run core retired, six-step workflow ported) applies unless a row names a reason to depart.

2. D88 decided on the record: whether the run core's projection replaces the lifecycle's record or the run core is retired. The plan's default is retired, meaning deleted in session 34. The entry says which authority it rests on and until when the operator can override it.

3. The runtime floor verified and recorded: the extension host's process.versions on the installed VS Code 1.135, and whether node:sqlite is present there and on the system Node. Recorded with the package layout decision.

4. The package layout and the dependency ceiling as decisions: packages/router (npm dabbler-ai-router, bin dabbler), the extension depending on it through a workspace, esbuild bundling both into the VSIX; runtime dependencies yaml, ajv, smol-toml and nothing native, a fourth being a decision in the log.

5. The parity-control design, as docs/ts-port-parity-control.md and a decision that names it: the fixture corpus (one repository per lifecycle shape: fresh, in-flight, disputed, at-cap, moved-machine), the verb list it drives, the record files it compares, and the two normalizations it applies (timestamps, absolute paths) and no others.

6. This session's seat cost measured and recorded as a decision, naming the currency measured (Claude Code subscription context for the orchestrator; provider API tokens and dollars for the verification rounds).

Then affected tests as preverify (the selector will report no test affected and nothing is recorded, as session 2's record shows), cross-provider verification, the full suite as the final-full run of record, and close-out with STATUS.md pointing at the new decisions and the landed plan.

### Session 23 — Contracts — types from schemas, the Router interface, and the controls

**Releasable: no.**

# Session 23 of 35 — Contracts: types from schemas, the Router interface, and the controls

1. Create `packages/router` under a root npm workspace (with
   `tools/dabbler-ai-orchestration`); `tsc --strict` and ESLint configured;
   `vitest` as the runner in path-list form for targeted runs.
2. Generate TypeScript types from all twenty schemas under
   `ai_router/schemas/` with one generator; output checked in under
   `packages/router/src/generated/`; a staleness control that fails when the
   checked-in output no longer matches what the generator produces.
3. Define the `Router` interface from the extension's real spawn sites —
   one method per verb (`session.*`, `progress`, `modules`, `verify`,
   `bootstrap`, `workflow`, `ledger`, `test_evidence`, `approved_plan`,
   `affected`) — typed by the generated types, with the CLI's exit-code
   mapping expressed as a typed error.
4. Build the parity control from `docs/ts-port-parity-control.md`: the
   corpus builder, the two normalizations, the comparison, the three exit
   codes; `npm run parity` at the workspace root.
5. Declare the first `testing.controls` in `dabbler.yaml` — `tsc --noEmit`
   (typecheck), ESLint (lint), the parity control (analyzer, required).
6. Declare the second suite `typescript` in `dabbler.yaml` (vitest,
   `test_roots`, `test_glob`) plus the selection rules for the new paths, so
   `affected` selects across both suites.
7. Measure this session's seat cost and record it as a decision.
8. Affected tests as preverify; cross-provider verification; the full run of
   record over both suites; close-out.

### Session 24 — The extension talks to the interface, and Python answers

**Releasable: no.**

Session 24 of 35 — the extension talks to the interface, and Python answers.

Integration before implementation. Every place the extension reaches the
router becomes a call on the `Router` contract that session 23 published,
and the only implementation is `PythonSpawnRouter`, which wraps today's
`runRouterCli` unchanged. Nothing the operator sees changes.

1. Implement `PythonSpawnRouter` over `runRouterCli`, satisfying the
   `Router` interface exported by `dabbler-ai-router`. It owns the argv
   for every verb — one table — and maps the CLI's published exit codes
   (0/3/4/other) onto `RouterResult`. `pythonInterpreter.ts` stays and
   becomes this implementation's private concern rather than the
   extension's.
2. Route the projection poll, the module lifecycle, the session commands
   (cancel/restore, and the pre-typed start/close terminal lines) and the
   troubleshoot command through the seam. The per-verb argv builders in
   `moduleLifecycleCli.ts` and `sessionLifecycleCli.ts` fold into the one
   table; no caller names a Python module any more.
3. Delete `src/types.ts` in favour of the generated types. The projection
   half is the hand-kept mirror the generated `ProgressProjection` now
   replaces; `SessionsRepository`, which is the extension's own tree
   shape and no part of the projection, moves to where it is discovered.
4. Correct the stale router strings the extension still prints:
   `ai_router.report` (no such module since set 109 removed the rate
   table) and the `session_lifecycle` naming in `routerCli.ts` and
   `sessionLifecycleCli.ts`.
5. The mocha suite and Playwright stay green, unchanged in count except
   where a test asserted a spawn that no longer exists as such. No new
   tests; net negative TypeScript lines.
6. Measure this session's seat cost and record it.
7. Affected tests as pre-verification; cross-provider verification; the
   full suite as the run of record; close.

Not releasable: this session publishes nothing. The router package and
the extension both keep their current versions; the cutover to 2.0.0 is
session 35.

### Session 25 — Foundation modules

**Releasable: no.**

Session 25 of 35 — Foundation modules.

Port the leaves of the import graph to TypeScript, and clear the two owed
decisions whose deadline falls on or before this session's work.

1. Register the session; declare this task list as not-releasable.
2. D159 (owed at the start of this session) — reword session 23's step 5 in
   `docs/sessions/session-plan.md` so it describes the control D146 actually
   shipped: declared and required from session 23, running the comparison
   that needs one router; the cross-router comparison joins it in session 26
   with the first ported verb. Documentation only; no step moves.
3. D161 — a passing control must record what it proved. `facts.run_control`
   carries a green control's own summary into the fact's `detail`, so a
   reader of `deterministic-facts.jsonl` can tell a real comparison from a
   vacuous one. Landed here rather than in session 26 because this session
   is the first in which the analyzer control compares anything at all.
4. Port seven modules to `packages/router/src/`, in this order: `config`
   (640), `secret_resolver` (47), `identity` (235), `verdict` (419),
   `lockfile` (158), `runtime_mode` (84), `metrics` (258) — 1,841 Python
   lines. `config` validates against its schema with `ajv`; a routable entry
   carrying no rate still fails load (BREAKING in set 109 and still true).
5. Port each module's test file, one behaviour per test — about 98 vitest
   tests. No falsifier twins, no source-text assertions, no tests of test
   infrastructure. Python tests stay until session 35.
6. Extend the parity control with `config` load and `verdict` parse over the
   fixture corpus, and leave it green.
7. Measure this session's seat cost and record it.
8. Affected tests as pre-verification; record the targeted run.
9. Cross-provider verification to a clean verdict.
10. Full suite — both declared suites — against the final verified tree,
    recorded as the `final-full` run of record.
11. Commit, push once, close through the gate.

### Session 26 — The record — journal, ledger, writers

**Releasable: no.**

Session 26 of 35 — the record: journal, ledger, writers.

1. Land D160 on the Python side first, in its own commit: `test_evidence.surface_digest`
   omits a path it cannot read instead of hashing the literal word "deleted", with a
   test for the deleted-file case. It is a Python defect found by the port, which the
   parity control's sequencing rules require be fixed before the two routers are
   compared, and session 27 ports `test_evidence` — after that it is two fixes in two
   languages plus a parity case for the wrong behaviour.

2. Port the live surface of `journal.py` — `is_machine_state_path`,
   `snapshot_worktree_tree`, `changed_paths_between`, the atomic writes, the run
   directories and `now_iso` — into the existing `src/journal.ts`, which session 25
   opened at the git seam. The run core's journal.jsonl, projection and heartbeat are
   retired (D88) and are not ported.

3. Port `ledger.py`: rounds, disputes, reanchors, step execution, packaging and the
   critique tree. Schema validation on every write, refusal on a hand-shaped row,
   append-only semantics, the quarantine path. `append_round` carries D126's nit
   forward unchanged.

4. Port `writers.py`: the state array, the activity log, the two rendered files
   (`decisions-log.md`, `project-work-plan.md`), the change log, and the declaration
   gate. The lifecycle lock is session 25's `lockfile.ts`.

5. Land the slice of `session.py` those writers are reached through — `start`,
   `declare`, `log`, `decision`, and the session-plan parser they share — as a
   `dabbler session` handler that refuses `close`, `cancel`, `restore` and `migrate`
   by name until session 30. Without it the 1,900 ported lines enter no comparison,
   which is the green-row-over-a-vacuum the control was rebuilt in session 23 to
   refuse.

6. Add the parity cases those verbs make possible: `session start`, `session declare`,
   `session log` and `session decision` over the `fresh` and `in-flight` shapes.
   The `ledger` reads stay out — their shapes (`disputed`, `at-cap`) have no builder
   until the offline transport lands in session 28, and a missing builder stops the
   control at "could not run" rather than at a pass.

7. Measure this session's seat cost and record it.

8. Affected tests as preverify; cross-provider verification; the full suite as the
   `final-full` run of record; close-out.

### Session 27 — Evidence, checks, test evidence, affected

**Releasable: no.**

Session 27 of 35 — Evidence, checks, test evidence, affected.

Port four Python modules of `ai_router` to TypeScript in `packages/router`:
`evidence` (902), `checks` (1,001), `test_evidence` (815), `affected` (575)
— ~3,293 lines, ~72 tests.

1. Grow `src/evidence.ts` (session 26 already put the sessions-root
   filenames, the round anchor, the digest ledger and `resolveSessionsDir`
   there) into the whole of `evidence`: the throwaway-index tree snapshots,
   the covered surface, the run-of-record binding. Snapshot trees must hash
   identically to Python's — the parity control compares `completion_tree`
   values, not just files.
2. Port `checks`: spawn, tree kill (`taskkill /T` on Windows), exit-code
   reading, `shell: true` only for declared shell commands, `.cmd` shim
   resolution by spawning the shim's target for an argv command. Capture the
   Node error for an over-long command line and map it to `argv-too-large`.
   Its Python test file is `test_runcore_checks.py`, which drives `checks`
   rather than the run core; the ported file is named for what it tests.
3. Port `test_evidence` and `affected`. The vitest path-list form satisfies
   the targeted-command audit without D116. D170's fix means `surface_digest`
   is ported once, correctly.
4. Add the parity cases the corpus can already carry: `affected` and
   `test-evidence` both have real Python command lines and are already in the
   corpus builder. Parity green on `test-runs.jsonl` and snapshot trees.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify; cross-provider verification; the full suite
   as the run of record; close through the five gates.

Not releasable: this is a port session inside the rebuild, publishing nothing.

### Session 28 — Transports I — API, offline, routing, selection, discovery

**Releasable: no.**

Session 28 of 35 — Transports I: API, offline, routing, selection, discovery.

Port six Python modules of `ai_router` to TypeScript in `packages/router`:
`transports/base` (49), `transports/offline` (140), `transports/api` (292),
`route` (592), `selection` (146), `discovery` (1,057) — 2,276 lines, 82
tests. Behaviour is not redesigned; Python decides and the port agrees.

1. Register; declare `--not-releasable`.
2. Port in the order listed, the offline transport first, so every later
   session's tests run without a network exactly as today. `fetch` with
   streaming replaces `httpx`; `exclude_providers` is honoured on every
   path including offline (the set-143 defect stays fixed).
3. `discovery` reads and writes `copilot-catalog.lock` and
   `api-models.lock` identically; parity on the lock files.
4. One live `e2e`-marked call per reachable provider as evidence,
   recorded, excluded from the default run.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

Not releasable: this session publishes nothing. Session 35 is the only
releasable session of the port.

### Session 29 — One vocabulary for a failure, one stamp for a measurement

**Releasable: no.**

Session 29 of 36 — One vocabulary for a failure, one stamp for a measurement.

Discharge the two rulings the port left open. Both are the same shape: the
two routers write a different string into a record for the same event,
because the string is the name of whichever library did the work.

1. Register; declare --not-releasable.
2. Land both changes in Python FIRST, in their own commit:
   - `discovery` maps a failed vendor enumeration onto a shared vocabulary
     (`timeout`, `network-error`, `http-error`, `parse-error`,
     `unknown-error`) joining the three terms the field already carries.
     Closed allow-list; the library's own class name is written nowhere.
   - `evidence.run_absence_search` stamps one framework-owned token instead
     of the regex engine and its version.
3. Update the Python tests and run them.
4. Mirror both in the TypeScript router and its vitest tests.
5. Prove the vocabulary in the parity control: a case that reaches a real
   transport failure with no network, or the vocabulary is asserted rather
   than checked.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the final-full run of record.
10. Close-out.

This session also carries the plan renumber that inserted it: the port's
remaining sessions moved up by one (Transport II is now 30, the cutover 36).
Live guidance was updated; the append-only decisions log was not.

Not releasable: this session publishes nothing.

### Session 30 — Transport II — the Copilot CLI state machine and seat cost

**Releasable: no.**

Session 30 of 36 — Transport II: the Copilot CLI state machine and seat cost.

Port `ai_router/transports/copilot.py` (2,074 lines) and `ai_router/seat_cost.py`
(304 lines) to TypeScript under `packages/router`, ~97 ported tests.

1. Port the dispatch state machine: spawn, first-byte and total timeouts, kill,
   the temp-file pull handoff above 24,000 rendered units, the nonce-
   acknowledgement footer, the stderr error taxonomy. Port `list2cmdline` so the
   rendered-argv measurement is the same number on the same input.
2. Resolve `copilot.cmd` to its target and spawn that; never `shell: true`.
   Import `checks.isArgvTooLarge` (D174).
3. Port the seat catalog WRITER, which requires the empirical probe (D186).
4. Port `seat_cost` on `node:sqlite`, readOnly / `mode=ro`; WAL is read,
   `immutable` is not used.
5. Live probe on the seat: one verification prompt over the handoff threshold,
   facts planted head, middle and tail, the ack validated and stripped.
   Recorded as evidence.
6. Measure this session's seat cost through the ported module.
7. Lift `route`'s refusal of the `copilot-cli` branch, which names session 30.

Not releasable: this is a port session; it publishes no package.

### Session 31 — The session lifecycle

**Releasable: no.**

Session 31 of 36 — The session lifecycle.

Port `ai_router/gates.py` (421), `ai_router/session.py` (1,386),
`ai_router/progress.py` (1,050) and `ai_router/modules.py` (246) to
TypeScript under `packages/router/src/`. 3,103 Python lines; est. 138 TS
tests. The largest single session left, and the one that finishes the
record's judgment half.

Order, per the session plan:

1. `gates` first, whole: the five gates (verification clean, working tree
   clean, pushed to remote, test run fresh, verdict vocabulary), the
   `GateResult` row shape, and `run_gates`. Run the parity control on
   `session close --dry-run` for every built corpus shape before anything
   else is ported — a gate that differs by one row is this set's worst
   outcome and this is the cheapest place to see it.
2. `session`'s remaining subcommands: `plan`, `close` (including
   `--dry-run` and `--force`), `cancel`, `restore`, `migrate`. The
   refusals in `cli/session.ts` come out together.
3. `progress` whole: the legacy normalization and v2→v3 synthesis, the
   plan-derived session list, `build_task_rows`, `verification_cap`,
   `build_verification_view`, `build_projection`, and the `progress` /
   `progress --json` command line.
4. `modules`: the manifest reader, `parse_entries`, `create`, and the
   command line — reconciled against the `Router` contract rather than
   inheriting a shape nothing ever ran (D162/D152).
5. `identity.resolveSessionOrchestratorIdentity` lands here as a wrapper
   over `resolveOrchestratorIdentity` (D164) — it reads a repository
   rather than a block, through `progress`, which is why it waited.
6. Parity control green on `sessions.json`, the activity log, the
   decisions log, the project work plan and the projection JSON, plus the
   `close --dry-run`, `cancel`, `restore`, `progress`, `progress --json`
   and `modules` verbs the control's table adds in this session.
7. Measure this session's seat cost and record it.
8. Affected tests as preverify; cross-provider verification; the whole
   suite recorded as the `final-full` run of record; close-out.

No Python behaviour changes. Where the port finds a Python defect it is
recorded as a decision and fixed on the Python side first, in its own
commit, so the control compares two routers with the same intended
behaviour. Not releasable: no package is published from this session.

### Session 32 — Verification support — agency, verifyjob, the approved plan

**Releasable: no.**

Session 32 of 36 — Verification support: agency, verifyjob, the approved plan.

Port four Python modules to TypeScript under `packages/router/src`:

- `agency` (921 lines) — the verifier's read surface and its recorded write
  decisions, including the `--available-tools` restriction on the seat.
- `approved_plan` (590) and `plan_review` (812) — the hashed immutable plan
  and its amendments, the step-execution record. The hash covers every field
  but `amendments`; a step without an evidence contract cannot be written; a
  plan over seven steps cannot be written. The schema refuses, never a
  reviewer.
- `verifyjob` (782) — the verification job contract.

Three things are owed to this session specifically:

1. Register `progress`'s `ApprovedPlanReader` seam (D198). Until it does, a
   repository with an approved plan gets `tasksRefused` where the task rows
   should be.
2. Pair the `approved_plan` parity case with a `progress --json` case on a
   corpus shape that HAS a plan — the only thing that proves both routers
   fold the steps the same way.
3. Address the `VERIFIED` look-alike question (D168): if a boundary is
   wanted it goes into Python first and crosses with a case that feeds a
   look-alike to both routers.

Parity control green on `approved-plan.json`, `step-execution.jsonl`, and
the agency log. Behaviour does not change; TS renders, Python decides.

Not releasable: this session publishes no package.
