# AI assignment log — Set 114

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — Make posting observable, then enforce it

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5` / effort `high`
(GitHub Copilot CLI transport; the seat carries no provider API keys by
design).

**Verification:** routed to a non-anthropic effective provider, as the
cross-provider rule requires.

**Why this pairing:** the session's hard part was not the code — it was a
judgment call the spec explicitly refused to pre-decide, and warned would
be discovered late if taken carelessly: whether the new post record
staleness-invalidates a verification evidence stamp. Getting that wrong
does not fail loudly; it makes posting *expensive* (a stale row sends the
close backstop into a fresh metered round), and an expensive obligation
decays exactly as the prose one did. That is a reasoning task on this
repo's own machinery, which is why it was authored here rather than
outsourced, and journalled (`decisions.jsonl`, two records) rather than
merely explained.

**What actually happened.** The design settled on a sibling append-only
ledger (`checklist-posts.jsonl`) rather than a new `activity-log.json`
entry kind, because an entry would be rendered by the checklist itself —
making its content a function of how many times it had been shown — and
would satisfy the existing `activity_log_entry` gate for a session that
logged no real step. The freshness question resolved to
**freshness-exempt AND evidence-visible**, holding the Set 111 S3 line
that those are different questions and that hiding a record from the
verifier is a reduction no orchestrator may self-authorize.

The gate's blast radius was the real cost: 41 close-path tests across
eight files were fixtures for sessions that had never posted. Every one
was fixed by making the fixture post through the *shipping* writer, not
by softening the gate. One of those files (`ai_router/tests/e2e/
fixtures.py`) sits in Playwright's covered surface, so this session paid
a full Layer 3 it did not otherwise owe — the honest outcome of a trigger
list, and not one to route around.

---

## Session 2 — The forward half: a plan in the ledger

**Recommended orchestrator:** `copilot` / `anthropic` / `claude-opus-5` /
effort `high` — **continue the current trajectory**.

**Reasoning.** Session 2 reverses a *recorded* design decision (Set 111
S4's "render the record, never synthesize the plan") in the one way that
decision's own reasoning permits: by writing the plan into the record at
`start_session`. That is a continuation of the argument this session
made about where a record belongs and what a renderer is allowed to
invent, not a fresh problem. An orchestrator without that context is
likely to re-open the synthesize-at-render-time option the spec already
closed.

**What Session 2 must not inherit uncritically.**

1. **Do not write a second step parser.** `ai_router.spec_admission`
   already parses each session's step list for the size cap. L-069-1 —
   the duplicate-parser bug — is this repo's most repeated defect, and
   the spec names it in Session 2's own step 2.
2. **Seeded `pending` entries change what the checklist gate sees.**
   `check_checklist_posted` derives its "last logged step" transition
   from the newest `activity-log.json` entry for the session. If
   `start_session` seeds the whole plan at registration, those entries
   all carry a *registration-time* timestamp, so the transition stays at
   session start rather than moving — but if Session 2 ever rewrites or
   re-timestamps seeded rows mid-session, that transition moves with
   them and the "before close" post could be demanded twice. Decide it
   deliberately and add a falsifier either way.
3. **A re-registered session must not duplicate the plan.**
   `start_session` is idempotent by contract; seeding must be too, and
   the collapse-by-`stepKey` rule must not let a real step overwrite a
   planned one out of order (Session 2 step 3).

**Verification for S2:** must again use a non-anthropic effective
provider. S2 touches `ai_router/start_session.py`, which is in
Playwright's `covers` list, so it pays its own full Layer 3 after freeze.

---

## Session 2 — The forward half: a plan in the ledger

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5` / effort
`high` (GitHub Copilot CLI transport; the seat carries no provider API
keys by design). Continued the trajectory S1 recommended.

**Verification:** routed to a non-anthropic effective provider, as the
cross-provider rule requires.

**What actually happened.** All three warnings S1 left were live, and
one was wrong in a way worth recording.

1. *Do not write a second parser* — honoured. `spec_admission` gained
   `parse_step_texts` and `parse_session_plans` now counts what that
   function finds, so the cap and the plan share one definition of "a
   step". Reusing it immediately paid: `_STEP_RE`'s leading `\s{0,3}`
   can consume the newline before a marker, so the first step of every
   session sliced empty. Counting had never noticed in three sets of
   use. A second parser would not have found it either — it would have
   had its own bug.
2. *Seeded entries change what the checklist gate sees* — confirmed, and
   handled by exclusion rather than by timestamp reasoning. S1's note
   argued the registration-time timestamp keeps the "last logged step"
   transition at session start. True, but fragile: it makes correctness
   depend on write ORDER rather than on what a plan entry *is*. A
   seeded row is not the session's work, so `_checklist_transitions`
   filters it out by `kind`, and the falsifier plants the plan **after**
   the only real step — the timestamp ordering S1's reasoning relied on,
   reversed — and asserts the transition still names the real step.
3. *A re-registered session must not duplicate the plan* — honoured, and
   the same rule answers "the plan changed mid-flight": seed once, never
   re-seed. Re-seeding a spec edit would write to the activity log
   mid-session, which is the freshness risk the spec names, and would
   mutate the plan under an operator who read it an hour ago.

**The cost S1 did not predict**: seeding puts entries in the ledger for
every session at registration, which would have made
`check_activity_log_entry` pass before any work existed. S1 had already
written that consequence down when it rejected an activity-log entry
kind for the post ledger — it just applied to the *next* session's
design rather than its own. The gate now ignores plan entries and has
its own refusal message and falsifier.

**Dogfood:** this session's own plan was seeded by re-running
`start_session` after the writer shipped, and its checklist rendered
three claimed rows and two pending ones.

---

## Session 3 — The surface the operator already has open

**Recommended orchestrator:** `copilot` / `anthropic` / `claude-opus-5` /
effort `high` — **continue the current trajectory**.

**Reasoning.** Session 3 renders in the Work Explorer what Sessions 1
and 2 put in the record. The tree's children are `build_rows`' output;
an orchestrator that does not know why a row can be `is_planned`, why
the `<- here` marker prefers a logged step over an earlier pending one,
or why the renderer is forbidden from inventing rows will either
re-derive the plan in TypeScript — reopening the exact decision two
sessions have now closed — or render a tree that disagrees with the
checklist. It is also the set's terminal session (`change-log.md`, Step
9 review, advisory path-aware critique), which wants the set's full
context.

**What Session 3 must not inherit uncritically.**

1. **Do not re-derive the plan in the extension.** `activity-log.json`
   is the source; `kind: "plan-step"` marks a planned row and the
   reconciliation rule (plan owns position, logged step owns content,
   match by `stepNumber` then `stepKey`, bookkeeping `kind`s never
   claim) is specified in `session_checklist._reconcile`. A second
   implementation of that rule in TypeScript is L-069-1 with a language
   boundary in the way — if the tree needs different data, extend the
   Python and read it, or port the rule with a shared fixture that
   proves the two agree row-for-row.
2. **`is_planned` is a row property the tree needs and the CLI barely
   uses.** It exists so a pending planned row can be told apart from a
   step logged `pending`. If the tree wants a different glyph for
   "planned but not started", that distinction is already carried;
   inventing a parallel one from the absence of a timestamp is not.
3. **An unreadable or absent activity log must degrade to no children.**
   `build_rows` already returns `[]` for a missing, malformed, or
   entry-less log, and never raises. Session 3's step 3 asks for the
   same posture in the tree — the failure mode to avoid is a stale or
   invented list, which is worse than an empty one.
4. **This session paid a full Layer 3, and S3 owes one too.** S1's note
   said S2 would owe one because `start_session.py` is in Playwright's
   `covers` list. There is no such list — but the trigger fires anyway
   on the `project-guidance.md` rule that names **state-file writers**,
   and `start_session` is one by the constitution's own words. It now
   writes to `activity-log.json`, which the extension watches and reads
   for inference, so the trigger is doubly earned. Session 3 edits the
   rendering surface itself and owes the run unambiguously.

**Verification for S3:** must again use a non-anthropic effective
provider. Full Layer 3 after freeze, then the UAT walk — narrated-video
format if Set 113 has landed.
