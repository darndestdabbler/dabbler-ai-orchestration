# Verification Identity Consensus Response - GitHub Copilot

## 1. Identity

F1: **AGREE-WITH-CHANGES**.

Registry-resolved underlying-model identity is the right primary model. The gate should compare effective providers derived from concrete model IDs, not free-text provider labels supplied by the orchestrator. For multi-provider surfaces such as GitHub Copilot, `provider: openai` or `provider: anthropic` is ambiguous unless it is derived from the selected underlying model. Failing closed when the model is absent or unresolvable is correct.

The change I would make: treat the model field as an assertion with an explicit trust tier, not as confirmed truth. Store both:

- `declared_engine`: the interface used by the orchestrator, such as `github-copilot`, `claude-code`, `codex-cli`, or `gemini`.
- `declared_model`: the concrete model string reported at session start.
- `effective_provider`: derived only by registry lookup from `declared_model`.
- `identity_provenance`: for example `direct-api`, `copilot-cli-asserted`, `operator-attested`, or `unknown`.

The close gate should use `effective_provider` for the cross-provider inequality, but it should also surface `identity_provenance` in the evidence trail. A direct API call has stronger provenance than a Copilot CLI alias; the gate does not need to pretend they are equally strong.

The obvious failure mode is real: trusting `model` can move the lie one field over. But that is still an improvement because it removes the current arbitrary provider-label problem and makes the lie specific, auditable, and constrained by the registry. Given the Copilot CLI exposes no signed provenance, there is no perfect local anchor. The best practical anchor is a captured, operator-visible model-selection transcript or lockfile entry from the Copilot catalog plus the session-start declaration. If the CLI can print the selected model or role resolution, capture that raw output as identity evidence. If it cannot, this remains asserted identity and should be labeled as such.

Single biggest risk of F1 as proposed: it may overstate certainty by treating self-reported model names as ground truth. The fix is not to reject F1, but to name the trust level explicitly and require raw identity evidence where the transport can provide it.

## 2. Selection

F2: **AGREE**.

Verifier selection must dynamically exclude the orchestrator's effective provider. Static pins are brittle even in direct-API mode and are actively wrong under multi-provider seat transports. A verification system cannot depend on a comment saying "swap this if the orchestrator changes"; the system already knows which session is being verified and should use that information.

When no different-provider verifier is reachable, the outcome should be hard `verification_unavailable`, and the close should remain blocked until a sanctioned Mode-B manual path is completed. That manual path should require a concrete attestation that names the verifying surface, selected model, effective provider, prompt/template used, timestamp, and raw verdict artifact. It should not be a softer automatic close. The value of `verification_unavailable` is that it turns an infrastructure limitation into an explicit workflow state instead of creating a same-provider rubber stamp.

I would also make `route(task_type="session-verification")` refuse to select an excluded provider when session context is supplied. Ideally, session-verification routing without a resolvable active session identity should fail closed or produce a non-corroborating row. That prevents `verify_session` and bare `route()` from having divergent provider-safety semantics.

Single biggest risk of F2 as proposed: Copilot-locked teams can hit a hard stop when the seat-local catalog cannot provide a different provider. That is acceptable only if the Mode-B path is documented, ergonomic, and visibly distinct from automated verification.

## 3. Provenance Trust

Asserted provenance is acceptable only as a degraded evidence class, not as equivalent to direct provider provenance. For Copilot CLI, model-name-prefix inference can be used for deterministic gating because there is no better machine-readable signal, but the record must say `provenance: asserted` or equivalent. Do not let a Copilot transport row look identical to a direct API row.

Practical strengthening, in order of usefulness:

1. Capture the Copilot role-resolution evidence: catalog lockfile, selected model string, CLI version, and any raw CLI output that names the model.
2. Make the lockfile part of the evidence hash so later catalog drift cannot rewrite what model was supposedly available or selected.
3. Require the session-verification metrics row to include `transport`, `selected_model`, `resolved_provider`, `provenance`, `session_set`, `session_number`, and evidence-bundle hash.
4. For manual Mode B, require operator attestation rather than orchestrator-only attestation.

Behavioral fingerprinting is not worth building for this gate. It is probabilistic, gameable, expensive to maintain, and likely to produce false confidence. If provenance cannot be confirmed, say so and enforce compensating workflow controls.

I would not demote all Copilot-transport verification to manual automatically. That would unnecessarily kill the Full tier for teams whose Copilot catalog can provide a distinct provider and whose selected model evidence is captured. I would instead label Copilot automated verification as asserted-provenance automated verification and reserve mandatory Mode B for cases where provider diversity cannot be established.

## 4. Making The CLI The Only Practical Path

F3: **AGREE-WITH-CHANGES**.

It is reasonable to make only `verify_session` CLI rows corroborate close evidence. Bare `route(task_type="session-verification")` should remain useful internally, but it should not satisfy Step-6 close requirements unless it carries the CLI's evidence-bundle stamp and session-verification contract fields.

The stamp should not be presented as cryptographic security against a malicious orchestrator with repository write access. It is a provenance and affordance control. Its purpose is to prevent lazy shortcuts, accidental diluted prompts, missing artifacts, wrong session numbers, and same-provider selection from being accepted as normal evidence.

The right line is: defend strongly against drift and shortcut behavior; do not pretend to defend against a determined forger in the same trust domain. That means the gate should require internally consistent artifacts that are difficult to accidentally produce:

- metrics row marked `source: verify_session_cli`;
- evidence-bundle hash;
- prompt-template identifier and hash;
- selected verifier model and resolved provider;
- orchestrator effective provider used for exclusion;
- artifact path and artifact content hash;
- session set and session number;
- CLI version or package version.

Any missing or inconsistent field fails closed. This is not security theater if the threat model is shortcut/drift control. It becomes theater only if documentation implies the stamp proves an honest verifier ran against an honest bundle in the face of deliberate forgery.

Single biggest risk of F3 as proposed: future maintainers may mistake forgeability for a reason not to enforce provenance at all. The correct framing is "deterministic workflow integrity," not tamper-proof audit.

## 5. The Diluted-Prompt Problem

Prompt integrity is worth enforcing, but keep it mechanical. Since the canonical adversarial prompt is part of the verification contract, the metrics row should record a template ID and template hash. The close gate should require a recognized template hash for automated verification rows.

This is not over-engineering once F3 exists; it is the missing half of F3. If the gate only proves that `verify_session` wrote a row but does not bind that row to the canonical template, then future refactors or alternate callers can slowly reintroduce soft reviews. Template hashing also makes review evidence reproducible: a later reader can tell which verifier instructions produced the verdict.

I would avoid making the gate brittle to harmless whitespace or packaging details. Use a versioned template ID plus normalized content hash, or record the package version and template hash together. If an operator intentionally changes the template, that should be an explicit version bump or allowlist update, not an accidental pass.

## 6. Structural Critique

The simpler design is to stop making the orchestrator the author of its own closing evidence. The best target architecture is a verification runner owned by the framework, not by the active agent turn.

I would build a two-layer design:

1. Immediate layer: keep `verify_session`, but make it the only source of corroborating automated verification rows. It resolves session identity, excludes the orchestrator provider, builds and hashes the evidence bundle, applies the canonical template, writes raw artifacts, and records machine-checkable provenance fields. `close_session` accepts only those rows or explicit Mode-B attestation records.
2. Next layer: add an external verifier entry point that can run from CI, a VS Code command, or a second standing agent. The active orchestrator can request verification, but the runner owns model selection, prompt construction, artifact writing, and close evidence. In CI-capable repos, close should prefer CI-produced verification evidence. In local-only repos, the CLI is the fallback enforcement surface.

This eliminates most of the class of failure because the policed actor no longer hand-composes the evidence path. It does not require banning Copilot verification; it just makes Copilot's weaker provenance explicit and routes unavailable cases into Mode B.

I would not start with a git hook. Hooks are easy to bypass, hard to distribute reliably, and still run in the user's local trust domain. A CI or framework-owned command gives better observability and a cleaner audit trail.

## Overall Recommendation

Build F2 and F3 first, together: dynamic provider exclusion inside the session-verification selection path, and close-gate acceptance only for `verify_session`-stamped evidence rows.

Implement F1 at the same boundary: require model identity for multi-provider engines, resolve effective provider from the registry, and fail closed when unresolved.

Record provenance strength explicitly, especially `copilot-cli-asserted` versus `direct-api`.

Add evidence-bundle, artifact, and template hashes to the corroborating row.

When no different-provider verifier is reachable, block close with `verification_unavailable` and require Mode-B operator attestation.

Defer behavioral fingerprinting; it adds uncertainty, not integrity.

Longer term, move verification execution out of the orchestrator's hands through a CI/framework-owned verifier runner.