# PASS A - Primary read

- **Provider:** unknown
- **Model:** gemini-pro
- **Cost:** 0.023
- **Tokens (in/out):** 8336/1258

---

ENDORSE WITH REVISIONS

### 1. Soundness of v4 schema dispositions (Group A)

The Group A dispositions are sound. The proposed v4 schema correctly prioritizes normalization and derivation, which simplifies the state writer logic and improves data integrity at a negligible performance cost for the current scale.

*   **A1 (Shape of v4):** Sound. The derivation-led approach is correct. The three refinements are necessary and complete.
*   **A2 (Cancellation marker):** Sound. Retaining the explicit set-level `status: "cancelled"` token is the only robust approach and correctly maintains backward compatibility with the existing cancellation reader.
*   **A3 (Blocked-on-prereqs):** Sound. Modeling this as a derived UI property correctly separates spec-level dependency information from runtime state. This avoids polluting the state machine and minimizes the implementation's blast radius.
*   **A4 (Migration sequencing):** Sound. The reader-first, phased migration is the industry-standard, low-risk approach for this type of schema evolution. It correctly de-risks the cutover.
*   **A5 (Migrator-scope):** Sound. Scoping the migrator to canonical shapes is a direct and correct consequence of the operator-locked premises in Section 2.

### 2. Soundness of Lightweight-parity dispositions (Group B)

The Group B dispositions are sound and represent a coherent strategy for implementing the operator directive.

*   **B1 (Package split):** Sound. Path 1 (package split) is the correct long-term architectural decision. It establishes a clean dependency boundary that will prevent future maintenance burdens and properly supports consumers in constrained environments. The one-time release cost is justified by the perpetual architectural benefits.
*   **B2 (Copyable-prompt surface):** Sound. The right-click context menu is an appropriate and discoverable initial surface.
    *   **Revision:** The implementation set (Set 048) should also consider adding Command Palette actions for the same functionality to improve accessibility for keyboard-centric power users. This can be a follow-on, but the initial placement is acceptable.
*   **B3 (Suggested-state enum):** Sound. The use of a `"suggested"` string literal is an acceptable and common pattern in JSON-based configuration.
    *   **Revision:** The implementation set's doc-revision session must explicitly document the rationale for this tri-state field in `docs/session-state-schema.md` to prevent future confusion.
*   **B4 (Doc-revision pass):** Sound. Scoping this as a single, late-arc session is standard practice.

### 3. The critical scope decision (Section 6)

The proposal's recommendation is sound.

*   **Shape 2 (`Set 047: v4 schema` -> `Set 048: Lightweight parity`) is the correct disposition.** It correctly identifies and mitigates the primary project risk: the interference between the v4 schema writer refactoring and the Lightweight parity package-split refactoring. By sequencing v4 first, the foundational state management layer is stabilized before the package architecture is altered. This minimizes rework and simplifies verification for both efforts.
*   **Shape 1 (Bundled) is unacceptably risky.** The compound complexity would increase the likelihood of error and mid-set scope drift.
*   **Shape 3 (Lightweight first) is correctly identified as indefensible.** It would build on a deprecated schema, guaranteeing rework.

### 4. Session breakdown (Section 7)

The proposed 6-session arc for Set 047 is balanced and logically sequenced. Each session represents a discrete, verifiable unit of work that directly maps to the phased migration strategy from A4. The scope per session is appropriate.

### 5. Missing Audit Topics

The proposal is comprehensive but misses four topics that must be added to the scope to ensure a robust implementation.

*   **Issue:** Underspecified rollback procedure.
    *   **Location:** Sections A4, Q3.
    *   **Fix:** Add a task to Session 3's scope: "Define and document a formal rollback procedure." This procedure must specify the failure conditions that trigger a rollback, the step-by-step process for restoring from `.bak` files, and the validation steps to confirm a successful restoration. Relying on "git" is insufficient for a multi-file state migration.

*   **Issue:** Assumed performance impact of state derivation.
    *   **Location:** Section A1.
    *   **Fix:** Add a task to Session 2's scope: "Implement a benchmark test for the `readSessionSets()` function." This test should run against the full set of 47+ historical state files to validate the assumption that derivation cost is negligible and to establish a performance baseline to protect against future regressions.

*   **Issue:** Ambiguous CLI backward compatibility contract.
    *   **Location:** Sections B1, Q2.
    *   **Fix:** Convert open question Q2 into a firm requirement. The Set 048 spec must mandate that the `dabbler-ai-router` package provides a fully backward-compatible CLI surface. All existing commands must function identically after the package split, likely via re-exports. User scripts must not break.

*   **Issue:** Underspecified `prerequisites` field schema.
    *   **Location:** Section A3, Session 5.
    *   **Fix:** Add a task to Session 5's scope: "Define and document the canonical schema for the `spec.md` prerequisites field." This includes specifying the exact structure (e.g., `prerequisites: [{slug: string, condition: 'complete'}]`) and enumerating all valid values for `condition`. This new schema element must be formally defined as part of the Set 047 deliverable.