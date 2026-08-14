# Conventions for this round (read before reporting findings)

## What this session is

Set 131 Session 2 of 3, "The number that is not a price".

`ai_router/copilot-catalog.lock` records a per-model number that was
populated from the premium-request count the Copilot CLI reported for the
**one short probe call** that confirmed the model. Set 078 named it
`premium_request_weight`. The name says "weight"; the value is a single
call's consumption. Measured against the seat store on 2026-08-14 it
disagrees with the authoritative `request_multiplier` for the entire OpenAI
family — `gpt-5.5` probes as `0` and bills at `7.5`, the second-highest
multiplier on the seat — while the Anthropic and Google entries happen to
agree, which is exactly what makes the field look trustworthy.

The defect is **latent**: nothing reads the field for selection today.
Session 1 widened delegation, which is what would create such a reader.
This session disarms the field before that reader exists.

## Suite baseline

- **327 passed, 0 skipped, 0 failed** across the targeted selection covering
  every changed surface: `test_catalog_weight_not_a_price.py` (new),
  `test_copilot_catalog.py`, `test_copilot_routing_integration.py`,
  `test_orchestrator_identity.py`, `test_routing_exclusion_integrity.py`,
  `test_cli_transport.py`, `test_copilot_preflight.py`,
  `test_verify_type_resolution.py`.
- **8** of those are the new `ai_router/tests/test_catalog_weight_not_a_price.py`
  (the spec's irony budget said 7; the extra one exists because the rename
  added real behaviour — the v1-lockfile legacy read — that a structural
  test cannot cover).
- No test was deleted, weakened, or marked xfail. The four renamed
  assertions in `test_copilot_catalog.py` are the same assertions against
  the new field name.
- **Every falsifier was proven by planting (L-112-1), not by reading.** Nine
  defects were applied to the real tree, the named test was run, and the
  tree was restored: a new module reading the field (both spellings), the
  default changed `None` → `0`, the rename reverted, the decoupling sentence
  softened, the measured `gpt-5.5` row deleted, the rationale block
  collapsed, the legacy read dropped, and the prohibition scan widened to a
  naive substring. **All nine fired.**
- The full required-portion run happens at Step 8, after every code-changing
  stage, per the repo's test-run policy (A2). An early full run would be
  invalidated by any remediation this round produces.

## Release contract

Nothing is version-bumped in this session. `change-log.md` and the
`ai_router/changelog.d/` fragment are **Session 3's** declared deliverables
in `spec.md`, not omissions here. Session 3 is on notice (activity log +
disposition) that the fragment must record this rename.

## By-design exclusions — please do not report these as findings

1. **`AGENTS.md`, `CLAUDE.md`, `GEMINI.md` still describe the retired
   verification-only window.** They are Session 3's assigned `Touches` in
   `spec.md`, and their replacement text cites a *"Rotation, and the trade
   we declined"* section that Session 3 creates. This is a known,
   spec-scheduled inconsistency window, not an oversight.
2. **No "Rotation" section exists in `docs/ai-led-session-workflow.md`
   yet.** Session 3 authors it.
3. **`ai_router/copilot-catalog.lock` is not in this diff.** It is
   **gitignored** seat-local machine state (`.gitignore:56`). The rename is
   delivered through its only sanctioned writer and absorbed by its only
   reader; the live seat file keeps loading unchanged and migrates on the
   next `--refresh`. Verified against the real file: 18 models, schema 1,
   values intact after the rename (`gpt-5.5` → `0`, `claude-haiku-4.5` →
   `None`). Journaled in `decisions.jsonl`.
4. **The new test module is named `test_catalog_weight_not_a_price.py` even
   though the field is no longer called "weight".** That exact path is the
   spec's declared `Creates` for this session, and the name records the
   defect the module exists to prevent from returning.
5. **No cost gating, no budget enforcement, no orchestrator model change,
   no new store reads.** All four are explicit `Non-goals` in `spec.md`.
6. **`requiresUAT: false`, `requiresE2E: false`, `pathAwareCritique` absent
   (defaults to `none`).** No UI surface is touched; nothing rendered
   changes. The VS Code extension references the lockfile *path* and parses
   the refresh CLI's stdout line only — it never reads a model field
   (verified by grep over `tools/dabbler-ai-orchestration/src`).

## Three things I want adversarial attention on

1. **The rename itself is a deviation from the reference implementation.**
   `spec.md` Session 2 step 2 says *"Rename it in the lockfile schema to
   what it is"*. The reference implementation at
   `C:\Users\adm.dennis.mitchell\source\set-131-reference\` (which this set
   is otherwise working from) did **not** rename it — it added a NOT-A-PRICE
   comment and a prohibition test and kept the name. I chose the rename:
   the spec's own irony-budget note says *"the field's **name** was the
   defect"*, and `project-guidance.md` → *Prefer removal over addition*
   says to remove the defective surface rather than add a comment defending
   it. Journaled in `decisions.jsonl`. **Is the rename justified, or is it
   churn on a persisted file format for a field with no readers?** Evidence
   that it is cheap: `ModelEntry` is not exported from
   `ai_router/__init__.py` (only `Catalog`, `load_lockfile`,
   `validate_catalog`, `get_cli_version`), and a repo-wide grep found no
   reader outside `copilot_catalog.py` and its tests.

2. **I did NOT coerce a genuine `0` to `None`, and the spec's wording could
   be read as requiring it.** The step says *"make an absent or zero value
   read as unknown rather than free"*. I read that as a constraint on
   **interpretation**, not on **storage**: `0` is a true measurement (that
   probe really did consume zero premium requests), so mapping it to `None`
   would make the lockfile assert "never probed" about a model that was
   probed. Instead, *no* numeric interpretation is permitted at all — the
   prohibition bans every reader outside the catalog module, which is
   strictly stronger than fixing the zero case. Absent stays `None`, and
   `None` means unknown. **If you think the spec requires the `0 → None`
   coercion, say so plainly and name the failure scenario the prohibition
   does not already close.**

3. **The prohibition scan matches on `Path.name`, not on a path.** A future
   file named `copilot_catalog.py` anywhere under `ai_router/` would be
   permitted to read the field without editing the allowlist. I judged the
   basename form acceptable because the allowlist edit is the review
   mechanism and a second module with that exact name is itself a defect —
   but it is a real hole and I would rather hear it named than discover it
   later. Related: is an **absolute** ban on the identifier outside one
   module too strong? It would refuse a legitimate diagnostics dump that
   merely echoes the lockfile verbatim.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding. Please state the concrete
failure scenario for anything you rate Critical or Major.
