# Remediation — Set 120 Session 2, Round 2 (supplementary, completeness critic)

**Round 2 finding (Major, Correctness):** `--scan` can migrate the
explicitly excluded UAT fixture. `migrate_all()` rewrites every
discovered `activity-log.json` under the caller's `--scan` root with no
fixture exclusion; a dry run over the fixture root reported
`entriesRewritten: 2`.

**Verdict: ACCEPTED. Real defect, correctly graded Major, fixed.**

## Why it is right

This is the round-1 defect again, in a second location, and the critic
found it by asking the completeness question rather than by re-reading
round 1 — which is what the supplementary pass is for.

I journaled a decision to exclude the pinned UAT fixture, wrote it into
the module docstring as *"deliberately out of scope"*, and then
implemented it as **nothing at all**: the exclusion held only because
the default scan root happens to be `docs/session-sets`. `--scan` is a
documented, supported flag. `--scan . --migrate --in-place` would have
rewritten
`tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/hello-world-full/docs/session-sets/001-hello-page/activity-log.json`,
whose derived rows `uatMatrixFixtures.test.ts` pins — importing an
extension-test obligation into a set that declares `requiresE2E: false`
and forbids extension changes (standing decision 3).

A documented exclusion that only holds while nobody passes a flag is a
comment, not an exclusion.

## The fix

**`EXCLUDED_PATH_SEGMENTS = ("test-fixtures",)`, enforced structurally.**

- `is_excluded_path()` matches on path **segments**, not a substring, so
  a legitimate set slug that merely contains the word cannot be swept up
  by accident.
- An excluded file is never migrated by either entry point, whatever
  `--scan` says, and `migrate_file()` refuses it with a reason rather
  than silently skipping.
- Excluded files are **still reported** — a separate section in the
  inventory, an `excludedFiles` array in `--json`, and a `files
  excluded` line in the migration summary — because an invisible
  exclusion is how a residual becomes an oversight (`L-069-1`).
- Their entries are kept out of the drift totals, since counting test
  data as history would misstate the very measurement this session
  exists to produce.

The rule generalises beyond the one file that prompted it: any activity
log under a `test-fixtures/` tree is test data, not a record of a real
session, which is the actual criterion the journaled decision named.

## Falsifier

`test_an_excluded_fixture_is_never_migrated_whatever_scan_says` plants a
fixture-shaped tree and a real set under one scan root, then asserts the
fixture is untouched byte-for-byte while the real set migrates —
the look-alike pair L-112-1 asks for. It also asserts the exclusion is
*reported*, so a future refactor cannot satisfy the test by dropping the
file silently.

## Acceptance criterion

The verifier supplied an executable one:

```
python ai_router/step_status_drift.py --scan tools/dabbler-ai-orchestration/test-fixtures/uat-matrix --migrate --json
```

expected exit `0`, output containing `"entriesRewritten": 0`. Run
post-fix: exit `0`, `"entriesRewritten": 0`, `"filesExcluded": 1`, and
the fixture's own result carries `"excluded": true` with the reason.

## Blast radius

None on disk. The fixture was never migrated — the executed run used the
default scan root — so this closes a path that was open rather than
repairing damage.
