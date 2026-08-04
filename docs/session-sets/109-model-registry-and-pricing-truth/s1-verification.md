ISSUES FOUND

- **Issue 1: Verifier-only models are incorrectly classified as identity-only and can bypass the drift gate**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An operator configures a model with `is_enabled: false` and `is_enabled_as_verifier: true`, a supported and probable configuration given the registry’s separate generator/verifier flags. If its `model_id` is misspelled or removed by the provider, `--check` reports only an identity note and exits 0; verification then routes to the invalid ID and fails at runtime.
  - **Details:**
    - **Violation:** The task requires that “every `model_id` in `router-config.yaml` must appear in its provider’s enumeration” and that a miss “fails loud.” The lenient exception is specifically for identity-only entries that are “never routed to.”
    - **Impact:** A genuinely routable verifier can pass the gate despite an invalid ID, materially defeating the gate’s fail-closed objective.
    - **Evidence:** `check_registry()` in `ai_router/model_inventory.py` calculates routability solely as:
      ```python
      routable = bool(entry.get("is_enabled", True))
      ```
      It ignores `is_enabled_as_verifier`, even though `router-config.yaml` documents the two flags as separate controls. No test covers a verifier-only entry.
    - **Fix:** Treat an entry as routable when either generator or verifier routing is enabled:
      ```python
      routable = bool(entry.get("is_enabled", True)) or bool(
          entry.get("is_enabled_as_verifier", False)
      )
      ```
      Add a test proving a missing verifier-only model exits 1.

- **Issue 2: The required requested-versus-served mismatch flag was not implemented**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** OpenAI routinely returns a dated or substituted served ID, as the supplied fixture and live evidence demonstrate. Metrics rows contain two different strings, but no field, warning, report, or reader identifies them as a mismatch. A metrics consumer expecting the promised flag receives no signal unless it independently discovers and implements the comparison.
  - **Details:**
    - **Violation:** Step 5 explicitly requires: “persist it alongside the requested id in the metrics row; **flag any mismatch**.”
    - **Impact:** The frequent mismatch scenario is recorded but not surfaced. This leaves a promised observability mechanism incomplete and makes substitutions easy to miss—the failure the session was intended to expose.
    - **Evidence:** `metrics.record_call()` stores only `requested_model_id` and `served_model_id`. The complete diff adds no mismatch field, warning, reporting function, or read-time derivation. `test_the_mismatch_is_derivable_from_the_row()` merely asserts inequality; it does not test any implemented flag. The changelog’s claim that a mismatch “is derived at read time” is therefore unsupported by code.
    - **Fix:** Implement an explicit signal, such as a nullable `served_model_mismatch` field, or add an actual metrics reader/report that derives and flags mismatches. Test the delivered flagging behavior, including `served_model_id is None`.

- **Issue 3: Google enumeration can disclose the API key in error output**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A normal Google refresh receives a 429 or 5xx response while the key remains valid. Because the key is in the query string, `httpx.HTTPStatusError` includes it in the request URL; `probe_provider()` embeds that exception in `InventoryError`, and the CLI prints it to stderr. In captured operator, CI, or session logs, the live credential is exposed.
  - **Details:**
    - **Violation:** The endpoint boundary explicitly describes a URL with “no API key embedded,” and the key is obtained through `secret_resolver`; that secret must not be emitted through diagnostics.
    - **Impact:** Routine provider errors can leak a live credential into persistent logs, which is a merge-blocking security defect.
    - **Evidence:** `fetch_google()` sends:
      ```python
      params = {"key": api_key, "pageSize": _PAGE_SIZE}
      ```
      `_get_json()` calls `response.raise_for_status()`, whose exception includes the full URL. `probe_provider()` then does:
      ```python
      raise InventoryError(f"{provider} enumeration failed: {exc}") from exc
      ```
      and `main()` prints the resulting message.
    - **Fix:** Send the key using Google’s `x-goog-api-key` header and sanitize exception reporting so URLs, query parameters, and headers containing credentials are never rendered. Add a test asserting a sentinel key is absent from failure output.

#### NITS

- **Nit:** A 200 response with malformed JSON escapes as a raw JSON-decoding exception rather than a per-provider `InventoryError` → **Location:** `_get_json()` / `refresh_inventory()` → **Fix:** Wrap JSON decoding errors as `InventoryError` so partial-refresh failure handling remains consistent.

- **Nit:** Repeated pagination cursors are accepted as a successful partial enumeration → **Location:** `fetch_anthropic()` and `fetch_google()` → **Fix:** Raise `InventoryError` on a repeated cursor/token instead of returning an incomplete catalog that can create false drift findings.

- **Nit:** Page parsers silently discard malformed individual model records → **Location:** `parse_openai_page()`, `parse_anthropic_page()`, and `parse_google_page()` → **Fix:** Fail the page when expected model entries lack a valid string ID; otherwise a partial provider response can be committed as authoritative.

- **Nit:** Lockfile validation is too shallow → **Location:** `load_lockfile()` and `check_registry()` → **Fix:** Validate `schema_version`, provider-block types, `models` element types, count consistency, and timestamps before checking. A malformed truthy provider block can currently cause an `AttributeError`, while an unsupported schema is silently consumed.

- **Nit:** Non-dictionary model entries are silently skipped rather than reported fatal → **Location:** `check_registry()` → **Fix:** Add a fatal finding for malformed registry entries so the “every model” gate does not fail open on invalid configuration shape.

- **Nit:** Documentation incorrectly says historical rows contain the new fields as `null` → **Location:** `ai_router/metrics.py` schema comments and `ai_router/CHANGELOG.md` → **Fix:** State that pre-change JSONL rows omit the fields unless a migration/read-normalization layer is added.

- **Nit:** Under `--strict`, the identity-drift heading uses `[x]`, but each detailed finding still renders `[~]` → **Location:** `render_check()` and `DriftFinding.render()` → **Fix:** Pass strict severity into detail rendering so all markers agree with the failing exit status.

- **Nit:** `_copilot_echoed_model()` assumes every truthy `transport_metadata` value is a dictionary despite claiming defensive shape handling → **Location:** `ai_router/__init__.py` → **Fix:** Check `isinstance(metadata, dict)` before calling `.get()`.

- **Nit:** Lockfile writes are non-atomic → **Location:** `write_lockfile()` → **Fix:** Write to a sibling temporary file, flush, and atomically replace the destination to avoid a truncated lockfile after interruption.

- **Nit:** A failed provider retained from an older snapshot is initially printed with a success-style `[ ]` line during refresh before the later failure message → **Location:** `main()` refresh output → **Fix:** Track refreshed providers separately and label retained snapshots explicitly.