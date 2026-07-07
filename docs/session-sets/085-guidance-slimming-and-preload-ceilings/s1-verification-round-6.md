## ISSUES FOUND

**Issue 1: Misplaced top-level `preload:` still fails open on the raw path when `guidance:` exists**
- **Category:** Correctness
- **Severity:** Major
- **Location:** `ai_router/guidance_report.py::load_raw_preload_manifest`, `ai_router/guidance_report.py::main`
- **Details:**
  - **Violation:** The checked-in conventions claim: **“A `preload:` key at the config top level (indentation error, no `guidance:` parent) is now treated as unconfirmable -> fail closed, on both the raw and config-success paths.”** The contract also says a manifest-enabled repo whose config cannot be confirmed must fail closed under `--check`.
  - **Impact:** A parseable config that clearly attempts to declare a manifest can still bypass the manifest gate and fall back to the legacy two-file check whenever `load_config()` fails. That reopens the same merge-blocking class this session says it closed: the dedicated CI gate can report green without enforcing the preload manifest.
  - **Evidence:** The raw parser only treats top-level `preload` as unconfirmable inside the `if "guidance" not in data:` branch:
    ```python
    if "guidance" not in data:
        if "preload" in data:
            return None, False, True
        return None, False, False
    block = data.get("guidance")
    if not isinstance(block, dict):
        return None, False, True
    declared = "preload" in block
    return _parse_preload_manifest(block), declared, False
    ```
    So this malformed config:
    ```yaml
    guidance:
      disuse_window_sets: 20
    preload:
      files:
        - path: a.md
          ceiling_tokens: 1
    ```
    returns `(None, False, False)` from `load_raw_preload_manifest()`. In `main()`, the fail-closed guard is only:
    ```python
    if args.check and manifest is None and (declared or unconfirmable):
        ...
        return 1
    ```
    so this case falls through to the legacy branch instead of failing closed. The new raw-path test only covers top-level `preload` with **no** `guidance:` block, so this permutation is untested.
  - **Fix:** In the raw parser, treat any top-level `preload` key as unconfirmable regardless of whether a `guidance:` mapping is also present, and add a raw-path test for `guidance: {...}` plus misplaced top-level `preload:`.

**Issue 2: `--write-headers` can write to absolute / escaping manifest paths, and it does so before `--check` fails**
- **Category:** Correctness
- **Severity:** Major
- **Location:** `ai_router/guidance_report.py::build_preload_reports`, `ai_router/guidance_report.py::main`
- **Details:**
  - **Violation:** The task contract says manifest entries are **“repo-root-relative”**, and the checked-in narrative claims non-root-relative paths are now rejected/fail closed. `--write-headers` is the only mutating mode in this tool, so it must not act on paths the manifest validator has already classified as invalid.
  - **Impact:** A manifest entry like `../outside.md` or `/tmp/outside.md` with `stamp: true` can be read and rewritten outside the repo. Worse, `--write-headers --check` still performs the write first and only then returns a failing exit code. That is a real safety/correctness bug in the new feature, not just a reporting issue.
  - **Evidence:** Invalid paths are represented as `escapes_root=True` reports, but they are not excluded from stamping:
    ```python
    if _path_escapes_root(entry.path):
        reports.append(
            FileReport(
                name=entry.path,
                path=entry.path,
                ...
                escapes_root=True,
            )
        )
    ```
    Then `main()` builds stamp targets without checking `escapes_root`:
    ```python
    for r in preload_reports:
        if (
            not r.missing
            and r.name in stamp_opt_in
            and os.path.normpath(r.path) not in seen
        ):
            stamp_targets.append(r)
    ```
    and writes them directly:
    ```python
    with open(r.path, "r", encoding="utf-8") as f:
        text = f.read()
    ...
    with open(r.path, "w", encoding="utf-8") as f:
        f.write(...)
    ```
    The `--check` validation runs only **after** this write block.
  - **Fix:** Never add `escapes_root` entries to `stamp_targets`, and run manifest validity checks before any writes. Safer still: hard-fail `--write-headers` immediately on any invalid/missing manifest entry instead of attempting partial stamping.