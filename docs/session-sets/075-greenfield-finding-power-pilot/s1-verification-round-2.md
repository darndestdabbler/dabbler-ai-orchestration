- **R1-1 — RESOLVED** — `docs/greenfield-matrix-protocol.md` §6 now shows `matrixArms` as a 3-entry list of `{surface, provider, model}` covering `push:anthropic`, `pull:openai`, and `pull:google`, and both `telemetry/README.md` and the addendum require `matrixArms` for every scored arm.
- **R1-2 — RESOLVED** — Scoring/credit text now consistently names the provider×surface **arm** as the unit (`Per-Arm Scoring`, rubric “Scoring Unit”, `armsCaught:` examples), while `docs/greenfield-matrix-protocol.md` §8 defines **cell** only as a dual-surface `(push, pull)` run.
- **R1-3 — RESOLVED** — The Purpose line now presents “which arm surfaces the most real defects” as the motivating question and explicitly limits measurement to “relative finding yield + precision against the adjudicated union, not recall.”

**Issue →** Per-arm scoring is not fully implementable from the documented provenance tags: the rubric still says consolidated provenance is `push-only / pull-only / both`, which cannot distinguish `pull:openai` from `pull:google` or “both pull arms,” so `TP`, `FP`, and `unique-TPs` by arm are not reproducible.  
**Location →** `docs/greenfield-adjudication-rubric.md` — “The Scoring Unit: the provider×surface arm”, “Column Formulae”, and “Worked Flow”.  
**Fix →** Require explicit per-finding provider×surface provenance lists in the consolidated artifact/adjudication record (e.g. `sourceArms: [push:anthropic, pull:openai]`, `[pull:openai, pull:google]`, `[pull:google]`), replace `push-only / pull-only / both` with those arm lists, and define `TP`/`FP`/`unique-TPs` from that arm-level provenance.

**Issue →** The telemetry package shape is inconsistent between producer instructions and the canonical layout: the addendum says to copy `matrix-run/` into `<telemetry>/<repo>/<session>/`, while the telemetry README defines the report files as living directly under `<session>/` with no `matrix-run/` subdirectory.  
**Location →** `ai_router/prompt-templates/greenfield-matrix-addendum.md` step 6 vs. `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/README.md` “Layout”.  
**Fix →** Choose one canonical directory shape and state it identically in both places; e.g. “copy the **contents** of `matrix-run/` into `<telemetry>/<repo>/<session>/` alongside `metadata.json`,” or update the README layout to show a `matrix-run/` subdirectory.

**Verdict: ISSUES_FOUND**
