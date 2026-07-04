## Code Review: Set 078 Session 4 Diff

---

### Issue 1: `assistant.message_delta` "data" unwrap not applied in production code

**Severity:** Major  
**Location:** `ai_router/cli_transport.py` — wherever `assistant.message_delta` events are parsed; `ai_router/tests/test_cli_transport.py` line ~127

**Issue:** The test fixture for `SUCCESS_STDOUT_LINES` was updated to wrap `message_delta` content under `"data"`:
```python
'{"type": "assistant.message_delta", "data": {"content": "Hello"}, "ephemeral": true}\n',
```
This implies the real CLI wraps `message_delta` the same way. The diff shows **no corresponding production-code change** for wherever `message_delta` events are consumed. If that path reads `envelope.get("content")` directly (as the pre-fix `assistant.message` path did), it is broken in exactly the same way — silently returning `""` for every streaming delta. The "fix every sibling site" convention named in the session header was not followed here.

**Fix:** Locate every branch in `cli_transport.py` that extracts a field from an `assistant.message_delta` event envelope and apply the same `event.get("data", {})` unwrap + `isinstance` guard:
```python
delta_data = event.get("data", {})
if not isinstance(delta_data, dict):
    # treat as empty delta, same convention as assistant.message path
    delta_data = {}
delta_content = delta_data.get("content", "")
if not isinstance(delta_content, str):
    delta_content = ""  # or raise, consistent with assistant.message policy
```

---

### Issue 2: `errors="replace"` silently corrupts content with no observable signal

**Severity:** Major  
**Location:** `ai_router/cli_transport.py` line ~221

**Issue:** `errors="replace"` substitutes `U+FFFD` (replacement character) for any byte sequence the UTF-8 codec cannot decode. For CLI JSONL output:

- UTF-8 multi-byte sequences only use bytes `0x80–0xFF`, which are disjoint from ASCII structural bytes (`{`, `"`, `:`, `\n`, etc.), so JSON structure is safe from corruption.
- **However**, the content *string* is silently corrupted: a real em dash (`—`, `\xe2\x80\x94`) becomes `\ufffd\ufffd\ufffd` (or one `\ufffd` depending on codec internals). A verification hash, equality check, or any downstream consumer of `result.content` will see wrong data with no indication anything went wrong.
- The reader thread's broad `except (OSError, ValueError)` already masks errors from the thread's perspective; `errors="replace"` adds a second silent-masking layer at the decode level. There is no log, metric, or counter emitted when a replacement occurs.

**Fix:** Emit a warning log when a replacement character appears in decoded output, so the corruption is at least observable:
```python
# After readline() in _reader_thread:
line = proc.stdout.readline()
if "\ufffd" in line:
    _LOG.warning(
        "cli_transport: UTF-8 decode replacement in reader line "
        "(byte sequence from CLI could not be decoded); "
        "content may be corrupted"
    )
```
Alternatively, accumulate a `_replacement_seen` flag on the result and surface it in `transport_metadata` so callers can decide whether to treat the response as trusted.

---

### Issue 3: `result` event sibling fields lack `isinstance` guards — inconsistent with the "fix every sibling site" rule

**Severity:** Major  
**Location:** `ai_router/cli_transport.py` — `_success_result()` handling of the `result` event envelope

**Issue:** The diff adds rigorous `isinstance` guards for every field extracted from `assistant.message`'s `data` dict. The `result` event's own fields — `sessionId` (string), `exitCode` (int), and the `usage` sub-dict's `premiumRequests` (int) — are read directly from the envelope with `.get()` but without matching `isinstance` checks. `test_malformed_usage_shape_is_generic_error` tests only the top-level `usage` shape (`list` vs `dict`), not its *contents* (e.g., `premiumRequests` being a string or bool). The same latent bad-type-coercion risk that rounds 2/3 fixed on the `assistant.message` path exists here.

**Fix:** Apply the same pattern to every field extracted from the `result` envelope and from `usage`:
```python
session_id = result_event.get("sessionId")
if session_id is not None and not isinstance(session_id, str):
    raise TypeError("result.sessionId is not a string")

exit_code_raw = result_event.get("exitCode")
if exit_code_raw is not None and type(exit_code_raw) is not int:
    raise TypeError("result.exitCode is not an int")

usage = result_event.get("usage", {})
if not isinstance(usage, dict):
    raise TypeError("result.usage is not a dict")

premium_raw = usage.get("premiumRequests", 0)
if premium_raw is not None and type(premium_raw) is not int:
    raise TypeError("result.usage.premiumRequests is not an int")
```

---

### Issue 4: `get_cli_version()` first-line truncation loses secondary version information without preserving it for drift detection

**Severity:** Minor  
**Location:** `ai_router/copilot_catalog.py` line ~346

**Issue:** The fix correctly addresses the TOML round-trip failure. However, the *full* banner (both lines) was previously what constituted the stored `cli_version` value for drift detection. Any drift-detection comparison that ran before this fix would have stored the multi-line string; the patched code now stores only the first line. On first run after patching, existing lockfiles with multi-line `cli_version` values will not match, triggering a spurious drift event that misidentifies "first-line-only" as a different CLI version.

Additionally: the first line in the real output is `"GitHub Copilot CLI 1.0.68."` — with a trailing period. If any semver parser is applied to extract the bare `1.0.68` version number, the trailing period must be stripped separately. The fix does not address this and the test asserts the period is retained.

**Fix (drift false-positive):** In the lockfile migration/load path, normalize stored `cli_version` values to first-line-only on read, not just on write, so old multi-line lockfile entries compare equal to newly written first-line values:
```python
def _normalize_cli_version(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return raw
    return raw.splitlines()[0].strip() or None
```
Apply `_normalize_cli_version` both when writing (current fix) and when reading back from the lockfile before drift comparison.

---

### Issue 5: Missing newline at end of both test files

**Severity:** Minor  
**Location:** `ai_router/tests/test_cli_transport.py` (final line); `ai_router/tests/test_copilot_catalog.py` (final line — implied by the `test_default_spawner_decodes_utf8_bytes_cp1252_cannot` ending without `\n`)

**Issue:** Both test files end without a trailing newline (`\ No newline at end of file` in the diff). This causes noisy diffs in future patches and violates POSIX text-file conventions. Some linters (e.g., `flake8 W292`) flag this.

**Fix:** Add a trailing newline to each file:
```python
    assert stdout == "caf—e"
↵   # (blank line / newline here)
```

---

### Issue 6: `test_missing_data_key_defaults_to_empty_dict_success` tests a success path that may not be intentional

**Severity:** Suggestion  
**Location:** `ai_router/tests/test_cli_transport.py` line ~433

**Issue:** The test asserts that `{"type": "assistant.message"}` with no `"data"` key at all is treated as a valid success returning empty content. The code achieves this via `.get("data", {})`. But a missing `"data"` key on a real CLI `assistant.message` event is structurally malformed — it is not equivalent to `"data": {}` (empty content) — and should probably be classified as a generic error the same way missing `"content"` would be if the field were required. Silently accepting it means a CLI version that omits `"data"` entirely (bug or wire change) is indistinguishable from one returning an empty response.

**Fix:** Either explicitly test that this is intentional policy (add a comment explaining *why* missing `"data"` is not malformed) or reclassify it as a malformed shape:
```python
message_data = final_message.get("data")
# "data" key absent is structurally malformed; distinguish from data={}
if message_data is None:
    raise TypeError("assistant.message missing required 'data' key")
if not isinstance(message_data, dict):
    raise TypeError("assistant.message data is not a dict")
```
Update `test_missing_data_key_defaults_to_empty_dict_success` to expect `generic_error` if this policy is adopted, or rename and comment it to explicitly document the "absent → empty dict" design decision.

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [Completeness / Major]: Review missed an unguarded field access, violating its own "fix every sibling site" principle

- **Category:** Completeness
- **Severity:** Major
- **Details:**
    - **Violation:** The review was explicitly tasked to look for "(a) any other place in cli_transport.py or copilot_catalog.py that reads a real-CLI-sourced string/dict without the same defensive shape-checking now applied to the assistant.message path (the 'fix every sibling site' convention this repo follows)." The review correctly identified this pattern's omission for `assistant.message_delta` and the `result` event, but it **missed** the `session.start` event handler.
    - **Impact:** A developer acting on the review's findings would fix the identified locations but leave the `session.start` handler vulnerable to the exact same class of type-safety bugs (e.g., `{"sessionId": 123}` instead of a string) that the original diff was intended to eradicate. This gives a false sense of security that all "sibling sites" have been fixed, when one remains. A complete fix is required before merge.
    - **Evidence:** In `ai_router/cli_transport.py`, the `_read_and_process_stdout` method contains the following code, which was not mentioned in the review:
      ```python
      if event_type == "session.start":
          self._session_id = event.get("sessionId")
      ```
      This is a direct, unguarded read of `sessionId` from a CLI-sourced dictionary. It lacks the `isinstance(..., str)` check that the review correctly demanded for sibling fields like `result_event.get("sessionId")`.
