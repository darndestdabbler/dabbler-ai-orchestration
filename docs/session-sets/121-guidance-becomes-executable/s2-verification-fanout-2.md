**ISSUES FOUND**

**Issue 1:** Never-used live guidance items are invisible to retention reporting and the instruction cap.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/guidance_ledger.py:679`, `ai_router/guidance_ledger.py:811`, `test-fixtures/cold-start/full/docs/planning/lessons-learned.md:68`
- **Failure scenario:** A new lesson or project-guidance entry gets an id but has not yet been cited. That is probable because new guidance is created before it has usage history, and Session 3 is explicitly about admitting currently unidentified project-guidance entries. The report iterates/counts only existing ledger entries, so the new live instruction is not reported as `never-used` and does not count against the cap.
- **Acceptance criterion:** `python ai_router/guidance_ledger.py --repo-root test-fixtures/cold-start/full report`
- **Acceptance expectation:** exit 0, output contains `"instruction lines in the live corpus: 1 / cap"`
- **Details:** **Violation:** the task requires “one compact record per guidance item” and retention based on whether an instruction was used within the last N active sessions. **Impact:** the anti-rebloat mechanism misses the exact case it must govern: new or never-used instruction lines. **Evidence:** `retention_report()` loops over `ledger.entries`, and `instruction_count()` counts instruction entries in the ledger; the cold-start fixture has a live `L-001-1` marker but no ledger entry, so today it is counted as zero.

**Issue 2:** The implementation is not ready for `project-guidance.md` ids, despite that being a load-bearing requirement.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `ai_router/cite_lessons.py:197`, `ai_router/guidance_meta.py:81`, `ai_router/guidance_ledger.py:628`, `docs/planning/project-guidance.md:21`
- **Failure scenario:** Session 3 assigns ids such as `C-003` to project-guidance entries. `cite_lessons` searches only `lessons-learned.md` and `lessons-archive.md`, `guidance_meta` still validates only `L-...` ids, and corpus scanning reuses the level-2 lesson parser against a document whose real entries are lower-level sections. Citation/validation/reporting then fail or ignore those ids.
- **Acceptance criterion:** `JUDGMENT - A reviewer can see tests and product code proving that a non-L project-guidance marker is validated, discovered in the live corpus, and resolved by cite_lessons without changing the ledger format.`
- **Details:** **Violation:** the task says the ledger is “agnostic about which document an entry lives in” and `project-guidance.md` “needs the identical mechanism.” **Impact:** the next planned session cannot use the mechanism without more code changes, so this session has not delivered the promised readiness. **Evidence:** `cite_lessons` excludes `PROJECT_GUIDANCE`; `ID_RE` rejects the example namespace; `corpus_ids()` includes `PROJECT_GUIDANCE` only through the lesson parser.

**Issue 3:** `cite_lessons` records unknown ids into the ledger before reporting them as not found.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/cite_lessons.py:212`, `ai_router/cite_lessons.py:247`, `ai_router/guidance_ledger.py:408`
- **Failure scenario:** An operator mistypes an id during close. That is probable enough that the CLI has an explicit not-found path. The command exits non-zero, but it has already created a syntactically valid ghost ledger entry; a later rerun with the correct id leaves the false record behind, and the module deliberately has no eviction path.
- **Acceptance criterion:** `JUDGMENT - Citing an id not present in any guidance document leaves guidance-usage.json byte-identical and reports the id as not recorded.`
- **Details:** **Violation:** the ledger is supposed to hold records for guidance items, not typo strings. **Impact:** the usage ledger becomes false evidence and can later attach prior “uses” to an id that did not exist when cited. **Evidence:** `cite_lessons.main()` calls `record_citation(args.ids, ...)` before checking outcomes, `_record()` creates missing entries, and the not-found message says “The use was still recorded in the ledger.”

**Issue 4:** `--session` is optional and silently defaults to session 1.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/cite_lessons.py:175`
- **Failure scenario:** A session 2+ close uses the old command form or omits `--session`. Multi-session sets are normal in this repo, and the old invocation was the established workflow. The ledger records `<set>-01`, corrupting per-session usage history without any error.
- **Acceptance criterion:** `python ai_router/cite_lessons.py --set 121 L-079-1 --repo-root .`
- **Acceptance expectation:** exit 2
- **Details:** **Violation:** uses must be identified as `<set>-<session>`, and the updated documented command includes `--session <M>`. **Impact:** the main citation path can silently write the wrong active-session label, undermining the retention window. **Evidence:** the parser sets `default="1"` instead of requiring the session number.

**Issue 5:** The shipped ledger contains usage labels contradicted by the close-event history it claims to replay.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/planning/guidance-usage.json:36`, `docs/session-sets/122-module-lifecycle-to-python/session-events.jsonl:5`, `ai_router/guidance_ledger.py:825`
- **Failure scenario:** The current repo’s retention report and triage prompt consume `guidance-usage.json` as historical truth. It already contains at least one false label: `L-064-12` records `122-02`, but Set 122 session 2 did not cite that id; session 3 did. Any item near a window boundary can be retained or pruned from fabricated recency evidence.
- **Acceptance criterion:** `JUDGMENT - guidance-usage.json is regenerated or validated so every instruction use label appears only when that session's closeout_succeeded event contains the id; specifically L-064-12 no longer has 122-02 and does include the correct 122-03 history if retained by the ring.`
- **Details:** **Violation:** the module says backfill is from “every session’s close event” and ordered as true recency. **Impact:** the session’s recorded basis for N/cap and future pruning is not trustworthy. **Evidence:** the ledger lists `L-064-12` with `122-02`; the corresponding close event cites only `L-112-1`, `L-069-1`, and `L-066-1`, while `L-064-12` appears in session 3.

**NITS**

- **Nit:** `guidance_triage._ledger_usage()` catches every exception and returns empty usage, which can make a corrupt/unreadable ledger look like “never recorded” data instead of surfacing a state problem.
- **Nit:** `guidance_ledger._load_retention_config(repo_root)` ignores `repo_root` and loads config from normal cwd discovery, so off-root reports can use the wrong retention windows/cap.
- **Nit:** `upsert_entry(..., uses=[...])` pushes labels in caller order, reversing a natural newest-first list; the exported helper should either document oldest-first input or preserve ledger order.
- **Nit:** The shipped ledger stores citation-derived `uses` on cheap executable entries even though executable uses are defined as fires. Retention ignores them for cheap checks, so this is not blocking, but it weakens the ledger invariant.