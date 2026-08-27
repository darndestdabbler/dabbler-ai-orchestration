# Decisions log — 148-the-session-framework

Every decision, human or AI, in order, with who made it and what it was.

**Kept by hand until session 5.** The writer that owns this file does not
exist yet; session 5 builds it and backfills these entries through it. The
shape here anticipates that writer — date, who, decision, why — so the
backfill is a transcription rather than a re-interpretation.

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

### D3 · 2026-08-26 · AI (orchestrator), operator-approved · The design documents are held out of the committed tree until session 1 commits them

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

### D4 · 2026-08-26 · AI (orchestrator) · `AGENTS.md` now names `master` as the working branch

D1 made the existing "Working branch" section wrong, and it is the section
every engine reads first. Left stale it would have sent session 2 to
`experiment/verification-pipeline-v3`.

Edited in the unmanaged region above the `dabbler:managed` fence; the
managed body is untouched and still belongs to `ai_router.bootstrap`.

### D5 · 2026-08-26 · Framework · No preverify record is required for this session

`ai_router.affected` reported `no tests affected by this change set`, and
`affected.py::preverify_gate` passes closed-form in that case: *"Declared
to affect no test: nothing to prove, and nothing to ask for."*

Consistent with the set spec's "Est. 0 tests — this session writes no
code." Recorded rather than assumed, because a session that skips a
lifecycle step must be able to show why the step was satisfied.

### D6 · 2026-08-26 · AI (orchestrator) · A redacted read can manufacture a confident false finding — and did, in round 1

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

### D7 · 2026-08-26 · AI (orchestrator) · Session 2 must edit before it verifies

D3 commits all four documents in session 1, so session 2 opens against a
clean tree and would hit the same `EvidenceEmptyError`.

Session 2 has real work that produces a diff — reconciling the session list
against the verified spec and plan, confirming the session 14 reordering,
and appending to this log. **It must make those edits before running
`verify`, not after.** A session whose product is a judgment about an
existing document has to write the judgment down before the judgment can be
reviewed.


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

### D9 · 2026-08-26 · AI (orchestrator) · The run of record exposed a test that cannot pass on Windows

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

---

## Seat cost

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

---

## Session 2 — Verify this breakdown against that design

### D10 · 2026-08-26 · AI (orchestrator) · Every plan item appears exactly once

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

### D11 · 2026-08-26 · AI (orchestrator) · §3.a is unbuilt, and session 13 depends on it — the one real gap

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

### D12 · 2026-08-26 · AI (orchestrator) · Session 8 does not depend on session 9, though it reads as if it might

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

### D13 · 2026-08-26 · AI (orchestrator) · The session 14 reordering is sound

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

### D14 · 2026-08-26 · AI (orchestrator) · Two spec sections need no session, and one was checked too narrowly

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

### D18 · 2026-08-26 · AI (orchestrator) · The framework has no exit for "the verifier was right, I fixed it, and I am out of rounds"

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

### D20 · 2026-08-26 · Operator + AI · The three terminal states, which is what makes D19 safe

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

### D21 · 2026-08-26 · AI (orchestrator) · Read fidelity is now session 6's problem, in the spec rather than only in this log

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












---

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

### D27 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · A reached round cap is no longer extensible, and `--extend-rounds` survives only for budgets

`resume --extend-rounds` raised the round limit from a round-cap pause. The
cap no longer pauses, so that entry no longer exists: the flag is reachable
only from a budget pause, where money and minutes are genuinely the
operator's to extend.

**Kept rather than deleted**, because raising a budget is not typing a
verdict. Its refusal message now says which ceiling it answers for.

### D28 · 2026-08-26 · Orchestrator (claude-opus-5/anthropic) · WAIVED is retired from every writer and kept in every reader

`.dabbler/runs/138-.../s1/rounds.jsonl` carries a real `waive` row. Dropping
WAIVED from the record schemas would make the machine's own history
unreadable — a `LedgerError` on every read of it — which is a worse failure
than the token surviving.

**Chosen: the split the writer/reader asymmetry already uses.**
`SESSION_VERDICTS` drops WAIVED, so `validate_session_verdict` refuses it and
no path can persist another. The schemas and the extension's reader keep it,
and `REMEDIATED_AT_CAP` joins both.

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

### D35 · 2026-08-27 · Orchestrator (claude-opus-5/anthropic) · Session 4: one missing selection rule added, three left alone

`ai_router.affected` raised `selection_unknown` for `ai_router/workflow.py`
— the module this session changed — so a `testing.selection` rule was added
mapping it to `tests/test_workflow.py`, which is the loud state doing its
job. **`solution.py`, `stepreview.py` and `contractdoc.py` have the same
gap and were left alone**: they arrived on the merged design branch without
rules and this session did not touch them. A session that fixes every
adjacent gap it notices stops being reviewable.

*Filed for whichever session next touches those three.*

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
