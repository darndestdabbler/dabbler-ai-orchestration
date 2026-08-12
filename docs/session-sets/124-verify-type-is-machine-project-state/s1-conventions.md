# Set 124 Session 1 — conventions for the verifier

## Delta since round 1 (this is round 2's actual subject)

Round 1 returned VERIFIED on the code as it stood **before** the full pytest
suite had been run. The full run then exposed a second, larger wave of the
same latent Set 123 defect described in finding 2 below, and fixing it
changed code after the verdict. That delta is:

- **`ai_router/tests/conftest.py`** — a new autouse fixture,
  `_no_real_project_verify_type`, blocking **only the real repo's** answer
  from reaching any test, on both module identities and at **both** seams.
- **`ai_router/tests/test_verify_type_is_gitignored.py`** — one new test
  pinning that the guard covers both seams.

**Why both seams matter, and the mistake worth checking:** `resolve_verify_type`
goes through `find_project_file`, but `derive_transport_profile` — the
function `load_config` actually calls — does **not**; it walks
`find_project_root` and builds the path itself. The first version of the
guard patched only `find_project_file`, looked correct, and left 11 tests
still failing and still making **real Copilot CLI subprocess calls**. Please
scrutinise the guard for a third uncovered seam.

**Scale of the defect, measured:** 21 tests total flipped once this repo
resolved its own verify type — 10 in the config/overrides fixtures, 11 across
`test_drift_guard` / `test_orchestrator_identity` /
`test_routing_exclusion_integrity`. The latter group ran in 380s instead of
52s because it was dispatching through the real seat. Full-suite wall time
fell from 738s to 533s once the guard landed, which is the same effect at
suite scale.

**Full suite, after the last code change:** `3976 passed, 9 skipped` in 533s.
Recorded as the pytest run of record.

## Suite baseline

Targeted pytest at the time of this round, all green:

| selection | result |
| :--- | :--- |
| `test_verify_type_resolution.py` + `test_verify_type_is_gitignored.py` + `test_qualified_verdict.py` | 42 passed |
| `test_transport_profile_config.py` + `test_local_overrides_merge.py` + `test_copilot_routing_integration.py` | 62 passed |
| the six remaining `load_config` consumers (`test_cli_transport`, `test_config`, `test_discovery_model_preference`, `test_guidance_preload_manifest`, `test_metrics`, `test_pricing_schema`) | 254 passed, 1 skipped |

No tracked failures. The full pytest suite runs at Step 8 (after the last
code change), per the repo's test-run policy — its absence here is the
policy, not an omission.

## What this session is, and what it deliberately is NOT

This is **Session 1 of 3** of a correction set. Set 123 (complete) shipped
`project-verify-type.txt` as **committed project configuration**. The
operator ruled on 2026-08-12 that this was a design flaw, in two parts:

> *"We should have stated explicitly that the project-verify-type.txt
> should be excluded from git."*

> *"It isn't machine state per se, it is machine/project state."*

Session 1 re-scopes the file and retires the `committed` vocabulary in
`ai_router/verify_type.py`. **Two things are deliberately out of scope and
are NOT defects in this session:**

1. **`ai_router/local-overrides.yaml`'s `transport.profile` still exists
   and is still honoured.** Once the project file is gitignored, both files
   occupy the identical machine/project scope, so this is a genuine
   duplicate mechanism — it is **Session 2's entire subject** (spec:
   "One mechanism for the machine/project fact"). Reporting it here is
   correct-but-known; please grade it accordingly.
2. **Documentation still says "committed" in `README.md`,
   `docs/quick-start.md`, `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`,
   `docs/planning/verify-type-resolution.md`, `docs/tutorials/adopt-dabbler.md`,
   `docs/templates/consumer-bootstrap/getting-started.md.template`, and the
   extension's `copilotSeatSetup.ts` strings.** That propagation is
   **Session 3's entire subject**, declared in the spec with the file list.
   The session partition is deliberate, not an incomplete consistency fix.

Set 123's own verification artifacts (`s1-*.md`, `s3-*.json`, …) are
**read-only raw records** and are never edited; their "committed" wording is
history, not a live claim.

## Scope actually delivered here

- `.gitignore` gains an **anchored** `/project-verify-type.txt` rule.
- `ai_router/tests/test_verify_type_is_gitignored.py` (new) — six
  falsifiers that plant real violations in a throwaway git repo seeded from
  the **real** `.gitignore`, never the working tree.
- `ai_router/verify_type.py` — `VerifyTypeResolution.committed` removed,
  `resolved` promoted to the real implementation, `to_dict()` key renamed,
  the writer's embedded file header corrected, and the three operator-facing
  CLI messages re-worded.
- `ai_router/__init__.py` — the one production consumer plus three stale
  comments.
- Two test helpers bounded as their own projects (see the defect below).

## Two findings made during the session, both already fixed

Named here so a reviewer does not have to rediscover them, and so the
remediation can be judged:

1. **The writer embedded the inverted claim.** `write_project_verify_type`
   wrote a header reading *"Committed on purpose: it is project
   configuration, not machine state"* into every file the setup command
   produces — the exact inverse of the ruling. A case-sensitive grep for
   `commit` missed the capitalised word; it was caught by reading the
   produced artifact. Now pinned by
   `test_the_written_file_header_does_not_instruct_the_reader_to_commit_it`.
2. **A latent Set 123 defect: ten tests passed only while this repo had no
   verify type.** `test_transport_profile_config.py` and
   `test_local_overrides_merge.py` build synthetic workspaces with no `.git`
   marker, so `find_project_root` walked past the temp tree, fell through to
   the **cwd** anchor, and the real repo's `project-verify-type.txt`
   answered — deriving `transport.profile: copilot-cli` into configs that
   declare no `transports.copilot-cli` block. Proved by moving the file away
   (20 passed) and back (10 failed). Fixed at both shared helpers by giving
   each fixture its own `.git` boundary. Per `L-069-1` the other six
   `load_config` consumers were swept and the class is contained.

   **This was not caused by the code change** — it was armed by Set 123 and
   detonated by the first developer to run the documented
   `verify_type --set`.

## Falsification evidence (L-112-1)

The `.gitignore` rule was **mutation-tested**, not merely observed passing:

| mutation | result |
| :--- | :--- |
| unanchor the rule (`project-verify-type.txt`) | 2 failed — the nested-look-alike guard and the structural rule check |
| delete the rule entirely | 3 failed — both fire tests and the structural check |
| restored | 6 passed |

## Severity guidance

Grade by **consequence** (probability the stated failure reaches a real
user × impact). Low probability **or** low impact is Minor; no nameable
failure scenario is a nit. Session-2 and Session-3 scope, listed above, is
known and owned — please do not spend Critical/Major severity on it.
