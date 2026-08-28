# The session framework

> **Purpose:** Build the session framework specified in
> `docs/session-framework-spec.md`, in the order set by
> `docs/session-framework-plan.md`, as a sequence of numbered sessions —
> each one developed, tested, cross-provider verified and closed under the
> existing router machinery. **The design is verified before any code is
> written, and every session runs the same lifecycle**, because a framework
> whose whole claim is "the record is honest" cannot be built by a process
> that skips its own steps.
> **Session Set:** `docs/session-sets/148-the-session-framework/`
> **Created:** 2026-08-26
> **Workflow:** Full
> **Engine:** GitHub Copilot seat. Every session declares `--model`; the
> seat label is never trusted for identity.
> **Prerequisite:** none. This set does **not** inherit the sets 142–147
> envelope, and the `AGENTS.md` ground rules remain set aside per
> `docs/operator-decisions.md`.

> **Blocking precondition — settled 2026-08-26, before session 1.** Set 145
> `step-execution` was `in-progress` and set 146 `measure-then-enable` had
> never been started, so the lowest-numbered-`not-started` rule selected 146
> ahead of this set. Both dispositions already existed in machine-written
> form in commit `0cc98b33` and were carried onto the working branch **by
> merge, not by editing a state file**. Zero sets are now `in-progress`.

> **The branch — settled 2026-08-26 by the operator: this set runs on
> `master`**, per the standing trunk-based directive. `master` was a strict
> ancestor of both `design/solution-decomposition` and
> `experiment/verification-pipeline-v3`, so it fast-forwarded to the design
> tip and then merged the experiment tip; no published history was
> rewritten. `AGENTS.md` now names `master` as the working branch.


---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 20
prerequisites: []
```

---

## Read this before session 1

**`docs/session-framework-build-instructions.md` is the operating manual for
this set.** It carries the exact commands, the Copilot-seat specifics, the
lifecycle every session repeats, and the traps that have cost this project
sessions before. A session that has not read it will get the register step
wrong and discover it at the close gate.

---

## Three facts that shape the whole sequence

### 1. Session sets are collapsed last, not third

**The plan puts "collapse session sets" at A3. This set runs it at session
14, and the reason is not preference.** A3 removes the set level from the
CLI and the state files — which is the machinery this very sequence runs
on. Collapsing it at session 3 would strand sessions 4 through 17 with no
way to register, verify, or close.

**So A3 moves to the end, immediately before the extension work that depends
on it.** It is the cheapest item in the plan to move: pure deletion, no
staff-facing value on its own, and nothing else in Milestone A depends on
it. **This is a real change to the plan's ordering and the operator should
know it was made.**

### 2. Seat capacity is the constraint most likely to stop this set

**Seventeen sessions, each with a preverify run, up to three verification
rounds, and a full suite, is real seat consumption that has never been
measured at this scale.** Copilot capacity in this project is very limited
and the three currencies — seat premium requests, API dollars, and the
subscription window — do not exchange.

**Measure it at session 3 and re-plan if the rate does not support
nineteen.** Session 3 is the first ordinary code session, so its cost is
the honest unit. Do not wait until session 13 to find out. Re-planning
means fewer, larger sessions — not fewer verification rounds, which is the
one thing this set exists to prove out.

### 3. Verifying prose has no bottom, and sessions 1 and 2 are prose

**Five real rounds on one plan produced four new Major findings every
time.** The bottom has to come from somewhere, and it comes from the round
cap and the Minor-only stop — both machine-decidable.

**No session in this set waits for a human, including sessions 1 and 2.**
The specification originally made those two human approval gates; session 2
removed them, on the operator's decision, because a person supplied no bound
the cap did not already supply and cost a blocked engine. Every session ends
in one of the three terminal states of spec §3.c.i — verified, unresolved,
or remediated at the cap.


---

## What this set does NOT do (do not reopen)

- **It does not re-litigate the specification.** Session 1 verifies it and
  the operator approves it. After that the spec is the contract, and a
  finding that disagrees with a settled design decision is out of scope.
- **It does not build agency on the direct-API path.** Spec §4.b settles
  this: the seat has the tool surface, the API path records `agency: none`.
- **It does not add a sandbox, a container, a browser surface, or dollar
  cost tracking.** Spec §10 names each absence as a decision.
- **It does not touch the operator's status icons.** See session 15.

---

## Sessions

### Session 1 of 20: Verify the design before anything is built

1. Register.
2. Run cross-provider verification over `docs/session-framework-spec.md`
   and `docs/session-framework-plan.md` as the session's work product.
   **This is the dogfood step that matters most** — a framework that
   verifies designs must survive its own design being verified.
3. Remediate blocking findings that identify a genuine contradiction,
   omission, or unbuildable instruction. **Stop when only Minor findings
   remain** — prose review has no bottom.
4. Record every design decision the round produced in the decisions log
   for this set, by hand for now: the framework that writes it does not
   exist until session 5.
5. Record the terminal state the loop reached. **No approval is sought** —
   sessions 1 and 2 are verified like every other session.
6. Close-out.

**Creates:** a verified specification and plan, and the first real
measurement of what a verification round costs on the seat.
Est. 0 tests — this session writes no code.

### Session 2 of 20: Verify this breakdown against that design

1. Register.
2. Check this session list against the verified specification and plan:
   every plan item appears exactly once, nothing in the spec is unbuilt by
   the end, and no session depends on something a later session creates.
3. **Confirm the session 14 reordering is sound** — that no session between
   3 and 13 depends on session sets being collapsed, and that the extension
   sessions — 15, 16, 18 and 19 — do.
4. Cross-provider verification of this spec file.
5. Remediate; stop on Minor-only; record the terminal state reached.
6. Close-out.

**Creates:** a verified build sequence, and the removal of the two human
approval gates the specification used to carry. Est. 0 tests.


### Session 3 of 20: The credential allowlist (plan A1)

1. Register.
2. **Replace the operator override with an honest terminal state — one
   change, because neither half is safe alone.**
   - **Remove every public waiver path, for every kind of session.** Two
     exist today and neither checks anything about the session it closes:
     `ai_router.verify waive`, and the run-core's
     `dabbler finish --waive ... --attest-operator`, whose
     `_resolve_verified_verdict` returns `WAIVED` on attestation alone.
     Retire `WAIVED` from the persisted verdict vocabulary with them. Spec
     §9 admits **no** override, including for planning sessions — there is
     no verdict a person can type.
   - **Add the `remediated at the cap` terminal state of spec §3.c.i** in
     its place: every blocking finding from the last round fixed, the cap
     reached before the fix could be reviewed, the work landing labelled
     unreviewed. **Not a waiver** — nothing is accepted over, and what is
     unproved is the repair rather than the complaint.
   - **Wire both cap-terminal states into the paths that exist today, not
     into session 10's loop.** Sessions 4 through 9 run on the current
     machinery, so all three of these must terminate a capped session
     without `WAIVED` and without a person:
     `ai_router.verify`, which refuses an over-cap round outright;
     `verifyjob`, which pauses at the cap and offers `resume`,
     `finish --waive`, or `finish --outcome failed`; and
     `gates.py::check_verification_clean`, which refuses to close while the
     latest round is blocking.

   **Removing the override without providing the replacement would strand
   sessions 4 through 9**, which is why this is not two steps and not two
   sessions: a session that agrees with every finding and fixes them all
   would otherwise have no exit at all. **Session 10 may only integrate
   already-usable states into its new loop** — it inherits a working
   terminal path rather than creating one, because six sessions need it
   first.


   **This is step 2 of the first code session on purpose** — it is in the
   working tree before this session's own verification can reach a cap, so
   session 3 is the first session it protects rather than the last one it
   misses.

3. Build the child environment in `checks.py::_spawn` from an allowlist of
   what the toolchain requires, in **both** branches. Redirect `TEMP` and
   `TMP`. Exclude vendor keys, feed PATs, git tokens, proxy credentials,
   and `_JAVA_OPTIONS`-style option variables.
4. Add a Windows sentinel test that plants a secret in the parent
   environment and asserts a spawned check process cannot see it.
5. **Measure this session's seat cost and record it in the set's decisions
   log.** This is the unit that says whether nineteen sessions fit.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the allowlisted child environment, its sentinel test, and the
end of the operator override — replaced by the terminal state that makes
"nothing blocks on a person" true in code rather than in prose. Est. 14
Python tests.

> **Step 2 added by session 2, and rewritten twice under review.** First
> assigned to session 4, which is one session too late — session 3 is itself
> a code session. Then written as a *restriction* to planning sessions,
> which the operator's removal of the approval gates made obsolete: the
> waiver is deleted outright, for every kind of session, and the honest
> terminal state takes its place in the same change.



### Session 4 of 20: Record authority (plan A2)

1. Register.
2. One `validate_transition()` used by both `workflow.append()` and
   `workflow.fold()`: forward entry is sequential, returns may only move
   backward, an approval requires a live review and a current approval
   step, and an event's step must match current state.
3. **A `simulated` review no longer sets `reviewed`.** `fold` records the
   flag today and never reads it.
4. Remove the verifier's self-exemption in `verdict.py::is_doc_only_issue`,
   so a verifier cannot make its own finding non-blocking by choosing which
   evidence paths to cite.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record.
8. Close-out.

**Creates:** one transition validator, two closed holes. Est. 8 Python
tests.


### Session 5 of 20: The two files, framework-written (plan A4)

1. Register.
2. `project-work-plan.md` and `decisions-log.md` written only through
   `writers.py`, in a fixed shape. The model supplies content; it never
   chooses structure, filename, or organization.
3. Every decision — human or AI — appends at the moment it occurs.
4. **The task list of spec §3.a, beside the numbered session list.** Each
   session declares what it will do and **whether it produces a releasable
   artifact**, written by the same sanctioned writer. The declaration is
   made before any code exists, because otherwise a model decides when to
   publish a package.
5. **Backfill this set's own decisions log through the new writer**, from
   the hand-kept records of sessions 1 through 4. The first user of the
   feature is this set.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the two sanctioned files, their writers, and the releasable
declaration session 13 reads. Est. 8 Python tests.

> **Added by session 2.** Step 4 was missing from the breakdown: `releasable`
> appeared in the specification and in session 13's gate, but no session
> built it. Session 13 cannot read a declaration nothing writes. It lands
> here because this is the session that already writes the session list.


### Session 6 of 20: The verifier's read surface (plan A5, first half)

1. Register.
2. Three operations for the verifier on the Copilot path: list files with a
   pattern, search file contents with a pattern, read a file's contents.
3. **Scope**: the session's changed files and their declared dependencies,
   never the whole repository. **Budget**: a fixed number of reads per
   round. **Log**: every list, search and read recorded into the round.
4. **Read fidelity, per spec §4.a.** Either the verifier reads the bytes on
   disk, or the round records that a transform was applied. The
   secret-scrubbing layer rewrites credential-shaped text, and session 1
   took a confident Major finding against correct code because of it — the
   agency log showed the right file being read and said nothing about what
   was shown. Mark the transform; do not weaken the scrubber.
5. A direct-API round stamps `agency: none` and is never reported as
   equivalent to a round that could look.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the read half of the agency surface, with its scope, budget,
log, and the fidelity mark that makes a transformed read weighable. Est. 12
Python tests.

> **Step 4 added by session 2.** Session 1 proved the gap the expensive way:
> scope, budget and a log record *what* was looked at and never *what was
> shown*.


### Session 7 of 20: The test-write path (plan A5, second half)

1. Register.
2. The fourth operation: create or modify a test file. **The framework
   applies the write; the model never touches the filesystem.**
3. Writes are confined to the declared test root. A write outside it is
   refused by the framework, not discouraged by a prompt.
4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** the only write the verifier gets, and its enforcement.
Est. 8 Python tests.

### Session 8 of 20: Selection by role, and the death of the tier ladder (plan A6)

1. Register.
2. Lift roles out of the Copilot transport block; both paths resolve the
   `verifier` role through one resolver. The direct-API path resolves
   against the model record instead of walking tiers, keeping its existing
   reachability and exclusion filters.
3. **The preference order becomes ordering-only on both paths.** Today the
   seat falls through to the whole confirmed catalog only when an exclusion
   is active; make that unconditional.
4. **Assert `verifier.provider != author.provider` at dispatch**, not only
   as a selection filter.
5. Delete `pick_model`, `next_escalation_model`, `estimate_complexity`,
   `pricing.py`'s cost arithmetic, and the load-time rate check.
6. **Delete the shipped pricing surfaces too, not just the arithmetic.**
   The per-token rate fields and `confirmed_on` on the model records in
   `router-config.yaml`, the schema keys that admit them, and any
   dollar-denominated reporting left in `metrics.py` and `route.py`. Spec
   §7 says the framework does not record dollar cost, rate tables, or rate
   confirmation dates — deleting the arithmetic while the rates still ship
   leaves pricing a configured product surface with nothing reading it.
7. **Make the seat the default in the shipped configuration.**
   `transport.profile` ships as `api` today, which contradicts §1.a on the
   one surface staff actually receive. Flip it to `copilot-cli` and follow
   the same change through the staff-facing documentation. The precedence
   order is unchanged — flag, then env, then profile — so the direct-API
   path stays reachable and merely stops being the default.
8. **This is one change, not two.** Rates are the current sort key for
   candidate ordering, so pricing cannot be removed until the declared
   preference order replaces it.
9. Affected tests as preverify.
10. Cross-provider verification.
11. Full test suite, recorded as the `final-full` run of record.
12. Close-out.

**Creates:** one selection mechanism, and the end of pricing as a shipped
surface; a net deletion. Est. 12 Python tests, with more deleted than added.

> **Steps 6 and 7 added by session 2.** The breakdown named `pricing.py`'s
> arithmetic but not the rates and confirmation dates in the packaged config
> and schema, and no session anywhere made the seat the shipped default.
> Both land here because both are edits to `router-config.yaml`, which this
> session already rewrites — one config change, one review.


### Session 9 of 20: Model discovery (plan A7)

1. Register.
2. Enumerate each vendor's models endpoint on the direct-API path and write
   the record through the sanctioned writer, dated. **Enumeration is a
   metadata request and bills no tokens** — the default cadence is 24 hours
   because it is free, not because it is cheap.
3. One staleness check reading both records: warns, names its invocation,
   **never blocks and never refreshes mid-session**.
4. The drift diff: models in the record and named in no role, models named
   in a role and absent from the record, and the record's age against the
   threshold.
5. **A field a vendor stops reporting degrades to unknown, never to
   unsupported.** Vendors report unequally and a hard capability filter
   would end cross-vendor verification by accident.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** enumeration, the staleness check, and the drift diff.
Est. 10 Python tests.

### Session 10 of 20: The code review loop (plan B1)

1. Register.
2. `verify → fix`, cap 3, stopping early when only Minor findings remain.
   At the cap the session ends with its round history intact — nothing
   commits, nobody is asked.
3. **The three terminal states of spec §3.c.i, and no fourth.** Verified;
   unresolved, when the cap is reached with blocking findings outstanding;
   and **remediated at the cap**, when every blocking finding from the last
   round was fixed and the cap left the fix unreviewed. **Session 3 built
   these and wired them into the paths that existed then; this session
   integrates them into the new loop and adds nothing new.** If this session
   finds itself inventing a terminal state, session 3 was incomplete and the
   fix belongs there, not here.
4. **No terminal state waits for a person, and none can be typed by one.**
   The waiver paths are already gone by session 3. What remains is that the
   loop must always reach one of the three — a session that agreed with
   every finding and fixed them all must land, not hang.


5. **The cap also closes a live hole:** `workflow review` has no round cap
   today, so an unattended run keeps calling vendors.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the first loop, a bound on an unbounded one, and the terminal
state that makes "nothing blocks on a person" true in code. Est. 10 Python
tests.

> **Steps 3 and 4 added by session 2**, which hit this exact dead end: at
> the cap, having agreed with and fixed every finding, with no sanctioned
> exit that was not a false statement on the record.


### Session 11 of 20: The verifier authors tests, the framework runs them (plan B2)

1. Register.
2. The verifier writes test files through the session 7 write path;
   `checks.py::execute` runs them and reports the exit code. **"Tests pass"
   must be an observation, not a claim.**
3. `test → fix`, cap 7, with the round count carried into the session
   outcome so a six-round pass reads differently at planning time than a
   two-round one.
4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** the authoring hand-off and the test loop. Est. 8 Python tests.

### Session 12 of 20: The full suite and its bounded fix loop (plan B3)

1. Register.
2. The suite runs against the tree including the verifier's new tests. On
   failure, `fix → re-verify → re-test`, scoped.
3. The fix round receives **only** failing test names, their output, and
   the files implicated by the failures.
4. Writes are restricted to the session diff plus implicated files, using
   the existing `changed_paths_between` machinery. **A write outside the
   envelope is rejected, not discouraged.**
5. No new findings are solicited during a fix round; unrelated observations
   are recorded and never acted on.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the envelope, which is the whole feature. Est. 10 Python
tests.

### Session 13 of 20: Packaging to the feed (plan C)

1. Register.
2. `pack`, then `push` to the Azure DevOps feed with the operator's PAT,
   resolved through `secret_resolver` and **never placed in a child
   environment** — session 3 is what makes that real rather than intended.
3. Releasability is read from the task list declared at step (a), which
   **session 5 step 4 writes**. A session that did not declare itself
   releasable cannot publish.
4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** the one thing staff explicitly asked the framework to do.
Est. 8 Python tests.

### Session 14 of 20: Collapse session sets (plan A3)

1. Register — **for the last time under the set-based machinery.**
2. Sessions numbered directly in a repository. Remove the set level from
   the CLI, the state files, and the extension tree. Keep the numbering
   convention staff said they liked.
3. **Migrate this set's own state rather than abandoning it.** Sessions 15
   through 17 must register, verify and close under whatever this session
   builds. If that migration does not work, this session is not done.
4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** the collapse, and the migration that keeps this set running
through it. **The risk here is missed references, not design.** Est. 12
Python tests.

### Session 15 of 20: The sessions view (plan D1)

1. Register — under the collapsed machinery from session 14.
2. Sessions view without the set level, preserving the existing row actions
   and the two-inline-actions rule.
3. **Keep the operator's status icons exactly as they are.** A session row
   renders `not-started.svg`, `in-progress.svg`, `done.svg` or
   `cancelled.svg` from `media/light/` and `media/dark/`, resolved by name
   through `SessionSetsModel.ICON_FILES` and passed to `TreeItem.iconPath`
   as a `{ light, dark }` pair. Removing the set level must not disturb
   that resolution.
4. **Do not "simplify" these to a single `fill:currentColor` asset.** That
   refactor has been proposed twice by different models at high confidence
   and it is wrong: a `contributes.viewsContainers` icon and a
   `TreeItem.iconPath` are not rendered by the same mechanism, and the
   light/dark split exists because the as-authored glyphs carried hardcoded
   `#ffffff` that made `not-started` nearly invisible on a light theme. The
   evidence is in `media/status-icon-theming.md`, and a Playwright test
   reads the computed style in a real Extension Development Host rather
   than trusting documentation.
5. **A session row is labelled with a three-digit zero-padded number** —
   `001`, `002`, ... `014` — because that is the shape staff read set
   numbers in and the operator asked for it back after the collapse. This
   is **presentation only**: the plan's `### Session N:` headings,
   `sessions.json`'s `number`, the `.dabbler/runs/s<N>/` ledger and every
   CLI `--session` argument keep the plain integer. One formatter owns the
   padding so the tree, the CLI's human output and any status line cannot
   disagree about how a session is named.
6. **The renumbering that created this session is itself a case to
   handle.** `sessions.json` holds a title per session and
   `progress.heal_title` replaces a stored title only when it is generic,
   so re-cutting a plan leaves the moved sessions carrying the titles of
   whatever used to sit at their numbers — sessions 16 and 17 are in that
   state right now. This session renders those titles, so it is the one
   that has to notice they can be stale. A not-started session with no
   history has no title worth preserving against the plan's.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** the collapsed tree, padded row labels, and the icons
untouched. Est. 8 TS tests.

### Session 16 of 20: The task level (plan D1, second half)

1. Register.
2. **A task level below the session, read from the enforced record.** A
   task row's position and label come from the session's
   `approved-plan.json` (`steps[].step_id`, `steps[].intent`); its
   execution state comes from `.dabbler/runs/s<N>/step-execution.jsonl`
   through `ledger.read_step_events`, `ledger.open_step` and
   `ledger.closed_step_ids`. Pending, in flight, done — folded, never
   maintained.
3. **Do not read step status from `activity-log.json`.** That is the layer
   that drifted. `writers.log_step` is reached only through
   `python -m ai_router.session log`, which an engine calls voluntarily or
   forgets to; `progress.build_step_rows` is visibly built around that
   unreliability ("keys are derived slugs an engine paraphrases",
   "unclaimed logged steps append"). `step-execution.jsonl` cannot drift
   the same way: a step is opened against a declared plan step and
   anchored to a base commit, the close is *earned* against the step's own
   envelope and deterministic evidence, and a pre-commit hook refuses a
   commit while a step is open. **This is the whole reason the task level
   is worth building now and was not worth keeping before.**
4. **The invariant is rendered, not recomputed.** The last `opened` row
   with no `closed` row after it is the open step, and there is never more
   than one. If the tree ever shows two tasks in flight for one session,
   that is a defect in the fold, not a state the record can hold.
5. **An unreadable execution record refuses; it never falls back.** The
   schema says a row failing validation is a refusal, not a skip, because
   a framework that cannot tell what is open must not guess. The tree says
   it cannot tell — it does not show the last good row as if it were
   current. Stale-but-plausible is the failure mode this level exists to
   end.
6. **The watcher covers the execution record, and this is the operator's
   condition, not a nicety.** The tree today watches only
   `docs/session-sets/**` (dead after session 14) and otherwise falls back
   to a 30-second poll. A task level that is up to 30 seconds behind is the
   same untrustworthy surface staff already rejected. The watcher must
   include `.dabbler/runs/*/step-execution.jsonl` so a step opening or
   closing refreshes the row on the event. **The acceptance test is a
   transition, not a render:** open a step, assert the row goes in-flight
   without a poll; close it, assert the row completes and the next opens.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** a task level that is a fold of an enforced record rather than
a narration. Est. 8 TS tests.

**This session depends on session 15 and not the reverse.** The two share
only the tree model's row dispatch. Session 15's own spec named this seam
in advance -- steps 2-5 were the view, steps 6-10 were the task level --
after session 14 proved what carrying two subsystems costs (D92). The
operator cut it here rather than discovering the cap again mid-round.

### Session 17 of 20: The tracked project config (precondition for D2)

**Why this exists, and why it sits before project setup.** Session 18 makes
project setup available to repositories that are not this one. A repository
set up that way has nowhere tracked to say what its tests are or how to run
them. Configuration resolves as the packaged `router-config.yaml` deep-merged
with a project-local `local-overrides.yaml`, and that overlay is gitignored;
`config._resolve_config_sources` returns those two and nothing else. The
arrangement works here only because this repository *is* the router, so its
`testing.suites` and its two hundred lines of `testing.selection.rules` ship
inside the package they configure.

`AI_ROUTER_CONFIG` is not the escape. A named config "is the whole answer and
takes no overlay", so a Java repository pointing at its own file would fork
the provider list, the model registry and the role preferences in order to
declare `mvn -q test`. That is the drift the layering exists to prevent.

**A suite command, its test roots, its path-to-test mapping and a packaging
feed are repository facts.** CI reads them, the next machine reads them, and
`ai_router.affected` refuses to run without them. None of them can live in a
gitignored file, and none belong in the installed distribution. Project setup
shipped before this ships a scaffold whose first real session cannot reach
step 4 of its own lifecycle.

1. Register.
2. **A third config source, tracked.** `dabbler.yaml` at the repository root,
   carrying `testing`, `packaging` and `paths` behind a `schema_version`.
   Precedence is packaged defaults, then this file, then
   `local-overrides.yaml`. The bundled config keeps providers, models and
   roles: those are distribution facts and do not become a per-repository
   decision.
3. **The overlay stops being able to say anything it likes.** Deep merge
   today would let a gitignored machine file replace a suite command or a
   packaging feed, and the run of record would then attribute to the
   repository a command it never declared. Give the overlay its own schema
   and refuse a key the repository owns. "Machine facts only" is a comment
   until something enforces it.
4. **Suites become plural in fact, not only in the schema.** `test_roots` and
   `test_glob` are declared per suite, because a repository that is Java and
   .NET at once has two of each and `pack` cannot say which ecosystem made
   which artifact. Session 18 will meet such a repository in its first
   project, so the shape has to exist before it, not after.
5. **This repository moves its own `testing` block out of package data and
   into its own `dabbler.yaml`, and that migration is the test.** A rule set
   that has only ever been read from the package it ships in has never proven
   it can be read from a repository. Doing it here is also the only way this
   session makes anything smaller rather than only adding.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the surface a repository that is not the router declares itself
on. Est. 12 Python tests.

**What this session is not.** It does not touch the record's own integrity —
there is still no sanctioned way to correct a wrong machine-written entry,
and an append-only record edited by hand is the one repair the framework must
never accept. That is a separate session and it is not yet planned.

### Session 18 of 20: Project setup as two sessions (plan D2)

1. Register.
2. Create or import the project plan, then break it into numbered sessions
   — two sessions, both cross-provider verified, neither waiting on a
   signature.
3. **Neither is an approval gate.** They are the two moments that determine
   what everything after them will build, which is an argument for verifying
   them hardest rather than for parking them in front of a person. Nothing
   in project setup blocks on a human.

4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** project setup, which is the framework's own sessions 1 and 2
made available to everyone else. Est. 8 TS tests.

### Session 19 of 20: The unresolved-session view (plan D3)

**Why this exists.** The framework never blocks on a person. A session that
reaches the round cap simply ends — `unresolved` or `remediated at the cap`,
per spec §3.c.i — and nothing notifies anyone. Session 17 closed
`REMEDIATED_AT_CAP` with one unreviewed finding, and the only way to see
that today is to read `sessions.json` and `.dabbler/runs/s17/` by hand.
This view is how the operator discovers, at planning time, what stopped and
why: the record's answer to the question an approval gate used to force.

1. Register.
2. Read at planning time rather than as an interruption: what stopped, at
   which round, the findings with vendor and severity, what the verifier
   looked at from the agency log, **whether the round had agency at all**
   (a direct-API round records `agency: none` — its verifier could never
   read the files, so its findings weigh differently from a round that
   could), **whether any read it relied on was transformed** (session 6's
   fidelity mark: the secret scrubber rewrote what the verifier was shown,
   which is how session 1 took a confident Major against correct code), and
   **which of the three terminal states it reached** — unresolved means
   blocking findings still stand unfixed and usually wants a respecify;
   remediated-at-the-cap means every finding was fixed and only the review
   of the fix is missing, which usually wants a send-back. Three actions,
   each a front-end over a command that already exists rather than new
   machinery: **send it back** (re-run the review loop over the outstanding
   delta), **respecify it** (rewrite the session's entry in this plan, then
   re-register it), **cancel** (`python -m ai_router.session cancel <N>
   --reason ...`). This session confirms the exact command each action
   issues; if one needs a command that does not exist, that is a finding
   against an earlier session, not licence to build a fourth path here.
3. **No approve-over action, because there is no approval anywhere.** The
   view reports; it never holds an engine open. There is no queue and no
   inbox, and reading a record is not the same as being blocked by one.

4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.

**Creates:** the last surface, and the one that makes an unresolved session
useful instead of merely failed. Est. 8 TS tests.

### Session 20 of 20: A round baseline that survives the trip (root cause of D98)

**Why this exists.** A verification round records `completion_tree`, written
by `snapshot_worktree_tree` through a throwaway index and anchored to no
ref. It is garbage-collectable on the machine that wrote it and it never
travels with a push, so a session continued on another machine arrives
unable to compute any fix delta. Session 14 hit this and shipped the
recovery (`verify reanchor`); D98 and D100 record that the root cause was
left open at the operator's direction. **This session closes it.**

1. Register.
2. **Anchor each snapshot as it is recorded.** Wrap the snapshot tree in a
   commit and point `refs/dabbler/rounds/s<N>/r<R>` at it, in the same call
   that appends the round. A ref cannot usefully point at a bare tree —
   most servers reject that on push — so the wrapping commit is the object
   the ref names. The tree it carries must hash **identically** to the
   recorded `completion_tree`, and the test asserts that equality rather
   than asserting a ref exists.
3. **Push those refs, because `git push` will not.** This repository
   configures no push refspec, so custom refs are simply left behind. The
   close is the one place a session pushes, and it has to carry the round
   refs with the branch. A push that silently drops them is the same defect
   in a new place.
4. **Fetch them, which is the part that makes this a session.** The
   receiving machine needs `+refs/dabbler/*:refs/dabbler/*` before the refs
   mean anything, and this checkout has only
   `+refs/heads/*:refs/remotes/origin/*`. `bootstrap` must write the
   refspec, and **an existing clone must be migrated**, or the fix only
   works on machines cloned after it ships — which is not much of a fix.
   The acceptance test is a two-checkout one: record a round in A, push,
   fetch in B, and resolve the baseline in B **without** `verify reanchor`.
5. **Decide the retention rule and write it down.** One ref per round per
   session, forever, is a namespace that only grows. The objects are tiny
   and history is the point, so "keep them" is a legitimate answer — but it
   must be a decision in the record, not an omission.
6. **`verify reanchor` stays, and stays refused when the tree resolves.**
   This session removes the *need* for it on well-configured machines; it
   does not remove the path. Older rounds carry no ref, a clone may predate
   the refspec, and a history can be rewritten. Its existing refusals are
   unchanged, and `head_commit` (shipped in session 14) remains the
   fallback that places a baseline for rounds recorded before any of this.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** a round baseline that is portable by construction, so a session
that changes machines resolves its own fix delta instead of recovering onto
a wider one. **The risk is the migration, not the anchoring** — step 4 is
where this session will actually be won or lost. Est. 10 Python tests.

**Not urgent, and deliberately last.** The recovery path works. What this
buys is avoiding the recovery's cost: a re-anchored baseline lands *before*
the round, so the next round re-reviews the whole session, and that can
exceed the evidence cap — which is what nearly happened in session 14. It
pays for itself the first time a moved session is too large to re-review.

---

## Acceptance criterion for the set

**The framework can run its own next session.** Not "the tests pass" and
not "the plan was followed" — the working test is whether session 20 could
have been specified, developed, verified, tested and closed by the thing
this set built, rather than by the machinery it replaces.

Three supporting checks, each answerable from the record rather than from
an opinion:

- **Every plan item appears exactly once**, and the specification has no
  section that no session builds.
- **No session skipped a lifecycle step**, and no verdict exists that
  `ai_router.verify` did not produce.
- **The seat cost per session was measured from session 3 onward**, so the
  next set is planned against numbers instead of hope.

---

## Test budget

**Roughly 118 Python and 24 TypeScript tests across the set**, at one test
per behaviour. The `AGENTS.md` ceilings are set aside per
`docs/operator-decisions.md`; the one-test-per-behaviour rule and the
banned-test-kinds list are **not** set aside.

**No falsifier twins, no source-text assertions, no migration-path tests,
no tests of test infrastructure, and no tests asserting exact markdown
strings.** Sessions 8 and 14 should delete more tests than they add.
