ISSUES FOUND

## Issue 1: Google refresh errors disclose the API key

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** An operator runs `--refresh` and Google returns a routine HTTP error such as 401, 403, 429, or 5xx. `httpx.HTTPStatusError` includes the complete request URL, including `?key=<API_KEY>`, and the CLI prints that exception to stderr. Refresh failures are a probable operational event over repeated use, and stderr is commonly retained in terminal history, CI logs, or session artifacts.
- **Location:** `ai_router/model_inventory.py` → `fetch_google()`, `_get_json()`, `probe_provider()`, and `main()`
- **Details:**
  - **Violation:** Provider credentials must not cross into operator-visible diagnostics. The module also describes its enumeration URL as having “no API key embedded,” but the actual Google request embeds it in the query string.
  - **Impact:** A normal provider failure leaks a live Google credential. This is security-sensitive and should block merging the refresh implementation.
  - **Evidence:** `fetch_google()` passes `{"key": api_key}` as URL parameters. `_get_json()` calls `response.raise_for_status()`. `probe_provider()` interpolates the resulting exception into `InventoryError`, and `main()` prints it:
    ```python
    params = {"key": api_key, ...}
    ...
    raise InventoryError(f"{provider} enumeration failed: {exc}")
    ...
    print(f"[x] NOT REFRESHED: {failure}", file=sys.stderr)
    ```
- **Fix:** Prefer the supported `x-goog-api-key` header instead of a query parameter, and sanitize all HTTP diagnostics so credentials and sensitive query parameters can never be rendered.

## Issue 2: Requested-versus-served mismatches are recorded but never flagged

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A typical OpenAI alias request is served by a dated snapshot or another variant, as the session’s own live evidence demonstrates. The metrics row contains two unequal strings, but no production reader, report, warning, or explicit field identifies the mismatch. Operators therefore receive no flag unless they independently build a comparison over raw JSONL data. This is probable on the main OpenAI path and leaves an explicit session objective incomplete.
- **Location:** `ai_router/metrics.py`, `ai_router/__init__.py`, and `ai_router/tests/test_served_model_recording.py`
- **Details:**
  - **Violation:** The task requires: “Capture the `model` field the provider returns and persist it alongside the requested id in the metrics row; **flag any mismatch**.”
  - **Impact:** Served-model truth is persisted, but the promised mismatch signal does not exist. A reviewer cannot conclude that the full Step 5 deliverable was implemented.
  - **Evidence:** Production code only writes `requested_model_id` and `served_model_id`. The changelog says mismatch is “derived at read time,” but no read-time derivation or presentation code exists in the diff. The test named `test_the_mismatch_is_derivable_from_the_row` merely asserts:
    ```python
    assert row["requested_model_id"] != row["served_model_id"]
    ```
    That proves derivability, not flagging.
- **Fix:** Add an explicit mismatch indicator to the metrics row, or implement a production metrics reader/report that derives and visibly surfaces mismatches. Add a routed-call test proving that the flag is produced when requested and served IDs differ.

## NITS

- **Nit:** `fetch_anthropic()` and `fetch_google()` treat a repeated pagination cursor as successful completion. A looping server therefore produces a partial inventory that can overwrite a complete prior snapshot and create false drift. Repeated cursors should raise `InventoryError`.
- **Nit:** All parsers silently skip malformed model entries and accept the response if at least one valid ID remains. A partial provider schema change could consequently write an incomplete snapshot instead of failing closed.
- **Nit:** A 2xx response with invalid JSON raises `JSONDecodeError`, which is neither converted to `InventoryError` nor caught by `refresh_inventory()`. This bypasses the documented per-provider failure handling and produces a traceback rather than preserving and reporting that provider’s snapshot cleanly.
- **Nit:** `load_lockfile()` does not validate `schema_version`, `generated_by`, provider-block shapes, or model element types. An incompatible or partially corrupted lockfile can be treated as authoritative until later membership checks produce misleading drift.
- **Nit:** `write_lockfile()` writes directly to the destination rather than using a temporary file plus atomic replacement. Interruption during refresh can leave the only snapshot truncated.
- **Nit:** On a partial refresh, the CLI prints retained stale provider blocks in the same success-style format as freshly probed blocks before reporting `NOT REFRESHED`, which can momentarily misrepresent what was updated.