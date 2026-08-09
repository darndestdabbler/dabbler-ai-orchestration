# S3 verification conventions — read before Round 1

> Handed to every verifier round for Set 112 Session 3. Its purpose is to
> keep Round 1 spent on real defects instead of on the agreed baseline
> (project-guidance → *up-front conventions block*).

## What this session is

Set 112 removes the **Lightweight tier** from the Dabbler AI-led-workflow
framework. Session 1 (VERIFIED) removed the router half; Session 2
(VERIFIED) removed the extension and docs half. **Session 3 — this one —
is the closing session**, and its spec plan is exactly three deliverables:

1. **The anti-resurrection gate** — an executable acceptance gate proving
   the tier cannot come back silently, wired into CI.
2. **The full matrix once** against the final build (release boundary).
3. **The guided-look UAT walk** and **release staging** — a major version
   bump, changelog breaking-change entries, and a ready-to-send consumer
   notice. **Publishing, tagging, and sending the notice are
   operator-gated and deliberately NOT done here.**

This is a *removal* set. Its non-goals are explicit in `spec.md`: no
verification-loop changes, no seat-profile changes, no consumer-repo
edits, and no opportunistic refactors.

## Suite baseline — all green, no tracked failures

| Suite | Result | Note |
|---|---|---|
| Layer 1 `python -m pytest` | **3,603 passed, 0 failed, 9 skipped** (16m51s) | The 9 skips are pre-existing and environment-gated. |
| Layer 2 `npm run test:unit` | **1,606 passing, 0 failing, 1 pending** | The 1 pending is pre-existing. |
| Layer 3 `npm run test:playwright` | **33 passed, 0 failed** (10.3m) | Run after the last code change. |
| `ai_router/scripts/drift_guard.py` | exit 0 | |
| `ai_router/scripts/tutorial_gate.py` | exit 0 | |
| `ai_router/scripts/lightweight_resurrection_guard.py` (new) | exit 0 | |
| `npx tsc --noEmit` | clean | |

All three suites are recorded as runs of record for session 3 and the
freshness check passes. **There is no known failing test.** A finding
that asserts a suite is red is wrong on its face — re-run rather than
report.

## The release contract — what is bumped, what is deliberately pending

- `dabbler-ai-router`: `0.34.0` → **`1.0.0`** (`pyproject.toml`,
  `ai_router/__init__.py`), and the changelog's `[Unreleased]` section
  became `## [1.0.0] — 2026-08-09 (staged; publish operator-gated)`.
- Extension: `0.49.0` → **`0.50.0`**, with a new changelog section. The
  `0.49.0` header was re-labelled *superseded, never published* — that
  is the repo's existing precedent (`0.48.0` was handled the same way).
- **Nothing is published, tagged, or sent.** No PyPI run, no Marketplace
  run, no git tag, and `docs/cross-repo-lightweight-removal-notice.md`
  has not been sent to any consumer. A finding that this session should
  have published is a finding against the spec, which reserves all three
  to the operator.
- The **version number itself** (`1.0.0` vs. staying pre-1.0 at
  `0.35.0`) is journaled in `decisions.jsonl` and is Decide item A of the
  walk. Argue it if you disagree — but it is a decision, not an oversight.

## By-design exclusions — NOT defects

1. **Archives are not rewritten.** `docs/session-sets/**` and
   `docs/proposals/**` still describe the tier in the present tense.
   The new gate excludes both subtrees by construction.
2. **Changelogs are records.** Historical entries stay verbatim.
3. **`docs/concepts/tier-model.md`** is a deliberate historical note;
   **`docs/cross-repo-lightweight-removal-notice.md`** names
   `tier: lightweight` repeatedly because that is its job.
4. **~105 live files still MENTION the tier.** That is the intended end
   state, not a miss. The set's claim — and the gate's assertion — is
   that **zero live files DECLARE it**. See the next section.
5. **`--no-router` / `DABBLER_NO_ROUTER` still exist** as CI/test
   affordances (spec Decisions item 2). S1 removed their gate relief.
6. **`test-fixtures/cold-start/full/` keeps its `full/` directory name** —
   a path, not a claim.

## The gate's central design choice — please review it as a choice

`ai_router/scripts/lightweight_resurrection_guard.py` had to distinguish
"declares the tier" from "explains why the tier is gone", because the
removal deliberately leaves ~40 mentions behind (the migration message,
its tests, the historical note, the notice, the changelogs, and comments
explaining missing branches).

It classifies **by position, not by a file allowlist**:

- **Narration territory** (never scanned): comments, Python docstrings
  (triple-quoted strings), markdown prose and inline backticks.
- **Declaration territory** (always scanned): code outside comments,
  fenced code blocks in markdown, and YAML/JSON bodies.

The rejected alternative was an allowlist of the ~30 files that
legitimately name the tier; it was rejected because an allowlist ages
into a blanket exemption — anything could resurrect inside a listed
file. Both are journaled.

Two escapes exist and are narrow on purpose:

- `SELF_EXEMPT` — the gate's own module and its test, which must spell
  the deleted names out. This cannot hide a real resurrection, because
  `check_deleted_files_stay_deleted` reads the **filesystem**, not the
  text.
- `FROZEN_HISTORY_MARKER` — one superseded notice
  (`docs/cross-repo-lightweight-notice.md`) preserved verbatim. The
  marker must appear in the first 40 lines, applies only to markdown, is
  **printed on every run**, and a test pins the set of files using it to
  exactly one.

**Where to attack it:** find a resurrection that lands in declaration
territory and is NOT caught, or a legitimate narration form that IS
caught. The test module is mostly falsifiers for exactly this reason —
41 tests, planted-and-caught and planted-and-spared.

## What this session found (fixed here, recorded so it is not re-derived)

The gate caught two live instructions on its first run, and three stale
present-tense claims were fixed alongside (L-064-8 class):

1. `docs/cross-repo-migration-guard-notice.md` — a notice whose banner
   says everything else in it still applies — told consumers to run
   `ai_router.migrate_lightweight_to_canonical_v4` as step 2 of a
   3-migrator chain. S1 deleted that module. Chain corrected to two, with
   a dated correction note.
2. `docs/cross-repo-lightweight-notice.md` said the same; it is a
   do-not-send frozen record, so it got the frozen-history marker and an
   expanded banner rather than a body edit.
3. `docs/session-constitution.md` (a **preload** file) still named
   `verificationMode` as a live gate-policy record → corrected to
   `contractGate`, which really is recorded once at first `start_session`.
4. `fileSystem.ts` kept an `activityLogParsed` binding that reads to
   nothing now that the `verificationMode` resolution it fed is gone.
5. `upgradeOlderSets.ts` still counted "three migrators".

## The walk gap, and the stager change it forced

The spec's first Look item is "the form shows no tier question". The
Getting Started form renders **only** while a workspace has no
materialized session set (`SetupStatusView.buildGettingStarted` keys the
flip on `hasAnySets`), and the fixture workspace ships four — so that
item could not be walked at all.

`npm run walk -- --empty` now stages a real project with no sets, and
`walk-smoke` passes extra args through so the mode is **proven**:
`npm run walk:smoke -- --empty` reported the reveal succeeded. Three
Layer 2 tests pin it, including that the staged project sits inside the
directory `main()` deletes on cleanup.

This is the only product-adjacent change in the session that was not on
the spec's list. It is dev tooling (`scripts/**` is `.vscodeignore`d, so
it does not ship in the VSIX), and it exists because the spec's own UAT
step was otherwise unexecutable.

## Where to look hardest

- **The gate's regexes**, against the narration/declaration boundary
  above. A false negative there is the whole session's value.
- **The changelog claims.** Both changelogs assert deletions and
  behavior; every claim was checked against the tree before writing
  (L-064-8), so a still-false claim is a real Major.
- **The version bump's completeness**: `pyproject.toml`,
  `ai_router/__init__.py`, both changelogs, and
  `docs/repository-reference.md`'s release-status rows. A missed site
  would ship a package whose reported version disagrees with its metadata.
- **The walk's followability** (`s3-uat-walk.md`) for a reader with zero
  session context: every command must work as written and every artifact
  it points at must exist.

## Severity rubric (grade by CONSEQUENCE)

Probability the stated failure scenario reaches a real user × impact. Low
probability **or** low impact is **Minor**. A finding with no nameable
failure scenario is a **nit**, not a Major. Every blocking finding must
name the exact requirement violated, the concrete impact, and the
evidence; lacking all three, record it as Minor. Semantic equivalence is
not a defect.
