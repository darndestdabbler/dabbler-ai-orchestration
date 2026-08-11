ISSUES FOUND

- **Issue 1:** `--migrate --in-place` can rewrite records even when the premise check would have stopped the migration.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/120-strict-writer-and-one-projection/spec.md:221`, `ai_router/step_status_drift.py:790`, `ai_router/step_status_drift.py:849`, `ai_router/CHANGELOG.md:63`
  - **Failure scenario:** A maintainer or consumer follows the advertised `python -m ai_router.step_status_drift --migrate --in-place` command on drifted history containing a `completed`/`done` step whose session is still incomplete or whose step was later blocked. The command rewrites it to `complete` instead of stopping, laundering the historical outcome the operator explicitly limited the migration to avoid. This is probable because the changelog directly advertises the write command for consumer repos without making `--check-premise` a required precondition.
  - **Acceptance criterion:** `JUDGMENT - The write path must refuse and leave files unchanged whenever the same scan has any unadjudicated premise flag, including the public CLI path for --migrate --in-place.`
  - **Details:** **Violation:** the spec says “Falsify the ruling’s premise before acting on it” and “If any does, stop and report.” **Impact:** the migration can perform the exact unsafe rewrite the premise check exists to prevent. **Evidence:** the CLI handles `--check-premise` and `--migrate` as independent branches; the migrate branch calls `migrate_all(...)` directly with no premise check.