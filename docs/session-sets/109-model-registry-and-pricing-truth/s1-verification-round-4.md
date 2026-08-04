ISSUES FOUND

- **Issue 1: The default drift gate knowingly passes configured model IDs absent from provider enumeration**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Session 4 performs the planned correction of the routable `gpt-5.6` entry while the existing identity-only `gemini-3-pro` entry remains absent from Google’s inventory. The documented command, `python -m ai_router.model_inventory --check`, then exits 0 despite a configured `model_id` not appearing in its provider’s enumeration. This is probable because the current work explicitly documents `gemini-3-pro` as persistent identity-only drift and deliberately assigns it non-failing behavior.
  - **Details:**
    - **Violation:** The task requires: “**every `model_id` in `router-config.yaml` must appear in its provider's enumeration. A miss fails loud and names the offending entry.**” It provides no exception for disabled or identity-only entries.
    - **Impact:** Exit 0 can no longer certify the promised invariant. Once the intentional `gpt-5.6` specimen is corrected, automation or operators can receive a successful gate result for a registry that still violates the central requirement. That materially undermines the gate’s purpose and should block merging this implementation as conformant.
    - **Evidence:** In `ai_router/model_inventory.py`, `check_registry()` places an absent disabled model in `identity_drift`; `CheckResult.ok` ignores `identity_drift`; and `main()` only promotes it to failure when the optional `--strict` flag is supplied:
      ```python
      def ok(self) -> bool:
          return not self.routable_drift and not self.fatal

      failed = (not result.ok) or (args.strict and result.identity_drift)
      ```
      The committed lock omits `gemini-3-pro`, while `router-config.yaml` contains that ID with `is_enabled: false`. The standard `--check` command therefore reports the miss but treats it as success.
    - **Location:** `ai_router/model_inventory.py` — `CheckResult.ok`, `check_registry()`, and `main()`; `ai_router/router-config.yaml` — `gemini-3-pro`.
    - **Fix:** Make every missing configured provider `model_id` fail by default. If non-provider identity records legitimately require different semantics, separate them from the provider model registry or obtain an explicit specification change; `--strict` cannot be required to enforce an invariant the default command was expressly tasked to guarantee.

#### NITS

- **Nit:** The implementation directly departs from “following the existing `copilot_catalog.py` + `copilot-catalog.lock` pattern rather than inventing a second shape.” `model-inventory.lock` introduces a separate JSON schema, and `model_inventory.py` explicitly acknowledges rejecting the existing restricted-TOML shape. The rationale may be reasonable, but it does not satisfy the authored instruction. Reuse the existing lock shape or amend the specification explicitly.

- **Nit:** Repeated Anthropic cursors or Google page tokens are treated as successful completion, allowing a partial inventory to replace a complete snapshot. `fetch_anthropic()` and `fetch_google()` should raise `InventoryError` on a repeated cursor/token rather than return the partial collection.

- **Nit:** A 2xx response containing invalid JSON bypasses the documented per-provider partial-refresh handling because `_get_json()` lets JSON decoding exceptions escape, while `refresh_inventory()` catches only `InventoryError`. Convert decoding failures into `InventoryError`.

- **Nit:** `load_lockfile()` validates only the top-level `providers` object. Malformed provider blocks or non-string/unhashable model elements can cause raw `AttributeError` or `TypeError` instead of the promised fatal exit code 2. Validate schema version, provider-block shape, timestamps, model lists, and element types before checking.

- **Nit:** Documentation says historical metrics rows contain the three new fields as `null`, but no migration rewrites historical JSONL rows; those fields are absent from pre-change rows. Describe them as absent-or-null, or normalize them during loading.

- **Nit:** `_copilot_echoed_model()` claims defensive shape checking but calls `.get()` on any truthy `transport_metadata`. A truthy non-dictionary value raises `AttributeError`; check `isinstance(metadata, dict)` first.