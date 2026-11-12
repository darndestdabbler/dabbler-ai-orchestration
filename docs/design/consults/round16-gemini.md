# Consult round 16 — gemini (`gemini-3.1-pro-preview`)

Answered 2026-09-15T10:37:25.195Z in 40s; 3097 in / 1099 out tokens.

---

1. **What replaces the pull**
- **Recommendation:** Adopt the mailbox design to replace the pull loop entirely, running the framework as a persistent background process.
- **Design:** The framework (`dabbler`) runs as a long-lived local Node process spanning the entire session, owning the sequencing, the inbox files, and the ETA watchdog. The AI executes the steps, writes the reply files, and launches `node wait-inbox.mjs` in the background to end its turn. Neither side polls.
- **The one risk:** The AI forgets to re-arm the waiter or misconfigures the background process launch, deadlocking the session while the framework waits for a reply that will never come.
- **Mitigation:** The framework's ETA watchdog detects when a task exceeds its time limit with no reply and alerts the operator, allowing the human to manually nudge the AI to re-arm the waiter.

2. **The backup for a lost wake-up**
- **Recommendation:** Use a framework-side watchdog that types a nudge into the terminal, avoiding the cost and complexity of a second long-polling agent.
- **Design:** If a message sits unread in the AI's inbox past the requested ETA plus 25%, the framework sends simulated keystrokes (e.g., "Check inbox") directly into the VS Code terminal running the CLI. The framework already tracks ETAs, so this requires no additional background agents or AI credits.
- **The one risk:** Injecting keystrokes while the operator is actively typing in the terminal will cause keystroke collision, corrupting both inputs (ASSUMPTION: standard terminal injection does not lock keyboard focus away from the user).
- **Mitigation:** Instead of injecting keystrokes automatically, the framework triggers a native VS Code UI notification or a terminal bell instructing the operator to type the nudge themselves.

3. **Copilot's cache miss**
- **Recommendation:** Delete the mathematical cost model entirely and follow the operator's current direction to wait for real session data.
- **Design:** The framework implements no cache-miss telemetry, no decay model fitting, and no keep-alive loops, as the brief's numbers prove keep-alives can cost more than the misses they prevent. If real sessions eventually prove a need, implement only the static rule (`τ = 4 min`) passed to the waiter for expected 4–15 minute waits.
- **The one risk:** A long session hits a massive cache miss (ASSUMPTION: real sessions reach 100k+ tokens), causing an unexpected spike in AI credit usage that frustrates the operator.
- **Mitigation:** The framework logs the AI credit usage parsed from the engine's output after every long wait, allowing the operator to immediately see costly misses and manually cancel or restart the session if costs spike.

4. **Operator overrides**
- **Recommendation:** Record overrides as natural human chat messages processed by the AI into a framework reply file.
- **Design:** The operator types the override (e.g., "Skip the tests") directly into the AI CLI chat, which both engines immutably log as a human message (`origin.kind: "human"` or `user.message`). The AI executes this by writing a `reply` JSON to the framework inbox detailing the skip, and the framework records this state change in its session log.
- **The one risk:** The AI hallucinates an override command and writes a skip reply to the framework without the operator actually typing one.
- **Mitigation:** The framework requires every override action file from the AI to include a verbatim quote of the operator's chat command, making it trivial for the operator to audit the framework's log against the engine's chat log.

5. **Where the protocol lives**
- **Recommendation:** Place the protocol strictly in a workspace instruction file, preferring the simplicity of plain text over an MCP server.
- **Design:** Write the exact terminal commands for launching `node wait-inbox.mjs` and the strict rule to "never poll, always re-arm in the background" inside an instruction markdown file auto-loaded by both CLIs. This requires zero framework-side server configuration.
- **The one risk:** Copilot's context window limits or retrieval logic cause it to "forget" the background re-arming protocol late in a long session.
- **Mitigation:** The framework appends a one-line reminder of the background re-arming protocol inside the JSON payload of every task message it writes to the inbox.

6. **The one thing to prove next**
- **Recommendation:** Prove that the framework can reliably inject a terminal nudge into Copilot CLI without breaking its UI.
- **Design:** Measure whether a script or VS Code API call can reliably inject a typed wake-up command into the Copilot CLI chat interface, given the measured pitfall that it uses the alternate screen and silently drops `-i` prompt injections.
- **The one risk:** The alternate screen actively swallows or scrambles standard keystroke injections sent via the VS Code Terminal API.
- **Mitigation:** If injection fails the test, abandon automated nudging for Copilot entirely and rely strictly on notifying the operator to press enter.
