# S1 kill inventory — the boundary for Set 112

> **Status:** authored Session 1, Step 2. **This file, not the spec's kill
> list, is the boundary of the removal.** The spec's list was the starting
> map; this is the fresh-grep result. Session 2 reads the extension/docs
> half; Session 3's grep gate is written against the "must be zero after"
> column.

## Method

Every file tracked by git was searched for the union of these terms:

```
lightweight  Lightweight  verificationMode  verification_mode
dedicated-sessions  out-of-band-or-none  external-verification
external_verification  pending_verification  dedicated_verification
change_verification_mode  migrate_lightweight  "tier: lightweight"
```

Reproduce the bucket counts:

```powershell
git --no-pager grep -Iil -- lightweight | Measure-Object
```

**Scale:** 611 of 3,851 tracked files mention the tier (case-insensitive);
**347 of those are `docs/session-sets/` archives and `docs/proposals/`** —
history that stays readable and is exempt by design. The live surface is
**264 files**, of which the case-sensitive term buckets below account for
the ones carrying real machinery.

## Bucket totals

| bucket | files | owner |
| :--- | ---: | :--- |
| A — `ai_router/` code | 27 | **S1** |
| C — `ai_router/tests/` | 28 | **S1** |
| D — `test-fixtures/` | 14 | **S1** |
| E — extension `src/`, `media/`, `dist/` | 52 | S2 |
| F — extension tests + fixtures | 57 | S2 |
| G — `docs/templates/` | 12 | S2 |
| H — `docs/` prose | 35 | S2 |
| I — `.github/` CI | 1 | S1 (matrix) / S3 (gate wiring) |
| J — other (root README, schemas) | 7 | S2 |
| Y — `docs/proposals/` | 62 | **exempt** (historical record) |
| ZZ — `docs/session-sets/` | 399 | **exempt** (archives stay readable) |

(The bucket table counts files matching the case-sensitive union of the
13 terms; the 611 / 264 headline figures above are the broader
case-insensitive `lightweight` scan. Both are reported because the S3 gate
must be written against the case-insensitive one.)

---

## A. Router code — delete outright (whole file)

| file | lines | why it exists only for Lightweight |
| :--- | ---: | :--- |
| `ai_router/dedicated_verification.py` | 1,242 | Mode B: typed-session flow, bounded re-verification loop, content-aware close gate, `read_verification_mode` |
| `ai_router/external_verification.py` | 282 | Mode A: the `external-verification.md` hand-recorded-verdict parser |
| `ai_router/pending_verification.py` | 276 | Mode A/B start-of-session "you owe a verification" banner |
| `ai_router/change_verification_mode.py` | 141 | the A→B writer |
| `ai_router/migrate_lightweight_to_canonical_v4.py` | 640 | the Lightweight-shape → canonical-v4 migrator |

**2,581 lines of production code**, plus their five test modules
(below).

## A. Router code — edit in place

| file | what goes | note |
| :--- | :--- | :--- |
| `ai_router/runtime_mode.py` | precedence **step 3** (`_spec_tier`, `_spec_says_lightweight`, and the tier arms of the log lines); the `session_set_dir` parameter's only purpose | keep the CLI flag + `DABBLER_NO_ROUTER`; resolver log names **two** sources |
| `ai_router/spec_config.py` | `tier` field, `SessionSetTier`, the tier arm of the parser | replaced by the **fail-loud** error (Step 5) |
| `ai_router/close_session.py` | ~22 sites: the `--no-router` CLI arg's tier framing, `_resolve_lightweight` (l.1426-1477), the Mode A soft gate (l.1999-2190), the Mode B gate (l.2191-2256), the "Lightweight skips routed verification" attestation branch (l.1660-1670, l.1892) | **highest-risk file** — every removed branch needs its surviving-path test green (spec risk 3) |
| `ai_router/gate_checks.py` | `_set_is_lightweight` (l.865-893) and its three call sites (l.1308, l.1606, and the l.1176 message arm) | see **the env-var escape** below |
| `ai_router/start_session.py` | `--verification-mode` flag, `resolve_and_record_verification_mode` call (l.487-499), `_print_pending_verification_banner` (l.577-596, l.1133), `cross_provider_satisfied` import (l.617-632) | the `--no-router` flag's help text loses its tier framing |
| `ai_router/check_migrations.py` | the `lightweight-to-v4` migrator registration (l.113) and its two doc lines | the migrator file itself is deleted |
| `ai_router/path_aware_critique.py` | 4 doc-comment cross-references to `dedicated_verification` | comments only — no behavior |
| `ai_router/session_state.py` | 1 doc-comment cross-reference (l.1116) | comment only |
| `ai_router/contract_gate.py`, `ai_router/dual_surface_verify.py` | `verificationMode` / `verification_mode` reads | verify each is the Lightweight field and not an unrelated local |
| `ai_router/narration.py`, `ai_router/progress.py`, `ai_router/close_backstop.py`, `ai_router/__init__.py`, `ai_router/migrate_v3_to_v4.py`, `ai_router/migrate_session_state.py` | prose/docstring mentions | `migrate_session_state.py:598` is the English word "lightweight" — **not a hit**, leave it |
| `ai_router/scripts/drift_guard.py` | the tier banned-phrase scan | **S2** retires it; keep the mechanism if another check uses it |
| `ai_router/scripts/tutorial_gate.py` | `tier: lightweight` expectations | S1 if router-side, else S2 |
| `ai_router/CHANGELOG.md`, `ai_router/MIGRATIONS.md`, `ai_router/docs/close-out.md`, `ai_router/docs/pull-verifier.md` | historical entries **stay**; forward-looking instructions go | a changelog is a record — do not rewrite history, add the removal entry |

## C. Router tests — delete with their subject (5 modules, 143 tests)

| test module | tests |
| :--- | ---: |
| `test_dedicated_verification.py` | 49 |
| `test_change_verification_mode.py` | 31 |
| `test_external_verification_parser.py` | 28 |
| `test_migrate_lightweight_to_canonical_v4.py` | 17 |
| `test_pending_verification.py` | 17 |
| `test_dedicated_verification_close_gate.py` | 10 |
| `test_dedicated_verification_e2e.py` | 1 |
| **total** | **153** |

## C. Router tests — trim the Lightweight cases, keep the module

`test_no_router_close_session.py` (21), `test_runtime_mode.py` (29),
`test_spec_config.py` (18), `test_cross_provider_gate_extension.py` (35),
`test_verification_integrity_gate.py`, `test_check_migrations.py`,
`test_cold_start_acceptance.py` (2), `test_path_aware_critique.py`,
`test_path_aware_critique_close_gate.py`, `test_contract_gate_close.py`,
`test_activity_log_reader_hardening.py`, `test_critical_eval_ss1_phase0.py`,
`test_dual_surface_s2.py`, `test_production_imports.py`,
`test_close_session_snapshot_flip.py`, `test_decision_journal.py`,
`test_drift_guard.py`, `test_metrics.py`, `test_progress.py`,
`test_e2e/test_register_session_start_regression.py`, `conftest.py`.

`test_production_imports.py` and `conftest.py` name the deleted modules
directly — both must stop importing them.

## D. Fixtures — delete the tree

`test-fixtures/cold-start/lightweight/` (7 files) goes whole.
`test-fixtures/cold-start/full/` (7 files) **stays** but loses its dual-tier
prose — its `start-here.md` and engine files still teach the fork.

`tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/hello-world-lightweight/`
is **S2**.

## The env-var escape — a hole the removal must close, not inherit

`gate_checks._set_is_lightweight` returns **True on `DABBLER_NO_ROUTER=1`
alone**, and it gates `check_verification_integrity` (l.1308) and the
expensive-suite freshness check (l.1606). `close_session._resolve_lightweight`
(l.1470) does the same for the close path.

The spec keeps `--no-router` / `DABBLER_NO_ROUTER` as **test affordances**
(Decisions already made, item 2). If those call sites are left keyed on the
env var after the tier is gone, an env var alone still disarms two Full-tier
close gates — an escape that used to be a documented tier and would become an
undocumented back door.

**Disposition:** the gate skips are deleted with the tier. `--no-router`
retains exactly one meaning — *suppress routed API calls* — and buys no gate
relief. This **strengthens** verification, so it is AI-decidable (the
decision-rights carve-out blocks reductions only); journaled as
`no-router-is-not-a-gate-escape`.

## Baseline numbers (before)

| measure | value |
| :--- | ---: |
| pytest collected | **3,811** |
| production lines in the five delete-outright modules | 2,581 |
| tests in the seven delete-outright test modules | 153 |
| tracked files mentioning the tier | 611 |
| live (non-archive) files mentioning the tier | 150 |
| cold-start fixture trees | 2 |

The after-numbers are recorded at Step 6.

## Exempt by design — the grep gate must not fail on these

1. `docs/session-sets/**` — 399 archived files. Sets ran under the tier;
   rewriting them would falsify the record.
2. `docs/proposals/**` — 62 files, including this set's own reservation doc.
3. `docs/session-sets/112-remove-lightweight-tier/**` — this set's folder,
   which necessarily names what it deletes.
4. `docs/concepts/tier-model.md` — shrinks to a historical note (S2).
5. `ai_router/CHANGELOG.md`, `ai_router/MIGRATIONS.md`,
   `tools/dabbler-ai-orchestration/CHANGELOG.md` — changelogs are records.
6. The fail-loud error message and its test — they must contain the string
   `tier: lightweight` to do their job.
7. `docs/cross-repo-lightweight-removal-notice.md` (S2) — same reason.

## Deferred to S2 (extension + docs), named here so nothing is lost

- Getting Started tier fork: `gettingStartedActions.ts`,
  `gettingStartedHtml.js`, `gettingStartedDetection.ts`, `client.js`,
  `sessionSetsWebviewProtocol.ts`.
- Tier machinery in the extension: `switchTier.ts`, `tierLegibility.ts`,
  `tierMarkerStore.ts`, `tierRewrite.ts`, `verificationModeRewrite.ts`,
  `setupVerification.ts`, `externalVerification.ts`, `upgradeOlderSets.ts`,
  `migrateSetV4.ts`, `ActionRegistry.ts`, `types.ts`, `fileSystem.ts`.
- `docs/templates/` (12) and the consumer-bootstrap templates — these are
  what a **new** repo inherits, so a missed one re-seeds the tier.
- `dist/` is build output: rebuilt, never hand-edited.
