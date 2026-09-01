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

# Sessions 22–36: The TypeScript port — one artifact, one language, the record unchanged

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

### Session 22 of 36: Decide the inventory before anything is translated

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
   means deleted in session 35, not left as Python.
4. Verify the runtime floor: read the extension host's `process.versions`
   on VS Code 1.135 and confirm `node:sqlite` is present; if not, the
   `seat_cost` design in session 30 uses `sql.js` and records the ~7 % WAL
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
   shape. (In this session's own round 1 it instead reported every tracked
   ledger file under `.dabbler/runs/` as `selection_unknown` — D134 — and
   the smoke test was run and recorded; D135 then un-tracked the ledger, so
   the rows do not recur.)
9. Cross-provider verification.
10. Full test suite, recorded as the `final-full` run of record.
11. Close-out.

**Creates:** the inventory, four decisions, the parity design. Est. 0 tests.

---

### Session 23 of 36: Contracts — types from schemas, the Router interface, and the controls

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
5. Build the parity control from session 22's design, and declare it in
   `dabbler.yaml` as a required control with `tsc --noEmit` and ESLint
   beside it — the first controls this repository has ever declared. It is
   declared and required from this session, running the comparison that
   needs one router: every corpus shape built twice through the Python
   router and compared byte for byte. The cross-router comparison — a verb
   run against a fixture through both routers, with the written files
   compared — joins it with the first ported verb. A control declared here
   that compared two routers would have compared nothing, because the
   second router does not exist yet, and would have written a green
   `analyzer: pass` on every round (D146, D159).
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

### Session 24 of 36: The extension talks to the interface, and Python answers

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

### Session 25 of 36: Foundation modules

`config` (640), `secret_resolver` (47), `identity` (235), `verdict` (419),
`lockfile` (158), `runtime_mode` (84), `metrics` (258) — 1,841 lines, ~98
tests. Leaves of the import graph; everything above depends on them.

1. Register; declare `--not-releasable`.
2. Port each module and its test file, one behavior per test, in the order
   listed. `config` validates against the schema with `ajv`; the rate-less
   routable entry still fails load (BREAKING in set 109 and still true).
3. Parity control green on the corpus for what this session makes runnable.
   `metrics` is the one verb in this batch, so it is the control's first
   cross-router case, and the report it prints is computed from a full
   three-layer `config` load — which is how `config` enters the control.
   `verdict` has no command line of its own and is reached only through
   `verify`, so its parity case lands in session 33 with that verb; this
   session proves it instead against every verifier output this repository
   holds, and records the result (D163).
4. Measure this session's seat cost and record it.
5. Affected tests as preverify.
6. Cross-provider verification.
7. Full test suite, recorded as the `final-full` run of record.
8. Close-out.

**Creates:** the foundation. Est. 98 TS tests, ported; Python tests stay
until session 36.

---

### Session 26 of 36: The record — journal, ledger, writers

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

### Session 27 of 36: Evidence, checks, test evidence, affected

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

### Session 28 of 36: Transports I — API, offline, routing, selection, discovery

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

### Session 29 of 36: One vocabulary for a failure, one stamp for a measurement

Inserted between 28 and 29 by the operator, which moved the port's remaining
sessions up by one — Transport II is now 30, the cutover 36. Earlier decision
records name the old numbers and are left alone: they were true when written,
and rewriting an append-only log to match a later plan is the one thing that
log exists to prevent.

It discharges the two rulings the port left open. They are the same shape:
**both routers write a different string into a record for the same event,
because the string is the name of whichever library did the work.**

**The failure vocabulary.** `discovery` records a failed vendor enumeration
as the failing HTTP library's own exception class — `TimeoutException` under
`httpx`, `HttpTimeoutError` under `fetch`. Both routers write from a shared
list instead: `timeout`, `network-error`, `http-error`, `parse-error` and
`unknown-error`, joining the three terms the field already carries
(`no-api-key`, `provider-disabled`, `no-enumeration-adapter`). Timeout and
unreachable-host stay separate terms because their remedies differ — raise
the ceiling, against fix DNS or the URL.

The mapping is a **closed allow-list**: an unrecognised exception becomes
`unknown-error` rather than passing its class name through, because an open
mapping breaks the byte comparison the first time an unmapped failure
happens. The original class name is written nowhere. A second recorded field
would recreate the problem, and excluding that field from the comparison
would put a value in the record that nothing checks.

**The measurement stamp.** `evidence.run_absence_search` re-runs a reviewer's
declared search and stamps the engine that produced the count —
`python-re/<version>` against `node-regexp/<node>`. The field's job is not
engine comparison but anti-forgery: it overwrites whatever the reviewer
claimed, so the row says the framework measured this rather than the reviewer
asserting it. One framework-owned token does that job in both routers, and
ends an instability inside the Python router alone, where today the value
moves whenever the interpreter's patch version does.

1. Register; declare `--not-releasable`.
2. Land both changes in **Python first, in their own commit**. Python
   decides and the port agrees, and the parity control's sequencing rules
   want the reference implementation settled before the port moves.
3. Update the Python tests and run them.
4. Mirror both in the TypeScript router, and mirror the Python tests in
   vitest.
5. **Prove the vocabulary in the parity control.** Today the corpus scrubs
   the provider keys, so every vendor fails as the shared `no-api-key`
   constant and not one of the new terms is ever compared. A case has to
   reach a real transport failure with no network — a provider pointed at a
   closed local port — or the vocabulary is asserted rather than checked.
6. Measure this session's seat cost and record it.
7. Affected tests as preverify.
8. Cross-provider verification.
9. Full test suite, recorded as the `final-full` run of record.
10. Close-out.

**Creates:** one word for one event, whichever router wrote it. Closes the
two owed rulings. Est. ~8 tests changed, ~6 added; net near zero lines.

---

### Session 30 of 36: Transport II — the Copilot CLI state machine and seat cost

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

### Session 31 of 36: The session lifecycle

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

### Session 32 of 36: Verification support — agency, verifyjob, the approved plan

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

### Session 33 of 36: The verification loop

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

### Session 34 of 36: Bootstrap, packaging, and the `dabbler` command on the PATH

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

### Session 35 of 36: The six-step workflow ported, the run core retired

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

### Session 36 of 36: Cutover — the extension calls in-process, and Python leaves

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

> **Amended in session 36, 2026-08-29, on the record.** Two of the steps
> above ask for something the implementation cannot do. Session 36's round 2
> upheld both, and both of its acceptance criteria named the same resolution:
> the governing plan must be formally amended rather than substituted against.
> A plan and a record that disagree are two records of one decision, which is
> D224's lesson from session 35. The amendment is here rather than
> in a decision alone so that a reader of the plan meets it. **It changes
> what this session was required to deliver, so it is the operator's to
> reverse** — D237 and D234 carry the full reasoning, and the verifier's two
> upheld findings are in `.dabbler/runs/s36/`.
>
> **Step 3 — "and bump both schemas" is not performed, and the round row
> spells the field `framework_version`.** The round record has never carried
> a version discriminator: `rounds.schema.json` requires `round`, `verdict`,
> `blocking`, `findings`, `completion_tree` and `recorded_at`, and declares
> no version field anywhere. Incrementing one would mean ADDING a second new
> field to the round record, which the same sentence forbids ("the set's one
> record change"). The session record does carry one, and moving
> `schemaVersion` from 5 to 6 for an additive optional property would make
> every existing ledger fail validation against the shipped schema and would
> tell a reader nothing `frameworkVersion` does not already say more
> precisely. On the name: `rounds.jsonl` is snake_case in all twenty-four of
> its keys and `sessions.json` is camelCase in all twelve of its; the plan's
> sentence names one FACT for two records with two conventions, and each
> record keeps its own. `docs/schema-reference.md` documents both spellings
> side by side.
>
> **Step 10 — the artifacts are prepared at 2.0.0 and published by their tag
> pipelines, not by `dabbler packaging`.** The packaging declaration models
> exactly one `pack` and one `push` with one `feed` and one `secret`
> (`packages/router/src/packaging.ts`), and this repository releases two
> artifacts to two registries under two credentials. Declaring one would file
> a release record that names half of a release; declaring both needs a
> packaging model this set has no room to redesign. A local run would also
> fail to authenticate — both pipelines mint their credential by OIDC from a
> workflow identity — and would bypass the `require-green-test` gate on the
> tagged commit, which is an operator decision recorded in the workflows
> themselves. **What this session delivers instead:** both artifacts at
> 2.0.0, `release.yml` repointed from PyPI to npm, `publish-vscode.yml`
> intact, the `Test` workflow's Python job removed, and the tag push left to
> the operator because it is irreversible and goes to two public registries.
>
> **Step 6 — there is no seat cost to measure, and the supporting acceptance
> check below is amended with it.** No call this session went through a
> Copilot seat; all three verification rounds were bought over the direct API,
> so `seat_cost` has no conversation id to price. The cost is recorded as
> tokens per round (D239), which is what the metrics ledger carries. Filing a
> zero would read as a measurement of a seat that was never used.


---

## Acceptance criterion for sessions 22–36

**The framework closes its own last session with no Python in the tree.**
Session 36's round, run of record, gates and close are performed by the
TypeScript router, and `ai_router/` does not exist at that close.

Four supporting checks, each answerable from the record:

- **The parity control's final run** (session 36, step 4) shows
  byte-identical record files for every verb on every corpus shape, and is
  recorded before the Python deletion.
- **A project with no `.venv` and no Python on `PATH`** ran `dabbler session
  start` from a VS Code terminal (session 34, step 5), recorded as evidence.
- **No behavior lost:** the TypeScript suite carries one test per ported
  behavior; the ported count equals the Python count for every kept module,
  and the deleted count equals the retired modules' tests. No Python test
  remains.
- **Seat cost is recorded for every session 22–36 that used a seat.**
  *(Amended in session 36 with step 6 above: sessions 33–36 ran on the direct
  API, where there is no conversation id to price. Their cost is recorded as
  tokens per round in the metrics ledger. A zero filed against a seat nobody
  used would read as a measurement rather than as an absence.)*

## Test budget for sessions 22–36

**One test per behavior, ported.** Roughly 820 TypeScript tests for kept
modules (941 minus the retired run core's 119, less whatever session 22
retires beyond it and whatever was a banned kind in Python), plus the
extension's existing 153 and about 10 new ones named above. Python tests are
deleted with their modules, all in session 36 except the run core's in
session 35.

**No falsifier twins, no source-text assertions (ESLint is the source-text
check), no migration-path tests, no tests of test infrastructure (the parity
control is a control, not a test), and no tests asserting exact markdown
strings.** A ported test that was one of these in Python is deleted, not
ported, and the decision names it.


---

## Why sessions 37–50 exist

The port finished a rebuild; it did not change who the framework serves.
Sessions 37–50 do that, against four inputs that arrived together on
2026-08-30: the operator's eight DX principles, `csv-model`'s feedback log
(nine items found by *using* the framework on a real three-repository .NET
project), the RACI matrix's allocation rule, and a parallel review of this
plan's own first draft by `gpt-5-6-sol` and `gemini-3-1-pro`.

**The allocation rule governs every session here**, asked in order:
(1) can it be made deterministic? — then it is the framework's, as a check, a
selector, a projection or a state machine; (2) is it judgment-shaped? — then it
is the working AI's, resolved by the ordered tiebreaks and journaled; (3) does
it fall in a human-required class? — external or hard-to-reverse consequence,
underivable value trade-off, accountability sign-off, or **anything that
reduces verification**, which is checked first and is absolute.

**The ordering of the last two is the correction the review forced.** The
draft had "nothing blocks on a person" and "verification reduction is always
the operator's" both in force, and session 41 proceeding on a default when no
test suite was declared. Both reviewers found the same hole: a repository could
then run ten sessions of untested code and close clean every time. There is no
contradiction once the two are ordered as the RACI already orders them —
**nothing blocks on a person for a judgment call, and verification reduction is
not a judgment call.** Where an unanswered decision would reduce what
verification proves, the *close* refuses. Work never stops; the record does not
get to say verified.

### One correction to the RACI, and it makes a session cheaper

The RACI marks the Solution Explorer row a live defect, on the grounds that the
projection's *"only writer was Python — deleted at the cutover. Nothing writes
it."* **That is not the case.** `writeProjection` is TypeScript in
`packages/router/src/workflow/project.ts`, and `tryWriteProjection` is called
from six sites. Every mutating `dabbler workflow` command rewrites the
projection today. The tree is empty for three cheaper reasons, all addressed in
session 42: nothing scaffolds a `solution.yaml`; the one read-only verb
(`workflow status`) computes the projection without writing it; and the view
has no `viewsWelcome`. The framework does not owe this row a writer. It owes it
a first run and a sentence.

### What this block deliberately does NOT do

- **No executor.** RACI open item 1 is not settled here. The operator still
  hands off a work package.
- **No build orchestration.** Reinforced by review: session 45 reads build and
  feed configuration and reconciles it. It writes only a repository-scoped
  declaration, only as the execution of an answered decision, never
  machine-global state and never a credential. Maven source-switching is
  **deleted from the plan** — its mechanism is an install, and an install is a
  build.
- **No git submodules.** Session 45 serves the request that produced them.
- **No opportunistic refactor.** Session 37 is a survey that files findings and
  fixes only what needs no design decision.

### Settled before session 44, not left open

- **The file is `solution-dependencies.json`.** "Local" names a resolution
  mode, not a property of the dependency, and the file outlives the local feed.
  A tracked filename is part of the public contract and cannot be chosen while
  its readers are being written.
- **Who asserts that a package is ours.** The framework cannot derive it from a
  `.csproj` or a POM. It is supplied once, when a dependency is first seen, as
  an owed decision, and validated on every run thereafter.
- **Where a solution-spanning plan lives** remains open and blocks nothing.

---

### How to run one of these

Each session below is one run of the lifecycle in `AGENTS.md` — register,
declare, work, targeted tests, cross-provider verification, the full suite as
the run of record, commit and push once, close through the gates. **The
sessions are strictly sequential**: the ledger holds one `in-progress` entry,
`declare` takes the lifecycle lock, and several of these amend the plan for
ones that follow. Session 37's survey in particular rewrites the step lists of
41, 42 and 47 before they run.

Nothing here needs a decision from the operator before it starts. Where a
session meets one, it raises it in the shape session 39 builds — with a stated
default — and keeps going, except where the answer would reduce what
verification proves, in which case the close waits rather than the work.

---

### Session 37 of 50: The extension surveyed against the principles

*Allocation: question 2 — judgment-shaped, so the working AI leads and
journals. Scheduled first because sessions 41, 42 and 47 all reopen extension
code, and a conformance pass after them guarantees the same handlers are
designed twice.*

The extension is 24 files, 4,029 lines and 123 tests. This session walks all of
it and produces a **finite findings table** — file, principle, severity,
reproduction, owning session, and for anything deferred an explicit reason. It
is a survey, not a refactor.

1. Register; declare `--not-releasable`.
2. Inventory every contributed command, view, menu, welcome state and
   walkthrough from the manifest, and every operator-facing string.
3. Evaluate four journeys — open an existing project, create a project, watch a
   session run, navigate to a related repository — in empty, loading, success
   and error states, against each of the eight principles.
4. Fix only what needs no design decision. Two are already identified: **all
   eight status icons declare `width="16mm" height="16mm"` against a 16-unit
   viewBox** — roughly 60px of intrinsic size in a 16px row, which is the
   probable cause of `csv-model` item 1, filed by a session that could not see
   the UI; and two file headers still name `python -m ai_router.workflow` as the
   projection's writer. Verify the icons under both themes with indent guides
   on.
5. Amend the plan for sessions 41, 42 and 47 with what the survey found. A
   session that cannot follow its plan amends the plan on the record.
6. Affected; verify; full suite as `final-full`; close.

**Known material going in, so the session is bounded rather than exploratory:**
`bootstrapProject.ts` ends setup with *"Open a terminal and run `dabbler
session start`"*; `sessionTerminalCommands.ts` pre-types start and close into a
terminal rather than running them; four `copyPromptCommands` write a prompt to
the clipboard for the operator to paste, which is the RACI's open item 1 made
concrete; `extension.ts` polls every 30 s.

**Creates:** the findings table the extension sessions implement against.
**Closes:** `csv-model` item 1. Est. 6 tests.

---

### Session 38 of 50: The projection stops withholding the plan

*Allocation: question 1.*

`progress.ts` reads `session-plan.md` only when the ledger is absent, so once
`sessions.json` exists the plan is never read again. `csv-model` closed session
2 of a nine-session plan and every indicator said `2 of 2 complete, nothing in
flight`. The ledger does grow to the plan at the next `session start`; nothing
surfaces that, and the reassurance lives in a source comment.

1. Register; declare `--not-releasable`.
2. Read the plan's headings on every projection **using the exact parser
   `session start` already uses**. A second heading interpretation would be the
   same rule stated twice.
3. A session the plan declares and the ledger has not reached projects as
   **`planned`** — never `not-started`, which already means "registered, not
   begun".
4. Never report a repository complete while the plan declares sessions the
   ledger has not reached.
5. **Reconciliation is specified, not assumed:** duplicate numbers, gaps,
   renamed headings, a plan shorter than the ledger, and malformed headings each
   have a defined projection. "Which session registers next" is derived under
   those cases rather than assuming a contiguous plan.
6. `session close` prints what comes next. The close is the moment the operator
   asks "what now?"
7. The Work Explorer renders `planned` rows greyed, from the projection alone.
8. Affected; verify; full suite as `final-full`; close.

**Closes:** `csv-model` item 9. Est. 12 tests.

---

### Session 39 of 50: Verification stops lying, and an unanswered gap stops the close

*Allocation: question 1 for the gate and the record; **question 3, verification-
reduction class, for what the record carries**. Moved ahead of the extension
work because both reviewers rated it the most serious defect in the draft.*

`checkTestRunFresh` returns `[true, ""]` when no declared suite is `expensive`.
`csv-model` closed session 1 at a clean 5/5 with nothing runnable, and would
close the session that writes its entire model the same way. Relabelling PASS
as SKIP fixes the label and not the defect.

1. Register; declare `--not-releasable`.
2. `checkTestRunFresh` reports **`SKIP (no suite declared)`** and never `PASS`.
   A gate that cannot see its own precondition must not report success.
3. An **owed-decision record** under the run ledger, machine-written: what is
   missing, which file it belongs in, what the framework determined on its own,
   options with consequences, a recommendation with confidence, and the default
   on no answer. Stable id, severity, and `open | answered | superseded`,
   surviving across sessions.
4. **An owed decision in the verification-reduction class refuses the close.**
   Work continues and no engine is held open; the session simply cannot record
   itself verified while the thing that would have verified it is undeclared.
   Every other class proceeds on the stated default with the wait recorded.
5. Three named consumers, so this is a mechanism and not a subsystem:
   `testing.suites` at the first session that writes code; the remote question
   at setup (session 41); and the ours/producer assertion (session 44).
6. The operator answers once and **the framework writes the file.**
7. **A `none-selected` evidence outcome**, recorded through `test-evidence
   record` — not written by `dabbler affected`, which is a query and must not
   mutate the ledger. The row binds to the selector's own invocation and
   surface digest, so it cannot be hand-authored.
8. The malformed-suite message names `dabbler.yaml`, not `router-config.yaml`.
   `--help` is accepted after a subcommand on every verb.
9. **Declare the extension as a suite in `dabbler.yaml` (D242, from session
   37).** `tools/` is covered by nothing today, so `dabbler affected` selects
   zero tests for an extension-only change and the session closes green having
   run nothing — `csv-model` item 3's defect on this repository. Session 37 hit
   it live. **This must land before session 41**, because 41, 42, 43 and 47 are
   all extension-heavy and would each run zero tests. Note the cost being
   accepted: a second expensive suite enters every later session's selection.
   If this session decides against declaring it, the decision must say what
   makes four sessions of untested extension work acceptable.
10. Affected; verify; full suite as `final-full`; close.

**Closes:** `csv-model` items 3, 6, 7, 8; D242. Est. 26 tests.

---

### Session 40 of 50: Task rows — a structured declaration, a framework-owned state machine

*Allocation: question 1 owns legality; question 2 owns the transition. **This
is the session both reviewers rewrote**, and the draft's mechanism is
withdrawn.*

Everything renders except the artifact. `approvedPlan.ts` has the schema, the
content hash, append-only amendments and derived risk flags;
`progress.buildTaskRows` folds it; the extension renders it onto the operator's
own icons. `writePlan` has no production caller, and `session declare
--task-file` stores prose.

**The draft proposed inferring the open step by diffing the tree against each
step's `file_envelope`. Both reviewers rejected it as Critical and they are
right:** envelopes overlap, work is done out of order, and a reversion moves the
pointer backwards. `compareToEnvelope` can say whether a change is *in scope*;
it cannot say which task is *done*. Principle (g) asks the framework to own
what is decidable by rule — it does not ask it to manufacture a deterministic
answer where none exists.

> **AMENDED in session 40, before the work, on the evidence of D240.** The
> steps below were designed against the belief that a session's steps do not
> exist in machine-readable form. **They do.** `dabbler session start` already
> parses the numbered step list under a session's heading and writes one
> `plan-step` row per step into `activity-log.json` — `stepNumber`, a stable
> `stepKey`, the description, and a status from `pending | in-progress |
> complete | blocked` — and `dabbler session log` already moves them, refusing
> a step it does not know. Every session in this block has been ticking those
> rows while the tree rendered nothing.
>
> What `buildTaskRows` folds is a different artifact,
> `.dabbler/runs/s<N>/approved-plan.json`, which nothing in the lifecycle
> writes. **Two mechanisms, one purpose, and the tree reads the one nobody
> writes.** A task-file schema and a `session step` verb would be a second
> declaration grammar beside a working one, which is what "one implementation
> of any rule" exists to prevent. Steps 2, 3 and 5 are withdrawn; step 4's
> requirement is met by the verb that already exists.

1. Register; declare `--not-releasable`.
2. **`buildTaskRows` folds the seeded `plan-step` rows**: position from
   `stepNumber`, stable id from `stepKey`, intent from the description, state
   from the status. The steps are declared once, in the plan, and read once.
3. **The framework owns the bookends**, which are the two transitions nobody
   should have to remember: step 1 opens at `session declare`, and the last
   step closes when the run of record is recorded.
4. The middle transitions stay `dabbler session log`. It already exists, it
   already refuses a step it cannot resolve, and it already journals — which
   is the explicit, framework-validated transition both reviewers of this plan
   asked for, and it needs no second verb beside it.
5. **`approved-plan.json` keeps its own job and stops being the tree's
   source.** The envelope, the risk flags, the content hash and the amendment
   ledger are what verification scope reads; it is a public contract surface
   (`Router.approvedPlan`, `planReview`) and is not touched here.
6. Task rows render Not Started / In Progress / Done, and the session tooltip's
   `N/M tasks done` becomes true.
7. Affected; verify; full suite as `final-full`; close.

**Creates:** the Work Explorer's third level, first rendered. Est. 10 tests —
down from 18, because most of the original estimate was the grammar this
amendment withdrew.

---

### Session 41 of 50: Setup owns the runway

*Allocation: question 1 for every command; question 3 for the one decision.
Moved ahead of session 42 so bootstrap is not redesigned twice.*

Both ends of the lifecycle terminate in "now go run git yourself". `bootstrap`
prints *commit what this just wrote* about files it wrote itself, knowing why
session 1 is refused while they sit uncommitted. The close prints `git push
--set-upstream <remote> main` for a remote that does not exist.

1. Register; declare `--not-releasable`.
2. `Dabbler: Set Up New Project` creates the folder when VS Code has none, runs
   `git init`, and commits its own scaffold.
3. The remote question is asked once, at setup, through session 39's mechanism:
   **attach an existing remote URL, or stay local.** *Hosted remote creation is
   deferred* — authentication, host, organisation, name, visibility and
   collision handling are a provider contract this session does not have, and
   review flagged the draft's version as unbounded.
4. **"Stay local" is durable repository state, not a per-run default**, and
   `pushed_to_remote` reads it rather than printing a command that cannot work.
5. A `contributes.walkthroughs` entry and a `file/newFile` contribution: as
   close to *File > New > Dabbler Project* as the API allows. The native
   File > New submenu is not extensible, and recording that here stops a later
   session rediscovering it. *(Survey F6.)*
6. **Amended by session 37's survey** (`docs/extension-dx-survey.md`), which
   found three of its four Majors on this journey:
   - **F1** — setup ends with *"Open a terminal and run `dabbler session
     start`"* (`bootstrapProject.ts:60`). The framework wrote the files and
     knows the next verb.
   - **F2** — the first-run offer claims setup *"creates the workspace .venv,
     installs the ai-router into it"* (`extension.ts:63-65`). It has done
     neither since the cutover. **Treat this as a correctness fix, not copy:**
     it is the only string in the extension that describes work the product
     stopped doing, and it is the first sentence a new operator reads.
   - **F3** — Start and Close are pre-typed into a terminal rather than run
     (`sessionTerminalCommands.ts`). Start carries a decision and the keystroke
     is not it; Close carries no decision at all.
7. Affected; verify; full suite as `final-full`; close.

**Closes:** `csv-model` item 2, survey F1, F2, F3, F6. Est. 14 tests, of which
5 are the extension's.

---

### Session 42 of 50: The panes say what they are, and the Solution Explorer lights up

*Allocation: question 1. See the correction above — this session wires what
exists rather than building a writer.*

1. Register; declare `--not-releasable`.
2. The container becomes **`AI Orchestration`**; the views become **`Solution
   Explorer`** and **`Work Explorer`**. Today a container called AI Work
   Explorer holds a view of the same name.
3. `viewsWelcome` on the Solution Explorer: what it will show once there is
   something to show, and a button that scaffolds it.
4. `bootstrap` scaffolds a `solution.yaml` — one component, named for the
   repository — and writes the first projection, so the view has content from
   the first minute rather than after a verb nobody knew to run.
5. **Amended by session 37's survey** (`docs/extension-dx-survey.md`):
   - **F5** — neither view has a `viewsWelcome`, so a new project shows two
     blank panels and no explanation. This is `csv-model` item 4, and step 3
     above is its fix; the Work Explorer needs one too.
   - **F9** — a projection failure reaches the operator as `projection failed:
     <raw error>` (`utils/projection.ts:104-112`). It says what broke and never
     what to do about it.
6. Affected; verify; full suite as `final-full`; close.

**Closes:** `csv-model` item 4, operator point 4, survey F5, F9. Est. 8 tests,
of which 6 are the extension's.

---

### Session 43 of 50: Liveness, and one place the operator looks

*Allocation: question 1 — liveness is a process fact, and a process fact the
agent authors is not a fact. Progress **meaning** stays the working AI's, and
this session does not touch it.*

The operator supervises several projects at once and is away from any one of
them for hours at a time. Nothing today says whether a session is working,
stalled, or waiting on something — and after session 39 there are owed
decisions to see, after session 38 there are planned sessions to see, and after
session 40 there are tasks to see. Three new things to look at, in three
places, is not an improvement.

1. Register; declare `--not-releasable`.
2. **`lastActivityAt` is DERIVED, not stamped** — amended in session 43,
   before the code, for the reason the plan already holds itself to
   elsewhere. The framework timestamps every row it writes: the activity log
   stamps each entry and every verification round carries `recorded_at`. A
   new field stamped beside them would be a second statement of "when did
   this last move", and a second statement of one fact is the drift this
   repository refuses everywhere else. So the projection takes the latest of
   the timestamps that already exist and derives **`possibly stalled`** from
   it against a declared threshold. What the original text was protecting is
   unchanged and is the whole point: **the agent writes neither**, because an
   engine that reports its own liveness reports it right up until it cannot.
3. **The heartbeat proves the process is alive, not that the thinking is
   useful.** The row says which, and never implies the other.
4. One **attention view** in the Work Explorer, gathering what is already
   computed: what is in flight and how long since it moved; what it is waiting
   on; owed decisions with their defaults and states; and any session that
   stopped at the round cap. Nothing new is derived here — this is the fourth
   consumer of three existing projections, and if it needs a new field the
   field belongs to whichever session owns that fact.
5. **Amended by session 37's survey** (`docs/extension-dx-survey.md`). The
   survey was scoped to amend 41, 42 and 47; it assigned four findings here as
   well, and they are recorded rather than left unowned:
   - **F11** — a 30-second `setInterval` (`extension.ts:148`) is the only thing
     advancing state between file events, and nothing anywhere says whether a
     session is alive, moving or stalled. That is step 2's reason for existing.
   - **F12** — there are **zero** `withProgress` call sites in the extension.
     Verification rounds run for minutes and the UI is indistinguishable from
     hung. The heartbeat in step 2 is the record; this is the feedback.
   - **F13** — the extension contributes **no configuration properties at
     all**. The stall threshold in step 2 is the first setting that needs a
     home, so this session establishes one.
   - **F10** — `troubleshoot.ts` composes "a line for the operator to run by
     hand" instead of running it and showing the result. A copyable line is
     defensible in a diagnostic; running it is better, and this is the session
     that owns operator-facing liveness.
6. Affected; verify; full suite as `final-full`; close.

**Creates:** the answer to "what happened while I was away", in one place.
**Closes:** survey F10, F11, F12, F13. Est. 14 tests, of which 5 are the
extension's.

---

### Session 44 of 50: `solution-dependencies.json` — the edge, never the pin

*Allocation: question 1 for the checks; question 3 for the one assertion the
framework cannot derive.*

A `.csproj` saying it needs `Dabbler.Csv.Model >= 1.0.0` is authoritative. What
no build file can say is **which repository produces it** — the single missing
fact, and the reason the cross-repository record can live distributed rather
than in a superproject.

1. Register; declare `--not-releasable`.
2. A tracked, versioned-schema file at each repository root declaring what this
   repository **consumes** from its own solution: package id, kind, the
   producing repository, and how it resolves. **No versions** — the pin lives in
   the `.csproj` or POM and is never copied. **No `produces` block** — that is
   `dabbler.yaml`'s `packaging`, and restating it would fork it.
3. **Repository identity is settled here**: a stable id plus an optional remote
   URL and an optional relative checkout path, with defined behaviour when a
   sibling is absent, moved, offline, or cloned twice. A missing sibling is a
   reported state, never an error that stops work.
4. The "this package is ours" assertion is supplied once through session 39's
   mechanism and validated thereafter.
5. Direct dependencies are read from `.csproj` and `pom.xml` as XML — manifest
   reading, not building. **The parser fails loudly rather than guessing:** a
   version or id that resolves through an MSBuild property, `Directory.Build.
   props`, or Maven dependency management is reported as *cannot determine*,
   never as drift. A false drift report is worse than no report.
6. Four reconciliations, reported and never silently repaired:
   referenced-but-not-declared; declared-but-not-referenced; two repositories
   pinning different versions of one package; and an unsanctioned source
   reference crossing a repository boundary.
7. Affected; verify; full suite as `final-full`; close.

**Creates:** the cross-repository graph — one edge-set per repository, in git,
assembled by union, with no superproject and no shared mutable state.
Est. 22 tests.

---

### Session 45 of 50: Resolution modes, inside the declare-and-check line

*Allocation: question 1 for the reconciliations; **question 3 for accepting
evidence produced in source mode** — which is the correct location for the
carve-out, and not where the draft put it.*

The draft said the *swap* to source resolution is verification-reducing.
Review sharpened it: **the swap is ordinary; accepting final evidence produced
in source mode is what reduces verification.** That is the event to reserve, and
it is better prohibited than approved.

1. Register; declare `--not-releasable`.
2. Two further reconciliations, both of which cost `csv-model` time: the pinned
   version is behind what the producer published, and the named feed is not
   registered on this machine — its Phase 3 flagged that the one local source
   configured points at an unrelated project and is disabled.
3. **Read and reconcile feed configuration; write only a repository-scoped
   declaration, and only as the execution of an answered decision.** Never
   machine-global state, never a credential. Writing a repo-scoped
   `NuGet.config` is declaring; running an install is orchestrating.
4. `resolve: source` for .NET only: a reversible `PackageReference` ⇄
   `ProjectReference` swap with crash recovery and an exact restoration check.
   **Maven source-switching is not in this plan** — its mechanism is
   install-to-local-repository, which is a build.
5. **`final-full`, `packaging` and `session close` refuse while any dependency
   resolves from source.** A green build against a sibling checkout says nothing
   about the published package, so the record never gets to claim it did.
6. Affected; verify; full suite as `final-full`; close.

**Creates:** the reason this framework does not need git submodules. What was
wanted was the ability to step into a dependency's source while debugging; a
sibling checkout and a reversible switch deliver it without changing what git
tracks — and without the two defects a submodule walks into: `surfaceDigest`
cannot read a gitlink, so nothing inside a submodule moves the freshness digest,
and the pushed gate does not recurse.
Est. 18 tests.

---

### Session 46 of 50: Packaging declared for the ecosystem it is

*Allocation: question 1 for the detection; question 3 for the feed, which is
external-consequence. Serves the operator's point 7 directly, and it is the one
DX principle from 2026-08-30 that no other session in this block reaches.*

`bootstrap/detect.ts` reads a repository and derives its test-suite
declaration. It derives nothing about packaging, so the `packaging` block is
hand-authored in every repository that publishes — and `csv-model`'s Phase 3
has to invent pack and push argv, register a local feed, and get all of it
right before it can publish once.

1. Register; declare `--not-releasable`.
2. `detect.ts` gains packaging detection beside suite detection, with the same
   two silences: a `.csproj` carrying package metadata implies `dotnet pack`
   and `dotnet nuget push`; a POM implies `mvn -q package` and `deploy`; a
   repository whose build files sit below the root declares nothing rather
   than emitting a line that would fail on first use.

   > **Amended in session 46, on the record.** The Maven half is withdrawn:
   > **a POM declares nothing**, with a reason. Maven does not fit either
   > half of the packaging contract this framework already has.
   > `project.build.directory` is set in the POM and is not reliably
   > overridable from the command line, so the `{output}` the schema requires
   > in `pack` has nowhere to go; and Maven authenticates through a
   > `<server>` entry in `settings.xml` keyed by a repository id, so the
   > credential this framework passes as one argv element is read as the name
   > of a server rather than as a password. Making it work would mean either
   > writing a credential into a file outside the repository or holding one,
   > and both are refused everywhere else in this framework.
   >
   > The alternative was a detected `deploy:deploy-file` line that fails the
   > first time it runs, which is exactly what this step's own rule forbids.
   > The .NET half is unchanged and is what `csv-model` needs.
3. Argv, never shell strings — the existing block's rule, and the reason a
   detected line can be trusted at spawn.
4. The feed and the credential's **name** are raised as owed decisions
   (session 39), asked once at setup, and **the framework writes the block**.
   The credential itself is never written anywhere: `packaging.push.secret`
   names it and resolves at spawn into one argv element.
5. `dabbler packaging --dry-run` explains in plain language what it would pack,
   where it would push, and which gates it is waiting on. A repository that
   declares no packaging says so as a declaration, not as a gap.
6. Affected; verify; full suite as `final-full`; close.

**Creates:** publishing that a repository does not have to be taught by hand.
Est. 16 tests.

---

### Session 47 of 50: The Solution Explorer goes cross-repo

*Allocation: question 1.*

1. Register; declare `--not-releasable`.
2. **External component rows are derived from `solution-dependencies.json`, and
   `solution.yaml` gains no vocabulary for them.** Review caught the draft
   proposing both: two tracked homes for one edge is the drift this codebase
   already refuses for `usedBy`.
3. The graph is assembled by union across the repositories the dependency files
   name. Each repository owns its own edges; `usedBy` stays derived.
4. Rows for an external component: the producing repository, the pinned
   version, and drift against the feed — the `⚠ you're pinned to 0.8.1` row the
   2026-08-23 direction sketched and nothing has rendered.
5. Navigation: **Open Repository**, **Open in New Window**, **Reveal in File
   Explorer**. The tree has no context menu at all today.
6. **Amended by session 37's survey** (`docs/extension-dx-survey.md`): the
   "navigate to a related repository" journey was found to **not exist at all**
   — the Solution Explorer contributes no `view/item/context` menu and no
   command opens or reveals a repository. Step 5 is therefore net-new surface
   rather than a change to existing behaviour, and it is the whole of that
   journey.
7. Affected; verify; full suite as `final-full`; close.

**Closes:** operator point 3. Est. 16 tests, of which 7 are the extension's.

---

### Session 48 of 50: The generated workspace

*Allocation: question 1.*

1. Register; declare `--not-releasable`.
2. A `.code-workspace` generated from the graph, so one window shows the whole
   solution. Multi-root is a VS Code default, not a limit.
3. **It is derived local state and is never tracked.** It carries
   machine-specific sibling paths, and a tracked copy would be wrong on the
   second machine that opened it.
4. Affected; verify; full suite as `final-full`; close.

Est. 10 tests.

---

### Session 49 of 50: The thing becomes installable

*Allocation: question 3, external-consequence class — the operator decides and
the framework executes. **This session exists because review found that every
other session is `--not-releasable`, so the block would have ended with the
product still uninstallable and its acceptance criterion unreachable.***

`csv-model` item 5: `npm i -g dabbler-ai-router` returns 404. Router 2.0.0 and
the extension are built and unpublished; the tag push is the operator's.

1. Register; declare **`--releasable`**.
2. Raise the publication decision as a brief: what ships, at what versions, to
   which registries, and what a wrong answer costs.
3. On the answer, **the framework executes** the tag and publication workflow.
   The operator is not asked to type a command.
4. Verify installation from the public registry in a clean environment, and
   record it as evidence.
5. Affected; verify; full suite as `final-full`; `dabbler packaging`; close.

**Closes:** `csv-model` item 5.

---

### Session 50 of 50: The field trial, and the exercise reported back

*Review's objection to the draft: a session cannot be both the last feature
session and the first field trial, because the trial will find defects and
there is nowhere to put them. It is separated here, and it is allowed to amend
the plan.*

1. Register; declare `--not-releasable`.
2. Walk `csv-model` and its two downstream repositories end to end, from a
   clean profile and a registry install.
3. Run the acceptance exercise below and record every observed failure.
4. **Amend the plan with bounded remediation sessions for what it finds.** A
   trial with no route to fix what it finds is a demonstration, not a trial.
5. Consolidate `csv-model`'s `docs/feedback/`: which items closed, which remain
   with a dated owner, which turned out to be right about something else.
6. Affected; verify; full suite as `final-full`; close.

---

### Session 51 of 65: What the field trial found, and nothing else

*Amended into the plan by session 50, which is the session that found them.
Bounded deliberately: a remediation session that grows is a second feature
session wearing a bug fix's name.*

The trial's full record is `docs/field-trial-50.md`. Two of its four findings
were fixed where they were found, because both were live defects in what the
operator reads: a corrected brief that never replaced the one on disk, and a
verb missing from its own help. These two remain.

1. Register; declare `--not-releasable`.
2. **F-50-3: an owed row does not show its state.** `dabbler owed list` prints
   the question, the options and the recommendation, and not whether the
   decision is open, answered or superseded. A reader cannot tell which rows
   are still waiting on them, which is what the list is for.
3. ~~**F-50-4: `dabbler status` carries no planned sessions.**~~ **Withdrawn
   in session 51, before any code was written.** It carries both, nested under
   `repository`; the trial's check printed the top-level keys and read their
   absence there as absence. The claim was verified before it was acted on,
   which is the whole reason a remediation session verifies before it fixes.
4. Affected; verify; full suite as `final-full`; close.

Est. 3 tests, one finding having been withdrawn. **Nothing else.** Anything the trial found that is not F-50-3 or
F-50-4 is a new session, not a widening of this one.

---

### Session 52 of 65: The startup experience, walked before it ships

*Inserted 2026-08-30, at the operator's request: "I want the startup
experience to have a good DX before release." Two defects found by reading the
first-run path end to end, both on the primary journey — `File > New > Dabbler
Project` in a window with no folder open. The publication trial that was
session 52 becomes 53; it is blocked either way, so nothing is delayed by
going in front of it.*

1. Register; declare `--not-releasable`.
2. **The window is replaced out from under the offer.** On the create-a-folder
   path, `runSetUpProjectFlow` offers "Start session 1", runs it, and only then
   calls `openFolder` — which discards the window and restarts the extension
   host. So session 1's engine pick appears in a window about to be thrown
   away, about a project the operator cannot see yet, and the start races the
   reload. The folder must open first, and the offer must be made in the
   window that survives.
3. **Setting up one project changes a machine-wide setting.** The extension
   calls `bootstrap` with no `--no-transport-detect`, so a new project
   persists `DABBLER_TRANSPORT` at user scope on any machine where the
   detector fires. A per-project action does not get to change how every other
   project on the machine routes.
4. Affected; verify; full suite as `final-full`; close.

Est. 6 tests. **Nothing else** — a startup review that grows is the DX
session that never ships.

---

### Session 53 of 65: The Work Explorer reads at a glance, and session 1 asks

*Inserted 2026-08-31, at the operator's request, from three pieces of feedback
given while looking at this repository's own Work Explorer and after restarting
a project. The publication trial that was session 53 becomes 54; it is blocked
either way, so nothing is delayed by going in front of it.*

1. Register; declare `--not-releasable`.
2. **Sessions render under status buckets again, superseding D104.** At 53
   sessions the flat list has become the long scroll D104 said it would; the
   operator ruled buckets back, refined: *In Progress* and *Not Started*
   ascending, *Complete* and *Cancelled* descending so the latest finished
   session sits under its header, an empty bucket not rendered at all, each
   header carrying its count in the description slot, *In Progress* expanded
   and the rest collapsed. A finished session's row carries a compact close
   date in the same slot.
3. **A closed session that stopped at the cap is a note, not a flag.** The
   attention rows over the sessions kept naming every closed
   `REMEDIATED_AT_CAP` session at the top of the tree, which invites reopening
   work that later sessions have already built on. Those notes move under an
   *Information* bucket, collapsed, with a count; the in-flight case stays
   where it is, because that one is a decision.
4. **Session 1 asks for the plan instead of guessing it.** The scaffolded
   session 1, `PLAN_PROMPT`, the bootstrap hand-off line and the extension
   walkthrough all say "Neither waits on anyone", and an engine took that
   literally: with no plan in the repository it searched sibling directories
   and drafted one. The templates now say the plan's substance is the
   operator's, and to ask for it when it is not in the repository or the prompt.
5. **This repository declares itself a one-component solution.**
   `solution.yaml` as `bootstrap` would scaffold it, so the Solution Explorer
   stops showing its welcome text here.
6. Affected; verify; full suite as `final-full`; close.

Est. 5 tests net. Extension to 2.2.0.

---

### Session 54 of 65: The router suite stops taxing the host

*Planned 2026-08-31. Running the router suite pins the host: `packages/router`
declares no vitest configuration, so the pool is one worker per logical core —
twenty here — and ten of the test files fork real `git` and `node`
processes. The run of record for session 53 packed 784 seconds of test time
into 86 seconds of wall clock. The pytest suite learned this once already
(`-n 2` locally, sequential in CI); the TypeScript suite has to learn it
too. It runs first, so the deck session's full suite does not pin the host.*

1. Register; declare `--not-releasable`.
2. **Cap the workers.** A `vitest.config.ts` in `packages/router` that sets
   the pool to a small fixed number of workers locally (measure 2 and 4
   against the 86-second baseline and record both) and one in CI, where the
   runner is smaller than this machine and a fork storm is a timeout. The
   suite command in `dabbler.yaml` does not change; the cap lives in the
   config the command already reads.
3. **Make `config.test.ts` hermetic against `DABBLER_TRANSPORT`.** With the
   variable set in the shell, three `resolveTransport` tests fail; the
   describe blocks restore the variable afterwards but never clear it first.
   Clear it in a `beforeEach` and restore it after, so the suite's result
   does not depend on which terminal it ran from.
4. Affected; verify; full suite as `final-full`; close.

Est. 1 test net. Nothing else.

---

### Session 55 of 65: The task rows move themselves

*Planned 2026-08-31, from the operator's screenshot of session 54: Register
"in progress" three minutes after `session start` had registered the
session, a step labelled "Make config" that no one planned, and rows that
moved only when the engine typed `dabbler session log`. The operator's
reading: confusing, and the thing that never worked before — an engine
asked to narrate its own progress narrates late, by hand, or not at all,
and the Explorer renders the narration as state. The fix is a deletion.
Every lifecycle verb already writes its record through the framework, so
the framework knows the moment each phase happened; the rows are derived
from those records and nothing else. Inserted ahead of the onboarding deck,
whose slide 3 should show rows that move by themselves.*

1. Register; declare `--not-releasable`.
2. **Six rows, derived.** `buildTaskRows` in `progress.ts` stops folding
   `plan-step` entries against logged statuses and reads the records the
   lifecycle writes: *Register* is done when the ledger carries
   `startedAt`; *Declare* when the activity log carries the session's
   `task-declaration`; *Work* when a passed `preverify-targeted` evidence
   row exists for the session (the affected tests recorded passing is the
   observable end of the work); *Verify* when the rounds ledger's terminal
   verdict is `VERIFIED` — a blocking round leaves it in flight with the
   round and the cap in its words, and a cap terminal renders it blocked
   on the cancelled glyph; *Run of record* when a passed `final-full` row
   lands after the verdict; *Close* when the session's status is
   `complete`. The open row is the first not done, and only while the
   session is in flight; a row's start is the previous row's end, which is
   what the extension's time slot already means. The row shape the
   extension reads (`stepId`, `intent`, `state`, `iconKey`, `isOpen`,
   `startedAt`) does not change, and `taskRowLabel` already turns
   `run-of-record` into *Run of record*, so the extension is not touched.
3. **Attribute evidence to the session.** `test-evidence record` stamps
   the session in flight on the row, as `test-evidence run` already does;
   rows written before this carry none and are attributed by the
   session's own window (`startedAt` to `completedAt`).
4. **Delete the narration.** `seedSessionPlan`, `planStepKey`, `logStep`,
   the plan-parser registration and `STEP_STATUSES` leave `writers.ts`;
   `advanceStepsAtDeclare`, `closeLastStep`, `log` and the plan-row
   resolvers leave `session.ts`; the `log` subcommand leaves the CLI, the
   in-process router and the contract; `session start` stops printing
   step keys to tick. `splitSlugMarker` stays: the plan review reads it.
   A `plan-step` or logged-step entry already in an activity log is
   ignored, not migrated — the record is append-only and the rows no
   longer read it.
5. **Docs say what is true.** `docs/quick-start.md` §3 and the
   activity-log section of `docs/schema-reference.md` describe the derived
   rows; `session log` appears in neither.
6. Extension **2.3.0**, built as a `.vsix` and installed here, so the
   operator's Explorer shows the rows moving in the next session.
7. Affected; verify; full suite as `final-full`; close.

Est. **−4 tests net**: the twelve tests of the fold and the bookends go,
and about eight take their place, one per row transition plus the two
refusals that stay.

---

## Why sessions 56–59 exist: the framework drives, the engine is a service

*Planned 2026-08-31, from the operator's long-haul direction and the spike that
proved it the same day (`D:\Projects\dabbler-driver-spike`, standalone). Less
capable engines wander off a lifecycle they are asked to follow in prose;
the fix is for the framework to own the control flow and call the engine
per step. The spike ran a five-step scripted session with Haiku on Claude
Code and Luna on the Copilot seat, in two variants, and all four trials
passed with no human nudge. The variant to build is **resume**: the driver
invokes the engine once per step (`claude -p … --continue`, `copilot -p …
--continue`), the engine's own session store carries one context for the
whole session, and the driver validates every report mechanically and
rejects with reasons. What the operator wanted to see before committing —
that the engine's live output survives the change of driver, and that an
engine mid-step can be interrupted — is settled: `--engine-output
stream|quiet` tees the engine's stream to the terminal and the transcript
identically, and an interrupt is the driver ending the child and re-invoking
it with `--continue` and the reason. Three rules carried from the spike:
every answer the framework acts on is JSON against a schema and is refused
mechanically when it does not validate; prose the engine writes is for
people and the framework never reads it; code and tests are compiled and
run, never interpreted. One more, from a bug: an engine CLI is spawned as an
`.exe` with no shell, or with every argument quoted for a `.cmd` shim —
the shell's unquoted join shattered the first Copilot prompt.*

The deck follows the set so that its slides show the driven lifecycle
— Start, watch, interrupt — rather than the typed one; the publication
trial stays last. Session 60 — the engine channel made readable — was
inserted after 59 on 2026-08-31 from watching the first driven sessions.
After 60 the shape changed again: sessions 61–62 move the engine back
into the person's own CLI (see the section before them), so the deck is
63 and the trial 64.

---

### Session 56 of 65: The driver's contract — the schemas and the report verb

1. Register; declare `--not-releasable`.
2. **Four schemas** under `packages/router/src/schema/`, validated with the
   same `ajv` path the round rows use: `driver-instruction` (seq, kind ∈
   step | rejection | interrupt | done, step id, ask, reasons, the report
   schema by reference, the report command), `driver-report` (seq, step,
   status ∈ done | blocked, filesChanged, testsRun, notes),
   `driver-work-plan` (the engine's answer to "plan this session": ordered
   steps, each with an id, the files it expects to touch, the check that
   proves it) and `driver-disposition` (the engine's answer to a
   verifier's findings: per finding, fix | reject with a reason). The
   spike's `REPORT_SCHEMA` is the seed; nothing here is prose.
3. **The driver's ledger.** `.dabbler/runs/s<N>/driver/` holds
   `instruction.json`, `report.json`, `plan.json`, `dispositions.json`
   and one transcript per invocation. Machine-owned like the rest of
   `.dabbler/runs/`: never hand-edited, never a place a verdict can be typed.
4. **`dabbler session report`** — the engine's one verb: `--seq --step
   --status --files --tests --notes`, shaping and validating the report the
   way the spike's `report.mjs` did. The engine never writes the ledger
   directly.
5. Affected; verify; full suite as `final-full`; close.

Est. 6 tests: one refusal per schema, one for the report verb, one for a
hand-written report the ledger reader refuses.

---

### Session 57 of 65: `dabbler session drive` — the framework runs the session

1. Register; declare `--not-releasable`.
2. **The loop**, as a router verb that owns the process from register to
   close: resolve the session (the same rule `session start` applies);
   register; ask the engine for a work plan against `driver-work-plan` and
   declare from it (the declaration precedes the edits, as today); for each
   step, write the instruction, invoke the engine, validate the report —
   seq, step, every listed file exists, the listed files match what the tree
   changed since the previous step, the step's own check passes — and either
   accept or issue a `rejection` with the reasons, three times at most;
   then `affected` and the pre-verify evidence record; then `verify`;
   blocking findings go back to the engine as a `rejection` carrying the
   findings, its `driver-disposition` is validated, fixes re-enter the
   loop and rejected findings become disputes; then the run of record;
   then the close. The task rows of session 55 move by themselves
   throughout, because every phase is a verb this loop calls.
3. **Engine-agnostic here.** The engine is reached through one interface
   (`invoke(instruction) → transcript`) that session 58 implements for
   real CLIs; this session ships it with the spike's fake engine, so the
   whole loop is tested without a model and without a seat.
4. **Bounded.** `driver.maxInvocations` in `dabbler.yaml` (default 24)
   stops the loop and closes nothing; a stopped loop is an attention row.
5. Affected; verify; full suite as `final-full`; close.

Est. 9 tests: one per transition (plan, step accepted, step rejected,
rejected thrice, findings dispositioned, fix re-entered, run of record,
close, budget stop).

---

### Session 58 of 65: The engine adapter — Claude Code, Copilot, Codex; stream; interrupt

1. Register; declare `--not-releasable`.
2. **Spawn without shattering.** `resolveProgram` prefers an `.exe` and
   spawns it with no shell; a `.cmd` shim gets the shell with every
   argument quoted; both branches tested with fake shims, as in the spike.
   The prompt passed with `-p` is one sentence; the instruction travels by
   file.
3. **Three argv shapes**, one per engine: Claude Code (`-p --model
   --dangerously-skip-permissions --continue`, `--output-format stream-json
   --verbose` when streaming and `text` when quiet), Copilot CLI (`-p
   --model --allow-all-tools --allow-all-paths --no-ask-user --continue`,
   `-s` when quiet; the model is the seat's own id, `--model` required as
   it is at `session start`), Codex (measured in the session, not assumed).
4. **`engineOutput: stream | quiet`** in `dabbler.yaml`, `--show-engine`
   on `drive`: `stream` renders the engine's live output — Claude's
   stream-json as thinking / tool / text / result lines, only the `init`
   system event shown; Copilot's own progress lines — and writes the
   transcript; `quiet` writes the transcript only. Identical bytes on the
   ledger either way.
5. **Interrupt, defined once.** `dabbler session interrupt --reason "<text>"`
   (and the extension's Stop / Send in 59): the driver ends the running
   invocation, records it on the ledger as interrupted with the reason,
   and re-invokes the engine with `--continue` and a `kind: interrupt`
   instruction carrying the reason — so the engine keeps everything up to
   its last completed step and reads what changed. This is the one path for
   every interrupter: a person at the keyboard, a gate that tripped, a
   verifier finding that arrived mid-step. Measured in this session and
   kept only if the CLI honours it: Claude Code's single-process variant
   (`-p --input-format stream-json`, instructions written to stdin, a
   control message to interrupt a turn without killing it). Copilot has no
   equivalent, so the design never depends on it.
6. **Seat cost per step.** Each resume invocation is one premium request;
   the driver reports the count as it goes and stops at
   `driver.maxInvocations`.
7. Affected; verify; full suite as `final-full`; close.

Est. 7 tests: exe and cmd spawn branches, the three argv shapes, the stream
renderer's system-event rule, the interrupt re-invocation.

---

### Session 59 of 65: Start is the launch, and the developer's guide

1. Register; declare `--not-releasable`.
2. **Start Session runs `session drive`.** The extension launches the driver
   in-process, streams the engine into an Output channel ("Dabbler:
   Engine") when `engineOutput` is `stream`, and shows the task rows
   moving. A **Stop** button and a **Send to engine** box call `session
   interrupt` with the person's text as the reason. The copy-prompt
   commands (Start the next session, Run Prompt, Send Back) retire: the
   framework now sends, so nobody pastes.
3. **`docs/driving-a-session.md`** — the developer's guide, written for
   the person who has never seen the framework and reads before the deck:
   what happens when you press Start, what you will see (and what `quiet`
   hides), how to interrupt and how to send an instruction between steps,
   what a rejection looks like and what the engine does with it, what each
   step costs on a seat, and what to do when the loop stops at its budget.
   Every command copy-pasteable; no decision ID without saying what it is.
4. **Walked, not described.** From a clean VS Code profile with the built
   `.vsix`: Start on this repository's next session with Haiku, watch it
   run a step, interrupt it with a sentence, watch it continue. Recorded
   as evidence; what it finds amends the plan.
5. Affected; verify; full suite as `final-full`; close.

Est. 4 tests in the extension suite (the launch, the channel, Stop, Send),
1 in the router (the retired commands are gone from the manifest).

---

### Session 60 of 65: The engine channel reads at a glance

*Planned 2026-08-31 after session 59, from the operator watching the first
driven sessions in "Dabbler: Engine": one block of default-coloured text,
the driver's lines and the engine's told apart only by the `│`. Three
surfaces were weighed. A LogOutputChannel gives level colours and a filter
but doubles the clock and has no palette. A language and TextMate grammar
on the existing channel colours every line class through the theme's own
scopes — light and dark for free, no background, no router change. A
Pseudoterminal gives full ANSI: a background band on the engine block
(#165044 in dark themes, #87decd in light), a typed Send. The operator
chose the grammar now, with the band deferred until a few drives have been
watched in it. For the prefix the operator weighed `📢` and `ⓓ` against a
word and took `dabbler`: typeable, greppable, one width in every font, a
colour the theme can dim — an emoji is a bitmap no scope can style, and an
enclosed letter is ambiguous-width and reads as ©. The rule that comes
out of it: the framework speaks in a word, the engine under a glyph.*

1. Register; declare `--not-releasable`.
2. **The prefix.** `drive [time] event k=v` becomes `dabbler [time] event
   k=v`. It is written in one place (`drive.ts`, the `log` method) and
   parsed back nowhere: `driveProcess.ts` forwards lines verbatim, and its
   tests print their own fixtures. The engine's `  │` indent still hangs
   off the line above. The bare shell is the reason for a word: with no
   colour at all, `dabbler [..]` against `│` says who spoke.
3. **The grammar.** "Dabbler: Engine" is created with a language id
   (`createOutputChannel(name, "dabbler-drive")`), and the extension
   contributes that language and a TextMate grammar under `syntaxes/`.
   Scopes are the standard ones every theme colours, so nothing is
   contributed under `colors` and both theme kinds come free. What the
   operator asked to see, by line class:
   - `dabbler [06:49:17]` — the comment scope, dimmed; the event name
     (`run-started`, `instruction-issued`, `engine-invoked`,
     `engine-returned`, `plan-accepted`, `phase`, `check-passed`,
     `report-accepted`) — the keyword scope; `key=` dimmed, the value in
     the plain foreground, so `1/12` reads and `invocation=` does not.
   - Refusals and stops (`report-refused`, `plan-refused`, `check-failed`,
     `run-stopped`, `interrupted`, `stderr:`, `error:`, a blocking
     verdict) — the invalid scope, the theme's error colour: a refusal in
     the middle of two hundred lines is seen, not found.
   - `│ thinking:` and the `│   ←` tool-result lines — dimmed like the
     prefix. `│ tool Read` / `tool command` / `edit …` — the tool name in
     the function scope, its argument in the string scope. `│ engine:` —
     the engine's own words to a person — left in the plain foreground,
     the brightest text in the block. `engine session started`, `result:`
     and `interrupt acknowledged` — keyword.
   The vocabulary is read from `drive.ts` and `engines.ts` when the grammar
   is written, not from this list; this list is the intent.
4. **No ANSI.** The router's output stays plain text on a pipe. If a later
   session colours a real terminal it does so only when
   `process.stdout.isTTY` and `NO_COLOR` is unset, so the line reader in
   `driveProcess.ts` never meets an escape. One classifier, one owner: the
   extension styles, the router does not.
5. **Not in this session:** the background band, a level filter, collapsing
   an engine block. Each is a Pseudoterminal's to give and is decided after
   the operator has watched drives under the grammar.
6. **`docs/driving-a-session.md`** re-cut: every example line carries the
   `dabbler` prefix; the line-kind list names what the renders print — `engine:` for
   the engine's words, which the guide currently calls `text` — and one
   paragraph says how the colours read. README and quick-start link the
   guide and show no lines; they do not change.

   > **Amended during the session, round 2.** This step first said the
   > examples "are copied from a walk, so a fresh walk supplies them",
   > and the walk did not supply all of them: it produced the streaming
   > block, the Stop block and the resume line, and it stopped at verify
   > before it could produce a rejection, a budget stop or a landing.
   > Those three blocks stay as the earlier two-step walk recorded them,
   > with the prefix swapped, and the guide now says which walk each came
   > from and why their clocks do not line up. The requirement that holds
   > is the one above it — every example is a line some walk really
   > printed, and none is invented.
7. **Walked**: Start on a scratch repository with Haiku — its own command,
   absolute paths, `--sessions-dir` on every verb (the D251 rule) — and the
   channel seen coloured under one dark and one light theme. What it finds
   amends the plan.
8. Affected; verify; full suite as `final-full`; close.

Est. 1 extension test (the channel is created with the language id; the
grammar is declarative and is not tested). No new router test: the drive
tests read the event, not the word. Extension 2.5.0, unpublished like the
rest.

---

## Why sessions 61–62 exist: the engine stays in the person's own CLI

*Planned 2026-08-31 after session 60, on the operator's adoption call. The
staff who will use this already trust the Copilot CLI and Claude Code as
they are, and an earlier extension was rejected for seeming to do too
much. A driven session that replaced their CLI with an Output channel — no
spinner, no chat, clipped lines, a stop nobody was told about — reads as
"a home-made CLI that is worse than Copilot's", and the operator judged
it would be rejected on sight. The spike's* await *variant lost to*
resume *on two counts, the idle failure mode (an engine that had to wait
correctly, background on one CLI and foreground on the other) and
headlessness. What is planned here is neither: a* pull. *There is no
driver process. One verb, `dabbler session next`, advances the state
machine on disk each time it is called and returns the next instruction;
nothing waits, nothing can be orphaned, and the engine is the person's
own interactive session — its spinner, its chat, its ask-user tool, its
Esc. The framework is what runs in the background, which is the
impression the staff should have.*

*Two facts from session 60's own run shaped the cut. First, `claude -p
--continue` resumes the most recent conversation in the directory:
after the resume from the `blocked` stop, the driver's invocations 4–8
ran on top of an unrelated interactive Claude Code session that happened
to be newer, and appended their turns to it (`engine-01..03.log` carry
session `7a3a4490…`, `engine-04..08.log` another). Under a pull there is
nothing to resume — the person's session is the session — and the
headless path, if it stays, resumes by id. Second, what the operator
liked in the terminal — colour, a ✓ per file, a spinner — was vitest and
mocha drawing on a real TTY through `test-evidence run`'s `stdio:
"inherit"`. An Output channel can never show that and a terminal always
will, which settles where the framework's work is shown.*

The deck (63) follows so that its slides show this shape — the person's
CLI in one terminal, Dabbler's in the other, the Explorer moving — and
the publication trial stays last.

---

### Session 61 of 65: `dabbler session next` — the loop as a verb the engine calls

1. Register; declare `--not-releasable`.
2. **The verb.** `dabbler session next` re-hosts the loop in `drive.ts`
   without rewriting it. Each call judges the outstanding report exactly
   as `runStep` does today — schema, seq, step, files against the
   baseline, the step's checks — and then advances one move: plan →
   declare → steps → affected tests → verify and dispositions → run of
   record → commit, push, close — and prints the next instruction on
   stdout as the same `driver-instruction` JSON the engine already answers
   with `session report`. `run.json` carries the phase between calls as it
   does now; a call after a stop resumes from the phase, and a refusal
   comes back as `kind: rejection` with the reasons, as it does now. The
   engine's whole instruction is one sentence: call `next` and do what it
   says until it says `done`.
3. **Long work is backgrounded, never awaited inside a call.** A verify
   round, the complete suite and the close outlast an engine's tool
   timeout (`verify_session` outlasted Bash's in v1; the spike's foreground
   poll died the same way). `next` starts such work detached, records its
   pid, its start and a log path on `run.json`, and returns `kind: wait`
   with `retry_after_seconds` and the log path; the following call reports
   progress or the result. A `wait` is a tool call, not a sleep, so the
   Claude Code classifier that killed the spike's poll does not apply and
   Copilot's foreground is fine.
4. **`session drive` becomes a thin loop over `next`** with a headless
   engine — the built adapter keeps its one real use, CI and unattended
   runs — or is retired for now under the "does too much" rule. Decided in
   the session and recorded either way. If it stays: the framework never
   resumes an engine by recency again. Claude Code's `session_id` is read
   from the first invocation's `init` event and passed as `--resume <id>`;
   Codex's thread id from `thread.started`, never `resume --last`; with a
   test that a newer session in the same directory is not picked up.
5. **`docs/driving-a-session.md`** re-cut for the pull: what to type in
   your own CLI, what each `next` returns, how to interrupt (your CLI's own
   Esc or Ctrl+C, then talk to it), what a `wait` means, what to do when
   `next` says the framework stopped and why. Every example line printed
   by a real walk, and the guide says which.
6. **Walked** on a scratch repository — own command, absolute paths,
   `--sessions-dir` on every verb — with the Copilot CLI interactive (the
   seat the staff use) and with Claude Code interactive: the person types
   one sentence, the engine calls `next` through to `done`, the person
   interrupts once mid-step from their own CLI. Recorded; what it finds
   amends the plan.
7. Affected; verify; full suite as `final-full`; close.

Est. 6 router tests (the phase advance per call, `wait` and its
background job, a call after a stop, the resume-by-id refusal of a newer
session, `drive` over `next`). No extension change.

---

### Session 62 of 65: The entry — one sentence in the CLI, and Dabbler's own terminal

1. Register; declare `--not-releasable`.
2. **The managed body says one thing.** `AGENTS.md`'s nine typed steps
   retire from the body `dabbler bootstrap` writes; what remains is how to
   run a session — call `dabbler session next` and do what it says until
   it says `done` — plus the hard rules that are still the engine's
   (keys in the environment, the record is the machine's). The engine
   tails stay. This repository's own `AGENTS.md` is re-bootstrapped from
   it, and the operator's superseded ground-rules block is kept as is.
3. **Start Session opens the person's CLI.** The Work Explorer's Start
   picks the engine as now, then opens a VS Code terminal at the
   repository root with that CLI launched interactively and the opening
   sentence supplied where the CLI's argv takes one, typed by the person
   otherwise. A separate *Start Unattended Session* command keeps
   launching headless `session drive` (D252's other half), and Stop and
   Send survive only for a drive the extension launched; for the
   interactive default they retire — interrupt is the CLI's own Esc and
   chat. Nothing is copied to a clipboard.
4. **The Dabbler terminal.** A Pseudoterminal the extension owns
   (`window.createTerminal({ pty })`, named *Dabbler*) shows the
   framework's background work: the `dabbler [time] event` lines, every
   background job's log as it runs — the test runners' own colours, ✓ and
   spinner passing through untouched — a working indicator while a job
   runs and a waiting one while the engine is between calls, and the band
   (#165044 dark / #87decd light) behind the framework's own lines if the
   operator still wants it once the runners' output is seen beside it.
   Theme kind from `window.activeColorTheme`, re-read on change. The
   "Dabbler: Engine" channel and its grammar stay for the engine stream
   under headless `drive`, which 61 kept (D252: push and pull are one
   loop with the seam at `converse`). The terminal carries **no engine
   chat, ever** — the operator's rule, 2026-08-31: under the pull the
   framework never sees the chat (the person reads it in their own CLI),
   and under headless `drive` the channel, not the terminal, is where the
   stream goes, with `engine_output: quiet` to silence it. Chat in the
   CLI, work in the Dabbler terminal; no configuration needed to keep
   them apart.
5. **A framework stop is loud.** When `run.json` gains a `stop`, or an
   owed decision is raised: an attention row above the buckets with a
   themed icon (`$(warning)` for a stop, `$(question)` for a decision,
   coloured through `ThemeColor`), its tooltip the whole brief — question,
   recommendation, each option with its consequence; a toast with the
   recommended option, *Other…* and *Later*; the activity-bar badge with
   the count. *Other…* and a click on the row open a QuickPick whose
   items carry each option's consequence as `detail` (context-menu items
   cannot carry tooltips), and choosing calls `dabbler owed answer`
   in-process. A driver stop is raised as an owed decision (*Run `next`
   again* / *Cancel the session*) so one kind of row serves every "waiting
   on you". The liveness row becomes the working/waiting indicator
   instead of "last written N ago" alone.
6. **Engine text is stripped of escapes before it is spoken.** Watching 61
   run showed colour bleeding in a real terminal: a green ✓ (or red text)
   at a line's end stayed on for the lines after. The engine's tool
   results carry the test runners' ANSI, and `clip` in `engines.ts`
   truncates at a character count — which can cut a colour's reset off
   while keeping its opener — and collapses whitespace while stripping no
   escapes. The renderers strip CSI/OSC sequences from engine-derived
   text (`clip` is the seam), with a test that a truncated coloured line
   leaves no escape behind. The Dabbler terminal's job-log passthrough
   (step 4) is untouched: there the runners' colours arrive whole, resets
   included, and stripping them would undo the point of the terminal.
7. **Walked** from the installed extension on a scratch repository with
   Copilot: Start, the sentence, the two terminals side by side, a stop
   seen as a toast and answered from the row. Recorded.
8. Affected; verify; full suite as `final-full`; close.

Est. 8 extension tests (the terminal opened with the CLI, the pty and
its indicator states, the row, the toast, the QuickPick answer, the badge),
3 router tests (a driver stop raises an owed decision; the bootstrap body
carries the one sentence; a clipped coloured line leaves no escape
behind). Extension 2.6.0, unpublished like the rest.

---

### Session 63 of 65: The escape route — when the framework stops, it asks

*Planned 2026-08-31 after session 62, from a day that produced three stops
with three different causes: 60 blocked on a stale binary, 62 deadlocked on
an unanswerable gate (the step-files must-include against the unchanged
rule — fixed mid-session on the operator's direct order), and a
rejected-thrice near-miss between. Every stop was detected — a `Stop` is a
detected impasse — but none was classified, and 62's had no route out at
all: `session interrupt` is refused against a stopped run, so nobody could
even coach the resume, and the engine that had written a perfect diagnosis
believed the amendment was someone else's to make. The operator's design,
recorded across the day: the attended path is the staff's own engine,
guided; the automatic ladder is for unattended runs; the second opinion is
one verb both can call; every rung terminates at the human; and the
framework never relaxes a gate on its own authority.*

1. Register; declare `--not-releasable`.
2. **Stops are classified.** `run.json` keeps a short stop history; a stop
   on the same step with the same reasons twice running is class
   `deadlock`, said in the stop itself. A stop reason that a judge rule
   produced cites the rule by name — a legible stop is the raw material of
   every path below.
3. **The attended path: the diagnosis protocol, one copy.** The guide's
   "When the framework stops" section grows the protocol the staff's
   engine follows when a person types help: read the framework's own
   account first (`dabbler status`, `run.json`'s stop, the instruction's
   `reasons`, the transcripts) — never the scrollback; verify the claim
   against the code before acting on it; on THIS repository the engine may
   fix framework source in the tree — the fix rides in the session's
   verified diff, the 60/62 precedent, and saying so matters because 62's
   engine did not know it could; on a CONSUMER repository the framework is
   an installed package — report `blocked` with the diagnosis and raise an
   owed item pointing at dabbler, the fix ships as a release; never touch
   `.dabbler/runs/`, `sessions.json`, a verdict or a gate; and "stop"
   costs nothing — stop calling `next`, the session resumes by design.
   The managed `AGENTS.md` body points at the section in three lines. No
   skill: a Claude-Code-only skill would be a second copy of the rule.
4. **`dabbler triage` — one verb, both modes.** It assembles the stop's
   artifacts (the instruction, the report, the reasons, the rules they
   cite, `run.json`, the transcript tail) and asks a provider that is NOT
   the working engine for a schema-validated classification —
   `engine-error | framework-defect | plan-defect` — with the minimal
   amendment and one recommendation. An attended engine calls it when it
   is stuck; unattended `drive` calls it on a deadlock-class stop.
5. **The ladder, with a floor.** Unattended: triage on a second provider —
   one attempt plus one schema retry — then the third provider, then the
   stop lands as an owed decision carrying the raw artifacts and no
   recommendation: "the framework stopped and its advisers could not
   classify it" is an honest brief. No rung may loop, and the ladder
   always terminates at the human. A gate-relaxing amendment is never
   applied by the framework: it arrives as an option on the owed decision
   and is recorded as a decision when a person chooses it.
6. **A Send reaches a stopped run.** `session interrupt` queues against a
   run whose stop is set — refused only when nothing was ever driven — and
   the resume drains it into the next instruction's `reasons` as
   `sent: <text>`. The push relaunch stops clearing the request file it
   has not read.
7. **`plan amend`.** A machine-written amendment of a step's files or
   checks, with the reason and the approver on the record — raised from a
   triage proposal or typed by the operator. 62's engine asked to "amend
   this step's files" and nothing in the framework could; the judge fix
   removed that one deadlock, not the missing affordance.
8. **The reader tolerates unknown fields** (operator-approved after 62's
   skew). The extension's readers of driver records accept unknown
   properties — the writer stays strict — so an installed extension
   survives a newer driver's fields instead of refusing every row for the
   length of a driver-changing session. Test: a `run.json` carrying an
   unknown field still yields task rows. "Execution record unreadable" is
   reserved for damage.
9. Affected; verify; full suite as `final-full`; close.

Est. 7 router tests (the deadlock class, the triage shape, the ladder's
fallback and its floor, a queued Send against a stopped run, `plan amend`
on the record, the relaunch keeping an unread request), 2 extension tests
(unknown-field tolerance; the attention row unchanged). Extension 2.7.0,
unpublished like the rest.

---

### Session 64 of 65: The operator onboarding deck

*Planned 2026-08-31 at the operator's request: a PowerPoint deck that onboards a
human operator to the framework. Runs after 63, so the slides show the driven
lifecycle as the staff will meet it: their own CLI in one terminal, Dabbler's
in the other, the Explorer moving — never the Output-channel shape of 59–60.
Slides as the operator laid
them out; the deck is a committed artifact, and it is built by a script so a
later session can rebuild it when a screen changes.*

1. Register; declare `--not-releasable`.
2. **The build.** `docs/onboarding/build-deck.mjs` generates
   `docs/onboarding/dabbler-onboarding.pptx` with `pptxgenjs` (a
   dev-dependency of the workspace root, nothing new under `packages/`).
   Screenshots live beside it under `docs/onboarding/media/` and are taken
   from the running extension, not drawn: slide 3 uses this repository's own
   Work Explorer (buckets, D245) and a Solution Explorer over a multi-repository
   solution.
3. **Slides 1–6.**
   - *1 — What is Dabbler AI Orchestration?* The VS Code extension, how to
     install it (Marketplace once 65 has published; the `.vsix` until then),
     the GitHub repository.
   - *2 — Why use Dabbler?* Automatic cross-provider verification with further
     rounds when a round finds something; one lifecycle for every session
     (register, declare, work, affected tests, verify, run of record, close);
     the cross-repository view of internal dependencies with drift shown;
     decisions the framework cannot make arriving as one question with a
     recommendation.
   - *3 — The AI Orchestration Explorer.* Screenshot of the Solution Explorer
     and the Work Explorer on the left; on the right, one bullet list per pane
     saying what each row means and what clicking it does.
   - *4 — Getting started with Copilot.* VS Code, Node.js 22+, the Copilot
     CLI and a seat, `DABBLER_TRANSPORT=copilot-cli`, `--model` at session
     start, what the seat costs.
   - *5 — Getting started with Claude Code or Codex.* VS Code, Node.js 22+,
     Claude Code or Codex, direct API accounts and the three
     `DABBLER_*_API_KEY` variables — set where, never in files.
   - *6 — Project setup.* Set Up New Project (or `dabbler bootstrap`), what
     it writes and commits, the two owed questions it may raise, then session
     1 — which asks you what the project is — and session 2.
   - *Between 6 and 7 — Driving a session* (the operator numbers it). Start
     on the Work Explorer picks the engine and opens your CLI; you type one
     sentence. A screenshot of the two terminals side by side — your CLI
     working as it always does, and the *Dabbler* terminal showing the
     framework's `dabbler [time] event` lines and the test runners' own
     output — with the Explorer's rows moving. Interrupting is your CLI's
     own Esc; a framework stop arrives as a toast and a row you answer
     from. The screenshots are taken after 62 lands, never from the
     Output-channel shape of 59–60, and every example line on a slide
     carries the `dabbler` prefix, as `docs/driving-a-session.md` does.
     The screenshots' several Starts in one window also exercise the
     terminal placement 62 repaired at the cap, which is this walk's
     second job: that repair closed unreviewed.
   - *When it stops.* The stop as the staff meet it: the toast with the
     recommended option, the attention row, the QuickPick brief with each
     option's consequence; the engine in the chat following the guide's
     diagnosis protocol; `dabbler triage` asked for a second opinion. The
     engine alone does not know when it is stuck — this slide is why the
     framework is in the room.
4. **Slides 7–x: a four-repository CSV solution**, as the operator specified:
   *csv-model* (First Name, Last Name, DOB); *csv-deserializer* (populates the
   model from a CSV string or stream); *csv-persistence* (Entity Framework
   Core to SQLite); *csv-pipeline* (a Quartz.NET-scheduled file-system reader
   that reads a file, invokes the deserializer, then the persistence
   library). One slide per repository — its contract, what it depends on,
   how its sessions were planned — plus one for the solution graph as the
   Solution Explorer draws it and one for the day-to-day loop across the
   four. **Open for the operator, decided before this session runs:**
   whether these slides show the solution as designed (mockups of the
   Explorer over the four declared repositories) or as built. Building four
   .NET repositories through the lifecycle is its own session or set, and a
   deck that shows real screens of it would follow that work, not precede it.
5. **Readable by a person who has never seen the framework**: every command
   on a slide is copy-pasteable, and no slide names a decision ID without
   saying what it is.
6. Affected; verify; full suite as `final-full`; close.

Est. 1 test (the build script produces a deck with the declared slide
count). No extension change.

---

### Session 65 of 65: The half of the trial that needs a published router

*Runs when the operator decides to publish, at whatever version is current
then — and not before. It is not blocked and nothing waits on it: the
extension bundles the router, so everything being tested runs from the
`.vsix`. What needs the public registry is this session's own check, which
asks `registry.npmjs.org` what it serves and cannot ask anything else. It
was 52, then 53, then 54, moving back a number each time a session was
inserted ahead of it; placing it last ends that.*

1. Register; declare `--not-releasable`.
2. **One version** (the operator's directive, 2026-08-31, after an install
   showed router 2.0.0 beside extension 2.7.0). The router stops carrying
   its own number and takes the extension's: one version, stamped from one
   source, read by `dabbler --version`, the ledger's `frameworkVersion`
   and both release tags. The release order — router before the extension
   — is unchanged; only the numbers merge. Done and verified before
   anything is tagged, so the first published pair reads as one thing.
3. `dabbler release --verify-install` against the public registry, recorded as
   evidence.
4. Acceptance criteria **1, 2 and 5** from a clean VS Code profile and a fresh
   clone: the Solution Explorer rendering the csv pipeline's repositories from
   their declarations with drift shown, the Work Explorer showing completed,
   current and planned sessions with the current session's tasks moving, and
   every `csv-model` feedback item carrying a linked test, a recorded release
   verification, or a dated deferred issue with an owner.
5. **Amend the plan again with what it finds.** The same rule as session 50:
   a trial with no route to fix what it finds is a demonstration.
6. Affected; verify; full suite as `final-full`; close.

**Precondition:** the operator has answered `publication` with `publish`,
CI has published the tagged versions, and `dabbler release
--verify-install` passes. Neither is this session's to arrange, and the
first is the operator's alone — publishing cannot be recalled, which is
the reason to do it once testing is finished rather than to unblock a row.

---

## Acceptance criterion for sessions 37–50

**Mechanical, and checked in session 50.** From a clean VS Code profile, with
the router installed from the public registry and a fresh clone of `csv-model`:

1. The Solution Explorer renders all three repositories of the csv pipeline
   from `solution-dependencies.json`, with every declared edge resolved and any
   drift shown.
2. The Work Explorer shows the repository's completed, current and planned
   sessions, and the current session's tasks moving through Not Started /
   In Progress / Done.
3. Every owed decision is visible with its default and its state, in the same
   place that shows what is in flight and how long since it moved.
4. No gate reports `PASS` for a precondition it cannot see, and a repository
   with no declared suite cannot close a code-changing session.
5. **All nine `csv-model` feedback items have a linked test, a recorded release
   verification, or a dated deferred issue with an owner.** Prose classification
   does not satisfy this.
6. **Nothing in the block asked the operator to run a command.** Every git
   operation, config write and publication was executed by the framework; where
   a decision was required it arrived as a brief and the framework executed the
   answer.
7. A repository that publishes had its `packaging` block written for it, and
   the credential appears nowhere but as a name.

The operator performs it in one sitting, answering from visible UI only, with
the expected answers written down beforehand.

## Test budget for sessions 37–50

Baseline at session 37 is **942 router tests and 123 extension tests**. This
block adds roughly **160 router tests and 30 extension tests**, one per
behavior.

The port's banned kinds still apply: no falsifier twins, no source-text
assertions, no migration-path tests, no tests of test infrastructure, and no
tests asserting exact markdown strings. Two additions: **no test asserts the
wording of a brief** — the five parts are structure and are asserted as
structure — and **no test asserts a projection's rendered layout**, which is the
extension's business and is covered there.
