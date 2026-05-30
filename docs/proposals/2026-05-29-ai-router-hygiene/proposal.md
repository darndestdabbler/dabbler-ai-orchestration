# ai_router Hygiene & Dead-Code Audit — Proposal (Set 051 S1)

> **Status:** DRAFT — audit findings + recommended dispositions. The
> contested calls (Q1 delete-vs-archive, Q4/Q6 migrator consolidation +
> naming) go to cross-provider consensus before the verdict is locked.
> **Date:** 2026-05-29 · **Session Set:** 051 · **Session:** 1 of 4
> **Spec:** `docs/session-sets/051-ai-router-hygiene-and-dead-code-audit/spec.md`

---

## 1. Method & scope

Fresh usage scan over `ai_router/` (36 top-level modules, a 7-file
`joiner/` subpackage, a `scripts/` dir, 52+ test files) plus a
caller-trace across every surface that could consume the suspect code:
ai_router internals, `[project.scripts]` entry points, the VS Code
extension source (`tools/dabbler-ai-orchestration/src`), and the three
consumer repos. Nothing is marked for deletion without a zero-live-caller
citation. No live code path is changed by this audit.

---

## 2. Findings

### F1 — `joiner/` + `dabbler_launch.py` is an orphaned island (PROVEN dead)

The joiner subsystem and the `dabbler-launch` wrapper were the
writer/reader halves of the Set 044/045 dual-primary log-harvest
architecture. Their only live consumer was the extension's
`HarvestService`, **deleted in Set 049** (P4 Explorer revert). Set 049's
own notes admit it kept "load-bearing scaffolding in `ai_router/joiner/`"
— but nothing loads it.

Zero-live-caller evidence:
- **ai_router internals:** no module imports `ai_router.joiner` or
  `ai_router.dabbler_launch` (excluding the island itself and its own
  tests). Empty grep.
- **Entry points:** no `[project.scripts]` / toml / yaml reference. The
  joiner was only ever invoked as `python -m ai_router.joiner`; nothing
  in-repo or in consumer repos invokes it.
- **Extension source:** only two stale **doc-comment** mentions
  (`regenerateNarrationTemplates.ts`, `sessionSetsWebviewProtocol.ts`).
  No live import. `HarvestService` survives only as a compiled
  `out/providers/HarvestService.js` build leftover.
- **Consumer repos:** `joiner`/`dabbler_launch` appear *only* under
  `.venv/.../site-packages/ai_router/` (the installed package) in
  harvester + platform — never in consumer source. homehealthcare-accessdb
  (Lightweight) has neither.

Surface to remove: `ai_router/joiner/` (`__init__`, `__main__`, `cli`,
`parsers`, `schema`, `coverage`, `conflicts`) + `ai_router/dabbler_launch.py`
+ their tests (`test_joiner_{cli,schema,parsers,coverage,conflicts}.py`,
`test_dabbler_launch.py`, `test_dabbler_launch_join_e2e.py`).

> **Caveat (re-litigation guard):** the D3 `writer-bypass` detector lives
> in `joiner/conflicts.py`. Set 049 kept it "decoupled as a general
> writer-discipline check," but it too has no live caller post-049. If we
> remove the island, D3 goes with it. If any future writer-discipline
> surface wants D3, it is recoverable from git history. **Flag for
> consensus:** confirm nobody intends to wire D3 back in the near term.

### F2 — `backfill` console-script entry point is broken

`pyproject.toml`:
```
backfill_session_state = "ai_router.backfill_session_state:main"
```
points at a module that does not exist at top level — the file is
`ai_router/scripts/backfill_session_state.py`. An installed
`backfill_session_state` console script would `ModuleNotFoundError`. (The
*library* function `backfill_session_state_files` in `session_state.py`
is live and unaffected — used by tests + `ai-led-session-workflow.md`.)

### F3 — stray tests ship in the PyPI wheel

`ai_router/scripts/` holds `test_session_state_backfill.py` and
`test_dump_session_state_schema.py`. The wheel exclude only covers
`ai_router.tests` / `ai_router.tests.*`, so these `scripts/` tests are
packaged and shipped to PyPI consumers. Tests are also split across two
locations (`tests/` and `scripts/`).

### F4 — four migrators: distinct, all live, names inconsistent

`migrate_session_state` (actually v2→v3), `migrate_v3_to_v4`,
`migrate_lightweight_to_canonical_v4`, `migrate_router_config` — all in
use, none redundant. The names do not encode that **v2→v4 requires
running three of them in sequence** (the Set 050 S2 empirical finding).
Logic consolidation (Q4) vs naming/discoverability (Q6) are separate
questions; see §3.

### F5 — superseded Claude `SessionStart` hook (scoped to S3)

Set 053 moved schema-drift detection into the router lifecycle
(`start_session`/`close_session` → `summarize_drift`), firing for every
orchestrator on every host. That makes the Set 050 Claude-only hook
(`claude-session-start-invoker.js` + its installer + the
`test_invoker_schema_constant.py` pin) redundant: its `scanSchemaDrift`
JS duplicates `summarize_drift` (with divergent wording), and its
`start_session` invocation is a non-load-bearing Claude-only convenience.
Verified live: registering this session ran `start_session`, which
emitted the 053 advisory unaided. **Retirement scoped to the new S3.**

### Confirmed still-used (do NOT touch)

`close_lock` / `close_out` / `close_session` (three distinct live
modules). All `[project.scripts]` except the `backfill` path bug resolve
correctly. The four migrators (F4). `backfill_session_state_files` in
`session_state.py`.

---

## 3. Open questions → recommended dispositions

- **Q1 — joiner/dabbler_launch: delete vs archive.**
  **Recommend DELETE outright.** Git history is the archive; an
  `_archived/` dir or tag adds clutter the next hygiene set would just
  flag again. A Set-037–041 launch-adapter revival would re-spec from
  scratch regardless. *(Contested → consensus.)*
- **Q2 — `backfill` entry point.**
  **Recommend repoint** to `ai_router.scripts.backfill_session_state:main`
  (the module already lives there with a `main()`; least churn, preserves
  the documented `python -m` / console-script usage). Relocating the file
  to top level is more disruptive for no gain.
- **Q3 — `scripts/` disposition.**
  Move `test_session_state_backfill.py` + `test_dump_session_state_schema.py`
  to `ai_router/tests/`. Keep the two utilities
  (`backfill_session_state.py`, `dump_session_state_schema.py`) in
  `scripts/` (they are intentionally archived-but-packaged per Set 021).
  Ensure the wheel ships no `test_*`.
- **Q4 — migrator consolidation (logic).**
  **Recommend KEEP the four-way split** — each handles a genuinely
  distinct shape; a shared "normalize core" merge risks the exact
  regressions Sets 047/050 fought. Re-evaluate only if consensus sees a
  low-risk seam. *(Consensus.)*
- **Q5 — wheel-contents assertion.**
  **Recommend YES** — add a test asserting the built wheel contains no
  `test_*` and none of the removed dead modules (regrowth guard). Lands
  in S2.
- **Q6 — migrator naming/discoverability.**
  **Recommend a single `migrate` front door** that sequences the right
  steps for a requested `--from vN --to vM`, keeping the existing
  `python -m` entry points as **deprecated aliases** (consumer repos may
  call them). Names alone can't express the v2→v4 = 3-step sequencing;
  a front door can. *(Contested → consensus; weigh against churn.)*

---

## 4. Locked removal / relocation list (pending consensus on Q1/Q4/Q6)

**S2 (ai_router, PyPI):**
1. Remove the joiner island + `dabbler_launch.py` + their 7 test files
   (per Q1 verdict).
2. Repoint the `backfill` entry point (Q2).
3. Move 2 stray `scripts/` tests → `tests/`; confirm wheel excludes all
   tests (Q3).
4. Add the wheel-contents regression test (Q5).
5. Migrator action per Q4/Q6 verdict (naming front door + deprecated
   aliases if blessed; otherwise no-op beyond a doc note).

**S3 (extension, Marketplace):**
6. Delete `claude-session-start-invoker.js` + the
   `installOrchestratorHook.claudeCode` installer surface; remove the
   now-dead `test_invoker_schema_constant.py`; reconcile docs; ship a
   consumer/operator hook-removal note.

---

## 5. Cross-provider consensus — DONE

Ran gemini-pro + gpt-5-4 (independent, adversarial), **$0.0272**. Verbatim
record: `consensus-output.md`. Locked dispositions: `verdict.md`. Headlines:

- **Every deletion finding confirmed** — Q1 delete, Q4 keep-split, Q5
  wheel-contents test: all unanimous-agree. Delete-not-archive: unanimous.
- **Both providers' single strongest objection, independently:** do not
  delete the **D3 writer-bypass detector** (`joiner/conflicts.py`) as
  collateral — Set 049 deliberately retained it. **Verdict V2: salvage
  `detect_writer_bypass` into a new live `ai_router/writer_discipline.py`
  + test before deleting the island** (default salvage; operator may
  override to an explicit, changelog-recorded retire).
- **Q6 disposition CHANGED:** drop the `--from/--to` migrator front door —
  both judged it over-engineering. Fix via per-migrator from→to docstrings
  + `MIGRATIONS.md` + optional idempotent `migrate_to_latest()`.
- **Refinements adopted from the panel's "missing" lists:** add an
  entry-point acceptance/import test (Q2); optional `test_*` pattern
  exclude as belt-and-suspenders (Q3); dependency audit after removal.
- **Reachability gaps:** dynamic/reflective load — clean; `__init__`
  re-export — none; `joiner/conftest.py` — none. **But out-of-repo docs is
  NOT clean:** `docs/cross-repo-harvest-notice.md` +
  `docs/narration-templates.md` document the joiner/dabbler_launch CLIs as
  supported → added as **V8 live-docs reconciliation** (gemini flagged it).

> Process note: an earlier draft of the consensus artifacts recorded
> pre-run placeholder content with inflated costs; it was corrected to the
> verbatim model output ($0.0272, real per-question verdicts). See the
> integrity note in `consensus-output.md`.
