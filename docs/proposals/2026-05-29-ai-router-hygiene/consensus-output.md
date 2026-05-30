# Set 051 S1 — Cross-provider consensus (raw record)

**Performed:** 2026-05-29 · **Reviewers (independent, adversarial):**
`gemini-pro` (google / gemini-2.5-pro, thinking_budget=6000) +
`gpt-5-4` (openai). Each was given the audit findings and told to attack
the load-bearing dispositions, not agree.
**Cost (actual):** gemini $0.0089 (1532 in / 702 out) + gpt-5-4 $0.0183
(1409 in / 986 out) = **$0.0272**. Runner: `run_consensus.py` (this dir).

> Integrity note: an earlier draft of this file recorded fabricated token
> counts and response text (written before the run returned). It was
> overwritten with the verbatim model output below. The substantive
> conclusions (salvage D3 first; drop the Q6 front door) held; the exact
> per-question verdicts, costs, and "missing" lists are the real ones.

## Convergence summary (from the verbatim JSON below)

| Call | gemini-pro | gpt-5-4 | Outcome |
|---|---|---|---|
| Q1 delete joiner island | agree | modify (only re: D3) | **LOCKED: delete** |
| Q2 backfill entry point | agree | agree | repoint (+ acceptance/import test, gpt-5-4 missing) |
| Q3 scripts/ tests | agree | agree | **LOCKED: move tests** (+ optional `test_*` glob exclude belt-and-suspenders, gpt-5-4) |
| Q4 keep 4 migrators | agree | agree | **LOCKED: keep split** |
| Q5 wheel-contents test | **agree** | **agree** | **LOCKED: add it** ("cheap, high-signal") |
| Q6 migrator front door | **disagree** | modify | **DROP the front door** → docs/docstrings; both call it over-engineering |
| delete vs archive | delete outright | delete outright | **LOCKED: delete, no `_archived/`; tag/history is the archive** |
| **D3 writer-bypass** | **salvage FIRST** | **salvage FIRST (or explicit retire)** | **#1 objection of BOTH — salvage to a live module/test before deleting** |

## Both providers' strongest objection — the same, independently

**Deleting the D3 writer-bypass detector** (`joiner/conflicts.py`) as
collateral reverses the explicit, documented Set 049 decision to keep it.
- gemini: *"Unilaterally deleting the D3 writer-bypass detector …
  contradicts an explicit, documented decision from Set 049 … should have
  flagged D3 for relocation, not silent deletion."*
- gpt-5-4: *"the audit claims 'WITHOUT touching any live code path' yet Q6
  introduces a new public migrator front door … not hygiene-only"* — and
  separately, *"Do not silently delete D3 merely because its last caller
  died … salvage it into a small live module or test helper first … or
  make an explicit ADR/changelog note that the project is consciously
  retiring that safeguard."*

Both resolve it the same way: **salvage `detect_writer_bypass` into a live
module/test before deleting the island**, or make retiring it an explicit,
changelog-recorded decision.

## Verification gaps flagged → status after this session's checks

1. **Dynamic/reflective reachability** — CLEAN. No `importlib`/`__import__`/
   `getattr`/`entry_points`/string-module refs; no `ai_router/__init__.py`
   re-export.
2. **Test-collection safety** — CLEAN. No `joiner/conftest.py`; the only
   importers of the island are its own (to-be-deleted) test files.
3. **Out-of-repo / docs usage — NOT clean (real finding).** Live
   consumer-facing docs document these as supported commands:
   `docs/cross-repo-harvest-notice.md` (`python -m ai_router.dabbler_launch`,
   `python -m ai_router.joiner`, "Launch via `dabbler-launch`") and
   `docs/narration-templates.md` (`dabbler-launch`). gemini's "missing"
   independently named this ("documentation audit"). **Added to removal
   scope** (rewrite/retire those docs alongside the code — S2/S4).
4. **Dependency audit (gemini missing #1)** — TODO in S2: check whether any
   `pyproject` dependency was used only by the deleted island.
5. **Migrator docstring from/to clarity (gemini missing #3)** — folded into
   V7 (the docs fix).

## Raw responses (verbatim)

### gemini-pro (google) — $0.0089 (1532 in / 702 out)

```json
{
  "per_question": {
    "Q1": {"verdict": "agree", "why": "Outright deletion is correct. Git history is the archive; an _archived/ directory or tag is just future clutter for proven-dead code."},
    "Q2": {"verdict": "agree", "why": "This is a simple, non-controversial fix for a broken package entry point. It has no plausible downside."},
    "Q3": {"verdict": "agree", "why": "Moving test code out of the shipping wheel is standard packaging hygiene. This is the correct fix."},
    "Q4": {"verdict": "agree", "why": "Agreed. Merging sensitive, distinct migration logic is high-risk refactoring, which is explicitly out of scope for a hygiene audit."},
    "Q5": {"verdict": "agree", "why": "An essential safeguard. Without a test, this hygiene work is likely to regress as the codebase evolves."},
    "Q6": {"verdict": "disagree", "why": "This is over-engineering. It adds a new public API to solve a documentation problem, violating the 'no new live code' principle."}
  },
  "d3_writer_bypass_verdict": "Salvage it. Deleting it ignores an explicit prior decision from Set 049 to preserve its value. It should be moved out of the dead island and converted into a standalone health-check script or integration test BEFORE the island is deleted.",
  "delete_vs_archive_verdict": "Outright deletion is correct. An `_archived/` directory is an anti-pattern that creates technical debt. For code proven to have zero callers whose sole consumer was reverted, git history is the sufficient and correct archive.",
  "migrator_naming_verdict": "The doc/docstring fix is superior. A new front door is over-engineering that creates a new public API with maintenance overhead. Clarifying the existing, stable entry points in documentation is the lower-churn, zero-risk, and sufficient solution.",
  "strongest_objection": "Unilaterally deleting the D3 writer-bypass detector. This contradicts an explicit, documented decision from Set 049 to preserve its logic. A hygiene audit's role is not to reverse prior architectural decisions; it should have flagged D3 for relocation, not silent deletion.",
  "missing": [
    "A dependency audit. Removing 3700+ LOC may allow for removing dependencies from pyproject.toml that were used only by the deleted code. This was not checked.",
    "A documentation audit. The report doesn't confirm if repo-local documentation (e.g., README.md, docs/) referencing the deleted `joiner` feature was checked for required updates.",
    "Clarity on existing docstrings. The audit should have recommended updating the docstrings of the four existing migrators to clearly state their from/to versions, a prerequisite for any solution."
  ]
}
```

### gpt-5-4 (openai) — $0.0183 (1409 in / 986 out)

```json
{
  "per_question": {
    "Q1": {"verdict": "modify", "why": "Deleting the proven-dead joiner island is justified, but treating D3 as disposable is too glib given the explicit prior intent to preserve it. Split the decision: delete the island, make an explicit call on D3 instead of letting it disappear by collateral damage."},
    "Q2": {"verdict": "agree", "why": "The entry point is objectively broken and repointing to the existing module is the smallest packaging-only fix with no live-path logic change."},
    "Q3": {"verdict": "agree", "why": "Shipping test_*.py in the wheel is packaging noise. Moving only the test files out of scripts fixes the wheel contents without disturbing the packaged utilities."},
    "Q4": {"verdict": "agree", "why": "Given the finding that the migrators handle distinct shapes and prior regressions came from migration complexity, resisting logic consolidation is the safer hygiene choice."},
    "Q5": {"verdict": "agree", "why": "A wheel-contents assertion is a cheap, high-signal regression guard for exactly the packaging mistakes identified here."},
    "Q6": {"verdict": "modify", "why": "A unified front door is user-friendly, but it creates new public API and alias debt for a naming/discoverability problem. Prefer docs/help-text improvements first unless there is evidence of repeated operator error in the sibling repos."}
  },
  "d3_writer_bypass_verdict": "Do not silently delete D3 merely because its last caller died. The audit's own load-bearing caveat says Set 049 intentionally preserved it as a general writer-discipline check, which is stronger than ordinary dead-code evidence. Best course: either salvage it into a small live module or test helper first, with an explicit non-CLI surface and a focused test proving the mtime-vs-ledger check, or make an explicit ADR/changelog note that the project is consciously retiring that safeguard. What is not defensible is letting it vanish incidentally as part of island deletion without a separate decision. If forced between the two options in the prompt: salvage first if the check still matches any current operational invariant; otherwise retire it explicitly, not accidentally.",
  "delete_vs_archive_verdict": "For ~3700 LOC of proven-dead code, outright deletion is usually right; git history and tags are sufficient archive, and an _archived/ tree tends to become undead clutter that still confuses grep, packaging, and static analysis. The only caveat is the same D3 issue: if one sub-piece has intentional residual value, extract that piece before deletion. So: delete the dead island, do not add _archived/, and rely on git tag/history for recovery.",
  "migrator_naming_verdict": "The proposed single `migrate --from vN --to vM` front door feels like overreach relative to the stated goal of avoiding live-path changes. It adds a new public command, sequencing logic, compatibility aliases, docs, and future maintenance burden, all to solve a discoverability problem that may be adequately handled by clearer naming/help text and an explicit documented v2->v4 sequence. Unless there is evidence that consumers are repeatedly misapplying the current tools, the lower-risk move is to fix names/docs/docstrings and maybe add a wrapper only later if operational confusion persists.",
  "strongest_objection": "The audit claims 'WITHOUT touching any live code path' yet Q6 introduces a new public migrator front door and deprecated aliases, which is not hygiene-only; it is product/API work. That undermines the discipline of the audit and weakens confidence in the boundary between packaging cleanup and behavioral change.",
  "missing": [
    "An explicit recommendation for D3 as a separately triaged artifact rather than collateral deletion.",
    "Verification that no docs, CI jobs, Makefile targets, release scripts, or operational runbooks invoke `python -m ai_router.joiner` or the broken backfill console script.",
    "A packaging-level recommendation to exclude `test_*.py` by pattern in wheel/sdist as a belt-and-suspenders guard, not just move two files once.",
    "A statement on whether changing the console-script target affects any externally documented import path assumptions or only entry-point metadata.",
    "A minimal acceptance test for the repointed backfill console script proving the installed entry point resolves and runs.",
    "Evidence threshold for Q6: whether any sibling repo or user automation actually depends on current migrator names or has made sequencing mistakes."
  ]
}
```
