## ISSUES FOUND

**Issue 1: `--write-headers` still rewrites opted-out files, so the new `stamp: true` opt-in contract is not actually enforced**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires: **“`--write-headers` stamps only files that opt in (`stamp: true` per entry, default false — CLAUDE.md and canonical docs are not auto-edited).”** The checked-in config repeats the same contract: **“`stamp: true` opts a file in to `--write-headers` auto-editing … Ratchet start: nothing opts in.”**
  - **Impact:** A reviewer cannot accept the claimed `stamp: true` safeguard as implemented, because the only mutating mode still edits files that did **not** opt in. In this repo, that means `python -m ai_router.guidance_report --write-headers` will rewrite opted-out guidance docs despite the manifest saying nothing opts in. That is a direct behavioral mismatch in one of Session 1’s explicit deliverables.
  - **Evidence:** In `ai_router/router-config.yaml`, the manifest entries for `docs/planning/lessons-learned.md` and `docs/planning/project-guidance.md` have no `stamp: true`. But in `ai_router/guidance_report.py::main`, stamping starts with:
    ```python
    stamp_targets: List[FileReport] = list(legacy_reports)
    ```
    and then writes every target in `stamp_targets`. The manifest opt-in check is applied only when adding **extra** manifest files:
    ```python
    if manifest is not None and preload_reports is not None:
        stamp_opt_in = {e.path for e in manifest.files if e.stamp}
        ...
    ```
    so the legacy guidance files are stamped unconditionally even when they are opted out in the manifest.
  - **Correct answer:** When a preload manifest is present, do not stamp any file unless its manifest entry has `stamp: true`. If preserving legacy header stamping is intentional, that opt-in must be made explicit in the manifest and the docs/spec updated to match; it cannot stay as an implicit bypass of the new opt-in rule.

#### NITS

- **Nit:** `ai_router/tests/test_guidance_preload_manifest.py::test_effective_repo_root_derives_from_config_location` does not actually exercise the “run from a subdirectory” regression it claims to cover. It never changes `cwd`, and its final assertion (`root is None or os.path.isdir(root)`) is too weak to prove the config-location derivation path.