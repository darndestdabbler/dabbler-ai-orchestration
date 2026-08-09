**ISSUES FOUND**

**Issue 1:** The extension bulk-upgrade command still invokes the deleted Lightweight migrator.
- **Category:** Correctness / Completeness
- **Severity:** Major
- **Failure scenario:** A user with any sub-current session set clicks the contributed **Upgrade Older Session Sets** title-bar command. That path always runs `BULK_UPGRADE_MODULES` in order, so it reaches `ai_router.migrate_lightweight_to_canonical_v4`, which no longer exists, and the upgrade reports an error instead of upgrading. This is probable for older consumer repos because the command is specifically gated on `hasSubCurrentSets`.
- **Acceptance criterion:** `python -c "__import__('sys').exit(any('ai_router.migrate_lightweight_to_canonical_v4' in __import__('pathlib').Path(p).read_text(encoding='utf-8') for p in ['tools/dabbler-ai-orchestration/src/commands/upgradeOlderSets.ts','tools/dabbler-ai-orchestration/dist/extension.js']))"`
- **Acceptance expectation:** exit 0
- **Details:** Violation: the session deletes `ai_router/migrate_lightweight_to_canonical_v4.py` and updates the router bulk chain to two migrators, but the live extension command still hardcodes the removed module. Impact: a user-visible migration command fails on its second subprocess and blocks the schema-upgrade path. Evidence: `upgradeOlderSets.ts` still lists `"ai_router.migrate_lightweight_to_canonical_v4"` in `BULK_UPGRADE_MODULES`, `package.json` still contributes `dabblerSessionSets.upgradeOlderSets`, `dist/extension.js` still contains the same module string, and `python -m ai_router.migrate_lightweight_to_canonical_v4 --help` now exits with `No module named ai_router.migrate_lightweight_to_canonical_v4`.

**NITS**

- **Nit:** The new fail-loud message and CHANGELOG point to `docs/cross-repo-lightweight-removal-notice.md`, but that file does not exist in this tree. The message still contains the actionable migration remedies, so this is not blocking.