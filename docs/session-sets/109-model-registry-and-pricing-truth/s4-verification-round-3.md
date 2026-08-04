VERIFIED — The four ledger fixes were checked against the remediation hunks: the drift check is registered, unchecked priced/routable entries now block `--fetch`, correction disclosures are limited to pre-fix costs, and the unsupported Luna pin was withdrawn. No blocking defect remains.

Fix verdict: L1 provider model drift check was unwired -- accepted-with-modification  
Fix verdict: L2 `--fetch` succeeded with unchecked configured models -- fix-accepted  
Fix verdict: L3 historical factors applied to post-correction rows -- accepted-with-modification  
Fix verdict: L4 Luna pin lacked required quality evidence -- fix-accepted  

#### NITS

- **Nit:** Missing only one drift-check input fails open.  
  **Location:** `ai_router/scripts/drift_guard.py`, `check_model_registry_matches_providers()`  
  **Fix:** Return `[]` only when both configuration and lockfile are absent. If exactly one is missing, return a violation. The current `if not config_path.is_file() or not lock_path.is_file(): return []` contradicts the function documentation and permits CI to pass after accidental deletion of `model-inventory.lock`.

- **Nit:** The correction disclosure’s date wording disagrees with its timestamp calculation.  
  **Location:** `ai_router/cost_report.py`, `historical_correction_notes()`  
  **Fix:** Replace “rows dated before 2026-08-04” with wording that includes the cutoff instant, such as “rows recorded before the 2026-08-04 20:00 UTC correction.” Same-day rows before 20:00 UTC are currently included in the calculation despite not being “before” that date.