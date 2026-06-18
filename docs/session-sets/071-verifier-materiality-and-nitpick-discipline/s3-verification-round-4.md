ISSUES FOUND

The documentation for Set 071 is precise and internally consistent on most points, but contains a significant, widespread factual error regarding the behavior of a key "anti-laundering" guardrail. The synthesis documents claim the blocking classifier will override a `VERIFIED` token if it finds a high-severity issue, but the project's own records show this behavior was explicitly discussed, rejected by the operator, and pinned in a test as **not** happening for the push surface. This misrepresentation of a core reliability feature is a Major defect.

- **Issue 1:** The documentation repeatedly and incorrectly describes the behavior of the severity-anchored blocking classifier, claiming it blocks on any high-severity finding "regardless of the verdict token."
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Multiple documents claim that the system provides an "anti-laundering" guarantee where a high-severity finding will cause a verification to be blocking, even if the verdict token is `VERIFIED`. For example, `docs/verification-surface-strategy.md` § 7.1.2 states: "≥1 Critical/Major ... finding **blocks regardless of the token** (a Major under a mislabeled `VERIFIED` is never laundered through)". This claim is verifiably false for the push verification surface.
    - **Impact:** A future developer or operator will have a critically incorrect understanding of the system's safety guarantees. They will believe the push surface is protected against a model erroneously returning a `VERIFIED` token alongside a Major finding, when the actual implementation trusts the token and would silently accept the defect. This misunderstanding would alter merge decisions and could lead to bugs being introduced based on a false premise about system invariants.
    - **Evidence:** The provided documentation contains a direct contradiction.
      1. The implementation decision is recorded in `docs/session-sets/071-.../change-log.md` under Session 2's verification log: "**Operator adjudicated: trust the VERIFIED token**" for the push surface.
      2. A test case is recorded in `ai_router/CHANGELOG.md` for `[0.25.0]` that pins this exact behavior: "**push-parser-trusts-VERIFIED-token**".
      3. These two facts prove that the "blocks regardless of token" claim is false for the push surface. The incorrect claim is present in the following six locations:
          - **Location 1:** `docs/verification-surface-strategy.md` § 7.1.2
          - **Location 2:** `docs/verification-surface-strategy.md` § 7.2 (The entire premise of this "anti-laundering" section is based on the incorrect behavior.)
          - **Location 3:** `ai_router/CHANGELOG.md` in the `[0.25.0]` entry's "Added" section, under the "severity-anchored blocking classifier" bullet point.
          - **Location 4:** `docs/session-sets/071-.../change-log.md` in the introductory "What this set delivered" paragraph.
          - **Location 5:** `docs/session-sets/071-.../change-log.md` in the S2 "Shipped" section, under the "severity-anchored blocking classifier" bullet point.
          - **Location 6:** `docs/planning/lessons-learned.md` in lesson L-071-1, where point 4's description of the anti-laundering guardrail implies a scan occurs even with a `VERIFIED` token.
    - **Fix:** Update all six locations to accurately describe the adjudicated behavior. The prose must distinguish between the push and pull surfaces. For the push surface, the classifier trusts a `VERIFIED` token and considers the result non-blocking. The "scan for severity regardless of token" logic applies only to `ISSUES_FOUND` verdicts from the push surface and all verdicts from the pull surface (which provides structured severity data). The documentation must be corrected to reflect the logic that the `push-parser-trusts-VERIFIED-token` test enforces.