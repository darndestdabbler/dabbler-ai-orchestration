# Orchestrator Seat Cost Capture Spec

> **Status: RESERVED STUB — not authored.** Slug reserved 2026-08-14 at
> the operator's direction, at the close of Set 118 Session 1, so Step 9
> and the next-set discussion have something to point at. The sessions
> below are a **sketch**, not an authored plan: they have not been sized
> against the Set 128 step skeleton, no `Progress keys` are assigned,
> and there is deliberately no Session Set Configuration block yet.
> **Author this properly before running it** — see
> [`docs/planning/session-set-authoring-guide.md`](../../planning/session-set-authoring-guide.md).
>
> **Expected:** `python -m ai_router.spec_admission --all --check` flags
> this file with *"no `### Session N of M: <title>` headings found"*
> until it is authored. That is the checker being right, not a
> regression — a stub has no session plan to size. It does **not** count
> toward "unstarted specs requiring restructuring", which stays at 0.
>
> **Session Set:** `docs/session-sets/130-orchestrator-seat-cost-capture/`

---

## Why this exists

Every session's Step 10 is supposed to report **cost**. On a Copilot CLI
seat it reports nothing useful: `router-metrics.jsonl` faithfully
records `$0.0000` for every routed verification round, because a
seat-authenticated call carries no per-call price. Set 118 Session 1 ran
four verification rounds and a full close for a recorded routed cost of
zero — while actually costing roughly **$42.67**.

The number is recoverable. The Copilot CLI keeps a local session store
whose `assistant_usage_events` table carries per-session, per-turn
usage, and `SUM(total_nano_aiu) / 1e9` is AI credits — `/ 1e11` is
dollars. Set 118 S1 measured itself at 4,266.6 credits (192 turns, 41.5M
input / 197.9K output tokens) this way, and the unit was corroborated
against a `/usage` screenshot the operator captured mid-session: 3,895
credits then, 4,266.6 at close.

**No `/usage` delta is required, and it works retroactively.** The store
is keyed by `session_id`, so past sessions can be priced too.

## The distinction this set must not blur

There are **two** costs, and the repo currently measures only the first:

1. **Routed-call cost** — what `route()` spends on verifiers and
   delegates. Already recorded in `router-metrics.jsonl` by
   `record_call`. Correct, and correctly `$0.00` on a Copilot seat.
2. **Orchestrator-seat cost** — what it costs to *run the session*: the
   orchestrator's own tokens. Currently invisible everywhere.

Quietly redefining (1) to mean (2) would be a measurement error of
exactly the kind Set 118 exists to stop. Both must be named, and any
report showing one must say which it is showing.

## The three traps, named up front

1. **It is engine-specific data in a universal core.**
   `assistant_usage_events` belongs to the *Copilot CLI*. Claude Code
   and Gemini have no equivalent. Under the portability rule this has to
   be a **gated adapter**, not core behaviour — and consumer repos
   inherit whatever ships.
2. **The absent answer must be `unknown`, never `$0.00`.** A cost reader
   that returns zero when it cannot measure is a fail-open defect, and
   it is *worse* than reporting nothing, because zero looks like a
   measurement. This is the same class as the fail-open gaps Sets 112,
   128 and 129 closed (L-112-1).
3. **The schema is undocumented and inferred.** `total_nano_aiu` is a
   private store's column, read by inference and corroborated once. It
   can change without notice. The adapter needs a stated confidence, a
   shape self-check, and a way to say *"this store no longer looks like
   what I expected"* — rather than silently multiplying by a stale
   constant.

## Sketch — two sessions, unsized

**Session 1 — the adapter and the cost model.** Define seat-cost vs
routed-cost in one place. Ship a reader that resolves the local store,
validates its shape *before* trusting it, returns a typed
unknown/unavailable rather than zero, and is engine-gated. Tests must
include the absent-store and changed-schema paths, planted rather than
reasoned about.

**Session 2 — the contract and the wiring.** A real `disposition.cost`
field, the `ai_router/disposition.py` dataclass and validator,
`docs/disposition-schema.md`, and the close-out / Step 10 reporting
path. Note the L-064-8 hazard: a disposition schema change echoes in the
dataclass, the schema doc and the close-out flow, so all three move in
one pass or they drift.

## Prior art in this repo

- **Set 118 Session 1's `disposition.json` `notes`** carries the first
  measurement and the full method, including the query and the caveats.
  Start there.
- **`ai_router/metrics.py` / `router-metrics.jsonl`** own routed-call
  cost. This set sits *beside* them; it does not redefine them.
- **`docs/session-sets/118-test-retirement-and-coupling-budget/`** is
  also the worked example of why an inferred number needs its predicate
  published — the failure mode this set is one step away from repeating.
