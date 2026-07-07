## ISSUES FOUND

**Issue 1: Malformed manifest entries are silently dropped, so `--check` can pass while no longer gating every required-reading file**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires that the manifest cover the preload corpus and that CI be the enforcement point: **“Every required-reading file enters the manifest with its ceiling set at its measured current size”** and **“CI is the single enforcement point.”** The conventions file also claims the **“manifest declared but not enforced”** class is closed. That is not true for malformed *individual entries*.
  - **Impact:** A typo in one `files:` item can silently remove that file from the enforced set while leaving the rest of the manifest active. CI can then go green without measuring that required-reading file at all, and the total token check also goes artificially low because the omitted file contributes `0` tokens. That defeats the core anti-rebloat gate and is merge-blocking.
  - **Evidence:** In `ai_router/guidance_config.py`, `_parse_preload_manifest()` drops bad entries instead of preserving them as failures:
    ```python
    for item in files_raw:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        if not isinstance(path, str) or not path.strip():
            continue
    ```
    It only returns `None` if **no** valid entries survive:
    ```python
    if not entries:
        return None
    ```
    In `ai_router/guidance_report.py`, fail-closed only triggers when the whole manifest is absent/unconfirmable:
    ```python
    if args.check and manifest is None and (declared or unconfirmable):
        ...
        return 1
    ```
    So a partially malformed manifest still produces a non-`None` manifest and proceeds normally. The new test suite explicitly locks in this behavior in `ai_router/tests/test_guidance_preload_manifest.py::test_pathless_and_nonmapping_entries_are_skipped`, which asserts that malformed entries are just omitted from `cfg.preload.files`.
  - **Correct answer:** Do not silently drop declared `files:` entries that lack a usable `path`. Treat any malformed file entry as a manifest build failure for `--check`, or surface it as an explicit invalid-entry report/failure so the gate cannot silently stop enforcing part of the declared corpus.

#### NITS

- **Nit:** `ai_router/tests/test_guidance_preload_manifest.py::test_effective_repo_root_derives_from_config_location` does not actually verify the subdirectory regression it claims to cover. It never changes `cwd`, and its final assertion (`root is None or os.path.isdir(root)`) is effectively vacuous.
- **Nit:** `ai_router/guidance_report.py::render_preload_report()` renders a missing uncapped file as **“expected under a 0-token ceiling”** because it formats `r.ceiling or 0`; that message is misleading when `ceiling_tokens` is intentionally uncapped.
- **Nit:** The self-reported manifest-test counts in `docs/session-sets/085-guidance-slimming-and-preload-ceilings/s1-conventions.md` are stale/inconsistent with the checked-in parameterized test file.