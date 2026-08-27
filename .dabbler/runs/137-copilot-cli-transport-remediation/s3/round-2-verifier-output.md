ISSUES FOUND

Status overclaim from round 1 is resolved: `STATUS.md` now limits verified sessions to 1 and 2 and defers Session 3’s verdict to `session-state.json`. The persistence-proof finding still persists.

- **Issue 1:** Session 3 still does not record the required real newly-opened-shell inheritance proof.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/137-copilot-cli-transport-remediation/spec.md:242`, `docs/session-sets/137-copilot-cli-transport-remediation/s3-live-probe.md:23`, `ai_router/bootstrap.py:366`
  - **Failure scenario:** The close/release reviewer accepts the Session 3 live probe as satisfying the set acceptance criterion, but the exact regression remains unproven: a fresh terminal may still not observe `DABBLER_TRANSPORT=copilot-cli` even though HKCU contains the value. This is probable because the artifact explicitly substitutes an HKCU registry read for the required new-shell command, and `bootstrap.py` itself treats live environment propagation as separate/best-effort from the registry write.
  - **Acceptance criterion:** `JUDGMENT - s3-live-probe.md must record an actual post-bootstrap check from a newly opened shell showing DABBLER_TRANSPORT=copilot-cli, plus the landed scope; HKCU/HKLM registry reads alone are not sufficient.`
  - **Details:** **Violation:** spec says “confirm `DABBLER_TRANSPORT=copilot-cli` is readable from a **newly opened** shell” and the set acceptance criterion says “a newly opened shell inherits it.” **Impact:** this is the main acceptance condition for the unelevated persistence fix; without direct evidence, a reviewer would be asked to close the set on an unproven substitute. **Evidence:** `s3-live-probe.md` records only HKCU/HKLM values and asserts “Step 4 is the proof a new shell inherits it,” while `bootstrap.py` says broadcasting the environment change is what makes the value live before sign-out and swallows broadcast failures as best-effort.