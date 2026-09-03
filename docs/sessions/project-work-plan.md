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
| 33 | The verification loop | no | 2026-08-29 |
| 34 | Bootstrap, packaging, and the `dabbler` command on the PATH | no | 2026-08-29 |
| 35 | The six-step workflow ported, the run core retired | no | 2026-08-29 |
| 36 | Cutover — the extension calls in-process, and Python leaves | yes | 2026-08-29 |
| 37 | The extension surveyed against the principles | no | 2026-08-30 |
| 38 | The projection stops withholding the plan | no | 2026-08-30 |
| 39 | Verification stops lying, and an unanswered gap stops the close | no | 2026-08-30 |
| 40 | Task rows — a structured declaration, a framework-owned state machine | no | 2026-08-30 |
| 41 | Setup owns the runway | no | 2026-08-30 |
| 42 | The panes say what they are, and the Solution Explorer lights up | no | 2026-08-30 |
| 43 | Liveness, and one place the operator looks | no | 2026-08-30 |
| 44 | `solution-dependencies.json` — the edge, never the pin | no | 2026-08-30 |
| 45 | Resolution modes, inside the declare-and-check line | no | 2026-08-30 |
| 46 | Packaging declared for the ecosystem it is | no | 2026-08-30 |
| 47 | The Solution Explorer goes cross-repo | no | 2026-08-30 |
| 48 | The generated workspace | no | 2026-08-30 |
| 49 | The thing becomes installable | yes | 2026-08-30 |
| 50 | The field trial, and the exercise reported back | no | 2026-08-30 |
| 51 | What the field trial found, and nothing else | no | 2026-08-30 |
| 52 | The startup experience, walked before it ships | no | 2026-08-30 |
| 53 | The Work Explorer reads at a glance, and session 1 asks | no | 2026-08-31 |
| 54 | The router suite stops taxing the host | no | 2026-08-31 |
| 55 | The task rows move themselves | no | 2026-08-31 |
| 56 | The driver's contract — the schemas and the report verb | no | 2026-08-31 |
| 57 | `dabbler session drive` — the framework runs the session | no | 2026-08-31 |
| 58 | The engine adapter — Claude Code, Copilot, Codex; stream; interrupt | no | 2026-08-31 |
| 59 | Start is the launch, and the developer's guide | no | 2026-08-31 |
| 60 | The engine channel reads at a glance | no | 2026-08-31 |
| 61 | `dabbler session next` — the loop as a verb the engine calls | no | 2026-08-31 |
| 62 | The entry — one sentence in the CLI, and Dabbler's own terminal | no | 2026-08-31 |
| 63 | The escape route — when the framework stops, it asks | no | 2026-08-31 |
| 64 | The operator onboarding deck | no | 2026-08-31 |
| 65 | The half of the trial that needs a published router | no | 2026-09-01 |
| 66 | The publish phase | no | 2026-09-01 |
| 67 | The watcher, and the driver's blind spots | no | 2026-09-01 |
| 68 | The logic tree, harvested and held to the code | no | 2026-09-01 |
| 69 | The round cap stops being typeable, and the Solution Explorer goes multi-repository | no | 2026-09-01 |
| 70 | The half of the trial that needs a published router | no | 2026-09-01 |
| 71 | Green CI, because nothing can be published until it is | no | 2026-09-01 |
| 72 | Green CI, part two — what the first fix did not reach | no | 2026-09-01 |
| 73 | Green CI, part three — the last two, and the tilde | no | 2026-09-02 |
| 74 | The extension is the distribution, and the number is 2.0.0 | no | 2026-09-02 |
| 75 | The trial against what the Marketplace actually serves | — | not declared |
| 76 | Performance patches — reaping, hidden windows, worker priority | no | 2026-09-02 |
| 77 | The git seam — contract band and answered questions | no | 2026-09-02 |
| 78 | Every component becomes a library, or is named as not one | no | 2026-09-02 |
| 79 | Seals, and a master that only moves on green | no | 2026-09-02 |
| 80 | The loop stops living in anyone's attention | no | 2026-09-02 |
| 81 | Publishing without a secret, and the last of the friction | no | 2026-09-02 |
| 82 | The trial, run by the operator against what the Marketplace serves | no | 2026-09-03 |
| 83 | The runner, the gates slice, and the git-states walkthrough | no | 2026-09-03 |
| 84 | The record layer | no | 2026-09-03 |
| 85 | Verification | no | 2026-09-03 |
| 86 | Routing, transports and configuration | no | 2026-09-03 |
| 87 | The lifecycle and the driver | no | 2026-09-03 |
| 88 | Packaging, release, bootstrap, the solution — and vitest retired | — | not declared |
| 89 | The trial, run by the operator against what the Marketplace serves | — | not declared |

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

### Session 33 — The verification loop

**Releasable: no.**

Session 33 of 36 — the verification loop.

Port ai_router/verify.py (2,537 lines, 57 tests) to TypeScript as the
extraction it never got: rounds, bundle, disputes and adjudication,
reanchor, and the loop each become a file, and no file exceeds 800 lines.
Behavior does not change.

1. Port by seam, running the parity corpus after each: round one, the
   fix-delta round, the round cap, the dispute ladder, adjudication,
   reanchor and its refusals, the severity-gated stop.
2. Prompts and templates copied byte-for-byte; the verdict parser and the
   prompt stay pinned by the same round-trip test that pins them today.
3. Build the three unbuilt corpus shapes (disputed, at-cap, moved-machine)
   and cache a built shape across the cases that name it, per D169/D176.
4. Discharge what is owed to this session: verdict's parity case, the
   round-append case and the completion_tree comparison (D163, D177);
   D168's look-alike case; differential writer tests for
   step-execution.jsonl and the agency record; D152's VerifyVerbs option
   names (verify dispute takes --finding).
5. Correct two inaccurate sentences left standing by session 32: the
   agency-comparison claim in docs/ts-port-parity-control.md and the
   interpreter-guard comment in test/verificationSupport.test.ts.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify; cross-provider verification; the full
   suite as the final-full run of record; close out.

Not releasable — this session publishes no package.

### Session 34 — Bootstrap, packaging, and the `dabbler` command on the PATH

**Releasable: no.**

Session 34 of 36 — Bootstrap, packaging, and the `dabbler` command on the PATH.

Port the last two infrastructure modules to TypeScript and make the router
installable without Python.

1. Port `ai_router/bootstrap.py` (1,146 lines) to the TypeScript router.
   The managed `AGENTS.md` fence is regenerated with `dabbler <verb>` in
   place of `python -m ai_router.<module>`; the pre-commit hook references
   the shim rather than an interpreter path. The `.gitignore` rewrite and
   the user-scope `DABBLER_TRANSPORT` persistence are kept exactly — they
   are documented traps, not bugs to fix here.
2. Port `ai_router/packaging.py` (743 lines). The feed credential resolves
   at spawn into one argv element and is placed in no environment, as today.
3. Register both verbs in the verb table and the `dabbler` CLI dispatch.
4. Ship the `dabbler` binary from the router package (`bin`), and have the
   VS Code extension prepend a shim directory to the integrated terminal's
   PATH through `EnvironmentVariableCollection`, running the CLI on the
   extension host's own Node (`ELECTRON_RUN_AS_NODE`).
5. Extend the parity control with the cases these two verbs can reach.
6. Prove zero-install delivery on a scratch repository with no `.venv` and
   no Python on PATH: `dabbler session start` registers a session. Record
   the result as evidence.
7. Measure and record this session's seat cost.

Not releasable: this session ships no package to the feed.

### Session 35 — The six-step workflow ported, the run core retired

**Releasable: no.**

Session 35 of 36 — the six-step workflow ported, the run core retired.

Port to TypeScript, behaviour unchanged (D129's inventory, which supersedes
the session plan's prose on two modules):

- workflow (1,363 lines, test_workflow 55)
- fixloop (563, test_fixloop 18) — workflow imports it; NOT run core
- solution (351, test_solution 16)
- testphase (345, test_testphase 10) — workflow imports it; NOT run core
- stepreview (284, test_stepreview 15)
- contractdoc (196, test_contractdoc 13)

Total 3,102 lines, 127 tests. Parity on the workflow event log and the
Solution Explorer projection.

Delete with their tests, verbs and doc references (D88/D130):

- runcli (1,497), runcore (811), runproject (530) — 2,838 lines
- test_runcore_contracts, _fast, _verified, _recovery, _independence (88)
- the run, report and run-core status verbs; dabbler status reads the
  lifecycle's record

facts is NOT deleted: it is ported and verify depends on it (D210).

Then: measure seat cost, affected tests as preverify, cross-provider
verification, full suite as the run of record, close.

### Session 36 — Cutover — the extension calls in-process, and Python leaves

**Releasable: yes.**

# Session 36 of 36 — Cutover: the extension calls in-process, and Python leaves

Releasable. This is the port's last session; it publishes extension 2.0.0 and
`dabbler-ai-router` 2.0.0.

1. **`InProcessRouter` replaces `PythonSpawnRouter`.** The extension's
   `router/host.ts` returns an implementation that satisfies the `Router`
   contract by calling the ported TypeScript modules directly. Delete
   `pythonSpawnRouter.ts`, `pythonInterpreter.ts`, `installAiRouter.ts`, the
   venv creation in `bootstrapProject.ts`, and the projection's Python poll —
   the tree reads the projection through a function call. `RouterCommands`
   answers null where an in-process router has no line to pre-type, and the
   two operator-driven verbs (`session start`, `session close`) get the UX
   decision `host.ts` says is owed to this session.

2. **`frameworkVersion` on session and round rows.** The set's one record
   change: both schemas bump, both writers stamp it, and the ledger carries
   which framework version produced a row.

3. **The parity control's final run, recorded before anything is deleted.**
   Every verb, every corpus shape, with Python still present. Then
   `ai_router/`, `tests/`, `pyproject.toml`, `pytest.ini`, the Python CI job,
   the `python` suite in `dabbler.yaml`, and the parity control itself are
   deleted — it has nothing left to compare.

4. **One artifact in the docs.** `README.md`, `MIGRATION-FROM-V1.md`,
   `docs/quick-start.md` and the `AGENTS.md` managed fence stop naming two
   routers. The sweep covers strings the router PRINTS, not only the docs the
   plan names: `REFRESH_COMMAND`, `session start`'s next-step hint, the
   selector's recipe, `solution check`'s closing line, `contractdoc`'s
   regenerate line. This repository's own `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`
   are refreshed by re-running `bootstrap` here.

5. **The small settlements this session owns.** `packaging.ts`'s `recordedAt`
   takes Python's microsecond rule (D223); `ledger` and `approved-plan` are
   decided as verbs or dropped from the table; `status`/`progress` is settled.

6. Seat cost measured and recorded; affected tests as preverify;
   cross-provider verification; the full suite as the `final-full` run of
   record; commit, push once, package both artifacts, close via the gate.

**The acceptance test of the whole set:** the TypeScript router verifies,
records and closes this session, with no Python in the tree.

### Session 37 — The extension surveyed against the principles

**Releasable: no.**

Session 37 of 50 — The extension surveyed against the principles.

Walk the whole VS Code extension (24 files, 4,029 lines, 123 tests) against
the operator's eight DX principles of 2026-08-30, and produce a finite
findings table that sessions 41, 42 and 47 implement against.

What this session does:

1. Inventory every contributed command, view, menu, welcome state and
   walkthrough from the extension manifest, and every operator-facing
   string in the source.
2. Evaluate four journeys — open an existing project, create a project,
   watch a session run, navigate to a related repository — in their empty,
   loading, success and error states, against each of the eight principles.
3. Write the survey to docs/extension-dx-survey.md: one row per finding
   with file, principle, severity, reproduction, owning session, and an
   explicit reason for anything deferred.
4. Fix only what needs no design decision:
   - the eight status icons in media/{light,dark}/ declare width/height of
     "16mm" (~60 CSS px) against a 16-unit viewBox, in a 16 px tree row —
     the probable cause of csv-model feedback item 1;
   - two provider file headers still name `python -m ai_router.workflow` as
     the projection's writer, which has been TypeScript since the cutover.
5. Amend the plan for sessions 41, 42 and 47 with what the survey found.

This session is a survey. It does not refactor the extension, and it does
not implement any finding that needs a design decision — those are filed
with an owning session and left.

Not releasable: it publishes nothing.

### Session 38 — The projection stops withholding the plan

**Releasable: no.**

Session 38 of 50 — The projection stops withholding the plan.

`progress.ts` consults `session-plan.md` only when the ledger is absent, so
once `sessions.json` exists the plan is never read again. csv-model closed
session 2 of a nine-session plan and every indicator it has said the project
was finished. The ledger does grow to the plan at the next `session start`,
so the framework is right — but nothing surfaces that, and the reassurance
lives in a source comment.

What this session does:

1. Read the plan's `### Session <N>:` headings on every projection, not only
   when the ledger is missing, using the exact parser `session start`
   already uses. A second heading interpretation would be one rule stated
   twice.
2. Project a session the plan declares and the ledger has not reached as a
   distinct `planned` state — never `not-started`, which already means
   "registered but not begun".
3. Never report a repository complete while its plan declares sessions the
   ledger has not reached.
4. Specify reconciliation rather than assume it: duplicate numbers, gaps,
   renamed headings, a plan shorter than the ledger, and malformed headings
   each get a defined projection, and "which session registers next" is
   derived under those cases rather than assuming a contiguous plan.
5. Have `session close` print what comes next — how many planned sessions
   remain and which registers on the next `session start`.
6. Render `planned` rows in the Work Explorer from the projection alone, so
   the extension gains no new reader.

Tests: one per behaviour, in the router suite, plus the extension's own
rendering test for the new row state.

Not releasable: it publishes nothing.

### Session 39 — Verification stops lying, and an unanswered gap stops the close

**Releasable: no.**

Session 39 of 50 — Verification stops lying, and an unanswered gap stops
the close.

`checkTestRunFresh` returns `[true, ""]` when no declared suite is
`expensive`. csv-model closed session 1 at a clean 5/5 with nothing
runnable, and would close the session that writes its entire model the
same way. Relabelling PASS as SKIP fixes the label and not the defect,
which is what both reviewers of this plan said about the first draft.

What this session does:

1. `checkTestRunFresh` reports SKIP (no suite declared) and never PASS. A
   gate that cannot see its own precondition must not report success.
2. An owed-decision record under the run ledger, machine-written: what is
   missing, which file it belongs in, what the framework determined on its
   own, the options with their consequences, a recommendation with
   confidence, and the default if nobody answers. Stable id, severity, and
   an open/answered/superseded state that survives across sessions.
3. An owed decision in the verification-reduction class refuses the CLOSE.
   Work continues and no engine is held open; the session simply cannot
   record itself verified while the thing that would have verified it is
   undeclared. Every other class proceeds on its stated default with the
   wait recorded.
4. Three named consumers, so this is a mechanism and not a subsystem:
   testing.suites at the first session that writes code, the remote
   question at setup (session 41), and the ours/producer assertion
   (session 44).
5. The operator answers once and the framework writes the file.
6. A `none-selected` evidence outcome, recorded through
   `test-evidence record` and never written by `dabbler affected`, which is
   a query. The row binds to the selector's own invocation so it cannot be
   hand-authored.
7. The malformed-suite message names dabbler.yaml, the file the operator
   edits, rather than router-config.yaml. `--help` is accepted after a
   subcommand on every verb.
8. Declare the extension as a suite in dabbler.yaml (D242, from session
   37): `tools/` is covered by nothing today, so `dabbler affected` selects
   zero tests for an extension-only change and a session closes green
   having run nothing. This must land before session 41, because 41, 42, 43
   and 47 are all extension-heavy.

Not releasable: it publishes nothing.

### Session 40 — Task rows — a structured declaration, a framework-owned state machine

**Releasable: no.**

Session 40 of 50 — Task rows, rendered from the steps that already exist.

**This session amends its own plan, on the record, before doing the work.**
D240 (session 37) found the plan's premise half wrong, and reading both
mechanisms confirms it.

What is actually true:

- `dabbler session start` ALREADY seeds a session's steps. It parses the
  numbered step list under the session's heading in `session-plan.md` and
  writes one `plan-step` row per step into `activity-log.json`, carrying
  `stepNumber`, a stable `stepKey`, the description, and a status from
  `pending | in-progress | complete | blocked`. `dabbler session log --step
  <key> --status <s>` moves them. Every session in this block has been
  ticking those rows.
- `progress.buildTaskRows` folds a DIFFERENT artifact:
  `.dabbler/runs/s<N>/approved-plan.json` against `step-execution.jsonl`.
  Neither is written by anything in the lifecycle, so the fold returns an
  empty list at its first line and no session has ever rendered a task.

Two mechanisms, one purpose, and the tree reads the one nobody writes.

So the plan's step list — give the task file a schema, have `declare` write
an approved plan from it, add a `session step --done` verb — was designed
against the belief that a session's steps did not exist in machine-readable
form. They do, they come from the plan, and they already have a transition
verb that journals. Building a second declaration grammar beside a working
one is precisely what "one implementation of any rule" exists to prevent.

What this session does instead:

1. Amend session 40 in `session-plan.md` on the record, with the evidence.
2. `buildTaskRows` folds the seeded `plan-step` rows: position from
   `stepNumber`, stable id from `stepKey`, intent from the description, and
   state from the status.
3. The framework owns the bookends rather than asking anyone to remember
   them: step 1 opens at `session declare`, and the last step closes when
   the run of record is recorded. The middle transitions stay `session log`,
   which already exists, already refuses an unknown step, and already
   journals — which is the explicit, framework-validated transition both
   reviewers of this block's plan asked for.
4. `approved-plan.json` keeps its own job — the file envelope, the risk
   flags, the hash and the amendment ledger that verification scope reads —
   and stops being the tree's source. It is a public contract surface
   (`Router.approvedPlan`, `planReview`) and is not touched.
5. Task rows render Not Started / In Progress / Done with the operator's
   icons, and the session tooltip's `N/M tasks done` becomes true.

Not releasable: it publishes nothing.

### Session 41 — Setup owns the runway

**Releasable: no.**

Session 41 of 50 — Setup owns the runway.

Both ends of the lifecycle currently finish by handing the operator a
terminal command. `bootstrap` prints "commit what this just wrote" about
files it wrote itself, knowing exactly why session 1 is refused while they
sit uncommitted. The close prints `git push --set-upstream <remote> main`
for a remote that does not exist and that the framework neither created nor
offered to create. csv-model's item 2 is both of those, and principle (e)
is the rule they break: the operator is never asked to run a command the
framework can run.

What this session does:

1. `Dabbler: Set Up New Project` owns the whole runway — it creates the
   folder when VS Code has no suitable one, runs `git init`, and commits
   its own scaffold.
2. The remote question is asked once, at setup, through session 39's
   owed-decision mechanism: attach an existing remote URL, or stay local.
   Hosted remote creation is deferred — authentication, host, organisation,
   name, visibility and collision handling are a provider contract this
   session does not have.
3. "Stay local" becomes durable repository state rather than a per-run
   default, and `pushed_to_remote` reads it instead of printing a command
   that cannot work.
4. A `contributes.walkthroughs` entry and a `file/newFile` contribution:
   as close to File > New > Dabbler Project as the VS Code API allows. The
   native File > New submenu is not extensible, and recording that stops a
   later session rediscovering it.
5. The three findings session 37's survey assigned here:
   - F1, `bootstrapProject.ts`: setup ends with "Open a terminal and run
     `dabbler session start`".
   - F2, `extension.ts`: the first-run offer claims setup creates a .venv
     and installs the router. It has done neither since the cutover, and it
     is the first sentence a new operator reads. A correctness fix, not
     copy.
   - F3, `sessionTerminalCommands.ts`: Start and Close are pre-typed into a
     terminal rather than run. Start carries a decision and the keystroke is
     not it; Close carries no decision at all.

Both suites are declared now, so this session owes a run of record for each.

Not releasable: it publishes nothing.

### Session 42 — The panes say what they are, and the Solution Explorer lights up

**Releasable: no.**

Session 42 of 50 — The panes say what they are, and the Solution Explorer
lights up.

Today a container called "AI Work Explorer" holds a view of the same name
beside one called "Solution Explorer", which reads as a bug. And the
Solution Explorer is empty in every new project with nothing to explain
why: session 37's survey found no `viewsWelcome` on either view, which is
csv-model's item 4.

The RACI marks that row a live defect on the grounds that the projection
has had no writer since the Python deletion. That is not the case --
`writeProjection` is TypeScript and six sites call it. The tree is empty
for three cheaper reasons, and this session addresses all three.

What this session does:

1. The container becomes "AI Orchestration"; the views become "Solution
   Explorer" and "Work Explorer".
2. `viewsWelcome` on both views: a sentence on what the view will show once
   there is something to show, and a button that scaffolds it.
3. `bootstrap` scaffolds a `solution.yaml` for the repository it is setting
   up -- one component, named for the repository -- and writes the first
   projection, so the view has content from the first minute rather than
   after a verb nobody knew to run.
4. The two findings session 37's survey assigned here:
   - F5: neither view has an empty state.
   - F9: a projection failure reaches the operator as `projection failed:
     <raw error>`, which says what broke and never what to do.

Not releasable: it publishes nothing.

### Session 43 — Liveness, and one place the operator looks

**Releasable: no.**

Session 43 of 50 — Liveness, and one place the operator looks.

The operator supervises several projects at once and is away from any one
of them for hours. Nothing today says whether a session is working,
stalled, or waiting. And after sessions 38, 39 and 40 there are three new
things to look at -- planned sessions, owed decisions, task rows -- in
three places, which is not an improvement.

What this session does:

1. The framework stamps `lastActivityAt` on every state write and every
   verification round, and the projection derives `possibly stalled` from
   it against a declared threshold. The agent never writes either: an
   engine that reports its own liveness reports it right up until it
   cannot.
2. The heartbeat proves the process is alive, not that the thinking is
   useful. The row says which and never implies the other.
3. One attention view in the Work Explorer, gathering what is already
   computed: what is in flight and how long since it moved, what it is
   waiting on, owed decisions with their defaults and states, and any
   session that stopped at the round cap. Nothing new is derived.
4. The findings session 37's survey assigned here:
   - F10: `troubleshoot.ts` composes "a line for the operator to run by
     hand" instead of running it and showing the result.
   - F11: a 30-second `setInterval` is the only thing advancing state
     between file events, and nothing says whether a session is alive.
   - F12: there are ZERO `withProgress` call sites. Verification rounds run
     for minutes and the UI is indistinguishable from hung.
   - F13: the extension contributes no configuration at all, so the stall
     threshold has nowhere to live. This session establishes one.

Not releasable: it publishes nothing.

### Session 44 — `solution-dependencies.json` — the edge, never the pin

**Releasable: no.**

Session 44 of 50 — `solution-dependencies.json`: the edge, never the pin.

A `.csproj` saying it needs `Dabbler.Csv.Model >= 1.0.0` is authoritative.
What no build file can say is WHICH REPOSITORY PRODUCES IT. That single
missing fact is this file's entire content, and it is why the
cross-repository record can live distributed -- one edge-set per repository,
in git -- rather than in a superproject nobody has.

What this session does:

1. A tracked, versioned-schema file at each repository root declaring what
   this repository CONSUMES from its own solution: package id, kind, the
   producing repository, and how it resolves. No versions -- the pin lives
   in the .csproj or the POM and is never copied. No `produces` block --
   that is dabbler.yaml's `packaging`, and restating it would fork it.
2. Repository identity settled here: a stable id plus an optional remote URL
   and an optional relative checkout path, with defined behaviour when a
   sibling is absent, moved, offline, or cloned twice. A missing sibling is
   a reported state, never an error that stops work.
3. The "this package is ours" assertion is supplied once through session
   39's owed-decision mechanism and validated thereafter.
4. Direct dependencies read from .csproj and pom.xml as XML -- manifest
   reading, not building, which keeps this inside the declare-and-check
   line. The parser FAILS LOUDLY rather than guessing: a version or id that
   resolves through an MSBuild property, Directory.Build.props or Maven
   dependency management is reported as "cannot determine", never as drift.
   A false drift report is worse than no report.
5. Four reconciliations, reported and never silently repaired:
   referenced-but-not-declared (an edge nobody knows about -- the dangerous
   one); declared-but-not-referenced; two repositories pinning different
   versions of one package; and an unsanctioned source reference crossing a
   repository boundary.

Not releasable: it publishes nothing.

### Session 45 — Resolution modes, inside the declare-and-check line

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 46 — Packaging declared for the ecosystem it is

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 47 — The Solution Explorer goes cross-repo

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 48 — The generated workspace

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 49 — The thing becomes installable

**Releasable: yes.**

Affected; verify; full suite as final-full; packaging; close

### Session 50 — The field trial, and the exercise reported back

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 51 — What the field trial found, and nothing else

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 52 — The startup experience, walked before it ships

**Releasable: no.**

Affected; verify; full suite as final-full; close

### Session 53 — The Work Explorer reads at a glance, and session 1 asks

**Releasable: no.**

Session 53: the Work Explorer reads at a glance, and session 1 asks.
1. Work Explorer: sessions grouped under status buckets (In Progress, Not Started ascending; Complete, Cancelled descending; empty buckets omitted; counts in the description slot; In Progress expanded, others collapsed; finished rows carry a compact close date). Supersedes D104.
2. Closed sessions that stopped at the cap move from the attention rows into a collapsed Information bucket; the in-flight case stays at the top.
3. Bootstrap templates, the bootstrap hand-off line and the extension walkthrough tell session 1 to ask the operator for the plan when it is not in the repository, instead of "Neither waits on anyone".
4. solution.yaml for this repository as a one-component solution.
5. Tests for the above; extension bumped to 2.2.0; decision recorded superseding D104.

### Session 54 — The router suite stops taxing the host

**Releasable: no.**

Cap vitest workers for packages/router (vitest.config.ts: small fixed local pool, measured at 2 and 4 against the 86 s baseline, one worker in CI); make config.test.ts hermetic against DABBLER_TRANSPORT (clear in beforeEach, restore after); affected, verify, final-full, close.

### Session 55 — The task rows move themselves

**Releasable: no.**

Task rows derived from the lifecycle's own records (Register, Declare, Work, Verify, Run of record, Close); test-evidence record stamps the session; seedSessionPlan/logStep/advanceStepsAtDeclare/closeLastStep/session log deleted; docs updated; extension 2.3.0 built and installed.

### Session 56 — The driver's contract — the schemas and the report verb

**Releasable: no.**

Session 56: the driver's contract. Four schemas under packages/router/schemas/ (driver-instruction, driver-report, driver-work-plan, driver-disposition), generated types for each, a driver.ts module owning .dabbler/runs/s<N>/driver/ (paths, validated readers that refuse a row the schema rejects, atomic writers), and `dabbler session report` as the engine's one verb that shapes and validates a report into that ledger. Docs: the schema reference gains the driver ledger; the verb table stops naming the deleted `session log`. Six tests. Not releasable.

### Session 57 — `dabbler session drive` — the framework runs the session

**Releasable: no.**

Session 57 of 61: `dabbler session drive` -- the framework runs the session.

1. The loop, as a router verb (`src/drive.ts`, `dabbler session drive`): resolve
   and register the session (the rule `session start` applies); ask the engine
   for a work plan against `driver-work-plan` and declare from it; issue each
   step, invoke the engine, validate the report's substance (seq, step, every
   listed file exists, the listed files match what the tree changed since the
   previous accepted step, the step's own checks pass) and accept or issue a
   `rejection` with the reasons, three times at most; then `affected` and the
   pre-verify evidence, run and recorded by the framework; then `verify`;
   blocking findings go back as a `rejection` carrying the findings, the
   `driver-disposition` is validated and held against the round, fixes re-enter
   the loop and rejected findings become disputes; then the run of record;
   commit and push once; close.
2. The work plan and the dispositions travel through the one engine verb:
   `dabbler session report --seq N --answer-file <path>` validates the engine's
   JSON against the schema the outstanding instruction names, stamps the
   framework's fields, and copies it into the ledger.
3. Engine-agnostic: one interface (`invoke(invocation)`), shipped with a command
   adapter (an argv spawned per invocation with no shell) and tested with a
   scripted engine, without a model and without a seat.
4. Bounded: `driver.max_invocations` in `dabbler.yaml` (default 24) stops the
   loop and closes nothing; the run's state (`driver/run.json`) records why.
5. Affected; verify; full suite as `final-full`; close.

### Session 58 — The engine adapter — Claude Code, Copilot, Codex; stream; interrupt

**Releasable: no.**

Session 58 of 61: The engine adapter -- Claude Code, Copilot, Codex; stream; interrupt.

1. Spawn without shattering: one spawn helper in `checks.ts` that prefers an
   `.exe` through `resolveProgram` and spawns it with no shell, and gives a
   `.cmd` shim the shell with every argument quoted; the seat transport and
   the engine adapters both go through it, so the router has one answer.
2. Three argv shapes, one per engine, in `src/engines.ts`, measured against the
   CLIs rather than assumed: Claude Code (`-p --model
   --dangerously-skip-permissions --output-format stream-json --verbose`,
   `--continue` after the first invocation), Copilot CLI (`-p --model
   --allow-all-tools --allow-all-paths --no-ask-user`, `--continue`; the model
   required as it is at `session start`), Codex (`exec --json -m
   --dangerously-bypass-approvals-and-sandbox <prompt>`, `exec resume --last`
   after the first). The prompt is one sentence; the instruction travels by
   file. `--engine-argv` becomes optional: given, it overrides; absent, the
   engine's built-in argv runs, and an engine with none is refused by name.
3. `driver.engine_output: stream | quiet` in `dabbler.yaml` and `--show-engine
   stream|quiet` on `drive`: `stream` renders the engine's live output
   (Claude's stream-json as thinking / tool / text / result lines with only the
   `init` system event; Copilot's own lines; Codex's JSONL items); `quiet`
   shows nothing. The engine's argv and the transcript are identical either
   way.
4. Interrupt, defined once: `dabbler session interrupt --reason "<text>"`
   writes a request into the driver's ledger; the driver ends the running
   invocation, records it on the transcript as interrupted with the reason,
   and re-invokes the engine with `--continue` and a `kind: interrupt`
   instruction carrying the reason and the answer still owed. Claude Code's
   single-process variant is measured and the result recorded.
5. Seat cost per step: every invocation is reported against
   `driver.max_invocations` as it is spent.
6. Affected; verify; full suite as `final-full`; close.

### Session 59 — Start is the launch, and the developer's guide

**Releasable: no.**

Session 59 of 61: Start is the launch, and the developer's guide.

1. Start Session launches `session drive`. The extension runs the bundled
   router (`dabbler.cjs`) on the editor's own Node as a child process of the
   extension host, with the chosen engine, provider and model, standing at
   the repository root, and everything the driver prints lands live in an
   Output channel "Dabbler: Engine". Not inside the in-process router: it
   stands in one directory at a time, serialises verbs and buffers a verb's
   output until it returns, and a drive is one verb that lasts the session --
   in-process it would queue Stop behind itself. One drive per repository at
   a time; a Copilot seat is asked for its model before anything is launched.
2. Stop and Send are `session interrupt`, as status bar buttons shown while a
   drive runs. Send asks for the text and interrupts with it; the driver
   re-invokes the engine with the reason. Stop asks for a reason and
   interrupts with `--stop`: the driver ends the invocation and halts the
   loop, recording `interrupted` on `run.json` so the task rows show it, and
   the same Start resumes from the phase reached. `--stop` is new on the verb,
   on the in-process contract and among `driver-run`'s stop kinds; a stop
   request that arrives between invocations is honoured at the next boundary
   rather than discarded.
3. The copy-prompt commands retire -- Start the next session, Run Prompt,
   Send Back, Respecify, the repository row's left-click clipboard half and
   the Copy Prompt submenu: the framework sends, so nobody pastes.
4. `docs/driving-a-session.md`, the developer's guide: what happens when
   Start is pressed, what is shown and what `quiet` hides, how to send an
   instruction and how to stop, what a rejection is and what the engine does
   with it, what each step costs on a seat, what a budget stop looks like and
   what to do; linked from README and quick-start. Every command
   copy-pasteable; no decision ID without saying what it is.
5. Walked: the `.vsix` built and installed; a session driven on a scratch
   repository with Haiku on Claude Code through the same command line the
   extension launches, interrupted mid-step with a sentence and watched
   continuing, then stopped; recorded as evidence, with the UI press stated
   for what it is.
6. Affected; verify; full suite as `final-full` for both suites; close.

### Session 60 — The engine channel reads at a glance

**Releasable: no.**

Session 60 makes the engine channel read at a glance. The driver's own lines take the word `dabbler` as their prefix in place of `drive` -- written in one place, the `log` method in `packages/router/src/drive.ts`, and its `drive:` diagnostics with it, so the framework speaks in one word and the engine stays under its `│` glyph. The extension then creates the "Dabbler: Engine" output channel with a `dabbler-drive` language id and contributes that language and a TextMate grammar under `syntaxes/`, colouring each line class through standard scopes: the clock and the `key=` names dimmed as comment, event names as keyword, refusals and stops and `stderr:`/`error:` in the theme's error colour, tool names and their arguments as function and string, and the engine's own `engine:` words left in the plain foreground as the brightest text in the block. Nothing is contributed under `colors`, so both theme kinds come free. The router keeps emitting plain text on the pipe -- one classifier, one owner, no ANSI for the extension's line reader to meet. `docs/driving-a-session.md` is re-cut from a fresh scratch-repository walk with Haiku so every example line carries the new prefix, its line-kind list names `engine:` for the engine's words where it now says `text`, and one paragraph says how the colours read; README and quick-start show no lines and do not change. The background band, a level filter and collapsing an engine block are deliberately not in this session -- each is a Pseudoterminal's to give, and the operator decides them after watching drives under the grammar. Extension 2.5.0, unpublished like the rest; this session publishes nothing.

### Session 61 — `dabbler session next` — the loop as a verb the engine calls

**Releasable: no.**

Session 61 turns the driven loop inside out. `dabbler session next` re-hosts the loop that lives in `packages/router/src/drive.ts` without rewriting it: each call judges the outstanding answer exactly as `runStep` does today -- schema, seq, step, the files against the baseline tree, the step's checks -- advances the session one move, and prints the next instruction on stdout as the same `driver-instruction` JSON the engine already answers with `session report`. `run.json` carries the phase, the rejection count and the engine's own conversation id between calls; a call after a stop clears it and resumes from the phase; a refusal comes back as `kind: rejection` with its reasons. The framework's long work -- a verification round, the complete suite, the close -- is never awaited inside a call: `next` starts it detached through a new `jobs.ts`, records the pid, the log and the status file on `run.json`, and returns a fifth instruction kind, `wait`, carrying `retry_after_seconds` and the log path, so the following call reports progress or the result. A `wait` is a tool call and not a sleep, which is what the engine-side classifier that killed the spike's foreground poll could not tolerate. `session drive` stays, as a thin loop over `next` with a headless engine for CI and unattended runs, and the framework stops resuming an engine by recency: Claude Code's `session_id` is read from the first invocation's `init` event and passed back as `--resume <id>`, Codex's thread id from `thread.started` in place of `resume --last`, with a test that a newer session in the same directory is not picked up. The decision to keep `drive` rather than retire it is recorded as a decision either way. `docs/driving-a-session.md` is re-cut for the pull -- what to type in your own CLI, what each `next` returns, what a `wait` means, how to interrupt from your own CLI, what to do when the framework says it stopped -- from a real walk, and the guide says which walk supplied its examples. No extension change; this session publishes nothing.

### Session 62 — The entry — one sentence in the CLI, and Dabbler's own terminal

**Releasable: no.**

Session 62 builds the entry to the pull. The managed body `dabbler bootstrap` writes stops typing out nine lifecycle steps and says the one thing an engine now needs -- call `dabbler session next` and do what it says until it says `done` -- keeping only the hard rules that are still the engine's (keys in the environment, the record is the machine's) and the engine tails; this repository's own `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` are re-bootstrapped from it and the operator's superseded ground-rules block is kept as it stands. In the router, a driver stop is raised as an owed decision (*Run `next` again* / *Cancel the session*) and superseded when a later call resumes, so one kind of row serves every "waiting on you"; the progress projection carries each open decision's whole brief -- what the framework determined, every option with its consequence, the recommendation -- and the in-process contract gains `owed.answer`, so the Explorer can show a decision and settle it without a second read or a spawn. `clip` in `engines.ts` strips CSI and OSC sequences from engine-derived text before it truncates, which is the colour bleed the operator watched session 61 produce: a truncation that cut a colour's reset off while keeping its opener left every following line green. In the extension, Start Session stops launching a driver and opens a VS Code terminal at the repository root running the person's own CLI interactively, with the opening sentence in argv where that CLI takes one and shown to be typed where it does not; a separate Start Unattended Session keeps launching headless `session drive` (D252's other half), and Stop and Send survive only for a drive the extension itself launched. A *Dabbler* Pseudoterminal the extension owns shows the framework's background work and nothing else -- the phase lines as the run record moves, every background job's log passed through byte for byte so the test runners' own colours, checkmarks and spinner arrive whole, a working indicator while a job runs and a waiting one between calls, and the band behind the framework's own lines with the theme kind read from `window.activeColorTheme` and re-read on change. The terminal carries no engine chat, ever: under the pull the framework never sees it, and under headless `drive` the stream stays in the "Dabbler: Engine" channel. A framework stop or an owed decision is loud -- an attention row above the buckets with a themed icon and the whole brief in its tooltip, a toast offering the recommended option, *Other...* and *Later*, the activity-bar badge with the count, and a QuickPick whose items carry each option's consequence as `detail` -- and choosing calls `owed answer` in-process. The liveness row becomes the working/waiting indicator. It is walked from the installed extension on a scratch repository and recorded in `docs/driving-a-session.md`. Extension 2.6.0, unpublished; this session publishes nothing.

### Session 63 — The escape route — when the framework stops, it asks

**Releasable: no.**

Session 63 builds the escape route: when the framework stops, it says what kind of stop it is, whose it is to fix, and how. Stops become legible first -- `run.json` keeps a short stop history, a stop on the same step with the same reasons twice running is class `deadlock` said in the stop itself, and every refusal a judge rule produced cites that rule by name, so a person and a machine read the same account. The attended path is written once and only once: the guide's *When the framework stops* section grows the diagnosis protocol the staff's own engine follows when a person types help -- read the framework's own account first (`dabbler status`, `run.json`'s stop, the instruction's `reasons`, the transcripts) and never the scrollback; verify the claim against the code before acting on it; on THIS repository the engine may fix framework source in the tree and the fix rides in the session's verified diff, which is the 60/62 precedent and is said out loud because 62's engine did not know it could; on a consumer repository the framework is an installed package, so the engine reports `blocked` with the diagnosis and raises an owed item pointing at dabbler and the fix ships as a release; never `.dabbler/runs/`, never `sessions.json`, never a verdict, never a gate; and stopping costs nothing, because a session nobody calls `next` on simply waits. The managed `AGENTS.md` body points at that section in three lines and there is no skill, because a Claude-Code-only skill would be a second copy of the rule. `dabbler triage` is the one second opinion both modes call: it assembles the stop's artifacts -- the instruction, the report, the reasons, the rules they cite, `run.json`, the transcript tail -- and asks a provider that is NOT the working engine for a schema-validated `engine-error | framework-defect | plan-defect`, with the minimal amendment and one recommendation. An attended engine calls it when it is stuck; unattended `drive` climbs a ladder on a deadlock-class stop -- the second provider with one attempt and one schema retry, then the third provider, then the stop lands as an owed decision carrying the raw artifacts and no recommendation, because "the framework stopped and its advisers could not classify it" is an honest brief. No rung loops, every rung terminates at the human, and a gate-relaxing amendment is never applied on the framework's own authority: it arrives as an option on the owed decision and is recorded as a decision when a person chooses it. `session interrupt` queues against a run whose stop is set rather than refusing it, the resume drains it into the next instruction's `reasons` as `sent: <text>`, and the push relaunch stops clearing a request it has not read. `dabbler session plan amend` gives the framework the affordance session 62 lacked -- a machine-written amendment of a step's files or checks, with the reason and the approver on the record -- raised from a triage proposal or typed by the operator. And the readers of driver records accept unknown properties while the writers stay strict, so an installed extension survives a newer driver's fields instead of refusing every row for the length of a driver-changing session; "Execution record unreadable" is reserved for damage. Extension 2.7.0, unpublished; this session publishes nothing.

### Session 64 — The operator onboarding deck

**Releasable: no.**

Session 64 builds the operator onboarding deck: `docs/onboarding/dabbler-onboarding.pptx`, generated by a committed script so a later session rebuilds it when a screen changes instead of editing slides by hand. `pptxgenjs` joins the workspace root as a dev-dependency and nothing new lands under `packages/`. The screens are photographed, not drawn: `capture-screens.mjs` launches a real VS Code through the same `scripts/vscode-launch.js` seam the Playwright layer uses, and captures this repository's own Work Explorer -- the status buckets with their dimmed counts, In Progress open and the rest collapsed -- and the Solution Explorer over a four-repository CSV solution declared in a temporary workspace, which is the same picture the solution slides need. `capture-walk.mjs` does the other half on a scratch repository under C:\temp: Start on the Work Explorer picks the engine, opens the person's own CLI at the repository root and the Dabbler terminal beside it, and the shot is the two side by side -- the framework's `dabbler [time] event` lines and the test runners' own output in one, the chat in the other, the Explorer's rows moving -- never the Output-channel shape of 59-60; then the stop as the staff meet it, the toast carrying the recommended option and the attention row above the buckets. Several Starts are taken in one window on purpose, because that is the terminal placement session 62 repaired at the cap and closed unreviewed, and this walk is its review: `walk-notes.md` records what the walk saw and its verdict. Fourteen slides: what the extension is and how to install it, why the framework is in the room, the two Explorers annotated pane by pane, getting started on a Copilot seat, getting started on Claude Code or Codex with the three DABBLER_*_API_KEY variables set in the environment and never in a file, project setup through Set Up New Project and then sessions 1 and 2, driving a session, and when it stops; then the four-repository CSV solution -- csv-model, csv-deserializer, csv-persistence, csv-pipeline -- one slide each for its contract and what it depends on, one for the graph the Solution Explorer draws, and one for the day-to-day loop across the four. The operator's open question is answered AS DESIGNED, not as built: the four repositories are declared rather than written, because building four .NET repositories through the lifecycle is its own set and a deck of real screens of it would follow that work rather than precede it -- the Explorer screenshot is real over a declared solution, so no slide is a mockup of a screen that does not exist. Every command on a slide is copy-pasteable and no slide names a decision by its ID without saying what it is; `verify-deck.mjs` is this session's one test, and it is a script rather than a suite case because `docs/` maps to no declared suite by design: it opens the built deck, holds it to the build script's own slide manifest, checks every declared screenshot is embedded, and enforces those two readability rules over the extracted slide text. The deck is a committed artifact; this session publishes nothing.

### Session 65 — The half of the trial that needs a published router

**Releasable: no.**

The csv-model papercuts: the console windows that steal the cursor (windowsHide on every check spawn), the Dabbler terminal's staircased multi-line lines and its band and per-event highlighting, terminal placement as a setting defaulting to the editor area, a command to reopen the framework terminal, git's 'fatal:' carried into a land stop where the real cause is no remote, the 'affected' message that says no suite is declared when one is declared but not expensive, the heredoc warning missing from the managed body every project gets, the api-models.lock warning with no owner, and re-registering an in-flight session with a different engine. Also amends the session plan: 65 is this, 66 is the publish phase, and the publish trial moves to 67 of 67.

### Session 66 — The publish phase

**Releasable: no.**

A miscellaneous session, on the operator's call: the publish gap the csv-model trial found, the CI failure that has kept master red for weeks, the animated indicator the Dabbler terminal has never had, and the four spawn sites session 65 could not reach. CI first, because it is one line and it has been hiding a green router suite: the repository declares no line endings, every text file is stored LF, and core.autocrlf is true on windows-latest -- so a fresh clone writes CRLF, the generator renders LF, and all 31 generated modules compare unequal. Then publishing: a publish phase between land and close for a session declared releasable, a published_when_releasable close gate so a releasable session can never again close VERIFIED having shipped nothing, secret made optional for a feed that is a filesystem path, and the managed body's claim that the framework publishes made true. Then windowsHide on the git, facts, release and Copilot spawns. Then the spinner.

### Session 67 — The watcher, and the driver's blind spots

**Releasable: no.**

The watcher, and the driver's blind spots. Four of session 66's own findings, three of which share one root: the driver treating an exit code as opaque when the process it ran printed a specific, routable reason. First, two workers instead of four, on the operator's call after a 4-worker run of record made the host unusable and had to be killed -- 106 s wall / 352 s test time at four, 138 s / 262 s at two on the twenty-core host, so a third more wall clock buys a machine the operator can still type on; WORKERS_CI stays 1. Second, lastActivityAt reads the driver's own run record: measured mid-session 66, two hours in with eight steps accepted, it reported possiblyStalled with lastActivityAt frozen at registration, because it reads the ledger, the activity log and the verification rounds and never driver/run.json, driver/instruction.json or driver/report.json -- so every instruction issued, answered and accepted moved nothing it looks at, and it would have looked identical during the forty minutes the engine actually was stopped. Third, the watcher line: the rule that separates the two silences -- an instruction issued, no report answering it, and no tree change since it was issued, past the existing stalled_after_seconds threshold -- stated once in the router and rendered by the Dabbler terminal in its existing grammar as a warn-toned `watcher since=60s state=instruction-outstanding` line, a new case in lineTone rather than new rendering machinery, with the headless case carried on the driver's own log channel through the poll invoke already runs. Fourth, the driver reads verify's reason instead of only its exit code: it re-reads the refusal from the job log verify wrote it to, so a stale pre-verification precondition self-heals by setting the phase back to preverify (bounded, and recorded on the run) instead of re-running verify to the same point forever, and two genuinely different refusals no longer arrive inside one identical driver sentence, which is what made the deadlock classifier declare a deadlock between unrelated causes.

### Session 68 — The logic tree, harvested and held to the code

**Releasable: no.**

The logic tree, harvested and held to the code. This session receives the logic-tree harvest run beside the repository in C:/temp/dabbler-logic-harvest -- the framework's decision machine serialized into one model, annotated with actor, timeout and observed_by, and critiqued by gpt-5-6-sol and gemini-3-1-pro. First it reconciles all eighteen findings against the source before acting on any of them, because both models assert things about this codebase that are not true and a finding that does not reproduce is recorded as not reproducing rather than quietly dropped -- finding 15's claim that a stopped run has no Send channel is already one of those, session 63 built it. Then it fixes the machine, ranked by the harvest's own rule of silent-and-plausible above loud-and-severe: verification's three terminal states (a terminal row already standing, the cap reached with a clean round, the cap reached with disputes) are instructions to ADVANCE that reach the driver as one refusal and stop a correct session forever, so the driver asks the rounds ledger the two questions it already computes and routes to the run of record; the UNRESOLVED-at-cap branch stops sharing its exit code with a recorded blocking round, and the consumed disposition set is cleared so the dispositions-fix-preverify-verify cycle cannot run unbounded on a finding that cites no path; the budget stop stops embedding its own invocation count, which is why two budget stops never compared equal and the deadlock classifier could never fire on one; releasability gets ONE owner, because phasePublish reads the work plan while packaging and the close gate read the declaration and the two can disagree freely; and published_when_releasable stops accepting a refused or failed packaging row as proof that something shipped, moving into EVIDENCE_GATES so --force cannot skip the one question a releasable session exists to answer. Then the state session 66 walked into and 67 deliberately deferred: halted-being-repaired, a real state with real file changes and no reporting edge out, gets one -- `dabbler session rebaseline`, valid only while the run carries a stop, recording the paths and the reason and raising an accountability-signoff decision, with the driver's own refusal naming it. Then the second watcher rule, because the rule shipped in 67 is quiet whenever a job is running and so is blind in exactly the window a wedged verification round occupies. Finally the model itself is adopted as a SOURCE held to the code -- the driver machine only, stated as driver-only, with a control that fails when the driver takes an edge the model does not declare or takes one the model records as never exercised -- or it is deleted; a hand-maintained diagram of a state machine is worse than none, because it is trusted and wrong.

### Session 69 — The round cap stops being typeable, and the Solution Explorer goes multi-repository

**Releasable: no.**

Session 69 takes the verification round cap out of anyone's typing hands, and takes the Solution Explorer across repositories. `--max-rounds` loses its mid-session power: `session next` and `session drive` refuse it rather than silently ignoring it, the cap comes from `verification.settings.max_rounds`, and afterwards it moves only through `dabbler session plan amend --max-rounds`, which records the before, the after, the rounds already run, a reason and an approver. No gate reads that approver -- an engine writes it, and a gate that trusted it would make the authorisation forgeable, which is worse than absent. What the amendment buys is that the claim EXISTS, attributable and reviewable at the close, instead of a bare number appearing in run.json with no reason, which is what session 68's `--max-rounds 4` left behind. Then the Explorer stops rendering a producing repository as present-or-absent: the projection carries the declared remote and the declared path beside `root`, so a row is HERE, a known remote nobody has cloned, or undetermined -- and only the last needs a person. An absent row gains the four actions it had none of -- identify the remote, point at a local folder, clone the known remote, create a new local repository -- each one a router verb (`dabbler deps locate|clone|scaffold`) that writes `solution-dependencies.json`, because the extension must never author the declaration itself. The upstream direction arrives without a second declared one: a repository appears in the Explorer because it declares ITSELF a member of the solution, one home owned by the repository it describes, so both directions are derived and `usedBy` stays derived; and `deps scaffold` gives a multi-repository plan its shell repositories at planning time by writing exactly that self-declaration and nothing else.

### Session 70 — The half of the trial that needs a published router

**Releasable: no.**

Session 70 prepares the release the publication trial needs, and states plainly the one thing the plan's own precondition got wrong. The precondition assumed the artifacts were already published; they are not -- `dabbler-ai-router` has never been served by registry.npmjs.org, there is no `v2.x` or `vsix-v2.x` tag, and no `publication` decision has been raised, so items 3 and 4 of the plan (verify-install against the public registry, and the acceptance run from a clean profile) have nothing to verify yet. They cannot be done inside this session either: `dabbler release` refuses to tag a dirty tree, and a driven session's tree carries its own uncommitted steps until the land phase -- so the session that CHANGES the version can never be the session that tags it. That is the framework's own model (a session prepares a release; a tag push makes it) rather than a defect, and it is recorded here instead of being quietly worked around. So this session does the half that must happen before anything is tagged: the router stops carrying its own number and both halves declare 2.8.0, with the extension pinning the router at the same number and ONE rule deciding whether they agree -- asked by `dabbler release` before it tags, so a repository whose halves disagree cannot be tagged at all. 2.8.0 rather than the extension's current 2.7.0 because sessions 65 through 69 landed after 2.7.0 was set and nothing was ever published as 2.7.0, so no number is skipped in public. Then it writes the trial itself down before it is run -- criteria 1, 2 and 5 with the expected answers stated beforehand, which is what makes an acceptance run a test rather than a demonstration -- and gives every one of the nine `csv-model` feedback items a linked test, a recorded verification or a dated deferred issue with an owner, because the plan says in as many words that prose classification does not satisfy that criterion and today's table is prose. Finally it amends the plan with what it found, adding session 71 for the half that needs the registry: the operator answers the publication brief on the landed tree, the framework tags router-then-extension, CI publishes, and 71 verifies the install and performs the acceptance run. Not releasable: this repository declares no packaging block on purpose, and its two artifacts go out through their tag-driven pipelines.

### Session 71 — Green CI, because nothing can be published until it is

**Releasable: no.**

Session 71 makes `Test` green, which nothing can be published without: both release workflows are gated on a green run for the tagged commit, and there has not been one since session 66 -- twelve consecutive red pushes. It is one bug and the runner's own log carries both halves of it. `os.tmpdir()` hands the fixtures the 8.3 short form, `C:\Users\RUNNER~1\AppData\Local\Temp\...`, while `git rev-parse --show-toplevel` answers with the long one, `C:/Users/runneradmin/AppData/Local/Temp/...`; `gates.ts:sessionsRel` computes `relative(root, sessionsDir)` from those two unresolved spellings, so the sessions-relative prefix is nonsense, the bookkeeping exclusion never matches, and `docs/sessions/sessions.json` counts as the session's own work -- every test that declares a task list fails with *the working tree already carries 1 change(s)*. It is green here only because this machine's temp path has no short form, and it is NOT only a test defect: any repository reached through a path git spells differently -- a junction, a mapped drive, a short name, a case-different `--sessions-dir` -- decides containment wrongly in production too, and the same unresolved comparison decides an agent's read scope and a plan's file envelope. So the fix is one canonical spelling, stated once beside `repoRootFor` where git's own answer comes from, and asked by every comparison that decides something rather than only by the one that failed. It is proved without a runner: a junction whose real path differs from the path handed in reproduces the mismatch exactly (`relative()` answers `..\alias\docs\sessions`), so the repro is a test rather than a green CI run somebody has to take on trust, and a second control runs the suites that fail on the runner under a TEMP that is an alias. What this session cannot do is watch the real `Test` run before it closes: the framework pushes at its land phase and closes seconds later, and holding a session open for CI is the unscheduled proposal recorded in the plan. The push is watched after the close, and a still-red run is a new session rather than a claim made here.

### Session 72 — Green CI, part two — what the first fix did not reach

**Releasable: no.**

Session 72 finishes what 71 started: `Test` green, which is the precondition for publishing anything at all. 71's fix was real -- the `sessions.json` failures that made twelve consecutive runs red are gone from the runner's log -- and it was incomplete in four ways, all one family. First, `canonicalPath` gives up on a path that does not exist yet and falls back to the spelling it was handed, so a comparison between a canonical root and a not-yet-written file under it mismatches exactly as before; session 71's own new test caught that on the runner, which is the test doing its job, and the fix is to canonicalise the deepest ancestor that DOES exist and re-append the rest. Second, the suite borrows the machine's git identity: the runner has none, so a fixture's `git commit` fails with *please tell me who you are* and the driver's land phase stops -- a fixture that borrows ambient configuration passes for a reason it never stated, which is the same defect as a path spelled two ways. Third and fourth, `packaging.test` asserts the spelling it was handed and a `fixloop` traceback frame carries a short-form path. The through-line is that this machine is not the runner and the suite has been quietly assuming it is, so the session's second deliverable is the control that ends that: `aliased-temp-suite.mjs` takes the suites to run as arguments and reproduces BOTH runner conditions -- a temp directory spelled two ways, and no git identity anywhere in the environment -- so every one of these is reproducible here instead of only in a place that takes eight minutes to answer. Nothing is tagged in this session; what it owes is a green `Test` run for the commit it pushes, read after the close, and a still-red run is another session rather than a claim made here.

### Session 73 — Green CI, part three — the last two, and the tilde

**Releasable: no.**

Session 73 is the last of the CI work, and what it fixes is three named things rather than a class: session 72's run came back with two failures out of 1263, down from about fifty, and both are known. The first is a production defect that has nothing to do with the path comparisons of the last two sessions: `fixloop.ts`'s path-token character class admits no `~`, so a traceback frame naming `C:/Users/RUNNER~1/.../app.py` matches only the tail after the tilde, resolves to nothing and is dropped -- and every Windows 8.3 short name carries a tilde, so on such a machine a fix round's envelope silently loses the very file the failure points at. The second is `drive.test` asserting the spelling it was handed, exactly as `packaging.test` did: the transcript carries the argv the framework resolved and the test holds the short form. The third is not a failure but a lie about one -- `check:types` prints that all thirty-one generated modules match and then exits 1 on a libuv assertion at `process.exit()`, which turns a passing control into a failing step, so every script that exits by hand sets `process.exitCode` and lets the loop drain instead. Each is proved by a reproduction rather than by the next CI run: a tilde in a path in `fixloop`'s own test, the aliased-temp control for the transcript, and the scripts' own exit path run here. What the session owes at the end is a green `Test` for the commit it pushes, read after the close -- the trial cannot start until there is one, because both release workflows are gated on it.

### Session 74 — The extension is the distribution, and the number is 2.0.0

**Releasable: no.**

Session 74 makes the distribution match what the product actually is, on the operator's call of 2026-09-02. npm is retired: the extension bundles the router -- `esbuild.js` emits `dist/dabbler.cjs` beside `dist/extension.js` and the terminal shim points at it -- so the `dabbler` command that has driven every session since the port has always resolved to the installed VSIX and never to a registry. What npm bought was `npm i -g dabbler-ai-router` on a machine with no extension, which nothing in this repository does and nobody has asked for; in v1 the PyPI dependency was real, because a Python CLI had no other delivery route, and the port removed it. So `release.yml` is deleted rather than left dormant -- a workflow that fires on `v*` tags and publishes to a registry nobody publishes to is a trap, not an option held open -- `tagsFor` emits one tag instead of two, the router-before-extension ordering and its wait for npm go with it because there is no longer a half that can be missing, and the publication brief stops describing an npm half or promising `npm i -g`. The version becomes 2.0.0 for the same reason of honesty: the Marketplace serves 1.0.4 with twenty installs and nothing 2.x has ever been published anywhere, so shipping 2.8.0 would claim seven minor releases that never happened; 2.0.0 is greater than 1.0.4, which is all the Marketplace requires, and it says the one true thing about what changed. `--verify-install` keeps its property -- it asks what is actually served rather than trusting a job's status -- by asking the Marketplace instead of the registry. And every document that told a reader to install from npm says instead what is true: the CLI ships inside the extension. csv-model feedback item 5 was never a defect in the product; it was a wrong instruction, and it closes as one. Nothing is published here: this session prepares a release and the tag that makes it is the operator's, as is the `VSCE_PAT` this repository does not yet have.

### Session 76 — Performance patches — reaping, hidden windows, worker priority

**Releasable: no.**

Session 76 of 77: performance patches -- reaping, hidden windows, worker priority. Everything mechanical, nothing that touches the evidence flow. (1) What a session starts, a session ends: `checks.ts` keeps a registry of every child it spawns (declared checks, engines, the Copilot seat, the extension's driver) and the router's own end -- SIGINT, SIGTERM, SIGHUP, or a plain exit with a child still live -- ends every tracked tree; `terminateTree` learns to end a tree by pid so a job the driver started in an earlier process can be ended from a later one; the job runner ends its child's tree when it is itself signalled; the driver ends a live job when the run is abandoned (a Stop while the job runs, including `session interrupt --stop`) rather than leaving it to squat; `test-evidence run` spawns the suite through the same tracked, grouped, hidden path instead of a blocking shell spawnSync; and the extension registers its drive registry for disposal so a driver does not outlive the window, with the Playwright launch seam ending the Electron tree when a graceful close fails. The 38-hour `test:unit` tree and the 12.7-hour Playwright test-server of 2026-09-02 are the incident; the audit of every spawn path is recorded in the step reports. (2) The last two visible windows: the `taskkill` fallback in `terminateTree` and the suite spawn in `testEvidence.ts` both get `windowsHide`. (3) Workers yield to the operator, then multiply: a vitest setup file puts every worker at below-normal OS priority, so forked `git`/`node` grandchildren inherit it; the full suite is then measured at 2, 4 and 8 workers with a normal-priority latency probe running beside it as the keyboard's proxy, `WORKERS_LOCAL` is raised to the count the measurements support, and the stale 138 s benchmark in `vitest.config.ts` is replaced by what was measured. (4) STATUS.md hands off, and the `final-full` this session records is the baseline session 77 is measured against. Not releasable.

### Session 77 — The git seam — contract band and answered questions

**Releasable: no.**

Make journal.runGit a tested seam instead of a comment: a contract band of ~15 real-git tests pins every git behavior the router relies on (diff -z parse shapes, the autocrlf class from the session-66 incident, update-ref on Windows, the porcelain the gates read), and a recorded-answer fixture lets every other test feed git's answers through the runGit interface instead of building a scratch repository. The six heaviest repo-builders — projection, owedDecisions, verify, facts, lifecycle, evidence, holding ~130 of the ~240 build sites — convert to answers-in, decisions-out; tests that genuinely exercise spawning keep their real children. The suite is re-measured against session 76's baseline and the number recorded where the worker-cap comment already reasons from measurements.

### Session 78 — Every component becomes a library, or is named as not one

**Releasable: no.**

Make every component meet the operator's library criteria or be named as not one. First the redundant targeted pre-verification run dies (measured 353-625s per session, twice more than the full suite it approximates); the Work task-row signal moves to what the framework already owns, accepted steps, with the old stage vocabulary kept for reading old records. Then the measured back-edge clusters are cut in order: the cli/output print helpers move to a leaf (~7 back-edges), the session-state reader leaves progress's height (~10), config stops importing transports (1 cut freeing ~6). SCC-B (ledger/critique/evidence, 4 back-edges) pilots the single-writer append-only rule. The L5 club (~20 edges among cli/drive/session/verify/gates/progress) is begun along the five mini-workflow boundaries with recorded handoffs as the only interface; what does not finish is measured, named, and amended into a follow-on scope on the record. The boundary then holds by lint with a frozen baseline.

### Session 79 — Seals, and a master that only moves on green

**Releasable: no.**

The blackbox rule made mechanical, and a master that only moves on green. The de-facto boundaries session 78 measured become a declaration: five workflow contexts and the platform beneath them, module membership stated, read by the boundary check. Seals land beside the run of record: a framework-computed digest per library (its files, hashed with normalized line endings, plus its dependencies' digests) and per workflow (its members' seals plus its handoff schemas), written when final-full is recorded - the ledger invariant the merge gate will read; the full run remains the whole answer until per-library suites exist, as the plan entry says. Five per-workflow sentinels plus one whole-pipeline land as the fail-fast band, each forcing an adverse decision and asserting on durable artifacts. The candidate gate arrives dual-mode: a workflow that runs the full check on candidate/s<N> at the exact tested SHA with step-level suite proof and fast-forwards master on green, and a close that pushes the candidate, records the receipt (base SHA, tested SHA, surface digest, executor), and in a repository with no CI executes the same check locally against the same SHA for the same receipt. Executor failover is the only escape; no typeable bypass exists.

### Session 80 — The loop stops living in anyone's attention

**Releasable: no.**

The loop stops living in anyone's attention. Instruction leases with epochs land on the record: every issued instruction carries the lease, answers carry it back, and a stale attempt is recorded and refused - the fence report() gained in session 79 is generalized to the driver's own judgment. The clocks split over free observables: acknowledgment, liveness and progress are separate, liveness resets on stream and OS signals, progress only on verified milestones, and no AI is ever asked for an ETA. The guardian arrives claude-code tier: on turn end with a lease outstanding the engine's stop hook consults the lease and continues the conversation instead of letting it settle; death and compaction recover through --continue with the instruction re-injected from the record; a pending permission prompt routes to the one state a human genuinely owns. Budgets, not confirmations: registration grants the session's paid-action budget and every supervision act appends to the record with its cost. dabbler session run drives a whole session under the guardian in one command; other engines degrade to watcher-only and say so.

### Session 81 — Publishing without a secret, and the last of the friction

**Releasable: no.**

Publishing without a secret, and the last of the friction. The Marketplace workflow moves to Entra ID workload identity federation - id-token: write, an Azure login step, vsce --azure-credential - and the PAT path goes with its stale 2026-05-04 comment: Azure DevOps retires global PATs on 2026-12-01 and the supported automated path is federation, which the operator's judgment preceded. The one-time Azure steps land in docs/planning/marketplace-release-process.md at the copy-pasteable bar: create the Entra app, add the GitHub federated credential for this repository, grant the publisher, run dabbler release - exact portal paths, exact values. And the naming that misled the owner is retired from every document a person reads: quick-start and the managed guidance describe start, run, interact and cancel; no instruction tells a person to type session next.

### Session 82 — The trial, run by the operator against what the Marketplace serves

**Releasable: no.**

The trial against what the Marketplace actually serves, with the tail it can trust and the publish path that works today. First the stale-job fence: longWork answers EXIT_OK for a standing job under another name, which is true within one phase's suite walk and false across phases - an uncollected verification job after an adjudication fake-greened every later phase in sessions 78 and 81. The disposition rule becomes exact: a mismatched job still running is ahead of us in this walk; a mismatched job that has exited is stale state - collected, logged, cleared, and then this call site starts its own. Then the publish path: the MSA-era publisher refused the Entra service principal under every identifier, so the workflow's PAT auth step returns (the environment secret never left GitHub) and federation moves to the owed record for before 2026-12-01. Then the operator's half: the release word, the environment approval, verify-install against what is actually served, and the walk - csv-model and the .NET leg - answering from visible UI only.

### Session 83 — The runner, the gates slice, and the git-states walkthrough

**Releasable: no.**

The proof of the test rebuild's shape on the gates module, on the operator's ruling of 2026-09-03 that the suite must stop taking the machine. The runner becomes Node's own: npm run test:unit runs node --test over packages/router/test, every existing vitest file moves to packages/router/test-vitest with both vitest configs following it, dabbler.yaml declares node --test as the ordinary suite beside the vitest default tier, and the integration tier is undeclared locally on the operator's authorisation while CI keeps running it. gates.ts is split so every gate that shells out is a thin reader returning facts plus a pure judge, with the porcelain and rev-list parsers as named pure functions, and test/gates.test.ts tests those with literal inputs and no repository. One walkthrough, test/walk-git-states.test.ts, builds one repository and walks it through clean, untracked, modified, staged-deletion, ahead-of-upstream, no-upstream and no-remote, parsing and judging the real git output at each milestone; it replaces gitContract.test.ts and the repository-building half of gates.test.ts, which are deleted.

### Session 84 — The record layer

**Releasable: no.**

The record layer, rebuilt the way session 83 proved: journal, ledger, writers, progress, sessionState, owedDecisions, evidence, facts and testEvidence keep every exported signature, gain a pure function wherever a decision was tangled with a read (the freshness digest over a list of path-and-bytes pairs with enumeration as its one thin reader; ledger row parsing over text; the evidence-bundle and control-fact judgements over facts), and get node:test files that call the pure functions with literal inputs and no repository. One walkthrough, test/walk-record.test.ts, builds one repository and walks the record through register, declare, digest, run of record, round with its anchored ref, decision, projection and owed decision, milestones asserted in order. The six vitest files it replaces are deleted and the integration list shrinks.

### Session 85 — Verification

**Releasable: no.**

The verification layer, rebuilt the way sessions 83 and 84 proved. The judges are tested from literal inputs: verdict parsing and severity, the adjudication parser, the agency briefing, scope, budget and fidelity marks, the plan review's hash, risk flags, envelope, free checks and reviewer-answer parsing, the critique subtree's validators, the prompts' blocks, the round's cap and terminal rules, the dispute rules, the fix loop's envelope and failure reading, the step review's rows, triage's rule citations, and the test selector with its pre-verification gate. Where a decision was tangled with a read or a routed call, the decision becomes a pure function the reader composes; the routed call is reached through the offline transport, which is the framework's own scripted-response path, so no module is mocked. The adjudication vocabulary is fixed on the record: the adjudicator's prompt and the parser agree that UPHOLD keeps the FINDING and OVERRULE clears it. One walkthrough, test/walk-verify.test.ts, drives one repository through a round that finds a Major, the dispositions, the fix, a verified round, a dispute and its adjudication, over scripted responses. The seven vitest files this covers are deleted and the integration list shrinks.

### Session 86 — Routing, transports and configuration

**Releasable: no.**

Routing, transports and configuration, rebuilt the way sessions 83 to 85 proved. The configuration layer is judged from literal inputs: the config loader's validation and precedence, the transport-timeout contract, the schema validator and its failure shape, the lockfile's hash and rows, the metrics writer's records, the runtime-mode and secret-resolver rules. Selection by role, identity resolution and the router's own dispatch are tested as pure judgements over enumerated candidates and configuration, with the routed call passed in rather than mocked -- the vi.mock of route.ts has no successor because the call is a parameter. The transports keep their one seam: the direct-API path's request shaping and result classification, the offline transport's scripted answers, and the Copilot seat's fake process through the spawner the module already exposes, with its catalog probe and lockfile reads named as thin readers over facts. Discovery and dependency resolution get the same treatment: enumeration, freshness and drift as pure functions over vendor payloads, the project-file and feed reads as thin readers. Every rewritten behaviour lands under test/ as node:test files with literal inputs and no repository unless the behaviour is about a repository; the fifteen vitest files this covers are deleted, and config.test.ts leaves the integration list.

### Session 87 — The lifecycle and the driver

**Releasable: no.**

The lifecycle and the driver, rebuilt the way sessions 83 to 86 proved. Every decision the loop makes becomes a function of facts and is asserted from literal inputs: what a session owes before it closes and what a close, a cancel and a restore are allowed to say; the check declaration's parsing, coverage and envelope, and the program a name resolves to; the driver's four answer schemas, its report validation, the plan amendment, the three watcher clocks with their recommended actions, the lease epoch's compare-and-swap and the stale-job disposition; the drive loop's instruction rendering, its refusal vocabulary over a change set, its phase order and the interrupt rules; each engine's argv, its stream rendering and truncation, its resume and its interrupt; the in-process router's working-directory and capture rules and the command line it echoes; and the workflow's fold, its record authority, its bounded loops and its projection. Where a decision was tangled with a read, a spawn or a routed call, the decision becomes a pure function the reader composes -- which is what retires the last two vi.mock calls in the suite, both of route.ts. Two walkthroughs carry what only a whole run can show: test/walk-session.test.ts drives one repository from next to done over a scripted in-process engine and recorded answers, asserting every transition as a milestone, and test/walk-jobs.test.ts walks one job through start, poll, collect and end, including a tree ended from a process that never held it. The eleven vitest files this covers are deleted and the integration list shrinks to what session 88 retires.
