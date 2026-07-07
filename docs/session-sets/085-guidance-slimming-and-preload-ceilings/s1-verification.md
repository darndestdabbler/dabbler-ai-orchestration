## ISSUES FOUND

**Issue 1: `guidance_report --check` is fail-open; the CI gate can silently stop enforcing the manifest**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task’s contract says **“CI is the single enforcement point … The gate is one dedicated ubuntu job running `guidance_report --check`.”** It also says Session 1 **“Ends with: `guidance_report --check` runs green in CI with every required-reading file under a declared ceiling.”**
  - **Impact:** A config-load failure does **not** fail the gate; it silently falls back to the legacy two-file path. That means the dedicated CI job can go green while checking neither the preload manifest entries nor the total ceiling. This defeats the anti-rebloat gate and would change a merge decision, because the session’s core deliverable is an actually-enforcing CI ceiling check.
  - **Evidence:** In `ai_router/guidance_report.py`, `main()` does:
    ```python
    try:
        from . import config as router_config
        config = router_config.load_config()
    except Exception:
        config = None
    cfg = load_guidance_config(config)
    ```
    Then it chooses the manifest branch only if `cfg.preload` is present:
    ```python
    manifest = cfg.preload
    preload_reports = build_preload_reports(...) if manifest is not None else None
    reports = preload_reports if preload_reports is not None else legacy_reports
    ```
    So **any** exception from `load_config()` drops the command onto the legacy branch. The new workflow comment explicitly admits this behavior: **“without a successful config load the check would silently degrade to the legacy two-file path and stop gating the manifest.”** The job only papers over one known failure mode (missing provider env vars) by setting dummy keys; it does not fix the fail-open behavior.
  - **Correct answer:** `--check` must fail non-zero when router config cannot be loaded/validated for a manifest-enabled repo, not silently revert to legacy behavior.

**Issue 2: No-manifest back-compat is broken for `--json` output**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The agreed contract says **“Back-compat is a hard requirement. A repo with no `preload:` block must keep byte-identical two-file behavior.”** The plan likewise says **“Absent manifest → exactly today’s behavior.”**
  - **Impact:** Existing consumer repos without a `preload:` block now get different `guidance_report --json` output. That is a direct contract break for a stated hard-compatibility requirement, and it can break downstream tooling/snapshots that consume the legacy JSON shape.
  - **Evidence:** The old JSON payload only emitted:
    ```python
    name, bytes, lines, tokens, ceiling, over_ceiling, pct_of_ceiling
    ```
    The new code unconditionally adds:
    ```python
    "missing": r.missing,
    ```
    for **all** reports, including the legacy no-manifest path:
    ```python
    payload = {
        "files": [
            {
                "name": r.name,
                "bytes": r.bytes,
                "lines": r.lines,
                "tokens": r.tokens,
                "ceiling": r.ceiling,
                "over_ceiling": r.over_ceiling,
                "pct_of_ceiling": r.pct_of_ceiling,
                "missing": r.missing,
            }
            for r in reports
        ],
    }
    ```
    The new “back-compat” test does not catch this; `test_no_manifest_uses_legacy_report` only checks the text header, not JSON output.
  - **Correct answer:** Preserve the exact legacy JSON schema when `cfg.preload is None`; only include manifest-only fields such as `missing`, `total_tokens`, and `total_ceiling_tokens` in the manifest branch.