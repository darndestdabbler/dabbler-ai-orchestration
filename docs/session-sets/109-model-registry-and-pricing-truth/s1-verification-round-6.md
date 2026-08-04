VERIFIED — The main paths satisfy the session requirements: all three providers are enumerated, every configured inventory miss now fails, requested/served IDs and mismatches propagate through metrics, and Google credentials no longer enter request URLs. I found no probable, materially impairing defect that should block the close.

#### NITS

- **Nit:** Repeated pagination cursors are accepted as successful completion, allowing a partial catalog to replace a complete snapshot. → **Location:** `ai_router/model_inventory.py`, `fetch_anthropic()` and `fetch_google()` → **Fix:** Raise `InventoryError` when a cursor or page token repeats.

- **Nit:** A successful HTTP response containing invalid JSON escapes the documented per-provider failure handling as a raw decoding exception. → **Location:** `ai_router/model_inventory.py`, `_get_json()` and `refresh_inventory()` → **Fix:** Convert JSON decoding failures to `InventoryError`.

- **Nit:** Parsers silently skip malformed model entries and coerce non-string IDs with `str()`. A partially changed provider response could therefore produce an incomplete authoritative snapshot. → **Location:** `parse_openai_page()`, `parse_anthropic_page()`, and `parse_google_page()` → **Fix:** Require every model entry to contain a non-empty string ID or fail the page.

- **Nit:** Lockfile validation is shallow; malformed provider blocks, unsupported schema versions, or non-string model elements can cause raw exceptions or misleading drift results instead of exit code 2. → **Location:** `load_lockfile()` and `check_registry()` → **Fix:** Validate schema version, provider-block shapes, timestamps, model lists, element types, and count consistency when loading.

- **Nit:** Lockfile replacement is non-atomic, so interruption during the write can destroy the previous usable snapshot. → **Location:** `write_lockfile()` → **Fix:** Write and flush a sibling temporary file, then atomically replace the destination.

- **Nit:** A retained snapshot for a provider that failed refresh is initially printed with the same success-style marker as a freshly probed provider. → **Location:** `main()` refresh reporting → **Fix:** Track refreshed and retained providers separately and label retained snapshots explicitly.

- **Nit:** Historical metrics rows are documented as containing the three new fields with `null`, but existing JSONL rows are not migrated and actually omit them. → **Location:** `ai_router/metrics.py` schema comments and `ai_router/CHANGELOG.md` → **Fix:** Document historical fields as absent-or-null, or normalize them in `load_metrics()`.

- **Nit:** `_copilot_echoed_model()` claims defensive shape checking but calls `.get()` on any truthy `transport_metadata`; a non-dictionary value raises `AttributeError`. → **Location:** `ai_router/__init__.py`, `_copilot_echoed_model()` → **Fix:** Verify `isinstance(metadata, dict)` before accessing it.

- **Nit:** The implementation explicitly introduces a JSON lockfile shape despite the plan directing it to follow the existing `copilot_catalog.py` and restricted-TOML lock pattern rather than invent another shape. The deviation is reasoned and functionally adequate, but remains a textual plan departure. → **Location:** `ai_router/model_inventory.py` module documentation and `model-inventory.lock` → **Fix:** Reuse the established lock shape or formally amend the specification.