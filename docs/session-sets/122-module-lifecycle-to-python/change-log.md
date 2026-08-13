# Change log — Set 122, Module Lifecycle Moves To Python

Four sessions, 2026-08-13. Implementing
[`proposals/2026-08-11-multi-module-architecture/verdict.md`](../../proposals/2026-08-11-multi-module-architecture/verdict.md)
§4, §7 and §6.4 — decisions two providers reached independently and the
operator confirmed on 2026-08-11.

## What the set was for

The framework claimed an invariant it did not have. `session-state.json`
is supposed to have exactly one writer, and
`src/utils/cancelLifecycle.ts:296` wrote it from TypeScript, reached
through the **Delete Module** path. That was not the only duplication:
`moduleAuthoring.ts` carried 2,601 lines of module lifecycle logic —
validation, numbering, scaffolding, manifest edits — with no rollback and
no refusal for a running session.

So the set moved every module operation to Python, pointed the existing
menu at it, guaranteed the router those launchers now require, and then
removed the two things that make concurrent sessions collide.

## Session 1 — The lifecycle CLI

`python -m ai_router.modules create | rename | delete | assign-sets`,
against the **unchanged** `docs/modules.yaml` contract: the same shape,
the same header template, the same format-preserving text splices (never
a re-serialization, which would destroy the operator's comments and entry
order) and the same parse-after-write guards. A format change here would
have stranded every repo that already has a manifest.

Two things were genuinely new. **Refusals**: `rename` and `delete` refuse
while any affected set has a running session, including a legacy set with
no `session-state.json`, whose status is inferred from file presence
rather than read as "not started". **Rollback**: one transaction records
every effect and undoes all of them, so a create that scaffolds a
directory and then fails to append the manifest entry leaves neither
behind.

Verified across three rounds. The supplementary round paid for the whole
stage on its own: `create` had never ported the lifecycle-set scaffolding
or its numbering, so Session 2 would have wired **New Module** to a CLI
that silently dropped a main-path behaviour. Writing the falsifier for
that fix then exposed two further defects in the rollback transaction
that no verifier flagged and no amount of reading would have surfaced.

## Session 2 — Thin launchers, and the command made visible

Five context-menu commands now launch `python -m ai_router.modules`
through the **resolved workspace-venv interpreter** — never a bare
`python`, which is the documented cause of the `No module named ai_router`
mis-diagnosis — branching on exit `3` (refused, nothing written) and `4`
(write failure). `moduleAuthoring.ts` went from 2,601 lines to 608. No
command id changed.

Every run **echoes the exact, copy-pasteable command line** before
spawning it. One builder feeds both the echoed line and the spawned
argv, so what the developer sees and what runs cannot disagree.

The TypeScript state writer is gone entirely — an operator decision,
journalled: severing only the module-delete path was considered and
rejected, because it leaves a second writer shipping and two
implementations drifting. `session_lifecycle.py` gained a `cancel` /
`restore` CLI, and `cancelLifecycle.ts` shrank to readers (549 → 142).

Verification's two blocking findings were both against the *echo*
promise: a `> ` prompt glyph welded onto the only visible command line,
and PowerShell quoting that would not actually run. A command you cannot
copy is not a command you can see.

## Session 3 — Guarantee the router the launchers require

Session 2 made the extension depend on a Python module. Nothing
guaranteed it was present or new enough, and the gap had a named victim:
a developer whose `.venv` held `dabbler-ai-router 0.34.0` would take the
Marketplace update and then fail *every* module command, with re-running
setup unable to help — a plain `pip install` reports an existing install
as already-satisfied.

Three things close it. A **version floor declared once**
(`MINIMUM_ROUTER_VERSION` + the requirement derived from it, read by both
the install path and the precondition), with `mode: install` now passing
`--upgrade`. A **capability probe**: after installing, setup asks *the
interpreter the launchers resolve* to import `ai_router.modules`, and a
failed probe makes the install report failure — no fail-open branch. A
**retryable scaffold**: default-module creation is gated on the module
being ABSENT, not on whether that call created `docs/modules.yaml`, so a
retry after a failed install recovers instead of being locked out behind
a file nobody mentioned.

Proven from a genuinely empty folder by a new `npm run test:dogfood`
lane — real venv, real network pip, production handoff verbatim — wired
into CI on Linux and Windows. Round 3 **rejected** two of the round-1
fixes and was right to: the first fix resolved the launcher interpreter
eagerly, before `.venv` existed, which would have made an ordinary cold
start report a good install as failed.

## Session 4 — Remove the guaranteed merge conflicts

Two things two developers running concurrent session sets collide on.

**The append-only file.** `CHANGELOG.md` was edited by every session, at
the same offset — the top — so a conflict was guaranteed, and of the
worst kind: both sides correct, so resolving it is manual reading rather
than a rule. Sessions now write `changelog.d/<order>-<slug>.md`, one file
per contribution; a new file is a shape git merges cleanly.
`python -m ai_router.changelog render` concatenates on demand, `fold`
writes the view back at release time.

This was less a new convention than an existing one made executable:
`ai_router/CHANGELOG.md` already carried **nine stacked**
`## [Unreleased] — … (Set NNN)` sections and the extension's ten `###`
blocks. Sessions were already partitioning by hand, inside a single file,
which is exactly what conflicts.

The partition does not rewrite history, and that is **enforced**. A
fragment stores the verbatim slice of the pending region, so
concatenation equals the original by construction;
`changelog.d/.baseline.json` freezes the pre-partition digest, each
fragment's digest and the fragment ORDER, and `restamp` — the escape
hatch for a deliberate correction to frozen prose — refuses to run if any
fragment moved. Verified against `git show HEAD:`: `render()` reproduces
both pre-session changelogs exactly, 306,974 and 237,977 characters.

**The set number.** Verdict §6.4 asks developers to reserve numbers in
chat; nothing enforced it, and the collision is invisible inside one
worktree — two branches each mint `123-`, and the clash only exists after
they merge. `start_session` now refuses before the work starts,
`resolve_set --check` sweeps and exits 3, and `drift_guard.py` runs both
that sweep and the changelog round trip in CI's fast gate — the right
home, because both defects are introduced by a merge.

`ai_router.modules create` deliberately gained **no** check: it mints
`max(existing) + 1` from a live listing, so a refusal there could only
ever pass, and `L-112-1` says such a gate proves nothing. The property is
asserted by a test instead.

## What the sessions cost, and what verification bought

| session | verdict | rounds | what verification caught |
| :--- | :--- | :--- | :--- |
| 1 | VERIFIED | 3 | A refusal gated one branch too narrowly; `create` never ported lifecycle-set scaffolding at all |
| 2 | VERIFIED | 3 | Both Majors against the echo promise: a prompt glyph in the copyable line, and PowerShell quoting that would not run |
| 3 | VERIFIED | 5 | The probe answered for the wrong venv; the dogfood asserted the GATE not the outcome; round 3 rejected a fix that introduced a worse defect |
| 4 | VERIFIED | 2 | Three nits, all real: a heading shape Keep a Changelog does not have, a CI gate that could skip itself, and prose naming a wiring point the code lacks |

Routed verification cost for the set was **$0.00** — every session ran on
the Copilot CLI seat.

## Two defects the work caught on itself

Recorded because they are the evidence the assertions are not decorative.

**Session 4's round trip caught its own author.** The first `render`
spliced fragments after the *preamble* rather than after the pending
lead, silently dropping the extension changelog's 1,086-byte
`## [Unreleased]` header. Every entry still rendered. Only the byte
comparison found it. `migrate` now verifies in memory **before** anything
reaches disk.

**The mutation check found a blind gate.** Flipping the fragment sort to
ascending — a real reordering bug — was supposed to fail the round-trip
check. It did not: `check` had re-sorted internally, making it
self-consistent and therefore blind to an ordering bug in the production
render path. It now asserts against the order `load_fragments` actually
returns, and the same mutation fails 10 tests.

## Test counts

The spec budgeted 30 new test functions across the set. Session 1 alone
shipped 41. Session 4 added 69 more (48 changelog-partition, 21
collision). The overrun is recorded rather than re-baselined, because it
is the interesting part: the spec's own steps mandate falsifiers, each
refusal is parameterized across the shapes it must and must not fire on,
and verification twice added capabilities the budget never priced. **A
per-set test count is the wrong unit** — the cap the authoring guide
actually enforces is session SIZE, and every session met it. Carried to
the Step 9 review.

## Release

The operator publishes both registries immediately after this set lands,
in this order: `dabbler-ai-router` to PyPI first, **confirm the wheel is
live**, then the extension to the Marketplace — so a newly installed
extension can never request Python functionality the registry does not
yet provide. Residual `S122-S2-R3` is the one assertion only the operator
can make, and it is now one command: create a throwaway venv, install
from the real registry, and run `ROUTER_CAPABILITY_PROBE_CODE` against
it. If that import fails, the extension must not be published.

The release walk also now folds the changelog fragments
(`python -m ai_router.changelog fold`) before assigning the version —
see [`docs/partitioned-append-files.md`](../../partitioned-append-files.md)
and both release runbooks.
