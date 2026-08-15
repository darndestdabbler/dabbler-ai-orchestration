ISSUES FOUND

**Issue 1:** The required Python test suite is left with a stale self-application assertion for the re-derived instruction cap.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/router-config.yaml:1431-1453`, `ai_router/guidance_ledger.py:1070-1089`, `ai_router/tests/test_guidance_ledger.py:847-853`, `.github/workflows/test.yml:276-308`
- **Failure scenario:** Every PR/push runs `python -m pytest -v`; `TestRetentionSettings.test_the_shipped_config_carries_the_derived_numbers` loads the shipped config, `retention_settings()` reads `instruction_line_cap: 25`, and the test still asserts `(30, 20, 22)`. That failure is probable because it is on the normal CI path and blocks the required full-suite verification.
- **Acceptance criterion:** JUDGMENT - The retention settings self-application test is aligned with the shipped `instruction_line_cap` value of 25, or the config is intentionally reverted with the derivation explained so the test and shipped config agree.
- **Details:** **Violation:** The session plan requires the “Required portion of the full test suite,” and CI’s Python job runs all pytest tests. **Impact:** A reasonable reviewer cannot merge a change that makes the required Python suite red across CI. **Evidence:** `router-config.yaml` now sets `instruction_line_cap: 25`; `guidance_ledger.retention_settings()` returns the config value when present; `test_guidance_ledger.py` still asserts `(30, 20, 22)`. The correct fix is to make the shipped-config test agree with the re-derived cap.

## NITS

- **Nit:** `cli_glyph_guard` deliberately ignores non-ASCII `print()` keyword output such as `sep="—"`, even though `sep`/`end` are emitted to the console. That leaves a small regression hole in the encoded ASCII-only rule.
- **Nit:** `DEFAULT_INSTRUCTION_LINE_CAP` and its comment in `guidance_ledger.py` still describe the old 22-cap blind spot after the repo config was re-derived to 25; clarify whether the no-config fallback intentionally remains 22.
- **Nit:** `total_ceiling_tokens: 12234` is higher than the sum of the listed per-file ceilings (12,145), so the total gate cannot bind before a per-file ceiling in any passing tree. If intentional, the config comment should explain the slack.