<!--
  Greenfield verification-matrix run — standard instruction addendum (Set 075).

  This is the reusable block a pilot consumer repo's agent-instruction files
  (CLAUDE.md / AGENTS.md / GEMINI.md) reference. It is the concrete answer to
  "how do the AI agents produce the verification matrix on fresh work."

  Canonical protocol (the WHY + the full rules):
    dabbler-ai-orchestration/docs/greenfield-matrix-protocol.md
  Fixed adjudication rubric (the TP/FP/dup/unclear definitions + scoring table):
    dabbler-ai-orchestration/docs/greenfield-adjudication-rubric.md

  Stable raw URL (for consumer repos without ai_router/ checked in):
    https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/ai_router/prompt-templates/greenfield-matrix-addendum.md
-->

### Greenfield verification-matrix run (pilot — per substantive build session)

**Applies to:** source-code-bearing build sessions only. Skip for doc / planning /
mechanical sessions (no source diff = no finding-power signal).

**Prerequisite:** `dabbler-ai-router >= 0.26.0` in the repo venv.

**At Step 6 (verification), BEFORE applying any fixes:**

1. Identify the session's fresh diff range: `--base <commit at session start>`
   (`--head` defaults to the working tree, capturing uncommitted work).
2. Run the matrix over the repo itself (`--target .` stamps the repo name):

   ```bash
   python -m ai_router.verification_only_app run \
     --target . \
     --base <session-start-ref> \
     --cell push:anthropic --cell pull:openai --cell pull:google \
     --orchestrator-provider <this-session's-provider> \
     --orchestrator-model <this-session's-model> \
     --out docs/session-sets/<slug>/matrix-run/verification-matrix-report.json
   ```

   (Also writes `matrix-run/remediation-report.{json,md}`. Each `--cell` is a **roster
   entry** — `SURFACE:PROVIDER[:MODEL]`, an arm token — not a `(push,pull)` matrix cell;
   the tool's push×pull cross-product of the three roster entries forms the two
   dual-surface matrix cells. Keep this roster for corpus continuity — changing it forks
   the corpus; record why in the run if you do.)
3. **Freeze the measurement:** these three files, untouched, ARE the measurement
   record. Do not edit them; do not re-run over the same range to "improve" them.
   A post-fix re-run, if any, goes in a separate `post-remediation/` folder and
   never overwrites the first run.
4. **Adjudicate** every finding in `remediation-report.md` against the fixed
   rubric (TP / FP / duplicate / unclear), working from the **deduped consolidated**
   report (not provider-branded raw output), and record the per-finding verdict +
   which **arm(s)** (`surface:provider`) caught each TP in `matrix-run/adjudication.md`
   (e.g. `armsCaught: [push:anthropic, pull:openai]`). Note the run's **diff class**
   (`source-dominated` / `packaging-small`).
5. **Remediate** from the report as normal scrutiny, then run the rest of Step 6.
   Record any real defect the normal verification or end-of-set dogfood caught that
   the **matrix missed** (and vice-versa) — that is the adjudicated-union evidence.
6. **Ship telemetry back:** copy the **contents** of `matrix-run/` (the three frozen
   reports + `adjudication.md`) directly into
   `../dabbler-ai-orchestration/docs/session-sets/075-greenfield-finding-power-pilot/telemetry/<repo>/<session>/`
   — the files live directly under `<session>/`, no nested `matrix-run/` (this matches
   the canonical telemetry README layout) — and add a `metadata.json` alongside them
   (target repo; set/session id; base/head refs; matrix
   package version; orchestrator provider+model; a `matrixArms` list giving every
   scored push/pull arm's provider+model — one push + two pull, so a single pull
   field cannot name both; diff stats; diff class; `phase=pre-remediation`;
   `includedInFindingPower=true|false`). Commit it in canonical — the telemetry is
   reviewable, not gitignored.

**Honest framing:** this measures **relative finding yield + precision** against the
adjudicated union — **not recall**. Both arms stay strong adversarial (L-069-2 — the
matrix varies *provider*, not framing).
