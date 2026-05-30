# Set 051 S1 — Audit Verdict (LOCKED)

**Date:** 2026-05-29 · **Session:** 1 of 4 · **Consensus cost:** $0.0272
of $10 NTE (0.27%). Evidence: `proposal.md`; verbatim panel:
`consensus-output.md`.

The cross-provider panel (gemini-pro + gpt-5-4, independent + adversarial)
**confirmed every deletion finding** (Q1, Q4, Q5 unanimous; delete-not-
archive unanimous). The one material correction — raised independently by
**both** providers as their single strongest objection — is the **D3
writer-bypass detector**. The one disposition the panel moved is **Q6**
(both judged the migrator front door over-engineering). Locked below.

## Locked dispositions

### V1 — DELETE the joiner/dabbler_launch island ✅ (Q1)
Delete outright; **no `_archived/` dir** (both: anti-pattern). Tag the
removal commit (`pre-joiner-removal`) + note it in CHANGELOG for zero-cost
recovery. Remove (S2): `ai_router/joiner/{__init__,__main__,cli,coverage,
parsers,schema}` + `conflicts.py` **after V2 salvage** +
`ai_router/dabbler_launch.py` + 7 dead tests. Reachability verified: no
reflective load, no `__init__` re-export, no `joiner/conftest.py`.

### V2 — SALVAGE D3 before deleting `conflicts.py` ✅ (both providers' #1 objection)
Do **not** let D3 vanish as collateral — Set 049 deliberately, documentedly
retained it. **Before** deleting the island, lift `detect_writer_bypass`
into a new live module **`ai_router/writer_discipline.py`** with a focused
unit test (mtime-vs-events-ledger check over a fixture). It needs these
island symbols, which must be inlined/copied into the new module so it has
**no residual `joiner` import**:
- from `joiner/conflicts.py`: `ConflictReport`, `detect_writer_bypass`,
  `DEFAULT_WRITER_BYPASS_EVENT_TOLERANCE_NS`
- from `joiner/parsers.py`: `SessionStateView`, `scan_session_states`,
  `canonicalize_cwd`
- from `joiner/schema.py`: `parse_iso`

> Operator override available: if you'd rather **retire** D3 entirely,
> that's valid — but it must be an explicit, changelog-recorded decision,
> not a silent side effect (both providers). **Default = salvage** per the
> unanimous panel.

### V3 — REPOINT the backfill entry point + acceptance test ✅ (Q2)
Repoint `backfill_session_state` →
`ai_router.scripts.backfill_session_state:main` (module already has
`main()`). Add a **minimal acceptance/import test for every declared
`[project.scripts]` entry-point target** so a broken path can't ship again
(gpt-5-4 missing-list item).

### V4 — MOVE stray tests; optional pattern-exclude belt-and-suspenders ✅ (Q3)
Move `ai_router/scripts/test_session_state_backfill.py` +
`test_dump_session_state_schema.py` → `ai_router/tests/` (both: agree).
Keep the 2 utilities in `scripts/`. **Optional** (gpt-5-4 missing-list):
add a `test_*` glob exclude to the wheel/sdist config as a belt-and-
suspenders guard. *(Note: the "switch to an explicit allowlist" idea in an
earlier draft was NOT a panel recommendation; the panel endorsed moving
the files + the V6 regression test. Allowlist is optional implementer
judgment, not mandated.)*

### V5 — KEEP the four migrators split ✅ (Q4)
No logic consolidation (both: agree). Distinct shapes + 047/050 regression
history make a shared-core merge high-risk, low-reward.

### V6 — ADD the wheel-contents regression assertion ✅ (Q5 — both AGREE)
Add a test asserting the built package contains no `test_*` and none of
the removed dead modules. Both providers endorsed it ("cheap, high-signal";
"essential safeguard"). Implementer may complement with the fast
entry-point import test (V3) and resolved-package-list check; a full
build-and-inspect-wheel check, if slow, can be CI-only.

### V7 — Migrator discoverability = DOCS, not a `--from/--to` engine ✅ (Q6 — DISPOSITION CHANGED)
**Drop the proposed `migrate --from vN --to vM` front door** — both judged
it over-engineering / new public-API debt for a documentation problem.
Instead: (1) **update each of the 4 migrators' docstrings to state their
from→to versions** (gemini missing #3); (2) document the v2→v3→v4 order in
a short `MIGRATIONS.md` / module docstring; (3) optionally add **one
idempotent `migrate_to_latest(path)`** convenience that runs the ordered
steps; (4) only alias-rename `migrate_session_state` (really v2→v3) if it
can be done without breaking consumers. Keep existing entry points.

### V8 — Live-docs reconciliation (NEW scope, real gap-2 finding) ✅
`docs/cross-repo-harvest-notice.md` and `docs/narration-templates.md`
document `python -m ai_router.dabbler_launch` / `ai_router.joiner` /
`dabbler-launch` as **supported commands**. These are consumer-facing, not
session-set history. Retire/rewrite them as historical alongside the code
removal (gemini independently flagged this as a "documentation audit"
gap). Schedule in S2 (with the code) or S4 (docs pass) — implementer's
call; must not ship a release that documents deleted commands as live.

### V9 — Dependency audit (NEW, gemini missing #1) ✅
In S2, after removing the island, check whether any `pyproject.toml`
dependency was used **only** by the deleted code and can be dropped. (Quick
check; likely none — `httpx`/`pyyaml` are used broadly — but confirm.)

### V10 — Hook retirement (S3) unaffected
Out of the panel's scope (extension change). S3 plan stands.

## Net effect on the session plan
- **S2 gains:** V2 salvage module + test; V3 entry-point acceptance test;
  V8 live-docs reconciliation; V9 dependency check.
- **S2 loses:** the `--from/--to` migrator engine (V7) → replaced by
  docstrings + `MIGRATIONS.md` + optional one-liner. **Net simpler.**
- **S3/S4 unchanged** (S4 still carries the dual version bump; V8 docs may
  land in S2 or S4).

## Cost
Consensus $0.0272 of $10 NTE (0.27%). S1 otherwise local (no other routed
calls).
