ISSUES FOUND

- **Issue 1:** `--scan` can migrate the explicitly excluded UAT fixture.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/step_status_drift.py:54`, `ai_router/step_status_drift.py:352`, `ai_router/step_status_drift.py:642`, `docs/session-sets/120-strict-writer-and-one-projection/decisions.jsonl:3`, `tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/hello-world-full/docs/session-sets/001-hello-page/activity-log.json:12`, `tools/dabbler-ai-orchestration/src/test/suite/uatMatrixFixtures.test.ts:1`
  - **Failure scenario:** A maintainer uses the supported `--scan` override for a repo-wide audit/migration, e.g. `--scan . --migrate --in-place`. The command currently plans the fixture’s two `completed` tokens for rewrite, so the apply path would mutate the pinned extension UAT fixture that the session explicitly excluded.
  - **Acceptance criterion:** `python ai_router/step_status_drift.py --scan tools/dabbler-ai-orchestration/test-fixtures/uat-matrix --migrate --json`
  - **Acceptance expectation:** exit 0, output contains `"entriesRewritten": 0`
  - **Details:** **Violation:** the session decision says “Exclude it” for the UAT fixture, and the module docstring says it is “deliberately out of scope.” **Impact:** this breaks the no-extension-change scoping boundary and can import the extension fixture/test obligation into a Python-only history migration. **Evidence:** `migrate_all()` rewrites every discovered `activity-log.json` under the caller’s `--scan` root with no fixture exclusion, and dry-run over the fixture root reports `entriesRewritten: 2` for the pinned fixture.