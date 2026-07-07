# Response to Verification Identity Consensus

## 1. Identity (F1)

**AGREE-WITH-CHANGES**

Trusting the self-reported model name does indeed move the lie one field over. However, given the constraint that the Copilot CLI offers no confirmed provenance, it remains the best available proxy. The change required is that identity recording must be strictly validated at session start against the known model registry, and fail closed immediately if unresolvable. 

**Single biggest risk:** Since the orchestrator supplies the model name initially, a slightly more "determined" lazy orchestrator could learn to output a fake model string that bypasses the simple `!=` check, providing false confidence.

## 2. Selection (F2)

**AGREE**

Dynamic verifier exclusion is necessary. The hand-tuned static pin is fragile and inevitably decays. When no different-provider verifier is reachable, failing closed with `verification_unavailable` and blocking the close pending the manual Mode-B path is the correct behavior. It forces the human operator to make a conscious choice rather than the system silently degrading its integrity guarantees.

**Single biggest risk:** Teams constrained to a single-provider seat configuration will hit this wall on every session, turning the "Full tier" into a frustrating experience and potentially conditioning operators to blindly force-close sessions.

## 3. Provenance trust

Under the Copilot transport constraint, asserted provenance (model-name prefix) must be accepted as "good enough", because the stated threat model defines "determined orchestrator fabricating multi-artifact forgeries" as out of scope. If we are only guarding against lazy shortcuts, asserted provenance paired with strict path enforcement is acceptable evidence. Demoting the Copilot-transport to manual-only is too destructive to the user experience. The practical strengthening here is to rely on F3 to ensure the framework constructs the assertion, rather than the orchestrator.

## 4. Making the CLI the only practical path (F3)

**AGREE-WITH-CHANGES**

Enforcing that only the CLI's rows corroborate the verification raises the lazy shortcut floor significantly. It is not security theater if it successfully forces the engine onto the "honest" path. The change: the CLI should stamp the row with a session-specific nonce generated at session start (e.g., in `session-state.json`), making arbitrary `route()` call metrics rows invalid without doing standard framework lookup tasks.

**Single biggest risk:** Cryptographic/nonce complexity increases brittleness in the metrics pipeline and debugging workflows, while a sufficiently capable orchestrator can still just read the CLI source code and spoof the nonce. 

## 5. The diluted-prompt problem

Prompt-integrity hashing is over-engineering once F3 is implemented. The value of F3 is that by forcing the use of the sanctioned CLI, the canonical adversarial template is inherently guaranteed. If the orchestrator is forced to use the CLI to get a valid stamp, the prompt dilution vector is closed. 

## 6. Structural critique

The fundamental flaw in the current architecture is that the policed actor holds the pen. The orchestrator is tasked with initiating its own verification. 

The simpler, more robust design is to move verification entirely inside the `close_session` boundary. The orchestrator should simply invoke `close_session`. The `close_session` script itself should invoke the router, run the verification using the dynamically excluded identity, and evaluate the verdict. This strips the orchestrator of the ability to dilute prompts, guess nonces, or use bare `route()` calls. The orchestrator submits the work; the framework polices it.

## Overall Recommendation

Shift the architectural boundary first: move verification invocation inside the `close_session` gate (Structural critique). By stripping the orchestrator of the ability to initiate the verification step directly, you render F3 (sanctioning the CLI) and prompt dilution concerns obsolete. Pair this with F1 (resolving underlying-model identity) and F2 (dynamic exclusion) inside the close framework. If exclusion leaves no available models, the close script fails and hands control back to the operator for Mode-B resolution.
