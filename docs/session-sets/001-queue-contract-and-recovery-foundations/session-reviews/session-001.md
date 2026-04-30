# Verification Round 1

- **Issue** → Duplicate `idempotency_key` is treated as a successful no-op instead of being rejected, which does not match the Session 1 API contract.
  **Location** → `ai-router/queue_db.py` (`enqueue()`, module docstring invariant for `idempotency_key`); `ai-router/tests/test_queue_db.py::test_enqueue_duplicate_idempotency_key_returns_existing_id`
  **Fix** → Change `enqueue()` to reject duplicates by raising a dedicated exception or propagating `sqlite3.IntegrityError`, and update the duplicate-enqueue test to expect rejection rather than returning the existing message ID.

- **Issue** → The explicit `heartbeat_seen` lifecycle state is not implemented, and `claim()` sets `last_heartbeat_at` immediately, so the code cannot distinguish “claimed but never heartbeated” from “heartbeat seen.”
  **Location** → `ai-router/queue_db.py` (`VALID_STATES`, `_SCHEMA_DDL` state `CHECK`, `claim()`, `heartbeat()`); no matching tests in `ai-router/tests/test_queue_db.py`
  **Fix** → Add `heartbeat_seen` to the persisted state machine, leave `last_heartbeat_at` as `NULL` on `claim()`, and have `heartbeat()` transition the message into `heartbeat_seen` while extending the lease.

- **Issue** → The acceptance criterion requiring atomicity verification with concurrent-process tests is not met; current coverage only uses threads within one Python process.
  **Location** → `ai-router/tests/test_queue_db.py` (`test_double_claim_only_one_winner`), with no multi-process contention tests for `enqueue`, `claim`, `complete`, `fail`, or `reclaim_expired`
  **Fix** → Add `multiprocessing` or subprocess-based tests that use separate Python processes and separate SQLite connections against the same `queue.db`, and verify single-winner/race-safe behavior for the core state transitions.

---

# Verification Round 2

## ISSUES_FOUND

1. **Issue** → `provider` validation can escape the per-provider queue root, violating the `provider-queues/<provider>/queue.db` contract. `provider=".."` is currently accepted and produces `<base_dir>/../queue.db`.
   **Location** → `ai-router/queue_db.py`, `QueueDB.__init__`
   **Fix** → Reject `"."`, `".."`, and any provider name outside a strict allowlist such as `^[A-Za-z0-9_-]+$`; then resolve the computed path and assert it remains under `base_dir.resolve()`. Add tests for `"."`, `".."`, and other traversal-like values.

2. **Issue** → The new subprocess claim test is not actually synchronized, so it can pass under fully serialized execution and does not verify the acceptance criterion’s concurrent-process atomicity.
   **Location** → `ai-router/tests/test_queue_db.py`, `test_concurrent_claim_across_processes_only_one_winner`
   **Fix** → Add a start barrier so all child processes call `claim()` at the same time. Example approaches: pass a shared future timestamp and have workers busy-wait/sleep until it, or use a file/event barrier. Keep the single-message assertion, but make the overlap explicit so the test genuinely exercises process contention.

---

# Verification Round 3

- **Issue:** Major — `PRAGMA synchronous = NORMAL` weakens the queue’s durability below the stated “durable state machine / crash safety” contract. In WAL mode, `NORMAL` can lose recently committed `enqueue`/`claim`/`complete`/`fail` transactions on OS crash or power loss, which can duplicate or drop work.
  **Location:** `ai-router/queue_db.py`, `QueueDB._ensure_schema()`
  **Fix:** Remove the `conn.execute("PRAGMA synchronous = NORMAL")` override, or set `PRAGMA synchronous = FULL` (or `EXTRA`) when initializing the DB. Add a regression test that asserts the database is not downgraded below SQLite’s durable synchronous setting.
