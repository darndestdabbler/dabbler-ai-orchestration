## ISSUES FOUND

**Issue 1: The claimed fail-closed fix is still incomplete; parseable malformed `guidance` / `preload` config falls back to legacy and can bypass the manifest gate**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The stated contract says: **“a manifest-enabled repo whose config cannot be confirmed fails closed (exit 1). A genuine no-config / no-`preload:` repo keeps fail-open legacy behavior.”** It also says **“CI is the single enforcement point … The gate is one dedicated ubuntu job running `guidance_report --check`.”**
  - **Impact:** A repo with a declared-but-malformed manifest can still get the legacy two-file path instead of a hard failure. That means the dedicated ceiling gate can go green without enforcing the preload entries or total ceiling — the core Session 1 deliverable. This is merge-blocking for the same reason as the Round 1 fail-open bug: the anti-rebloat gate can silently stop gating.
  - **Evidence:** In `ai_router/guidance_config.py`, `_parse_preload_manifest()` returns `None` not only when `preload` is absent, but also when it is present but malformed:
    - `preload` not a mapping → `None`
    - `files` not a list → `None`
    - no valid entries survive → `None`
    
    In `ai_router/guidance_report.py`, `load_raw_preload_manifest()` then does:
    ```python
    block = data.get("guidance")
    if not isinstance(block, dict):
        return None, False  # parseable config, no guidance block -> legacy
    return _parse_preload_manifest(block), False
    ```
    So parseable malformed configs such as:
    ```yaml
    guidance:
      preload: 7
    ```
    or
    ```yaml
    guidance:
      preload:
        files: {path: a.md}
    ```
    produce `(None, False)`, exactly the same result as a genuine no-manifest repo. Then `main()` only fails closed on `raw_error`:
    ```python
    if manifest is None and config is None:
        raw_manifest, raw_error = load_raw_preload_manifest(args.repo_root)
        if raw_manifest is not None:
            manifest = raw_manifest
        elif raw_error and args.check:
            ...
            return 1
    ```
    If `load_config()` failed for any reason, these malformed-but-parseable manifest configs drop straight to the legacy branch instead of failing closed.
  - **Correct answer:** Distinguish **absent manifest** from **present-but-malformed `guidance` / `preload`** in the raw parse path, and make the latter a `--check` failure. `load_raw_preload_manifest()` needs a third state (or equivalent signal) for “config present but manifest cannot be confirmed,” and `main()` must treat that as non-zero under `--check`.

#### NITS

- **Nit:** `build_preload_reports()` resolves manifest paths against `os.getcwd()` when `--repo-root` is omitted, while config resolution intentionally walks up from the current directory. Running `python -m ai_router.guidance_report --check` from a subdirectory can therefore find the repo config but misresolve repo-root-relative manifest paths as missing. This is a real usability bug, but CI runs from repo root so it is not merge-blocking.
