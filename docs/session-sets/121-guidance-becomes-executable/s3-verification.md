**ISSUES FOUND**

**Issue 1:** The required `guidance_report --check` gate is still not passable after retiring the ceiling override.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/121-guidance-becomes-executable/activity-log.json:80-82`, `ai_router/router-config.yaml:1518-1522`, `ai_router/guidance_report.py:349-384,811-840`, `AGENTS.md`
- **Failure scenario:** A reviewer or close-out gate runs the plan-required guidance ceiling check. The same session set measured `AGENTS.md 2,208/2,031 (OVER 177)`, and this diff leaves `AGENTS.md` capped at `2031` while retiring the standing authorization. `guidance_report.py` fails `--check` on any manifest file over its per-file ceiling, so the required check remains red.
- **Acceptance criterion:** `python ai_router/guidance_report.py --check --repo-root .`
- **Acceptance expectation:** exit 0
- **Details:** Violation: the plan requires “`guidance_report --check` must pass” and the config/docs now claim ceilings were ratcheted down. Impact: this blocks the session’s own arithmetic proof and any merge/close decision depending on the required gate. Evidence: the overage is recorded in the activity log, the AGENTS ceiling is unchanged, and the checker fails on per-file overages.

**Issue 2:** `cli_glyph_guard` only partially enforces the ASCII-only CLI rule it claims to encode.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/planning/project-guidance.md:137-138`, `ai_router/cli_glyph_guard.py:9-14,55-63,90-100`, `ai_router/tests/test_cli_glyph_guard.py:126-148`, `ai_router/scripts/backfill_session_state.py:10,117-119`
- **Failure scenario:** A normal future edit adds non-ASCII console output to an existing CLI script under `ai_router/scripts/`, or uses `print(..., sep="—")` / `end="…"` in a top-level CLI helper. The guard’s default scan never enters `ai_router/scripts/`, and its tests explicitly bless a non-ASCII `sep` value even though it is written to stdout. The suite would pass while Windows `cp1252` users still hit the exact failure class L-064-4 was meant to prevent.
- **Acceptance criterion:** `JUDGMENT - The default glyph guard covers all repo CLI/helper source paths that can write console output, including ai_router/scripts, and treats non-ASCII print output controls such as sep/end as violations while preserving legitimate non-output Unicode look-alikes.`
- **Details:** Violation: the plan required encoding the “CLI / terminal output uses ASCII-only glyphs” rule “with falsifiers,” but the implementation narrows the rule to top-level `.py` files and positional `print()` string literals. Impact: the encoded lint gives false confidence and would allow regressions in real CLI surfaces already present in the repo. Evidence: the guard’s own scan scope and keyword-argument exclusion, the test that asserts `sep="—"` is compliant, and existing CLI scripts outside the scan boundary.