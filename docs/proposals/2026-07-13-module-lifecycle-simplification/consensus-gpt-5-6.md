1. **Overall:** The right scope is module lifecycle consistency, not initialization alone. Approve P1, P2, and P3 as one coherent simplification. Keep `project-plan.md` as the stable artifact, use session sets as audited transactions, and never infer purpose from set numbers.

2. **Contested refinements:**
   1. **Module identity:** Keep slug as identity. Rename with a preflighted, all-or-nothing rewrite of `modules.yaml` and every affected `module:` stamp. `moduleId`, tombstones, and a persistent slug registry are overengineering. Reject renames that would merge with an undeclared slug’s existing history.
   2. **Delete semantics:** Use the operator’s removal/cancellation behavior and existing fallback group. No archive state or tombstones. Re-adding a deleted slug explicitly restores its preserved history.
   3. **Removal exception:** Use type plus execution state: remove only an unstarted plan/decomposition set with no execution artifacts. Do not add content hashing or “untouched template” detection; that refinement is overengineering.
   4. **Migration:** No forced migration or modal. Preserve legacy pseudo-Default behavior; document optional manual/AI-assisted migration.
   5. **Set typing:** Keep a small, optional `kind` attribute. It avoids number-based inference and supports decomposition preconditions and the deletion exception. Do not turn it into a larger workflow/state schema.

3. **Minimum shippable design:**
   - Add plan and decomposition session-set templates with full existing verification.
   - Make `kind` optional for legacy/general sets and machine-readable only where needed.
   - Remove the Plan tree child; expose open plan, add, rename, and delete on modules.
   - Scaffold a real `default` manifest entry plus plan and decomposition sets.
   - Block decomposition execution until `planPath` exists.
   - Implement rename as a validated, rollback-capable writer; disallow it while affected sets are running.
   - Delete the manifest entry, cancel nonterminal sets, remove only eligible unstarted planning scaffolds, and preserve completed sets.
   - Cut `moduleId`, tombstones, archive lifecycle, persistent slug-reuse metadata, forced migration, content-comparison logic, and any richer planning state machine.

4. **Sequencing:** Ship P1/P2/P3 atomically; P3 depends on P1’s set behavior and P2’s ability to rename or delete the scaffolded default module.