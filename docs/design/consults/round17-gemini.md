# Consult round 17 — gemini-3.1-pro-preview (33 s)

**1. The shape**
*   **Recommendation**: "Record every uncaught error + the waiter restarts a crashed loop" is the simplest thing that covers the case and retires the holes; layers 2 and 3 are over-engineering.
*   **Design**: Add a global `uncaughtException` / `unhandledRejection` handler to the loop that writes `Stop(kind: 'crash', code: <message>)` to `run.json` before exiting 1. Pipe all loop `stdout`/`stderr` to `driver/loop.log`. If the loop dies *without* writing a `Stop` (e.g., SIGKILL, OOM), the waiter detects the stale heartbeat and auto-starts the loop up to 2 times for the current instruction phase.
*   **The one risk**: The loop fails instantly on restart (e.g., a syntax error in the framework itself), causing a tight crash loop.
*   **Mitigation**: The waiter's bound of 2 restarts is tracked in `supervision.jsonl`. On the 3rd attempt, the waiter writes `Stop(kind: 'blocked', code: 'crash-loop')` and exits, escalating to the operator.
*   **Delete**: Delete Layer 2 (Owner table) and Layer 3 (Mechanic) entirely. Fix the logging and auto-restart first; only build more if evidence proves this fails.

**2. The supervisor**
*   **Recommendation**: The AI's waiter does the restarting because it is already a running watchdog process that successfully detects the exact failure condition today.
*   **Design**: The waiter polls the heartbeat. If stale, it reads `run.json`. If `phase` is not `closed` and no `Stop` exists, it checks `supervision.jsonl` for recent crash counts. If under 2, it spawns `dabbler session run --mailbox` detached (exactly as the Resume button does) and writes `loop-restarted` to the ledger. Loop output MUST go to `driver/loop.log` via the framework's logger or shell redirection, as the GUI-subsystem terminal swallows `stdout`.
*   **The one risk**: A race condition if the human clicks Resume at the exact moment the waiter decides to auto-restart.
*   **Mitigation**: Resume and the waiter both check if a loop process is currently alive (via heartbeat or PID). If so, they yield. Idempotent loop startup (already a fact) handles the rest.
*   **Delete**: Delete the ideas of the extension watchdog or the loop re-launching itself. The loop cannot re-launch itself if it is killed by OOM or a hard crash.

**3. The owner table**
*   **Recommendation**: The existing `kind`/`code` list and a TypeScript exhaustive `switch` block in `drive.ts` is already the table; do not build a separate abstraction.
*   **Design**: The unhandled error handler emits a `crash`. The existing `drive.ts` routing uses a `switch` statement on the `Stop` kind. Add `crash` to the kinds. The framework handles `provider-unreachable` (retries), the waiter handles `crash` (restarts), the human handles `budget` / `interrupted`, and the AI handles the rest via its standard deterministic work instructions.
*   **The one risk**: As new stops are added, developers forget to route them properly.
*   **Mitigation**: Use a TypeScript `assertNever(kind)` in the default branch of the `switch` so unhandled stop kinds fail at compile time.
*   **Delete**: Delete the "Owner table" and its dedicated test. A TypeScript discriminated union and an exhaustive switch is simpler and more reliable every time.

**4. The mechanic**
*   **Recommendation**: Defer the mechanic entirely until Layer 1 has run in real sessions and proven that human intervention is still the bottleneck.
*   **Design**: Do not design it. (If you must eventually: it would be a separate lease utilizing the verifier's exact agency channel plus `exec`, restricted strictly to the codebase and forbidden from touching `.dabbler/runs/`).
*   **The one risk**: An AI troubleshooting an AI framework's deterministic crash often hallucinates fixes, burns tokens, and mutates the user's tree unnecessarily because it assumes the code it wrote caused the framework's internal error.
*   **Mitigation**: Let the human operator be the mechanic. Human time outranks AI time, but building the mechanic costs human time up front for an unproven benefit.
*   **Delete**: Delete the Mechanic proposal. It violates the operator's warning: "AI models often *try* to prove their value by adding sophistication, which just complicates the design."

**5. The AI side**
*   **Recommendation**: The Resume button remains the right answer for an AI CLI crash.
*   **Design**: If the AI's CLI dies, the loop will eventually hit an `instruction-overdue` (ASSUMPTION based on existing budget/timers) or just sit idle. The framework records a stop. The operator notices, restarts the AI CLI, and clicks Resume. 
*   **The one risk**: Operator fatigue from managing the AI engine's lifecycle.
*   **Mitigation**: The framework cannot reliably manage the external Claude/Copilot engine processes, as they are proprietary CLIs running in the editor's environment. Attempting to auto-restart them will introduce severe cross-platform IPC brittleness.
*   **Delete**: Delete any ambition for the framework to monitor or auto-restart the AI's CLI.

**6. The one thing to prove first**
*   **Recommendation**: Prove that the Windows GUI-subsystem Node process will actually execute a global error handler and flush to disk before dying.
*   **Design**: Write a tiny script that forces an uncaught exception and a fatal out-of-memory error. Launch it via the extension exactly as the loop is launched today. Verify that `loop.log` captures the output and `run.json` captures the `Stop`.
*   **The one risk**: Hard crashes (e.g., OOM, segfaults in native bindings) bypass V8's `uncaughtException` handler, meaning `run.json` still won't get the `Stop`.
*   **Mitigation**: If the handler fails to catch the exit, you must wrap the Node invocation in a simple `.bat` or `.sh` script (started by the extension) that redirects `stderr` to `loop.log` and writes the crash `Stop` if the Node exit code is non-zero.
*   **Delete**: Do not write any code for Layer 1 until this environmental logging quirk is proven solved.
