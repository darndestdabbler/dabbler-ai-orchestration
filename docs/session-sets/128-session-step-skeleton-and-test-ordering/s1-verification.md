ISSUES FOUND

- **Issue 1:** The full-suite intent recognizer misses the plural phrase “full suites,” letting a compressed verification/full-suite tail step pass.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/spec_admission.py:186-203, ai_router/spec_admission.py:280-338, docs/session-sets/128-session-step-skeleton-and-test-ordering/spec.md:149-156`
  - **Failure scenario:** A future unstarted spec writes step 3 as “Run the full suites, then cross-provider verification,” followed by a separate valid full-suite step and close-out. That is probable because this set’s own spec describes the bad shape as “full suites; verify; close,” but `_INTENT_RE[FULL_SUITE]` only matches singular `suite`, `full pytest/playwright/test`, `required portion`, or `runs of record`; the verification-tail step names only verification to the checker, so no compression finding is emitted.
  - **Acceptance criterion:** JUDGMENT - An unstarted spec whose verification-tail step says “Run the full suites, then cross-provider verification” must fail with a compression/restructuring finding, while a standalone full-suite tail step phrased “Full suites.” is accepted as the full-suite stage.
  - **Details:** Violation: the plan requires the checker to catch a step that “compresses verification and the full suite into one instruction, in any order,” “whatever words the author chooses.” Impact: this is the exact cost-staling failure the session exists to prevent, so a reasonable reviewer should not merge a recognizer that gives that shape a false all-clear. Evidence: the code’s full-suite patterns omit plural `suites`, and compression is only reported when `intents_named()` returns more than one tail intent.

NITS

- **Nit:** `test_a_conforming_spec_at_the_budget_passes` is not actually at the ratified budget: `CONFORMING` has 6 steps, not 7, so that named DOES-NOT-FIRE case is weaker than the plan promised.
- **Nit:** Some help/comments still describe the old behavior, e.g. `spec_admission --check` help mentions only over-cap failures and `session_checklist._completion_of` still says bookkeeping records “render as a row.”