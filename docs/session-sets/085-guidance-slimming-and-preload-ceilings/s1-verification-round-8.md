## ISSUES FOUND

**Issue 1: `--repo-root` does not control which `router-config.yaml` is loaded on the normal path, so the gate can enforce the wrong repo's manifest or silently fall back to legacy**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The change itself claims repo-root targeting is authoritative: `_resolve_config_path()` says, **“When *repo_root* is given the config is `<repo_root>/ai_router/router-config.yaml`”**, and `effective_repo_root()` says **“Explicit `--repo-root` wins.”** The gate therefore needs to load config from the same repo root it is measuring.
  - **Impact:** `python -m ai_router.guidance_report --check --repo-root /target/repo` can load config from some other current working directory repo (or a no-manifest repo) while measuring files under `/target/repo`. That can make a manifest-enabled target repo pass on the legacy two-file branch or fail against the wrong ceilings. This changes merge decisions because the dedicated ceiling gate is no longer reliably checking the repo you pointed it at.
  - **Evidence:** In `ai_router/guidance_report.py::main`, config is loaded with:
    ```python
    try:
        config = load_config()
    except Exception:
        config = None
    cfg = load_guidance_config(config)
    ```
    and only afterward is the target root computed:
    ```python
    root = effective_repo_root(args.repo_root)
    ```
    The raw-manifest fallback honors `root`, but only when `load_config()` raises:
    ```python
    if manifest is None and config is None:
        raw_manifest, raw_declared, raw_unconfirmable = load_raw_preload_manifest(root)
    ```
    So if `load_config()` successfully resolves some other repo's config from the cwd walk-up, that wrong config is used and never corrected. The report builders then combine `cfg` from one repo with `root` from another:
    ```python
    legacy_reports = build_reports(root, cfg)
    preload_reports = build_preload_reports(root, manifest) if manifest is not None else None
    ```
  - **Correct answer:** On the success path too, resolve/load `router-config.yaml` from `args.repo_root` when it is provided, instead of always calling `load_config()` with implicit cwd-based resolution.

**Issue 2: A top-level misplaced `preload:` still does not fail closed on the config-success path when a valid `guidance.preload` also exists**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The checked-in conventions claim, **“A `preload:` key at the config top level (indentation error, no `guidance:` parent) is now treated as unconfirmable -> fail closed, on both the raw and config-success paths.”** The raw-parser comment repeats that a top-level `preload:` is **“ALWAYS a misplaced manifest”** and should make `--check` fail closed.
  - **Impact:** If a repo already has a valid `guidance.preload` and a later edit mistakenly adds or modifies a second top-level `preload:` block, CI does not fail. It silently keeps enforcing the old `guidance.preload` manifest, so the intended manifest edit becomes a no-op while the gate stays green. That is merge-relevant: a reviewer can accept a manifest/config change that is not actually being enforced.
  - **Evidence:** In `ai_router/guidance_report.py::main`, top-level `preload` on the success path only sets:
    ```python
    if ("guidance" in config and not isinstance(gblock, dict)) or ("preload" in config):
        unconfirmable = True
    ```
    but the hard fail is gated by:
    ```python
    if args.check and manifest is None and (declared or unconfirmable):
        ...
        return 1
    ```
    So when `cfg.preload` parsed from a valid `guidance.preload` is non-`None`, `manifest is None` is false and the command proceeds instead of failing closed, even though the same code marks the config `unconfirmable`. The added tests only cover top-level `preload:` with no valid `guidance.preload`; they do not cover this mixed case.
  - **Correct answer:** Under `--check`, any top-level `preload:` should fail closed on the config-success path too, regardless of whether another manifest parsed successfully.

#### NITS

- **Nit:** `ai_router/tests/test_guidance_preload_manifest.py::test_effective_repo_root_derives_from_config_location` does not actually exercise the reported subdirectory case; it never changes `cwd`, and its final assertion (`root is None or os.path.isdir(root)`) is too weak to prove the fix.
- **Nit:** `ai_router/guidance_report.py::render_preload_report()` renders a missing uncapped manifest entry as `expected under a 0-token ceiling` because it formats `r.ceiling or 0`; that message is misleading when the entry is intentionally uncapped.