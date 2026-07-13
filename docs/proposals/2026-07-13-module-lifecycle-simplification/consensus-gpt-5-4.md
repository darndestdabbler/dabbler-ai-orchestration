1. The more useful underlying question is whether `slug` is the module’s identity. If it is, P2/P3 stay brittle. Prefer an immutable `moduleId` eventually. On the proposals:
   - **P1**: Simplifies UI and provenance, but mostly moves complexity into hidden revision tracking. Strongest argument against: **plan and decomposition are ongoing module state, not one-shot work items**.
   - **P2**: Real simplification. It replaces dangerous manual manifest edits with transactional commands. Strongest argument against: **`rename`/`delete` are broader than manifest edits**—history, `planPath`, docs, code roots, and slug reuse all need explicit rules.
   - **P3**: Good simplification for greenfield repos; it removes the pseudo-Default hack and ensures all sets are stamped from day one. Strongest argument against: **it turns a UI convention into durable repo data**, so legacy repos with unstamped sets or repo-level plans need an explicit migration story. P3 should not ship without P2.

2. No. Treat the session set as the **change event**, not the artifact.
   - Keep `project-plan.md` as the stable module artifact.
   - Make substantive plan actions session-set types: `plan:create`, `plan:import`, `plan:revise`.
   - Make decomposition a repeatable session-set type: `decompose:refresh`, which updates backlog/coverage state and/or creates new work sets.
   - Track the current approved plan revision and latest decomposition pass in metadata or derived state.
   
   That preserves verification and audit without freezing anything. The first plan/decomposition sets for a new module are just the first instances of those types, not privileged forever-sets.

3. For substantive planning work, full verification is proportionate. These artifacts have high leverage: bad planning multiplies downstream cost, and you already have a mandatory-verification policy. The over-engineering risk is not verification itself; it is forcing **every tiny plan edit** through the full pipeline. Keep full verification for substantive `plan:*` / `decompose:*` sessions, with a planning-specific rubric, and allow only clearly non-substantive edits outside that flow.

4. Completed session sets should remain immutable audit history. Do **not** cancel or delete them. Make module deletion a soft operation: **archive/retire the module**, keep a tombstone/history entry, and prevent accidental slug reuse so historical sets still resolve correctly.
   
   The cancel rule should be state-based, not type-based:
   - cancel any open/in-progress or substantively authored queued set;
   - remove only untouched scaffold placeholders with no history/content.
   
   So “cancel except unstarted plan/decomposition” is close, but too arbitrary. The exception should be “bootstrap placeholder with no real content,” not “plan/decomposition.”

5. Main migration/compat hazards:
   - **Pseudo-Default repos with unstamped sets**: provide an explicit migration command. Do not silently stamp all legacy sets to `default`; let the operator bulk-assign or leave them as legacy-unassigned.
   - **Legacy repo-level plan**: let `default.planPath` adopt the existing file. Do not force a file move just to fit the new model.
   - **Existing modules with plans but no provenance**: do not backfill fake historical sets. Mark them as legacy and start session-set provenance from the next real revision/decomposition pass.
   - **Numbering**: never depend on literal Set 001/002 except in a brand-new scaffold. Existing repos must use the next global numbers plus explicit set types.
   - **Schema/tooling**: if you add `moduleId`, `status`, aliases, or tombstones, make the schema additive/versioned so older tooling degrades safely.

6. Ship a subset, not P1 as written.
   - **Ship now**: P2 + P3 together.
   - **Change**: make delete = archive/retire, and preferably add immutable `moduleId`s before or with rename/delete.
   - **Defer/rework**: P1 should become session-set-backed revisions/operations (`plan:create|revise`, `decompose:refresh`), not hardcoded “module Set 1/2.”
   
   Concrete recommendation: next release should create a real `default` module on scaffold, add add/rename/archive commands with safe migration/restamping, and keep plan/decomposition as stable module artifacts whose substantive changes are produced by verified session sets.