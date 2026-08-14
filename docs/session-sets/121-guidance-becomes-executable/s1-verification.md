ISSUES FOUND

- **Issue 1:** The new corpus-scan guard misses repo scans hidden behind a second helper layer, including the helper-chain shape introduced in this same change.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/corpus_scan_guard.py:337-357`, `ai_router/tests/test_no_legacy_field_reads.py:102-121`, `ai_router/tests/test_corpus_scan_guard.py:128-150`
  - **Failure scenario:** A future edit or new lint follows the now-existing pattern `_scan_for_violations()` -> `_scanned_sources()` and only asserts `not violations`; if the non-empty corpus assertion is omitted, the guard reports no offender because helper classification is not transitive. This is probable rather than speculative because this session refactored an existing real offender into exactly that two-helper shape.
  - **Acceptance criterion:** JUDGMENT - A reviewer can plant a module where `_sources()` walks a `Path(__file__)` root, `_scan()` calls `_sources()`, and `test_*()` only calls `_scan()` with an empty-offenders assertion; `scan()` reports that test as an offender, and a paired version with a real non-empty assertion over the same corpus is not reported.
  - **Details:** **Violation** — Session step 4 requires encoding each code disposition “with a falsifier that proves it can fire,” and the new module claims it finds repo scans “directly or through a module helper.” **Impact** — the encoded L-112-1 guard is accepted as closing the vacuous-corpus class while leaving a common helper-delegation path unguarded, so a reasonable reviewer should block until the guard and falsifier cover that shape. **Evidence** — `self_rooted` only includes helpers where `_scans_repo()` sees a direct `rglob`/`glob`/`iterdir`/`os.walk`; it never promotes helpers that call those helpers. `test_no_legacy_field_reads.py` now has `_scan_for_violations()` consuming `_scanned_sources()`, while the falsifier only covers a direct helper returning `AI_ROUTER.rglob(...)`.

NITS

- **Nit:** `_asserts_non_empty()` accepts any `>=` or `!=` integer comparison, so `assert len(files) >= 0` and `assert len(files) != 1` would satisfy the guard even though an empty corpus passes.
- **Nit:** Inline repo roots such as `Path(__file__).resolve().parent.rglob("*.py")` are not detected because repo roots must be named constants or provider-derived names.
- **Nit:** Some valid non-empty assertions fail closed, such as `assert 0 < len(files)` or asserting directly over `list(ROOT.rglob(...))`; not blocking, but it narrows the “however the scan is spelled” claim.