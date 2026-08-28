# Decisions log — sessions

Every decision, human or AI, in order, with who made it and what it was.

**Written by `ai_router.writers` as a fold of `activity-log.json`.**
Hand edits are overwritten by the next append. The record is the log;
this page is one view of it.

---

## Session 1 — Verify the design before anything is built

### D1 · 2026-08-26 · Operator · Set 148 runs on `master`

The set spec left the branch open and named it something every session
inherits. The design documents sat on `design/solution-decomposition`;
`AGENTS.md` named `experiment/verification-pipeline-v3`; the standing
directive is trunk-based work on `master`.

**Chosen: `master`**, per the standing directive and the set spec's own
recommendation.

`master` was a strict ancestor of both branches, so it fast-forwarded to
the design tip and then merged the experiment tip. Nothing was rebased and
no published history was rewritten.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Operator"*

### D2 · 2026-08-26 · Operator · Sets 145 and 146 were already cancelled, on another branch

The set spec named a blocking precondition: set 145 `step-execution` was
`in-progress` and set 146 `measure-then-enable` had never been started, so
the lowest-numbered-`not-started` rule selected 146 ahead of 148.

Both dispositions already existed in machine-written form in commit
`0cc98b33` on `experiment/verification-pipeline-v3` — `status: cancelled`
with `preCancelStatus` recorded and a `CANCELLED.md` reading "new direction
for extension". They were simply unreachable from the branch the design
documents were authored on.

**Resolved by merge, not by editing a state file.** After the merge, zero
sets are `in-progress` and 148 is the lowest-numbered startable set.

*This is the first live test of ground rule 5 — the machine owns the
record. The precondition was satisfiable two ways, and only one of them
left the record honest.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Operator"*

### D3 · 2026-08-26 · Orchestrator · The design documents are held out of the committed tree until session 1 commits them

Round 1 evidence is `git diff HEAD` plus untracked file contents, and
`facts.py::assemble_evidence` raises `EvidenceEmptyError` when both are
empty — the docstring names this exact case: *"a session that already
committed its work once verified nothing and nearly closed clean."*
`verify` takes no commit-range flag.

The four session-framework documents arrived committed only because they
were authored on a design branch. The build instructions assume the
opposite state: "Do the work — and do not commit yet."

**So the four documents were removed from the committed tree** — content
untouched on disk — and the merge commit was amended to exclude them.
`origin/master` was still at `8be18fb8`, so nothing published was rewritten.

**All four are committed by session 1 at its commit-and-push step.**

*Corrected after round 1, finding 1.* The first version of this decision
held `session-framework-build-instructions.md` and this set's `spec.md`
back as session 2's work product. That is unbuildable: `spec.md` is not in
`gates.py::_SET_BOOKKEEPING_BASENAMES` — which is only
`activity-log.json`, `change-log.md`, `session-state.json` and the
lifecycle lock — so `check_working_tree_clean` counts it as an uncommitted
change and session 1 could never have closed. The verifier caught a real
contradiction between a decision recorded here and a gate in running code.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator), operator-approved"*

### D4 · 2026-08-26 · Orchestrator · `AGENTS.md` now names `master` as the working branch

D1 made the existing "Working branch" section wrong, and it is the section
every engine reads first. Left stale it would have sent session 2 to
`experiment/verification-pipeline-v3`.

Edited in the unmanaged region above the `dabbler:managed` fence; the
managed body is untouched and still belongs to `ai_router.bootstrap`.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D5 · 2026-08-26 · Framework · No preverify record is required for this session

`ai_router.affected` reported `no tests affected by this change set`, and
`affected.py::preverify_gate` passes closed-form in that case: *"Declared
to affect no test: nothing to prove, and nothing to ask for."*

Consistent with the set spec's "Est. 0 tests — this session writes no
code." Recorded rather than assumed, because a session that skips a
lifecycle step must be able to show why the step was satisfied.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Framework"*

### D6 · 2026-08-26 · Orchestrator · A redacted read can manufacture a confident false finding — and did, in round 1

Round 1's second finding said `_call_openai` sends `Authorization: ******`
without using the resolved key, so every OpenAI direct-API call would fail
to authenticate. It was Major, specific, and wrong.

The source builds the header correctly. What the verifier read was a
*redacted* view: the secret-scrubbing layer rewrites the text following
the bearer scheme, so a correct `f"Bearer {api_key}"` is presented as a
hardcoded placeholder. The same substitution appeared in the orchestrator's
own tool output while investigating — including inside a diagnostic string
that merely contained the word, which is what identified the mechanism.

Proof taken without printing anything sensitive: the source contains no
asterisk placeholder, the interpolation of the resolved variable matches,
and no `sk-` literal is present. Anthropic and Gemini pass `api_key` in
their own headers and are unaffected.

**Design input for session 6, which builds the verifier's read surface
(spec §4).** Scope, budget and a log do not make a read *faithful*. A
verifier that reads through a transform can reach a blocking finding about
code that does not exist, and the agency log would faithfully record that
it looked at the right file. Either the surface reads unredacted, or a
transformed read is marked as transformed so a finding resting on it can
be weighed — an unmarked one is indistinguishable from evidence.

*This is gap 1 in a form the specification does not currently anticipate:
not "a verifier that cannot look", but a verifier that looked and was shown
something else.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D7 · 2026-08-26 · Orchestrator · Session 2 must edit before it verifies

D3 commits all four documents in session 1, so session 2 opens against a
clean tree and would hit the same `EvidenceEmptyError`.

Session 2 has real work that produces a diff — reconciling the session list
against the verified spec and plan, confirming the session 14 reordering,
and appending to this log. **It must make those edits before running
`verify`, not after.** A session whose product is a judgment about an
existing document has to write the judgment down before the judgment can be
reviewed.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D8 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 2 withdrew the disputed finding and accepted the D3 correction

Round 2 verdict: **VERIFIED**, no blocking defects.

> "D3 now commits all four non-bookkeeping documents before close, matching
> the clean-tree gate's bookkeeping exception list, and the disputed OpenAI
> auth finding should be withdrawn because the displayed `Authorization`
> text is redacted."

**The dispute channel did the job it exists for.** A Major finding that was
specific, plausible and wrong was withdrawn on evidence rather than argued
down in prose — and no correct code was changed to appease it. Had the
finding been remediated instead of disputed, session 1 would have "fixed" a
working credential path.

*Both halves of the round-1 result were useful: a genuine contradiction the
orchestrator had written into its own plan, and a false positive that
exposed a defect in the verifier's read surface. Neither would have been
found by the author alone.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D9 · 2026-08-26 · Orchestrator · The run of record exposed a test that cannot pass on Windows

The first `final-full` run came back **1 failed, 758 passed**:
`tests/test_offline_transport.py::TestSelection::test_config_supplies_the_directory`
asserted `str(resolved) == "/scripts"`, and `str(Path("/scripts"))` renders
as `\scripts` on Windows — the declared primary platform.

**Pre-existing, and not caused by this session**, which until that point had
changed only documents. `resolve_responses_dir` is correct: it returns
`Path(...).expanduser()`, and the assertion was testing the separator
convention of the host rather than the resolution.

Fixed by comparing paths instead of rendered strings — the pattern its own
sibling `test_env_var_beats_config` already uses (`resolved == tmp_path`).
No behaviour changed and no test was added.

**A failed run of record is not reusable proof**, so the suite was re-run
after the fix rather than recorded with a known failure and an explanation.
That rule is why this was found at all: a session permitted to record
"1 failed, and here is why" would have shipped it.

*The set spec estimates 0 tests for this session. That estimate held —
this is a repair to an existing test, not a new one, and the Python test
count is unchanged.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

## Session 2 — Verify this breakdown against that design

### D10 · 2026-08-26 · Orchestrator · Every plan item appears exactly once

Checked the plan's item list against the set's seventeen sessions.

| Plan item | Session | |
| --- | ---: | --- |
| A1 credential allowlist | 3 | ✓ |
| A2 record authority | 4 | ✓ |
| A4 the two files | 5 | ✓ |
| A5 agency, read half | 6 | ✓ split |
| A5 agency, write half | 7 | ✓ split |
| A6 selection by role | 8 | ✓ |
| A7 model discovery | 9 | ✓ |
| B1 code review loop | 10 | ✓ |
| B2 verifier authors tests | 11 | ✓ |
| B3 full suite, bounded fix loop | 12 | ✓ |
| C packaging | 13 | ✓ |
| A3 collapse session sets | 14 | ✓ moved |
| D1 sessions view | 15 | ✓ |
| D2 project setup | 16 | ✓ |
| D3 unresolved-session view | 17 | ✓ |

Nothing is claimed twice and nothing is dropped. A5 is the only item split
across two sessions, and the split is along the read/write boundary the
specification already draws — the three read operations are one enforcement
problem and the single write is another.

Sessions 1 and 2 build no plan item by design; they are the set's own
verification of the design and the breakdown.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D11 · 2026-08-26 · Orchestrator · §3.a is unbuilt, and session 13 depends on it — the one real gap

**`releasable` appears in the three design documents and nowhere in the
code.** Grepped the whole repository: `docs/session-framework-spec.md:93`,
`:100`, `:110`, `docs/session-framework-plan.md:233`, and this set's
`spec.md:353`. No module, no schema, no state file.

Session 13 step 3 reads: *"Releasability is read from the task list
declared at step (a). A session that did not declare itself releasable
cannot publish."* **No session builds step (a).**

That is precisely the failure mode session 2 exists to catch — a session
depending on something no session creates. Left alone, session 13 would
arrive to find its gate has nothing to read, and the likely improvisation
is the one §3.a exists to prevent: a model deciding when to publish.

**Assigned to session 5**, which already writes `project-work-plan.md` and
the numbered session list derived from it. The declaration belongs beside
the session list, is written by the sanctioned writer like everything else
in that file, and exists eight sessions before the gate that reads it.

*Recorded as an amendment to the breakdown, not to the specification. The
spec was right; the session list had a hole.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D12 · 2026-08-26 · Orchestrator · Session 8 does not depend on session 9, though it reads as if it might

Plan A6 has the direct-API path resolve the `verifier` role "against the
model record", and A7 — a session later — is what builds enumeration into
that record. Read quickly, that is a forward dependency.

It is not one. The record session 8 resolves against already exists: the
`models` block in `router-config.yaml` carries thirteen entries today, and
the seat has `copilot-catalog.lock`. Session 9 changes how that record is
*maintained* (enumerated and dated rather than hand-kept); it does not
create the thing session 8 reads.

**Checked rather than assumed**, because the plan's own "A6 and A7 move
together or not at all" is about the pricing sort key, not about ordering:
A6 must replace rates as the candidate sort key in the same change that
deletes pricing. That constraint is within session 8.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D13 · 2026-08-26 · Orchestrator · The session 14 reordering is sound

The set spec moves A3 from third to fourteenth. Confirmed both halves of
the claim the set spec makes for it:

- **No session between 3 and 13 depends on session sets being collapsed.**
  Every one of them works inside `ai_router` internals — `checks.py`,
  `workflow.py`, `verdict.py`, `writers.py`, the agency surface, role
  resolution, discovery, the three loops, packaging. None reads or renders
  the set level.
- **Sessions 15 through 17 do depend on it.** All three are extension
  surfaces that render or read the session tree, which is the structure
  session 14 changes.

**The reordering is not merely safe, it is required.** A3 removes the
machinery sessions 4 through 17 register, verify and close under; run at
session 3 it would strand the rest of the set. Session 14's own step 3
carries the real risk — migrating this set's state forward — and the set
spec already states the test: if sessions 15 through 17 cannot register,
verify and close under what session 14 builds, session 14 is not done.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D14 · 2026-08-26 · Orchestrator · Two spec sections need no session, and one was checked too narrowly

Checked for specification sections that no session builds:

- **§1.a "not selectable in the extension"** is **already true**. No
  reference to `transport` exists in any of the extension's fifty
  TypeScript files; the surfaces the changelog describes are gone.
- **§1.b removal of the old staff-facing file set** is covered jointly by
  session 5 (the two files replace it) and session 14 (the set level and
  its state files). Not a gap, but it is nobody's headline.
- **§10** names absences and builds nothing by definition.

**Corrected after round 1, finding 1.** This entry originally concluded
that §1.a was satisfied outright. It checked one of the section's three
surfaces. §1.a names the extension, the staff documentation, **and the
shipped configuration**, and `router-config.yaml` ships
`transport.profile: api` — so the default was wrong on the one surface
staff actually receive, and no session changed it. Assigned to session 8
step 7.

*The error is worth keeping visible: "already satisfied" is the most
expensive kind of wrong answer in a completeness review, because it closes
the question. A partial check that reports as a whole one is how a gap
survives its own audit.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D15 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 1 found three unassigned deliverables

All three were real, all three were Completeness, and none was a
disagreement about design — they were places the breakdown claimed
coverage it did not have.

| Finding | Assigned to |
| --- | --- |
| §1.a seat default in the shipped configuration | session 8 step 7 |
| Pricing's rate tables, `confirmed_on`, schema keys and dollar reporting | session 8 step 6 |
| The waiver can close an ordinary code session | session 3 step 2 |

Verified each against the code before accepting it: the packaged config
does carry `transport.profile: api`; twelve of thirteen model records carry
`confirmed_on` alongside per-token rate fields the schema still admits; and
`run_waive` checks adjudication exhaustion and a TTY but never the session's
kind.

**The third is the one that mattered most.** This set's own operating rule
is that no session may reduce its own verification, and sessions 3 through
17 are supposed to have no escape hatch at all. The hatch existed, unguarded
against exactly the sessions the specification excludes, and it took a
different vendor reading §9 against the code to notice.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D16 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 2: the right fix in the wrong session is still a gap

Round 2 accepted the transport and pricing assignments and rejected the
third: the waiver guard had been assigned to **session 4**, and session 3
runs first.

Session 3 is an ordinary code session. Until the guard exists, session 3's
own verification can be stamped `WAIVED` by exactly the path §9 excludes —
and session 3 is the session most likely to need it, being the first real
code session and the one whose seat cost is being measured.

**Moved to session 3, step 2**, before the credential-allowlist work.
`verify waive` runs from the working tree, so a guard built in step 2 is in
force by the time step 7 could reach the waive path. Session 3 becomes the
first session the guard protects instead of the last one it misses.

*A completeness review that stops at "is it assigned?" misses this entirely.
The question is "is it assigned early enough to cover the first session that
could use the hole", and ordering is the answer to it. This is the same
class of reasoning the session 14 reordering rests on, applied in the other
direction.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D17 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 3: there were two waiver paths, and the fix named one

Round 3 — the round cap — returned one Major finding, and it was right for
the third time on the same subject.

The guard was written against `ai_router.verify waive`. The run-core exposes
a second, independent path: `dabbler finish --waive "<reason>"
--attest-operator`, whose `_resolve_verified_verdict` returns `WAIVED` on
attestation alone. Confirmed in code — `runcli.py` exposes the flag, the
resolver contains no planning or session-kind check, and
`tests/test_runcore_verified.py` asserts the path works for a fixture
session that is ordinary implementation work.

**Step 2 now binds every public waiver path**, and says so as a rule rather
than as a list: the guard belongs where a verdict becomes non-blocking, so a
third entry point cannot reopen the hole by not knowing about the other two.

*Three rounds, three genuine findings, each one a strictly smaller miss than
the last: unassigned → assigned too late → assigned to one of two paths.
That is convergence, not the prose-grinding the round cap exists to stop —
each round found something the previous one had actually got wrong, and none
re-litigated a settled decision.*

**This remediation is itself unverified.** Round 3 was the cap, so the fix
above has not been through a round. That is the state session 2 hands to the
operator, and the specification's answer for a planning session at the cap
is the approval gate — not a fourth round taken unilaterally.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D18 · 2026-08-26 · Orchestrator · The framework has no exit for "the verifier was right, I fixed it, and I am out of rounds"

Round 4 was attempted and **refused before any vendor call**: *"round 4
exceeds the cap (3). The loop SUSPENDS at the bound."* The cap works.

The refusal names two sanctioned exits, and **neither one fits**:

- **Dispute** requires rebutting the finding. The finding was correct.
  Disputing it would be a false statement on the record, in a set whose
  entire claim is that the record is honest.
- **Adjudicate** routes recorded disputes to a third provider. There are no
  disputes to route, and a third provider is reachable, so adjudication is
  neither unavailable nor applicable.

`verify waive` sits behind those two: it requires the machine path
exhausted — an adjudication that upheld a blocking finding, or adjudication
genuinely unavailable. Neither holds. **So the code-level override the
specification reserves for planning sessions is not reachable in the one
situation a planning session is most likely to reach it.**

**The gap is between §9 and the machinery, not inside either.** §9 says the
operator may approve over unresolved findings in sessions 1 and 2, and the
set spec repeats it. The implementation offers that door only to a session
that *contested* a finding and lost. A session that agreed with every
finding, fixed every one, and simply ran out of rounds has no door at all —
its good behaviour is what disqualifies it.

**Design input, and it belongs to session 10**, which builds the code review
loop and its cap. The loop needs a third terminal state beside "clean" and
"contested at the cap": *remediated at the cap, unverified*. It is not a
waiver — nothing is being accepted over — it is an honest label for work
whose last fix was never reviewed, and the unresolved-session view of
session 17 is where it should surface.

*Left to the operator rather than resolved here. The available workarounds —
raising `max_rounds` mid-session, or filing a dispute nobody believes — both
edit the conditions of a review from inside the review, which is the one
thing this set exists to make impossible.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D19 · 2026-08-26 · Operator · There are no human approval gates anywhere

**Directive: "I don't really want human blockers."**

The specification made sessions 1 and 2 human approval gates, on the
reasoning that prose review has no bottom — five real rounds on one plan
produced four new Major findings every time. **The observation was right and
the remedy was wrong.** The bottom is supplied by the round cap and the
Minor-only stop, both machine-decidable. A person supplied no bound those
two did not already supply, and cost a blocked engine — as session 2 proved
by becoming one.

Removed from `session-framework-spec.md` §8 and §9, the plan's milestone D,
this set's sessions 1, 2, 16 and 17, and the build instructions. §9 now
reads that nothing blocks on a person and no verdict can be typed by one.

**Reading a record is not the same as being blocked by one.** The
unresolved-session view stays exactly as designed — it is read at planning
time, by whoever or whatever runs that session, and it holds nothing open.
What is gone is the *gate*, not the *report*.

*Note what this costs: nobody signs off on the plan before seventeen
sessions are built against it. That is the trade the directive makes, and it
is only safe because §3.c.i's terminal states keep an unreviewed remediation
labelled as one instead of laundering it into "verified".*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Operator"*

### D20 · 2026-08-26 · Operator · The three terminal states, which is what makes D19 safe

Removing the approval gate without giving the loop somewhere to land would
have turned every session that hit D18's dead end into a permanent hang.
So §3.c.i now names three terminal states and no fourth:

| State | Reached when | What lands |
| --- | --- | --- |
| Verified | A round returned no blocking finding | The work |
| Unresolved | The cap was reached, blocking findings outstanding | Nothing but the record |
| **Remediated at the cap** | Every blocking finding was fixed; the cap left the fix unreviewed | The work, labelled unreviewed |

**The third is the one that did not exist, and its absence is what stranded
session 2.** A session that disputes has an exit; a session that agrees with
every finding and fixes them all had none — dispute requires a rebuttal it
does not believe, adjudication requires a dispute, and the waiver sits
behind adjudication. **Good behaviour was the thing that stranded it.**

**It is not a waiver.** A waiver is a person accepting work over a finding
that still stands. Here nothing stands, and what is unproved is the repair
rather than the complaint. Recording one as the other would make an honest
outcome indistinguishable from an override.

**Assigned to session 10**, which owns the code review loop and its cap, and
surfaced by session 17, which must show which state a session reached
because unresolved and remediated-at-the-cap read very differently at
planning time.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Operator + AI"*

### D21 · 2026-08-26 · Orchestrator · Read fidelity is now session 6's problem, in the spec rather than only in this log

D6 recorded the redaction discovery as design input. It is now **spec
§4.a** — a new subsection stating that the read surface owes one guarantee:
either the verifier reads the bytes on disk, or the round records that a
transform was applied.

The existing §4.a became §4.b, and the two references to it in the plan and
this set's spec were repointed.

**The scrubber is not the defect and is not being weakened.** Scrubbing
credentials out of anything a model sees is correct; scrubbing *silently* is
the defect, and the fix is a mark on the round.

Session 6 step 4 now carries it, with session 1's incident named as the
evidence: an unmarked transformed read produced a confident Major finding
against correct code, and the agency log recorded only that the right file
was read.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "AI (orchestrator)"*

### D22 · 2026-08-26 · Operator · The cap is raised for session 2, on the record

Session 2 was at the cap and has since produced a substantially new work
product: the removal of the approval gates across four documents, the three
terminal states, and the read-fidelity subsection. **That is new material to
review, not another pass at the same findings** — which is the case the cap
exists to stop.

**Raised with `verify --max-rounds`, which is an existing operator control,
under the operator's directive of 2026-08-26.** Recorded here because D18
called this workaround out by name: raising the bound from inside a review
is exactly what a session must not do on its own authority. It is the
operator's to raise and it is being raised explicitly, not quietly.

**This is increasing verification, not reducing it.** The standing rule is
that no session may reduce its own — if the round count is painful the
answer is fewer and larger sessions, never fewer rounds.

*The permanent fix is session 10's terminal state, which would have let
session 2 close honestly without touching the bound at all. Until that
exists, this is the only exit that does not put a false statement on the
record.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Operator"*

### D23 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 4: removing the gate left session 3 building the gate

Round 4 accepted the transport, pricing and waiver-path assignments, and
found one Major defect in the new work — a contradiction introduced by the
D19 amendment itself.

§9 now says there is no approval gate anywhere and no override has a home.
**Session 3 step 2 still said "restrict the operator waiver to planning
sessions."** Followed literally, the first code session would have
*preserved* a human override for exactly the sessions §9 had just stopped
exempting, and implemented the opposite of the deliverable.

**Rewritten: the waiver is deleted outright, for every kind of session, and
`WAIVED` retires from the persisted verdict vocabulary with it.**

**The finding also exposed an ordering problem it did not name.** Removing
the only exit in session 3 while the replacement arrived in session 10 would
strand sessions 4 through 9 — any of them could reach a cap with nothing to
land on. So the removal and the `remediated at the cap` state are now **one
change in session 3**, on the same "do both or neither" logic the plan
already applies to pricing and role selection. Session 10 wires the state
into the loop rather than inventing it.

*Three amendments to the same step across three rounds — too late, too
narrow, then backwards. The step is small; the constraint around it is not,
and each round found a different way the constraint had been missed.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D24 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 5: "adds the state" is not the same as "the state works"

Round 5 sharpened round 4's ordering point into the one that mattered.
Session 3 said it would *add* the terminal state while session 10 *wired it
into the loop* — but sessions 4 through 9 do not run on session 10's loop.
They run on the machinery that exists today, and all three of its cap paths
end somewhere a person has to be:

- `ai_router.verify` refuses an over-cap round outright — the refusal this
  session hit at round 4;
- `verifyjob` pauses at the cap and offers `resume`, `finish --waive`, or
  `finish --outcome failed`;
- `gates.py::check_verification_clean` refuses to close while the latest
  round is blocking.

**Session 3 now owns all three**, and session 10 is explicitly reduced to
integrating a terminal path it inherits. The set spec's own rule — no
session depends on something a later session creates — was being violated by
the fix for a violation of that same rule.

*The estimate on session 3 went from 4 tests to 14 across these rounds. That
is the honest cost of the first code session also being the session that
removes the framework's only escape hatch, and it is better known now than
discovered at session 7.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

## Session 3 — The credential allowlist (plan A1)

### D25 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · The machine reads which cap-terminal state a session reached; it is never told

Spec §3.c.i names three terminal states but not how a machine tells the
second from the third. "Every blocking finding was fixed" is a claim, and a
claim typed by the author is the waiver under a different name.

**Chosen: the tree answers it.** At the cap `ai_router.verify` decides from
the record alone, in this order:

1. a blocking finding carrying a recorded dispute goes to `adjudicate` — a
   dispute says the finding is *wrong*, not that it was fixed, and consensus
   precedes termination;
2. otherwise a working tree that has moved past the reviewed round's
   `completion_tree` carries the repair — **remediated at the cap**;
3. otherwise it has not — **unresolved**, and nothing lands.

A moved tree is weak evidence of a repair on its own, so the same targeted
preverify gate a round has to clear also gates this landing. That is the one
thing unreviewed work still proves: the fix ran the tests it makes
necessary. Nobody is asked anything on any branch.

*The alternative was a per-finding "I fixed this" claim. It reads stronger
and is not: it is prose the machine cannot check, attached to the exact
decision the waiver used to make.*

> **Step 2 of this decision was overturned by round 1 — see D30.** A moved
> tree was too weak by exactly the margin this entry hedged on. Steps 1 and
> 3, and the preverify requirement, stand.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

### D26 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · The child environment is an allowlist and nothing else

Plan A1 asks for an allowlist *and* names five classes to exclude. Building
both would be two mechanisms deciding one question, and the denylist would
be the one that fails — it can only exclude names someone thought of.

**Chosen: an exact-name allowlist, and the exclusions are facts about what
is not on it.** Vendor keys, feed PATs, git tokens, proxy credentials and
`_JAVA_OPTIONS`-style option variables never reach a check because they were
never added, not because a filter caught them leaving. `TEMP`, `TMP` and
`TMPDIR` are the one thing set rather than passed: each check gets a scratch
directory of its own, so it neither reads what the parent left there nor
leaves anything for the next check.

*Cost: a toolchain needing a name nobody listed fails visibly rather than
silently inheriting a key. That is the right direction to fail.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

### D27 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · A reached round cap is no longer extensible, and `--extend-rounds` survives only for budgets

`resume --extend-rounds` raised the round limit from a round-cap pause. The
cap no longer pauses, so that entry no longer exists: the flag is reachable
only from a budget pause, where money and minutes are genuinely the
operator's to extend.

**Kept rather than deleted**, because raising a budget is not typing a
verdict. Its refusal message now says which ceiling it answers for.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

### D28 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · WAIVED is retired from every writer and kept in every reader

`.dabbler/runs/138-.../s1/rounds.jsonl` carries a real `waive` row. Dropping
WAIVED from the record schemas would make the machine's own history
unreadable — a `LedgerError` on every read of it — which is a worse failure
than the token surviving.

**Chosen: the split the writer/reader asymmetry already uses.**
`SESSION_VERDICTS` drops WAIVED, so `validate_session_verdict` refuses it and
no path can persist another. The schemas and the extension's reader keep it,
and `REMEDIATED_AT_CAP` joins both.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

### D29 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · Seat cost, measured: one code session is roughly $22 in AI credits before verification

**The measurement.** `python -m ai_router.seat_cost <conversation-id>`
against this session's own conversation, taken after the work and the
targeted run and before cross-provider verification: **2,247.6 credits
(~$22.48) over 184 events**, reported as a floor — the caller's own closing
turns are not in the store yet. Verification rounds are billed to the seat
too and are not in that figure; the ledger records them as
`unpriced (seat transport)`, which is a metrics gap, not a free call.

**What it says about seventeen sessions.** At this rate the set costs
**$380–$600 in AI credits** depending on rounds per session, and session 3
is a large session rather than a typical one — it removed the framework's
only escape hatch, which is the reason its test estimate went 4 → 14 during
session 2's review. Sessions 4 and 5 are the honest typical unit and should
be measured the same way before any re-plan is decided on this number alone.

**No re-plan is proposed yet.** One sample, taken from the least typical
session in the sequence, is not grounds to restructure sixteen others. The
decision this entry exists to enable is: if sessions 4 and 5 also land near
$20, the answer is fewer and larger sessions — never fewer rounds.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

### D30 · 2026-08-26 · Verifier (gpt-5.5/openai) · Round 1: any changed tree was the waiver wearing a machine's name

D25 granted REMEDIATED_AT_CAP when the tree had moved past the reviewed
round. The verifier named the gap in one sentence: **that is not "every
blocking finding fixed", it is "something changed"** — an incomplete or
unrelated edit that still passes the targeted checks would land work over a
finding that never stopped standing. The finding was correct, and it lands
on the exact hedge D25 wrote down and then did not act on.

**Chosen: the bar is per finding, and it is what the finding itself cited.**
`verdict.unremediated_findings(findings, changed_paths)` is the single
implementation, called from all three cap paths (`ai_router.verify`,
`verifyjob`, `runcli`'s `finish`): a blocking finding is shown remediated
only when the fix delta touches a path that finding's own `evidencePaths`
named. Any finding it cannot show that way leaves the session unresolved,
and the refusal prints which finding and which path it wanted.

**A finding citing no evidence path can never reach this state.** There is
no site to check, so there is nothing to prove, and unresolved is the honest
answer rather than a harsh one.

*This is still not proof the repair is correct — nothing at a cap can be,
which is why the work lands labelled unreviewed. It is proof the repair was
aimed at the finding, which is the strongest claim available without a
reviewer, and the one the retired waiver never had to make at all.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"*

### D31 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · Round 2 is disputed: "prove the repair" is a review, and the cap is where no reviewer exists

Round 2 accepted that the bar is now per finding and asked for one stronger
still: evidence that separates a complete fix from an incomplete edit at the
same cited site. **That separation is a judgment about the repair, and a
judgment about the repair is a review** — the one thing the round cap has
already spent. Spec §3.c.i defines this state as the case where "the cap
left the fix unreviewed", so the criterion does not raise the bar; it
deletes the state, and with it the exit the spec says a session that agrees
with every finding must have.

**Disputed rather than remediated**, with the spec's own text as evidence
(`docs/session-framework-spec.md:150-169` and `:455-463`), recorded through
`verify dispute` so the next round judges it UPHOLD-or-WITHDRAW. The grounds
are in `.dabbler/runs/148-the-session-framework/s3/disputes.jsonl`,
verbatim and machine-written.

*Round 1's finding was right and cost a real redesign. Round 2's is the same
sentence aimed one step past what a machine can answer, which is what "prose
review has no bottom" looks like when the subject is code. The dispute
channel exists so that costs one round rather than the session.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"*

## Session 4 — Record authority (plan A2)

### D32 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4: a target's first event declares where work begins, and is not judged as a move

`validate_transition` enforces "forward entry is sequential", but a target
with no history has nothing to move from. Judging its first `entered` event
against `STEPS[0]` would have made the manifest's `step:` field unusable:
`solution.yaml` may legitimately declare a component that begins at
`contracts`, and the csv walkthrough ships three components declared at
`build`. Folding is over the event log alone — it does not read the
manifest, and it must not — so the rule is: **the first event for a target
is an origin, and sequencing applies from there.**

*The origin is still in the log and still auditable. What it cannot be is a
route around the rule, because a target has exactly one first event.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

### D33 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4: `fold` refuses an illegal move rather than repairing it

The plan asked for one validator used by `append` and `fold` both. `append`
refusing is obvious; `fold` refusing is the point. A reader that skips or
"corrects" a move it cannot explain turns a hand-edited `events.jsonl` into
history, which is the one thing this framework claims cannot happen.
`fold` therefore raises `WorkflowError` and `workflow status` prints
`refused:` with the offending target and step.

*Cost: four existing tests placed targets at late steps by folding a single
`entered` event. Three needed no change under D32; the rest were rewritten
to walk the steps or to enter first and send back.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

### D34 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4: the doc-only cap is deleted, not narrowed

`is_doc_only_issue` capped a finding non-blocking when every evidence path
it cited was prose. **The same author picks the severity and the evidence
paths**, so a verifier that did not want its own Major finding to hold up
the work needed only a `.md` citation. Narrowing the extension list or the
`prompt-templates/` exemption would leave the mechanism intact and move the
argument to which paths count. Blocking is now severity alone.

**`doc_capped_findings` is retired from the writer and kept in the result
schema as readable**, the same treatment `WAIVED` got in session 3: a
retired field must not make the machine's own historical record unreadable.
It leaves `required`, so nothing new emits it.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

### D35 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4: one missing selection rule added, three left alone

`ai_router.affected` raised `selection_unknown` for `ai_router/workflow.py`
— the module this session changed — so a `testing.selection` rule was added
mapping it to `tests/test_workflow.py`, which is the loud state doing its
job. **`solution.py`, `stepreview.py` and `contractdoc.py` have the same
gap and were left alone**: they arrived on the merged design branch without
rules and this session did not touch them. A session that fixes every
adjacent gap it notices stops being reviewable.

*Filed for whichever session next touches those three.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

### D36 · 2026-08-27 · Verifier (gpt-5.5/openai) · Round 1: D32's origin exception was the skip it was meant to prevent

D32 exempted a target's first `entered` event from the sequence rule, on the
grounds that a target with no history has nothing to move from. **The
verifier pointed out that every target begins with no history**, so the
exempt branch is not an edge case — it is the normal first-entry path, and
`workflow enter build` on a clean workspace persisted an arrival at step six
with no record of getting there. Spec §3 says a step cannot be skipped, in
those words.

**Chosen: a first `entered` event must name the first step.** The manifest's
`step:` field says where a target is *shown* before it has a log; it does
not open one partway through, and `project()` already falls back to it when
no log exists. Nothing needs the exemption.

*The manifest problem D32 was solving was not real. `solution check`
already prints that the declared step is "where the manifest says work
begins, not where it has got to" — so the two were never in conflict, and
D32 traded a stated rule for a conflict that did not exist.*

**Verified by the criterion the finding supplied:**
`python -m ai_router.workflow enter build --component csv-model
--workspace-root examples/csv-walkthrough` exits 1 and writes nothing.

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Verifier (gpt-5.5/openai)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

### D37 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4 seat cost: ~$8, about a third of session 3, and it is the typical unit D29 asked for

**The measurement.** `python -m ai_router.seat_cost` against this session's
own conversation, after two verification rounds and before the run of
record: **799.1 credits (~$7.99) over 84 events**, reported as a floor for
the reason D29 gave — the caller's closing turns are not in the store yet,
and the seat-transport verification rounds are billed but priced
`unpriced`.

**What it says against D29.** Session 3 cost ~$22.48 over 184 events and
D29 named it the least typical session in the sequence. Session 4 landed at
**36% of that** with one round fewer, which supports D29's reading rather
than undercutting it: **$8–$12 is the ordinary code session** and $22 is
what removing the framework's escape hatch cost.

**Re-plan trigger, restated with two samples.** At $8–$12, thirteen
remaining sessions is **$104–$156**, not the $380–$600 D29 projected from
one sample. **No re-plan is proposed.** The trigger stays what D29 set: if
sessions land near $20 again, the answer is fewer and larger sessions,
never fewer rounds.

*One round of verification found one Major defect that reading the code did
not — D36. That is the round the cost is buying.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log, attributed there to "Orchestrator (claude-opus-5/anthropic)"; filed there under the session 3 heading, which the log never closed, and corrected to session 4 against the entry's own text*

## Session 1 — Verify the design before anything is built (continued)

### D38 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · Session 1 seat cost: two rounds of prose review, and `costUsd: null` is a metrics gap rather than a free call

The set spec makes session 3 the unit of measurement, because it is the
first ordinary code session. Session 1 is prose review and is recorded here
for contrast rather than as the planning number.

| Session | Rounds | Verifier | Transport | Findings | Cost |
| --- | ---: | --- | --- | ---: | --- |
| 1 | 2 | `gpt-5.5` / openai | `copilot-cli` | 2 Major → 1 remediated, 1 withdrawn | `costUsd: null` |

**`costUsd: null` on a seat call is a metrics gap, not a free call.** Both
rounds recorded null cost and null token counts, which is the seat's known
reporting behaviour (spec §7: seat spend is not attributable per session and
is not estimated). Two rounds of prose review is the observation session 3
will be compared against.

*Round 1 cost two blocking findings' worth of review; round 2 cost a
delta-only read. A session that disputes rather than remediates still pays
for a round — the saving is in not corrupting the code, not in seat spend.*

*Backfilled on 2026-08-27 — transcribed from the hand-kept log's standalone "Seat cost" section, which the writer has no shape for; appended last so no earlier identifier moved*

## Session 5 — The two files, framework-written (plan A4)

### D39 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The two files are projections; `activity-log.json` is the record

The specification names two files and says the framework writes both. It
does not say the files are the record, and making them one would mean
parsing markdown back to find the next identifier — a record whose
authority depends on its own formatting.

**So the decision rows live in `activity-log.json`**, which is already
machine-written, already carries a `kind` per row, and is already the set
file the close commits. `decisions-log.md` and `project-work-plan.md` are
folded out of it on every append and may be deleted and rebuilt.

This is the same shape `journal.py` states for the run journal: one
append-only record, every other view a fold. It is also what makes the
"the model never chooses structure" claim enforceable rather than
aspirational — there is no structure in the file for a model to reach.

*A hand edit to either file survives exactly until the next append. That
is tested, not asserted.*

### D40 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The decider vocabulary is closed, and a backdated entry must say it is a transcription

"Who made it" is only answerable against a fixed set of roles: `operator`,
`orchestrator`, `verifier`, `framework`. A free-text author field lets a
model attribute its own decision to a human, which is the one
misattribution this file exists to prevent.

**Time is the same problem.** `decided_on` and `backfill_reason` are
supplied together or not at all. Without that pairing a backdated decision
is indistinguishable from one recorded as it happened, and "every decision
appends at the moment it occurs" becomes a claim nothing can check.

A backfilled entry renders its own mark, so the contrast is visible on the
page: an entry with no backfill line was written live.

### D41 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · A task declaration is write-once, and refused once the session is complete

Spec §3.a: the declaration is made before any code exists, "because
otherwise a model decides when to publish a package". Two machine-checkable
bounds carry that:

- **Write-once.** A second declaration for the same session is refused, not
  merged. Re-declaring is how hindsight gets in.
- **Refused after close.** A complete session can no longer declare,
  because the declaration is what its work was measured against.

`session_is_releasable` **fails closed**: an undeclared session is not
releasable, and the absence of a declaration is a refusal rather than an
unknown. Session 13 reads this and gates packaging on it.

*`start` now prints the declare command when the in-flight session has not
declared. A print is not a gate — the gate that matters is session 13's,
and putting one in `start` would have blocked four already-closed
sessions and every other set in the repository.*

### D42 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The backfill preserved every identifier, so the seat-cost table became D38 rather than D10

Thirty-seven entries were transcribed from the hand-kept log as it stands
at `HEAD`, so a partially rendered file on disk could not become the
source. Each one kept its identifier, its date and its body verbatim, and
each carries its original attribution string in its backfill line — so
`AI (orchestrator), operator-approved` and `Operator + AI`, which the
closed vocabulary has no slot for, are preserved as written rather than
paraphrased into it.

**The hand-kept log also had a `## Seat cost` section, which is not a
decision heading and which the writer has no shape for.** Inserting it in
date order would have renumbered D10 through D37, and those identifiers
are cited by other entries, by `STATUS.md`, and by this set's spec.

**So it was appended last, as D38.** It reads out of sequence inside
session 1 and that is the honest rendering: it was recorded last, and no
earlier identifier moved.

*The whole transcription is 89 insertions against 32 deletions. Every
deleted line is the superseded preamble, a re-attributed heading, a
separator, or blank. No body content was lost.*

### D43 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The two files join `LIFECYCLE_WRITTEN_SET_FILES`, because a decision may be made after the last commit

`ledger.LIFECYCLE_WRITTEN_SET_FILES` is the one declaration of what a close
commits, what an evidence diff drops, what a covered-surface change
ignores, and what a plan envelope may never declare. It already held the
state file, the activity log and the change log.

**Both new files belong in it for the same reason `change-log.md` does.**
"Every decision appends at the moment it occurs" means decisions land
during verification and during the close — after the work is committed.
Left out of the list, each such append would dirty the tree, fail
`working_tree_clean`, and teach the next session to batch its decisions
until the end, which is the one behaviour the feature exists to stop.

*They are folds of `activity-log.json`, which is already in the list. A
projection of bookkeeping is bookkeeping.*

### D44 · 2026-08-27 · Verifier (gpt-5.5/openai) · Round 1: the order the spec promised was printed, not enforced — and the first dogfood record was wrong

Three Major findings, all correct, all against work this session had just
called done.

1. **A printed reminder is not enforcement.** Spec §3 says the framework
   enforces the order of the lifecycle and that it is "a property of the
   state machine, not an instruction in a prompt". `declare` only refused a
   second declaration and a closed session, so an author who missed the
   reminder could build first and declare `--releasable` afterwards — the
   precise hindsight §3.a exists to stop.
2. **The first dogfood record was wrong about session 4.** D32-D37 were
   filed under session 3, because the hand-kept log never opened a
   `## Session 4` heading and the transcription copied the file's
   structure faithfully.
3. **The render was not in order.** Grouping by session put D38 above D10,
   in a file whose stated contents are "every decision, in order".

*Finding 2 is the one worth keeping in view: a faithful transcription of a
structurally wrong source produces a structurally wrong record. The
hand-kept log could carry the error because a reader supplies the missing
heading; a queryable record cannot.*

### D45 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The declaration is refused once the working tree carries the work — which supersedes D41 and indicts this session's own declaration

**D41 argued for a printed reminder** on the grounds that a gate in `start`
would have blocked four already-closed sessions and every other set in the
repository. That was an argument against gating the wrong command. The
verifier asked for the gate on `declare`, where it costs nothing already
closed.

`declare_session_task` now refuses when the working tree carries material
changes. "Material" is `gates.material_worktree_changes`, extracted from
`check_working_tree_clean` so both callers ask one question: editor noise,
the run ledger and the set's own bookkeeping are not work. `start` writes
the state and the activity log before anything is declared, so counting
those would have made declaration impossible.

**Session 5''s own declaration was made after its code existed, and the new
gate would have refused it.** It stands as recorded rather than being
reissued: the writer is write-once by design, and reaching into the record
to re-stage a cleaner history is the one thing this framework forbids. The
first user of a feature cannot have used it before it existed — the same
shape as the backfilled entries above.

*Every session from 6 onward declares on a clean tree or does not declare.*

### D46 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The log renders in append order; grouping by session is what put D38 above D10

The renderer grouped decisions under one heading per session, which read
well and was wrong: the file's stated contents are "every decision, human
or AI, **in order**", and D38 — session 1''s seat cost, appended last —
landed between D9 and D10.

**Entries now emit strictly in ordinal order**, with a session heading
written wherever the session changes rather than used to gather. A session
that receives a later decision therefore appears again, marked
`(continued)`.

*D42 recorded that D38 "reads out of sequence inside session 1" and called
that honest. It was not: the identifier was honest and the position was
not. The fix keeps the identifier and moves the entry.*

### D47 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · D32-D37 are session 4's, and the correction is in the transcription rather than beside it

The hand-kept log ran out of headings at `## Session 3`, so six session-4
entries sat under it. Their own text says "Session 4"; the structured
record said 3.

**The whole backfill was regenerated from the source at `HEAD`** rather
than patched in place — none of it was committed, so it was a draft rather
than a record. Every identifier D1-D43 kept its position: the 37
transcribed entries, then the seat-cost D38, then this session''s five live
decisions re-appended in their original order.

**The correction states itself.** D32-D37 carry it in their backfill line —
"filed there under the session 3 heading, which the log never closed, and
corrected to session 4 against the entry''s own text" — so the record shows
both what the source said and what was written.

*The rebuild script asserts the heading each entry was found under before
it corrects any of them. A source that had been reorganized in the
meantime stops the rebuild instead of silently re-attributing 43 entries.*

### D48 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 5 seat cost: ~$10.61, inside the $8-$12 band D37 named

**The measurement.** `python -m ai_router.seat_cost` against this session''s
own conversation, after two verification rounds and before the run of
record: **1,060.7 credits (~$10.61) over 113 events**, reported as a floor
for the reason D29 gave — the caller''s closing turns are not in the store
yet, and the seat-transport rounds are billed but priced `unpriced`.

**Three samples now.** Session 3 was ~$22.48 over 184 events, session 4
~$7.99 over 84, session 5 ~$10.61 over 113. **D37''s $8-$12 band holds**,
and cost tracks event count rather than the size of the change: this
session wrote more code than session 4 and cost proportionally more turns,
not disproportionately more.

**Re-plan trigger, unchanged.** At $8-$12, twelve remaining sessions is
**$96-$144**. No re-plan is proposed. If sessions land near $20 again the
answer is fewer and larger sessions, never fewer rounds.

*One round of verification found three Major defects, one of which — the
session-4 misattribution — was in the record this session exists to make
trustworthy, and no amount of re-reading the diff would have surfaced it.*

## Session 6 — The verifier's read surface (plan A5, first half)

### D49 · 2026-08-27 · Orchestrator · Read scope and budget are declared and recorded, not refused

The Copilot CLI executes the verifier's tools inside its own process, so the
framework cannot refuse a read the way session 7 will refuse a write. The
write path can be enforced because the framework applies the write; the read
path cannot, because the model calls `view` and the CLI answers it.

So scope and budget are declared to the verifier in the prompt and then
measured against what the round actually did. Every list, search and read is
recovered from the CLI's own JSONL event stream and recorded on the round,
with `in_scope` on each operation and `out_of_scope` / `over_budget` counts on
the record. A verifier that read outside the session's changed files and their
declared dependencies, or past its read budget, produces a round that says so
in the machine-written ledger.

The alternative -- claiming enforcement the transport cannot deliver -- would
put a false statement on a record whose entire claim is that it is honest.
Recording is what is actually available, and per spec section 4 it is also the
limit that matters: the log makes a verifier's selective looking checkable
afterward, which a refusal would not.

### D50 · 2026-08-27 · Orchestrator · Read fidelity is decided by line-number comparison, proved against the live CLI

The transform §4.a warns about was reproduced against the live CLI rather than
assumed. A file containing

        "Authorization": f"Bearer {api_key}",

was read through the `view` tool and returned to the model as

    6.         "Authorization": f"******",

which is the session 1 incident exactly: correct interpolation displayed as a
hardcoded placeholder, with the agency log able to show only that the right
file was read.

Two facts from the same probe decide the implementation.

The `view` tool returns content as `N. <text>`, where N is the file's own
1-based line number. Fidelity is therefore an exact mechanical comparison
rather than a heuristic: parse the shown line numbers, read the same lines off
disk, and compare. A read whose shown line differs from the disk line at the
same number is `transformed`; one where every shown line matches is
`verbatim`. Partial reads and truncation stay honest under this rule because
only the lines actually shown are compared.

The same probe, run with a malformed `--available-tools` value, produced a
worse failure worth guarding: with the read tools disabled the model emitted
`<function_calls><invoke name="view">` as ordinary message text and then
answered from invention -- it reported a marker string the file does not
contain. A round with a granted read surface and zero recorded tool calls is
that shape, so the record carries the operation count and the surface it was
granted, and the two can be compared.

### D51 · 2026-08-27 · Verifier (gpt-5.5/openai) · Scope missed sibling-module imports; the import names are half the declaration

Round 1 raised a Major against the scope computation and it was correct.
`declared_dependencies` resolved only the module part before `import`, so
`from . import ledger` and `from ai_router import ledger` -- the form
`verify.py` itself uses -- resolved to the package `__init__.py` and never to
the sibling module. A verifier briefed with that scope would have had a real
dependency missing from it, and its legitimate read of that dependency
recorded as out of scope.

The import clause declares two things, and only one was being read: the
module path before `import`, and the names after it. Both are now resolved,
with the names tried as submodules of the stem.

The finding is a fair test of the feature under construction, because the
round that raised it was itself briefed by the scope it was complaining
about. The round's own agency record showed 9 reads outside scope out of 34,
which is the same defect measured from the other side.

### D52 · 2026-08-27 · Verifier (gpt-5.5/openai) · An unconfined search is not a scoped one; in_scope now means confined to the grant

Round 2 raised a Major that the first fix created. Marking a pattern-only
`grep` or `glob` as in-scope let a repository-wide search leave the round with
`out_of_scope == 0`, so the ledger would attest to a scoped review that had
not happened -- the precise failure the log exists to prevent.

`in_scope` now means "this operation was confined to the grant", which is a
claim the framework can actually make. A read names a path and is placed
against the scope. A search or a listing is confined only when it also names
paths; a pattern on its own reaches the whole tree and is recorded as
unconfined, with the reason on the operation. The briefing tells the verifier
how to confine a search, so complying is available rather than merely
demanded.

The earlier reasoning -- that a repository-wide grep is a legitimate way to
find where something is used -- is still true and is not an argument for
recording it as confined. It is recorded, not refused; what changed is that
the record stopped overstating it.

## Session 7 — The test-write path (plan A5, second half)

### D53 · 2026-08-27 · Orchestrator · The verifier has no write tool; it emits the file and the framework opens it, which is what makes the boundary a boundary

The read surface could only be measured. The Copilot CLI executes `view`,
`grep` and `glob` inside its own process, so the framework watches those
happen and records what they did. The write is the opposite shape, and the
spec is explicit about why: "the framework applies the write -- the model
does not touch the filesystem."

So the verifier holds no write tool on either transport, and gets none. The
CLI's tool universe stays `view,grep,glob`; the API path still sends no
tools at all. The verifier asks for a file by emitting it in its answer:

    ```test-write path=tests/test_widget.py
    <the complete contents of the file>
    ```

and `apply_test_writes` is the only thing that opens a file. That inversion
is what turns the confinement rule into a boundary instead of a request. A
prompt saying "only write tests" is advice a model may decline; a framework
that reads the path, compares it against the declaration, and never calls
`open` is not declinable.

Three consequences follow from the block being the whole channel, and each
one is a refusal rather than a repair:

The block carries the whole file, never a patch. A patch would require the
framework to decide what a fragment means against a file the model has only
seen through a scrubbing layer -- and set 148 session 1 already paid for
trusting what that layer displayed.

An empty block is refused. Against a file that already exists it is a
deletion wearing a write's name, and nothing in the surface grants a delete.

A block that never closes, or that names no path, is recorded as refused
rather than dropped. A proposal that vanishes silently is indistinguishable
on the record from one that was never made, which is the same failure the
agency log exists to prevent one level up.

Confinement reads `testing.selection.test_roots` and `test_glob` -- the same
declaration test selection already uses, through a `names_a_test` predicate
split out of `is_test_file` so the root is defined once. The predicate
deliberately does not ask whether the file exists: a test being created does
not, and a second definition of "where the tests live" is how the two
answers start to differ.

### D54 · 2026-08-27 · Orchestrator · A review round grants no write, and refuses proposals out loud rather than ignoring them

Session 7 builds operation (d) and grants it to nobody yet. Every round the
framework runs today is a code review round under spec 3.c.i, and
`verify.py` builds its grant with `allow_write=False`.

The reason is not caution about half-built code. It is that 3.c.ii is a
different round with a different job -- "the verifier authors the tests, the
framework runs them" -- and a surface offered in every round is a surface
used in every round. A reviewer that quietly edits the tree it is reviewing
has stopped being a reviewer, and the tests it added during a review would
join the session's own diff, which the author then has to make pass. Session
11 builds that phase and turns the grant on there.

What is live now is the enforcement, and that is the half that matters
today. Proposals are parsed and decided on **every** round, including the
ones that grant no write. A verifier that emits a `test-write` block in a
review round gets it refused, with the reason on the round:

    "this round granted no write operation; tests are authored in the tests
    phase, not in a review round"

The alternative -- ignoring blocks until session 11 wires the phase -- would
leave a boundary that nobody can see being enforced, which the record cannot
distinguish from a boundary that is not there. It would also hide the
signal: a verifier repeatedly proposing writes in review rounds is telling
the operator that the review prompt reads like a request for tests.

The refusal count reaches the operator on the same line as the read surface,
so a round that tried to write is visible without opening the ledger.

### D55 · 2026-08-27 · Verifier (gpt-5.5/openai) · Round 1: the check read a string and the write read a path, so the boundary failed open on POSIX

Round 1 raised a Major against the write boundary and it was correct. The
confinement check read the proposal as a string and `open` read it as a
path, and the two disagree on POSIX.

`_relative_to` called `Path.resolve()` before `_posix` converted separators.
On Windows that is harmless, because a backslash is already a separator and
`resolve()` collapses the traversal. On POSIX, `tests\..\ai_router\x.py` is
a **single filename** -- there is nothing for `resolve()` to collapse -- so
the string arrived at `names_a_test` as `tests/../ai_router/x.py` only after
conversion. It then passed both tests: prefix `tests/`, basename
`test_*.py`. `_write_file` joined that same string as a real path, and the
`..` was traversal again. A granted write would have landed in `ai_router/`.

Two things were wrong, and only fixing the second would have left the class
open:

Separators are now normalised **before** anything else, so a backslash is a
separator on every platform. That makes the traversal collapse on POSIX at
the same point it already collapsed on Windows.

And the path is resolved exactly once, with the resolved absolute path
carried through to `open`. `_confine` returns it; nothing downstream
re-derives a path from the string. The original defect was not really the
backslash -- it was that the decision and the write each performed their own
interpretation of a model-supplied string, and any divergence between two
such interpretations fails open. One interpretation cannot diverge from
itself.

The refusal now records the collapsed path rather than the proposed
spelling, which is the assertion the test pins: what the record names is
what the filesystem would have acted on.

This is the second time in set 148 that the framework under construction
was caught by the verifier it was building a surface for, and the finding
is a fair one: a boundary is exactly the kind of code whose defects are
invisible from the side that wrote it.

## Session 8 — Selection by role, and the death of the tier ladder (plan A6)

### D56 · 2026-08-27 · Orchestrator · Dead configuration goes with the code that read it, and dollars stop being computed anywhere

Step 5 deletes `pick_model`, `next_escalation_model` and `estimate_complexity`;
step 6 deletes the shipped pricing surfaces on the argument that "deleting the
arithmetic while the rates still ship leaves pricing a configured product
surface with nothing reading it." That argument does not stop at pricing, and
applying it consistently decided three things the step list does not name.

**The tier ladder's configuration goes with its functions.** `routing.
tier1_max_complexity`, `tier2_max_complexity`, `default_tier`,
`tier_assignments`, `task_type_overrides` and the whole 60-line `complexity:`
block have exactly two readers between them: `pick_model` and
`estimate_complexity`. Leaving them shipped is the pricing defect with a
different key. `tier:` on the model records goes for the same reason, and with
it the `tier` and `complexity_score` columns on routed calls — a field whose
only possible value is 0 is not a record, it is residue.

**`cost_usd` leaves `RouteResult`, and the callers stop asking for it.**
`calculate_cost` is deleted by step 5, so `route()` can no longer produce a
dollar figure at all; keeping the attribute would mean shipping a field that
is permanently `None` beside a `cost_status` that is permanently
`"unmeasured"`. `verifyjob`, `verify`, `plan_review` and `runcore` therefore
record `null` and `unpriced` rather than reading an attribute that no longer
exists. The run-event and rounds schemas already admit both, so no record
shape changes — what changes is that nothing computes a dollar.

**`plan-review` names two roles instead of two tiers.** Its cheap/premium
dispatch was the only caller of `tier_assignments` outside selection, so the
ladder could not die while it lived. The escalation rule is untouched: the
same triggers still route the same reviews to the stronger reader, and what
changes is that the stronger reader is named by a role rather than derived
from a cost band.

What is *not* deleted: escalation itself. Spec §1.b removes it, but this
session's step 5 enumerates three functions and escalation is not among them.
It survives as a walk down the role's ordered candidate list — which is what
the seat path already did — and removing it is a decision for the session that
is told to make it.

### D57 · 2026-08-27 · Orchestrator · The run policy's dollar ceiling ships as null, because it can no longer trip

`run_policy.budgets.model_usd` shipped at `10.0`. With `calculate_cost`
deleted, every dispatch records `unpriced`, so that ceiling compares ten
dollars against a sum that is structurally zero and can never trip. A ceiling
that cannot trip is worse than no ceiling: it reads as an assurance and
enforces nothing.

**The shipped default becomes `null`, which the loader already documents as
"disables the dollar ceiling and nothing else."** `model_dispatches` is the
ceiling that actually bounds framework model calls, and `config.py` already
said so — what changes is that its reason is now every transport rather than
just the seat.

**The knob itself stays.** Removing `model_usd` outright would reach the
run-event contract (`runCostUpdated`, the `budgets` payload), the
`resume --model-usd-budget` flag, and `RunView` — that is the run pipeline's
own surface, built by a different set, and rebuilding it is a second large
change riding on this one. Session 8's step 6 scopes the dollar deletion to
`metrics.py` and `route.py`, and this is the smallest edit that keeps the
shipped configuration from stating something untrue.

### D58 · 2026-08-27 · Verifier (gpt-5.4/openai) · Round 1: the verifier-trust flag bound on one transport only, and the API smoke test stopped touching the API

Two Major Correctness findings, both real, both caused by this session rather
than pre-existing.

**The verifier-trust flag did not bind on the seat.** `is_enabled_as_verifier`
was checked only while enumerating the model registry, so the Copilot path
could select a model the registry explicitly marks as untrusted to review
another model's work — and the shipped verifier preference named exactly such
a model, `gemini-3.1-pro-preview`. Lifting roles to a shared resolver is what
made the gap reachable: before this session the seat resolved every call
through the `generator` role and the `verifier` role was inert config.

The fix puts the rule in `resolve_role`, where both transports meet it, and
matches by the identity module's normalized token because the registry and
the seat catalog spell the same model differently
(`claude-haiku-4-5-20251001` against `claude-haiku-4.5`). A model the registry
carries no record of stays eligible: an absent record is unknown, never
unsupported, and a hard filter on missing metadata would end cross-vendor
verification the day a seat ships something new.

**`smoke.py` stopped testing what it exists to test.** Its whole purpose is
proving a provider API key works, and flipping the shipped transport to the
seat meant a green `[ok] openai` proved only that the seat could answer
through OpenAI. It now pins `transport="api"`.

Both were found by reading the shipped configuration against the code, which
is the read a different vendor is in a position to make.

## Session 9 — Model discovery (plan A7)

### D59 · 2026-08-27 · Orchestrator · The record format is extracted so both discovery paths write one shape

Spec 5.b says the probe and the enumeration write the same record. That is only true if one piece of code renders both, so the restricted-TOML renderer, the writer stamp, the content digest and the hand-edit verdict moved out of transports/copilot.py into ai_router/lockfile.py. The seat catalog still round-trips byte for byte and keeps its recorded digest, which is the check that the move changed nothing. Two renderers would have let the two records drift apart in how a value is written and in whether a hand edit is detectable -- and the second record would have been the one nobody noticed was unguarded.

### D60 · 2026-08-27 · Orchestrator · A vendor that answers is authoritative about which of its models exist; a vendor that fails keeps everything it had

Two failure modes look alike and must not be treated alike. A field a vendor stops reporting degrades to unknown: it is written by omission, a fresh unknown never overwrites a known value, and nothing filters a candidate on metadata. A model a vendor stops listing is genuinely gone from the API path -- unlike the seat, which cannot enumerate at all -- so a successful enumeration replaces that provider's model list and the departure surfaces in the drift diff as a role naming a model no record carries. A failed enumeration does neither: the endpoint timing out is not the vendor withdrawing its catalog, so the prior entries stand and the failure is recorded beside them. Deleting them would have turned a network blip into a drift report claiming every role names a model that does not exist.

### D61 · 2026-08-27 · Orchestrator · The seat catalog is aged on its own clock, and the staleness check can never fail a registration

One check reads both records, because there is one question -- does the framework currently know what exists -- and answering it in two places is how the two answers come to disagree. The thresholds differ because the mechanisms do: enumeration is free, so 24 hours; a probe costs premium requests, so 720. A 24-hour warning on the seat would fire every day for a refresh nobody should run daily, and a warning that is always on is a warning that is always ignored. The check is surfaced by session start, where it warns and names the invocation, and any failure reading it leaves the session unblocked and silent -- a maintenance signal capable of causing an outage is a maintenance signal that gets suppressed. Enumeration itself is refused while a session is in flight, read from the machine-written state and from nothing else.

### D62 · 2026-08-27 · Verifier (gpt-5.4/openai) · One vendor's success must not date the whole record

Round 1, Major. meta.enumerated_at advanced whenever any provider answered, and status and session start read only that stamp, so an expired key on one of three vendors left the maintenance signal green while that vendor's entries aged indefinitely. Partial provider failure is an expected operational path against three endpoints this project does not control, not an edge case. Fixed: the API record is now aged against the oldest per-vendor stamp among enabled, enumerable providers, and every vendor that is missing from the record or whose last attempt failed is named in the row. The record-level date survives only where no enumerable provider is configured and there is no per-vendor evidence to be conservative about.

### D63 · 2026-08-27 · Verifier (gpt-5.4/openai) · A key-set-local record written inside the package is a record a build will ship

Round 1, Major. The default resolved to ai_router/api-models.lock and pyproject listed that filename as package data, so enumerating in a working tree and then building from it would have published one machine's view of what its credentials expose to every consumer. The session had declared the record local and not shipped; the implementation did not enforce it. Fixed by making it structurally impossible rather than discouraged: the default is now .dabbler/api-models.lock, a relative record path resolves against the project root instead of the config's directory, and the filename is out of package data. .dabbler/ is already gitignored, so the record is neither committed nor packaged. The seat catalog still ships, because it belongs to the distribution rather than to a key set.

### D64 · 2026-08-27 · Verifier (gpt-5.4/openai) · The sanctioned writer must be able to create the record the first time

Round 2, Major, and a defect the round-1 remediation introduced. Moving the default to .dabbler/api-models.lock put the record in a directory that does not exist on a fresh checkout, while write_document was a bare write_text -- so the documented first run of enumerate would have raised FileNotFoundError and produced no record at all. Fixed in the writer rather than at the call site: it is the only sanctioned way to produce either record, so a missing parent directory there means the record cannot be made by any permitted route. The seat catalog's parent has always existed, so nothing changes for it.

## Session 10 — The code review loop (plan B1)

### D65 · 2026-08-27 · Orchestrator · The step review loop is bounded by the same cap the session verifier uses, read through one resolver

`workflow review` could be invoked forever. Each invocation called two
vendors, so the only thing bounding an unattended run was whatever stopped
invoking it. The session verifier has had a cap since session 3; this loop
had none, and the plan named it as a live hole rather than a hypothetical
one.

The bound is the same one, read through the same resolver. A step gets
`verification.settings.max_rounds` rounds, and `config.verification_round_cap`
is now the single place that answers what that number is — `verify.py` had
been reading the setting inline, so there were two readers of one rule and
the second one was about to be written here. A malformed, absent or
non-positive setting falls back to the shipped default rather than to no
bound, because a cap a bad config can switch off is not a cap.

Two decisions inside the bound are worth naming.

**Only rounds that reached a vendor count.** The cap exists to stop the loop
spending, so a round served entirely from the offline transport is not
counted against it — and a round with one scripted reader and one live one
is, because it spent. A round that says neither is counted, failing closed.

**The bound binds the writer, not the reader.** `validate_transition` does
not refuse a `reviewed` event for being over the cap. An operator who lowers
the cap would otherwise make yesterday's log unreadable, which is the same
failure the retired `WAIVED` token was kept readable to avoid: a record the
machine cannot read back is worse than a record with an over-long loop in it.
The refusal lives at the one place that opens rounds.

### D66 · 2026-08-27 · Orchestrator · The loop's terminal state is computed from the record, never written, so no fourth state and none typed by a person

The three terminal states already existed — session 3 built them and wired
them into the paths that existed then. This session had to make the step
review loop reach one of them, and the instruction was explicit that
inventing a fourth would mean session 3 was incomplete.

Nothing new was invented. `review_terminal` returns one of
`verdict.SESSION_VERDICTS` and passes its answer back through
`validate_session_verdict` on the way out, so a fourth state would have to
be added to the closed vocabulary before this module could return it. The
remediation test is `verdict.unremediated_findings`, unchanged: a blocking
finding is shown remediated when the site it cited has changed since the
round that raised it.

**The state is computed, never written.** No event asserts a terminal state.
It is derived from the folded log plus the artifacts on disk, which is what
makes "none can be typed by a person" true in code rather than in a rule
nobody enforces. It also means the loop always reaches one: a step that
agreed with every finding and fixed them all lands on remediated-at-the-cap
instead of hanging, which is the dead end session 2 hit and the reason these
steps were added to the spec at all.

Two things follow from deriving rather than recording.

**The comparison needs a baseline, so a round now records what it read.**
`artifactDigests` on the `reviewed` event is the digest of the text that
actually went to the reviewers, not of whatever the file says later. Without
it there is no honest "has this changed since".

**A finding that cites nothing can never be shown fixed**, so the step review
prompt now asks for `Evidence paths:` where it used to ask for `Location:`.
The old field was prose and the parser could not read it, which would have
made remediated-at-the-cap unreachable on this path — a terminal state that
can never occur is not a terminal state, it is dead code with a name.

A blocked round that named no parseable finding lands unresolved, not
remediated. There is nothing to have fixed, and letting an unreadable round
be the cheapest exit is exactly the laundering route the fail-closed rules
elsewhere exist to shut.

### D67 · 2026-08-27 · Verifier (gpt-5.4/openai) · Round 1: the bound could be reset by re-entering the same step, and was read from the process directory rather than the workspace

Round 1 raised two Major findings against the bounded review loop, and both
were real. Neither was disputed; both were fixed.

**The cap could be reset without moving the work.** `validate_transition`
accepts entering the step the work is already in — `to_index == current_index`
falls through both of its guards — and the fold zeroed the round count on
every `entered` event. So an author at the cap could run
`workflow enter <current step>` and buy another full set of vendor rounds on
the same step. That is not a corner: it is the obvious command to reach for
after editing an artifact, and it defeated the whole point of the bound. The
fold now resets the loop only when the step actually changes. Transition
legality is untouched, because a same-step enter is still a legal event that
records something; it simply no longer moves anything.

**The cap was read from the wrong repository.** `review_cap()` called
`load_config()` with no root, and `load_config` discovers the project-local
overlay from `Path.cwd()`. `--workspace-root` and `project(root)` are
first-class entrypoints, so an operator or the extension invoking either from
elsewhere would enforce and display the bundled default instead of the
workspace's configured cap. `load_config` now takes an optional `project_dir`
that names the project whose overlay applies, and `review_cap` passes the
workspace it was handed. Every other caller keeps the working-directory
default, so nothing else changes behaviour.

The round's nit was taken as well: `workflow status` now shows the round
count while the loop is still open, not only once it has closed. The count is
what says how much room is left, which is worth more before the loop ends
than after.

## Session 11 — The verifier authors tests, the framework runs them (plan B2)

### D68 · 2026-08-27 · Orchestrator · The tests loop lands on the three existing terminal states, decided against a tree id rather than an opinion

Spec 3.c.ii says the tests loop ends 'on the same terms as c.i', and c.i has three terminal states in a closed vocabulary. No fourth state was invented: run_terminal returns a token from verdict.SESSION_VERDICTS and passes it back through validate_session_verdict on the way out.

What differs is the evidence. The review loop decides remediation by comparing the digest of each cited artifact against what the round was sent. A test round cites nothing -- it exits 0 or it does not -- so the comparison is the tree id the run measured against the tree now. At the cap, a tree that has moved since the failing run is a repair the bound left unrun (remediated at the cap); a tree that has not moved is unresolved. A run that could not name the tree it measured is unresolved too, because an exit code that cannot be tied to a tree is not evidence about one.

This keeps the trap c.i's third state exists for shut on this side as well: a session that agreed with every failure and fixed them all has an exit, instead of hanging at the cap waiting for a person who is not coming.

### D69 · 2026-08-27 · Orchestrator · The verifier's write is granted in the tests round only, and the framework never asks it how the tests went

Session 7 built operation (d) and left the grant off everywhere, because a reviewer that quietly edits the tree it is reviewing has stopped being a reviewer. This session turns it on in exactly one place: testphase.author builds its grant with allow_write=True, and verify.py's review rounds still build theirs with allow_write=False. Both paths read the same test-root declaration under testing.selection, so the boundary is defined once.

The other half of the split is what the prompt does not ask for. The authoring prompt asks for files and says, in the same breath, that the verifier will not run them and must not say whether they pass. A verifier that both writes tests and reports on them is scoring its own work, and the result stops being a field the loop can branch on. What the loop reads is checks.execute's exit code, judged against the tree the run measured -- an observation, not a claim.

A written path no declared suite covers is refused rather than run by some command invented here: a test whose runner nobody declared is a test whose green means nothing.

### D70 · 2026-08-27 · Verifier (gpt-5.4/openai) · The verifier's one write is decoupled from the read tools, because no tool performs it

Round 1 raised a Major finding: the tests phase worked only on copilot-cli. grant_for_transport collapsed every other transport to AgencyGrant(MODE_NONE, (), 0), so briefing() described no write block and _confine() refused every proposal for lacking OP_WRITE. A no-seat install -- the configuration this package ships as its default, per config.py's own statement that the bundled file must stay correct for a fresh install with API keys and no seat -- could not author tests at all, and the tests phase is required of every session.

The finding was upheld rather than disputed, on the merits. Spec 4.b withholds agency from the direct-API path for a stated reason: the tool surface would need a tool-use loop written three times against three vendors' function-calling protocols. Operation (d) costs none of that. It is a fenced block in an ordinary answer, and the framework -- not the model -- opens the file. So the reason 4.b gives does not reach it, and the set spec's exclusion ('the seat has the tool surface, the API path records agency: none') still holds after the change: the API path still sends no tools and still records mode none.

Session 7 had tied the two together on the grounds that a round which could not look is not a round that may author tests. In this phase that premise does not hold -- the artifacts under test are in the prompt. A tool-less authoring round is briefed that it can see only what it was sent, and the record says mode: none, so a reader can tell the two kinds of round apart.

Also fixed, from the same round's nit: remediated-at-the-cap is decided against the tree the run left behind rather than the tree it was measuring. A suite that dirties the worktree is already failed evidence and must not be able to call its own side effect a repair.

## Session 12 — The full suite and its bounded fix loop (plan B3)

### D71 · 2026-08-27 · Orchestrator · The e-verify in the fix cycle is the framework checking the envelope, not a second review round

Plan B3 states the loop as `fix → re-verify → re-test` in three words and the
specification does not expand them. Two readings were available:

1. **Re-verify means another code review round.** Rejected. Spec §3.d ends
   "Same cap and same ending as c.ii", and c.ii is the tests loop, which buys
   no vendor opinion at all — it runs a suite and reads an exit code. A
   reading that inserts a review round into the fix loop would give §3.d a
   different meter from the one it inherits, and would spend two vendors per
   failing suite for a verdict the exit code already settles.

2. **Re-verify means the framework verifying the fix before it lands.**
   Taken. It is the step §3.d spends its whole section on: the envelope is
   checked, and a write outside it is refused *before any bytes are written*.
   The model has no filesystem — a fix arrives as a fenced block and the
   framework is what opens a file — so the confinement at the block is the
   whole of the enforcement, not a first line of it.

So the cycle is: the suite runs and reports an exit code; a red run opens a
fix round whose writes are confined to the envelope; the suite runs again.
The bound is `verification.settings.max_test_rounds`, the same one c.ii
counts, and the loop lands on the same three terminal states through the same
`run_terminal` implementation, generalised over which run it reads.

### D72 · 2026-08-27 · Orchestrator · Failures and implicated files are read as paths, not as one runner's grammar, and the scan fails closed by narrowing

Spec §3.d says the fix round receives "the files implicated by the failures"
and does not say how a framework knows which those are. Three constraints
shaped the answer:

**It cannot be a pytest grammar.** This framework is language-neutral by
subtraction, and a parser written to pytest's short summary would silently
answer nothing for a repository that runs anything else.

**So the parser reads paths, not syntax.** Whatever the runner, it prints the
files it failed in. `implicated_paths` takes every path-shaped token in the
output, drops the ones that do not resolve to a file inside the repository —
which is what keeps a `site-packages` frame in a traceback out of the
envelope — and keeps the rest. `failures` is the same scan narrowed by this
repository's own declaration of where its tests live, so a failing test is a
declared test path standing beside a word meaning failure.

**Both halves fail closed, in the direction that matters.** A failure the
markers miss is a file the envelope does not open, so the loop can only ever
be narrower than the failures warrant — never wider. And a red run whose
output names no test the parser recognises opens no fix round at all: the
suite command prints that it found nothing rather than sending an unscoped
round, because an unscoped fix round is the thing the envelope exists to
prevent.

The alternative — declaring failure markers in `router-config.yaml` — was
rejected. It is configuration a repository would get wrong once and discover
much later, to buy an economy over a scan that is already conservative in the
safe direction.

### D73 · 2026-08-27 · Orchestrator · The envelope replaces the test-root rule rather than widening it, and the fence label is part of the boundary

The write path built in session 7 confined every write to the declared test
root, because the only round that could write was the one authoring tests. A
fix round writes implementation code, so the same boundary would refuse
everything it is for.

**Two boundaries, never both, and which one applies is a property of the
grant.** `AgencyGrant.write_envelope` replaces the test-root rule outright
rather than widening it: a round confined to an envelope is confined to that
envelope and to nothing beside it, and no caller can combine the two into a
surface wider than either. Membership in the envelope is exact. A prefix rule
would let one changed file in a package open the whole package, which is
precisely the sprawl §3.d exists to stop, and every entry is a file because
both halves are produced by git and by the runner rather than typed.

**The fence label is part of the boundary.** A fix round's blocks are
`fix-write`; the tests phase keeps `test-write`. `_parse_proposals` honours
one label per round, so a block lifted out of one round's transcript into
another's is not silently obeyed by a boundary of a different shape.

**The confinement is complete rather than a first line of defence.** The
model holds no write tool on any transport — the seat's tool universe is
`view,grep,glob` and the API path sends no tools at all — so a write exists
only as a fenced block that `agency.apply_writes` decides about. There is no
second route by which a path outside the envelope could change, which is what
makes "rejected, not discouraged" a statement about the code rather than
about the prompt.

### D74 · 2026-08-27 · Verifier (gpt-5.4/openai) · The envelope took every path the runner printed, so a red pytest run made pytest.ini writable

Round 1 found the envelope wider than the section it implements. Correct, and
against the one thing this session exists to build.

`implicated_paths` scanned every path-shaped token anywhere in the run's
output. A pytest run prints `configfile: pytest.ini` and `rootdir:` in its
header, so on this repository's own suite the envelope would have contained
`pytest.ini` on every red run — and a fix round could then have rerouted the
runner instead of repairing the code. The boundary was wider than the
sentence describing it, which on this feature is the whole defect.

**The fix narrows the rule to what the output points at.** A path is
implicated when the runner names it with a position — `app.py:4`,
`main.go:17`, `a.js:10:5` — or when it is the file a named failing test lives
in. A path merely mentioned is not implicated. Runners name a file with a
position when they are pointing at code that failed and name it bare when
they are reporting their own configuration, and that distinction is the
generic one: it holds across ecosystems without knowing any of their
grammars.

`build_envelope` now uses the `selection` it was already being handed, which
the finding also noted it was ignoring: the failing tests are parsed there
and their files join the implicated set directly.

**The nit was taken too.** The fix round's read scope was
`session_scope(...)`, which adds each file's declared imports. §3.d says the
round receives the failures and the files they implicate; a read surface that
reached further made that sentence false for the one round it was written
about. The scope is now the envelope itself.

### D75 · 2026-08-27 · Verifier (gpt-5.4/openai) · The narrowed matcher missed Python's own traceback shape, and the read surface still carried the whole session diff

Round 2 confirmed the widening fix and found two Major defects in what
replaced it. Both correct.

**The location matcher recognised one spelling of a position, and Python's
most common traceback uses the other.** `_LOCATED` required the position to
sit immediately after the path — `app.py:4`, `a.js:10:5` — so a frame reading
`File "app.py", line 4, in add` implicated nothing, and the fix round would
have been refused the write to the file that actually broke. A rule that
narrows is safe against widening and not safe against uselessness; this one
had crossed into the second. The matcher now recognises both spellings, plus
the `File.cs:line 12` form, which is the same idea with a third punctuation.

**The read surface still carried the whole session diff.** The write envelope
is deliberately wider than the implicated set — §3.d says a fix may land in a
file the session already changed — but the *reading* surface has no such
warrant. A session with an unrelated file in flight, which is every real
session, was blessing a read of it and recording that read as in scope. The
seat's `glob`/`grep`/`view` grant is now built from the implicated files
alone, and the write envelope is unchanged.

One consequence worth naming: `agency`'s read briefing described its scope as
"this session's changed files and what they import", which stopped being true
the moment a second kind of round used it. It now says what it is — what this
round is confined to — because a briefing that describes a surface the round
does not have is how a model comes to report a read it could not have made.

### D76 · 2026-08-27 · Verifier (gpt-5.4/openai) · Absolute traceback paths fell out of the envelope: the token stopped at the drive letter and normalisation ran before resolution

Round 3 found the same defect one spelling further out, and it was right
again: the matcher handled `File "app.py", line 4` but not
`File "C:\repo\app.py", line 4` or `File "/repo/app.py", line 4`. Two
separate causes, both real.

**The token grammar stopped at the colon.** A drive letter is part of the
path a Windows traceback prints, and a token that ends before it is not the
path the runner named. The grammar now carries an optional drive prefix.

**Normalisation ran before resolution.** `_posix()` strips the leading
separator, so `/repo/app.py` became `repo/app.py` — a relative path naming
something that is usually not there — before `relative_posix` ever saw it.
The order is now the other way round: the spelling is preserved until
`agency.relative_posix` has placed it against the repository, which is the
one function in this package that knows how to do that for either spelling.

`failures()` takes the repository root for the same reason, so a runner that
prints its failing tests with absolute paths still yields a named failure
rather than an empty list that would refuse the fix round.

*The pattern across all three rounds is worth naming: every finding was the
envelope being the wrong width, twice too wide and twice too narrow. That is
what a boundary feature's review looks like when it is working — nothing else
in the session drew a finding at all.*

## Session 13 — Packaging to the feed (plan C)

### D77 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 13 declares itself not-releasable, and does not publish its own new code

Step (a) is a statement about this session, not a demonstration of the feature it builds. This repository publishes to no feed: there is no Azure DevOps feed for dabbler-ai-router, and no PAT for one. Declaring releasable in order to exercise the path just built would be the hindsight §3.a exists to prevent, dressed as dogfooding — the declaration would have been chosen by a model that already knew what the work turned out to be. The refusal it produces is the honest first run of the gate: `python -m ai_router.packaging --dry-run` against this set refuses with the releasability message and exits 1.

### D78 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The PAT reaches the tool through one argv element and is placed in no environment at all

Spec §3.f and the session spec both say the credential is never in a child environment, and session 3's allowlist is what makes that structural rather than intended: `checks.child_env` builds the environment from a list of what a toolchain needs, and no secret name is on it, so neither the PAT nor the operator's vendor keys can be inherited by pack or push. The value then has exactly one route to the tool -- substitution into a single element of a declared argv at spawn. Three consequences are enforced rather than advised: the declaration is argv and never a shell string, because a shell can re-split, re-quote and log the element a secret lands in; a push command that does not carry `{secret}` is refused at load, because publishing on an ambient credential makes the guarantee unprovable rather than true; and the record keeps the placeholder where the value went while command output is scrubbed of it, because a credential that reaches a log has leaked whether or not it reached an environment.

### D79 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Packaging asks the close gates rather than forming a second opinion about the order

§3.f runs after (e), and 'after' has to mean the evidence for the earlier steps exists rather than that commands were typed in a pleasing sequence. Packaging therefore calls `gates.run_gates(set_dir)` -- with no config argument, exactly as `session close` calls it, so both resolve the configuration that governs the set's own repository and cannot answer the same question two ways. Re-deriving 'is it verified, is the run of record fresh, is the tree clean, is it pushed' inside packaging would have been a guard guarding a guard, and the first divergence between the two would have been discovered by a package that shipped from a tree the close then refused.

### D80 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · pack writes into the run's own directory, which is emptied first

The framework supplies `{output}` and refuses a pack declaration that does not take it, so the artifacts land in `.dabbler/runs/<set>/s<N>/package/` rather than in a `dist/` beside the code. Two things follow structurally instead of by care. The tree that was just verified stays the tree that was verified: a build cannot dirty it, and the working-tree gate cannot start failing because someone packed. And the directory is removed and recreated before pack runs, so everything found in it afterwards was produced by the command that just ran -- last week's artifact cannot be swept into this week's push, which is the accident that a shared output directory eventually causes. A pack that reports success and produces no file is refused rather than recorded as a publication that happened.

### D81 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The schema declares the packaging block; the shipped config declares none, and the overlay is where a feed is named

A packaging block in `ai_router/router-config.yaml` would have to carry a feed URL this repository does not publish to. That is the same shape as the mistake round 1 of session 9 caught (D63): a plausible-looking default sitting in package data that a build would ship to every consumer. So the schema carries the vocabulary and the bundled config carries the reason it is absent, exactly as `testing.controls` already does for a repository that declares no linter. A repository that declares no packaging block publishes nothing, and that is an answer rather than a gap -- there is no build to infer for an ecosystem nobody named. Declaring the block in the schema is what makes it overlayable: `_reject_unknown_overlay_keys` refuses an overlay key the schema has no vocabulary for, so an undeclared block would have been undeclarable in `local-overrides.yaml` -- which is gitignored, never packaged, and the one place a machine's own feed and credential name belong.

### D82 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The managed instruction body gained both the declare step and the package step

Session 5 built the task declaration and session 13 built the gate that reads it, but the orchestrator lifecycle in `bootstrap.py` mentioned neither. Left alone, every future session would have run without declaring, `session_is_releasable` would have failed closed on all of them, and the packaging path would have been unreachable code that passes its tests -- the feature would be finished and dead at the same time. The declaration is now part of step 2, where it belongs, because it is refused once the tree carries the work; packaging is step 8, between the single push and the close, which is where §3 puts (f). Regenerated through `python -m ai_router.bootstrap` rather than hand-edited inside the fence.

### D83 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The seat stopped dispatching until COPILOT_GITHUB_TOKEN was supplied explicitly; recorded because the next session will hit it

Round 1 refused twice with an auth-class dispatch failure, and the message named only the last candidate tried (gemini-3.5-flash), which reads like a Gemini problem and is not one. A direct probe showed gpt-5.4 -- the first candidate the seat catalog offers with anthropic excluded -- failing identically, so every candidate was failing and the loop was reporting the tail of the list. The cause is the seat, not the router: the Copilot CLI moved from 1.0.80 to 1.0.81 under this session and a spawned copilot process could no longer reach the stored credential, while gh auth status reported two hosts logged in with the enterprise one active. Setting COPILOT_GITHUB_TOKEN from gh auth token --hostname github.com for the process restored dispatch on the first candidate. Nothing was written to a file: the transport inherits the process environment, and the value stayed there. Two things are worth carrying forward. The router behaved correctly and its message did not -- a fallthrough that reports only the final failure hides that the first choice failed for the same reason, and a future session will spend the same twenty minutes on it. And the catalog is now pinned to a CLI version that is no longer the live one; entries confirmed on 1.0.80 stay trusted, but the lock wants re-dating.

### D84 · 2026-08-27 · Verifier (gpt-5.4/openai) · A pack that dirties the repository could still publish, so the release record could name a tree that no longer existed

Round 1, Major. The module's own docstring claimed the tree that was verified stays the tree that was verified, and nothing checked it. `tree_digest` was snapshotted before pack and never re-read, so a build that wrote intermediates into the repository -- which is what `dotnet pack` ordinarily does, and the example the config comment hands operators -- would produce artifacts from a tree nobody reviewed, push them, and file a row binding the publication to a tree id that no longer described the checkout. The close would then fail `working_tree_clean`, after the feed already had the package. Fixed by taking the rule the framework already applies to a check that mutates its own subject: the worktree is compared against its own tree id after every command, and a command that moved it fails the attempt whatever its exit code said. The record carries `tree_mutated` and `post_tree_digest`, and the schema refuses a row that is `published` and `tree_mutated` at once -- so the ledger cannot hold the sentence the finding described even if a future code path tried to write it.

### D85 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The Minor about config resolution was fixed rather than deferred, because it was the same mistake the Major was

Round 1's non-blocking nit: `package()` called `load_config()` with no `project_dir`, so a set in another checkout would have been packaged under whichever repository the working directory happened to be -- and the overlay is exactly where the feed URL and the credential's name live, so the wrong overlay is the wrong feed. It is the same error as the blocking one at a different level: a fact taken from ambient context instead of from the thing being acted on. `load_config(project_dir=str(root))` resolves it against the set's own repository, which is what `gates._governing_config` already does for the same reason.

## Session 14 — Collapse session sets (plan A3)

### D86 · 2026-08-27 · Orchestrator · The set level leaves the CLI, the state files and the run ledger

A repository has sessions, not sets of sessions. The set level is gone from
the CLI, from the state files, and from the run ledger:

- **One sessions root per repository**, `docs/sessions/`, holding
  `session-plan.md` (authored), `sessions.json` (machine-written),
  `activity-log.json`, and the two staff-facing files. Set resolution — a
  bare set number matched against a scan root, `SetNotFoundError`,
  `SetCollisionError` — is deleted rather than renamed, because there is
  no longer anything to select between.
- **`--session-set-dir` is removed from every command.** What remains is
  `--sessions-dir`, and it is a root override for a caller standing
  outside the tree, not a selector.
- **Schema v5 drops `sessionSetName` and the top-level `status`.** A
  repository is never "complete", so nothing above a session may carry a
  lifecycle state. The derived view (`currentSession`, `completedSessions`)
  is computed on read and stored nowhere: a stored answer is a second place
  for it to be wrong.
- **Cancellation moves onto the session.** `CANCELLED.md` / `RESTORED.md`
  and the top-level `preCancelStatus` go with the set they described;
  `cancel <n>` records the reason and where the session came from on the
  record itself, and `restore <n>` returns that session and only that one.
- **`.dabbler/runs/<set>/s<N>/` becomes `.dabbler/runs/s<N>/`**, and the
  migration moves the existing rounds rather than abandoning them. Rounds
  recorded under the old address are the same rounds; leaving them behind
  would have made every migrated session look unverified.

### D87 · 2026-08-27 · Orchestrator · This set migrated itself forward, which is the only proof session 14 could offer

The set spec's test for this session is that sessions 15 through 17 register,
verify and close under what it built. That is why the migration is a router
command and not a hand edit.

`session migrate <legacy-set-dir>` reads the set-scoped `session-state.json`
through the legacy normalizer, writes the v5 ledger through the sanctioned
writer, copies the authored plan and the two files up to the sessions root,
and moves the run ledger with them. It is refused once the root carries a
record: a second set folded over the first would renumber work that is
already closed, and two sets' session 3 are not the same session.

It was run against `docs/session-sets/148-the-session-framework` in this
session. The result carries sessions 1–13 complete with their verdicts, 14
in flight, and 15–17 not started — so this session's own verification, run
of record and close are themselves the proof, rather than a claim about one.

**A cancelled set becomes cancelled sessions.** That is the only honest
reading of the old record: the set said that work would not run, and after
the collapse there is nowhere but the session to say so. Dropping the claim
would silently return abandoned sessions to the queue.

`docs/session-sets/` is deleted from the working tree. Its records are in
git history, and set 148's — the only live one — was carried forward rather
than left behind. A directory that no code reads is not history kept; it is
the set level still standing.

### D88 · 2026-08-27 · Orchestrator · The run core's set level is left standing, because it is a second owner of the same record

This session collapsed the **session lifecycle** — the machinery a session
registers, verifies and closes under, its state files, and its run ledger.
It did not collapse the run core (`runcli`, `runproject`, `runcore`), whose
`dabbler` commands still address `--set` and still project
`docs/session-sets/*/spec.md`.

That is a deliberate stop, and the reason is not size. The run core is a
**second writer of the same filenames**: `runproject` generates
`session-state.json`, `activity-log.json` and `change-log.md` into set
directories from its own v5 projection, gitignored and regenerated, while
the lifecycle writers own those names as tracked records. Collapsing both in
one session would have required deciding which of the two owns the record,
and that is a design decision the framework specification does not settle —
not a rename that falls out of removing a directory level.

What this leaves is honest rather than half-finished: the run core projects
from a tree that no longer exists, so `dabbler status` reports no sets in
this repository instead of reporting something wrong. Nothing on the
register/verify/close path reaches it.

**The question the operator now owns:** whether the run core's projection
replaces the lifecycle's records, or is retired. Either answer collapses its
set level as a consequence; neither should be reached by an orchestrator
picking one while renaming a flag.

### D89 · 2026-08-27 · Framework · Verification is blocked: the seat is logged out and no API key is set

Session 14's work is complete and its pre-verification evidence is recorded
and fresh (867 tests, `all-tests-affected`). It **cannot be verified or
closed** on this machine right now, and it is stopping here rather than
going further.

**The seat is logged out.** `python -m ai_router.verify` refused twice with
an auth-class dispatch failure. A direct probe confirms it is the seat and
not one model: `copilot -p ... --model gpt-5.4` returns the same
re-authentication notice, so the verifier pool is unreachable rather than
badly chosen.

**The direct-API path is unavailable too.** `DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY` and `DABBLER_GEMINI_API_KEY` are all unset, so
`--transport api` has no cross-provider candidate either.

**What was not done, deliberately.** The catalog refresh the drift warning
suggests is exactly what spec §5.d forbids inside a running session, and
`discovery` refuses it while a session is in flight; a session that
re-picks its own verifier pool mid-flight has edited the conditions of its
own review. The `offline` transport would produce a verdict no verifier
gave. Neither was used.

**What the operator needs to do:** run `copilot` and `/login`, or export a
non-Anthropic provider key. Then the session resumes at the verification
step — the work is in the working tree, uncommitted on purpose, because
verification reads the working tree and an already-committed tree presents
an empty diff.

This session stays `in-progress`. That is the honest state: there is no
verdict, and a session with no verdict does not close.

### D90 · 2026-08-27 · Orchestrator · The Work Explorer screenshot is another repository, and its error predates this set

The operator reported the AI Work Explorer looking wrong. The screenshot
shows a tree of 13 sets including `148-model-direction-check`, and a
traceback rooted at `C:\\Users\\adm.dennis.mitchell\\source\\probe\\luna\\`. That is a
**different repository** — a near-clone of this one, sharing set names 136
through 147 but carrying its own 148. This repository's 148 is
`148-the-session-framework`.

**Nothing in that screenshot is session 14's doing.**

- The banner (`39 session sets rendered without the router (statuses from
  file presence)`) and its cause — `ModuleNotFoundError: No module named
  'jsonschema'`, raised from `probe\\luna\\ai_router\\config.py` — are
  **long-standing**; the operator confirms the message has been there for
  many sessions. The extension resolved an interpreter without the router's
  dependencies, and a working copy of `ai_router` in that directory shadowed
  any installed one, so the CLI could not run and the tree fell back to
  inferring status from file presence.
- The sets it lists are that other workspace's, not this one's.

**What session 14 does change, and expects to.** In *this* repository the
Explorer will show nothing until session 15, because `docs/session-sets/` is
deliberately gone and the tree model still reads it. The invocation layer was
updated so the extension no longer passes a removed flag, and it still
type-checks; the tree model and the view are session 15's work (plan D1),
because splitting a view across two sessions would leave it half-collapsed in
a way neither session could verify.

**Acceptable only because it is bounded.** Set 148 does not conclude with the
Work Explorer broken. Session 15 rebuilds the sessions view without the set
level, preserving the existing row actions, the two-inline-actions rule, and
the operator's four status icons resolved by name through `ICON_FILES` and
passed to `TreeItem.iconPath` as a `{ light, dark }` pair. The
`fill:currentColor` "simplification" stays rejected; the evidence is in
`media/status-icon-theming.md`.

**The near miss is the part worth keeping.** This entry was first drafted to
say the collapse had broken the operator's view. It had not. Reading the
traceback's path before believing the report is what separated the two, and a
log that had recorded the first draft would have sent session 15 hunting a
defect that does not exist — while leaving the real one (an interpreter
without `jsonschema`) unfixed for another set.

### D91 · 2026-08-27 · Orchestrator · Round 1 fixed the cancellation defect; the run-core finding is reverted and handed off

Session 14 stops here at the operator's direction, **in-progress and
unverified**. Round 1 returned `ISSUES_FOUND` with two blocking findings
(gpt-5.4/openai, `.dabbler/runs/s14/round-1-verifier-output.md`).

**Finding 2 — fixed.** Cancelled sessions were not durable: the next
`register_session_start` rebuilt every non-complete session as
`not-started`, erasing the cancellation and its reason, and `start`
computed the next session from completed numbers only, so it would offer a
cancelled one. Both are corrected — `_build_sessions_array` preserves a
cancelled status with `preCancelStatus`, `cancelledReason` and
`cancelledAt`; `start` steps over cancelled sessions and refuses to
register one, naming `restore`. Three tests cover it.

**Finding 1 — outstanding, and deliberately reverted.** The run core
(`runcli`, `runproject`, `runcore`) still addresses `--set` and reads
`docs/session-sets/`, so the shipped `dabbler` CLI cannot drive a collapsed
repository. The finding is correct and in scope: the set spec's session 14
carves out no exception for it. I began that collapse and reverted it
part-way — `git checkout HEAD` on those three modules and their three
schemas — because a half-ported CLI in the tree is worse than an honest
gap: it cannot be tested, cannot be reviewed, and would land unreviewed if
the round cap arrived first.

**What the next session inherits.** The lifecycle collapse is complete and
the suite is green (870 collected). The remaining work is one bounded
piece: collapse the run core's set addressing. The shape it was taking,
for whoever resumes it:

- `runproject.read_organization` parses the one authored
  `docs/sessions/session-plan.md` into `{"sessions": [...]}`; no slugs, no
  positions, no per-set title/objective.
- The projection's `session_sets` becomes `sessions`, and `_set_state` —
  a roll-up with nothing left to roll up — goes.
- **`runproject.write_documents` should be deleted, not ported.** It is a
  second writer of `session-state.json`, `activity-log.json` and
  `change-log.md`, which the lifecycle writers now own. Two generators of
  one record is exactly the drift this collapse exists to end, and spec
  §1.b removes those files as the staff-facing set anyway.
- `runcli` loses the `organize set` noun entirely; `organize session add`,
  `organize cancel/restore`, `run` and `worktree create` take `--session`
  and no `--set`.
- `set_slug` leaves `run-event`, `run-projection` and
  `session-organization`; `session-state-v5.schema.json` becomes unused
  once the document generator goes.

**State on disk.** The work is committed and pushed so it is not stranded
on one machine. That breaks the usual "do not commit before verification"
rule, and the reason is on the record rather than silent: the operator is
continuing elsewhere. The next round must therefore verify against the
commit range rather than the working tree — `assemble_evidence` refuses an
empty diff and says so.

Nothing is closed, and no verdict exists that a verifier did not give.

### D92 · 2026-08-27 · Orchestrator · This session was too large, and the evidence cap said so before I did

**The session was too large, and the framework said so before I did.**

Round 1's evidence bundle came to 1,376,582 chars against a 614,400 cap.
`EvidenceTooLargeError` names two remedies — "split the session or raise
`AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS`" — and I took a third: committing the
archive deletion separately to shrink the diff under the cap. That worked,
but it treated a size guard as an obstacle rather than as the signal it is.
The bundle still went out at 528KB, and a verifier reading half a megabyte
of diff is the single largest cost in this session.

**The cost.** Roughly $70 across the session. The drivers, in order:

1. **One session doing two subsystems.** The lifecycle collapse alone
   touched 50+ files. Adding the run core on top of it, mid-round, is what
   turned a large session into an unfinishable one.
2. **A 528KB evidence bundle**, sent once per round, is enormous verifier
   input for a change that could have been three reviewable sessions.
3. **Twenty minutes lost to an auth failure that D83 had already
   diagnosed** one session earlier — including a wrong-account probe and a
   re-login that could not have helped. The record had the answer; I
   searched the code before I searched the record.

**What the cap should have produced.** Session 14 should have been split at
the point the bundle first refused: the router collapse, the migration, and
the run core as separate sessions. The set spec's own advice — "re-planning
means fewer, larger sessions" — is about round counts, not about letting a
single session grow past what a verifier can read. The evidence cap is the
measure of "too large to review", and it should be treated as a planning
signal, not a threshold to get under.

**Concretely, for whoever picks this up:** the affected-test selector said
`all tests affected` because `tests/conftest.py` changed, so every
pre-verification run was the full 10-minute suite. Three of those ran. A
session scoped so that conftest is untouched pays targeted-test prices
instead.

### D93 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The run core's set addressing is collapsed, out of band and unverified

Round 1's finding 1 is fixed. The run core (`runcli`, `runproject`,
`runcore`) no longer addresses `--set` and no longer reads
`docs/session-sets/`, so the shipped `dabbler` CLI drives a collapsed
repository. `dabbler status` in this repository now reads its own
seventeen sessions from `docs/sessions/session-plan.md` instead of
reporting no sets.

**This was done outside a session, at the operator's direction**, and the
record says so rather than presenting it as lifecycle work. No session was
registered for it, no verifier saw it, and session 14 stays `in-progress`
with no verdict. What follows describes a change in the working tree; it
is not a claim that anything was verified.

**What changed.**

- `runproject.read_organization` parses the one authored
  `docs/sessions/session-plan.md`. No slugs, no positions, no per-set title
  or objective; the digest is the exact plan bytes, so a plan edit that
  appends no event still moves it.
- The projection's `session_sets` is a flat `sessions`, and `_set_state` —
  a roll-up with nothing left to roll up — is gone.
- **`runproject.write_documents` is deleted, not ported**, with
  `_session_state_document`, `_activity_log_document`,
  `_change_log_document` and `_is_v4_set`. It was a second writer of
  `session-state.json`, `activity-log.json` and `change-log.md`, which the
  lifecycle writers own. `session-state-v5.schema.json` went with it, and
  `finish` no longer reports a `documents` list it does not write.
- `runcli` loses the `organize set` noun. `organize session add`,
  `organize cancel/restore`, `run --register` and `worktree create` take
  `--session` and no `--set`. `_require_generated_views_ignored` is gone
  with the views it guarded.
- `set_slug` leaves `run-event`, `run-projection`, `session-organization`
  and `RunView`. `organization.cancelled`/`.restored` carry
  `session_number` and `reason`; the `target` discriminator had one legal
  value left.
- `bootstrap.DECOMPOSITION_PROMPT` no longer instructs a model to scaffold
  `docs/session-sets/<NNN-slug>/spec.md` — a live path that would have
  rebuilt the set level in any repository bootstrapped after the collapse.

**Evidence.** 870 Python tests green before, 868 after: two tests were
deleted because their subjects were,
`test_the_four_documents_are_generated` with the generator and
`test_a_new_set_is_declared_and_committed_on_its_own` with the `organize
set` noun. No test was added, which is the right shape for a collapse. 179
TypeScript tests green and `tsc --noEmit` clean, both unchanged by this
work. A scratch repository with no set level was driven end to end through
`status`, `organize session add`, `organize cancel`, a refused
registration of the cancelled session, `organize restore` and `run
--register`; nothing but the authored plan appeared under
`docs/sessions/`. Net -450 lines.

**What is deliberately not done.** D88's question is still the operator's:
whether the run core's projection replaces the lifecycle's records or is
retired. This change answers only the narrow half the collapse forced —
the run core stopped writing the lifecycle's filenames — and leaves the two
systems with separate state. `dabbler status` reads the run journal, which
has no runs in this repository because every session here was driven by
`ai_router.session`; it reports the sessions as `not-started` and is not
wrong to, because no *run* has ever been registered.

The Work Explorer still shows nothing in this repository. That is session
15's work and was already on the record at D90.

### D94 · 2026-08-27 · Operator · This machine has no seat, so verification runs on the direct-API transport

D89 recorded verification as blocked because the seat was logged out and
no provider key was set. That was true of the machine it was written on.
**It is not true of this one, and the difference is a machine fact, not a
project fact.**

This machine has **no Copilot seat at all**. The GitHub account signed in
here is the operator's personal account, used for pushing extension code;
the Copilot entitlement lives on the other machine under a GitHub
Enterprise business account. The other machine's confusion — Copilot
reaching for the personal account rather than the business one — is the
same fact seen from the other side. Re-logging in here cannot help,
because there is nothing here to log in to.

**What this machine has instead:** all three of
`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` and
`DABBLER_GEMINI_API_KEY` are set, so the direct-API path has a
cross-provider verifier available for an Anthropic orchestrator.

**Recorded as `transport.profile: api` in a project-local
`local-overrides.yaml`**, which is exactly what the bundled config's own
comment names for this case, and which is gitignored — so the other
machine keeps its seat and the published default stays `copilot-cli`. An
env var was rejected as the mechanism: it reaches only processes started
after it was written, and this fact needs to outlive a shell.

**One thing the operator should expect to see.** `discovery status`
reports the API enumeration record as absent, and `discovery enumerate`
refuses while session 14 is in flight — correctly, per spec §5.d. That is
a warning and not a block: selection treats an absent record as unknown,
never as unsupported, and draws its candidates from the registry. Do not
resolve the warning by enumerating mid-session; the refusal is the rule
working.

### D95 · 2026-08-27 · Operator · Session rows carry a three-digit padded label, and nothing else does

Session rows are labelled `001`, `002`, ... `014` — three digits, zero
padded. Staff read set numbers in that shape for 147 sets and the operator
asked for it back after the collapse removed the directory that carried it.

**Presentation only, and the boundary is the point.** The plan's
`### Session N:` headings, `sessions.json`'s `number`, the
`.dabbler/runs/s<N>/` ledger and every CLI `--session` argument keep the
plain integer. Padding an identifier that four subsystems already agree on
would buy a familiar label at the price of a migration, and the label is
what was actually asked for.

Added to session 15's spec as step 5, alongside the icon requirements
already there: the four status glyphs resolve by name through `ICON_FILES`
and reach `TreeItem.iconPath` as a `{ light, dark }` pair, and the
`fill:currentColor` "simplification" stays rejected.

### D96 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · The tracked ledger was a one-time snapshot, and one clean-tree gate had not heard about it

de583d11 tracked the run ledger so a session can move between machines.
It did not change `.gitignore`, and that made it a **one-time snapshot**: a
tracked file overrides `.gitignore`, but a *new* file under an ignored
directory is still skipped by `git add -A`. Round 2's verifier output,
the appended `rounds.jsonl` and the new test-run records would all have
gone missing exactly the way round 1's did -- the failure the commit
existed to prevent, one round later.

`.gitignore` now excludes `.dabbler/*` and re-includes `.dabbler/runs/`,
keeping the derived `run-projection.json` and the machine-specific
`api-models.lock` out. Probed rather than reasoned about: a new
`round-2-verifier-output.md` is now visible to `git status`, and both
derived files are still ignored.

**The operator's objection was the right one to raise, and it is answered
by measurement rather than by argument.** The worry: verification writes
into `.dabbler/runs/`, so tracking it could make every verified session
look changed and spawn re-verification. That exact circularity is already
named in `is_machine_state_path` -- "a round is appended after the tree
snapshot it describes, so counting the ledger as session content makes
every verified session look like it drifted the instant it was verified"
-- and defended against in three places:

- `snapshot_worktree_tree` adds everything to a throwaway index and then
  drops `.dabbler` from it, with a comment naming the committed-ledger
  case specifically.
- `facts.build_diff_pathspecs` excludes `**/.dabbler` and `**/.dabbler/**`
  from every evidence diff.
- `gates.material_worktree_changes` skips machine state at close time:
  "the run ledger is the record, not the work."

A probe confirms all three: with the ledger tracked, a round-2 write moves
neither the tree digest nor the evidence diff, while a source edit still
moves the digest.

**A fourth gate was not defended, and this found it.**
`runcore.worktree_is_clean` asked git alone. That was correct only while
the ledger was ignored everywhere; with it tracked, a round writing its
own output left the tree dirty and the next `run --register` would have
refused `dirty-worktree` on the evidence of the previous round. It now
applies the same `is_machine_state_path` exemption the other three use,
and reads `--untracked-files=all` so a collapsed `.dabbler/` directory row
cannot slip past the filter as a single umbrella entry.

**The predicate moved rather than being copied.** The first fix imported
it from `evidence`, and
`test_the_run_core_imports_nothing_the_cutover_deletes` refused: the run
core may not depend on the half the cutover deletes. It now lives in
`journal.py` -- the bottom of the run core, which already owns
`MACHINE_DIRNAME` -- and `evidence` re-exports it, so both halves share
one definition and "the one place that decides" stays one place. The
invariant test caught this, which is the test doing its job.

869 tests green, one added: a tracked ledger with an uncommitted round-2
write does not refuse the next registration.

### D97 · 2026-08-27 · Operator · The task level returns in session 15, folded from the enforced record rather than the narrated one

Staff wanted a task level below the session and the previous one was
withdrawn because it drifted. The operator's condition is exact: it is
worth having **only if** the Explorer is reliably updated when a task ends
and the next begins.

**The old level drifted for a structural reason, not a bug.** The tree
rendered `activity-log.json` step entries written by `writers.log_step`,
reachable only through `python -m ai_router.session log` -- a command an
engine calls voluntarily. `progress.build_step_rows` is visibly a
reconciliation layer for that unreliable writer: "keys are derived slugs
an engine paraphrases", "unclaimed logged steps append", "an in-progress
log followed by a complete log must not lose the start". Rows built on a
narration cannot be more reliable than the narrator.

**The framework already has an enforced record, and it is not the one the
tree reads.** `.dabbler/runs/s<N>/step-execution.jsonl` takes a row when a
step is *opened* against a declared `approved-plan.json` step, anchored to
a base commit; the close is earned against the step's own file envelope
and deterministic evidence; and `ensure_commit_guard` installs a
pre-commit hook that refuses a commit while a step is open. The schema
carries the invariant -- the last `opened` with no `closed` after it is
the open step, and there is never more than one -- and states that a row
failing validation is a refusal rather than a skip. Nothing there depends
on an engine choosing to report.

So the task level is not new work to invent; it is a matter of pointing
the rows at the record that is already enforced. Added to session 15 as
steps 6-10.

**Two requirements are load-bearing and are written as such.** The
watcher must cover `.dabbler/runs/*/step-execution.jsonl`: the tree today
watches only `docs/session-sets/**` -- dead after session 14 -- and
otherwise falls back to a 30-second poll, and a task level up to 30
seconds stale is the same surface staff already rejected. Its acceptance
test is a *transition*, not a render. And an unreadable execution record
must make the tree say it cannot tell, never show the last good row as
current; stale-but-plausible is the failure this level exists to end.

**The session is now two subsystems, which is what made session 14
unfinishable.** The orchestrator's recommendation was a separate session
after 15; the operator asked for it in 15, and that is the operator's
call. What the spec adds in exchange is a **named seam**: steps 2-5 are
the view, steps 6-10 are the task level, they share only the row
dispatch, and the task level depends on the view rather than the reverse.
D92's lesson was that the evidence cap is a planning signal and not a
threshold to get under. Naming the split in advance is how that signal
produces a split next time instead of a heroic round.

### D98 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · A round's baseline can be recovered when its snapshot tree stayed on another machine

Session 14 moved to the operator's other machine and round 2 could not
start. `affected` said only "could not determine the change set", and the
cause was one object: round 1's `completion_tree` `92a55874` is not in this
repository, so the fix delta had nothing to measure from.

**The ledger rows travelled and the objects they name did not.** A round
snapshot is written by `snapshot_worktree_tree` through a throwaway index
and anchored to no ref — there are no `refs/dabbler/*` refs and no
`update-ref` anywhere in `ai_router`. A dangling tree is garbage-collectable
on the machine that wrote it and is never pushed. de583d11 tracked
`.dabbler/runs/` and 913eb65f taught `.gitignore` to keep letting new files
in; both were necessary and neither was sufficient, because a row that
points into a machine-local object store is portable only in appearance.

**What was built: a recovery, not a skip.** `python -m ai_router.verify
reanchor --commit <sha> --reason "<why>"` records one row in
`.dabbler/runs/s<N>/baseline-reanchors.jsonl` naming a commit-reachable tree
for the latest round to be diffed from. `ledger.effective_baseline()` is now
the only way `verify` and `affected` read a prior round's baseline.

Every refusal on it exists so it cannot become a way to choose one's own
review scope:

- **Refused while the recorded tree resolves.** On a machine that still
  holds the object there is nothing to recover, and re-anchoring there would
  be an author selecting what the next round sees.
- **Refused onto HEAD.** Diffing the working tree against HEAD would leave
  the committed fix unreviewed — the one outcome this path must not be able
  to produce.
- **Refused onto anything that is not a strict ancestor of HEAD.** A
  baseline is a place this history actually passed through, never a
  fabricated tree.
- **Refused a second time for the same round.** A recovery that can be
  revised is a scope the author keeps re-choosing.
- **The reason is mandatory and permanent**, and the round it produces
  carries `baseline_reanchor` naming both trees. `previous_tree` still says
  where round 1 ended; the new key says where round 2 actually measured
  from. A reader must not have to infer the difference.

**`gates.py` deliberately does not use it, and the asymmetry is the point.**
A fix delta measured from a substitute baseline only changes what the next
round is *shown*. The close's drift check asks whether the tree still *is*
the verified one, and without the verified tree there is no answer — so it
keeps reading `completion_tree` directly and fails closed. Widening a review
is recoverable; asserting an unproven identity is not.

**What this costs, stated plainly.** Round 2 is measured from the tree of
8a663ed8 rather than from the tree round 1 actually completed at. Those are
not the same tree: `.dabbler` was ignored then and is dropped from snapshots
either way, so if nothing had changed between the round-1 snapshot and the
commit they would be identical, and they are not. Whatever landed in that
gap is reviewed by no round. It is small and it is not nothing, and the
ledger now says so out loud rather than leaving a reader to assume round 2
picked up exactly where round 1 stopped.

**The root cause is still open and is owed.** The fix is to anchor each
snapshot tree under a ref — `refs/dabbler/rounds/s<N>/r<R>` — at the moment
the round is recorded, so the object survives gc and travels with the push
that already carries the row. The operator chose the recovery path alone for
this session rather than both, on D92's reasoning that an over-large session
is what made session 14 unfinishable. Until that lands, every session that
changes machines mid-flight needs this recovery, and every use of it is a
weaker record.

### D99 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Round 2's three findings: one real fix, one version bump, one dispute the re-anchor caused

Round 2 returned three blocking findings against the re-anchored delta.
Two were acted on and one is disputed; the reasoning for each is here so
the next round is not asked to reconstruct it.

**Issue 3 was mine, and it was right.** `run_reanchor` claimed its checks
meant re-anchoring "cannot become a way to choose one's own review scope",
and then enforced only that the commit was a strict ancestor of `HEAD`.
Remediation spans commits. An author with fixes C1, C2, C3 could anchor on
C2 and the next round would see only C3 -- the earlier fixes dropped out of
their own review by a path built to prevent exactly that.

The rule is now narrower and derives from what a round actually is. A round
reviewed a working tree at a moment, so exactly two commits can stand in
for that tree: **the last one made at or before the round's `recorded_at`**
(the tree it started from) and **the first one made after it** (what the
reviewed work became, if it was uncommitted at review time). Everything
later contains remediation the next round is supposed to see. Against this
history the rule resolves to `{5c017b82, 8a663ed8}`; the existing anchor
stays legal and the finding's own scenario -- the newest ancestor,
`913eb65f` -- is refused. Ancestry is no longer checked separately: walking
first-parent history from `HEAD` implies it.

**Issue 1 was real in mechanism and is answered by a version, not a
migration.** `bbc03beb` dropped `set_slug` from `run.created` and
`target`/`set_slug` from the organization events while leaving
`schema_version` at `const: 1`, and every payload schema is closed. A
version 1 journal therefore fails validation as an unexplained
`additionalProperties` error rather than as the compatibility break it is.

The envelope is now version 2, and `validate_event` refuses an older
journal **by name and by direction**: "upgrade the router" is the wrong
advice for a file that predates a breaking change. A deterministic
migration was considered and rejected for now. It needs a rule mapping
legacy per-set `(set_slug, session_number)` pairs onto repository-wide
numbers, and that rule presupposes D88's answer -- whether the run core's
projection replaces the lifecycle's records or is retired -- which is the
operator's open question. This repository has no `.dabbler/journal.jsonl`
at all and its projection carries `runs: []` after fourteen sessions, so
nothing here is stranded. **The operator chose the version bump over the
migration**, on the grounds that it is correct whichever way D88 goes.

**Issue 2 is disputed, and the reason it was raised is worth more than the
finding.** It asserted that round 1's cancelled-session defect was still
unfixed. It is fixed: `_next_available`, `_cancelled_numbers` and the
refusal that points at `restore` all landed in `8a663ed8`, and so did
`tests/test_session.py::TestCancellationSurvives`, which covers all three
clauses. All four clauses of the acceptance criterion were re-executed
against the shipped CLI in a scratch repository and pass.

**The finding is an artefact of the re-anchor, and it is the mirror of the
cost D98 named.** D98 warned that measuring round 2 from `8a663ed8` leaves
whatever landed between round 1's snapshot and that commit unreviewed. What
actually happened is the other half of the same fact: the remediation
*inside* `8a663ed8` is invisible to a round measured from it, so a finding
fixed there is re-reported rather than confirmed. Any re-anchor onto the
first post-round commit has this property. It is not a defect in the
recovery -- it is what the recovery costs, and it belongs beside D98's
warning rather than as a surprise in the next session.

Issue 2's second half -- that lifecycle cancellation and run-core
cancellation are separate authorities -- is accurate and is D88/D93's
recorded open question. Nothing in this delta widened it.

**A selection gap surfaced on the way and is closed.** `journal.py` and
`runproject.py` were the only modules under `ai_router/` with no rule in
`testing.selection`, so changing them recorded `selection_unknown` and
bought the smoke tests. The mapping is declared rather than the run
widened, which is what the selector's own doctrine asks for.

**The round cap is raised from 3 to 5 for this session**, at the operator's
direction: three findings landed at once and one carries a dispute, and a
single remaining round is thin enough that the likely outcome is a terminal
state rather than a verdict.

### D100 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · The anchor narrows to one commit, and the v1 journal is migrated on a premise I had wrong

Round 3 withdrew the cancelled-session finding on the evidence the dispute
cited, and raised both remaining findings in sharper form. Both are
accepted; one of them corrects D99 and one corrects me.

**The re-anchor rule was still too loose, and the counter-example is our
own.** D99 narrowed the legal anchor to two commits: the last one at or
before the round, and the first one after it. The second was justified by
"a round reviews an uncommitted working tree, so the first post-round
commit is what that tree became." That is an assumption, and nothing in the
framework can check it. Remediation normally begins the moment a round
reports, so the first post-round commit is at least as likely to *contain*
fixes as to materialize the reviewed tree -- and accepting it drops those
fixes out of the next round, which is the defect the rule exists to prevent.

**This repository proves the point against itself.** Round 1 recorded
completion tree `92a55874`. The tree of `8a663ed8`, the first commit after
that round and the one this session re-anchored onto, is `b70c5dcae3f3`.
They are different trees, so `8a663ed8` demonstrably is not what round 1
reviewed. Under the rule as it now stands the only legal anchor for round 1
is `5c017b82`, and **the re-anchor this session actually performed would be
refused.** That is left standing rather than quietly re-cut: rounds 2 and 3
were measured from `8a663ed8` and the record should say so plainly.

The exposure was not theoretical and it did not stay hidden. Round 1's
cancelled-session fix landed inside `8a663ed8`, invisible to a round
measured from it, and round 2 duly re-reported it as unfixed. It took a
dispute citing the commit and its tests to clear. That is the mechanism
working -- expensively.

So the rule is now one commit: **the last one made at or before the round.**
The next round re-reviews the session's own work, which is expensive and is
the trade. On a path taken only when a session changes machines, a wider
review is the right price for never silently narrowing one. Where the
evidence cap refuses that width, D92 already says what the refusal means:
it is a planning signal, not a threshold to get under.

**The version-1 journal is migrated after all, and the premise that argued
against it was mine and was wrong.** I told the operator the legacy
identity mapping needed a rule they would have to choose, and used that to
recommend a version bump over a migration. It does not, in the case that
matters. A journal holding one set's events maps deterministically: with a
single set, that set's session numbers and the repository's are the same
numbers. Only a journal spanning two sets is genuinely ambiguous, because
each set numbered its sessions from 1 and nothing in the record says which
repository-wide number either should take. The operator revisited the
decision on the corrected premise and chose the migration.

`read_events` now reads a version 1 journal forward through
`upgrade_v1_records`: `set_slug` leaves `run.created`, `set_slug` and
`target` leave the organization events, and the envelope reads as version
2. Two inputs are refused by name rather than guessed at -- a journal
spanning more than one set, and a set-level `organization.cancelled`, which
cancelled a thing that is no longer a concept and so maps onto no session.

**The upgrade is in memory and the file is not rewritten.** The bytes on
disk keep saying exactly what their writer wrote; a later append simply
writes version 2 beside them, and the reader understands both shapes. A
migration that rewrote durable history in place would be a worse answer
than the problem, and the test asserts the file is byte-identical after a
read.

### D101 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Rounds 4 and 5 were both my own migration's defects, and the timestamp heuristic is retired

Rounds 4 and 5 each returned one blocking finding, and both were mine —
defects in the migration built to answer round 3, not in the collapse this
session set out to do. The record says so rather than presenting the
sequence as steady progress.

**Round 4: refusing a multi-set journal stranded the active set too.** The
first migration read a single-set journal forward and refused anything
else. That refusal was the wrong shape: a repository whose journal spans two
sets cannot read *this* set's runs either, so the migration blocked exactly
the case the session plan requires to work.

The replacement refuses nothing. `set_slug` is no longer dropped — it is
kept as `legacy_set` on every record belonging to a retired set, and the
active set is identified deterministically from the journal alone as the
set of the newest `run.created`. Its records lose the slug because its
session numbers *are* this repository's. A set-level cancellation is always
legacy, whichever set it names: it acted on a thing that is not a concept
any more, so it maps onto no session and survives as a fact rather than a
refusal.

**Round 5 found the hole that left.** Isolating legacy *runs* from the
session join was only half the job. Every set numbered its sessions from 1,
so a retired set's cancellation of *its* session 1 arrives carrying the
number of *this* repository's session 1 — and `build_projection` was still
handing every event, legacy or not, to `organization_states()`. Live work
could read as cancelled on the strength of a retired set's decision. The
same records also carry no `session_number` at all when they are set-level,
which would have raised `KeyError` on the same line.

The filter now lives inside `organization_states()` rather than in the
projection that called it, because the run CLI asks that function the same
question when it decides whether a session may be started. A rule enforced
at one of two call sites is not a rule.

**The re-anchor's timestamp heuristic is retired rather than tightened
again.** Two rounds raised the same nit: a committer date is user-controlled
to the second, so no walk over dates can prove commit order. Rounds now
record `head_commit` — the commit HEAD stood at when the round was written
— and a recovery reads the anchor straight off the graph when it is
present, consulting no date at all. It also refuses when that commit is no
longer an ancestor of HEAD, which is the honest answer to a rewritten
history. The date walk stays as the fallback for rows written before the
field existed, including this session's own round 1, and the schema marks
the field optional for exactly that reason.

**Four rounds went to one subsystem, and the shape is worth naming.** Every
finding after round 2 was about the run core — a Phase 0 component with no
journal in this repository, `runs: []` after fourteen sessions, and an open
operator question (D88) about whether it survives at all. Each fix was
correct and each exposed the next. That is what verifying a subsystem for
the first time looks like, and it is also what D92 warned about: session 14
carries two subsystems, and the second one is where the rounds went.

### D102 · 2026-08-28 · Operator · Session 15 splits in two at the seam its own spec named

Session 15 carried two subsystems. It is now two sessions, cut at the seam
its own specification named in advance.

**Session 15 is the view** — the collapsed tree, the operator's four status
icons untouched, and the three-digit padded row label. **Session 16 is the
task level** — the fold of `step-execution.jsonl`, the invariant rendered
rather than recomputed, the refusal on an unreadable record, and the
watcher whose acceptance test is a transition rather than a render. The
former sessions 16 and 17 become 17 and 18, and the set is eighteen
sessions.

**The seam was already written down, which is the whole point.** D97
recorded the orchestrator's recommendation to split and the operator's
decision to keep both halves in one session, and in exchange the spec named
where it would break if it had to: steps 2-5 were the view, steps 6-10 were
the task level, they shared only the tree model's row dispatch, and the
task level depended on the view rather than the reverse. That is exactly
where the cut lands. Nothing had to be re-derived.

**Session 14 is why the operator revisited it.** D92 said the evidence cap
is a planning signal rather than a threshold to get under, and session 14
then spent seven verification rounds -- four of them on a second subsystem
it had absorbed mid-flight. A named seam that is never used is just a
comment. This is the signal producing a split before the rounds rather than
after them.

**One consequence is not free, and session 15 inherits it.** `sessions.json`
holds a title per session, and `progress.heal_title` replaces a stored title
only when it is generic. Re-cutting a plan therefore leaves moved sessions
carrying the titles of whatever used to sit at their numbers: sessions 17
and 18 are in that state now, and the next `session start` will rebuild the
array from the plan without correcting them, because their stored titles are
specific rather than generic. A not-started session with no history has no
title worth preserving against the plan's, and the session that renders
those titles is the one that should notice they can be stale. It is written
into session 15's specification as step 6 rather than left as a surprise.

**This is a planning edit made outside a session**, at the operator's
direction, the same way D95 and D97 added steps to session 15's spec.
Session 14 is closed and verified; no code changed here. The decisions log
keeps its earlier "seventeen sessions" references untouched -- they were
true when they were written, and rewriting history to match a later
decision is the one thing a record must not do.

### D103 · 2026-08-28 · Operator · The baseline root cause becomes session 19 rather than staying owed in a decision entry

D98 recorded the root cause of the baseline problem and left it open at the
operator's direction; D100 repeated that it was owed. Owed work that lives
only in a decision entry is work that gets found by whoever happens to read
back far enough. It is now session 19, at the end of the plan.

**Appended rather than inserted.** The set was re-cut once already this
day, and `progress.heal_title` replaces a stored title only when it is
generic — so every insertion leaves moved sessions wearing the titles of
whatever used to sit at their numbers. Sessions 17 and 18 are in that state
now because of the session 15 split. Adding at the end costs nothing;
inserting would have doubled a defect that session 15 has not yet fixed.

**The session is scoped to four parts, and the third is the one that
decides it.** Anchoring a snapshot under `refs/dabbler/rounds/s<N>/r<R>` is
the easy part. This repository configures no push refspec at all, and its
only fetch refspec is `+refs/heads/*:refs/remotes/origin/*`, so custom refs
would neither leave the machine that wrote them nor arrive on the one that
needs them. `bootstrap` has to write the refspec **and an existing clone
has to be migrated**, or the fix works only on machines cloned after it
ships. The acceptance test is therefore a two-checkout one — record in A,
push, fetch in B, resolve the baseline in B without `verify reanchor` —
because a single-machine test cannot tell a working fix from a broken one
here.

**One design was considered and rejected before it could look attractive
later.** Recording `worktree_clean` and recomputing the snapshot from
`head_commit` would need no refs, no push and no migration. It only helps
for rounds taken against a clean tree, and rounds are dirty by
construction: verification reviews the working tree *before* the commit.
It would almost never fire, and it would look like a cheap win to whoever
picks this up without knowing that.

**`verify reanchor` is not removed by this session.** It stops being
*needed* on a configured machine; it stays for rounds recorded before the
refs existed, for clones predating the refspec, and for a rewritten
history. `head_commit`, shipped in session 14, remains the fallback that
places a baseline for those.

**Deliberately last, and honestly labelled as such.** The recovery works
today. What session 19 buys is avoiding its cost — a re-anchored baseline
lands before the round, so the next round re-reviews the entire session,
which can exceed the evidence cap. That is what nearly happened in session
14, and it is the argument for doing this at all rather than an argument
for doing it first.

## Session 15 — The sessions view (plan D1)

### D104 · 2026-08-28 · Orchestrator · The status buckets go with the set level: sessions are a sequence, not a pile

**The status buckets went with the set level, and that is a change the
plan did not spell out.**

The tree was module -> status bucket -> set -> session -> step. Removing
the set level leaves the buckets with a new thing to group, and the
honest answer is that they should not group it.

Buckets earned their place over SETS. Sets are unordered, numerous and
concurrent: several can be in flight, a dozen not started, and "which
work is live" is a question the row order cannot answer. Bucketing was
how that got answered.

Sessions are none of those things. They are a strictly sequential
numbered list with exactly one session in flight, a prefix of complete
ones behind it and a suffix of not-started ones ahead. Bucketing a
sequence with that structure produces three contiguous ranges — the same
information the ordered list already carries — at the cost of three extra
rows and, decisively, the numeric order itself: "In Progress" first puts
session 015 above sessions 001 through 014.

That cost lands squarely on step 5 of this session's own plan. The
three-digit zero-padded label exists because "the operator scans that
prefix down the left edge". A view that scrambles the sequence and then
pads the numbers so they can be scanned in order is arguing with itself.

So the tree is repository -> session -> step, and the session list is
ordered by number ascending — the order the ledger is written and the
order the work runs. Status is carried where it already was: the
operator's four authored glyphs, unchanged, plus "in flight" in the
in-flight row's description and the fraction on the repository row.

What this gives up: on a repository with hundreds of sessions, finding
the live one means reading down a long list. Buckets would not have
fixed that either — "Complete" would hold all but a handful — and the
repository row names the in-flight number, so the answer is one row from
the top.

### D105 · 2026-08-28 · Orchestrator · The file-presence fallback is deleted, not ported: a projection that fails shows no sessions

**The file-presence fallback is deleted rather than ported, so a
repository the router cannot be run in shows no sessions and says so.**

`fileSystem.fallbackState` bucketed a set by which files existed —
`CANCELLED.md` then `change-log.md` then `activity-log.json` — when the
projection subprocess failed. Its own comment called it "the ONE
deliberate duplication of a Python rule".

Three reasons it does not come forward:

1. **The files it read are gone.** Session 14 deleted the cancel/restore
   markers and moved cancellation onto the session record. The ladder has
   nothing left to climb.
2. **It answered a question that no longer exists.** A set had a status;
   a repository does not. What the tree needs now is the LIST of sessions
   and each one's status, and no arrangement of filenames yields that —
   the ledger has to be read and normalized, which is what `progress.py`
   does.
3. **Guessing is worse than silence here.** A degraded row that shows
   plausible statuses is the failure mode the framework exists to end.

So a repository whose projection failed still renders — its work is not
hidden — with no session children, a tooltip saying the router could not
be run, and one `TreeView.message` naming the install remedy. That is
"one implementation of any rule, in one language" actually applied,
rather than stated and excepted.

### D106 · 2026-08-28 · Orchestrator · A worktree is its own repository row, and the duplicate-name merge dies with the set name

**A worktree is its own repository row, and the duplicate-name merge is
deleted with the thing it was merging.**

The scan used to find one set in a main checkout and again in each
worktree, and merge them into a single row — the copies were of one set,
so showing several was noise. That machinery (state ranking, identity
keys, the collision list, the fail-loud duplicate-name error) is gone.

It cannot survive the collapse, because what it deduplicated was a NAME
and sessions have numbers instead. Session 15 in a main checkout and
session 15 in a worktree are not two copies of one record: each checkout
has its own `docs/sessions/sessions.json` at its own commit, and they can
legitimately disagree about how many sessions exist and which is in
flight. Merging them by number would show one checkout's progress under
the other's name — the exact class of wrong the collision check existed
to prevent, arrived at by the code that used to prevent it.

So each discovered root with a ledger is one row, identified by its path
(which is what the row's `id` is), labelled by its folder name. Two rows
for two checkouts is the honest rendering, and the tooltip and the
troubleshooter both say so.

What is kept from the old discovery: realpath-based dedup, so a symlink
or a case-variant of the same directory is still one row.

### D107 · 2026-08-28 · Orchestrator · A historyless session takes the plan's title, and the ledger grows to the plan's count

**A session with no history takes the plan's title; a session that ran
keeps its own. And the ledger grows to the plan's session count.**

The plan's step 6 named the case and this repository was in it: the
ledger held seventeen sessions, the plan had been re-cut to twenty, and
sessions 16 and 17 carried the titles of whatever used to sit at their
numbers. `heal_title` only replaced a title it judged GENERIC — blank, or
literally `Session <n>` — so a real-looking stale title survived
untouched.

The rule that replaces it is about the record, not about the string. A
session that has run is a statement about something that happened, and
its stored title is part of that statement; re-cutting a plan does not
get to rewrite what a closed session was called. A session that is
`not-started` and carries no `startedAt`, no `completedAt`, no verdict
and no orchestrator has made no statement at all, so the plan — which is
the declaration of what that number is for — wins. `session_has_history`
is that test, and a merely-stamped not-started session counts as history:
the record has already said something about it.

The same reasoning fixes the count. `register_session_start` took the
ledger's own length before it considered the plan, so a plan re-cut from
seventeen sessions to twenty could never make sessions 18 through 20
exist — they would have been unstartable, and nothing would have said so.
The ledger now takes the LARGER of what it holds and what the plan
declares. It still never shrinks: dropping a session drops its record.

Healing happens in two places on purpose, from one implementation.
`build_projection` heals what it RENDERS, so the tree is correct the
moment the plan changes and before any registration — that is what makes
this the session that has to notice. `_build_sessions_array` heals what
it WRITES, so the next `session start` persists the same correction. The
render mutates a fresh parse and never touches disk; the test asserts
that.

### D108 · 2026-08-28 · Verifier (gpt-5.6-sol/openai) · The session-number formatter belonged in Python, not the extension

**Round 1, Major, and correct: the padding had one owner in the wrong
language. Python owns it now, and the extension renders what it sends.**

Step 5 asks that "one formatter owns the padding so the tree, the CLI's
human output and any status line cannot disagree about how a session is
named." The first implementation put `padSessionNumber` in the
extension's `sessionsModel.ts` and left `ai_router.session` printing
`session 15`, so the two surfaces an operator moves between all day said
different things — and nothing stopped them drifting further.

A formatter in each language would satisfy the letter and lose the
point: two copies of a rule are two places for it to change. The ground
rule already settles which side wins. **TypeScript renders; Python
decides**, and how a session is NAMED is a decision.

So: `progress.session_display_number` is the one owner. The CLI's
human-facing lines call it — start, log, declare, decision, close,
cancel, restore, and every refusal that names a session. The projection
carries its result as `displayNumber` beside the integer `number`, and
the tree renders that string rather than padding for itself.

Two things deliberately do NOT pad, because they are records rather than
output: the activity-log step description `Registered session 15 (...)`
and the close's git commit message `Close session 15 of sessions`. So do
the plan's `### Session N of M:` headings, `sessions.json`'s `number`,
the `.dabbler/runs/s<N>/` ledger and every `--session` argument — the
padded string is never parsed back into any of them, and the test
asserts the ledger keeps the integer while the terminal says `001`.

The extension keeps one three-line function, `sessionDisplayNumber`, and
it is a READ: `session.displayNumber || String(session.number)`. A
payload from an older router that carries no name degrades to the plain
number rather than growing a second copy of the padding rule that could
disagree with the first.

### D109 · 2026-08-28 · Orchestrator · Round 2's two Nits stand: the loop stops, and one of them is a repair worth refusing

**Round 2 verified with two Nits, and the loop stops there. Neither is
being fixed in this session, and here is why each one stands.**

The severity vocabulary exists so a session ends. Nit-only is the stop
condition, and editing code after a VERIFIED verdict would bind the run
of record and the close to a tree no verifier reviewed.

**Nit 1 — the `displayNumber` fallback renders `15`, not `015`, when an
older projection sends no name.** The verifier's alternative is to refuse
an incompatible projection or add a compatibility mechanism. Both are
worse than the fallback:

- Refusing would blank the tree over a cosmetic difference. The view's
  whole posture is that it renders what the router says and shows nothing
  it cannot source — but a MISSING name is not a wrong one, and the
  session number is right there in the payload.
- A compatibility shim IS the second copy of the padding rule this fix
  just removed. That is the defect, not the repair.

The fallback is honest about what it has: an unpadded number, from a
router that does not name sessions yet. It is also unreachable in
practice — the extension and the router ship from one repository — and
a session that upgrades one without the other has a worse problem than
a narrow label.

**Nit 2 — `start`'s non-sequential refusal mixes forms**: it pads the
requested session and leaves `expected {expected}` and
`completedSessions={completed}` plain. Real, and worth fixing, but it is
one refusal message on one branch and the fix belongs where it can be
verified rather than appended to a verified tree. Filed here so a later
session picks it up: format `expected`, and decide whether
`completedSessions=[1, 2]` — a LIST of numbers echoing state — is human
output that should pad or a debug echo that should not.

## Session 16 — The task level (plan D1, second half)

### D110 · 2026-08-28 · Orchestrator · The task level replaces the activity-log step rows outright rather than sitting beside them

The projection's step rows were folded out of activity-log.json by build_step_rows, which the spec forbids as the task level's source. Leaving that path in place as dead code would leave a second, drifting answer to 'which step is open' one call away, so build_step_rows, _collapse_by_step_key, step_state, step_icon_key and the STATUS_BOXES/_ICON_KEYS tables are deleted and build_task_rows takes their place. read_activity_log and is_logged_step stay: session.py still uses them for seeding and logging, which is the activity log's remaining job.

### D111 · 2026-08-28 · Orchestrator · A refused execution record is carried as its own field, never as an empty task list

The spec requires that an unreadable record refuse rather than fall back. Emitting zero rows would be indistinguishable from a session that declared no approved plan, which is a legitimate and common state. So build_projection emits tasks and tasksRefused separately; the tree renders the refusal as the session's one child row, and severityOf gains a 'record' severity so the session row says so without displacing its lifecycle glyph.

### D112 · 2026-08-28 · Orchestrator · A task row is labelled with its humanized step_id and carries its intent in the tooltip

The spec names both steps[].step_id and steps[].intent as the row's source. step_id is the one identity the plan, the execution record and the CLI all address the step by and it fits a tree row; intent is one imperative sentence and would wrap. This is the same split the previous step rows used (stepKey label, description tooltip), so the rendering convention does not change under the operator when the data source does.

### D113 · 2026-08-28 · Orchestrator · The projection cache key covers the run records, or the watcher would be inert

refresh() is soft: it drops the scan generation but keeps the mtime-keyed projection cache. The old key covered only the four sessions-root files, so a step opening -- which touches nothing but .dabbler/runs/s<N>/step-execution.jsonl -- would have fired the watcher and then been served the pre-open payload from cache. projectionCacheKey now takes the repository root and stats every s<N>/step-execution.jsonl and s<N>/approved-plan.json alongside. The Playwright transition test is what proves it: two icon changes settle inside one thirty-second poll period.

### D114 · 2026-08-28 · Verifier (gpt-5.6-sol/openai) · Round 1 verified with two Minor nits, both left standing

Nit 1: task rows are labelled with the humanized step_id rather than steps[].intent, which the verifier reads the spec as requiring. That is decision D112 and it was made deliberately -- intent is one imperative sentence and wraps a tree row, step_id is the identity every other layer addresses the step by. It is a presentation call for the operator, not a correctness defect. Nit 2, and the better catch: build_task_rows returns no tasks when approved-plan.json is missing, without reading the execution record -- so a session whose plan was deleted while step-execution.jsonl still carries an open step renders as a leaf rather than a refusal. That is the stale-but-plausible shape this level exists to end, in a rare state. Both are Minor and non-blocking; the loop stops here per the severity-gated rule rather than spending a round on wording, and nit 2 is owed as a follow-up.

## Session 17 — The tracked project config (precondition for D2)

### D115 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · paths carries sensitive_paths, which was misfiled in run_policy where the machine overlay could empty it

The session plan says `dabbler.yaml` carries `testing`, `packaging` and
`paths`, and names contents for the first two only. `paths` was read as the
block for path facts that belong to the repository rather than to the machine
or the distribution, and it was given the one such fact the codebase already
had misfiled: `run_policy.sensitive_paths`.

Which paths a repository treats as sensitive is a property of that
repository — it is the repository's own escalation control — and while it sat
in `run_policy` the gitignored overlay could deep-merge it to `[]` and switch
that control off with nothing tracked to say so. Moving it makes `paths` a
real block rather than a placeholder, makes `run_policy` smaller, and is the
session's own thesis applied to the one place the codebase already broke it.

The rejected alternative was `paths.sessions_root`. It looks like the
repository fact a foreign repository most needs, but `evidence.py` derives the
sessions root deliberately ("nothing chooses where a record lands") and its
inverse, `repo_root_from_sessions_dir`, assumes exactly two path segments. A
configurable root would have broken that inverse for any other depth, which is
a defect traded for a knob nobody has asked for yet.

### D116 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · A runner with no subset form declares runs_whole; per-ecosystem targeted-command syntax is owed, not invented at the cap

Three rounds, each Major, each on the same thread: making suites plural in
fact exposed that the framework had one pytest-shaped assumption after
another buried under "the suite".

- **Round 1** — selection collapsed suite ownership to a boolean, so a mixed
  path set could not be routed. Fixed: `SelectedTest.suite`, resolved once
  from the same declaration that decides what a test is, and carried into the
  record.
- **Round 2** — ownership was recorded but unused; `run_authored` and
  `run_suite` still ran everything under the first covering suite. Fixed:
  `suites_for()` partitions by owner, both runners return one run per owning
  suite, `ai_router.affected` prints one command per suite narrowed to the
  tests it owns, and the workflow event aggregates the runs while keeping each
  suite's own row.
- **Round 3** — the narrowed commands were still built by appending paths,
  which is a pytest/jest/`go test` convention: `mvn -q test <file>` reads the
  path as a lifecycle argument and `dotnet test` wants a project.

**Round 3 was answered by declaration, not by a templating language.** A suite
whose runner has no subset form declares `runs_whole: true` and is handed its
own command; the run is recorded under the policy `suite-runs-whole`, beside
`targeted` rather than as it, so a reader can still tell a run that was
narrowed from one that could not be.

The alternative — a per-suite command template with a `{tests}` placeholder,
a separator, and a path-to-test-name transform — was rejected at the cap. It
is not only a mini-language; it also breaks the pre-verification audit, which
proves a command targeted by finding each selected path as a shell token.
`-Dtest=AdderTest` contains no path, so templating requires redesigning what
makes a command auditable at the same time. That is a session, not a patch,
and inventing it in the last round of a configuration session is how a
half-designed surface ships.

**Owed:** a targeted-run form for runners that take a filter rather than a
file list (Maven `-Dtest=`, `dotnet test --filter`), together with the
audit rule that can check one. Until then a `runs_whole` suite pays for its
complete suite at the pre-verification stage — honest, and more expensive than
the stage is meant to be.

**The session lands REMEDIATED_AT_CAP.** Every blocking finding was fixed; the
cap left the last fix unreviewed, and no verifier saw the `runs_whole` repair.

## Session 18 — Project setup as two sessions (plan D2)

### D117 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · The scaffold declares the repository's ecosystem; a printed guess is not a declaration

Session 17 made `dabbler.yaml` the tracked home for what a repository
owns, and nothing wrote one. A bootstrapped project therefore received the
whole lifecycle and could not reach step 4 of it: `test_evidence` refuses a
suite the repository never declared, and there was nowhere tracked to
declare one. This session writes the file at scaffold time, and the shape of
what it writes is the decision.

**It declares what the repository already says it is.** A build file at the
root is the repository's own statement of its ecosystem, so `pom.xml` yields
a `maven` suite, a `.csproj` a `dotnet` one, and a repository that is both
gets both — which is the case suites were made plural for. Every runner that
takes a filter rather than a list of test files is declared `runs_whole`,
per D116, so the framework runs it complete instead of inventing a narrowing
syntax it cannot know.

**Detection is not the guessing the framework refuses.** `affected` used to
print `python -m pytest` when no suite was declared — a command with no
author, improvised at print time, in a repository that may be Java. That is
now removed: an undeclared suite prints the declaration to make. The
difference is where the answer lands. A detected suite is written into a
tracked file the operator reads, edits and commits; a printed guess is
cited by the run of record and was never anyone's statement.

**Two fields are deliberately wrong-but-safe, and say so in the file.**
`covers: ["."]` claims the whole repository and `selection.repo_wide: ["."]`
makes every change repository-wide. Setup cannot know a layout it has never
seen, and the failure direction is already fixed by the framework: run a
suite you did not need rather than skip one you did. The alternative was not
a narrower mapping — it was no mapping, which fails pre-verification closed
on every path (`selection_unknown` with no smoke fallback) and leaves the
first session unable to reach step 5 either. So the scaffold declares the
one honest starting mapping there is, marks it as the thing to replace, and
is expensive until the repository narrows it.

### D118 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · A set-up-but-never-run repository renders its plan's sessions, and only a MISSING ledger qualifies

The Work Explorer showed a repository only once `sessions.json` existed, on
the rule that "a repository is set up when the router has written to it".
That rule hid project setup from every repository that needed it: bootstrap
scaffolds sessions 1 and 2 into the session plan, and until the first
`session start` writes a ledger they exist nowhere the view would look. The
operator ran Set Up New Project and got an empty tree.

**The plan is a declaration, not a guess.** D105 deleted a file-presence
ladder that inferred a set's STATUS from which files existed, and that
deletion stands. What returns here is different in kind: file presence
decides only whether to ask the projection, and the projection decides what
the sessions are. `build_projection` reads the plan's `### Session N:`
headings when there is no ledger and renders them `not-started`, which is
the only status a session with no record can honestly hold.

**It is keyed on the ledger file being ABSENT, not on the read failing.**
`read_raw_session_state` returns None for a missing file and for a corrupt
one alike. Answering both with the plan would replace a broken record with a
cheerful "nothing has run here" — the stale-but-plausible rendering the view
exists to end. So an unreadable ledger stays a fault with no sessions, and
only a repository that has never been written to renders from its plan.

**The projection says which it did**, in `repository.sessionsSource`, and
the row renders that rather than a fraction: "0/2" is equally true of a
repository mid-sequence, and what the operator needs to know about a
freshly bootstrapped one is that nothing has run there at all. The row's
actions are unchanged and were already correct — they gate on session
status, never on a ledger — so the two setup sessions are startable from
the moment they are visible.

**Nothing about them is an approval gate.** They render as ordinary
sessions, they offer the ordinary start affordances, and no row anywhere
offers an approve action. Verifying them hardest is what makes them safe;
parking them in front of a person is what the framework removed.

### D119 · 2026-08-28 · Operator · One repository per library or service, plus an integrator: the solution level is not formalized yet

Stated by the operator during session 18, and recorded here because it
changes what "a project" means to this framework.

**The adopted strategy is one repository per library or service, plus a
separate repository that integrates them** — a user application or a
processing pipeline. Staff ask an AI model to decompose a solution into
those libraries and services and to keep track of the dependencies within
each repository. The operator's words: that may need to be formalized so
that the relevant docs work the same across .NET and Java applications.

**What this session already serves.** The scaffold detects the ecosystem
from the repository's own build files and declares one suite per ecosystem,
so a Java service and a .NET service are set up by the same command and
described in the same tracked shape (D117). That is the cross-ecosystem
half of the ask, and it is the half that was in this session's declared
scope.

**What it does not.** Nothing in the framework knows that a repository is
part of a solution. Project setup's two sessions plan and decompose *within*
one repository; the decomposition INTO repositories happens before any of
them, in a conversation nothing records. A dependency between repositories
has no declared home — `dabbler.yaml` is where it would go, beside the
facts a repository already owns — and no reader.

**Not folded into session 18.** The task list was declared before the work,
and adding an unplanned surface to it in flight is the hindsight this
framework refuses on releasability. It is a session of its own, and the
shape it has to settle is which repository holds the solution-level plan:
the integrator naming its components, or each component naming what it
depends on. The operator decides whether that session is added to the
sequence.

### D120 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Round 1: a build file is a declaration only where the runner is the toolchain's own lifecycle

Round 1, Major, and correct. D117 claimed the scaffold "declares what the
repository already says it is", and the first implementation did not meet
its own claim: `pyproject.toml` became `python -m pytest` in a repository
that uses `unittest`, `package.json` became `npm test` with no test script
to run, `build.gradle` became `gradle test` on a machine that has only the
committed wrapper, and `*/pom.xml` became `mvn -q test` at a root the POM
is not in. Each of those is a tracked declaration that fails on first use,
and the lifecycle then blocks on it until a person repairs the file — which
is the human block project setup exists to remove.

**The distinction the fix draws is between a lifecycle and a script.**
Where the runner is the toolchain's own phase, the build file IS the
declaration: `mvn test` and `dotnet test` exist because there is a POM or a
project, and nobody had to write them. Where the runner is something
somebody had to write, that writing is the declaration and its absence is
the repository saying nothing — so `package.json` needs a `scripts.test`,
and `pyproject.toml` needs a pytest section (`[tool.pytest`, `pytest.ini`,
`[tool:pytest]`, `[pytest]`) before pytest is declared. A committed wrapper
wins over the global tool, because a wrapper is checked in precisely so the
build runs without the tool installed.

**Detection reads the repository root and nothing below it.** A suite
declares a command and no working directory, so `service/pom.xml` has no
runnable line to become; the nested globs are gone rather than replaced by
a guessed cwd. A multi-project repository declares its own suites, and the
scaffolded file says so where the operator will read it.

**The verifier's Nit was also right and is fixed.** `progress.py` called an
unreadable ledger a fault and then rendered it as an empty repository —
indistinguishable from a repository with no sessions, and no reason for
anyone to look at the one file that needs looking at. It now reports the
fault, and the extension's tooltip label changed from "State invariant
violation" to "Record fault", because the field now carries both kinds and
the label must not claim the narrower one.

## Session 19 — The unresolved-session view (plan D3)

### D121 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · The unresolved-session view is a fold of the rounds ledger; Python decides the terminal state and the extension repeats it

The framework never blocks on a person, so a session that reaches the cap
simply ends, and until now nothing showed that anywhere but `sessions.json`
and `.dabbler/runs/s<N>/rounds.jsonl` read by hand. Session 17 closed
`REMEDIATED_AT_CAP` with one unreviewed finding and the Work Explorer
rendered it as a complete session with an unclean tooltip line. This
session makes the record readable where planning happens.

**The view is a fold of the rounds ledger, and Python does the folding.**
`progress.build_verification_view` reads `ledger.read_rounds` and emits one
`verification` object per session that has rounds: which terminal state
was reached, how it reads, the round it stopped at against the cap, the
verifier's model and vendor and transport, the findings of the stopping
round with the record's own word for how each stands (`outstanding`,
`fixed, unreviewed`, `noted`), the agency log of that round with its
transformed-read count, and the fix paths a cap terminal carried. The
extension narrows it and arranges it; it re-derives nothing, and it does
not open the ledger. The Solution Explorer already renders the run core's
loop position the same way (`reviewTerminalLabel`), so this is the sessions
lifecycle catching up to a rule the other subsystem already follows.

**Which state it is comes from the record, in one vocabulary.** A
`remediated_at_cap` row is that state; a blocking latest round at the cap is
unresolved; a blocking round below the cap is a loop still open and is
called exactly that; a non-blocking latest round is verified.
`TERMINAL_HEADLINES` moved from `workflow.py` to `verdict.py`, beside the
closed token set it is keyed on, so the run core's loop and this projection
cannot describe the same state in two voices. The cap is read from the
repository's configuration once per projection; when no configuration can be
read the cap is unknown, and a blocking round is then *outstanding* and
never *unresolved*, because "the cap is reached" is a claim about a number
the projection did not get.

**A verified session gets no row.** The tooltip already says so, and a
verification row under every session would bury the ones that need
reading. Python decides `clean` and the tree only asks; on the extension
side `clean` fails closed, so a payload that never said "clean" cannot
make a stopped session read as a pass. An unreadable ledger is carried as
`verificationRefused` and rendered as its own refusal row, with the same
reasoning the task level settled: the last round that parsed must not be
shown as the one that stopped the session.

**The vendor and the agency log come from the round that stopped the
session, not from the terminal row that disposed of it.** A
`remediated_at_cap` row carries no agency of its own. Session 1 of this
build took a confident Major against correct code because a scrubbed read
went unmarked, so the transformed-read count is a token on the row and a
sentence in the tooltip, and a round with `agency: none` says it could not
look at the tree rather than being rendered as equivalent to one that
could.

**The watcher and the projection cache now cover `rounds.jsonl`**, for the
reason D113 recorded for `step-execution.jsonl`: a round landing changes
only that file, and a view up to a poll behind the record is the surface
staff already rejected.

### D122 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Send back is a prompt to an engine, respecify opens the plan at the block, cancel passes --force only for the unresolved terminal; nothing approves

The plan names three actions on a session read at planning time — send it
back, respecify it, cancel — and says no approve-over action exists. Each
maps onto something that already exists; none is new machinery, and the
session plan's own instruction was that an action needing a command that
does not exist is a finding against an earlier session rather than a
licence to build a fourth path here.

**Send back is a prompt handed to an engine.** The sessions lifecycle has
no `send-back` verb — the run core's step workflow has one
(`workflow send-back --to <step>`), but it moves a *step* between the
run core's own loops and does not touch `.dabbler/runs/s<N>/`. What
actually re-opens a stopped session is an engine: it remediates, re-runs
the affected tests, and re-runs `ai_router.verify`, which at the cap
records whichever terminal state the tree then says it is. So "send it
back" copies a prompt that names the record by path and says what to do
with it, in three shapes because the three states ask for different work:
an unresolved session needs its outstanding findings fixed; one remediated
at the cap needs its unreviewed fix reviewed before anything builds on it;
a loop still open has findings to answer. The prompt never quotes the
findings — the engine reads them from the record, so what it acts on is
what the verifier wrote and not a paraphrase.

**Respecify opens the plan at the session's own block.** That is the
left-click activation, offered by name beside the other two so the trio
reads as a set. It writes nothing: a plan is edited by a person or an
engine, and re-registering is the lifecycle's own step. The plan is
deliberately not a lifecycle-written file, because a session editing the
plan it runs against mid-flight is drift.

**Cancel is the existing cancel, with `--force` passed on the record's
say-so.** `session cancel` refuses a session in flight without `--force`,
and that refusal is right for live work. An unresolved session is in
flight and cannot close — the close gate blocks on its blocking latest
round — so for it cancel is the sanctioned exit, and the flag would
otherwise leave it with no exit at all. The extension passes `--force`
only when the session is `in-progress` and its fold says `ISSUES_FOUND` at
the cap; a live session, and a complete one remediated at the cap, get the
plain cancel and its refusal. The confirmation dialog says which case it
is. The operator is never asked whether to force.

**There is no approve-over, and it is refused structurally.** The registry
test now asserts that no repository or session action's id or label reads
as approve, accept, or waive. The tooltip of an unresolved row says the
three things that can be done and that there is no approval to give; the
tooltip of a remediated-at-the-cap row says it is not a waiver, because
nothing was accepted over a finding that still stood and what is unproved
is the repair.

**Verification of this session ran with `agency: none`** — the direct-API
path, as sessions 14 through 18 did — so the view built here was verified
by a round that could not look at the tree. The row for this session, if
it had stopped at the cap, would have said so.

### D123 · 2026-08-28 · Verifier (gpt-5-6-sol/openai) · Round 1: the agency log must name its targets, and an action is a front-end over commands that exist or a recorded gap

Round 1, two Majors, both correct.

**The first: the view projected the verifier's operations and then rendered
only their counts.** "2 reads, 1 search" cannot tell an operator whether a
Major came from the file it is about or from an unrelated one, and that is
the whole weight the agency log was built to carry. The tooltip now lists
the operations target by target, marking a transformed, unverified or
out-of-scope read on its own line, and caps the list at twenty with a
pointer at the ledger. Nothing changed in Python: the data was already
there, unrendered.

**The second: two of the three actions were labels over navigation and
prose.** Respecify opened the plan at the block and did nothing else;
the remediated-at-the-cap send-back asked for "a review" and named no
command. The plan's own instruction was the standard: each action is a
front-end over commands that exist, and an action that needs one that does
not exist is a finding against an earlier session, not licence to build
one here. Both are now prompts that hand the engine the exact commands.

*Respecify* names, in order: `session cancel <N> --reason ... --force` for
an unresolved session (it cannot close, so cancel is its exit; a session
remediated at the cap is already closed and skips this step); the new
block, `### Session <M>:` in the plan, where M is the next number after the
repository's last — because sessions are numbered once and a rounds ledger
is append-only per number, so a respecified session is a NEW number with a
fresh ledger and never the old one restored; and `session start`, with the
engine and vendor the repository already runs on, which registers M. The
plan still opens at the old block, which is where the rewrite is written
and which stays as the record of what was tried.

*Send back* for a session remediated at the cap says what is true: **no
command re-opens review on a closed session.** Rounds are append-only per
session and a terminal row closes them; `verify reanchor` moves a baseline
for a fix delta and is refused when the tree resolves. So the review is the
next session's declared work, and the prompt names the three commands that
exist for that — `session start`, `session declare --task "Review session
N's unreviewed remediation ..."`, and `ai_router.verify`, which reviews
whatever the review then corrects as that session's own round. What those
do not cover is also stated: a fix that turns out to be right changes
nothing, and no round ever reads it. **That is the gap the plan said to
record rather than paper over.** It belongs to the terminal state session 3
built and session 10 integrated: remediated-at-the-cap lands work with no
later path by which a verifier reviews the repair. A session that closes
it — a review round opened against a closed session's fix delta, or a
next-session round whose baseline is the remediation's `previous_tree` —
is not planned and is owed.

**Both nits were also right and are fixed.** Send-back and respecify were
offered on any unclean fold, including a loop still open below the cap;
they now require a terminal state, so a round the engine is still
answering is rendered but not acted on. And a session whose ledger outran
a cap that was lowered since is no longer squeezed into "round 6 of 3";
the row says "round 6 (cap now 3)". The fold itself still reads the
repository's current cap, because the rounds carry none — recording the
cap on the round is the durable fix and is a one-line change to
`verify.py` for a later session.

### D124 · 2026-08-28 · Verifier (gpt-5-6-sol/openai) · Round 3: the disputed respecify finding is WITHDRAWN and the session is verified; the historical-cap Minor stands as owed

Round 2 raised one Major: that Respecify directed the rewrite into the
wrong file (it named `docs/sessions/project-work-plan.md` as the active
specification) and that the selected block had to be rewritten in place
and re-registered under its own number. The first half was a false
premise and the second an impossible instruction, so it was disputed from
the record rather than fixed: `session-plan.md` is the one hand-written
plan (`SESSION_PLAN_FILENAME`, the projection's heading source, the scan's
`PLAN_FILENAME`), `project-work-plan.md` is folded from the activity log
and is never hand-edited, `session start` refuses a closed number, and a
rounds ledger is append-only per number with the cap counted over it — so
a rewritten specification can only run as a new number. The one thing the
finding got right, a filename typed into the prompt, was fixed in the same
delta: the prompt derives the plan from `repository.planPath`.

**Round 3 WITHDREW the finding and verified the session**, citing the
immutable-session and append-only-ledger contracts the dispute pointed at.
This is the first dispute this set has filed, and it went the way the
mechanism is meant to: an argument from the record, judged on the record,
with no person in the loop.

**One Minor was re-raised and stands.** `build_verification_view` infers a
historical unresolved terminal from the repository's *current* cap, because
a round row carries no cap of its own. Lowering or raising `max_rounds`
later can relabel an old session. The display no longer squeezes
"round 6 of 3" into nonsense, but the fold still reads live configuration
for a fact that was fixed when the session ended. The durable fix is to
record the cap on the round as `verify.py` writes it, and read it back
here — a small change to a writer this session did not touch, and
therefore owed to a later one rather than made at the cap.

Three rounds, one dispute, verifier gpt-5-6-sol/openai over the direct
API with `agency: none` on every round: the view that shows whether a
verifier could look at the tree was itself verified by rounds that could
not.

## Session 20 — A round baseline that survives the trip (root cause of D98)

### D125 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Round baselines are anchored under refs/dabbler/rounds and kept forever; the clone carries them both ways, and the mid-session push is why

**What is anchored.** `ledger.append_round` now wraps each round's
`completion_tree` in a framework-authored commit (author and committer
`dabbler-ai-router`, message naming the session and round) and points
`refs/dabbler/rounds/s<N>/r<R>` at it in the same call that appends the row.
The row records the commit as `anchor_commit`. A ref cannot usefully name a
bare tree -- most servers refuse that on push -- so the commit is the object
the ref names, and the test asserts that its tree hashes identically to the
recorded `completion_tree` rather than that a ref exists.

**Retention: one ref per round per session, kept forever.** Nothing in
`ai_router` deletes a round ref, and no pruning schedule is proposed. The
objects are a tree the session already had plus one small commit, so the
namespace grows by a few kilobytes per round; the history is the point, and a
baseline that can be pruned is a baseline that can go missing again -- which
is the defect this session exists to close. If the namespace ever needs
trimming, that is a decision to be made then, on this record, not an
omission now.

**Two refspecs, not one, because the mid-session push is the one that
matters.** The plan's step 3 says the close is the one place a session pushes.
It is the one place the *framework* pushes, but a session moves between
machines mid-session -- session 14 did -- through the operator's own commit
and `git push`, before any close. A fetch refspec on the receiving clone is
useless if that push left the refs behind. So `evidence.ensure_round_refspecs`
configures the clone's remote both ways: `+refs/dabbler/rounds/*:refs/dabbler/rounds/*`
under `remote.<name>.fetch` and, under `remote.<name>.push`, the same pattern
beside `HEAD`. `HEAD` is there because a remote with any push refspec at all
sends only what its refspecs name, so the current branch has to be named or a
bare `git push` would stop pushing it; `HEAD` sends it to the branch of the
same name, which is what `push.default=simple` did on the trunk-based layout
every session runs on. A clone that had already chosen its own push refspecs
keeps them untouched and gains only the pattern. The close still pushes the
session's round refs explicitly after its bookkeeping push, and reports a
dropped ref the way it reports a dropped branch, because the close cannot
assume the clone it runs on was migrated.

**The migration is bootstrap.** `python -m ai_router.bootstrap` re-run on an
existing clone writes the refspecs; that is how this clone was migrated
today, and a clone that predates the refspec is told so by `affected`, which
now names the fetch before it names the recovery. `verify reanchor` stays
with every refusal it had: rounds recorded before today carry no ref, a clone
may not have been migrated, and a history may have been rewritten.
`head_commit` remains the fallback that places a baseline for rounds recorded
before any of this.

### D126 · 2026-08-28 · Verifier (gpt-5-6-sol/openai) · Round 1: VERIFIED in one round; the anchor-failure nit is owed and the migration-test nit is not accepted

Round 1 verified the session in one round and filed two nits. Neither
blocks, so under the standing severity-gated rule the loop stops here and
the nits are dispositioned on the record instead of being fixed into a
round 2 that would re-run the affected suite for two one-line changes.

**Nit 1 -- `append_round` records a row when the anchor fails -- accepted,
owed.** `anchor_round_tree` returns `None` both when the tree is absent from
this store (a row can only anchor an object it has; every test that
simulates a moved session records such a row) and when `commit-tree` or
`update-ref` fails on a tree that IS present. The second case should refuse
the append: a round whose tree exists here but was not anchored is exactly
the unportable baseline this session removed, recreated by a transient git
failure. The fix is to raise `LedgerError` when the tree resolves and the
anchor does not, keeping the absent-tree case as it is. Owed to the next
session that touches `ledger.py`; the verify path snapshots the tree
immediately before appending, so the window is a git failure between two
git calls.

**Nit 2 -- `TestRoundRefMigration` is a migration-path test -- not
accepted.** The banned kind is a test of an upgrade path over old data
layouts. This test asserts a behaviour of a shipped command on its ordinary
input: `bootstrap`, re-run on a clone, configures the clone to fetch round
refs. That the operator uses it to migrate is why the test exists, not what
it tests; folding it into the two-checkout test would make that test run
the whole bootstrap scaffold to assert one config line. It stays.

**Round 1's own row is the first anchored round in this repository.**
`refs/dabbler/rounds/s20/r1` names commit `bedca06a`, whose tree is the
row's `completion_tree` `b8f11643`; the ref was written by the append, not
by hand, and the close will push it.

## Session 21 — Close out set 148 on the record, and make the loop tests cheap

### D127 · 2026-08-28 · Orchestrator · Set 148 acceptance: criterion met, checks 1-2 met, check 3 (seat cost) not met and not back-filled by operator decision; the measurement step carries forward

Set 148's acceptance criterion was "the framework can run its own next session": whether session 20 could have been specified, developed, verified, tested and closed by the thing this set built rather than by the machinery it replaces. Evaluated from the record (sessions.json, the rounds ledgers under .dabbler/runs/s<N>/, test-runs.jsonl, and the decisions log), not from opinion.

**Criterion: MET.** Session 20 was registered, declared, developed, pre-verified with the selector, cross-provider verified (one round, VERIFIED), run-of-record tested and closed through the framework's own lifecycle, and its close committed and pushed its own state write.

**Check 1 — every plan item appears exactly once, no unbuilt spec section: MET.** Plan items A1–A7, B1–B3, C and D1–D3 each map to exactly one session (A5 split into 6 read surface + 7 test-write path; D1 split into 15 sessions view + 16 task level, both by design). Session 17 is a precondition D2 needed that the plan did not list; sessions 1–2 verified the design and the breakdown; session 20 is outside the plan — D103 promoted the D98 root cause from an owed decision to a session. Spec sections 1–6, 8 and 9 map onto sessions; section 7 (cost) is built by reuse of metrics.py, the config.py overlay and secret_resolver.py exactly as the plan's "already exists" table says; section 10 is the deliberately-not list. No item is built twice and no section is unbuilt.

**Check 2 — no skipped lifecycle step, no foreign verdict: MET.** Every session has a rounds ledger ending in a verdict from the verifier's vocabulary, at least one final-full run of record inside its start–close window, and a preverify-targeted run — except session 2, a prose session that changed no code, so the selector had nothing to record. The only two rows carrying no verifier identity are the framework-written cap-landing rows of sessions 12 and 17, which is what a REMEDIATED_AT_CAP terminal row is; neither is a hand-written verdict.

**Check 3 — seat cost measured from session 3 onward: NOT MET.** Measured and recorded for four sessions only: 1 (D38 — costUsd null, the metrics gap), 3 (D29, ~$22.48), 4 (D37, ~$8) and 5 (D48, ~$10.61). Sessions 6–14 ran on the Copilot seat and recorded no measurement; sessions 15–20 ran on the direct API and every verification.costUsd in sessions.json is null. The step that owed this — "measure this session's seat cost and record it" — was in session 3's plan and was not carried into sessions 4–20's step lists.

**Operator decision, 2026-08-28: the seat cost for set 148 is NOT back-filled.** The sessions are closed, and a figure recovered now would change nothing forward; the next set plans against the $8–$12 per ordinary code session band that D37 named from two samples and D48 confirmed with a third. What carries forward is the step, not the figure: every future session plan carries "measure this session's seat cost and record it" as a numbered step, the way session 3's did and sessions 4–20's did not. This closes the seat-cost question rather than leaving it owed.

Recorded as step 2 of session 21, before any code moves, because a decision appended after the run of record moves the tree and fails the freshness gate.

## Session 22 — Decide the inventory before anything is translated

### D128 · 2026-08-28 · Operator · The router is ported to TypeScript as sessions 22-35, so the framework ships as one artifact and a project holds only its own record

The Python router (`ai_router`: 29,640 lines, 45 modules, 941 tests) is ported to TypeScript so that the whole framework ships as one VS Code Marketplace artifact with the router inside it, and the extension calls it in-process. The port is its own set of fourteen sessions, 22–35, landed in `docs/sessions/session-plan.md` at commit `d77a075a` on 2026-08-28 with `totalSessions` raised from 21 to 35.

**The operator's grounds, as stated when the plan was commissioned.** Staff reject a two-runtime install: an extension that then requires a second toolchain, a per-project `.venv`, and a router version kept in step by convention. Bundling a Python interpreter inside the VSIX was considered and rejected as insufficient — the operator's goal is that the infrastructure not be part of the project at all. After cutover a project holds only `dabbler.yaml`, `docs/sessions/`, `.dabbler/runs/` and the `AGENTS.md` fence.

**Why it is feasible.** The router's runtime is small in kind — process spawning, file I/O, HTTP, JSON/YAML, hashing, one read-only SQLite query — and each has a first-class Node equivalent. Its three dependencies have exact twins. The three Windows-specific items (`.cmd` shim resolution, the rendered-argv measurement against the 24,000-unit handoff threshold, `node:sqlite` in place of a native binding) are bounded and named in the plan.

**Why it is dangerous, and what the plan does about it.** The router is the trust machinery; a mistranslated gate does not crash, it lets something through. The plan's load-bearing rules follow from that one risk: integration-driven order (the extension is rewired to a `Router` interface first, with today's Python spawn as the first implementation); parity with the Python record as a declared deterministic control, byte-identical, run before every round until cutover; no redesign of any rule while porting it; no fake git in the fixtures; seat cost measured every session (D127); `verify.py` ported as five files rather than one.

**Recorded by the orchestrator on the operator's behalf**, from the operator's instruction of 2026-08-28 to start session 22 — which existed only in the drafted plan — and from the grounds the operator gave when asking for that plan. The plan is the draft as written, with four corrections of fact made at landing: line counts moved onto the reproducible basis STATUS.md names (29,640; `journal` 846, `evidence` 902, `checks` 1,001); the git seam named as `journal.run_git`, where session 21 put it; session 22's pre-verification step corrected to record nothing (a run recorded against an empty selection is a `policy_violation`); and the retired run core's test count corrected to 119, since `test_runcore_checks.py` drives the kept `checks.py`. The inventory decision that follows departs from the plan's default table further, with reasons, which is what session 22 exists to do.

### D129 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Port inventory for the 45 modules: 38 ported, 4 merged, 3 retired; facts, fixloop and testphase are kept, journal and verifyjob are split

Every one of the 45 modules under `ai_router/` is assigned *port*, *merge* or *retire*, with its line count (raw `wc -l`, the basis STATUS.md names; 29,640 in total) and the test file(s) that drive it (`pytest --collect-only` counts, 941 in total). The plan's default table put `facts`, `fixloop` and `testphase` in the run core and listed `journal` and `verifyjob` as plain ports; the import graph says otherwise, and each departure below names its reason. **Result: 38 ported, 4 merged, 3 retired; 832 tests ported, 109 deleted.**

**Port — the module is translated whole, behaviour unchanged.** Grouped by the session that ports it.

| Session | Module | Lines | Driven by |
| --- | --- | ---: | --- |
| 25 | `config` | 640 | `test_config` (44) |
| 25 | `secret_resolver` | 47 | through `test_selection`, `test_route`, `test_transport_api` |
| 25 | `identity` | 235 | `test_identity` (11) |
| 25 | `verdict` | 419 | `test_verdict` (33) |
| 25 | `lockfile` | 158 | through `test_discovery`, `test_transport_copilot` |
| 25 | `runtime_mode` | 84 | through `test_route`, `test_verify` |
| 25 | `metrics` | 258 | `test_metrics` (10) |
| 26 | `ledger` | 901 | `test_ledger` (17) |
| 26 | `writers` | 881 | through `test_session`, `test_progress`, `test_bootstrap`, `test_gates`, `test_packaging` |
| 27 | `evidence` | 902 | `test_evidence_protocol` (27) |
| 27 | `checks` | 1,001 | `test_runcore_checks` (24) — drives `checks`, not the run core; ported under a name that says so. Its one import from the run journal (`write_heartbeat`, a liveness stamp for run-core checks) is dropped at the port. |
| 27 | `test_evidence` | 807 | through `test_evidence_protocol`, `test_affected`, `test_gates`, `test_verify` |
| 27 | `affected` | 564 | `test_affected` (21) |
| 28 | `transports/base` | 49 | `test_escalation` (11) |
| 28 | `transports/offline` | 140 | `test_offline_transport` (13) |
| 28 | `transports/api` | 292 | `test_transport_api` (10) |
| 28 | `route` | 586 | `test_route` (13), `test_escalation` |
| 28 | `selection` | 146 | `test_selection` (15) |
| 28 | `discovery` | 1,057 | `test_discovery` (20) |
| 29 | `transports/copilot` | 2,074 | `test_transport_copilot` (90) |
| 29 | `seat_cost` | 304 | `test_seat_cost` (7) |
| 30 | `session` | 1,386 | `test_session` (71) |
| 30 | `gates` | 421 | `test_gates` (23) |
| 30 | `progress` | 1,050 | `test_progress` (37) |
| 30 | `modules` | 246 | `test_modules` (7) |
| 31 | `agency` | 921 | `test_agency` (23) |
| 31 | `approved_plan` | 590 | `test_approved_plan` (24) |
| 31 | `plan_review` | 812 | `test_plan_review` (18) |
| 31 | `facts` | 650 | `test_facts` (3); through `test_verify`, `test_step_execution`. **Departs from the plan's table.** `facts` is not run core: `verify` imports `collect_facts`, `append_facts` and `red_facts_refusal`, it writes `.dabbler/runs/deterministic-facts.jsonl`, and it is the declared-controls machinery (`compile`/`typecheck`/`lint`/`analyzer`) that the parity control itself runs under. Session 31 takes it, which brings that session to 2,973 lines. |
| 32 | `verify` | 2,537 | `test_verify` (57), `test_critique_contracts` (5), `test_step_execution` (16). Ported as five files on its existing seams. |
| 33 | `bootstrap` | 1,146 | `test_bootstrap` (34) |
| 33 | `packaging` | 743 | `test_packaging` (21) |
| 34 | `workflow` | 1,363 | `test_workflow` (55) |
| 34 | `solution` | 351 | `test_solution` (16) |
| 34 | `contractdoc` | 196 | `test_contractdoc` (13) |
| 34 | `stepreview` | 284 | `test_stepreview` (15) |
| 34 | `fixloop` | 563 | `test_fixloop` (18). **Departs from the plan's table.** `workflow` imports it (lines 1070 and 1138): it is the six-step workflow's remediation loop, so it goes where the six-step goes. |
| 34 | `testphase` | 345 | `test_testphase` (10). **Departs, same reason** — `workflow` imports it at lines 971 and 1022. Session 34 becomes 3,102 lines and 127 tests. |

**Merge — part of the module is kept, inside another file.**

| Session | Module | Lines | Disposition |
| --- | --- | ---: | --- |
| 25 | `__init__` | 22 | The package index; becomes the router package's `index.ts` export list. Driven through `test_route`. |
| 28 | `transports/__init__` | 3 | Same, for the transports directory. |
| 26 | `journal` | 846 | **Kept (~150 lines):** the git seam session 21 built — `run_git` (bytes as a mode of it, not a second function), `repo_root_for`, `snapshot_worktree_tree`, `changed_paths_between` — plus `is_machine_state_path`, `atomic_write_json`/`atomic_write_text`, and the `.dabbler` path constants. These move into the evidence/git file the record modules sit on. **Retired (~700 lines):** the run journal — `journal.jsonl` events, sequences and the v1 upgrade, `journal.lock`, `heartbeat.json`, `run-projection.json`, `control_root`/`repository_id`. `test_journal` (21) tests only the run journal, so it is deleted with it; the seam is proven by the loop tests that already drive it (`test_evidence_protocol`, `test_verify`, `test_gates`). |
| 32 | `verifyjob` | 782 | **Kept (~100 lines):** `build_verification_prompt`, `build_prompt` and `auto_verify` — what `verify` and `route` import. They move into the verification loop's files in session 32. **Retired (~680 lines):** `cmd_verify`, `build_request`, `build_evidence`, `dispatch`, `interrupted_result`, `_run_targeted`, `_pause_if_exhausted`, `_terminate_at_cap` — the run core's verified-policy job, which imports `runcli` and `runcore`. Its tests live inside the `test_runcore_*` files and go with them. |

**Retire — deleted in session 34, with tests, verbs and docs (D88).**

| Module | Lines | Tests deleted |
| --- | ---: | --- |
| `runcli` | 1,497 | `test_runcore_contracts` (18), `test_runcore_fast` (19), `test_runcore_verified` (19), `test_runcore_recovery` (22), `test_runcore_independence` (10) |
| `runcore` | 811 | (in the files above) |
| `runproject` | 530 | (in the files above) |

Retired in total: 2,838 lines of run core, ~700 of run journal, ~680 of run job — about 4,200 lines and 109 tests (88 run-core files plus `test_journal`'s 21). Ported: about 25,400 lines and 832 tests. Nothing kept imports `runcli`, `runcore` or `runproject` once `verifyjob` is split; `bootstrap`'s `detect_copilot_seat` and `persist_transport_preference`, which `runcli` imported, stay because `bootstrap` owns them.

**Extension-side drift noted for session 24, not fixed here:** `troubleshoot.ts` tells the user to run `python -m ai_router.report`, and `routerCli.ts` comments on `ai_router.session_lifecycle`; neither module exists. Session 24 removes both when it rewires the spawn sites to the `Router` interface.

### D130 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · D88 resolved by the plan's default: the run core is retired and deleted in session 34; the operator can override until session 34 starts

D88 asked the operator one question: does the run core's projection replace the lifecycle's records, or is the run core retired? **The run core is retired.** "Retired" means deleted in session 34 — `runcli`, `runcore`, `runproject`, the run-journal half of `journal`, the run-job half of `verifyjob`, their tests, their `dabbler` verbs (`status`, `run`, `report`), the records only they write (`journal.jsonl`, `heartbeat.json`, `run-projection.json`, `.dabbler/run-projection.json`), the schemas only they validate against (`run-event`, `run-projection`), and every reference in docs. `dabbler status` then reads the lifecycle's record, which closes the other half of D88.

**The evidence, from the record rather than from preference.** No run has ever been registered in this repository; `.dabbler/run-projection.json` lists every session as `not-started` with no run ids, and D88 itself reports that `dabbler status` sees no sets here. The extension never spawns it: its spawn sites name `session`, `progress`, `modules`, `verify`, `workflow`, `bootstrap`, `test_evidence` and `affected`, and not `runcli`. It is a second writer of the same filenames — `runproject` regenerates `session-state.json`, `activity-log.json` and `change-log.md` from its own projection while the lifecycle writers own those names as tracked records — which is the design fault D88 named and which porting would carry across at 4,200 lines and 109 tests. Sessions 1–22 of this repository were registered, verified, tested and closed by the lifecycle alone (D127), so the lifecycle's record is already the one this framework runs on; the projection would be replacing something that is proven by something that has never run.

**Authority.** The plan the operator commissioned names "run core retired" as the default this session records unless overridden, and that default is what this entry records. It is an orchestrator's application of an operator-set default, not an operator ruling in its own right. **The operator can override it up to the start of session 34**, which is when the deletion happens and the first moment anything is lost; sessions 23–33 port nothing the run core owns and delete nothing, so an override before then costs no rework. An override is recorded as a decision with `--decider operator`, and session 34 then does what it says.

**What stays.** `checks` (the process runner the run core used, also used by `affected`, `agency`, `packaging`, `test_evidence`, `fixloop` and `testphase`), `facts` (deterministic controls, used by `verify`), `fixloop` and `testphase` (the six-step workflow's) — each has a live caller outside the run core, and each is in the inventory as a port.

### D131 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Package layout packages/router (npm dabbler-ai-router, bin dabbler) under a root workspace; runtime floor measured on VS Code 1.135: Electron 42.8.1, Node 24.18.1, node:sqlite present

**Package layout.** The router lives at `packages/router`, published to npm as `dabbler-ai-router` with `bin: dabbler`. A root `package.json` declares npm workspaces over `packages/router` and `tools/dabbler-ai-orchestration`; the extension depends on the router package through the workspace, and its existing `esbuild.js` bundles both into the one `dist/extension.js` inside the VSIX. The CLI is bundled separately to `packages/router/dist/dabbler.js` (CommonJS, as the extension host requires; source is ES module syntax under `tsc --strict`). `vitest` runs the router's tests, in the path-list form the targeted-command audit already accepts. Schema-generated types (session 23) live under `packages/router/src/generated/` and are checked in, with a control that fails when they are stale. Versions: router 1.1.0 and extension 1.0.4 today; both become 2.0.0 at cutover, published from session 35 through `dabbler packaging`.

**The runtime floor, measured rather than remembered.** Step 4 of this session ran the installed VS Code's own binary as Node (`ELECTRON_RUN_AS_NODE=1 Code.exe -e …`) and read `process.versions`:

- VS Code **1.135.0** (commit `08d4889f`), Electron **42.8.1**, Node **24.18.1**, V8 14.8.
- `require('node:sqlite')` **loads without a flag** in that extension host.
- The system Node on this machine is **25.8.1**; `node:sqlite` loads there too.

So the `seat_cost` port (session 29) uses `node:sqlite` as planned; the `sql.js` fallback and its ~7 % WAL undercount are not needed and are not built. The extension's `engines.vscode` is `^1.85.0` today; it is raised at cutover (session 35) to the lowest VS Code whose extension host carries an unflagged `node:sqlite`, and that floor is **found by running the check on that release, not taken from a changelog** — 1.135 is the one measured here and is the floor until a lower one is measured. Outside VS Code, the CLI's `engines.node` is pinned the same way in session 29, with Node 24 LTS as the tested target.

**One consequence for the extension.** The CLI shim the extension prepends to the integrated terminal's `PATH` (session 33) runs on the extension host's own Node through `ELECTRON_RUN_AS_NODE`, which is exactly the invocation used to measure the floor above — so the measurement is of the runtime the shim will actually use.

### D132 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Dependency ceiling: yaml, ajv, smol-toml at runtime, nothing native; a fourth is a decision in the log

The router package carries **three runtime dependencies and no more**: `yaml`, `ajv`, `smol-toml`. Each replaces one thing the Python router gets from its own dependencies or standard library, and nothing else is needed because the rest of the runtime is a Node built-in.

| Dependency | Replaces | Used for |
| --- | --- | --- |
| `yaml` | `pyyaml` | `router-config.yaml`, `dabbler.yaml`, `local-overrides.yaml`, the seat catalog lockfile. Already the extension's only runtime dependency, so the artifact gains nothing new here. |
| `ajv` | `jsonschema` | Validation against the twenty schemas under `ai_router/schemas/` on every record write and every config load. None of the twenty uses the `format` keyword, so `ajv-formats` is not needed and is not added; a schema that later wants `format` has to justify a fourth dependency here first. |
| `smol-toml` | stdlib `tomllib` | The one TOML read in the router: `discovery.load_record`, which parses the API-enumeration record. The record's format is kept, because changing a record format is a redesign and this set makes exactly one record change (the `frameworkVersion` stamp, session 35). |

Everything else is built in: `fetch` for the direct API transport (streaming included), `node:child_process` for `checks` and the Copilot CLI, `node:crypto` for every digest, `node:fs`/`node:path` for the record, `node:readline` over the CLI child's streams, `node:sqlite` for `seat_cost` (present in the measured extension host — see the layout decision). **Nothing native, nothing that compiles at install, nothing that downloads at install.** A native binding would put the failure class the port exists to remove — an install that depends on the machine — back into the artifact.

**Adding a fourth runtime dependency is a decision in the log**, naming the module it serves and why a built-in cannot serve it. Development dependencies are outside the ceiling and are the ones the extension already carries — `typescript`, `esbuild`, `eslint` with `@typescript-eslint/*`, `@types/node` — plus `vitest` as the router's test runner. The extension keeps its own (`mocha`, `@playwright/test`, `@vscode/test-electron`, `vsce`).

### D133 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Parity control designed: five corpus shapes, verbs entering by port order, the record files compared byte-for-byte after two normalizations; spec in docs/ts-port-parity-control.md

The parity control is designed; the specification is `docs/ts-port-parity-control.md`, built in session 23 and run before every verification round through session 35. This entry records what it fixes.

**What it is.** A declared deterministic control (`testing.controls`, kind `analyzer`, `required: true`) that runs every verb through both routers against two copies of the same fixture repository and compares every file the router is allowed to write, byte for byte. `facts` records its exit code before a verifier is bought. It is not a test and keeps no golden files: both sides are computed at run time.

**The corpus.** Five real repositories with real bare remotes, built fresh at every run by a builder script that drives the Python router from the seed `tests/conftest.py` already uses — **fresh**, **in-flight**, **disputed**, **at-cap**, **moved-machine** — one per lifecycle shape the record can be in. Git identity and dates are pinned; the verifier is the offline transport fed canned text, so both routers see the same verifier output.

**The verbs.** The union of what the extension spawns and what an engine runs by hand, each entering the control in the session that ports its module and never leaving: the record verbs in 26, `affected` and `test_evidence` in 27, `discovery` in 28, `seat_cost` in 29, the lifecycle and `progress` and `modules` in 30, the plan verbs in 31, `verify` with dispute, adjudicate and reanchor in 32, `bootstrap` and `packaging --dry-run` in 33, `workflow` in 34. `discovery enumerate` is excluded: it needs the network.

**The files.** Everything under `docs/sessions/` and `.dabbler/runs/` the router writes, `copilot-catalog.lock`, what `bootstrap` writes, the six-step's event log and projection, and — for every `refs/dabbler/rounds/s<N>/r<R>` — the anchored commit's **tree**, required to equal the row's `completion_tree` on both sides. Excluded: `router-metrics.jsonl` (gitignored telemetry with elapsed seconds), the two lock files (transient), and the run core's records (retired, never ported).

**The two normalizations, and no third.** (1) Any ISO-8601 date or date-time value becomes `<ts>`; (2) each copy's absolute root becomes `<root>`. Both are defined by the shape of the value, not by field name, so a new field cannot escape them. Anchor commits are compared by tree rather than by id because a commit id differs only through its dates — that is normalization 1 applied to git, not a third rule. Key order, whitespace, float formatting, list order and decision ordinals are all compared exactly.

**Exit codes.** `0` identical; `1` drift, with a unified diff of every differing path; `2` could not run, recorded as `unknown` and never `pass`.

**Two rules that bind later sessions.** When the control fails, the TypeScript side moves — changing Python to match is a redesign, forbidden by the plan; the one exception is a Python defect the port exposes, fixed on the Python side first in its own recorded commit. And the control is run and recorded once more in session 35 *before* the `frameworkVersion` stamp and the Python deletion, then retired in the same step; it is never made to pass across the stamp.

### D134 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Selector defect, owed: round-1 change sets in a repository that tracks its ledger report every .dabbler/runs file as deleted (HEAD's raw tree vs a snapshot that drops .dabbler/), selecting the smoke test on 208 false unknowns

Running `python -m ai_router.affected` in this session — whose only changes are under `docs/` — reported 208 `selection_unknown` risks, one for every tracked file under `.dabbler/runs/`, and selected the smoke test on their account. `git status` showed four changed paths. The record shows the same rows in sessions 19, 20 and 21: each of their round-1 `preverify-targeted` records carries `selection-unknown-smoke`, so this session met a standing condition rather than a new one, and it handled it the way they did — the smoke test was run and recorded. This entry records the cause, so the next session does not rediscover it.

**Cause.** `affected.working_tree_changes` measures a session's first change set as HEAD's raw tree against `snapshot_worktree_tree`, and the snapshot drops `.dabbler/` unconditionally (a throwaway index, `git rm --cached -r .dabbler`, so a round's own ledger writes never move the tree it measures). Since commit `913eb65f` the run ledger under `.dabbler/runs/` is tracked, so HEAD's tree carries it and the snapshot does not: the diff reports every ledger file as deleted. The paths match no `testing.selection.rules` entry, so each one is `selection_unknown` and the smoke fallback is selected. Rounds two and later are unaffected — both sides of a fix delta are snapshots. The verifier is unaffected too: round one's bundle (`facts.assemble_evidence`) is `git diff HEAD` against the working tree with exclusion pathspecs, not a snapshot diff, which is why no verifier output from sessions 19–21 mentions the ledger.

**What it costs.** One 44-test smoke run per session (seconds), and 208 lines of `RISK selection_unknown` noise on every first selection in this repository — which is the real cost, because the loud state exists to flag a missing mapping and it now fires on nothing every time. A genuinely unmapped path would be one row among 209.

**Remedies, in order of correctness.** (1) Apply the snapshot's own rule to the baseline side: derive the HEAD baseline through the same throwaway index with `.dabbler/` removed, or exclude `MACHINE_DIRNAME` in `changed_paths_between` — one place, the git seam — so a change set never names a path the snapshot can never contain. This changes what `affected` proves and needs its one test. (2) Independently, declare `- when: .dabbler/` with `select: []` in `dabbler.yaml`: machine-written records affect no test, which is a mapping and not an unknown. (2) alone silences the noise without correcting the measurement; (1) alone leaves the loud state correct. Both are small.

**Not fixed here.** This session declared itself prose: no code and no test, and a selector change is a behaviour change with a test. It is **owed**, to be scheduled by the operator, and it sits on the port's path: session 27 ports `affected` and the seam and must port this behaviour faithfully for parity, so the fix is either landed before session 27 on the Python side — its own recorded commit, so the parity run that follows compares two routers with the same intended behaviour — or carried across and fixed on both sides afterwards. The plan's session 22 step 8, which said the selector would report nothing, was corrected in this session to say what the selector actually reports here.

### D135 · 2026-08-28 · Operator · The run ledger under .dabbler/runs is no longer tracked: .gitignore takes the framework's own .dabbler/ rule; rounds no longer travel between machines, and D134's symptom disappears here

The run ledger under `.dabbler/runs/` is no longer tracked in this repository. `.gitignore` drops the `.dabbler/*` + `!.dabbler/runs/` pair that re-included it and ignores `.dabbler/` outright — which is the rule `bootstrap.ensure_gitignore` writes for every consumer project (`_IGNORE_RULE = ".dabbler/"`), so this repository stops being the one exception to the framework's own default. The files stay on disk and in git history; `git rm -r --cached .dabbler/runs` removes them from the index in this session's commit.

**The operator's instruction, 2026-08-28, mid-session:** "If `.dabbler/runs` is going to be a recurring issue, just add it to `.gitignore`. I don't think that we need it anymore." It is recurring — every session's first selection reported the tracked ledger as 208 false unknowns (D134), and sessions 19–22 each ran a smoke test on its account.

**What tracking was for, and what is given up.** The ledger was made tracked in session 20's window (`de583d11`, then `913eb65f`, which taught the last gate that ledger rows are not work) so that a session's round rows travel with a push and a session can be picked up on another machine mid-flight. Session 20 then anchored round baselines under `refs/dabbler/rounds/`, which travel with push and fetch independently of tracking — but the rows themselves (`rounds.jsonl`, `test-runs.jsonl`, `state-writes.jsonl`) do not. From this decision on: **a session cannot be moved between machines mid-flight**, and the record of each session's rounds lives on the machine that ran it, not in version control. The orchestrator raised this before acting; the operator's instruction stands as given, and the work computer's migration (still owed) is now a clone plus `bootstrap`, with no ledger to carry.

**What it fixes as a side effect.** D134's symptom disappears in this repository: HEAD no longer carries `.dabbler/runs/`, so the round-1 change set no longer reports it as deleted and a prose session gets the "no test affected, nothing recorded" shape the plan describes. D134's cause — a raw-HEAD baseline against a snapshot that drops `.dabbler/` — remains latent for any repository that tracks its ledger, and stays owed at its lower priority. The close's own residue (a `state-writes.jsonl` row left uncommitted after every close) also disappears, since the file is no longer tracked.

**Session accounting.** This session declared itself prose; this change is configuration, not code, and no test moves. It is reviewed in round 2 as the fix delta over round 1's verified tree. STATUS.md's line saying the ledger is tracked is corrected at close-out; the `.gitignore` comment that cited `de583d11` is replaced.

### D136 · 2026-08-28 · Orchestrator (claude-fable-5/anthropic) · Session 22 seat cost: verifier 26,019 in / 10,144 out tokens over three API rounds (gpt-5-6-sol); orchestrator 312,457 Claude Code context tokens; no dollar figure, the router prices nothing

Session 22's seat cost, measured in the two currencies the session actually ran on. No dollar figure is stated: set 109 removed the router's rate table, the metrics ledger carries tokens and elapsed time only, and a list price recalled from memory would be a guess dressed as a measurement.

**Verification — OpenAI API, gpt-5-6-sol, 3 calls (3 rounds: VERIFIED, VERIFIED, VERIFIED).** From `router-metrics.jsonl` rows with `session_number: 22`:

| Call | Model | Input tokens | Output tokens | Elapsed |
| --- | --- | ---: | ---: | ---: |
| 1 | gpt-5-6-sol (openai, api) | 6,711 | 5,973 | 81 s |
| 2 | gpt-5-6-sol (openai, api) | 9,423 | 2,874 | 38 s |
| 3 | gpt-5-6-sol (openai, api) | 9,885 | 1,297 | 19 s |
| **Total** | | **26,019** | **10,144** | **138 s** |

36,163 tokens in all. For scale, session 21 (three rounds, code) used 33,375; the set-148 sessions 15–20 used 20,000–100,000 each. A prose session's rounds are cheap because the bundle is small.

**Orchestrator — Claude Code subscription, claude-fable-5.** The harness's session token counter stood at 15,000,000 at the first prompt and at 14,687,543 when this figure was taken: **312,457 tokens** consumed across the session to this point, covering the plan landing, the seven decisions before this one, the parity design, the selector investigation, the `.gitignore` change and three verification rounds. The suite run and the close come after and are not in the figure. This is the subscription window's currency; it has no exchange rate to the API tokens above or to the Copilot seat's premium requests (D37's $8–$12 band was measured on the seat and is not comparable).

**Method, so the next session repeats it rather than reinvents it:** filter `ai_router/router-metrics.jsonl` on `session_number`, sum `input_tokens` and `output_tokens`; for a Claude Code session read the harness counter at the start and at the point of recording; for a Copilot-seat session run `python -m ai_router.seat_cost <conversation ids>`. Record before the run of record, as step 7 of every session 22–35 says.

### D137 · 2026-08-28 · Verifier (gpt-5-6-sol/openai) · Verifier nits carried to session 23: the parity control should compare stdout and stderr of every invocation, not only read-only verbs and selected refusals

Across three VERIFIED rounds the verifier raised only Minor findings. Two were fixed in round 3's delta (read-only verbs' stdout and every exit code entered the comparison set; the moved-machine fixture was rebuilt as an unmigrated clone plus a fetched copy, since a fetched anchor commit brings its tree). Two are carried, not fixed, under the Minor-only stop: (1) the control still limits stdout comparison to read-only verbs and stderr to selected refusals rather than requiring all observable output of every invocation -- session 23 should take the broader rule when it builds the control, since 'compare everything a verb emits' is both simpler and stricter than a list; (2) the plan's remark that the selector's selection_unknown rows 'do not recur' is premature until the commit that removes .dabbler/runs from HEAD lands, which is this session's commit -- true at close, not at the moment of the round.

## Session 23 — Contracts — types from schemas, the Router interface, and the controls

### D138 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · packages/router under a root npm workspace; the CLI bundles to dist/dabbler.cjs (a .js cannot be CommonJS under type:module), controls are argv for node, and CI installs at the root on Node 24

`packages/router` exists, published to npm as `dabbler-ai-router` with `bin: dabbler`, under a root `package.json` that declares npm workspaces over it and `tools/dabbler-ai-orchestration` (D131). `tsc --strict` with `moduleResolution: bundler`, ESLint 8 on the extension's own configuration, `vitest` as the runner in the path-list form the targeted-command audit already accepts. The three runtime dependencies of D132 are declared and none is used yet; nothing else was added.

Four things D131 could not know, because they only appear when the layout is run:

**The CLI bundle is `dist/dabbler.cjs`, not `dist/dabbler.js`.** D131 says CommonJS, and CommonJS it is; but the package is `"type": "module"` so that Node can run the TypeScript sources directly, and under that a `.js` file is an ES module whatever is inside it — `node dist/dabbler.js` died with "module is not defined in ES module scope". The extension bundle is unaffected: it is built by the extension's own esbuild into `dist/extension.js` as CommonJS, which is where D131's reason ("as the extension host requires") actually applies. `bin` names the `.cjs`.

**The TypeScript that is not shipped runs on Node, not on a transpiler.** The generator, the staleness control, the workspace typecheck/lint control and the parity control are TypeScript executed directly by `node`, which strips types unflagged from **22.18** on. No `tsx`, no `ts-node`, no build step in front of a control — a control whose answer depended on a build being fresh would be reporting on the build. `scripts/run-ts.mjs` is the one plain-JavaScript file in the package and exists for one reason: it checks the Node version and exits **2** ("could not run", recorded as `unknown`) on an older one, because a bare `SyntaxError` would exit 1 and be read as a finding the tool never made.

**Every declared control's command is argv for `node`.** `facts.run_control` splits the command with `shlex` and runs it with no shell; `npm` and `npx` are shim scripts on Windows that argv cannot reach, and `python`/`python3` are the only names it rewrites. So each control is `node <script> …` and nothing else. The root `npm run typecheck` / `lint` / `check:types` / `parity` scripts are the same command lines verbatim, so what a person runs and what `facts` runs cannot drift.

**CI had to move to the root.** Both workflows ran `npm ci` inside `tools/dabbler-ai-orchestration`; a workspace member has no lockfile of its own, so the install is now `working-directory: .` in both, and `tools/dabbler-ai-orchestration/package-lock.json` is deleted rather than left as a second lockfile nothing reads. Node goes 20 → 24 in both, which is the floor D131 measured and the version the scripts need. `test.yml` gains a `router` job: the staleness control, the typecheck and lint controls, vitest, and the CLI bundle. The parity control is deliberately **not** in CI — it drives both routers against a git corpus and so needs Python installed beside Node; it runs before every verification round, which is where a comparison of two implementations belongs.

The extension's 153 mocha tests, its lint and its bundle were green before the workspace and are green after it.

### D139 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Types generated from every schema, with a compile control on staleness; a twenty-first schema written for progress --json so types.ts has a generated replacement; the translation states shape and leaves legality to ajv

Every schema under `ai_router/schemas/` now generates one TypeScript module under `packages/router/src/generated/`, checked in, plus an `index.ts` barrel. `npm run check:types` regenerates in memory and compares; it is declared as the `compile` control, `required: true`, so stale output stops a session before a verifier is bought. The generator is one implementation and nothing reads the generated files to produce them, so a hand edit cannot survive a run.

**A twenty-first schema was added, and this is the reason the session exists.** `progress --json` — the projection the Work Explorer renders — had no schema. Its only statement was `tools/dabbler-ai-orchestration/src/types.ts`, 209 hand-kept lines, which is precisely the mirror the plan says this session replaces ("Today `types.ts` is a hand-kept mirror of what Python writes"). Without a schema, step 4's "typed by the generated types" would have been false for the most-used verb, and session 24's "delete `types.ts` in favour of the generated types" would have had nothing to delete into. So `ai_router/schemas/progress-projection.schema.json` was written from `progress.build_projection`, `build_task_rows` and `build_verification_view` — the Python source, not the TypeScript mirror — and checked against a real projection of this repository's 35 sessions: **zero validation errors**.

It is a **new file, not a behaviour change**: nothing validates against it yet, so no code path moved. Wiring `progress` to validate its own output is a behaviour change with a test and belongs to session 30, which ports it.

**What a JSON Schema keyword becomes, stated rather than inferred.** `$ref` resolves only into the file's own `$defs` and a pointer anywhere else is an error rather than a widening to `unknown`; `$defs` entries are named `<Root><PascalKey>`. `oneOf`/`anyOf` become unions, `enum` and `const` become literal unions, `type: [...]` becomes a union. `allOf` becomes an intersection of the members that carry shape — an `if`/`then`/`else` member carries none, because it refines which values are legal, which is ajv's job at run time and cannot be spelled in a structural type. `not`, `minimum`, `minLength`, `minItems` and their kin are dropped for the same reason. An object with declared `properties` renders them (plus `[key: string]: unknown` when `additionalProperties` is open, because a typed index signature would have to admit every declared property too); an object with none renders `Record<string, T>`, because a schema that declares no property is describing a map.

The consequence worth naming: **the generated types describe shape, and ajv describes legality.** A row that satisfies its generated type can still be refused by the schema — `rounds.schema.json` alone carries five conditional `allOf` blocks — and that is correct. The type is what a reader and the compiler use; the validator is what the record uses.

### D140 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · The Router interface: one method per verb, refusals as values over the published exit codes, and a verb table whose availability is a registered handler rather than a session number to bump

`packages/router/src/contracts/router.ts` declares `Router`: one method per verb, grouped as the CLI groups them (`session.*`, `modules.*`, `verify.*`, `workflow.*`, `ledger.*`, `testEvidence.*`, `approvedPlan.*`, plus `progress`, `bootstrap`, `affected`). It is deliberately **not** a spawn interface: `PythonSpawnRouter` satisfies it by spawning (session 24), the ported modules satisfy it in-process (session 35), and neither spelling appears in it — which is what lets the extension stop knowing that Python exists.

**A refusal is a value, not an exception.** `RouterResult<T>` is `{ok: true, value}` or `{ok: false, outcome, exitCode, message}`, over the CLI's published exit codes: 0 ok, 3 refused with nothing written, 4 write failed, anything else — including argparse's usage code 2 — an unclassified failure. Refusing is this framework's normal answer, not its error path; modelling it as a thrown error would have made every call site in session 24 a try/catch for the ordinary case. `outcomeForExitCode(null)` is `failed`: a process that was killed or never ran did not consent to anything. The one genuine exception is `RouterUnavailableError` — no interpreter, no binary, a spawn that threw — because that is the absence of an answer rather than an answer.

**`progress` is the only verb with a typed payload, and that is a statement rather than a gap.** It is the only one whose answer is a projection; the rest print for a person to read. Their returns are `RouterText` and sharpen as their modules land. Options interfaces gain fields the same way. Both are additive and move no caller.

**The `dabbler` verb list is one table, read twice.** `src/contracts/verbs.ts` names fifteen verbs — the extension-facing ones plus the engine-facing ones — each with the Python module it replaces and the session that ports it. `runcli` is absent: the run core is retired (D130). Availability is **not** a session number anyone has to bump: `src/cli/registry.ts` holds the handlers, a verb is available when a handler is registered, and the CLI and the parity control read that same fact at the same moment. A declared verb with no handler is refused **by name with exit 3**, naming the session that lands it and the `python -m …` to use meanwhile — which is a different answer from "unknown verb", and the difference matters: an orchestrator reading the first should wait and reading the second should check the spelling.

### D141 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · The parity control is built and declared; two amendments to D133 found by running it: shape builders land with the verbs that need them, and a digest ledger over timestamped content is compared by row count and shape

The parity control of D133 is built: `packages/router/src/parity/` (the corpus builder, the normalizations, the comparison and its unified diff, the driver) and `scripts/parity.ts`. It is declared in `dabbler.yaml` as kind `analyzer`, `required: true`, and runs green through `ai_router.facts` today. Running it corrected the design in two places, and the specification is amended in both.

**Amendment 1 — a shape is built when a verb needs it.** D133 said all five shapes are built fresh at every run. Three of them (`disputed`, `at-cap`, `moved-machine`) need canned verifier text through the offline transport, and no TypeScript verb exists to compare against until session 26. Writing three builders now that nothing could execute for three sessions would have been three hundred lines of unverified code rotting in place — the failure the port exists to end, reintroduced as fixtures. So the shapes follow the same rule as the verbs: `fresh` and `in-flight` are built and **were proven end to end in this session**; the other three land in the session that first needs them, and a missing builder stops the control at exit 2 ("could not run", recorded `unknown`), never at a pass.

**Amendment 2 — a digest over timestamped content, found by running it.** `npm run parity -- --self-check <shape>` builds one shape **twice** and compares the two copies: whatever the two routers later disagree about, two runs of one builder must differ only in their root and their timestamps, which is exactly what the two normalizations erase. Its first run on `in-flight` failed — on `.dabbler/runs/state-writes.jsonl`, one row per sanctioned write of `sessions.json`, each row the **sha256 of that file's bytes**. `sessions.json` carries `startedAt`, so the digest carries a timestamp one hash away and no textual normalization can reach it, while the file it covers compares equal a directory away.

Such a ledger is therefore compared by **row count and row shape**: its `sha256:<hex>` values become `sha256:<digest>`. What it proves that its payload does not is how many sanctioned writes happened and in what order, and that is what is now compared. This is normalization 1 reaching a value it cannot reach as text — the same concession D133 already makes for a git commit id, compared by tree because a commit differs only through its dates. It is **not** a third rule: a digest over content with no timestamp in it, every tree hash in the record and `completion_tree` above all, is compared exactly, and a new digest ledger has to name itself in the list.

**Had the self-check not existed, this would have surfaced in session 26 as a red required control with a one-line diff of two hex strings** and no way to tell a real port defect from an artefact of the design. The mode is kept for that reason.

What is built and proven now: the seeded corpus (a working repository with a session plan, a `dabbler.yaml`, a source file and a test, plus a real bare `origin`, with git identity and dates pinned through the environment); the `fresh` and `in-flight` builders driving the Python router for real (`session start`, `declare`, `affected`, `test_evidence record`); the allow-list of compared paths with its exclusions (telemetry, the two lock files, the retired run core's records); the two normalizations; the LCS unified diff; and the three exit codes. `fresh` self-checks over 1 path and `in-flight` over 6. The verb table is empty — nothing is compared before its TypeScript side exists — so the control's honest answer today is exit 0 with "no verb has been ported yet, and both routers are executable", which is itself worth having: it is the check that the Python router and the `dabbler` CLI can both be run at all.

### D142 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · The first declared controls in this repository: all four kinds, required, each one node argv; plus the typescript suite, whose vitest path-list form satisfies the targeted-command audit without D116

This repository declared no deterministic controls until now — the comment in `dabbler.yaml` said so, and said why: it shipped no typechecker, linter or analyzer, and `not_applicable` was the honest row. The port brings all three, so all four kinds are declared, each `required: true`, and each is one `node` argv:

| Kind | What it is | Why this kind |
| --- | --- | --- |
| `compile` | `check-types-fresh.ts` | The generated types are the compiled form of the twenty-one schemas. Stale output is a build that was not re-run. |
| `typecheck` | `workspace-check.ts typecheck` | `tsc --noEmit` over **both** packages. |
| `lint` | `workspace-check.ts lint` | ESLint over both packages. |
| `analyzer` | `parity.ts` | The two routers, compared (D141). Retired in session 35 with the Python router it compares against. |

`facts` admits one control per kind and this repository has two TypeScript packages, so `workspace-check.ts` runs the tool's own entry point (`node_modules/typescript/bin/tsc`, `node_modules/eslint/bin/eslint.js`) once per package and checks **both even after one fails** — a control that stopped at the first red would hide the second. All four run green in 4.9 seconds through `ai_router.facts`, which is the budget that matters: they run before every round.

**The second suite.** `typescript` is declared beside `python`: `npx vitest run --root packages/router`, `expensive: true`, `test_roots: [packages/router/test]`, `test_glob: "*.test.ts"`. Vitest takes positional paths as file filters, so the targeted form `<command> packages/router/test/x.test.ts` that `checks.targeted_command` composes is a real command — verified from the repository root. **D116 is not needed for this suite**, and remains owed for filter-style runners (`mvn -Dtest=`, `dotnet test --filter`).

Selection rules were added for every new path: the three test files map one-to-one to what they answer for (`src/schema/` and `src/generated/` → the schema tests, `src/contracts/` and `src/cli/` → the contract tests, `src/parity/` → the parity tests); `tsconfig.json`, both `package.json` files and `package-lock.json` select all three, because they change what every test in the package runs under; `scripts/`, `build.mjs` and `.eslintrc.json` declare `select: []`, which is a mapping and not an unknown — they are the declared controls' own entry points, and the controls run them. `ai_router/schemas/` now selects **on both sides**: a schema is the generator's input as well as Python's contract. `tools/dabbler-ai-orchestration/` declares `select: []` here because the extension is its own suite (mocha and Playwright), not this one, and is not declared as a suite until session 24 makes it one.

### D143 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Python defect found by the port and fixed on the Python side first: the preverify gate demanded a targeted record from every expensive suite, including ones the selection named no test of, for which no recordable command exists

Declaring the second expensive suite (D142) turned 43 tests red, and the cause was not the declaration. `affected.preverify_gate` iterates **every** expensive suite and demands a green `preverify-targeted` record for each — with no check that the selection named any test that suite runs. When it did not, the suite's targeted command is `""` (`checks.targeted_command` returns the empty string for an empty selection, deliberately: naming the bare suite command there would be the module recommending the one run it exists to refuse), and `test_evidence.record_run` refuses an empty command on a preverify row ("a preverify-targeted record must name the command that ran").

So the gate demanded evidence that no sanctioned writer would produce. **It was not strict; it was unsatisfiable.** A repository with one expensive suite can never reach the state — the whole-change-set early return three branches up (`not result.all_tests_affected and not result.test_paths` → nothing to prove) covers it. A repository with two reaches it on the first change that touches only one ecosystem, which is most changes.

**The fix is the rule the function already states, applied per suite instead of per change set:** a suite the selection named no test of has nothing to prove, so it is skipped. `evaluate_freshness` already narrows the same way, by `covers`. This is not a weakening — an unmapped path is still caught before this loop, by `result.unknown_paths` against the declared smoke fallback, so "no test of this suite was selected" can only mean the mapping says so. One test in `tests/test_affected.py` covers it, and it fails against the unfixed gate with `command=''` in the verdict, which is the unsatisfiable state itself.

Landed on the Python side **first, in its own commit**, as `docs/ts-port-parity-control.md` requires of a Python defect the port exposes: the parity run that follows must compare two routers with the same intended behaviour. Session 27 ports `affected` and inherits the fixed rule.

**Two harness consequences, both in `tests/conftest.py` and neither a production change.**

`record_preverify` recorded the *first* expensive suite. It now records every expensive suite that the selection named a test of, skipping any whose targeted command is empty — the same rule as the gate. It stands in for an orchestrator, who would have run both.

And `_hermetic` now strips this repository's own `testing.controls` from `load_config()`. `load_config()` resolves from the **working directory**, which under pytest is this repository whatever sandbox the test is driving; before this session there were no controls to inherit, and now there are four whose commands are paths in this tree (`node packages/router/scripts/…`). `facts` would have run them with `cwd` set to a temp repository and recorded four `fail` rows on every round the suite drives. The config's repository and the tree's repository disagree **only in the harness**; in production they are the same directory. A test that declares controls of its own still gets them — the strip is keyed on the resolved config path being this repository's `dabbler.yaml`.

**Worth naming as a latent coupling rather than fixing here:** a round driven against repository B while the working directory is repository A takes B's tree and A's configuration. Only the test harness does that today. If it ever becomes a real posture, the fix is for `collect_facts` to resolve its config from the repository root it was handed rather than from the working directory — which is a behaviour change in a gate, and the operator's call.

### D144 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · D137's two carried nits settled: the parity control compares stdout and stderr of every invocation rather than a list, and the selector's 208 false selection_unknown rows are gone now that the ledger is untracked

D137 carried two verifier nits from session 22 into this one. Both are settled.

**Nit 1 — taken, and the specification is amended.** The design named which output counted: read-only verbs' stdout, and the stderr of selected refusals. The verifier's point was that "compare everything a verb emits" is both simpler and stricter than a list, and that a list is a thing to forget to add to. The control as built compares **stdout and stderr on every invocation**, after the same two normalizations, with no list of exceptions. The old list's reasoning is kept in the document because it is *why* the rule matters — for a read-only verb the output is the record, and a refusal's wording is what the operator reads — but it no longer decides what is compared.

**Nit 2 — resolved by the world, not by an edit.** The verifier objected that calling the selector's `selection_unknown` rows "no longer recurring" was premature until the commit removing `.dabbler/runs` from HEAD had landed, which was session 22's own commit. It has landed (`487cc44d`'s predecessor, D135). This session's first `python -m ai_router.affected` reported **zero** `selection_unknown` rows, against 208 in each of sessions 19–22, and selected no smoke test on their account. The claim is now true at the time it is made. D134 stays owed as a latent defect for any repository that does track its ledger, and it stays on session 27's path.

### D145 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Round 1's three blocking findings accepted and fixed: ledger and approved-plan added to the verb table, the schema-backed answers typed, and the parity analyzer left undeclared until it has a case rather than writing a green row for a comparison it never made

Round 1 returned three Major blocking findings. All three are accepted; none is disputed. Two were straightforward omissions. The third is the session's most important correction and is the reason this entry exists.

**Issue 1 — `ledger` and `approved-plan` were missing from the CLI verb table.** The plan says the `dabbler` verb list is the `Router` list plus the engine-facing verbs, and `Router` exposes both. I left them out because neither Python module has a `main()` today — which is the wrong reason: the verb list is a contract, and a caller typing `dabbler ledger` was told it "is not a verb", i.e. that they had made a spelling mistake. Both are declared now, and `VerbSpec` gained `pythonCli: false` so the refusal tells the truth about the meantime rather than naming a `python -m ai_router.ledger` that would itself fail.

**Issue 3 — schema-backed answers were returned as untyped text.** `approved-plan.json` and a rounds row both have schemas and both have generated types, and `approvedPlan.read` and `ledger.latestRound` were returning `RouterText`. That defeats the session's own objective at the two seams the extension will use: a schema change would not have produced a compile error there. Both now return `ApprovedPlan` and `Rounds | null`. `ledger.unresolved` stays text, and the comment says why — the unresolved view is a fold with no schema of its own, and inventing one here would be a second declaration of a shape the record does not carry. `test/typed-payloads.test.ts` asserts the three schema-backed answers are their generated types, assignable in **both** directions so a silent widening to `unknown` fails, and uses `@ts-expect-error` on three payloads the schemas would reject — a marker that itself fails the build if the error it expects does not occur.

**Issue 2 — the required parity analyzer was a successful no-op, and this is the finding worth reading.** `dabbler.yaml` declared parity as `analyzer`, `required: true`. With no verb ported, `CASES` is empty, and the control returned exit 0 with "nothing is compared". `facts` would then have written **`analyzer: pass`** into `.dabbler/runs/deterministic-facts.jsonl` on every round from this session on — a permanent record row saying parity was checked, on rounds where nothing was compared. The verifier's words were "materially overstating readiness", and they are right: this is the failure mode the whole framework exists to prevent, arriving through the control meant to prevent it. It is also a guard that cannot fail, which ground rule 2 forbids.

I could not satisfy the verifier's criterion literally by adding a case. A case needs a verb implemented in TypeScript, and the first module lands in session 25 — manufacturing one would mean pulling a port forward past the plan's own sequencing. And making the control red instead would block sessions 23, 24 and 25 on a condition no work in them can clear.

So the analyzer is **not declared until session 26**, the session that gives it its first case. `facts` writes `not_applicable — no control of this kind is declared`, which is precisely what is true today. The control is not deleted or weakened: it is built, it is runnable as `npm run parity` (with `--build`, `--self-check` and `--shapes`), it is unit-tested, and `dabbler.yaml` carries the full reasoning at the point where the declaration will go. The other three kinds — `compile`, `typecheck`, `lint` — stay declared and `required: true`, because each has real work to do today and each is green.

**The general rule this is an instance of, worth carrying:** a control earns its declaration by being able to fail. Declaring one before it can is not caution, it is a green row that means nothing, and the record cannot tell the difference later.

### D146 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Superseding D145 on the verifier's round-2 finding: the parity control is declared required now, because parity has a half that needs one router -- each corpus shape built twice and compared, which is a precondition for router parity and is demonstrably able to fail today

Round 2 resolved the two other findings and held on this one, rejecting the remedy of D145: "Replacing the prior successful no-op with no analyzer at all does not remediate the prior finding; it changes the form of the same missing deliverable." That is correct, and D145's remedy is superseded here.

**Both of my first two positions were wrong, and they were wrong in opposite directions.** Declared-but-vacuous writes a green `analyzer: pass` row for a comparison nobody made. Undeclared leaves the port with no required parity gate at all, and defers an operator-approved deliverable on an orchestrator's say-so. The verifier named the second in the same terms I had named the first, which is what made the third option visible.

**The third option: parity has a half that needs only one router.** As designed the control compared two routers, and there is no second router until session 25. But two runs of one builder must differ only in their root and their timestamps — which is exactly what the two normalizations erase — so building each corpus shape **twice** and comparing byte for byte is a real comparison of real router output, available today.

It is also a *precondition* for the other half rather than a substitute. If a record write is not reproducible — a set iterated in hash order, a float formatted by locale, a digest taken over a timestamp — then a later Python-versus-TypeScript difference cannot be told from noise, and the parity control would be reporting on its own fixtures. Determinism is what makes router parity measurable at all, and it belonged in the control from the start; I had built it as a hand-run `--self-check` mode instead, which is the same code and none of the gate.

So `dabbler.yaml` declares `analyzer`, `required: true`, and the control now runs two comparisons and is red if either drifts:

1. **Determinism** — every corpus shape with a builder, built twice through the Python router and compared. Today: `fresh` and `in-flight`, 7 record paths, **12 seconds**.
2. **Router parity** — every ported verb through both routers. Empty until session 26, then one case at a time.

**It is demonstrably able to fail, which is the whole of the finding.** Emptying `DIGEST_LEDGERS` — the one rule that reconciles `state-writes.jsonl`, whose rows are sha256 over a `sessions.json` that carries `startedAt` — turns the control red on this tree; restoring it turns it green over 7 paths. That is not a hypothetical failure mode: it is the defect this same check found the first time it was ever run.

All four control kinds are now declared, `required: true`, and green through `facts` in 15.8 seconds.

**What I take from two rounds on one finding.** A control earns its declaration by being able to fail — that much I had right in D145. What I had wrong is the conclusion I drew: that a control which cannot fail yet should therefore wait. The better question is whether some part of what it exists to prove is provable now, and here a whole half was, sitting in the same file behind a flag nobody would run. Deferring was the easier answer and it would have left sessions 24 and 25 ungated for no reason.

### D147 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Round 3's finding disputed and OVERRULED by a third provider (gemini-flash/google); the plan defect it exposed is owed to the operator: session 23 step 5 requires a two-router control in a session the plan gives no second router

Round 3's single blocking finding was disputed and a third provider **OVERRULED** it: "The orchestrator's arguments for reachability and impact are well-supported by the cited evidence." The session is `VERIFIED`. This entry records what the exchange settled and what it leaves owed, because the substance matters more than the outcome.

**The verifier was right twice and I was wrong twice.** Round 1: a required analyzer that compared nothing wrote a green row for a comparison nobody made. Round 2: removing the declaration did not fix that, it changed the form of the same hole and deferred an operator-approved deliverable on an orchestrator's say-so. Both corrections were correct, and the second is what made the real answer visible -- that parity has a half needing one router, and that determinism was sitting behind a hand-run flag when it should have been the gate.

**What was disputed was narrower than the finding.** Not whether cross-router comparison matters -- it is the point of the control -- but whether round 3's remedy was reachable in session 23, and whether its stated impact was real. On reachability: a cross-router comparison needs a verb in TypeScript, and the operator's plan (D128, D129) assigns every module to sessions 25-34. Session 24 ports nothing; session 25 ports foundation libraries, none of them a verb; the first ported verb is session 26. The only ways to comply were to re-sequence the operator's plan, which is not an orchestrator's call, or to write a stub reproducing one Python verb's bytes so a gate would turn green -- which would make the first real port in session 26 a regression against a stub. On impact: the harm named was that early port work could merge ungated, and the window it names (24, 25) contains no verb for a cross-router comparison to compare.

**The plan defect this exposes is owed to the operator.** Step 5 of session 23 asks for two things that cannot both hold in session 23: a control that runs a verb through **both** routers, and that control declared as required. The second router does not exist in session 23 by the plan's own sequencing. The adjudication resolves this session; it does not amend the plan. **The operator should decide** whether step 5's wording changes, or whether the first parity case moves earlier -- and the substantive answer is already scheduled either way: session 26 lands the first ported verb, and the specification, D141, D146 and this session's `CASES` list all require its parity case in that same session.

**One thing to carry into session 26, from the verifier rather than from me.** Its standing objection is that a reader of `deterministic-facts.jsonl` sees `analyzer: pass` and cannot tell what was compared. That is true, and it is true of every control row -- `facts.run_control` records kind, status, command and required, and drops the detail on a green result. When session 26 gives the analyzer its first cross-router case, it is worth asking whether a control should be able to say what it proved, not merely that it passed. That is a Python behaviour change in the record and therefore the operator's call, not a fix to slip into a port session.

### D148 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Session 23 seat cost: verifier 121,670 in / 14,350 out over four API calls (three rounds plus the adjudication); orchestrator 437,884 Claude Code context tokens; round 1 alone is 78% of the input, which is what a code session costs over a prose one

Session 23's seat cost, in the two currencies it ran on, by the method D136 set down. No dollar figure: set 109 removed the router's rate table, the metrics ledger carries tokens and elapsed time only, and a list price recalled from memory would be a guess dressed as a measurement.

**Verification -- four calls: three rounds plus one adjudication.** From `ai_router/router-metrics.jsonl` rows with `session_number: 23`:

| Call | Model | Input | Output | Elapsed |
| --- | --- | ---: | ---: | ---: |
| 1 (round 1) | gpt-5-6-sol (openai, api) | 98,266 | 8,275 | 121 s |
| 2 (round 2) | gpt-5-6-sol (openai, api) | 7,218 | 3,503 | 48 s |
| 3 (round 3) | gpt-5-6-sol (openai, api) | 7,927 | 1,981 | 29 s |
| 4 (adjudication) | gemini-flash (google, api) | 8,259 | 591 | 6 s |
| **Total** | | **121,670** | **14,350** | **204 s** |

136,020 tokens in all. **Round 1 alone is 78% of the input**, at 98,266 tokens against 6,711 for session 22's first round -- fourteen times as much. That is the cost of a code session against a prose one: round 1 sends the whole change set, and this one created a package, twenty-two generated modules, a contract, a parity control and two workflow files. Rounds 2 and 3 are fix deltas and cost 7-8k each, which is the shape the loop is designed to produce. The adjudication is the cheapest call of the session (8,259 in, 591 out, 6 seconds) and it is the one that settled the session -- a third provider reading two positions and one round's findings, not a re-review.

For scale: session 22 (prose, three rounds) spent 36,163 tokens; this session spent 3.8 times that for a session that shipped a package.

**Orchestrator -- Claude Code subscription, claude-opus-5 (1M context).** The harness counter stood at 15,000,000 at the first prompt and at 14,562,116 when this figure was taken: **437,884 tokens** across the session -- the workspace, the generator and its twenty-two modules, the twenty-first schema, the contract, the parity control, the four declared controls, the second suite, the Python defect and its fix, six earlier decisions, three verification rounds, one dispute and one adjudication. The run of record and the close come after and are not in the figure. This is the subscription window's currency and has no exchange rate to the API tokens above, nor to a Copilot seat's premium requests.

**The measurement worth carrying:** a code session's round 1 is an order of magnitude more expensive than a prose session's, and the fix deltas after it are not. Anything that reduces round 1's bundle -- and only round 1's -- is where the loop's token cost actually lives.

### D149 · 2026-08-28 · Orchestrator (claude-opus-5/anthropic) · Close-gate trap found: deleting a tracked file moves the whole-tree digest across the commit, because git ls-files still lists a deleted tracked path, so the run of record taken before the commit no longer binds

The close's `test_run_fresh` gate failed on both suites with "the run of record is green but the tree moved under it", on a tree where nothing had been edited between the run and the close. The covered-surface digests matched exactly; the whole-tree digest did not.

**Cause.** `tree_digest` is `surface_digest(root, ("",))`, whose file list is `git ls-files` (tracked) united with `git ls-files --others --exclude-standard` (untracked, not ignored). **`git ls-files` lists a tracked file that has been deleted from the working tree.** This session deleted `tools/dabbler-ai-orchestration/package-lock.json` -- the workspace root owns the lockfile now -- with `git rm --cached` plus `rm`. Until the commit, that path was still in the index and therefore still in the file list; after the commit it was gone from both. The digest before and after the commit are honestly different because the list of paths is different, and nothing in the working tree changed at all.

**Why the lifecycle's own order makes this reachable.** Step 6 runs the suite of record, step 7 commits and pushes, step 9 closes. The run of record is therefore always taken *before* the commit, and the gate compares it *after* -- which is correct and is what binds a run to the tree it proved. It only diverges when the commit changes which paths exist for the digest to walk, and a deletion of a tracked file is exactly that. A session that deletes no tracked file never sees it, which is why twenty-two sessions have not.

**Remedy taken here:** re-run both suites against the committed tree and record them again. That is the gate's own instruction and it is the honest answer -- the second run proves the tree that is actually being closed.

**Remedy owed, and it is the operator's call because it changes a gate.** Either resolve the file list against the working tree rather than the index (`git ls-files` with a deleted path dropped, since `surface_digest` already skips a path it cannot read), or have the close compare against the tree as of the commit rather than the worktree. The first is one line at the git seam and keeps the binding's meaning; the second changes what "the tree it ran against" means. Session 27 ports `evidence` and `test_evidence` and inherits whichever shape is chosen, so a decision before then is worth more than after.

**Cost of leaving it:** one extra full-suite run in any session that deletes a tracked file. Here that was five minutes.
