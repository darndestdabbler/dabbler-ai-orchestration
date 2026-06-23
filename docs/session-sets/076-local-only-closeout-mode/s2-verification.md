## Issue 1 → `drift_guard` fix is both over-broad and under-broad

- **Severity:** Major
- **Location:** `ai_router/scripts/drift_guard.py` (`_INLINE_CODE_RE`, `scan_stale_framing`), coverage gap in `ai_router/tests/test_drift_guard.py`
- **Requirement violated:** The Set 075 repair was supposed to exempt inline-code **identifiers** without defanging the prose ban; prose matches were supposed to remain preserved.
- **Impact:**  
  1. Banned tier phrasing can now bypass CI simply by being backtick-quoted inline, e.g. `` `docs-only` `` / `` `explorer-only` ``.  
  2. Legitimate Markdown inline code spans that use more than one backtick are still not exempt and can still false-positive.
- **Evidence:**  
  - The scanner does:
    ```python
    lowered = _INLINE_CODE_RE.sub("", raw).lower()
    ```
    with:
    ```python
    _INLINE_CODE_RE = re.compile(r"`[^`]*`")
    ```
  - That removes **every** single-backtick span unconditionally before matching. A prose line such as:
    ```md
    Do not call it `docs-only`.
    ```
    is reduced to `do not call it .` and will not trip the ban.
  - The regex only understands a single backtick delimiter, so valid Markdown like:
    ```md
    ``diffClass=docs-only-excluded``
    ```
    is not stripped as an inline code span.
  - The added tests cover only:
    - single-backtick telemetry identifiers, and
    - prose outside code spans on the same line.  
    They do **not** cover backtick-quoted banned tier terms or multi-backtick inline code.
- **Fix:** Replace the regex with a delimiter-aware inline-code parser/tokenizer, and exempt only actual code spans while still flagging bare banned tier labels used as prose. Add tests for:
  - `` `docs-only` `` as quoted prose,
  - `` `explorer-only` `` as quoted prose,
  - multi-backtick spans like ````diffClass=docs-only-excluded````.

## Issue 2 → `local_only` CLI does not satisfy its claimed ASCII-only console contract

- **Severity:** Major
- **Location:** `ai_router/local_only.py` (`_render_note`, `main()` output paths), inadequate coverage in `ai_router/tests/test_local_only_cli.py`
- **Requirement violated:** The session claims/tests that the CLI’s console output is ASCII-only / cp1252-safe.
- **Impact:** A documented non-ASCII `--reason`, or a non-ASCII repo path, will be emitted verbatim by `--enable` / `--status`. On a Windows cp1252 console this can still raise `UnicodeEncodeError` or produce mojibake, which is exactly the failure mode the new test claims to prevent.
- **Evidence:**  
  - `_render_note()` writes the raw reason:
    ```python
    + f"reason: {reason_line}\n"
    ```
  - `main()` prints raw filesystem and marker content:
    ```python
    print(f"[x] local-only enabled: {path}")
    print(f"    repo root: {repo_root}")
    print(f"      {line}")
    ```
  - No escaping/sanitization is applied before printing user/filesystem-derived text.
  - The only new encoding test uses ASCII-only input:
    ```python
    reason="check encoding"
    ```
    and an ASCII tmp path, so it does not verify the claimed contract.
- **Fix:** ASCII-escape or otherwise sanitize all externally sourced text before printing (`reason`, `repo_root`, `path`, marker contents). Add tests with:
  - a non-ASCII `--reason`,
  - a non-ASCII repo-root/path,
  - `--status` reading back such a marker.

## Issue 3 → 0.26.2 changelog is incomplete for the actual shipped release

- **Severity:** Minor
- **Location:** `ai_router/CHANGELOG.md`
- **Requirement violated:** The release changelog should describe the material changes shipped in 0.26.2.
- **Impact:** Readers of the official 0.26.2 notes will not learn that this release changed `drift_guard` scanning semantics to fix a CI-blocking false positive, even though that repair was explicitly folded into this release as a blocker fix.
- **Evidence:**  
  - `ai_router/scripts/drift_guard.py` changed.
  - `ai_router/tests/test_drift_guard.py` changed.
  - The new `0.26.2` entry documents only local-only/gate/docs additions and contains no `Fixed`/`Changed` bullet for the drift-guard repair.
- **Fix:** Add a `Fixed` entry under `0.26.2` summarizing the inline-code-span handling change in `drift_guard` and the false-positive it addresses.

VERDICT: ISSUES_FOUND