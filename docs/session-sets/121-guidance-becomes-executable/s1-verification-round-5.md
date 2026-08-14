**ISSUES FOUND** — the ledger fixes close the original false negatives, but the latest laziness remediation introduces a new blocking false positive.

Fix verdict: L1 helper-chain transitivity -- fix-accepted  
Fix verdict: L2 direct lazy `Path.rglob()` truthiness -- fix-accepted  
Fix verdict: L3 local `Path(__file__)` root detection -- fix-accepted  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 fixture-injected repo corpus detection -- accepted-with-modification  
Fix verdict: L6 helper-returned lazy corpus remains lazy -- fix-accepted

- **Issue 1:** The laziness fix treats `files = list(_sources())` as lazy when `_sources()` returns `ROOT.rglob(...)`, so a valid materialized corpus assertion is falsely rejected.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/corpus_scan_guard.py:208-213`, `ai_router/corpus_scan_guard.py:324-326`, `ai_router/corpus_scan_guard.py:358-365`, `ai_router/tests/test_corpus_scan_guard.py:470-493`, `docs/session-sets/121-guidance-becomes-executable/s1-remediation-round-3.md:78-83`
  - **Failure scenario:** A typical lint helper returns a lazy walk with `_sources(): return ROOT.rglob("*.py")`, and the caller correctly materializes it using `files = list(_sources()); assert files`. This is probable because `list()` is the guard’s own named materializer and the remediation note claims the list-wrapped look-alike stays silent. Current code recursively sees `_sources` inside `list(_sources())`, marks `files` lazy anyway, and then refuses bare truthiness over it, so CI blocks a valid test.
  - **Acceptance criterion:** `JUDGMENT - A planted module where _sources returns ROOT.rglob("*.py") must be silent when the test uses files = list(_sources()); assert files, while the otherwise identical files = _sources(); assert files case must still produce one offender.`
  - **Details:** Violation: the guard’s contract says “Only a materialized corpus can be asserted by bare truthiness,” and the remediation claims the “same helper wrapped in `list()`” is silent. Impact: this would change a reasonable reviewer’s merge decision because the new guard can fail valid corpus scans using the standard materialization idiom. Evidence: `_called_names()` walks nested calls, `_corpus_variables()` ORs any lazy helper call into `is_lazy` even under an outer `list()`, and `_asserts_non_empty()` then excludes that name from solid bare-truthiness assertions; the added look-alike test only covers a helper that returns `list(ROOT.rglob(...))`, not call-site `list(_sources())`.

**NITS**

- **Nit:** `ai_router/corpus_scan_guard.py:467-490` reads only the immediate sibling `conftest.py`; pytest also applies ancestor conftests, so nested test directories could miss a parent conftest corpus fixture. I do not grade this as blocking because no current corpus fixture demonstrates that path.