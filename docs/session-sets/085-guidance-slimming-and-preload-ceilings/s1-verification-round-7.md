## ISSUES FOUND

**Issue 1: Repo-root containment is still bypassable via symlinks, so `--check` can measure and `--write-headers` can rewrite files outside the repo**
- **Category:** Correctness
- **Severity:** Major
- **Location:** `ai_router/guidance_report.py::_path_escapes_root`, `ai_router/guidance_report.py::build_preload_reports`, `ai_router/guidance_report.py::main` (`--write-headers` stamp-target assembly)
- **Details:**
  - **Violation:** The task requires manifest paths to be **“repo-root-relative”**, and the checked-in docs/comments claim the fix now **“must fail closed, not silently measure a file outside the repo”** and that write-safety is closed because escaping entries are never stamped.
  - **Impact:** A manifest entry can still point at a repo-internal symlink whose target is outside the repo. In that case, `guidance_report --check` measures the outside file as if it were valid repo content, and `--write-headers` with `stamp: true` will rewrite that outside file. That is the same outside-repo read/write class this session claims to have closed, and it would change a merge decision because the only mutating mode is still not actually root-contained.
  - **Evidence:** `_path_escapes_root()` is purely lexical:
    ```python
    if os.path.isabs(rel) or os.path.splitdrive(rel)[0]:
        return True
    norm = os.path.normpath(rel.replace("\\", "/"))
    return norm == ".." or norm.startswith(".." + os.sep) or norm.startswith("../")
    ```
    `build_preload_reports()` then accepts any lexically-safe path with:
    ```python
    abspath = os.path.normpath(os.path.join(root, entry.path))
    if os.path.isfile(abspath):
        reports.append(measure_path(entry.path, abspath, entry.ceiling_tokens))
    ```
    `os.path.isfile()` and `open()` follow symlinks. A committed symlink like `docs/x.md -> /tmp/outside.md` or `../outside.md` is lexically safe (`docs/x.md`), so it is neither `missing` nor `escapes_root`. The `--write-headers` path then stamps it because it excludes only:
    ```python
    not r.missing and not r.escapes_root
    ```
  - **Correct answer:** Resolve the joined path to its real target (`realpath`/`Path.resolve()`), then verify it stays under the real repo root (`commonpath`/`is_relative_to`) before measuring or stamping. Reject or fail-closed any symlink whose resolved target escapes the repo.

**Issue 2: The new Windows-path rejection claim is not implemented on ubuntu, so the checked-in passing-test claim is unsubstantiated**
- **Category:** False Positive
- **Severity:** Major
- **Location:** `ai_router/guidance_report.py::_path_escapes_root`, `ai_router/tests/test_guidance_preload_manifest.py::test_non_root_relative_path_fails_closed`, `.github/workflows/test.yml`
- **Details:**
  - **Violation:** The implementation/docstring claims `_path_escapes_root()` rejects absolute paths **“(incl. Windows drive / UNC)”**, and the checked-in session docs claim the new manifest suite is passing. The new CI job is explicitly `ubuntu-latest`.
  - **Impact:** On the linux platform this change adds for CI, a manifest path like `C:\Windows\win.ini` is not classified as “not repo-root-relative.” The checked-in test case that asserts that behavior should fail there. That makes the reported green suite materially untrustworthy, and it means the documented bad-path matrix is not actually implemented cross-platform.
  - **Evidence:** The function uses host-OS path parsing:
    ```python
    if os.path.isabs(rel) or os.path.splitdrive(rel)[0]:
        return True
    norm = os.path.normpath(rel.replace("\\", "/"))
    return norm == ".." or norm.startswith(".." + os.sep) or norm.startswith("../")
    ```
    On POSIX, `os.path.splitdrive("C:\\Windows\\win.ini")[0]` is empty, and after replacement/normalization the string becomes `C:/Windows/win.ini`, which does not match any `..` check. So `_path_escapes_root("C:\\Windows\\win.ini")` returns `False`. The code then treats it as an in-repo relative path and, if absent, emits a `MISSING` failure. But the test suite includes:
    ```python
    @pytest.mark.parametrize("bad_path", [..., "C:\\Windows\\win.ini", ...])
    def test_non_root_relative_path_fails_closed(...):
        ...
        assert "repo-root-relative" in out
    ```
    That assertion cannot be satisfied by the linux code path. Since `.github/workflows/test.yml` adds an ubuntu job, the “all passing” claim is not supported by the code in front of us.
  - **Correct answer:** Detect Windows absolute paths platform-independently (`pathlib.PureWindowsPath`, UNC/drive-letter checks, or equivalent) before the POSIX normalization path, and keep the test only once that behavior is actually implemented.

#### NITS

- **Nit:** `ai_router/tests/test_guidance_preload_manifest.py::test_effective_repo_root_derives_from_config_location` does not actually verify the subdirectory regression it claims. It never changes `cwd`, and its final assertion (`root is None or os.path.isdir(root)`) is effectively vacuous.
- **Nit:** `ai_router/guidance_report.py::render_preload_report()` renders a missing uncapped manifest entry as `expected under a 0-token ceiling` because it formats `r.ceiling or 0`; that message is misleading for intentionally uncapped entries.