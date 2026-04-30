# Verification Round 1

Verifier: gemini-pro (google), task_type=code-review
Verdict: ISSUES_FOUND -> resolved (substantive findings addressed; see below)

## Findings

### 1. (Major) `force_reclaim` set `failure_reason` on a non-terminal transition

`queue_status.force_reclaim()` was writing
`failure_reason = 'manual_force_reclaim_via_queue_status'` while
moving a message from `state='claimed'` back to `state='new'`. A
reclaimed message is being retried, not failed — leaving the
`failure_reason` populated on a row whose state is no longer terminal
muddies audit reads (the next observer sees a "new" row with a stale
"failure" reason that does not describe its current state).

**Resolution:** Force-reclaim now writes `failure_reason = NULL`. The
operator-audit trail of who reclaimed lives in their command history /
shell logs, not on the row itself. A comment in the source explains
the choice so future readers don't restore the field.

### 2. (Major) Redundant `if/else` in `heartbeat_status.collect_status`

The provider-filter handling had a defensive nested `if/else` where
both branches reduced to the same statement (`providers =
[provider_filter]`). Functionally harmless but actively misleading —
a future reader would assume the two branches differed and look for
the missing logic.

**Resolution:** Collapsed to a single assignment. The behavior was
already correct (`read_capacity_summary` tolerates a missing file and
returns the right `signal_file_present=False` shape), so no
behavioral change was needed beyond the cleanup.

### 3. (Suggestion) Fragile coupling in `_print_text` for heartbeats

`_print_text` reconstructed the embedded-N field names
(`f"completions_in_last_{lookback_minutes}min"`) from the function's
own `lookback_minutes` argument. If a caller passed a payload built
with a different lookback, the lookups would silently miss and read
zero. That is unlikely in practice (the CLI is the only caller and
passes both consistently) but easy to break later.

**Resolution:** `_print_text` now reads `n` from
`info["lookback_minutes"]` in the loop, falling back to the function
argument only when absent. The displayed window text now matches the
payload's actual window unconditionally.

## Findings reviewed and rejected

### (Critical-labeled, non-issue) `completed_at` not in the documented schema

The verifier flagged `_message_summary` returning `completed_at` as a
"critical" schema violation. The docstring schema lists representative
fields, not an exhaustive enum — `completed_at` is meaningful for
terminal-state messages and the TypeScript consumer (Sessions 2/3) is
free to ignore unknown fields. Adding the field to the docstring
example was considered but skipped: the existing prose ("messages") is
generic for a reason, and pinning it to an exact enum would lock the
schema before the consumer is written.

### (Minor, style only) `argparse.add_mutually_exclusive_group()`

The verifier preferred argparse's built-in mutual-exclusion group over
the manual check. Equivalent in behavior; the manual check produces
slightly more informative error messages (it names *which* flags
collided rather than the generic "not allowed with"). Left as-is.

### (Suggestion) Index on `messages.enqueued_at`

`queue_db.py` already has `idx_messages_state_enqueued (state,
enqueued_at)` and `idx_messages_lease (state, lease_expires_at)`,
which cover the `_list_messages` query patterns
(`WHERE state=? ORDER BY enqueued_at DESC` and the unfiltered ORDER BY
which falls back to a sequential scan acceptable at queue depths the
operator will actually encounter).

### (Suggestion) Encapsulation of `qdb._connect()`

The verifier noted that `_list_messages` calls `qdb._connect()`
(underscore-private). True; this is a deliberate test-time pattern
already used elsewhere in the codebase (see `queue_db.py`'s own read
helpers). The alternative — adding a public connection method to
`QueueDB` — leaks SQLite into the public API. The current shape keeps
the SQLite surface contained.

### (Suggestion) Shared transaction context manager

`mark_failed` and `force_reclaim` duplicate the
`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` scaffolding. The verifier
suggested factoring into a context manager. Not applied: only two
call sites, the boilerplate is short, and a shared helper would have
to live in `queue_db.py` (since this file imports from it, not the
reverse) — which means a new public shape on the queue API for two
internal callers. Revisit if a third intervention path lands.

## Cost
gemini-pro: $0.0332 (1 call, code-review).
