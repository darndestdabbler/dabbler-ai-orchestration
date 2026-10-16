# Consult round 16 — synthesis

Sol (`gpt-5.6-sol`, medium, 71 s) and Gemini (`gemini-3.1-pro-preview`, 40 s)
answered the same brief. Claims were checked against the POC's measurements
before being repeated.

## Where they agree

- **Replace the pull with mailbox messaging**, driven by a long-lived framework
  process that owns sequencing, the mailboxes and the ETA watchdog; the AI owns
  the work, the replies and re-arming the background waiter.
- **No second long-polling AI agent** as a backup.
- **No keep-alives and no fitted cache model now.** If ever built, the fixed
  Copilot rule (τ = 4 min, expected waits of 4–15 min). Sol also corrected the
  draft model to three calls per keep-alive, which the measurement showed.
- **The protocol lives in the instruction files**, not an MCP server.

## Where they split, and which side I took

| question | Sol | Gemini | taken |
| --- | --- | --- | --- |
| backstop for a lost wake-up | watchdog marks the message overdue and alerts the operator outside the chat; never type a nudge | watchdog types a nudge into the terminal (its own mitigation falls back to alerting the operator) | **Sol.** A typed nudge is logged by both engines as a human message, which destroys the proof that an override came from the operator. Gemini's mitigation converges on the same alert. |
| message durability | a message stays pending until the AI acknowledges its ID; delivery is idempotent | not addressed | **Sol.** The POC waiter consumes a message when it prints it; an AI that dies right after loses it. |
| override provenance | the AI proposes an override with an ID; the operator approves it in chat; the framework verifies the approving human-origin event in the engine's own log | the AI's reply carries a verbatim quote of the operator's message, auditable later | **Sol.** Verified at the moment it is applied, not auditable afterwards. Both engines log human messages as human (measured). |
| keeping the AI on protocol late in a session | registration handshake: the waiter must be armed before the framework drives | a one-line protocol reminder inside every message | **Both.** They are cheap and independent. |
| cost telemetry | keep it | none | **Session 176** records each round's conversation and cost anyway; nothing extra. |
| what to prove next | a long two-engine soak with idle periods, interruptions and killed waiters, measuring unacknowledged messages | typing a nudge into Copilot through the VS Code terminal API | **Sol.** With no typed nudges the injection test is moot; the unresolved risk is a rare lost handoff. |

## Recommendation

Adopt messaging, built as:

1. A long-lived framework process per session, started and supervised by the
   extension, with every state change persisted before it acts, so it resumes
   after a restart and the extension shows when it has stopped.
2. Messages with IDs that stay pending until the AI acknowledges them; the
   waiter reports a message without consuming it; replies are idempotent.
3. A watchdog that marks a message overdue past the AI's ETA plus 25% and
   alerts the operator outside the chat. No typed nudges, no backup agent, no
   keep-alives.
4. Overrides proposed by the AI with an ID, approved by the operator in chat,
   and verified by the framework against the engine's own human-origin log
   entry before they apply; every override and skip recorded.
5. The protocol in the instruction files, a registration handshake proving the
   waiter is armed before driving, and a one-line reminder in every message.

Before planning the build: a two-engine soak (Sol's question 6), run as the POC
runs were.
