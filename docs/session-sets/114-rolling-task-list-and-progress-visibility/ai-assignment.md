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
