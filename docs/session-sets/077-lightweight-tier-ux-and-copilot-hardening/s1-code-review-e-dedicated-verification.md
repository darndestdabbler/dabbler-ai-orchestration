# S1 code-review bundle e-dedicated-verification (raw, unedited)

> model: sonnet  tier: 2  cost_usd: 0.1827  total_cost_usd: 0.2080
> truncated: False  escalated: False
> verifier: gemini-pro  verdict: ISSUES_FOUND

---

## Pinned-finding triage

### A6 — CONFIRMED

**Function**: `validate_dedicated_verification`, cross-provider check loop.

`work_engines` is built as `{ _engine_provider(s)[0] … }` — a set of engine strings only. For a Copilot-locked shop every work session records `engine="copilot"` (regardless of which underlying model). The verification session also records `engine="copilot"`. The test `v_engine not in work_engines` evaluates `"copilot" not in {"copilot"}` → `False` for every verification session, so the loop never returns success and falls through to the failure path. The `provider` field (which carries the distinguishing model identity) is extracted by `_engine_provider` but discarded (`_v_provider`) before the comparison.

---

### A7 — CONFIRMED

**Function**: `read_verification_mode` (~line 151 onward).

The function opens and parses `activity-log.json` exclusively. The docstring states *"This reader intentionally consults the durable records only."* `read_spec_verification_mode` is the only path that touches `spec.md`, and it is consumed solely by `resolve_and_record_verification_mode` to populate the initial record. The Explorer TS side should mirror this exactly: spec field is the seed for the first-write prompt default; activity-log is the authoritative runtime source.

---

### Defect 3 — CONFIRMED (design property, not a code defect, but a real UX gap)

**Functions**: `record_verification_mode`, `resolve_and_record_verification_mode`.

Both functions write only to `activity-log.json` (a `verification_mode` entry). Neither touches `session-state.json`. Typed sessions are created only by a separate, manually-invoked `start_session --type verification`. Recording the mode is purely a durable preference marker; it triggers no automated follow-up. The docstrings describe this explicitly ("written once at set start"), so it is by design, but nothing in the recording path informs the operator that their next required action is to invoke `start_session --type verification`. The UX gap is the absence of a post-record advisory string or returned next-step directive.

---

## New findings

### [Critical] `seed_issues_envelope` non-atomic write creates unrecoverable corrupt state

**File**: `dedicated_verification.py`, `seed_issues_envelope` body (the `path.open("w")` block).

**Defect**: The function writes via a plain `path.open("w", encoding="utf-8")` / `json.dump`. Every other writer in this module uses `_write_activity_log_atomic` (temp-file + `os.replace`). If the process is killed mid-write (OOM, SIGKILL, power loss, or any exception after `open` but before `f.write("\n")`), the issues file is left as a zero-byte or partially-written stub.

**Concrete impact** (two compounding failures):

1. `read_latest_issues_envelope` silently skips the file on `json.JSONDecodeError`, so `derive_state` sees `latest_issues = None` → `issues = []`. A completed verification session with no issues envelope and any non-empty verdict falls into `not issues → STATE_CLOSED_VERIFIED`, mis-reporting the set as clean.
2. The `if path.exists(): raise FileExistsError` guard prevents any retry from correcting the stub. The corrupt file is permanently entombed unless manually deleted; the set can never record findings for that round again.

**Fix direction**: Replace the `path.open`/`json.dump` block with the same `_write_json_atomic(path, envelope)` helper used by the activity-log writer (extract `_write_activity_log_atomic` to a generic `_write_json_atomic(path: Path, data: dict) -> None` and call it here).

---

### [Major] `change_verification_mode` Gate 3 drops the L-069-1 `UnicodeError` guard

**File**: `dedicated_verification.py`, Gate 3 block inside `change_verification_mode`.

```python
except (OSError, json.JSONDecodeError):
    loaded = None
```

**Defect**: `UnicodeError` is a `ValueError` subclass, not a `json.JSONDecodeError` subclass. An activity-log with invalid UTF-8 bytes (written by a cp1252 tool on Windows, or corrupted) raises `UnicodeError` during `f.read()`, which is not caught here, propagates out of `change_verification_mode`, and breaks its documented "never raises for a gate refusal" contract.

The codebase already identified this exact bug class as "L-069-1" and fixed it in `read_verification_mode`, `has_verification_mode_record`, and every other reader. This is the only reader that regressed.

**Requirement violated**: The "never raises for a gate refusal" invariant documented in the `change_verification_mode` docstring.

**Fix direction**: `except (OSError, json.JSONDecodeError, UnicodeError):` — identical to the fix already applied in `read_verification_mode`.

---

### [Major] A6 fix: `(engine, provider)` tuple comparison required, not engine alone

**File**: `dedicated_verification.py`, `validate_dedicated_verification`, cross-provider check block.

This is the action item flowing from the confirmed A6 finding. The fix needs care on three sub-points:

1. **Build a set of `(engine, provider)` tuples** for work sessions, discard `(None, None)`.
2. **Fail-closed baseline check**: replace `if not work_engines:` with `if not work_ep_pairs:` (same semantics, new variable).
3. **Per-verification-session check**: compare the full `(v_engine, v_provider)` tuple — treat `(None, None)` as unconfirmable (same as current `v_engine is None` continue). A verification session whose `provider` is `None` but whose `engine` differs from all work engines still satisfies the check (partial match; engine alone is sufficient when provider is absent).

Edge case: a shop that records `provider=None` everywhere degrades gracefully to engine-only comparison, preserving the current behaviour for non-Copilot flows.

---

### [Minor] `derive_state`: empty issues envelope + non-"VERIFIED" verdict closes as `CLOSED_VERIFIED`

**File**: `dedicated_verification.py`, `derive_state`, `SESSION_TYPE_VERIFICATION` branch.

```python
verdict = str(latest.get("verificationVerdict") or "").strip().upper()
if verdict == "VERIFIED" or not issues:
    return STATE_CLOSED_VERIFIED
```

When a verification session is complete, `verificationVerdict` is absent or blank, **and** there is no `sN-issues.json` file (`issues = []`), the `not issues` arm fires and returns `STATE_CLOSED_VERIFIED`. A missing verdict + missing issues envelope is ambiguous: the operator may not have written either artefact yet (workflow error), not a genuine clean run. Returning `CLOSED_VERIFIED` silently accepts the ambiguity as a pass.

**Fix direction**: Require an explicit `"VERIFIED"` verdict when no issues file exists. When verdict is blank and issues is empty, return `STATE_AWAITING_HUMAN` with a "missing verdict and issues envelope" reason, so the operator is prompted to resolve the ambiguity.

---

### [Minor] `record_verification_mode` silent-loss TOCTOU on concurrent callers

**File**: `dedicated_verification.py`, `record_verification_mode`.

The read (`json.load`) and the write (`_write_activity_log_atomic`) are not a single atomic operation. Two concurrent callers (e.g., two parallel `start_session` invocations on the same set) both read the same snapshot, both append their entry to their in-memory copy, and the second `os.replace` overwrites the first's entry. The activity-log loses one entry silently. The "written once at set start" invariant in `resolve_and_record_verification_mode` makes this unlikely in production (it's guarded by `has_verification_mode_record`) but the general writer has no protection.

**Fix direction**: If a file-lock is unavailable, document the single-writer assumption explicitly. Alternatively, make the read+append+write a single critical section using a `.lock` sentinel file (cross-platform) or by verifying the file's mtime between read and write and retrying on conflict.

---

## Hardening opportunities

1. **Extract `_write_json_atomic`**: `_write_activity_log_atomic` is specialized to activity-log; a parameter-named `_write_json_atomic(path: Path, data: dict) -> None` would be reusable by `seed_issues_envelope`, `change_verification_mode`'s minimal-log creation, and future writers.

2. **`derive_state` session status enumeration**: the ladder handles `in-progress` and `complete` but treats any other status (hypothetical `failed`, `cancelled`) as complete. Adding `elif latest_status not in (SESSION_STATUS_COMPLETE, SESSION_STATUS_IN_PROGRESS): return STATE_AWAITING_HUMAN` closes the implicit else.

3. **`corrective` string in `validate_dedicated_verification`**: it hard-codes `{session_set_dir}` which on Windows resolves to a backslash path inside a shell command fragment. Use `Path(session_set_dir).as_posix()` or wrap in quotes to make the shell snippet safe cross-platform.

4. **A6 post-fix**: after changing to `(engine, provider)` comparison, the "no baseline to compare against" message should distinguish between *all providers are None* (unrecorded) and *no work sessions at all* (different corrective action).

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [Completeness / Major]: ** Incomplete identification of a critical non-atomic write vulnerability
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The review was tasked with a comprehensive check for bugs. The AI produced a "Critical" finding titled "`seed_issues_envelope` non-atomic write creates unrecoverable corrupt state," correctly identifying the risk of creating a zero-byte or partial file using a direct `path.open("w")`. However, the review failed to identify that the exact same bug pattern exists in another function.
    - **Impact:** This omission means that if a developer fixes only the reported bug in `seed_issues_envelope`, a second critical vulnerability remains in the codebase. Specifically, the creation of a new `activity-log.json` is still non-atomic, and a failure during that write would leave the session set in a corrupt, unrecoverable state, preventing any further actions. This changes the merge decision for the remediation work, as the proposed fix would be incomplete and leave the system exposed to the very risk the finding was meant to eliminate.
    - **Evidence:** The function `resolve_and_record_verification_mode` contains a non-atomic write when creating a new `activity-log.json` if one does not exist. The AI's "Critical" finding only names `seed_issues_envelope`. The missed vulnerability is here:
      ```python
      # FILE: ai_router/dedicated_verification.py
      # LOCATION: line ~307
      with log_path.open("w", encoding="utf-8") as f:
          json.dump(minimal, f, indent=2)
          f.write("\n")
      ```
