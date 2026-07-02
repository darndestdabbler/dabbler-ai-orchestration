# S1 code-review bundle f-session-state (raw, unedited)

> model: sonnet  tier: 2  cost_usd: 0.3101  total_cost_usd: 0.3637
> truncated: False  escalated: False
> verifier: gemini-pro  verdict: ISSUES_FOUND

---

## Pinned-finding triage

### A12 — CONFIRMED

**Evidence:** `_backfill_payload` (activity-log branch):
```python
if os.path.isfile(os.path.join(session_set_dir, "activity-log.json")):
    if not isinstance(base.get("sessions"), list) or not base["sessions"]:
        return base
    base["status"] = IN_PROGRESS_STATUS
    base["sessions"][0]["status"] = SESSION_STATUS_IN_PROGRESS
    earliest = _earliest_activity_log_timestamp(session_set_dir)
    if earliest is not None:
        base["sessions"][0]["startedAt"] = earliest
    _validate_sessions_or_raise(...)
    return base
```

Classification is gated solely on `os.path.isfile`; `_earliest_activity_log_timestamp` returns `None` for an empty-entries log but that result is only used for the per-session `startedAt`, not to gate the `IN_PROGRESS_STATUS` flip. A modern authoring scaffold that pre-creates `activity-log.json` with `{"entries": []}` causes `ensure_session_state_file` → `_backfill_payload` to write `status: "in-progress"`, misclassifying the set in the VS Code Explorer before a single session has run.

Fix direction: add `if not _earliest_activity_log_timestamp(session_set_dir): return base` (or directly read and check `len(entries)`), before setting `IN_PROGRESS_STATUS`. Prefer the direct `entries`-length check (`_earliest_activity_log_timestamp` also returns `None` on read error and for legacy logs with entries but no `dateTime` field; those should still classify as in-progress).

---

### `register_typed_session_start` context — CONFIRMED (non-bug context)

The function has no automatic caller in this module; it requires an explicit invocation. The events guard (`already = any(ev.event_type == "work_started" and ev.session_number == new_number ...)`) makes it idempotent on re-entry. Confirmed as context for A5/Defect 3 — the auto-wire for verification hand-off must come from outside this module.

---

### HARD-CONFIRM: `provider` field on `sessions[N].orchestrator`

**Evidence — three writer sites, all correct:**

`register_session_start`:
```python
orchestrator_block: dict = {"engine": orchestrator_engine}
if orchestrator_provider is not None:
    orchestrator_block["provider"] = orchestrator_provider
...
entry["orchestrator"] = orchestrator_block  # written per-session
```

`register_typed_session_start` and `register_typed_session_handoff` follow identical omit-null patterns. **CONFIRMED: `provider` is persisted when non-`None`; omit-null contract is correct at all three sites.**

---

## New findings

### [Major] Non-atomic snapshot writes in all four boundary writers

**File:** `session_state.py` — `register_session_start` (plan-less and canonical branches), `register_typed_session_start`, `register_typed_session_handoff`, `_flip_state_to_closed`.

All four use direct `open(path, "w")`:
```python
with open(path, "w", encoding="utf-8") as f:
    json.dump(state, f, indent=2)
    f.write("\n")
```

**Defect:** `open(path, "w")` truncates the destination immediately. A process kill (SIGKILL, power loss, VS Code Copilot agent crash) between truncation and `f.write("\n")` leaves `session-state.json` at zero bytes or partial JSON. The next `read_raw_session_state` call silently returns `None` (see finding below), causing `compute_effective_completed_sessions` to return `[]` and `register_session_start` to overwrite history as if the set is fresh.

**Requirement violated:** The module-level docstring and spec §3.1 both designate `session-state.json` as the consumer-readable cache; the events ledger is authoritative for repair. A zero-byte snapshot breaks the Explorer, `gate_checks.py`, and `find_active_session_set` until a human repair-runs.

**Contrast:** `_atomic_write_json` (used only by `synthesize_not_started_state` / `ensure_session_state_file` / `backfill_session_state_files`) already implements `tempfile.mkstemp` + `os.replace`, which is the correct pattern. The four boundary writers must use the same helper.

**Fix direction:** Route all four writers through `_atomic_write_json(path, state)`. Add the trailing `\n` inside that helper (currently `json.dump + f.write("\n")`).

---

### [Major] `read_raw_session_state` silently swallows all exceptions, masking corruption

**File:** `session_state.py` — `read_raw_session_state`.

```python
try:
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
except Exception:
    return None
```

**Defect:** `except Exception` catches `PermissionError`, `OSError`, truncation-induced `json.JSONDecodeError` (produced by finding #1 above), and any future read-side bug. Callers that need to distinguish "file absent" from "file corrupt" cannot: both return `None`. Downstream: `compute_effective_completed_sessions` gets `state = {}`, falls through to the events-ledger path, and on a fresh set (no events yet) returns `[]`. A subsequent `register_session_start` then writes a brand-new state file as if the set has zero closed sessions — silently discarding the on-disk history.

**Fix direction:** Catch specifically `(OSError, json.JSONDecodeError)` for "absent or unreadable, return `None`". Let `PermissionError` and unexpected exceptions propagate so callers see operational failures. Log a `WARNING` on `json.JSONDecodeError` (file exists but is corrupt) to match `_flip_state_to_closed`'s implicit fail-loud posture.

---

### [Major] Missing guard for re-starting an already-completed session

**File:** `session_state.py` — `register_session_start`, approximately where `_build_sessions_array` is called.

```python
# Comment says "the writer must refuse" — but no code does so:
sessions = _build_sessions_array(
    session_set,
    total=effective_total,
    completed_numbers=prior_completed,
    in_progress_number=session_number,   # may already be in prior_completed
    prior_state=existing,
)
```

**Defect:** `_build_sessions_array` resolves the conflict between `in_progress_number` and `completed_numbers` silently by giving `in_progress_number` priority (first branch in the `if`/`elif`). The resulting sessions array — e.g., `[{1, complete}, {2, complete}, {3, in-progress}]` — is structurally valid and passes `_validate_sessions_or_raise` because the validator sees the output, not the intent. A session already recorded as `complete` (via `closeout_succeeded` event) can be re-started without error, overwriting its `completedAt` / `orchestrator` / `verificationVerdict` with the new run's values.

**Requirement violated:** The code comment at the call site explicitly states "the writer must refuse." Spec D6 demands fail-loud before any file is written or event emitted.

**Fix direction:** Insert an explicit check before `_build_sessions_array`:
```python
if session_number in prior_completed:
    raise SessionStateInvariantError(
        4,
        f"session_number {session_number} is already in completedSessions "
        f"({sorted(prior_completed)!r}); use a new session number or run "
        "close_session --repair if the snapshot is stale.",
    )
```

---

### [Minor] `_propagate_total_sessions` writes without trailing newline and without atomic write

**File:** `session_state.py` — `_propagate_total_sessions`.

```python
with open(log_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    # missing f.write("\n")
```

Non-atomic write. Also `_finalize_total_sessions_from_entries` has the same gap. Both read, mutate in-memory, and write back — a concurrent write from another process can interleave. Both also lack the trailing `\n` that every other JSON writer in this module appends.

**Fix direction:** Factor a `_atomic_write_json_no_trailing_nl` or reuse `_atomic_write_json` with the trailing newline (consistent with the rest of the module). Add `f.write("\n")`.

---

### [Minor] `_finalize_total_sessions_from_entries` may undercount `totalSessions`

**File:** `session_state.py` — `_finalize_total_sessions_from_entries`.

```python
sessions = {
    e.get("sessionNumber")
    for e in data.get("entries", [])
    if isinstance(e.get("sessionNumber"), int)
}
data["totalSessions"] = len(sessions)
```

`len(sessions)` counts unique session numbers that appear in `entries`, not the actual total. A 4-session set where session 4's work produced zero activity-log entries sets `totalSessions = 3`, making the Explorer show `3/3` (done) when the set is not complete.

**Fix direction:** Use `max(sessions)` rather than `len(sessions)` to infer total from the highest-numbered session seen, and add a comment that this is a heuristic.

---

### [Minor] `_derive_legacy_fields` is unreachable dead code under v4

**File:** `session_state.py` — `_derive_legacy_fields`.

No call site exists in this file for the current v4 writer path. The v3 dual-write block in `register_session_start` and `_flip_state_to_closed` was superseded by the v4 `sessions[]` / `_strip_v4_dropped_top_level_keys` pattern, but `_derive_legacy_fields` was not removed. Under v4, the legacy triple is reader-derived; no writer should be emitting it directly.

**Fix direction:** Remove `_derive_legacy_fields` or add a `# dead-code` marker with a deprecation note; the absence of a call site should be caught in a future dead-code pass.

---

### [Minor] Duplicate status string constants create silent drift risk

**File:** `session_state.py` — module-level.

`NOT_STARTED_STATUS = "not-started"`, `IN_PROGRESS_STATUS = "in-progress"`, `COMPLETE_STATUS = "complete"` are redefined locally, while `SESSION_STATUS_NOT_STARTED`, `SESSION_STATUS_IN_PROGRESS`, `SESSION_STATUS_COMPLETE` are imported from `progress`. `_backfill_payload` uses the local names; the boundary writers use the imported names. If the canonical values ever diverge (e.g., a rename in `progress.py`), the backfill path silently produces different status strings than the boundary writers.

**Fix direction:** Remove the local aliases and replace their three uses in `_backfill_payload` with the imported `SESSION_STATUS_*` constants.

---

### [Minor] `os.replace` atomicity hazard on Windows when VS Code holds the state file open

**File:** `session_state.py` — `_atomic_write_json`.

On Windows, `os.replace(tmp_path, path)` raises `PermissionError` (WinError 5 / 32) if the destination file is held open by another process — for example, the VS Code Session Set Explorer extension polling `session-state.json`. On POSIX, the rename is atomic even across open file descriptors. The result: `_atomic_write_json` raises and the temp-file cleanup path runs, leaving the destination unchanged (safe) but the write is lost. For the corporate GitHub Copilot team on Windows this is a latent intermittent failure.

**Fix direction:** Wrap `os.replace` in a retry loop (3 attempts, 50 ms back-off) catching `PermissionError` on Windows only (`if sys.platform == "win32"`), with a log warning on the last attempt. This matches the Windows retry pattern used by tools like `pytest` for tmpdir cleanup.

---

## Hardening opportunities

1. **`_flip_state_to_closed` reads state with a bare `json.load`** (raises on corrupt) while `read_raw_session_state` silently returns `None`. These asymmetric error semantics mean that the repair path in `close_session._run_repair` sees hard exceptions but callers using the read path see silent `None`. Align them: explicit `(OSError, json.JSONDecodeError)` catching with structured logging in both.

2. **Logger `propagate = False` + unconditional `addHandler`** (guarded only by `if not _logger.handlers`) bypasses application-level log routing. The `if not _logger.handlers` check is not thread-safe (two import threads can both evaluate it as `True`). Standard practice for library loggers: add a `NullHandler` only; let the application control routing. Replace the four lines with `_logger.addHandler(logging.NullHandler())`.

3. **`compute_effective_completed_sessions` `currentSession - 1` heuristic** returns a conjectural list that may include sessions that were never actually closed (e.g., skipped or failed sessions). The WARNING is emitted once, but the returned list is then silently used as authoritative input to `_build_sessions_array`. Consider returning a typed `HeuristicResult` wrapper so callers can explicitly decide to trust it rather than consuming it identically to the two authoritative paths.

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [Correctness / Major]: Flawed fix for exception handling

-   **Category:** Correctness
-   **Severity:** Major
-   **Details:** The review correctly identifies that `read_raw_session_state` swallowing `Exception` is a major defect. However, the proposed fix is logically flawed and does not achieve its stated goal.
    -   **Violation:** The review's "Fix direction" states: "Catch specifically `(OSError, json.JSONDecodeError)`... Let `PermissionError` and unexpected exceptions propagate". This is contradictory. `PermissionError` inherits from `OSError`, so `except OSError:` will catch `PermissionError` and prevent it from propagating.
    -   **Impact:** A developer implementing the fix as written (`except (OSError, ...`) would produce code that still silently swallows critical `PermissionError` exceptions, masking filesystem permission issues that should be treated as operational failures. This would change a reasonable reviewer's merge decision on the proposed fix, as it fails to fully solve the problem it identifies.
    -   **Evidence:** In Python, `isinstance(PermissionError(), OSError)` is `True`. The suggested fix should have been more specific, for example, `except (FileNotFoundError, json.JSONDecodeError):` to silently handle missing or corrupt files, while allowing other `OSError` subtypes like `PermissionError` to propagate as intended by the accompanying text.

###
**Issue 2** [Completeness / Major]: Missed race condition in backfill logic

-   **Category:** Completeness
-   **Severity:** Major
-   **Details:** The review did not identify a time-of-check-to-time-of-use (TOCTOU) race condition in `backfill_session_state_files` that violates its documented contract and can lead to data loss.
    -   **Violation:** The docstring for `backfill_session_state_files` promises: "If `session-state.json` already exists, leave it untouched." The implementation violates this. It first calls `_planned_backfill_paths` to get a list of directories *without* a state file, and then iterates that list, calling `_atomic_write_json`, which unconditionally overwrites the destination path.
    -   **Impact:** If another process (e.g., `register_session_start`) creates a valid `session-state.json` after `_planned_backfill_paths` runs but before `_atomic_write_json` completes, the backfill process will overwrite the new, correct state file with a synthesized one based on older heuristics (e.g., file presence). This causes state corruption. This defect would change a merge decision, as it breaks a key safety contract of the function.
    -   **Evidence:**
        1.  `_planned_backfill_paths` checks `if os.path.isfile(_state_path(sub)): continue`.
        2.  `backfill_session_state_files` calls this function, then loops through the returned paths.
        3.  Inside the loop, it calls `_atomic_write_json`, which uses `os.replace(tmp_path, path)`. `os.replace` will overwrite `path` if it exists. There is no second check for existence before the write, creating a window for data corruption.
