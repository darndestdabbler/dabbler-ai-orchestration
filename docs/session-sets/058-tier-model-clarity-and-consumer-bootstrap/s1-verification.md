# Session 1 cross-provider verification (Set 058)

- Verifier model: gpt-5-4 (gpt-5.4)
- Tier: 3
- Cost (this call): $0.2553
- Total cost (incl. any auto-verify): $0.2553
- Escalated: False
- Truncated: False

---

VERDICT: ISSUES_FOUND

- **Critical** — `docs/templates/consumer-bootstrap/spec.md.template`  
  **Issue:** The canonical `spec.md` template omits `schemaVersion: 4`. D4 and `docs/concepts/tier-model.md` both say the spec shape is schemaVersion 4 with required `tier` + `verificationMode`; this template emits the latter two but not the schema version. A fresh consumer repo generated from it will still produce a non-canonical spec.  
  **Location:** `## Session Set Configuration` YAML block.  
  **Fix:** Add a literal `schemaVersion: 4` in the canonical position defined by `docs/spec-md-schema.md`, then snapshot-test the rendered stub.

- **Major** — `docs/templates/consumer-bootstrap/start-here.md.template`  
  **Issue:** The repo-level `{{TIER}}` banner contradicts the SSoT's per-set tier model. `start-here.md` is a single repo-wide file, but `tier-model.md` says tier is resolved from the active `spec.md` and can vary set-by-set within one repo. `> **This project's tier:** {{TIER}}` becomes wrong as soon as a repo contains mixed-tier sets.  
  **Location:** Intro callout above `## The cold-start chain`.  
  **Fix:** Remove the repo-level `{{TIER}}` claim. Say tier is determined from the active set's `spec.md` in Step 2.

- **Major** — `docs/concepts/tier-model.md`, `docs/templates/consumer-bootstrap/spec.md.template`, `docs/templates/consumer-bootstrap/start-here.md.template`, `docs/templates/consumer-bootstrap/engine-file.shared-body.md`  
  **Issue:** The SSoT is not actually the single canonical explanation yet. The SSoT says downstream surfaces point here “rather than restating the model,” but these templates still paraphrase it locally (`"Lightweight is router-off, not Python-off"`, `"full runs the AI router..."`, local verification summaries). The prose is accurate, but it is still duplicated drift surface and misses D1.  
  **Location:** SSoT opening claim; spec template `> **Tier model:**` block; start-here intro and Step 2; engine shared body `## This project's tier`.  
  **Fix:** Strip these surfaces down to local operational facts only and replace the explanatory prose with a short pointer to `docs/concepts/tier-model.md`.

- **Major** — `docs/templates/consumer-bootstrap/spec.md.template`, `docs/templates/consumer-bootstrap/session-state.json.template`, `docs/templates/consumer-bootstrap/README.md`  
  **Issue:** The template bundle is internally inconsistent about session count. The README exposes `{{TOTAL_SESSIONS}}` as a canonical token, but the spec template hardcodes only two session sections and the state template hardcodes exactly one session object. That means the “durable source” cannot faithfully render a 1-session, 3-session, or N-session set without undocumented hidden generation logic.  
  **Location:** README token table; spec template `### Session 1...` / `### Session 2...`; `session-state.json.template` `sessions` array.  
  **Fix:** Either support generated repeated session sections/entries from `TOTAL_SESSIONS` and document that explicitly in the bundle README, or constrain the canonical templates to a fixed count and remove the misleading token.

- **Minor** — `docs/templates/consumer-bootstrap/README.md`, `docs/templates/consumer-bootstrap/spec.md.template`  
  **Issue:** The anti-restatement guidance is self-contradictory. The README says “Never restate the tier model here” while restating writer-level tier behavior; the spec template says “Do not restate the model in this spec” immediately after restating it. This weakens the editing rule and invites more paraphrases.  
  **Location:** README `## The only tier divergence the writer applies` and `## Rules for editing these templates`; spec template `> **Tier model:**` callout.  
  **Fix:** Rewrite the guidance to allow only strictly local operational deltas, or remove the local summaries entirely and keep only the SSoT link.