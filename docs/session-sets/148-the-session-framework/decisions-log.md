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






