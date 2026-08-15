ISSUES FOUND

Fix verdict: L1 live IDs missing from ledger undercount retention/cap -- fix-accepted  
Fix verdict: L2 Step 9 still used retired `last-used-set` rule -- fix-accepted  
Fix verdict: L3 -- duplicate-of L1  
Fix verdict: L4 project-guidance ID readiness -- fix-rejected  
Fix verdict: L5 unknown IDs written before not-found reporting -- fix-accepted  
Fix verdict: L6 missing `--session` silently defaults to session 1 -- fix-accepted  
Fix verdict: L7 shipped ledger labels contradicted close history -- fix-accepted  
Fix verdict: L8 executable checks inherit citation history as fire history -- fix-accepted

**Issue 1:** Project-guidance IDs still are not validated by the metadata gate.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `ai_router/validate_guidance_meta.py:34`, `ai_router/validate_guidance_meta.py:82`, `ai_router/guidance_meta.py:197`, `ai_router/guidance_meta.py:342`, `docs/planning/project-guidance.md:21`
- **Failure scenario:** Set 121 Session 3 assigns IDs to `project-guidance.md` entries, which the spec explicitly says is next and load-bearing. The normal validation command still defaults only to `lessons-learned.md` and `lessons-archive.md`, and even explicitly passing `project-guidance.md` uses `validate_documents()`, which only walks `parse_document()`’s level-2 lesson model. The project-guidance entries are under lower-level sections/bullets, so malformed or duplicate project-guidance IDs are not validated and the gate reports success while checking the wrong corpus.
- **Acceptance criterion:** `JUDGMENT - validate_guidance_meta must validate project-guidance.md by default and enforce ID format plus cross-file duplicate uniqueness for markers in project-guidance.md's actual lower-level/bullet structure, not only level-2 lesson headings.`
- **Details:** **Violation:** the ledger requirement says it is “keyed by id and agnostic about which document an entry lives in,” and L4 required readiness for `project-guidance.md` IDs. **Impact:** the next planned session’s ID-admission gate is a no-op for the file it is admitting, which can leave duplicate/malformed handles in the canonical corpus and make citation/reporting ambiguous. **Evidence:** `_default_files()` includes only active/archive lessons, while `validate_documents()` iterates only `parse_document()` entries; `project-guidance.md` is structured as `##` sections with lower-level entries rather than one `##` lesson per marker.