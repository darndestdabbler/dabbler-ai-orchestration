# Consult round 16 — sol (`gpt-5.6-sol`)

Answered 2026-09-15T10:36:42.589Z in 71s; 2895 in / 3862 out tokens.

---

## 1. What replaces the pull

- **Recommendation:** Replace `session next`/`wait`/`report` with durable mailbox messaging driven by a long-lived framework process.
- **Design:** The framework owns the drive loop, sequencing, durable message IDs and states, both mailbox directories, retries, ETA tracking, watchdogs and session recovery; it posts work only when the preceding state permits it. The AI owns interpretation and non-deterministic work, sends acknowledgements, ETAs and replies, and re-arms the background waiter before ending each turn. **ASSUMPTION:** A long-lived `dabbler` session process should be started and supervised by the extension, with enough persisted state to resume after that process or VS Code restarts; it must not depend on an AI turn or AI-owned shell remaining active.
- **The one risk:** The framework process dies while the mailbox makes the session appear to be waiting normally.
- **Mitigation:** Persist every state transition before acting, expose the process state to the operator, and have the extension detect termination and restart or explicitly mark the session stopped rather than silently continuing.

## 2. The backup for a lost wake-up

- **Recommendation:** Use durable acknowledgement plus an operator-visible framework watchdog, not terminal typing or a second AI agent.
- **Design:** A message remains pending until the AI explicitly acknowledges or replies to its unique ID; printing it from the waiter does not consume it. If acknowledgement or completion exceeds its deadline, the framework marks it overdue and alerts the operator outside the AI chat, while duplicate replies and repeated delivery remain idempotent. Do not let the framework type a nudge, because that would make framework text indistinguishable from operator text in the engine’s human-origin log; a second model-backed agent adds cost and another coordination path without removing the original handoff.
- **The one risk:** An unattended session can still remain stopped if the engine loses the waiter-completion event and no operator sees the alert.
- **Mitigation:** Make overdue state conspicuous and persistent, preserve the unacknowledged message for redelivery, and document operator re-entry as the recovery path; **ASSUMPTION:** add an automated wake mechanism only if soak measurements show that this recovery is needed and it can preserve message provenance.

## 3. Copilot’s cache miss

- **Recommendation:** Do not build or run the fitted cost model now; retain telemetry and defer the already-directed fixed Copilot rule until real-session misses justify it.
- **Design:** The proposed model is wrong at `K ≈ 2·S·r`: the measured keep-alive took three model calls, making the observed approximation `K ≈ 3·S·r` and the measured break-even about 15 minutes, not 22. It also treats `h(t)` as a predictable decay even though the measurements show non-monotonic, block-granular hits and misses, and it omits call overhead, conversation growth during handling and uncertainty in job completion time. Record idle duration, cache reads and writes, tokens and credits, but if intervention later becomes worthwhile use the current fixed policy: Copilot only, four-minute timeout, expected waits of 4–15 minutes; no Claude keep-alive below its documented one-hour cache window.
- **The one risk:** A fitted policy overlearns sparse, non-monotonic cache observations and spends more on keep-alives than it saves, as the measured 16-minute run did.
- **Mitigation:** Gate implementation on real-session aggregate savings, compare actual cost against a no-keep-alive baseline, and use the fixed rule rather than continuously refitting `h(t)`.

## 4. Operator overrides

- **Recommendation:** Accept an override only when the framework can bind its exact scope to a human-origin event in the engine’s own session log.
- **Design:** The AI first formulates a concrete override proposal with a unique ID, affected rule or process, scope, reason and consequences; the operator then types an explicit approval containing that ID in chat. The AI submits the approval, but the framework independently reads the corresponding engine log event and verifies its human origin and exact authorization before applying it. Record the proposal, operator text, source event identity, previous state, resulting state, time and every skipped check or process in the session audit record.
- **The one risk:** A vague operator message is incorrectly correlated with a broader override proposed by the AI.
- **Mitigation:** Require an exact proposal ID and explicit action such as approve, skip or cancel; reject ambiguous, unmatched or AI-origin log events and ask the operator for a new explicit approval.

## 5. Where the protocol lives

- **Recommendation:** Put a short engine-specific bootstrap in each instruction file and keep the executable protocol in the framework and waiter, without adding an MCP server now.
- **Design:** The instruction tells the AI to arm the tested background waiter, handle the defined message kinds, reply with the matching message ID, re-arm before ending its turn and never poll. The framework validates message schemas, ordering and session state, so correctness does not depend solely on the AI remembering prose. An MCP server would create a second integration and configuration surface without replacing the engine background-task mechanism demonstrated by the POC.
- **The one risk:** An engine fails to load, retain or follow its instruction file and therefore never arms the waiter.
- **Mitigation:** Require a registration handshake proving that the waiter is armed before the framework starts driving, and let the watchdog expose a missing acknowledgement immediately; **ASSUMPTION:** reconsider MCP only if comparative measurements show that it reduces these failures in both CLIs.

## 6. The one thing to prove next

- **Recommendation:** Measure the end-to-end unacknowledged-message rate in a long, realistic two-engine soak that includes idle periods, operator interruptions and deliberately killed waiters.
- **Design:** Use the stand-in framework to post uniquely identified messages through the same durable handoff intended for production, and measure posting-to-wake latency, posting-to-acknowledgement latency and any message that remains unacknowledged beyond its deadline. Include the longest expected idle intervals and operator messages both while waiting and mid-turn. **ASSUMPTION:** This is more decision-relevant than another short happy-path run because the principal unresolved risk is a rare handoff failure that leaves the session stopped.
- **The one risk:** A clean soak gives false confidence because it does not reproduce the engine state that caused the earlier lost completion notice.
- **Mitigation:** Preserve both engines’ native logs and the mailbox transition history for every attempt, and deliberately exercise waiter termination and completion-at-idle boundaries so failures can be correlated rather than inferred from terminal output.
