**M1. Transport is modeled at the wrong layer.**  
- **Flaw:** Hanging `copilot-cli` off `providers.py::call_model` as a per-model transport conflates three different concerns: transport selection, provider provenance, and seat-scoped runtime capabilities. A Copilot seat is not just "another way to call Anthropic/OpenAI/Google"; it is a gateway with its own auth, catalog, quota, and failure semantics.  
- **Why it matters:** The router’s core decisions key off `provider`, but under this design that `provider` becomes config metadata while dispatch is actually to a different system. That makes verification independence, metrics, retries, and health checks depend on asserted config rather than runtime truth. It also spreads seat-wide concerns across model entries.  
- **Concrete change:** Replace per-model `transport` with a first-class transport/catalog layer selected by profile (or provider-group) at startup. `route()` should resolve logical model aliases through a discovered Copilot catalog, then dispatch via a `Transport` interface. Do **not** present this as byte-equivalent "Full tier over another transport" unless provenance and accounting are made equivalent; otherwise label it a separate Full-compatible profile/capability mode.

**M2. The `APIResult` contract is too weak for a CLI transport.**  
- **Flaw:** The design forces a subprocess CLI into `APIResult(content, input_tokens, output_tokens, stop_reason)` even though the CLI may not provide authoritative usage, finish reason, or clean separation of content vs warnings/metadata.  
- **Why it matters:** Existing truncation detection, retry policy, escalation, blocking predicates, and cost logic implicitly treat those fields as meaningful. `chars/4` estimates and absent `stop_reason` are not harmless gaps; they change behavior while pretending compatibility.  
- **Concrete change:** Expand the result contract before implementation: `usage_authoritative`, `finish_reason_optional`, `content_complete`, `raw_stdout`, `raw_stderr`, `transport_metadata`, and `partial_output_discarded`. Make downstream guards branch on those flags. If S1 cannot prove stable structured metadata/content boundaries, the CLI transport should not plug into the current `call_model` contract; use GitHub Models API instead.

**M3. The spec overclaims cross-provider verification under one seat.**  
- **Flaw:** The design treats Copilot picker entries as durable evidence of underlying provider identity, then reuses the existing "verifier must be from a different provider" rule. That provider identity may be opaque, marketing-labeled, or change under the same picker string and seat.  
- **Why it matters:** The central Full-tier guarantee can silently become false after catalog drift, org policy changes, or CLI updates. The proposed test only catches a bad static config; it does not prove runtime independence.  
- **Concrete change:** Downgrade the promise unless S1 proves machine-readable provider provenance. Add a startup catalog snapshot/lockfile containing CLI version, model IDs, reported provider/source, and capture date; validate it on every run. If provenance is missing, changed, or same-provider, fail closed to "verification unavailable." If durable provenance cannot be asserted, stop this plan and pivot to GitHub Models API for true cross-provider verification.

**M4. The S1 gate is not strict enough for a subprocess transport.**  
- **Flaw:** The fail-loud checkpoint only requires headless mode and model selection. That is insufficient if output is not machine-readable and stable.  
- **Why it matters:** Free-form stdout/stderr, markdown wrappers, warnings, or CLI UX changes will make parsing nondeterministic, break verification prompts, and produce false metrics/truncation results. A CLI without a strict noninteractive structured output mode is not a safe transport for a mission-critical router.  
- **Concrete change:** Amend S1 so the set stops unless the installed CLI build provides all of: stable structured output (JSON or equivalent), deterministic separation of content vs metadata, noninteractive/auth-suppression flags, and documented exit behavior. "Headless + `--model`" alone is not enough to proceed.

**M5. The failure model is wrong for an agentic CLI.**  
- **Flaw:** The design assumes the existing HTTP-style retry/backoff loop can be reused with some new error classes. That ignores CLI-specific failures: reauth prompts, auth expiry mid-session, premium-quota exhaustion, local hangs, partial stdout before non-zero exit, and duplicated billing on retry.  
- **Why it matters:** Blind retries can consume quota, return ambiguous partial answers, or hang waiting for interactive auth in a noninteractive path. A one-time startup probe does not protect long-running sessions.  
- **Concrete change:** Add a transport-specific invocation state machine to the spec: enforce noninteractive mode on every call; probe/re-probe on auth-class failures; classify quota exhaustion and catalog drift as fail-fast operator actions; never auto-retry after any content is emitted; discard partial output unless resumability is explicitly proven in S1; and add explicit timeouts for spawn, first-byte, and total runtime.

**M6. The accounting design still fabricates a story it cannot prove.**  
- **Flaw:** Replacing dollars with `premium_requests` and request counts is still not "truthful seat accounting." Local invocations are not authoritative billed units, may have model-dependent weights, and retries/verification can amplify hidden backend usage.  
- **Why it matters:** Budget warnings, escalation heuristics, and reports become misleading while looking precise. That is worse than declaring the transport unmetered/unknown.  
- **Concrete change:** Remove this transport from all cost-based guards and escalation logic unless an authoritative quota/billing source exists. Record only `local_invocations`, `attempts`, and `billed_usage_unavailable=true`. If enterprise-visible quota telemetry exists, make it a prerequisite or pivot to GitHub Models API where accounting can be tied to a supported surface.

**M7. Raw `cli_model` strings in shared config are too brittle for deployment.**  
- **Flaw:** The spec bakes picker names into `router-config.yaml`, but model availability is seat-, org-, and version-specific. The operator’s catalog is not a safe stand-in for the target team’s catalog.  
- **Why it matters:** The shipped config can fail on the consuming team’s machines or silently map to different backends/capabilities, invalidating verification and making support impossible.  
- **Concrete change:** Replace checked-in `cli_model` literals with a seat-local generated catalog mapping (`copilot-catalog.lock` or similar) produced by discovery on the target environment. Profiles should reference logical aliases/roles, not picker text. Release/UAT must require regeneration and validation on an actual target-team seat, not only the operator’s machine.

**Verdict:** **UNSOUND**

**Nits**
- "Byte-identical" is too strong; loader/schema/metrics changes can alter observable behavior even when the transport is unused.  
- One happy-path routed call plus one verification is too thin for UAT; at minimum add an induced auth/probe failure and a malformed-output parse failure walkthrough.  
- If this remains CLI-first, document concurrency limits explicitly; subprocess transports often need serialized execution.