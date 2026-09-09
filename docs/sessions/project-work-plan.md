# Project work plan — sessions

**Written by `dabbler` as a fold of `activity-log.json`.**
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

The numbered sessions are declared from `session-plan.md`; each one's task is what its own plan step declared.

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
| 88 | Packaging, release, bootstrap, the solution — and vitest retired | no | 2026-09-03 |
| 89 | The trial, run by the operator against what the Marketplace serves | — | not declared |
| 90 | `next` advances a session, and never starts one | no | 2026-09-05 |
| 91 | The eight papercuts the walkthrough found | no | 2026-09-05 |
| 92 | The task list says what a session is doing | no | 2026-09-05 |
| 93 | What a verification round costs, before it is spent | no | 2026-09-05 |
| 94 | Paused, not stopped — and the two green events | no | 2026-09-05 |
| 95 | The framework notices what it is not doing | no | 2026-09-05 |
| 96 | The git seam, finally used | no | 2026-09-05 |
| 97 | An ACP client, wired to nothing | no | 2026-09-05 |
| 98 | What the csv-model notes found | no | 2026-09-06 |
| 99 | What csv-model's last two sessions found, and session 98's papercuts | no | 2026-09-06 |
| 100 | The solution plan and the module manifest; the six-step workflow deleted | no | 2026-09-06 |
| 101 | Module configuration, the exception schema and the test-impact vocabulary | no | 2026-09-06 |
| 102 | Designed contracts and contract-test source | no | 2026-09-06 |
| 103 | Committed immutable packages | no | 2026-09-06 |
| 104 | The focused checkout, and the Windows preflight | no | 2026-09-06 |
| 105 | Module-scoped sessions, the hard verifier scope, the exposure manifest and grants | no | 2026-09-06 |
| 106 | The impact plan and the selected run of record | no | 2026-09-06 |
| 107 | The atomic land | no | 2026-09-07 |
| 108 | Maven parity, and the hardened profiles designed against a named customer | no | 2026-09-07 |
| 109 | Layer 3 runs, and the Solution Explorer fills itself in | no | 2026-09-07 |
| 110 | The operator's walk, driven by a browser | no | 2026-09-07 |
| 111 | The application module that can never close | no | 2026-09-07 |
| 112 | The UAT walkthroughs, and what a solution ships | no | 2026-09-07 |
| 113 | What the Maven dogfooding found — the pin the message misnames, and the JDK the scaffold assumes | no | 2026-09-07 |
| 114 | The deployables block, built | no | 2026-09-07 |
| 115 | What the Java walk found — a Maven module session that can close | no | 2026-09-07 |
| 116 | What the Java walk found — the first ten minutes | no | 2026-09-07 |
| 117 | The ignore rule that never fires | no | 2026-09-07 |
| 118 | What the framework writes before a session declares | no | 2026-09-07 |
| 119 | The sibling a Maven module cannot consume | no | 2026-09-07 |
| 120 | What a focused checkout unavoidably holds | no | 2026-09-07 |
| 121 | Two ways in — the seat and the keys | no | 2026-09-08 |
| 122 | The suite that takes the machine | no | 2026-09-08 |
| 123 | The principle, and the three commands the UI does not have | no | 2026-09-08 |
| 124 | The UAT that tests the UI, and shows its own machinery | — | not declared |
| 125 | The policy — what a module session may touch, written once | no | 2026-09-08 |
| 126 | It just works — the terminal that tells you, the Work Explorer that keeps up, the suite that leaves the machine alone, and no hooks | no | 2026-09-08 |
| 127 | Focused or global — the plan says which, one click starts it, the framework pulls | no | 2026-09-08 |
| 128 | The close that never refuses for coverage, the clone deleted, and the Copilot walk | — | not declared |
| 129 | Claude Code — the same wall through its own hooks | — | not declared |
| 130 | The UAT that tests the UI, and shows its own machinery | no | 2026-09-08 |
| 131 | The three that stop a first-time operator | no | 2026-09-08 |
| 132 | The rest of the first-run path | no | 2026-09-08 |
| 133 | The four papercuts, and the walk's own record closed | no | 2026-09-08 |
| 134 | What the verifier is told, and what it can see | no | 2026-09-09 |
| 135 | The direct-API verifier can ask for a file, and .NET gets a root | no | 2026-09-09 |
| 136 | The suite the operator cannot work through | no | 2026-09-09 |
| 137 | The page a buyer reads, the heading an operator never saw, and the block lands | yes | 2026-09-09 |
| 138 | The deadlocks that were not deadlocks, and the consent that was not asked for | no | 2026-09-09 |
| 139 | The release that carries the deadlock work | yes | 2026-09-09 |
| 140 | The phase an operator can read, the step they can see, and the second release | — | not declared |

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

### Session 88 — Packaging, release, bootstrap, the solution — and vitest retired

**Releasable: no.**

Packaging, release, bootstrap and the solution, rebuilt the way sessions 83 to 87 proved -- and then vitest retired. The packaging block's declaration and substitution, what a pack and a push refuse, the artifact record; the detection of a project's suites and its packaging from what is on disk; the bootstrap's managed body, its hook and its ignore rule; the solution manifest, its steps and its workspace; the dependency declaration, its edges and the graph over them; the release the operator authorises, router before extension; and the contract a module's declaration renders to. Each becomes a decision over facts wherever it is one, with the disk read and the `node -e` stand-ins for pack and push kept as they are -- they were never the build tool. One walkthrough, test/walk-bootstrap.test.ts, takes one directory from nothing: bootstrapped, its suites and packaging detected, its first projection written and its release tag planned. Then the retirement: test-vitest/ is deleted whole, the live reachability tier moving to test/ under the same explicit opt-in so it is retired rather than lost; both vitest configs, the vitest dependency and the two vitest npm scripts go; test.yml runs node --test alone; dabbler.yaml declares one router suite. Last, the new corpus is read adversarially against itself -- what a pure test fails to hold, what a walkthrough skips, which asserts are tautologies -- and the real findings are fixed in this session. The verifier that reads it is chosen by role and provider exclusion rather than pinned to a named model, because no verb pins one; that difference from the session plan's wording is on the record here rather than papered over.

### Session 90 — `next` advances a session, and never starts one

**Releasable: no.**

Make `dabbler session next` advance a session and never create one. Driver.register() currently calls start() whenever a call names --engine and no close is being collected, which includes the case where nothing is in flight -- so an engine that re-runs the command line it was launched with, once, after `done`, registers and starts the next session unasked; and an engine that correctly drops the flags instead gets a usage refusal, so both endings of the documented loop are wrong. The registration decision becomes a pure function over three facts (engine named, session in flight, uncollected close) and register() composes it: a re-registration of the session in flight stays exactly as it is, a call naming --engine with nothing in flight is refused with the sentence that says `dabbler session start` is the door in, and a flagless call with nothing in flight returns a done-shaped instruction and exit 0 so a loop told to run 'until it says done' can terminate cleanly. `session drive` binds the session number it registered at launch and exits when that session completes rather than inferring another start. The extension's launch prompt and the managed guidance change in the same session, so no window exists in which the old prompt still starts unrequested work.

### Session 91 — The eight papercuts the walkthrough found

**Releasable: no.**

The papercuts the operator's CSV walkthrough found, each independent and each verifiable by looking at it. `solutionDeps.loadDeps` coerces an explicit JSON `null` to the string "null" for `feed` and for `repositoryId`, so `check` reports a feed nobody configured; both become null-safe (finding 5). The Solution Explorer's member rows carry no `contextValue` and `repositoryPathOf` answers only for `external` nodes, so the "Solution repositories" list cannot be opened; both are extended with the same three-valued location the external rows already gate on (finding 8). Start Session becomes reachable from the session row that IS next, gated on the repository having nothing in flight -- narrower than the plan's "a planned session row" because `session start` can only register the next session, and a menu item on session 94 that starts 91 would be a lie; the operator's own wording of finding 9 says "the next session" (finding 9). The Solution Explorer watches one file that only four commands rewrite, so it is stale by construction during a session; it watches the declarations the projection derives from as well and re-derives through the in-process router before refreshing, because refreshing over an unrewritten file re-reads the same bytes (finding 7). The Dabbler terminal reveals itself, without taking focus, when a session goes in flight for a repository this window shows -- which is the case the plan's item 6 is about: a session started in the operator's own CLI, where nothing in the extension was the thing that started it (finding 1). Two steps are additions to the plan's list and are declared here rather than taken silently. The first is an argv entry point for the extension's mocha suite: a plan check is argv spawned with no shell, `npm` is a shim argv cannot reach on Windows, and mocha under `ts-node/register` resolves its tsconfig from the working directory -- so without a runner the extension steps have no honest mechanical check. The second is a repair of `dabbler.yaml`'s selection map: session 83's rebuild deleted `contracts.test.ts`, `record.test.ts`, `lifecycle.test.ts`, `lifecycleCli.test.ts`, `projection.test.ts`, `runtimeMode.test.ts`, `secretResolver.test.ts` and `verify.test.ts`, and the map still names all eight -- including as the `smoke` fallback, which is what an unmapped path falls through to. This session changes `solutionDeps.ts` and `index.ts`, and both land on that fallback, so its own pre-verification evidence depends on the repair.

### Session 92 — The task list says what a session is doing

**Releasable: no.**

The task list says what a session is doing, and the run of record covers the router again. First, and ahead of the plan's own findings: the router suite is declared `expensive: true`. That flag gates two things at once -- `drive.expensiveSuites()` filters the run-of-record phase by it, and `testEvidence.evaluateFreshness` skips a non-expensive suite outright -- so the run and the gate that would notice the run is missing are keyed to the same switch, and the router's 1117 tests have not been a run of record since 2026-09-02. Session 83 set the flag correctly when vitest was the expensive tier beside it; session 88 retired vitest and the survivor kept a flag whose meaning died with the tier it was defined against. It goes first because the run-of-record phase reads configuration on each invocation, so this session's own tail runs under the correction. Then the findings. The six task rows are relabelled in the operator's words -- Register, Plan declared, Work, Verify, Test, Close -- with the step ids on disk untouched, because a label is what a reader sees and an id is what the plan, the record and the CLI address (finding 16). The Work row expands to one row per approved-plan step, each done when its step id appears in the driver's `accepted_steps` and each carrying the derived id `work:<step-id>`, so the row set stays addressable and every row is still a reading of a record rather than something an engine ticks; a session with no plan yet keeps one placeholder row (findings 14 and 15). Last, the component workflow stops claiming a step it has not taken: `1/6 Plan and design` renders on a bootstrapped repository forever because the manifest's default step is projected whether or not the workflow has been entered, and nothing in the session lifecycle advances it. The projection says which components have folded state, and the N/6, the progress bar and the contract row's 'written in Step 3' go quiet for those that have none -- hidden rather than deleted, because the workflow's fate is decided with the packaging block.

### Session 93 — What a verification round costs, before it is spent

**Releasable: no.**

What a verification round costs, on the record before it is spent again. One 20-minute trial session charged 364 premium requests on the operator's personal seat, and the record cannot explain it: `rounds.jsonl` carries `verifier_model` and nothing about how that model was chosen, so nothing says why a weight-1 named candidate lost to `gemini-3.5-flash` at weight 14, and nothing counts the agentic turns that turned 3 rounds into 26 billed calls. Four changes, and each is a fact the framework already has and does not keep. The round records the model that was WANTED beside the one that was SERVED -- `served_model_id` is already read off the wire and already known to differ, and it is dropped on the floor at the append -- together with how the candidate was reached: its rank in the role's preference order, or that it was reached by falling past the end of one. The round records what it cost: input and output tokens for an API call, premium requests for a seat call, and the agentic turn count, all of which arrive in the dispatch metadata and none of which survive into the ledger. A model that no role's preference order names is no longer reachable by preference silently falling through to it -- `resolveRole` ranks an unnamed candidate at `prefer.length`, which sorts it last and leaves it fully eligible, so a role whose named candidates are all filtered out selects a stranger and says nothing; the fall-through stays possible, because a hard filter would end cross-provider verification the first time a preference order named only excluded providers, but it becomes a decision the record carries rather than a sort order nobody can see. And the seat is asked for its own numbers through `--usage-output-file`, which the installed CLI supports, so the premium count comes from the vendor rather than from arithmetic over a probe sample. One step beyond the plan's list, declared here rather than taken quietly: session 92's own verification raised a nit it was not blocked on -- `taskDescriptor` builds a task row's VS Code identity from `row.position`, and 92 made positions shift when a work plan appears, so Verify, Test and Close change identity mid-session and the tree loses its expansion and selection state. The row already has a stable identity in `stepId`, and it costs four lines to use it.

### Session 94 — Paused, not stopped — and the two green events

**Releasable: no.**

Render a stop for a person from one router-owned function, and say the two honest green things. `renderStop(stop, run)` in driver.ts turns the unchanged record (kind, class, reason, step_id) into words that say the session is PAUSED, what happened in plain language, that this command has ended while the session remains in flight, and who is expected to act next -- never that the engine is working on it, which under the pull the framework cannot see; a deadlock stays named. The driver's stderr line, the stop's owed decision, the `dabbler status` task row and the Dabbler terminal all consume it. `progressResumed(before, after)` is the one rule for the first green event -- a standing stop gone AND the phase advanced, with no replacement -- emitted by the driver as `progress-resumed` (log and supervision row) and by the terminal from the record; `decision-answered` is said by the terminal when an owed decision folds to `answered`. The managed body gains the general rule the wait sentence only implied: the framework owns the clock, the state and the sequencing, and an instruction that names a command is answered by running it, never by waiting on a condition your own next call causes; AGENTS.md is regenerated by bootstrap. The walkthrough doc's stop specimens are re-rendered. Not releasable.

### Session 95 — The framework notices what it is not doing

**Releasable: no.**

The framework notices what it is not doing. Four gates, the map beneath them, and two papercuts from session 94's own conduct, none of them a hazard anybody imagined. The Claude Code stop gate holds the turn once a `wait` is past `issued_at + retry_after_seconds`, in the sentence it already uses, and lets a turn end while one is not yet due, saying when it is. A job that finished and nobody collected -- `jobs/<name>.status.json` on disk, `run.json` still naming it -- is read by one router-owned rule and worded once beside `renderStop`, and `dabbler status`, the Work Explorer's liveness row and the Dabbler terminal consume that wording rather than saying `working` over a process that has exited. `phaseRunOfRecord` skips a suite that already holds a green `final-full` record bound to the tree in hand -- the fact `evaluateFreshness` reads -- so a two-suite walk collects its second suite instead of re-running its first forever; the whole-session walk declares two expensive suites and polls on a deadline with a pause rather than sixty spins. `loadSuitesChecked` refuses a suite that is not `expensive` and covers a path no expensive suite reaches, naming it, because such a suite is never the run of record and nothing would notice the run was missing. A control inside the existing lint control audits `dabbler.yaml`'s selection map against what each named test file actually imports, and the one wrong mapping session 93 found -- `selection.ts` selecting a test that never imports it -- is corrected along with whatever else the audit finds. And `dabbler bootstrap` leaves the files it wrote uncommitted while a session is in flight, saying so, because the land phase is what commits them. Not releasable.

### Session 96 — The git seam, finally used

**Releasable: no.**

Use the git seam the tests never used. `journal.setGitSource` is the one seam every git call in production goes through; `test/support/answers.ts` already wraps it as `gitAnswers`, and ten non-walkthrough test files still build real repositories (`makeRepo`/`makeSandbox`) to reach things that are not git: the in-process router, the CLI surface, the release brief, the watcher, the test hand-off, the check executor, bootstrap and packaging. Those sites are routed through the seam -- a seeded directory answering git's questions from a table -- so a test that is not about git spawns no git; the few assertions in them that ARE about git (a commit left alone, a refspec taught to a clone, a temporary index that leaves the real one untouched, the pre-verification gate measured against a real change set) move into the walkthroughs that already own real repositories, `walk-bootstrap` and `walk-git-states`. The measure is mechanical and stays: a preload `test/support/no-git.ts` fails any worker outside a `walk-*` file the moment it spawns git, and `dabbler.yaml` runs the suite under it and drops `--test-concurrency=4`, which was a throttle on git storms that no longer happen. fixloop's `makeRepo` is its own seeded directory and already spawns nothing; the plan's count included it. Not releasable.

### Session 97 — An ACP client, wired to nothing

**Releasable: no.**

An ACP client, wired to nothing. One new module, `packages/router/src/acp.ts`, states the engine interface the framework actually needs -- open a conversation (fresh, or resumed BY ID), send one message, receive structured events, cancel mid-turn, close -- and carries two implementations of it: the Agent Client Protocol over stdio JSON-RPC (what `copilot --acp` speaks; measured on CLI 1.0.83: `loadSession: true`, session list and close, embedded context) and Claude Code's `--input-format stream-json` / `--output-format stream-json`, written as an implementation of the same interface and not a special case. What the client does when an agent asks permission is a stated policy on the connection (allow every tool once, or deny every tool), never a prompt forwarded to nobody, and a request that arrives after a cancel is answered `cancelled`. One verb, `dabbler agent`, opens a conversation, sends one prompt, prints every event as one JSON line, and closes; it is called by no phase, gate or lifecycle path, and `engines.ts`, verification and `session drive` are untouched. The tests exercise both implementations against scripted peers; the live run against the real seat is a walkthrough recorded in `docs/acp-walkthrough.md`. Two papercuts session 96 found are fixed here: (a) under the pull a `fix-run-of-record` step was never judged -- the run record now carries the synthesised step it is waiting on, the loop judges it before any phase's own work and its acceptance sets the phase the step names, proved by a walk-session test with a red run of record, a fix and a second verification round in that order; (b) the suite's temp root is swept of what earlier runs left behind, in `repo.ts` and `answers.ts` only. Not releasable.

### Session 98 — What the csv-model notes found

**Releasable: no.**

Fix what the csv-model test repository's framework-notes found on router 2.0.1, each confirmed in this tree: the local gate receipt names the branch HEAD is on and refuses to write when HEAD is detached; the Claude Code stop hook is installed whenever a session registers with --engine claude-code, not only when bootstrap ran under Claude Code; session start ends by naming `dabbler session next` instead of the typed declare/affected recipe; every job the driver spawns carries DABBLER_DRIVEN=1 and verify under it prints the verdict and 'the driver runs the rest'; a read of the Copilot transport's own handoff file is recorded as transport plumbing rather than an out-of-scope read; one live gpt-5-mini call captures what Copilot CLI 1.0.83's view tool returns and readFidelity is made to grade that shape, or the round says fidelity is not measurable on the transport once; `dabbler version` and `dabbler --version` print the router's version and the extension's when inside one; the work-plan view stops claiming a plan prose the pull never records (decided: the section is rendered only when `session plan` recorded one, because folding each session's task paragraph into 'the plan' would make the project plan read as whichever session ran last); and the guidance says what the code does -- no promise that next runs the affected tests, `start` registers and `next` never does, interrupt is drive-only, run-started under the pull names the mode and no invocation bound, the template's selection comment says `when` is a path prefix and names the four control kinds, a deleted file is a change to name -- followed by a re-bootstrap of this repository's managed guidance. Not releasable.

### Session 99 — What csv-model's last two sessions found, and session 98's papercuts

**Releasable: no.**

Session 99: Fix what the csv-model test repository's sessions 5 and 6 found on routers 2.0.1 and 2.0.2, and the papercuts session 98's own close recorded, each confirmed in this tree: the packaging detector reads a root solution file and names the one packable project below it instead of saying a pack would fail; `dabbler packaging --dry-run` says 'no gate was asked' beside a releasability refusal rather than that every gate passes, exits 0 when the declaration loads and releasability is the only obstacle, and its help and the scaffolded packaging comment say a folder feed takes no credential; the selector treats the framework-installed `.claude/settings.json` as mapped to no test and `session start` says the file lands with the session's commit; `dabbler bootstrap` runs `git init` where there is no repository and says a remote is needed before the first close, and the sessions-root error names `git init` rather than `--sessions-dir`; the agency record checks the disk before the framing (a missing file is recorded as missing), records a `view` of a directory as a listing, and says when a shown line is the disk line cut short; the synthesised fix step stops promising the affected tests, the projection note names `dabbler`, candidate mode reads the trunk from the receipt's branch rather than the literal `origin/master`, and the atomic write retries a rename once on a Windows EPERM or EBUSY; the run-of-record wait takes its `retry_after_seconds` from the suite's last recorded duration (a quarter over, floor ten seconds, ceiling sixty); and the guide and the plan ask say what the code does -- four instruction kinds under the pull and `interrupt` only from `drive`, a check's built environment sees no credential while a job inherits the shell, when a plan names `repositories`, that ignored build output does not move the tree, that the registration write is in the change set `affected` measures, and that `retry_after_seconds` is advice the driver does not hold anyone to. At most nine router tests, one per behaviour; the managed body does not change. Not releasable.

### Session 100 — The solution plan and the module manifest; the six-step workflow deleted

**Releasable: no.**

Extend the module manifest (docs/modules.yaml, modules.ts) with kind, dependsOn, package and contract, derive consumers transitively, and make one module the default shape through one function, solutionShape, that every later session asks: an absent manifest or one entry is a single-module solution whose repository IS the module, so csv-model and every repository bootstrapped so far keep working unchanged; the manifest verb gains the new flags and a `show` subcommand. Replace the six-step workflow's projection with one over modules (projection.ts: dependency order, dependsOn and derived usedBy, the secondary mode's external and members kept) and point the driver, deps and bootstrap at it. Bootstrap writes a valid one-module manifest by default and its two setup sessions are rewritten around the solution plan (docs/planning/solution-plan.md, one module a fine answer, session 2 challenging the cuts and naming one module per session), carrying the plan, decompose and contracts deliverables the workflow held. Delete the six-step component workflow -- solution.ts, cli/workflow.ts, cli/solution.ts, workflow/*, stepreview.ts, testphase.ts, fixloop.ts, their tests, the workflow and solution verbs, the solution.yaml scaffold and this repository's own solution.yaml, the selection rules naming the deleted tests -- with contractdoc standing alone until session 102. The Solution Explorer renders modules from the projection: rows in dependency order with depends-on and used-by children, one row for a single-module solution, the empty state naming session 1, and New Module offering kind and dependsOn. About five router tests and three extension tests, one per behaviour; the walkthrough test is unchanged. Not releasable.

### Session 101 — Module configuration, the exception schema and the test-impact vocabulary

**Releasable: no.**

Give the test declaration and the session the module vocabulary, with nothing changing for a single-module solution. A suite in dabbler.yaml may say which module it proves (`module`), what it is (`role`: unit | provider-contract | consumer-contract) and, for a consumer-contract suite, which provider it runs `against`; `requiredForClose` becomes its own word beside `expensive` (default the same value), read by the freshness gate so a suite can be run and recorded as information without being the close's obligation; when solutionShape is single the module fields are not consulted. The work plan gains `modules` and `reason` (a reason required when more than one module is named; an undeclared slug refused at acceptance by name); in a multi-module solution the accepted modules go on the session record and `dabbler status` prints them, and a single-module session's record carries no `modules` member. The root dabbler.yaml gains a `modules:` mapping keyed by slug (`packaging` in the root block's shape, `sharedFiles`, `contract.generate`), refused for a slug the manifest does not declare; `loadDeclaration` answers a module's packaging block for its slug and the root block otherwise, and `{version}` joins the substitutions. Selection gains the module form: a changed path maps to the module whose codeRoots contain it (or whose sharedFiles name it), selecting that module's suites and each transitive consumer's consumer-contract suite against it; a rule may `select` a `{module: <slug>}`; `dabbler affected` prints the modules reached and the suites selected whole; single-module selection is the file form as today. About seven router tests, one per behaviour. Not releasable.

### Session 102 — Designed contracts and contract-test source

**Releasable: no.**

Give a module a designed contract, .NET first, behind an ecosystem seam born here. ecosystem.ts names the two ecosystems (dotnet, maven) and chooses one per module from what its roots contain; every ecosystem-specific decision of the block is a method of it, with the Maven side refusing by name until session 108. The contract bundle has one shape: modules/<slug>/contract/README.md is the human notes page, and for a designed or generated contract <Package>.api.md is the public surface with its doc comments. `dabbler contractdoc --module <slug>` renders that bundle: the notes page from a contract.yaml beside it when one exists, the surface read from the abstractions project's source and marked designed, or the output of modules.<slug>.contract.generate marked generated from the built assembly; a module with a declared contract and no notes page is refused naming the path, and the file form of the verb is unchanged. A new `dabbler module contract <slug>` scaffolds the designed seam for a .NET module -- <Package>.Abstractions, <Package>.ContractTests with an abstract xunit class, the implementation's test project inheriting it, and the notes page -- each written only where absent, and `--against <provider>` scaffolds a consumer compatibility test project that references the provider's package and never its source. In a multi-module solution a suite's covers gain modules/<slug>/contract/ by derivation so a contract change moves the suite's freshness; a single-module solution derives nothing and is asked nothing. Six router tests, one per behaviour; no test runs dotnet, and the real build is a step's own check against the POC repository. Not releasable.

### Session 103 — Committed immutable packages

**Releasable: no.**

Make a module's package a committed, immutable artifact its siblings consume, .NET first through the ecosystem seam, with nothing asked of a single-module solution. When the manifest becomes multi-module the root build files appear where absent and are never rewritten: nuget.config with the packages source by relative path, Directory.Packages.props with central management on, Directory.Build.props with Source Link off under DABBLER_DRIVEN, Directory.Build.targets importing the untracked .dabbler/overlay.targets when it exists, packages/.gitattributes tracking *.nupkg with LFS above the ceiling, and packages/README.md. `dabbler module pack <slug>` produces the immutable dev package: the version is <base>-dev.<yyyymmdd>.<n>.g<digest> -- base from the project, the date UTC, n the next number for that date from the correspondence records, the digest the first seven hex characters of the module's source tree digest -- so two packs of one tree are one version and a moved tree is the next number; it runs the module's packaging.pack argv with {version} or the .NET default, packs every packable project under the module's roots under the one version, writes the pin as the one unconditioned PackageVersion in Directory.Packages.props (a conditioned or duplicated entry refused by name, the XML around it preserved), and records packages/<Package>.<version>.json -- the source digest, the contract digest, the version, the session number and the base commit -- so source, contract and package correspond exactly; a module whose source is not on disk is refused with the grant named as the way to it. modules.packages.ceilingBytes (default 5 MB) refuses a package over it unless packages/.gitattributes tracks *.nupkg with LFS, naming both ways out. Six router tests over a scripted dotnet; the real pack against the POC repository is a step's own check. Not releasable.

### Session 104 — The focused checkout, and the Windows preflight

**Releasable: no.**

Give a module of a multi-module solution its focused checkout -- a disposable, blob-filtered, sparse clone that holds the module's source, the root build files, the committed packages, the framework's record under docs/ and its siblings' contract folders, and never a sibling's source -- and measure it on Windows, with nothing asked of a single-module solution. checkout.ts (a new module, paid for by the deletion) derives the cone from the manifest: the module's codeRoots, packages/, docs/, modules/<dep>/contract/ for each transitive dependency, modules/<consumer>/contract/ for each transitive consumer, and the directories of the module's sharedFiles; the root build files ride along as cone mode delivers every root-level file. `dabbler module open <slug>` clones the repository's origin blob-filtered, sparse and unchecked-out under modules.checkout.parent (default beside the repository, as <repo>.<slug>), sets the cone, checks out the trunk or the branch --branch names, writes the ecosystem's convenience file at the clone's root (.NET: <slug>.slnf filtering the root solution file, or <slug>.slnx listing the module's projects when the root has no solution to filter) and Claude Code's working-directory block in .claude/settings.local.json (the project-local file, since a repository may track .claude/settings.json), keeps both out of the clone's tracked files through .git/info/exclude, and prints the path as JSON; --reset on an existing clone fetches, resets to the trunk and re-narrows the cone; a single-module solution is refused -- the repository is the module, open it. The extension gains Open Module on a module row: module open, then a new window at the path. `dabbler module preflight <slug>` times on this machine the clone and sparse checkout, dotnet restore, build and test in the clone, the same on a --reset of the clone, and five clones in sequence, with Defender's real-time scan as it is; the numbers and the decision -- a fresh clone per session, or the persistent per-module clone reset at open -- are recorded in docs/design/module-checkout-preflight.md and module open's default for an existing clone follows the decision. Three router tests (one of them a walkthrough over a local bare origin) and one extension test; the preflight is a recorded run, not a test, and no test runs dotnet. Not releasable.

### Session 105 — Module-scoped sessions, the hard verifier scope, the exposure manifest and grants

**Releasable: no.**

Make a session on one module of a multi-module solution run in that module's focused checkout and be scoped to it, with nothing asked of a single-module solution. The verifier's scope gains a module form: the module's codeRoots, its own and its dependencies' contract folders, the root build files, its sharedFiles and the sessions directory -- never a sibling's source -- and, because no transport lets the framework refuse a read in flight (the Copilot CLI runs its own tools and the API transport sends none), the wall is the disk: in a focused clone a sibling's implementation is absent, an out-of-scope read that found no bytes is recorded refused rather than delivered, rounds.jsonl gains refused_reads beside out_of_scope, and the briefing tells the verifier that a path outside the checkout is not there; a refusal is not a finding against the tree. The exposure manifest (.dabbler/runs/s<N>/exposure.json, exposure.ts) records at session start and at the close, for each sibling, the implementation bytes present under its codeRoots in the session's working directory (contract/ excluded, target zero), the grants in force with their reasons, and the files changed outside the session's scope; dabbler status prints it for the session in flight. `session start --module <slug>` in the full checkout of a multi-module solution opens the module's fresh focused clone, registers the session in the clone's own sessions root, records the checkout on the session record and leaves a marker in the full checkout, so that `next` there refuses to advance and names the clone while the module session is in flight. `dabbler module grant <sibling> --reason ... [--debug]` raises an owed decision (module-grant:<sibling>, default deny) that the operator answers through dabbler owed answer or the extension; on grant the framework widens the cone to the sibling's codeRoots, with --debug lays the untracked .dabbler/overlay.targets that turns the sibling's PackageReference into a ProjectReference for this clone only, records the grant in the exposure manifest and says the window reloads; revoke refuses while the sibling's roots hold changes, removes the overlay, re-narrows the cone and records it; a `next --request-grant <sibling> --reason ...` in a module session raises the same decision and answers with a wait on it. The Work Explorer groups a bucket's sessions under their module when the record names one and leaves a single-module repository ungrouped, a grant request renders as the owed decision it is on its session with grant and deny as the answers, and the Solution Explorer's module row gains Widen for debugging and End grant with a badge while a grant is in force. Eight router tests (two of them walkthrough milestones over the local bare origin) and two extension tests. Not releasable.

### Session 106 — The impact plan and the selected run of record

**Releasable: no.**

Compute one impact plan for a change in a multi-module solution and make it the run of record, with nothing asked of a single-module solution. impact.ts (new, paid for by the deletion) derives from the manifest, the declared suites and the changed paths: the modules the change reached (a path under a module's roots or among its shared files), each one's unit and provider-contract suites, each transitive consumer's consumer-contract suite against a changed module, every transitive consumer's suites when a shared-types module changed, the changed modules whose candidate must be packed first, and the paths that belong to no module; a single-module solution's plan is every suite the close requires, as today. `dabbler affected` prints the plan and nothing computes it a second time: the selector's module form takes its suites from it. In a module session the run of record first packs each changed module's candidate and regenerates its contract page as one job whose output is on the record (`dabbler module candidate`), then runs only the suites the plan reached, whole, as final-full, with per-suite freshness as today -- the package folder and the contract folders sit under the consuming suites' covers, so the candidate is inside the digest -- and writes the plan beside the run so the close gate test_run_fresh demands the reached suites and no other. The Solution Explorer's module row reads its run of record (green, red or none) from the latest final-full records of its suites, a consumer whose contract suite is red against a producer reads blocking under that producer's used-by, and Show Impact on a module row runs `dabbler affected --path` for a hypothetical change under its roots and shows the plan. Four router tests (two of them walkthrough milestones over scripted suites and a scripted pack) and two extension tests. Not releasable.

### Session 107 — The atomic land

**Releasable: no.**

Make the land atomic: the bytes the run of record tested are the bytes that land, and nothing else does. The land refuses when the tree it is about to commit is not the tree the last green run of record ran against, naming the paths that moved; when a changed module's correspondence record (source digest, contract digest) does not match the tree; or when any suite the impact plan reached is stale -- direct push or the candidate branch as today, and the gate receipt then maps the landed commit to each correspondence record it carries. Two gates join the close: pins_current -- every consumer's pin of a changed module is the one central PackageVersion naming the candidate this session packed, and no consuming PackageReference carries a Version or VersionOverride of its own -- and exposure_within_ceiling -- the closing exposure manifest shows zero sibling implementation bytes outside a recorded grant and no file changed outside the session's scope; both are single-module no-ops that say so in the close log. A releasable session on a module publishes through its own modules.<slug>.packaging, and a releasable session on an application module also writes release/<bundle>/bundle.yaml -- the application's version, each dependency's package id, version and digest as pinned, the source commit and the date -- refusing while any pin is a -dev version; bundling is recorded, never executed, and the Solution Explorer gains a bundles node and each module's shipped-in derived from the records. Four router tests over pure judges and seeded trees, one extension test. Not releasable.

### Session 108 — Maven parity, and the hardened profiles designed against a named customer

**Releasable: no.**

Maven parity through the ecosystem seam, and the hardened profiles designed against a named customer. Every .NET-specific decision of the modules block is a method of the ecosystem seam (ecosystem.ts), and the Maven side of each has refused by name since session 102; this session fills it, and moves the remaining .NET-specific reads (the base version, the packaged artifact's path, the central pins, a consumer's references, the LFS pattern, the debugging grant's overlay) behind the seam so no caller outside it knows which ecosystem it is on. Maven: the root files are a parent pom.xml with <modules>, the CI-friendly ${revision} version, a <repository> of file://${maven.multiModuleProjectDirectory}/packages and the deploy and flatten plugins managed, plus packages/.gitattributes and packages/README.md; a module is built from its own POM (mvn -f modules/<slug>/pom.xml, the parent reached by relativePath), which is what a focused clone can do without every listed sibling on disk; the pack default deploys the module's artifacts into packages/ under the dev version (-Drevision, -DaltDeploymentRepository against the file repository, tests skipped, one reactor build per module) and the artifact is looked for at its Maven layout path; the pin is one managed <dependency> in the parent POM's <dependencyManagement>, and a consumer's <dependency> carries no <version> of its own; the contract scaffold is an <artifact>-api module and an <artifact>-contract-tests module with an abstract JUnit class, and a compatibility module against a provider's artifact; the surface reader reads public declarations and Javadoc from the api module's source; the focused checkout's convenience file is .mvn/maven.config with -f modules/<slug>/pom.xml; and the grant has no overlay (Maven loads no external profile), so a granted sibling with --debug is rebuilt from its source into the file repository by module pack and the consumer resolves the fresh artifact. A Maven package id is groupId:artifactId. Then docs/design/hardened-profiles.md: what a customer who needs sibling source hidden from a machine rather than from a model is asking for, the two profiles (encrypted custody with an external key and authenticated encryption, never a one-time pad; a container per session), what each costs an ordinary .NET team, the trigger for building one (a named customer with the requirement in writing), and the seams in this tree it would attach to; its check is that every path it names exists. Three router tests over scripted programs; no test runs dotnet or mvn. Not releasable.

### Session 109 — Layer 3 runs, and the Solution Explorer fills itself in

**Releasable: no.**

Fix three measured defects: register GPT Terra as the router's preferred verifier ($2.00/$12.00 per 1M tokens vs Sol's $5.00/$30.00) so this session's own verification runs on it; make the Solution Explorer derive its projection once at construction when none is on disk yet, so a fresh clone of an already-set-up multi-module repository does not sit on the welcome text until a manifest or build file happens to change; and correct the Layer 3 Playwright harness's two stale selectors (the activity-bar icon and the pane header) that have kept the electron suite from ever going green, then run the suite for real.

### Session 110 — The operator's walk, driven by a browser

**Releasable: no.**

Land the CSV four-module walkthrough as a browser-driven check: a committed corpus stager for the model/deserializer/persister/app decomposition (siblings consumed as packages, never a spanning solution file), a single WALK_STEPS list under the Playwright layer that a new spec drives end to end (container, Solution Explorer decomposition, Work Explorer grouped by module, the two side-by-side idle-CLI/Dabbler-terminal editor tabs) with a screenshot per step, a tutorial document rendered from that same list so prose and automation cannot drift, and the fix to work-explorer-tree.spec.ts's stale per-plan-step task-row assertions so the whole Layer 3 suite matches the six fixed lifecycle rows (Register, Plan, Work, Verify, Test, Close) the unit suite already covers.

### Session 111 — The application module that can never close

**Releasable: no.**

Fix candidateSubcommand in packages/router/src/cli/module.ts so an application module's bundle record is written only when the session that asked for the candidate declared itself releasable, mirroring drive.ts's bundleCandidates (which already calls sessionIsReleasable before naming any application to bundle). module pack only ever writes dev-versioned pins and nothing in this repository releases a user's module, so the ungated write refused every not-releasable session that touched an application module, forever. The package-less skip (an application with no package has nothing to pack or contract) now applies unconditionally, outside the releasability gate, so a not-releasable application session's candidate still succeeds and simply writes no bundle. Add two tests to packages/router/test/cli.test.ts: a not-releasable session's candidate succeeds with no bundle record, and a releasable session's candidate still writes the bundle for a released dependency and still refuses a dev-versioned one.

### Session 112 — The UAT walkthroughs, and what a solution ships

**Releasable: no.**

Land the two dogfooded UAT walkthroughs (.NET and Java) verbatim under docs/uat/, link them from README.md the same way docs/quick-start.md and docs/driving-a-session.md already are, confirm the .NET document's two opening commands still behave as written, and write docs/design/deployables.md recording the design for a deployables: block -- what it would declare, the four rules it would hold to, and what it explicitly is not -- with no change to the manifest reader or any other implementation.

### Session 113 — What the Maven dogfooding found — the pin the message misnames, and the JDK the scaffold assumes

**Releasable: no.**

Fix the two defects the Java/Maven dogfooding found and correct the walkthrough that currently instructs the reader around them. (1) The pin file: Ecosystem.writeCentralPin already returns the repository-relative file it wrote and packModule throws it away, so cli/module.ts prints 'pinned <ids> in Directory.Packages.props' on a Maven solution -- where the pin really moved the root pom.xml -- and, worse, seeds candidateSubcommand's written set with that same literal, so the candidate record names a file that does not exist and the land's verification gate sees the root pom.xml as a tree that moved after verification with nothing accounting for it. Carry the seam's answer on PackResult as pinFile, print it in both messages, and record it as the path the candidate wrote. (2) The scaffolded root POM hardcodes maven.compiler.release 21, so every Maven solution scaffolded on an older JDK fails to build until the developer finds and edits that line; derive it from the JDK doing the scaffolding through a settable source, fall back to a stated 17 when java cannot be run, and say which happened in the scaffold's notes and in the POM's own comment. (3) Correct docs/uat/uat-java-json-solution.md where it works around both, leaving the rest of the document as the artefact under test.

### Session 114 — The deployables block, built

**Releasable: no.**

Build the deployables: block docs/design/deployables.md designed and deliberately left unbuilt. The manifest reader gains a top-level deployables: list (slug, title, kind service|job|cli, from, runtime container|archive|installer, publish) with the same refuse-by-name discipline modules[] already has, plus two refusals of its own: a from naming a module the manifest does not declare, and a from naming a module whose kind is not application. Which deployables a module feeds is derived and never declared, exactly as usedBy is derived from dependsOn; a manifest with no block reduces to today's bundles, one implied deployable per application module named after it, so a solution that ships what it ships today declares nothing new. The bundle record is keyed by the deployable rather than by the application module, its dependency list the union of the transitive dependencies of every module in from -- safe because a package has exactly one central pin -- and it carries the modules it was built from; a deployable whose from modules declare different versions is refused by name rather than silently taking one, and a deployable with an empty from writes no record at all. `dabbler modules show`, `dabbler affected`, the Solution Explorer's projection and its bundles node say what ships and what nothing ships yet. No build orchestration, no artefact hosting, no push of a deployable, and no inference of kind or runtime from a project file.

### Session 115 — What the Java walk found — a Maven module session that can close

**Releasable: no.**

Fix the three defects the Java/Maven walk measured on 2026-09-07, none of which a test in this repository could have caught because no test runs mvn. (1) A Maven module session cannot close: mvn deploy leaves a POM and a .md5/.sha1 beside every artifact, packModule records only the one artifact the seam went looking for, and the close then refuses both verification_clean (the tree moved after verification) and exposure_within_ceiling (paths outside the session's scope). The candidate becomes what the pack LEFT -- the packages folder snapshotted before and after -- and a module session's scope carries the packages folder, while the framework's own .dabbler/ state is never counted as the session's change. (2) A module session's run of record ran nothing: reachSuites reaches a suite only when it names the changed module, and the suite bootstrap scaffolds for Maven names none, so the driver skipped it and the close's freshness gate demanded nothing. A suite that names no module is repository-wide and is reached by any change. (3) A pack of an unchanged Maven module mints a new version every time, because mvn writes target/ and .flattened-pom.xml inside the module's own code root and nothing ignores them; the Maven root scaffold writes the .gitignore that stops it.

### Session 116 — What the Java walk found — the first ten minutes

**Releasable: no.**

Fix the four things the Java/Maven walk hit before a line of code was written, and correct the two UAT documents where the walk proved them wrong. (1) The driver's plan instruction lists the members a work plan carries and never mentions `modules`, which driver.ts refuses the declaration without in a multi-module solution -- so an engine following the instruction it was given is refused every time, and a second identical refusal is a deadlock. (2) `dabbler bootstrap` run while a session is in flight but undeclared says its files are left for the land to commit; the declaration then refuses the dirty tree, twice, which is a deadlock -- before the declaration the operator is who commits them, and the message must say so. (3) The recommended answer to the testing-suites decision could not be taken in a repository with no dabbler.yaml (it refused, naming two causes and not the real one), and once bootstrap had written the file WITH a maven suite in it, answering again appended a second identical suite. (4) The documents: neither says to run `dabbler bootstrap`, the .NET one tells the reader to hand-write a state file the router owns, and the Java one has the reader write Item.java two steps before the session whose plan says to write it -- which cost that session a blocking Major and a dispute.

### Session 117 — The ignore rule that never fires

**Releasable: no.**

Make session 115's Maven ignore rules reach the flow they were written for. Re-walking the corrected walkthrough on the router built from session 116 showed the fix never fires: the walkthrough now runs `dabbler bootstrap` first (which is session 116's own correction), bootstrap writes .gitignore carrying its .dabbler/ rule, and rootFilesMaven's writeIfAbsent then skips the file -- so target/ and .flattened-pom.xml stay untracked inside the module's code root and the same tree still packs to a new dev version every time (measured: 0.1.0-dev.20260907.1.ga6aac5f, then .2.g6bf2ac2). A .gitignore is a list of independent rules with no owner, not a document this framework authors, so the scaffold ensures the rules the way ensureGitignore already does for bootstrap's own: append what is missing, leave an equivalent rule alone, create the file only when there is none.

### Session 118 — What the framework writes before a session declares

**Releasable: no.**

Say what the framework's own writes mean for a session that has not declared yet, wherever the framework makes them. Session 116 fixed this for dabbler bootstrap; the walk of 2026-09-07 fell into the same hole one verb over, because `dabbler session start` raises the testing-suites decision and answering it writes the tracked dabbler.yaml, after which the declaration refuses the dirty tree with nothing having warned that it would. The predicate bootstrap grew inline -- a session is in flight and has not declared its task -- and the sentence that follows from it move to writers.ts beside readTaskDeclaration and declareSessionTask, which already own what a declaration is; bootstrap reads them instead of its own copy, and `dabbler owed answer` reads them after an answer that wrote a tracked file (the suite declaration and the packaging pair, not a grant and not the git remote). No new gate and no framework commit: the declaration's refusal is right, and session 94 settled that the framework does not commit mid-session.

### Session 119 — The sibling a Maven module cannot consume

**Releasable: no.**

Make a Maven module able to consume a sibling as a package, which it never could. `module pack` runs one reactor deploy per module and writes the module's jar and POM into packages/; the deployed POM still names com.example:solution-parent at the same dev version (the flatten plugin the scaffolded parent manages runs in resolveCiFriendliesOnly, which resolves ${revision} and keeps the parent), and that parent POM is deployed nowhere. A consumer resolving the sibling reads its descriptor, follows the parent and finds nothing: 'Could not find artifact com.example:solution-parent:pom:0.1.0-dev... in modules (file:///.../packages)'. The seam gains a way to say what a FEED needs besides a module's own artifacts -- for Maven, one non-recursive deploy of the root parent POM under the same version into the same file repository, proven by hand in the walk's repository to make the failing build pass; for .NET, nothing, because a .nupkg names no parent.

### Session 120 — What a focused checkout unavoidably holds

**Releasable: no.**

Stop the exposure gate refusing the checkout a module session is meant to run in, and correct the walkthrough that sends a reader to the wrong one. Walking the app module in its focused clone, the close refused for 1603 bytes of module 'model' and 1223 of 'store' -- and what the clone held of them was two pom.xml files, one .flattened-pom.xml and two contract pages, with no source at all. Git's sparse checkout is in cone mode, which materialises every file directly under a directory it keeps, so asking for modules/model/contract/ brings modules/model/pom.xml along; and the flatten plugin writes .flattened-pom.xml for every module in the reactor when the run of record builds at the root. siblingBytes counts both. So no Maven module session can close from a focused checkout, which is the checkout the design requires. The manifest is taught to measure a sibling's SOURCE: the contract folder as today, and now neither the ecosystem's build files nor anything the repository ignores. The walkthrough gains what this walk proved twice: a module session starts with `session start --module <slug>`, which makes the clone and registers the session in it, and a session started in the full checkout cannot close once a sibling has source, because the exposure gate refuses and no grant can help -- a grant widens a focused clone, and the full checkout is not one.

### Session 121 — Two ways in — the seat and the keys

**Releasable: no.**

Give both UAT walkthroughs a Prerequisites section in three parts -- what every run needs, then a GitHub Copilot seat, then direct API keys -- because the documents currently assume the keys and treat a seat as a mistake, which is backwards for the staff who have a seat and no keys at all. The seat half carries the facts that decide what a run costs, each read out of this repository rather than supposed: --model is required on a seat because resolveOrchestratorIdentity refuses a model the registry cannot resolve and a multi-provider seat's label is not trusted; the premium_request_weight of every confirmed model in packages/router/copilot-catalog.lock; and the fact that seatLadder takes the confirmed catalog minus the engine's provider, so the verifier is always a different provider from the engine and the ENGINE-verifier pairing is what decides the bill. The keys half states the three DABBLER_* variables and per-token vendor billing. Neither half names a key value, a seat id, or a price in money.

### Session 122 — The suite that takes the machine

**Releasable: no.**

Restore the two protections that kept the test suite off the operator's machine, and record what is not yet explained. Session 76 put every test worker at below-normal OS priority so its git and node grandchildren inherited it; that setup file was deleted with vitest.config.ts when session 88 retired vitest, and nothing replaced it, so the suite has competed with the operator's keyboard ever since. Session 96's git-spawn constraint still holds, but it recognises a walkthrough by the filename pattern walk-*.test.ts, so the exemption that replaced --test-concurrency widened from six files to eight without anyone deciding it should. This session gives no-git.ts an explicit list of the files permitted to build repositories and the priority policy it lost, audits both from a new control run by the lint gate so neither can lapse silently again, corrects dabbler.yaml's two stale claims about the suite, and writes the measurement into a design note that states plainly that the jump from 40s to 102s between sessions 98 and 99 is not explained. No shipped behaviour changes and nothing is published.

### Session 123 — The principle, and the three commands the UI does not have

**Releasable: no.**

Record the operator's principle about who owns a command, audit both UAT walkthroughs against it, and give the module row the one command the audit found missing. The principle, stated 2026-09-08: a command that is constant, or constant with parameters the framework can determine, belongs to the framework when it is lifecycle-timed and to the UI when it is optional or ill-timed, and to a human only when it needs a human's judgement. The audit of docs/uat/uat-dotnet-json-solution.md and docs/uat/uat-java-json-solution.md goes into a design note: most of what the walkthroughs ask a person to type is already a button (Set Up New Project, New Module, Answer Owed Decision, Show Impact), the manual commit after bootstrap is dead text because bootstrap commits its own scaffold when no session is in flight, and three commands genuinely failed the principle -- Start Session without a module (moved to session 128 with the clone's deletion, after design rounds 10 and 11 moved the wall from the disk to a hook), the pull-back of a module session's work (eliminated with the clone), and a pack the operator cannot ask for from a module row, which this session builds: Pack Module on the Solution Explorer's module row, running dabbler module pack <slug> through a pack verb added to the router's in-process contract. No walkthrough is rewritten here -- session 124 does that, after 129, in three registers. Nothing is published.

### Session 125 — The policy — what a module session may touch, written once

**Releasable: no.**

Write the policy that says what a module session may touch, once, as a compact JSON record the hook scripts of sessions 126 and 127 can read without starting Node, and the one pure function that decides a tool call against it. The policy is derived from moduleScope in packages/router/src/agency.ts and never declared: the allowed roots the scope already computes; the protected paths the engine may not write whatever the scope says (the ledger pair under the sessions directory, docs/modules.yaml, and the framework's own record and projection under .dabbler/ -- the record at .dabbler/runs and the projection at .dabbler/solution, and not .dabbler/scratch, which is where the framework asks the engine to write its answers); every sibling's roots with its owning slug and its contract folder, so a denial can name them; and the short destructive list (git push --force, git reset --hard, git checkout -- ., git clean -f, recursive deletion of the root), each as one regular expression the same in TypeScript, PowerShell and Git Bash. It lives at .dabbler/runs/s<N>/policy.json, which the machine already owns, and is written at the moment the session's modules reach the record: today that is the declaration (the driven plan's modules member, or session declare --module) and session start --module, which 128 folds into one start; a one-module solution writes no file and changes nothing. The decision function answers allow or deny with a structured reason and three rules and no fourth: a write outside the scope or to a protected path is denied, a destructive command is denied, and a read of a sibling's implementation is denied softly with the reason that names the module, its contract folder and the self-grant verb. Everything else is allowed, and every input the function cannot read -- no policy, a malformed call, an unknown tool, a path outside the repository -- is allowed and marked unobserved. The first step instruction of a module session carries the allowed list as a scope field, and dabbler session scope prints the same list on demand. No hook is installed, no bootstrap file changes, and nothing is published: 126 and 127 enforce what this session states.

### Session 126 — It just works — the terminal that tells you, the Work Explorer that keeps up, the suite that leaves the machine alone, and no hooks

**Releasable: no.**

Session 126 fixes the four things the operator saw go wrong while session 125 ran, in the order the plan gives them, and adds no machinery. (1) The Work Explorer repaint miss is REPRODUCED before it is fixed: the router's own record writes (run.json, plan.json, step-execution.jsonl, sessions.json) are replayed through the extension's real watcher-to-cache path -- ProjectionCache.get keyed by projectionCacheKey, called on each file event the way extension.ts calls treeProvider.refresh() -- until the cached rows disagree with a fresh projection under an unchanged key; the sequence that reproduces it and the cause seen are recorded in docs/design/option-a-poc.md under the proof, and the cause seen is what is fixed (the prime suspect is ProjectionCache caching a FAILED projection under the same key as a good one; if it is that, the fix is one line, and if it is something else the fix is that). (2) The Dabbler terminal, four changes in dabblerTerminal.ts: the poll also reads the ledger's in-progress row and prints the SESSION <N> banner the moment the row appears, before any run record exists, followed by the kind line (focused module=<slug> scope=<the policy's allowed list> from the row's checkout and policy.json, or global scope=the whole repository; in the repository's own window during a focused session, one line from the module-session marker naming the module and its folder); the voice rule reads S<N>: framework while a session is known; and when run.seq moves the poll reads driver/instruction.json and prints step <step_id> with the first sentence of the ask, or rejected <step_id> with the first reason, nothing for wait or done, each once. The presentation rules stand. (3) The cap returns: --test-concurrency=4 goes back into the typescript suite command in dabbler.yaml, the comment above it and suite-cost.md's paragraph against the cap now say that the seam made each storm smaller and the cap keeps the box usable, keeping the sentence check-suite-cost.ts reads; one full run at 4 is measured and written into the table, and if it exceeds 2x the uncapped 157-179 s the number becomes 8 and the table says so. (4) No hooks: installStopGate becomes removeStopGate, run at both places the install ran (session start for a claude-code registration, and bootstrap under CLAUDECODE), removing only the entry the framework wrote and never another hook; hookStop, stopGateDecision, the hook-stop dispatch and its description, the stop-gate-continued event, this repository's .claude/settings.json entry, the sentences in docs/driving-a-session.md and docs/design/command-ownership.md, and their tests go; the declaration gate's before-work exemption for .claude/settings.json covers the removal's own edit as it covered the install's; the git pre-commit guard stays. Five tests, one per behaviour: the projection cache handed a failed projection then a good one under an unchanged key yields the good one; the terminal prints the banner and the kind line from an in-progress ledger row with no run record; it prints the step line once when seq moves onto a step and not on the next poll; its rule carries the session number while a session is known; bootstrap and start remove a Stop entry they installed before and write none. No new module, no new control check, no version bump. Not releasable.

### Session 127 — Focused or global — the plan says which, one click starts it, the framework pulls

**Releasable: no.**

Session 127 makes a session focused or global with the plan saying which, makes the focused folder feel like a module repository, marks the modules in play, and trims what the hook plan and the debug overlay left behind, in the order the plan gives them, adding no module. (1) The kind from the plan: extractSessionTitlesFromPlan also reads the first `Module: <slug>` or `Scope: whole repository` line under each session heading, the planned row and the Work Explorer's planned session row carry it, and session start derives the kind -- focused when the solution is multi and the plan names exactly one module, global otherwise -- with --focused and --global overriding it (--focused refused with a plain reason where it cannot apply, --module accepted and made to agree with the plan), session drive taking the same two flags, a global session in a multi-module solution writing no exposure manifest and no policy, accepting any modules in the declaration and running no exposure gate at the close, said on start's output and the terminal's kind line; and a start in a focused folder whose module is not the plan's module is refused by name, with Start Session not offered there. (2) The folder kept: EXISTING_CLONE becomes reset (kept, fetched and reset when clean, refused when dirty, never deleted); openModule records the repository's path in the clone's marker; close run in a clone pulls the repository forward after its own push with git pull --ff-only, only on a clean tree, never refusing, one line naming the command otherwise; session start in any checkout with an upstream and a clean tree pulls first. (3) One click: Start Session on the repository row when the next session is focused, and Start Focused Session on the module row the plan names, run module open in-process, write the start request to the clone's .dabbler/start-request.json and open the window; an extension activating on a fresh request consumes it and runs runStartSession with those choices; Open Module stays; a Resume Session command on the in-flight session's row runs dabbler session run. (4) The Solution Explorer marks the modules in play: project() adds inSession from the ledger row or the module-session marker, the projection is rewritten at start and close, the module row shows the session number, the milestone colour and ;active, and the repository window's Work Explorer repository row says a focused session is running from the marker. (5) Suites and modules: a suite whose covers and tests lie under one module's code roots is that module's suite unless it says otherwise, and in a focused folder a reached suite whose tests are not on disk is skipped and recorded as owed to that module's own session, never run and failed. (6) The debug grant and its overlay go (layDebugGrants, writeOverlay, OVERLAY_TARGETS, the Maven impl, the pack callbacks, Widen for Debugging, their tests); End Grant and module revoke stay; the grant decision's text ends with the permanent sharedFiles form; checkoutCone keeps a shared entry that names a directory whole. (7) policy.ts keeps the record, its writer and reader, the scope on the first instruction and session scope, and loses protected, writable, destructive, decide and SELF_GRANT_VERB with their test; judgeExposure's sibling-bytes clause becomes a line in the close record and its changed-path clause stays the gate; the scoped paragraph of the first instruction and one Hard-rules bullet of the managed body say that the other modules are here as packages and contract folders and that a sibling's source is asked for with --request-grant and a reason, and the bullet says session cancel --force is a person's verb. (8) Papercuts: rebaseline's repaired paths leave out the framework's bookkeeping and the candidate's files; an engine's cancel --force raises an owed decision; the before-work exemption for .claude/settings.json holds only when the registration recorded removing the hook; the terminal's step-line deduplication resets with the session; the bootstrap path of the hook removal gets its test. Tests one per behaviour: a plan section with Module: persister yields a focused default and --global overrides it while a one-module plan refuses --focused; a close in a clone pulls its repository forward and says so when it cannot; Start Focused Session writes the start request and a window activating on it opens the terminal with the sentence; the solution projection marks the in-flight session's modules from the ledger row and from the marker; judgeExposure records sibling bytes and still fails one changed path outside scope; a suite under one module's roots is that module's, and an absent suite in a focused folder is owed, not failed. No new module, no version bump. Not releasable.

### Session 130 — The UAT that tests the UI, and shows its own machinery

**Releasable: no.**

Session 130 walks the UI path through a multi-module solution and rewrites the two UAT walkthroughs as instruments rather than prose. The walk comes first and is the test: the .NET path and then the Java path are walked for real in scratch solutions outside this tree, each operation reached the way the operator reaches it -- the extension command that offers it, the router verb that command generates -- with every divergence recorded in a new walk record, docs/uat/uat-walk-findings.md, which also settles the four rows session 123's audit could not close from the code alone (New Module asking for four of a module's six values, the remote and the upstream nothing in the UI asks for, the hand-written plan that must be committed before the first start, and Troubleshoot running none of the prerequisite toolchain checks) and says plainly how many findings the walk produced. Findings that are document errors are fixed in this session's documents; findings that are product defects are recorded with their reproduction in the walk record and raised as decisions on the session's own log, in the operator's terms -- framework, UI, or person. Then docs/uat/uat-dotnet-json-solution.md and docs/uat/uat-java-json-solution.md are rewritten so that every numbered step carries three registers -- what the framework already did and at which lifecycle moment, what the operator does in the UI by exact command title and exact prompt answer, and what that operation runs underneath -- and a step that cannot fill the first two says so as a labelled gap in the operator's terms instead of blending into the shell; the stale manual commit after bootstrap moves into the first register, and docs/quick-start.md and docs/tutorials/csv-solution/csv-multi-module-walkthrough.md are reached in the same pass. One new script, packages/router/scripts/check-uat-registers.mjs, is the mechanical check the way doc-paths.mjs is: it holds every numbered step of the two UAT documents to the three registers or to an explicit statement of which are absent and why, holds every palette command title a document names to the extension's contributes.commands, and refuses a document that instructs a manual commit after bootstrap. No new module, no version bump, not releasable.

### Session 131 — The three that stop a first-time operator

**Releasable: no.**

Session 131 closes the three holes session 130's walk fell into in its first twenty minutes -- findings 1, 3 and 10 of docs/uat/uat-walk-findings.md, owed as D258, D260 and D267 -- because they are the ones a first-time operator meets before they have done anything wrong. First, a module made with the New Module button becomes a module that can be packed and can host a session: `create` in packages/router/src/modules.ts defaults the two values the four-box flow never asks for, taking `modules/<slug>` as the code root and the slug as the package, cased the way the repository already cases its module packages -- a sibling's groupId reused for Maven, a sibling's namespace and PascalCase reused for .NET, the slug verbatim when no sibling declares one. The defaulting sits in `create` rather than in the button, so `dabbler modules create` and the button are fixed in one place, the flow stays at four boxes, and an explicit `--code-root` or `--package` still wins; the two refusals that made this findable stay exactly as they are, because both are correct. Second, the .NET first pack stops ignoring its own build output: `rootFilesDotnet` calls the same `ensureIgnoreRules` the Maven side already calls, appending `bin/` and `obj/` with the reason stated once -- a source digest taken over unignored build output makes the same source pack to a new dev version every time, which breaks the pack's idempotence, the next declaration and the close's pull-forward. Third, the first pack declares the suite the ecosystem now names: bootstrap runs before any project file exists and honestly declares none, so `ensureRootFiles` -- the lifecycle moment the ecosystem becomes known, where the root build files for that ecosystem are already being written -- also writes that ecosystem's `testing.suites` entry through the existing `appendSuitesToProjectConfig`, and never overwrites a suite already declared. Three tests, one per step, no new module, no version bump, not releasable: the whole block ships once at 136.

### Session 132 — The rest of the first-run path

**Releasable: no.**

Session 132 closes the rest of the first-run path session 130's UAT walk fell into -- findings 2, 4 and 5 of docs/uat/uat-walk-findings.md, owed as D259, D261 and D262. None of the three stops a person outright; each stops one operation with a message about something they did not do. First, bootstrap commits the modules manifest it finds: `commitOwnScaffold` commits exactly the files bootstrap wrote, and in the walkthroughs' own order the modules are declared first, so `docs/modules.yaml` is untracked when bootstrap runs, stays that way, and the very sentence bootstrap prints about session 1 not being refused is wrong about the tree it is standing in. Bootstrap adopts an untracked manifest into its own commit and says it did. Second, the framework's own record comes out of the focused checkout's dirty count: `openModule` refuses a dirty clone over raw `git status --porcelain` paths, which include the session ledger `session start` itself wrote, so pressing Start Focused Session or Open Module a second time asks the operator to commit the one file this repository's hard rule says a person never touches. `materialPaths` is the rule that already draws that line for every other caller, so rather than writing it twice it moves down to `checks.ts` -- the one module both the close's gates and the checkout already import, and the only home that does not close the import cycle checkout -> gates -> exposure -> checkout the lint control refuses. Third, set-up asks for a remote: `runSetUpProjectFlow` asks where the project goes and what it is called, initialises the repository and runs bootstrap, and never asks for the one parameter the framework cannot determine, which the close's push, the close's pull-forward and every focused clone all need. `dabbler bootstrap --remote <url>` records `origin` and pushes the branch with an upstream, and the set-up flow asks one skippable question and hands the answer to it -- the mechanics in the router so the command line and the button are one writer. Three tests, one per step, no new module, no version bump, not releasable: the block ships once at session 136.

### Session 133 — The four papercuts, and the walk's own record closed

**Releasable: no.**

Session 133 closes the four papercuts session 130's UAT walk collected on its way past the three defects that stop a person outright -- findings 6, 7, 8 and 9 of docs/uat/uat-walk-findings.md, owed as D263, D264, D265 and D266 -- and then closes the walk's own record against all ten. None of the four blocks an operation; each of them tells a first-time operator something slightly untrue at the moment they are least able to check it. First, Troubleshoot runs the prerequisites both walkthroughs open with: the command offers six diagnostics and none of them is the toolchain -- git, node, the router itself, the ecosystem SDK, the Copilot CLI and the transport and key environment the walkthroughs' parts A and B split on -- which is constant, optional and diagnostic, the definition of the UI's bucket under the operator's principle, and the first thing a stuck operator gets wrong. A seventh item probes each one and reports what it found; the probing is behind an injectable seam so the report is a function of what was found rather than of the machine the suite runs on, and an environment variable is reported present or absent and never by value, because three of the six named here are API keys. Second, `bootstrap --project-dir` names the target's own `.dabbler`: `resolveRecordPath` resolves a relative `discovery.record` against `projectRoot()` with no argument, which is the working directory when bootstrap was told to act somewhere else, so the one discovery line bootstrap prints reports a file that was never going to be there while every other line of the same run names the project. The project directory threads through `freshnessWarnings` and `checkFreshness` to the one resolution, so the reader and the writer of that path still cannot disagree. Third, New Module's first box is titled `1/2` among four, so a person who reads the first title stops expecting the third. Fourth, the Maven pack's deprecation warning: `runPackDefault` spawns the ecosystem's build with `shell: resolved.isBatch`, and on Windows `mvn` resolves to `mvn.cmd`, which is the combination node deprecated in DEP0190 -- so a walkthrough promising four lines delivers six, three of them about a security vulnerability, and the day node turns the deprecation into an error the Maven pack stops working on Windows. `spawnProgram` in checks.ts already solves this for the asynchronous path, with `cmd.exe /d /s /v:off /c` and every argument quoted rather than a shell re-splitting a joined string; the synchronous callers get the same implementation rather than a second one. Fifth, `docs/uat/uat-walk-findings.md` records against each of the ten defects the session that answered it, so the walk's record closes with the work rather than outliving it. Two tests, because the rest are strings: Troubleshoot's prerequisite report over a missing tool and a present one, and `bootstrap --project-dir` naming the project directory's `.dabbler` in its discovery line. No new module, no version bump, not releasable -- the block ships once at session 136.

### Session 134 — What the verifier is told, and what it can see

**Releasable: no.**

Session 134 fixes what the verifier is told about its own job and widens what it can see. Three claims stopped being true in session 100, when `testphase.ts` went with the six-step workflow: no verifier has written or run a test since, and four places still say one does -- the managed body's *What comes back* and the scaffolded `dabbler.yaml`'s testing header, both template strings in `bootstrap/templates.ts` from which `AGENTS.md` is generated; `drive.ts`'s `phasePreverify` comment; and, unlisted in the plan but the same false sentence in the one place an operator reads it rather than a maintainer, the refusal `dabbler test-evidence --stage preverify-targeted` prints from `cli/testEvidence.ts`. All four say the same true thing afterwards: the tests that run are each step's own checks and the complete suite as the run of record, and the verifier reviews without writing or running one. Second, the verifier is asked about the tests it can see. A section in `prompt-templates/verification.md` asks it to assess the tests the session added or changed and, where a behaviour is untested or a case is missing, to name that case as concrete inputs and preconditions rather than as prose -- scoped to the tests in the diff, because on the API transport there is nothing else in front of it, and filed under NITS, because a proposal for another case is an improvement and not a defect and a Minor-only round does not buy another one. A genuinely missing spec-promised test stays an Issue exactly as it is now, and the section says so in as many words so the two are not confused. Third, the verifier sees the code around the change. `assembleEvidence` builds the round-1 diff at git's default three lines of context, so a modified file arrives as hunks while a new one arrives whole; measured over sessions 100-127 the seat verifier, which can read what it likes, raised 1.30 blocking findings a session against the blind API path's 0.53 on a slightly higher total, so what blindness costs is not detection but the confidence to grade. The diff is rendered at a ladder of context widths, widest first, and the first render that fits the evidence cap is the one that is sent; the ladder's floor is git's own default, so a session too large for the widest context narrows automatically instead of failing the round, and a session too large for the floor still fails exactly as it does today. `assembleFixDeltaEvidence` is built the same way and gets the same treatment. One test, because the first two steps are text and the ground rules refuse source-text assertions: an evidence bundle whose wide-context render would exceed the cap is rendered at a narrower context and comes back under it. No new module, no version bump, not releasable -- it changes the evidence every round in every repository is assembled from and the prompt every verifier reads, and holding it unreleased through 135 and 136 buys it two more sessions of real verification rounds in this repository before a seat ever sees it.

### Session 135 — The direct-API verifier can ask for a file, and .NET gets a root

**Releasable: no.**

Session 135 gives the direct-API verifier the one thing the seat has always had -- it can ask for a file -- and gives a scaffolded .NET solution the root `dotnet test` resolves. Across sessions 100-109 the Copilot verifier read 312 files in 26 rounds, twelve to a round against a budget of 40; it listed a directory once and searched nothing, so what the API path is missing is one operation and not three, and no vendor function-calling. The verifier's answer may carry a `file-request` block -- its own label beside `test-write` and `fix-write`, parsed by the same fence machinery, its paths checked against the same scope and counted against the same read budget, every decision written into the same agency record. Where the block asks for something the round may deliver, the framework reads the bytes itself and sends ONE further turn carrying them, and the second answer is the verdict: two turns, never a loop, so the cost is bounded at twice the payload, and fidelity is verbatim by construction because the framework read the file rather than being shown it. The turn is a `followUp` seam on `route`, dispatched against the SAME candidate the first turn used, so a second turn can never quietly become a second model. All of it sits behind `verification.settings.api_file_requests`, which defaults off: this session is therefore verified by the path it is changing, unchanged, and with the setting off a request block is recorded as refused and ignored and the round stays one turn. The record says which kind of round it was -- a grant that offers the read records `mode: tools` with `read` as its one granted operation, and every round that is offered nothing keeps `mode: none`, which is every round in every repository until an operator turns the setting on. `docs/driving-a-session.md` gains what the verifier may ask for on the API path and what the record says it asked; `docs/schema-reference.md` gains the agency block, which it has never documented, and the rounds schema's own description stops saying the direct-API path can never look. Separately, and sharing nothing with the above except a session that is not the release: the other half of D267. Session 131 measured that a multi-module .NET solution keeps its projects under `modules/` and writes nothing at the root, so `dotnet test` answers MSB1003, and closed the honest half by having `suiteForEcosystem` ask the root detector and `whyNoSuite` say why nothing was declared. The remaining half is the root solution file itself. `rootFilesDotnet` writes a `.slnx` -- plain XML a scaffold can write and a person can read, against `.sln` and the GUIDs no generator should invent -- listing the project files under `modules/` on exactly the parent POM's terms and carrying the same `add each as it gets one` note, with its SDK floor (9.0.200+) stated beside it where the operator meets it. It needs no new rule: `ensureRootFilesWithSuite` writes the root files first and asks the detector second, so the file it just wrote is what `detectDotnet` finds and the suite declares itself in the same call. Four tests. No new module, no version bump, not releasable -- the setting defaults off so nothing changes for anyone until it is turned on, and the scaffold's new root file reaches a seat with the rest of the block at session 136. The one real exposure is that the proposal parser already runs on every round including the ones granting no write, so a new label parsed there is code on the path of every verification; its refusal case is one of the four tests for that reason.

### Session 136 — The suite the operator cannot work through

**Releasable: no.**

Measure what the run of record actually does to the operator's machine, then cut the load rather than throttle it. Step one builds a sampler (packages/router/scripts/measure-suite-load.mjs) that runs a command while sampling CPU, disk queue length, free memory and the process tree -- every process with its OS priority class -- and runs it over the two run-of-record suite commands as they are declared in dabbler.yaml; the numbers and what they say go into docs/design/suite-cost.md beside its table, including whether the tree above the test workers is at normal priority while only the workers are below it. Step two takes walk-session.test.ts off the full-CLI child per job where the test is not about the child: jobs.startJob gains one injectable seam in the shape of journal.setGitSource, the CLI's dispatcher moves out of the entry file so it can be called without the entry's top-level invocation, and a test-support starter runs a job's verb in-process against the same argv, writing the same log and status file so the driver's wait, its poll and its collection are unchanged; anything that is not a re-entry of this router's own CLI still spawns, and walk-jobs.test.ts keeps the real spawn because it is the test about the child boundary. Step three follows from step one and only from it: if the priority courtesy stops at the test worker it moves to where the driver spawns a job, so every suite the run of record runs inherits it and the extension's mocha stops being the exception nobody declared, proved by a spawned child's reported priority class; if step one finds the tree already below normal, no code changes and suite-cost.md records that the priority theory was tested and was wrong. Not releasable: nothing here ships, and the run of record that judges this session is the first run of the new shape.

### Session 137 — The page a buyer reads, the heading an operator never saw, and the block lands

**Releasable: yes.**

Make the pages a buyer and a first-time operator read say what this product actually is, and ship the block. Codex comes out of the live documented surface -- the engine list in the managed body's templates, the --engine help, the quick start, the driving guide, the onboarding README and deck, the schema reference, the two UAT walkthroughs and the ACP walkthrough -- while the CLI keeps accepting and recording it, undocumented rather than unsupported, and every record that names it is left exactly as written. The Dabbler terminal's numbered heading is decided rather than relabelled: a chat-driven session puts no job output on the terminal and so never changes voice, which is why S133 was reported absent when the code was emitting it; the session decides the occasion a numbered heading is drawn on, takes it, and puts the session number on a job's rule where the framework's already has one. The activity-bar and settings titles become the name the marketplace uses, with the container id untouched, and the CSV tutorial is re-rendered from its generator. Then the pages themselves: the marketplace README still requires Python 3.11, a workspace .venv and pip install dabbler-ai-router, calls the extension a pure renderer of python -m ai_router.progress, organises the work into retired session sets, offers an operator a waiver that verify waive now refuses by name, and counts five close gates where GATE_CHECKS holds nine -- it is rewritten against the product that exists, the manifest's description and keywords with it, and a control in the lint chain keeps it that way. Modules -- the feature a .NET or Java team is actually buying, and the one neither page explains -- are described on both pages: a solution declared as modules, a session's plan naming one, the framework building that module a git-enabled partial checkout on the fly holding its source and its siblings' contracts and packages rather than their code, so the engine reads a codebase the size of the work rather than the size of the repository. The one image, a v1 tree reading Default 131 sets under alt text describing something it does not show, is replaced by two real captures. Releasable: this is the block's one release, and sessions 131 to 136 reach a seat with it.

### Session 138 — The deadlocks that were not deadlocks, and the consent that was not asked for

**Releasable: no.**

Repair four places where the driven lifecycle states one rule twice and the two copies have drifted, each fixed by making the second statement read the first rather than by adding a guard. (1) The publish and close stops carry the refusal they actually met -- read from the job's own log tail, exactly as the verification stop already does -- so the deadlock classifier stops comparing a string literal with itself, calling every publish refusal after the first an impasse and spending the session's one triage on it. (2) The publication decision is keyed to the version it authorises instead of the bare id 'publication', so an answer given for one version cannot silently consent to every release that follows it. (3) A run stopped at publish because an earlier phase's evidence is missing returns to the phase that makes that evidence, so the framework runs the verify, suite, commit and push steps the managed body tells an engine are not its own. (4) Releasability can be withdrawn after step (a) by a recorded act carrying a reason and an approver, which the close reports rather than absorbs, so a releasable session that must be abandoned has an exit that is not 'cancel'. Plus the two selection rules that were owed. Session 137's record is the fixture. Not releasable: this session rewrites the consent that gates a release, and a releasable 138 would ship itself through its own new consent code at its first and only use; session 139 ships it.

### Session 139 — The release that carries the deadlock work

**Releasable: yes.**

Ship the release that carries session 138's four repairs to the driven lifecycle, and be the first session in which the repaired publish path is driven by the framework rather than recovered by hand. The one version this repository declares moves from 2.0.18 to 2.0.19 in version.json and is stamped from there into every manifest and the lock file, so the bump belongs to the session that ships it and no manifest is authored twice. The extension's changelog gains a 2.0.19 section that says what 138 changed in the terms an operator reads: a stop that names the refusal it actually met instead of a constant, so two unlike refusals stop being one impasse and each reaches its own triage; a publication decision keyed to the version it authorises, so an answer given once for one release cannot go on consenting to every release after it; a publish refused on an earlier phase's evidence that goes back and makes that evidence instead of handing a person five verbs the managed body says are not theirs; and a releasability that can be withdrawn on the record, with a reason and an approver, so a session that was meant to ship and did not has an exit that is not cancel. Nothing else changes: no test is added, because the proof of this session is a published packaging row and what the Marketplace serves, and an assertion over the publish path here would assert the very thing the session exists to find out. The publish runs in the framework's own order after the verification round, the run of record and the land; the tag is made by dabbler release, which raises the publication decision for 2.0.19 and waits for it, and dabbler release --verify-install afterwards is the check that a green workflow and a served extension are the same fact. If the publish exposes a defect in 138's work, this session fixes it, bumps again and ships again on its own record rather than deferring a fix nobody has shipped behind a release nobody can install.
