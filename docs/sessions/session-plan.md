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
totalSessions: 35
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

### Session 21 of 21: Close out set 148 on the record, and make the loop tests cheap

**Why this exists.** Set 148 is complete, but its acceptance evaluation lives
in `STATUS.md` as a status paragraph rather than in the decisions log as a
decision, and the evaluation found the seat-cost check **not met**: measured
for sessions 1, 3, 4 and 5 only, unmeasured for the seat sessions 6–14, and
`costUsd: null` for the API sessions 15–20. Separately, the suite's cost is
not Python: the thirty slowest tests take 3–11 s each and every second is a
process spawn — `sandbox_repo` runs nine git commands before a loop test
starts, and the loop shells to git again for every round's snapshot. That is
why `-n auto` cripples a host, and it is why the run of record takes 6:26.
Finally, `snapshot_worktree_tree` and `changed_paths_between` exist
**byte-identically** in both `evidence.py` and `checks.py`, imported from one
or the other by different callers — two implementations of one rule, which
ground rule 3 forbids and which is the seam this session needs anyway.

1. Register, then declare `--not-releasable`. The declaration names the
   three deliverables below and nothing else.
2. **Record the acceptance evaluation as a decision, before any code
   moves.** `session decision --decider orchestrator` with the three checks
   from `STATUS.md` in substance: criterion met (session 20 ran end to end
   on the framework this set built); check 1 met with the noted splits and
   session 20 outside the plan; check 2 met, with session 2's absent
   pre-verify row and the two framework-written cap-landing rows named as
   such; **check 3 not met**, with the four measured sessions listed and
   the operator's 2026-08-28 decision that it is **not back-filled** — the
   sessions are closed and the number would change nothing forward. What
   carries forward is the step, not the figure: every future session plan
   carries "measure this session's seat cost" as a numbered step, the way
   session 3's did and sessions 4–20's did not. A decision appended after
   the run of record moves the tree and fails the freshness gate, so this
   is step 2 and not step 8.
3. **One git seam.** Delete the `checks.py` copies of
   `snapshot_worktree_tree` and `changed_paths_between`; `runcli.py`,
   `verifyjob.py` and `workflow.py` import them from `evidence` as
   `affected.py`, `packaging.py` and `verify.py` already do. Route the
   remaining direct `["git", "-C", …]` calls in `journal.py` and
   `ledger.py` through `evidence.run_git` so one function is the only place
   the router spawns git. Net negative lines; no behaviour changes; no new
   test — the existing loop tests are the proof, and a source-text
   assertion that the duplicate is gone is a banned kind.
4. **Make the loop tests cheap without faking git.** Measure first:
   `pytest --durations=30` with the `sandbox_repo` setup timed separately
   from the loop, so the seconds are attributed before they are attacked.
   Then, in order of expected yield: build the seeded repo and its bare
   remote **once per session** and give each test a `shutil.copytree` copy
   (a git repository is a directory; the remote path is written relative so
   the pair stays valid after the copy); pin the git environment for the
   suite (`GIT_CONFIG_GLOBAL` to an empty file, `gc.auto=0`,
   `core.fsmonitor=false`, `commit.gpgsign=false`, `core.autocrlf=false`)
   so no test pays for the host's configuration; and drop any fixture git
   call whose result no test reads. A fake git is **not** in scope: the
   loop is trust machinery, and a fake that diverges from git's tree
   hashing is the failure mode that would matter most and show least.
   **Target:** no test above 1.5 s, and the `final-full` run of record
   under 3:00 at `-n 2`, read from `durationSeconds` in `test-runs.jsonl`
   against session 20's 379 s. `-n 2` stays pinned; this session does not
   promise `-n auto`.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record — which is
   also the measurement of step 4.
8. Close-out. Update `STATUS.md`: the evaluation now points at its decision
   number and the suite time is the new one.

**Creates:** the set's acceptance as a decision in the record, with the
seat-cost question closed rather than left owed; one git seam with net
negative lines; a run of record that costs half what it does today.
**Est. 0 new Python tests** — the fixture is not tested and the seam
deletes rather than adds. Not releasable.

**The risk is step 4's measurement, not its changes.** If the timing shows
the loop's own per-round git calls dominate rather than the fixture, the
template copy buys little and the honest move is to stop at the seam and
record the number, not to reach for a fake.

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

---

# Sessions 22–35: The TypeScript port — one artifact, one language, the record unchanged

> **Landed 2026-08-28, on the operator's instruction to start session 22.**
> Drafted the same day while session 21 was in flight; landed after session
> 21 closed, as its own part of this plan. `totalSessions` is now 35. The
> second suite and the three deterministic controls enter `dabbler.yaml` in
> session 23 — not here — because a control must be a session's verified
> work, not a plan edit.
> **Engine:** whichever seat the operator drives the session from. The
> seat-cost step in every session names the currency it measured.

## Why this set exists

The framework is one product shipped in two runtimes. The extension renders
in TypeScript; the router decides in Python (29,640 lines, 45 modules, 941
tests) and is installed per project into a `.venv` the extension has to
locate, which is the failure class `pythonInterpreter.ts` exists to paper
over. Staff who install "an extension" then discover a second install, a
second toolchain, and a version they must keep in step by convention —
`installCommandLine` pins nothing. The operator's stated goal is that the
infrastructure not be part of the project at all: one Marketplace artifact,
the router inside it, the project holding only its own record.

The port is feasible because the router's runtime is small in kind: process
spawning, file I/O, HTTP, JSON/YAML/TOML, hashing, and one read-only SQLite
query. Its three dependencies (`pyyaml`, `httpx`, `jsonschema`) have exact
Node twins (`yaml`, `fetch`, `ajv`). The Copilot CLI transport — the most
OS-bound module — gets simpler in Node, not harder: its two reader threads,
queue and lock become event-driven streams.

The port is dangerous for exactly one reason: **the router is the trust
machinery.** A gate that is mistranslated does not crash; it lets something
through. Every decision below serves that one risk.

## Three facts that shape the whole sequence

### 1. Integration first, against the implementation that already exists

The operator's build sequence is integration-driven design: contracts, then
the integration built against mocks, then mocks replaced by real
implementations. Applied here: the extension is rewired to talk to a `Router`
interface **before any Python is translated**, and the first implementation
of that interface is the Python spawn the extension performs today. The
"mock" is the real router. From that session on, every ported module slots
in behind an interface the extension already uses, and the cutover is a
one-line change of implementation, not a rewrite of forty call sites.

### 2. The record is the contract, and parity is a control, not an opinion

The on-disk record — `.dabbler/runs/`, `sessions.json`, the decisions log,
the project work plan — is schema-defined and machine-written. The port is
correct when the TypeScript router, given the same fixture repository and the
same verb, writes **byte-identical** files to the Python router. That check
is a **declared deterministic control** in `dabbler.yaml`, run before every
verification round of this set, with its exit code as the fact. It is not a
test (a test of test infrastructure is a banned kind) and it is not a
verifier's judgment (a verifier cannot read 29,000 lines for drift). Python
stays installed until the last session precisely so the control can run.

### 3. Sessions are sized by lines ported, and the seat is measured every time

Set 148's honest unit was $8–$12 per code session (D37, D48) — and set 148
measured that for four sessions of twenty (D127). Every session below
carries the measurement as a numbered step. Sessions port at most ~3,000
lines plus their tests; `verify.py` (2,537 lines) is one session by itself
and is split on its existing seams as it is ported, never translated as one
file. At the operator's cadence of three to five sessions a day, fourteen
sessions is three to four working days.

## Decisions this set takes, and where

| Decision | Session | Default if not overridden |
| --- | --- | --- |
| What is retired rather than ported: the run core (`runcli`, `runcore`, `runproject`, `facts`, `fixloop`, `testphase` — 4,396 lines, 119 tests, not spawned by the extension, no runs ever registered here: D88) and the six-step workflow (`workflow`, `solution`, `contractdoc`, `stepreview` — 2,194 lines, 99 tests, spawned by the Solution Explorer) | 22 | Run core retired; six-step ported |
| Package layout | 22 | `packages/router` (npm `dabbler-ai-router`, `bin: dabbler`), extension depends on it through a workspace, esbuild bundles both into the VSIX |
| Node floor | 22 | The extension host's Node (VS Code 1.135) inside VS Code; Node 22+ outside it, for `node:sqlite` |
| Dependency ceiling | 23 | `yaml`, `ajv`, `smol-toml`. Nothing native. Adding a fourth is a decision in the log |
| Record versioning | 35 | A `frameworkVersion` stamp on session and round rows, added at cutover as the set's one record change |

## What this set does NOT do (do not reopen)

- **No redesign.** The lifecycle, the five gates, the verdict vocabulary,
  the schemas, the prompts, the severity rule, the dispute ladder: identical.
  A session that "improves" a rule while porting it has broken parity and
  must put it back.
- **No fake git.** Parity fixtures use real repositories.
- **No Electron or web shell.** The port makes those possible; this set
  ships the extension and the CLI.
- **No per-project code.** After cutover a project holds `dabbler.yaml`,
  `docs/sessions/`, `.dabbler/runs/`, and the `AGENTS.md` fence. No `.venv`,
  no `node_modules`, no copy of the router.
- **No new features.** Every owed item in `STATUS.md` (D116, D122, D124,
  D126, D114) stays owed; the port carries the gaps across unchanged, and
  says so.

---

### Session 22 of 35: Decide the inventory before anything is translated

**Why this exists.** Two subsystems have no settled owner. The run core
(D88) has never registered a run in this repository and the extension never
spawns it; the six-step workflow is spawned by the Solution Explorer but its
walkthrough was declared the wrong shape for its audience. Porting either
without deciding is 6,600 lines of translation that may be deleted. This
session is prose, verified the way sessions 1 and 2 were.

1. Register; declare `--not-releasable`.
2. Record the port inventory as a decision: for each of the 45 modules,
   *port*, *retire*, or *merge*, with its line count and its test file. The
   default is in the table above; a departure names its reason.
3. Decide D88 on the record, with the operator: the run core's projection
   replaces the lifecycle's record, or the run core is retired. "Retired"
   means deleted in session 34, not left as Python.
4. Verify the runtime floor: read the extension host's `process.versions`
   on VS Code 1.135 and confirm `node:sqlite` is present; if not, the
   `seat_cost` design in session 29 uses `sql.js` and records the ~7 % WAL
   undercount as a known limitation rather than a native binding.
5. Record the package layout and the dependency ceiling as decisions.
6. Design the parity control: the fixture corpus (one repository per
   lifecycle shape: fresh, in-flight, disputed, at-cap, moved-machine), the
   verb list it drives, the files it compares, and the two things it
   normalizes (timestamps, absolute paths) — nothing else.
7. Measure this session's seat cost and record it.
8. Affected tests as preverify. The selector reports no test affected for a
   prose session and **nothing is recorded** — a run recorded against an
   empty selection is a `policy_violation`, and session 2's record shows the
   shape: no `preverify-targeted` row at all.
9. Cross-provider verification.
10. Full test suite, recorded as the `final-full` run of record.
11. Close-out.

**Creates:** the inventory, four decisions, the parity design. Est. 0 tests.

---

### Session 23 of 35: Contracts — types from schemas, the Router interface, and the controls

**Why this exists.** The twenty JSON schemas under `ai_router/schemas/` are
the framework's meaning. Today `types.ts` is a hand-kept mirror of what
Python writes. From this session the schemas generate the types, in one
direction, and the drift is a compile error.

1. Register; declare `--not-releasable`.
2. Create `packages/router` with the root workspace; ESLint and `tsc
   --strict` configured; `vitest` as the runner, path-list form for
   targeted runs.
3. Generate TypeScript types from every schema with one generator, output
   checked in, a control that fails when the output is stale.
4. Define the `Router` interface from the extension's spawn sites: one
   method per verb the extension calls (`session.*`, `progress`, `modules`,
   `verify`, `bootstrap`, `workflow`, `ledger`, `test_evidence`,
   `approved_plan`, `affected`), typed by the generated types. The `dabbler`
   CLI verb list is the same list plus the engine-facing verbs.
5. Build the parity control from session 22's design: a script that runs a
   verb against a fixture through both routers and compares the written
   files. Declare it in `dabbler.yaml` as a required control, with `tsc
   --noEmit` and ESLint beside it — the first controls this repository has
   ever declared.
6. Declare the second suite in `dabbler.yaml` (`typescript`, vitest,
   `test_roots`, `test_glob`), so `affected` selects across both.
7. Measure this session's seat cost and record it.
8. Affected tests as preverify.
9. Cross-provider verification.
10. Full test suite (both suites), recorded as the `final-full` run of record.
11. Close-out.

**Creates:** the package, the types, the interface, three controls, the second
suite. Est. 6 TS tests (the generator and the interface's error mapping).

---

### Session 24 of 35: The extension talks to the interface, and Python answers

**Why this exists.** Integration before implementation. Every place the
extension spawns `python -m ai_router.*` becomes a call on `Router`, and
the only implementation is `PythonSpawnRouter`, which wraps today's
`routerCli.ts` unchanged. Nothing the user sees changes; Playwright proves
it. From here the port is invisible to the extension.

1. Register; declare `--not-releasable`.
2. Implement `PythonSpawnRouter` over `runRouterCli`; the projection poll,
   the module lifecycle, the session commands, and the troubleshoot command
   go through it. `pythonInterpreter.ts` stays — it is this implementation's
   private concern now, not the extension's.
3. Delete `types.ts` in favour of the generated types.
4. Playwright and the mocha suite green, unchanged in count except where a
   test asserted a spawn that no longer exists as such.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** one seam. Net negative TS lines. Est. 0 new tests.

---

### Session 25 of 35: Foundation modules

`config` (640), `secret_resolver` (47), `identity` (235), `verdict` (419),
`lockfile` (158), `runtime_mode` (84), `metrics` (258) — 1,841 lines, ~98
tests. Leaves of the import graph; everything above depends on them.

1. Register; declare `--not-releasable`.
2. Port each module and its test file, one behavior per test, in the order
   listed. `config` validates against the schema with `ajv`; the rate-less
   routable entry still fails load (BREAKING in set 109 and still true).
3. Parity control green for `config` load and `verdict` parse on the corpus.
4. Measure this session's seat cost and record it.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record.
8. Close-out.

**Creates:** the foundation. Est. 98 TS tests, ported; Python tests stay
until session 35.

---

### Session 26 of 35: The record — journal, ledger, writers

`journal` (846), `ledger` (901), `writers` (881) — 2,628 lines, 38 tests.
These are the sanctioned writers: everything under `.dabbler/runs/` and
`docs/sessions/` is written here and nowhere else. `journal.run_git` is the
one place the router spawns git (session 21 made it so), so this is also
the session the git seam crosses. This is the session the parity control
was built for.

1. Register; declare `--not-releasable`.
2. Port the three modules. Schema validation on every write, refusal on a
   hand-shaped row, append-only semantics, the lifecycle lock — exactly as
   Python does them. `ledger.append_round` carries D126's nit forward
   unchanged (it is owed, not fixed here). `run_git` is ported as the one
   git spawn, bytes as a mode of it and not a second function.
3. Parity control green on every write the corpus exercises: state writes,
   round rows, decisions, the work plan.
4. Measure this session's seat cost and record it.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record.
8. Close-out.

**Creates:** the record, written by TypeScript, indistinguishable from
Python's. Est. 38 TS tests, ported.

---

### Session 27 of 35: Evidence, checks, test evidence, affected

`evidence` (902), `checks` (1,001), `test_evidence` (807), `affected` (564)
— 3,274 lines, ~72 tests. Tree snapshots through a throwaway index on the
`journal.run_git` seam, process execution with the Windows `taskkill /T`
tree kill and `shell: true` for declared shell commands, the run-of-record
binding, and the selector.

1. Register; declare `--not-releasable`.
2. Port `evidence` first: its snapshot trees must hash identically to
   Python's — the parity control compares `completion_tree` values, not
   just files.
3. Port `checks` — spawn, kill, exit-code reading, the `.cmd` shim
   resolution on Windows (spawn the shim's target, never `shell: true` for
   an argv command). Capture the Node error code for an over-long command
   line as a specimen and map it to `argv-too-large`. Its test file is
   `test_runcore_checks.py`, which drives `checks`, not the run core; it is
   ported under a name that says so.
4. Port `test_evidence` and `affected`; the vitest path-list form satisfies
   the targeted-command audit without D116.
5. Parity control green on `test-runs.jsonl` and snapshot trees.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** process and evidence under TypeScript. Est. 72 TS tests, ported.

---

### Session 28 of 35: Transports I — API, offline, routing, selection, discovery

`transports/base` (49), `transports/offline` (140), `transports/api` (292),
`route` (586), `selection` (146), `discovery` (1,057) — 2,270 lines, 82
tests. `fetch` with streaming replaces `httpx`; `exclude_providers` is
honored on every path including offline (the set-143 defect stays fixed).

1. Register; declare `--not-releasable`.
2. Port in the order listed; the offline transport first so every later
   session's tests run without a network, as today.
3. `discovery` reads and writes `copilot-catalog.lock` identically; parity
   on the lock file.
4. One live `e2e`-marked call per provider as evidence, recorded, excluded
   from the default run.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** routing under TypeScript. Est. 82 TS tests, ported.

---

### Session 29 of 35: Transport II — the Copilot CLI state machine and seat cost

`transports/copilot` (2,074) and `seat_cost` (304) — 2,378 lines, 97 tests.
The most OS-bound code in the router, and the session where Node's model is
an advantage: reader threads, queue and lock become `readline` over the
child's streams; three-tier timeouts become timers reset on first byte.

1. Register; declare `--not-releasable`.
2. Port the dispatch state machine: spawn, first-byte and total timeouts,
   kill, the temp-file pull handoff above 24,000 rendered units, the
   nonce-acknowledgement footer, the stderr error taxonomy. Port
   `list2cmdline` (~20 lines) so the rendered-argv measurement is the same
   number on the same input.
3. Resolve `copilot.cmd` to its target and spawn that; never `shell: true`
   (cmd.exe's 8,191-character line would gut the handoff headroom).
4. Port `seat_cost` on `node:sqlite`, `readOnly`, `mode=ro` semantics; the
   WAL is read, `immutable` is not used.
5. **Live probe on the seat**, as set 137 did: one verification prompt over
   the handoff threshold, facts planted head, middle and tail, the ack
   validated and stripped. Recorded as evidence.
6. Measure this session's seat cost and record it — through the ported
   module, which is its own acceptance test.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** the seat under TypeScript. Est. 97 TS tests, ported.

---

### Session 30 of 35: The session lifecycle

`session` (1,386), `gates` (421), `progress` (1,050), `modules` (246) —
3,103 lines, 138 tests. Start, declare, log, decision, plan, close, cancel,
restore, migrate; the five gates; the projection the extension renders; the
module lifecycle.

1. Register; declare `--not-releasable`.
2. Port `gates` first and run the parity control on `close --dry-run` rows
   for every corpus shape — a gate that differs by one row is the set's
   worst outcome, and this is the cheapest place to see it.
3. Port `session`, `progress`, `modules`.
4. Parity control green on `sessions.json`, the activity log, the decisions
   log, the project work plan, and the projection JSON.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the lifecycle under TypeScript. Est. 138 TS tests, ported.

---

### Session 31 of 35: Verification support — agency, verifyjob, the approved plan

`agency` (921), `verifyjob` (782), `approved_plan` (590), `plan_review`
(812) — 3,105 lines, ~81 tests. The verifier's read surface and its write
decisions, the verification job contract, the hashed immutable plan and its
amendments, the step-execution record.

1. Register; declare `--not-releasable`.
2. Port `agency`: faithful reads, the recorded write decisions, the
   `--available-tools` restriction on the seat.
3. Port `approved_plan` and `plan_review`: the hash covers every field but
   `amendments`, a step without an evidence contract cannot be written, a
   plan over seven steps cannot be written — the schema refuses, never a
   reviewer.
4. Port `verifyjob`. Parity on `approved-plan.json`, `step-execution.jsonl`,
   and the agency log.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** the verifier's surface under TypeScript. Est. 81 TS tests,
ported.

---

### Session 32 of 35: The verification loop

`verify` (2,537 lines, 57 tests). The largest module, and the one the
142–147 envelope wanted under 1,200 by extraction. It is ported **as the
extraction it never got**: rounds, bundle, disputes and adjudication,
reanchor, and the loop each become a file, and no file exceeds 800 lines.
Behavior does not change; the parity control is on `rounds.jsonl`,
`disputes.jsonl`, the verifier-output files, and the `refs/dabbler/rounds/`
anchors session 20 introduced.

1. Register; declare `--not-releasable`.
2. Port by seam, running the corpus after each: round one, the fix-delta
   round, the cap, the dispute ladder, adjudication, reanchor and its
   refusals, the severity-gated stop.
3. Prompts and templates copied byte-for-byte; the verdict parser and the
   prompt stay pinned by the same round-trip test that pins them today.
4. Parity control green on every round row the corpus produces, including
   the anchored commit's tree equalling `completion_tree`.
5. Measure this session's seat cost and record it.
6. Affected tests as preverify.
7. Cross-provider verification — **through the ported loop**, with the
   Python loop run once more on the same tree as a recorded cross-check.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.

**Creates:** verification under TypeScript, in five files instead of one.
Est. 57 TS tests, ported.

---

### Session 33 of 35: Bootstrap, packaging, and the `dabbler` command on the PATH

`bootstrap` (1,146), `packaging` (743) — 1,889 lines, 55 tests — plus the
CLI itself and its delivery. This is the session that makes the
infrastructure not part of the project.

1. Register; declare `--not-releasable`.
2. Port `bootstrap`: the `AGENTS.md` fence is regenerated with `dabbler
   <verb>` in place of `python -m ai_router.<module>`; the pre-commit hook
   references the shim, not an interpreter path; the `.gitignore` and the
   user-scope `DABBLER_TRANSPORT` side effects are kept exactly (they are
   documented traps, not bugs to fix here).
3. Port `packaging`: the feed credential resolves at spawn into one argv
   element and is placed in no environment, as today.
4. Ship the `dabbler` binary in the router package (`bin`), and have the
   extension prepend a shim directory to integrated-terminal `PATH` through
   `EnvironmentVariableCollection`, running the CLI on the extension host's
   own Node (`ELECTRON_RUN_AS_NODE`). Outside VS Code: `npm i -g`.
5. Prove it on a scratch repository with no `.venv` and no Python on
   `PATH`: `dabbler session start` from a VS Code terminal registers a
   session. Recorded as evidence.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** zero-install delivery. Est. 55 TS tests, ported, plus 3 for the
shim and the fence.

---

### Session 34 of 35: The six-step workflow ported, the run core retired

Per session 22's decisions. Default: `workflow` (1,363), `solution` (351),
`contractdoc` (196), `stepreview` (284) — 2,194 lines, 99 tests — are
ported, and `runcli`, `runcore`, `runproject`, `facts`, `fixloop`,
`testphase` — 4,396 lines, 119 tests — are deleted with their tests, D88
closed. If session 22 decided otherwise, this session is what it decided.

1. Register; declare `--not-releasable`.
2. Port the six-step driver; parity on the workflow event log and the
   Solution Explorer projection.
3. Delete the run core, its tests, its `dabbler` verbs, and every reference
   in docs; `dabbler status` now reads the lifecycle's record, which is the
   half of D88 this closes.
4. Measure this session's seat cost and record it.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record.
8. Close-out.

**Creates:** the decision made real. Net negative lines across both
languages. Est. 99 TS tests, ported; 119 Python tests deleted.

---

### Session 35 of 35: Cutover — the extension calls in-process, and Python leaves

1. Register; declare **`--releasable`** — this session publishes.
2. `InProcessRouter` replaces `PythonSpawnRouter` as the extension's
   implementation; delete `PythonSpawnRouter`, `pythonInterpreter.ts`,
   `installAiRouter.ts`, the venv creation in `bootstrapProject.ts`, and the
   projection's Python poll (the tree now reads the projection through a
   function call).
3. Add `frameworkVersion` to session and round rows — the set's one record
   change — and bump both schemas.
4. Run the parity control one last time across the whole corpus and every
   verb, with Python still present, and record the run. Then delete
   `ai_router/`, `tests/`, `pyproject.toml`, `pytest.ini`, the Python CI
   job, the `python` suite from `dabbler.yaml`, and the parity control
   itself (it has nothing left to compare).
5. Rewrite `README.md`, `MIGRATION-FROM-V1.md`, `docs/quick-start.md`, and
   the `AGENTS.md` fence for one artifact; `STATUS.md` says the port is
   complete and what it changed.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify.
8. Cross-provider verification — this round is verified, recorded and closed
   **by the TypeScript router**, which is the set's acceptance test.
9. Full test suite, recorded as the `final-full` run of record.
10. Commit, push once, then package: extension 2.0.0 and `dabbler-ai-router`
    2.0.0 to their feeds through `dabbler packaging`.
11. Close via the gate.

**Creates:** one artifact. **The risk is step 4's ordering** — the parity
run must be recorded before the deletion, or the set's central claim rests
on memory.

---

## Acceptance criterion for sessions 22–35

**The framework closes its own last session with no Python in the tree.**
Session 35's round, run of record, gates and close are performed by the
TypeScript router, and `ai_router/` does not exist at that close.

Four supporting checks, each answerable from the record:

- **The parity control's final run** (session 35, step 4) shows
  byte-identical record files for every verb on every corpus shape, and is
  recorded before the Python deletion.
- **A project with no `.venv` and no Python on `PATH`** ran `dabbler session
  start` from a VS Code terminal (session 33, step 5), recorded as evidence.
- **No behavior lost:** the TypeScript suite carries one test per ported
  behavior; the ported count equals the Python count for every kept module,
  and the deleted count equals the retired modules' tests. No Python test
  remains.
- **Seat cost is recorded for every session 22–35.**

## Test budget for sessions 22–35

**One test per behavior, ported.** Roughly 820 TypeScript tests for kept
modules (941 minus the retired run core's 119, less whatever session 22
retires beyond it and whatever was a banned kind in Python), plus the
extension's existing 153 and about 10 new ones named above. Python tests are
deleted with their modules, all in session 35 except the run core's in
session 34.

**No falsifier twins, no source-text assertions (ESLint is the source-text
check), no migration-path tests, no tests of test infrastructure (the parity
control is a control, not a test), and no tests asserting exact markdown
strings.** A ported test that was one of these in Python is deleted, not
ported, and the decision names it.
