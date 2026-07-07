## ISSUES FOUND

**Issue 1: `preload` paths are documented as repo-root-relative, but the implementation accepts absolute and escaping paths**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The Session 1 contract says the manifest accepts `preload:` entries as **“`{path, ceiling_tokens}`, repo-root-relative”**. The new code and docs repeat that promise (`PreloadEntry.path`, `build_preload_reports()` docstring, router-config comments), but the parser/enforcer does not actually enforce root-relative containment.
  - **Impact:** A malformed or careless manifest entry can point the CI gate at the wrong file — including a file outside the repo — so `guidance_report --check` can pass while the intended required-reading doc is no longer being measured, or fail based on unrelated workspace/system files. Because **CI is the single enforcement point** for this feature, that is a merge-blocking correctness hole in the core deliverable.
  - **Evidence:** In `ai_router/guidance_config.py`, `_parse_preload_manifest()` accepts any non-empty string:
    ```python
    path = item.get("path")
    if not isinstance(path, str) or not path.strip():
        continue
    ```
    There is no rejection of absolute paths or `..` segments. In `ai_router/guidance_report.py`, `build_preload_reports()` then resolves with:
    ```python
    abspath = os.path.normpath(os.path.join(root, entry.path))
    ```
    On absolute paths, `os.path.join()` ignores `root`; on `../...`, `os.path.normpath()` escapes the repo root. No containment check follows, and no test covers this class.
  - **Correct answer:** Reject manifest paths that are not strictly repo-root-relative: disallow absolute paths, normalize and verify the resolved path stays under the repo root, and fail closed under `--check` when a declared manifest entry violates that contract.

**Issue 2: A malformed config with `preload:` in the wrong place is still misclassified as “legacy/no manifest,” so the fail-closed guarantee is not actually complete**
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The conventions claim the malformed-config class is closed and that **“a manifest-enabled repo whose config cannot be confirmed fails closed (exit 1). A genuine no-config / no-`preload:` repo keeps fail-open legacy behavior.”** A config that contains a `preload:` key at top level is not a genuine no-manifest repo; it is a malformed attempt to declare one.
  - **Impact:** A simple YAML indentation/location mistake can still silently disable the ceiling gate and drop `--check` onto the legacy two-file path. That is the same merge-changing failure mode the earlier remediations were supposed to eliminate: the dedicated CI gate can go green without enforcing the manifest.
  - **Evidence:** `load_raw_preload_manifest()` only inspects `guidance.preload`:
    ```python
    if "guidance" not in data:
        return None, False, False  # no guidance section -> genuine legacy
    block = data.get("guidance")
    ...
    declared = "preload" in block
    ```
    So YAML like:
    ```yaml
    preload:
      files:
        - path: a.md
          ceiling_tokens: 1
    ```
    or a misindented variant is treated as `(None, False, False)` — indistinguishable from a genuine legacy repo. Then `main()` only fails closed when `declared or unconfirmable` is true:
    ```python
    if args.check and manifest is None and (declared or unconfirmable):
        ...
        return 1
    ```
    Therefore this malformed-but-obviously-manifest-related config still falls through to the legacy branch.
  - **Correct answer:** Treat a root-level `preload:` key (or any other structurally misplaced manifest declaration) as malformed/unconfirmable config, not as legacy. `--check` should fail closed whenever the YAML clearly attempts to declare a manifest but does not do so in the valid `guidance.preload` location.

#### NITS

- **Nit:** `ai_router/tests/test_guidance_preload_manifest.py::test_effective_repo_root_derives_from_config_location` does not actually verify the reported subdirectory regression. It never changes `cwd` into the temp repo, and its final assertion (`root is None or os.path.isdir(root)`) is effectively vacuous.
- **Nit:** `render_preload_report()` renders a missing uncapped file as **“expected under a 0-token ceiling”** because it formats `r.ceiling or 0`; that message is misleading for `ceiling_tokens: null`.
- **Nit:** The self-reported test counts in `docs/session-sets/085-guidance-slimming-and-preload-ceilings/s1-conventions.md` are stale/inconsistent with the parameterized test file as checked in.