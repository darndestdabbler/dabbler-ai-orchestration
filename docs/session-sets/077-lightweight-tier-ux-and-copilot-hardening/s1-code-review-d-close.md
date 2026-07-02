# S1 code-review bundle d-close (raw, unedited)

> model: sonnet  tier: 2  cost_usd: 0.2240  total_cost_usd: 0.2672
> truncated: False  escalated: False
> verifier: gemini-pro  verdict: ISSUES_FOUND

---

## Pinned-finding triage

### A3 — CONFIRMED

**Evidence:** `run()` gates on `getattr(args, "no_router", False)` at every decision point (external-verification gate, manual-attestation block, `method = "manual"` branch). In `main()`:

```python
resolve_no_router_mode(
    cli_flag=bool(getattr(args, "no_router", False)),
    session_set_dir=Path(ssd) if ssd else None,
)
```

Return value is silently discarded; `args.no_router` is never updated. A set that is Lightweight via `spec.md` tier field or `DABBLER_NO_ROUTER` env var leaves `args.no_router = False`, so all three downstream branches (`getattr(args, "no_router", False)`) are dead for that invocation. The `except Exception: pass` wrapper in `main()` additionally swallows any resolution error without surfacing it.

---

### A4 — CONFIRMED

**Evidence:** `_run_repair` (repair) is not relevant; the gate is in `run()`:

```python
if not os.path.exists(ext_verify_path):
    ...  # gate body
```

An empty or whitespace-only `external-verification.md` satisfies `os.path.exists` and the entire gate body is skipped. No content, non-emptiness, or structural check is performed at any point before or after.

---

### A8 — CONFIRMED

**Evidence:** Both conditions are independent:

```python
# Gate 1 — fires on raw CLI flag
if getattr(args, "no_router", False):
    ext_verify_path = ...
    if not os.path.exists(ext_verify_path):
        ...

# Gate 2 — fires on verificationMode field
if (
    read_verification_mode(session_set_dir) == VERIFICATION_MODE_DEDICATED
    and _close_is_terminal(session_set_dir, outcome.session_number)
):
    dv = validate_dedicated_verification(...)
```

`--no-router` and `verificationMode=dedicated-sessions` are orthogonal signals with no mutual-exclusion guard. A set whose `spec.md` says `dedicated-sessions` and whose CLI invocation uses `--no-router` hits both gates at the set-terminal close: one for a missing `external-verification.md`, one for a missing different-engine verification session. The two remediations contradict each other (the ext-verification gate says "paste an AI reply here"; the dedicated-sessions gate says "run a verification session via the router").

---

### A2 (partial) — CONFIRMED

**Evidence:**

```python
warning_msg = (
    f"external-verification.md missing at "
    f"{ext_verify_path} (--no-router mode). To produce a "
    f"verdict: in the Dabbler 'Session Sets' view, ..."
)
if non_interactive:
    print(f"WARNING: {warning_msg}", file=sys.stderr)
    outcome.messages.append(warning_msg)
```

The only surface carrying the "save the reply here" instructions is a `print(..., file=sys.stderr)` emitted reactively at close-time when the file is already absent. In the interactive TTY branch, the operator receives a bare `[y/N]` prompt with no UX guidance; the corrective text is never shown. There is no proactive nudge in `start_session` or any pre-close surface (outside this file's scope, but confirmed that this file holds the only instance).

---

## New findings

### [Critical] `resolve_no_router_mode` return value discarded — entire Lightweight tier path silently inoperative for spec/env activation

**File:** `ai_router/close_session.py`, `main()` (~line 2088)

**Defect:** `resolve_no_router_mode(cli_flag=..., session_set_dir=...)` is called but its return value is never written back to `args.no_router`. Every consumer in `run()` reads `getattr(args, "no_router", False)`, which is the raw CLI flag only. The three activation sources specified by Set 048 §3.1 are: CLI flag (works), `DABBLER_NO_ROUTER` env var (silently ignored), spec.md tier field (silently ignored). The `except Exception: pass` wrapper additionally swallows any `ImportError` or resolution failure with no diagnostic.

**Requirement violated:** Set 048 §3.1 A3 — "CLI flag > env var > spec tier > default; highest-precedence source wins."

**Concrete impact:** Corporate Copilot-locked teams relying on `spec.md` tier configuration to activate Lightweight mode receive no manual attestation, no `verification_completed` event, and no `external-verification.md` soft gate. Close-out succeeds with `verification_method="skipped"` and no audit trail of what was verified.

**Fix direction:** Capture the return value and update `args.no_router`:

```python
resolved = resolve_no_router_mode(
    cli_flag=bool(getattr(args, "no_router", False)),
    session_set_dir=Path(ssd) if ssd else None,
)
args.no_router = bool(resolved)
```

Move the `except Exception` wrapper to swallow only `ImportError`, not resolution errors (or at minimum log the error to stderr before continuing).

---

### [Major] `"aborted_at_soft_gate"` result code absent from `RESULT_TO_EXIT_CODE` — exit code 2 emitted for an interactive abort

**File:** `ai_router/close_session.py`, `run()` (~line 1700) and `RESULT_TO_EXIT_CODE` (~line 163)

**Defect:**

```python
outcome.result = "aborted_at_soft_gate"
```

`RESULT_TO_EXIT_CODE` has no entry for this value. `exit_code` property falls through to the default `.get(self.result, 2)` → exit code 2. Exit code 2 is documented as `invalid_invocation`. The module docstring's JSON output shape section also omits `aborted_at_soft_gate` from the `result` enum.

**Concrete impact:** An orchestrator or CI script keying on exit code 2 to detect bad invocations will conflate an operator-intentional interactive abort with a misconfigured invocation. The undocumented result string also breaks any downstream consumer that parses the `result` field exhaustively.

**Fix direction:** Add `"aborted_at_soft_gate": 1` (gate_failed semantics) to `RESULT_TO_EXIT_CODE` and add the value to the module docstring's JSON shape section.

---

### [Major] TOCTOU: `_is_already_closed` checked outside the lock, no re-check inside

**File:** `ai_router/close_session.py`, `run()` (~line 620 idempotency check, lock acquisition ~line 655)

**Defect:**

```python
if _is_already_closed(session_set_dir):          # (1) outside lock
    outcome.result = "noop_already_closed"
    return outcome

disposition = _read_disposition_or_none(...)
...
try:
    lock_handle = acquire_lock(session_set_dir)   # (2) lock acquired
except LockContention as exc:
    ...
try:
    _emit_event(..., "closeout_requested", ...)   # (3) events emitted
```

Process A closes successfully and releases the lock. Process B, which checked `_is_already_closed` → False before A's close completed, then acquires the lock and proceeds to emit a second `closeout_requested` / `closeout_succeeded` pair. There is no re-check of `_is_already_closed` inside the lock.

**Concrete impact:** Duplicate events in the ledger. The `closeout_succeeded` event is emitted twice for the same session. `_flip_state_to_closed` is called twice; depending on its idempotency, it may either succeed silently (best case) or corrupt `session-state.json` (worst case). The reconciler and VS Code extension may display duplicate close-out records.

**Fix direction:** Repeat the `_is_already_closed` check immediately after `acquire_lock` succeeds (inside the `try` block), before any event emission.

---

### [Major] `_close_is_terminal` called three times in the success path — reads state file three times with no consistency guarantee

**File:** `ai_router/close_session.py`, `run()` (~lines 1780, 1840, 1900)

**Defect:** `_close_is_terminal` calls `read_session_state` + `read_progress` on each invocation. It is called independently for the dedicated-verification gate, the path-aware-critique gate, and the contract gate. If `session-state.json` is written between calls (e.g., by a concurrent `mark_session_complete` from another process that slipped past the lock via a different code path), the three calls may disagree on whether the close is terminal.

**Concrete impact:** Gate A fires thinking the close is terminal; Gate B does not. The dedicated-verification gate fires (potentially blocking), while the contract gate does not (potentially passing silently). Under the more common non-concurrent case this is a performance waste (3× file reads) inside the already-locked success path.

**Fix direction:** Compute once before the gate chain:

```python
is_terminal = _close_is_terminal(session_set_dir, outcome.session_number)
```

Pass `is_terminal` to each gate block.

---

### [Major] `path_aware_critique_record_unreadable` and `contract_gate_record_unreadable` fire unconditionally when gate level is `NONE`

**File:** `ai_router/close_session.py`, `run()` (~lines 1845, 1908)

**Defect:**

```python
pac_level = read_path_aware_critique(session_set_dir)
pac_is_terminal = _close_is_terminal(...)
if pac_is_terminal and path_aware_critique_record_unreadable(session_set_dir):
    warn = "WARNING ..."
    print(warn, file=sys.stderr)
    outcome.messages.append(warn)
```

The `path_aware_critique_record_unreadable` (and identically `contract_gate_record_unreadable`) call has no guard on `pac_level != PATH_AWARE_CRITIQUE_NONE`. If the predicate returns `True` for a genuinely absent `activity-log.json` (e.g., "file absent" → "could not be parsed" → `True`), every set without an activity-log receives a spurious `WARNING (Set 066 path-aware-critique): activity-log.json exists but could not be parsed` message at the set-terminal close — even sets that never opted into path-aware critique.

**Concrete impact:** Noise in every terminal close-out in the corporate Copilot rollout. Operators who encounter the message will attempt to "repair the activity log" for a file that is legitimately absent.

**Fix direction:** Guard the unreadable check behind `pac_level != PATH_AWARE_CRITIQUE_NONE` (equivalently behind the same guard used for `validate_path_aware_critique_gate`):

```python
if (
    pac_level != PATH_AWARE_CRITIQUE_NONE
    and pac_is_terminal
    and path_aware_critique_record_unreadable(session_set_dir)
):
```

---

### [Minor] A4 depth: presence-only gate passes empty `external-verification.md`

**File:** `ai_router/close_session.py`, `run()` (~line 1661)

**Defect:** Gate is `if not os.path.exists(ext_verify_path)`. A `touch external-verification.md` satisfies it. No minimum-content or structural check.

**Fix direction:** After confirming existence, open and check that the file has at least one non-whitespace byte (`os.path.getsize > 0` or a quick `.read().strip()`).

---

### [Minor] Interactive TTY branch of the external-verification soft gate shows no corrective guidance before the `[y/N]` prompt

**File:** `ai_router/close_session.py`, `run()` (~line 1683)

**Defect:**

```python
prompt = (
    f"external-verification.md missing at "
    f"{ext_verify_path}. Continue closing session "
    f"without it? [y/N]: "
)
answer = (prompt_fn(prompt) or "").strip().lower()
```

The non-interactive branch includes the full "Copy Prompt → Evaluate Session Set → paste → save reply here" instructions in `warning_msg`. The interactive TTY branch replaces this with a bare confirm/abort prompt. The operator at a TTY receives no actionable guidance.

**Fix direction:** Emit `warning_msg` to stderr before the `[y/N]` prompt in the interactive branch.

---

### [Minor] `_validate_args` missing incompatibility check for `--force` + `--no-router`

**File:** `ai_router/close_session.py`, `_validate_args()` (~line 425)

**Defect:** `--force` sets `method = "skipped"` in the verification resolution block; `--no-router` sets `manual_attestation` and subsequently `method = "manual"` in the branch above. When both are present, the `--no-router` attestation is computed and stored but then overridden by `method = "skipped"`, the `verification_completed` event is not emitted, and `manual_attestation` is silently dropped. The `closeout_force_used` event is emitted but `manual_attestation` (which may have come from `--reason-file`) is not included in its payload beyond `reason=reason_text`.

**Fix direction:** Add `if args.force and args.no_router: return "--force and --no-router are incompatible"` to `_validate_args`.

---

### [Minor] `_run_repair` Case 4 lacks `not case1_drift` guard — produces redundant messages alongside Case 1

**File:** `ai_router/close_session.py`, `_run_repair()` (~line 475)

**Defect:** Case 2 is guarded by `not case1_drift`; Case 4 is not. When Case 1 fires (state says closed, no closeout event), the state may still have `lifecycle == CLOSEOUT_PENDING` from a prior partial run, causing Case 4 to also fire and append a second, less-specific drift message for the same session.

**Fix direction:** Add `not case1_drift and` to the Case 4 condition.

---

## Hardening opportunities

1. **`session_number = 0` sentinel in `_emit_event`:** If `_peek_session_number` returns `None` (no `session-state.json` yet on a brand-new set), all emitted events get `session_number=0`. Repair logic that matches events by session number will fail to find them. Surface a warning rather than silently substituting 0, or derive session number from the disposition before falling back.

2. **`lock_handle.warnings` assumed to exist:** Both `outcome.messages.extend(lock_handle.warnings)` calls (repair and main branch) assume `acquire_lock` always returns an object with a `.warnings` attribute. A defensive `getattr(lock_handle, "warnings", [])` costs nothing and protects against version skew.

3. **`except Exception: pass` in `main()` for runtime-mode resolution:** This wrapper makes the A3 class of failure completely invisible in CI. At minimum `_logger.warning("runtime_mode resolution failed: %s", exc)` before the `pass` gives operators a signal without blocking close-out.

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [Correctness / False Positive / Major]: False Positive Finding on Redundant Error Messages

- **Category:** Correctness / False Positive
- **Severity:** Major
- **Details:**
    - **Violation:** The review claims a bug exists under the finding "[Minor] `_run_repair` Case 4 lacks `not case1_drift` guard — produces redundant messages alongside Case 1". It states: "When Case 1 fires ... Case 4 to also fire and append a second, less-specific drift message for the same session."
    - **Impact:** This finding is factually incorrect. A developer acting on this report would waste time investigating a non-existent bug. An incorrect finding in a code review changes the merge decision for the review itself, as it cannot be trusted without further verification.
    - **Evidence:** The two code paths are mutually exclusive. The logic for "Case 1" requires the variable `state_says_closed` to be `True`:
        ```python
        # ai_router/close_session.py:~1076
        state_says_closed = (
            state_lifecycle == SessionLifecycleState.CLOSED.value
            or (state or {}).get("status") == "complete"
        )
        # ai_router/close_session.py:~1085
        if case1_drift: # which can only be true if state_says_closed is true
            ...
        ```
        The logic for "Case 4" explicitly requires `state_says_closed` to be `False`:
        ```python
        # ai_router/close_session.py:~1238
        if (
            not state_says_closed
            and lifecycle in (
                SessionLifecycleState.CLOSEOUT_PENDING,
                SessionLifecycleState.CLOSEOUT_BLOCKED,
            )
        ):
            ...
        ```
        Because one path requires `state_says_closed` and the other requires `not state_says_closed`, they can never execute in the same invocation. The finding is unsubstantiated.
