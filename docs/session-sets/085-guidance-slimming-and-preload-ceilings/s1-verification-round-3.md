## ISSUES FOUND

- **Issue 1: Manifest paths are not actually repo-root-relative unless `--repo-root` is passed**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The Session 1 contract says the `preload:` entries are **“repo-root-relative”**.
    - **Impact:** `python -m ai_router.guidance_report --check` can report false missing-file failures from a subdirectory of a valid repo, because it finds the repo config but measures manifest files relative to the current working directory instead of the repo root. That breaks the core new manifest/gate behavior outside one invocation pattern and makes the declared path semantics untrue.
    - **Evidence:** In `ai_router/guidance_report.py`, `build_preload_reports()` does:
      ```python
      root = repo_root if repo_root is not None else os.getcwd()
      abspath = os.path.normpath(os.path.join(root, entry.path))
      ```
      But `load_raw_preload_manifest()` explicitly supports omitting `--repo-root` by resolving `router-config.yaml` via the config loader’s walk-up logic:
      ```python
      resolved, _src = _resolve_config_path_and_source(None)
      ```
      So from `/repo/ai_router`, a manifest entry like `docs/ai-led-session-workflow.md` is resolved as `/repo/ai_router/docs/ai-led-session-workflow.md` instead of `/repo/docs/ai-led-session-workflow.md`. The correct answer is to derive the manifest root from the resolved repo/config location when `--repo-root` is omitted, not from `os.getcwd()`.

- **Issue 2: The fail-closed fix still misclassifies a malformed `guidance:` block as “legacy/no manifest,” so the gate can still be bypassed**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The stated contract says a manifest-enabled repo whose config cannot be confirmed must **“fail closed (exit 1)”**, while only a **“genuine no-config / no-`preload:` repo keeps fail-open legacy behavior.”**
    - **Impact:** A parseable but malformed config such as `guidance: 7`, combined with any `load_config()` failure on `--check`, drops back to the legacy two-file branch instead of hard-failing. That means the dedicated ceiling gate can still go green without enforcing the manifest — the same merge-blocking class of defect this session was supposed to eliminate.
    - **Evidence:** In `ai_router/guidance_report.py`, `load_raw_preload_manifest()` does:
      ```python
      block = data.get("guidance")
      if not isinstance(block, dict):
          return None, False, False  # parseable config, no guidance block -> legacy
      ```
      Then `main()` only fails closed when `declared` or `raw_error` is true:
      ```python
      if args.check and manifest is None and (declared or raw_error):
          ...
          return 1
      ```
      For a config file containing `guidance: 7`, the raw path returns `(None, False, False)`, so `--check` proceeds on the legacy branch and can exit 0. That is not a genuine no-manifest repo; it is malformed, unconfirmable config. The correct answer is to distinguish **absent `guidance`** from **present-but-malformed `guidance`**, and fail `--check` closed for the latter.

#### NITS

- **Nit:** `docs/session-sets/085-guidance-slimming-and-preload-ceilings/s1-conventions.md` says the new suite is “47 tests,” but the added file contains 50 parameterized cases by count. The self-reported baseline is stale/inaccurate.
- **Nit:** `render_preload_report()` prints missing uncapped files as **“expected under a 0-token ceiling”** because it formats `r.ceiling or 0`; that message is misleading for `ceiling_tokens: null` entries.