# S1 code-review bundle c-start-runtime (raw, unedited)

> model: sonnet  tier: 2  cost_usd: 0.1814  total_cost_usd: 0.2058
> truncated: False  escalated: False
> verifier: gemini-pro  verdict: VERIFIED

---

## Pinned-finding triage

### A5 — start_session never surfaces an owed/pending verification
**CONFIRMED.**

`_run_under_lock` (~line 330–480) checks for skip-ahead, re-open, and in-flight conflicts, then calls `register_session_start` and the three capture helpers. There is **no code anywhere** in `_run_under_lock`, `_run_typed_session`, or `_run_typed_handoff` that inspects `verificationMode`, the typed-session ledger, or `completedSessions` to detect whether the previous work session closed without a paired verification/remediation cycle. The drift advisory (`summarize_drift`) runs but covers schema drift, not lifecycle owed-verification debt. The gap is structural: the only verification-aware code path is `_capture_verification_mode`, which records the choice but never audits compliance.

---

### A3 (partial) — `is_no_router_mode` never consulted by close_session's external-verification gate
**PARTIAL** from these files; the `runtime_mode.py` side is fully evaluable.

`is_no_router_mode` (lines ~156–178) explicitly documents that its lazy resolution **does NOT cache** (`_NO_ROUTER_MODE` is never set by that function). This means any caller (including close_session's gate if it uses this path rather than `resolve_no_router_mode`) gets a fresh re-evaluation on every call — inconsistent with the module's stated "resolve once, cache, read many" contract. Additionally, `is_no_router_mode`'s lazy path uses a bare `from session_state import find_active_session_set` (not the try/relative pattern applied everywhere else), meaning it silently falls back to `False` under pip-install mode (the exact S5 UAT bug already fixed in `start_session.main` and `_spec_tier` but not backfilled here). Whether `close_session` calls this function cannot be confirmed from these files; the A3 partial stands.

---

### Hard-CONFIRM: `orchestrator.provider` persistence per session
**CONFIRMED**, with omit-null caveat.

All three writer call-sites pass the value:

- `_run_under_lock` → `register_session_start(..., orchestrator_provider=args.provider)` (line ~438)
- `_run_typed_session` → `register_typed_session_start(..., orchestrator_provider=args.provider)` (line ~553)
- `_run_typed_handoff` → `register_typed_session_handoff(..., orchestrator_provider=args.provider)` (line ~607)

`--provider` defaults to `None`; per the P2 omit-null contract stated in the module docstring and the `--model`/`--effort` help text, a `None` value causes the key to be **dropped entirely** from the orchestrator block rather than written as `null`. A Copilot consumer that never passes `--provider` will produce an orchestrator block with no `provider` field — the key is simply absent in the snapshot.

---

## New findings

### [Critical] `view.total_sessions > 0` raises `TypeError` on plan-less sets

**File:** `start_session.py` | **Location:** `_run_under_lock`, total_sessions resolution block (~line 450–456)

```python
total_sessions = (
    view.total_sessions if view is not None and view.total_sessions > 0 else None
)
```

**Defect:** `view.total_sessions` is `None` for plan-less in-progress sets (`totalSessions: null` in the snapshot). Python evaluates `None > 0` eagerly — it does **not** short-circuit after `view is not None` — and raises `TypeError: '>' not supported between instances of 'NoneType' and 'int'`. This is not inside a `try/except`; the exception propagates out of `_run_under_lock`, through `run()`'s `finally` (lock is released), and exits as an unhandled exception (code 1), violating the documented exit-code contract.

**Concrete impact:** Any plan-less set (declared with `totalSessions: null`, or a set whose `--total-sessions` was never supplied) that has already had one `start_session` run (so `read_progress` returns a non-None view with `total_sessions=None`) will crash every subsequent `start_session` call. The "re-start an in-flight session" idempotent-resume case — the most common operator re-entry — is broken for all plan-less sets.

**Requirement violated:** The module docstring's plan-less snapshot guarantee: "A null result writes a plan-less in-progress snapshot … so the Session Set Explorer renders 0/?".

**Fix direction:**
```python
total_sessions = (
    view.total_sessions
    if view is not None
    and view.total_sessions is not None
    and view.total_sessions > 0
    else None
)
```

---

### [Major] Typed-session paths skip `_capture_path_aware_critique` and `_capture_contract_gate`

**File:** `start_session.py` | **Location:** `_run_typed_session` (~line 541–585) and `_run_typed_handoff` (~line 595–640)

**Defect:** `_run_under_lock` (work sessions) calls all three capture helpers in sequence: `_capture_verification_mode`, `_capture_path_aware_critique`, `_capture_contract_gate`. `_run_typed_session` calls only `_capture_verification_mode`, with a comment acknowledging the "first start is typed session" edge case. `_run_typed_handoff` calls **none** of the three. `_capture_path_aware_critique` and `_capture_contract_gate` are never called from either typed path.

**Concrete impact:** If a set's first boundary call is `start_session --type verification` (valid per Set 057), the `pathAwareCritique` and `contractGate` policies are never seeded from the spec.md configuration block. The Set 066 and Set 070 close-out gates then silently no-op (they check the activity-log entry that was never written), which is precisely the "Set 069 contractGate seed was never captured" bug the Set 070 commentary says it closes — but only for work sessions. Typed-session sets are still broken.

**Requirement violated:** Set 070 S1 ("closes the Set 069 S6 gap"), Set 066 S1 close-out gate correctness.

**Fix direction:** Add the two missing capture calls to `_run_typed_session` immediately after `_capture_verification_mode`. For `_run_typed_handoff`, add all three (same rationale: immutable-after-first-record contract means they are no-ops if already set, but they must fire on the first typed start).

---

### [Major] `is_no_router_mode()` lazy `session_state` import uses bare (non-relative) import — S5 UAT fix not backfilled

**File:** `runtime_mode.py` | **Location:** `is_no_router_mode`, ~line 162–168

```python
from session_state import find_active_session_set
```

**Defect:** Every other dynamic import in both files uses the `try bare / except ImportError: from .module import` pattern that the Set 048 S5 UAT fix introduced. This call is the only site that doesn't. Under pip-install mode (the production path) `session_state` is `ai_router.session_state`; the bare absolute import raises `ModuleNotFoundError`, which is caught by the enclosing `except Exception: pass`, causing `is_no_router_mode()` to silently return `False`. Any consumer (e.g., a future close_session gate, a route/verify short-circuit) that calls `is_no_router_mode()` without a prior `resolve_no_router_mode()` call — the scenario the lazy path was designed for — will always get `False` in production, making `tier: lightweight` + spec-only activation invisible to those consumers.

**Concrete impact:** Spec-tier `lightweight` detection via the lazy path is a dead letter in pip-install deployments for all callers other than `start_session.main` (which calls `resolve_no_router_mode` explicitly).

**Fix direction:**
```python
try:
    from .session_state import find_active_session_set
except ImportError:
    from session_state import find_active_session_set  # type: ignore[no-redef]
```

---

### [Minor] `_infer_next_session()` is dead code with divergent logic

**File:** `start_session.py` | **Location:** `_infer_next_session` (~line 252–263)

The function is never called. `_run_under_lock` inlines equivalent logic but also handles the `current_in_flight` branch (`requested = current`), which `_infer_next_session` omits. The divergence means a future refactor that calls `_infer_next_session` would silently drop idempotent-resume behavior.

**Fix direction:** Remove the function or replace the inline logic with a call to it after adding the `current_in_flight` branch. Add a `# noqa: dead-code` comment if kept only for documentation.

---

### [Minor] `--total-sessions 0` or negative silently falls through without diagnostics

**File:** `start_session.py` | **Location:** `_run_under_lock`, ~line 443–448

```python
if isinstance(cli_total, int) and cli_total > 0:
    total_sessions = cli_total
else:
    total_sessions = ...  # view fallback
```

`--total-sessions 0` (type-coerced by argparse) silently falls through to the view-based resolution without any warning. The operator sees a successful run but their explicit `--total-sessions 0` was ignored. On a fresh set with no existing state, this produces a plan-less snapshot when the operator likely intended an error.

**Fix direction:** Add an explicit check before the condition: if `cli_total is not None and (not isinstance(cli_total, int) or cli_total < 1)`, print a warning to stderr and return `EXIT_USAGE`.

---

### [Minor] `closed` vs `closed_set` used interchangeably for `max()` — inconsistency creates future footgun

**File:** `start_session.py` | **Location:** `_run_under_lock`, ~line 358 and ~line 415

```python
requested = (max(closed) + 1) if closed else 1        # uses list
expected_next = (max(closed_set) + 1) if closed_set else 1  # uses set
```

Both are functionally equivalent today but the inconsistency makes it non-obvious which is canonical. A future change that makes `closed` a generator (e.g., to avoid materialising a large list) would break one but not the other.

**Fix direction:** Use `closed_set` consistently for both comparisons, or compute `max_closed` once and reuse.

---

## Hardening opportunities

1. **Lock acquisition timeout configurability:** `DEFAULT_ACQUIRE_TIMEOUT_SECONDS` is used directly with no CLI override. A Copilot consumer in a slow CI environment with long close_session runs has no recourse except source-editing. Consider `--lock-timeout` as an optional arg with `DEFAULT_ACQUIRE_TIMEOUT_SECONDS` as default.

2. **Broad `except Exception: pass` in capture helpers:** All three `_capture_*` helpers swallow every exception. A write failure to `activity-log.json` (disk full, permissions) that silently no-ops means the close-out gate will fail later with a confusing "no policy record" message rather than a clear "could not write at start" message. Logging to `stderr` at minimum (consistent with the drift advisory pattern) would aid diagnosis without blocking the write.

3. **`resolve_no_router_mode` idempotency and test isolation:** The module-level `_NO_ROUTER_MODE` global is documented but `reset_for_tests()` must be called in every test's teardown. Consider wrapping the cache in a context-var or threading.local if this module ever runs in a multi-tenant process.