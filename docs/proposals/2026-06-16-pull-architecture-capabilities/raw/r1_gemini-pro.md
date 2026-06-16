# r1 -- gemini-pro

> model_used=None cost=$0.020279 chars=7873

### 1. Capabilities

The automated pull-critique process requires execution capabilities to approach parity with the manual process. The additions must be gated by the "deterministic servant" principle: the agent requests an action, and the orchestrator executes it precisely, returning raw, verifiable results.

#### New Tools / Affordances

1.  **Tool: `get_diff(base_ref: str, head_ref: str) -> str`**
    *   **Guardrail:** Read-only. Returns the raw `git diff` output. The agent cannot specify format options beyond standard diff flags (`--unified=N`).
    *   **Buys:** Context. Enables the agent to focus its analysis on changed files and their immediate dependencies, dramatically improving the efficiency and relevance of its critique. This is the highest leverage-per-risk addition.

2.  **Tool: `run_existing_test(command_key: str) -> dict`**
    *   **Guardrail:** The agent provides a `command_key` which maps to a pre-configured, operator-vetted command `argv` list in the project's contract. The agent cannot author or modify the command itself. The tool utilizes the existing `run_test` cage.
    *   **Buys:** Direct, safe execution of the existing test suite and falsifiers. Allows the agent to confirm if a suspected regression breaks a known contract, or to run a specific test relevant to its analysis of the diff.

3.  **Tool: `run_scratchpad(code: str, language: str) -> dict`**
    *   **Guardrail:** The provided `code` is written to a file in a fresh, disposable `run_test` cage and executed via a non-shell interpreter (e.g., `['python', 'scratch.py']`). The cage must have no network access, a strict wall-clock timeout (e.g., 5 seconds), and output size limits. The agent cannot influence the execution environment beyond providing the source code.
    *   **Buys:** The ability to author and execute a minimal reproduction for a suspected defect not covered by existing falsifiers. This is the critical step for discovering novel bugs and providing concrete, verifiable evidence.

4.  **Discipline: "Reproduce-then-Claim" Evidence Tagging**
    *   **Guardrail:** This is an orchestrator-level constraint. Any finding presented to a human reviewer must be tagged with its evidence source. The orchestrator, not the agent, applies the tag.
        *   `[ASSERTION]`: A finding based on read-only analysis.
        *   `[FALSIFIED]`: A finding backed by a failing run of `run_existing_test`. The raw output must be attached.
        *   `[REPRODUCED]`: A finding backed by a run of `run_scratchpad`. The exact code and raw output must be attached.
    *   **Buys:** Trust and clarity. It separates verifiable, executed claims from plausible-but-unproven assertions, allowing the human reviewer to immediately assess the quality of a finding.

#### Forbidden Capabilities

*   **Arbitrary Shell Execution:** The agent must never be given access to `shell=True` or the ability to compose shell command strings. This is an unbounded action space that violates safety principles.
*   **Unrestricted File System Writes:** All write/execute actions must be confined to the disposable cage. The agent cannot modify the source repository or any persistent state.
*   **Network Access:** Execution cages must be network-isolated to prevent exfiltration and non-determinism.

### 2. The Falsification Hinge

The operator's thesis is sound but requires a critical amendment: the floor justifies expanded capability not because it makes agent execution *safe*, but because it makes it *tractable and verifiable*. The floor's primary function is to shrink the problem space, allowing the expensive, high-capability agent to focus on a smaller, well-characterized residual.

*   **Where it holds:** The thesis holds if the expanded capability is strictly bound by the "deterministic servant" principle. The agent can *propose* an execution (a test run, a scratchpad script), but the orchestrator *performs* it and returns raw, byte-for-byte ground truth. The floor's existence means the agent's proposals are more likely to be targeted and useful (e.g., "the diff touches auth logic, but I see no new falsifier for case X; let me write a scratchpad probe").

*   **Where it breaks:** The thesis breaks if the orchestrator allows the agent to summarize, interpret, or fabricate the results of an execution. The moment the agent can claim "I ran the code and it failed" without the orchestrator enforcing the attachment of the raw, verifiable execution log, the system is compromised. The human reviewer's trust is not in the agent's reasoning, but in the verifiable evidence the orchestrator provides.

*   **The Line:**
    *   **Safe/High-Leverage:** Granting the agent tools to request execution within a rigidly controlled, non-networked, disposable sandbox, where the orchestrator guarantees the fidelity of the returned raw output (code, exit status, stdout, stderr).
    *   **Forbidden/Unsafe:** Allowing the agent to execute with shell access, write outside the sandbox, access the network, or present its *interpretation* of a run as ground truth. A "reproduced by running" claim is only trustworthy if the raw evidence is non-negotiably attached by the orchestrator. This transforms the agent's claim from an assertion into a testable hypothesis with a full trace.

### 3. Architecture, Generally

The `floor -> ceiling -> gated-routed` model is structurally correct. It correctly prioritizes cheap, deterministic verification (floor) and reserves the expensive, flexible agent (ceiling) for the complex residual. Demoting context-free "Mode-1 PUSH" is the right move.

*   **Most Important Missing Element:** **A promotion-to-floor feedback loop.** When the `run_scratchpad` tool successfully reproduces a bug, the system lacks a formal mechanism to convert that scratchpad code into a new, permanent falsifier test and add it to the floor. Without this, the agent is doomed to rediscover the same *classes* of bugs. The system must treat agent-authored reproductions not just as critique evidence, but as candidate contributions to the deterministic test suite. This loop is what makes the system self-improving and systematically reduces the surface area requiring expensive agent analysis over time.

*   **Generalizing Mode-2 PULL:** Yes. Path-aware, read-only repository access is a foundational capability for any advanced AI-driven software task. It should be the default mode for:
    *   **Code Generation:** Generating code that is aware of existing modules, conventions, and call sites.
    *   **Documentation:** Updating documentation based on diffs to public APIs.
    *   **Refactoring:** Planning and suggesting refactors that require understanding cross-file dependencies.
    Mode-1 PUSH (snippets) should be relegated to trivial, localized tasks.

*   **Restructuring Recommendation:** No major restructuring is needed. The layered model is sound. The critical task is to build the feedback loop from the ceiling (agent findings) back to the floor (permanent tests).

### Prioritized List of Capabilities

1.  **`get_diff`**
    *   **Guardrail:** Read-only, returns raw `git diff` output.
2.  **`run_existing_test`**
    *   **Guardrail:** Agent selects from an operator-defined allow-list of commands; no `argv` authoring.
3.  **"Reproduce-then-Claim" Evidence Tagging**
    *   **Guardrail:** Orchestrator-enforced, non-negotiable attachment of raw execution logs to claims.
4.  **`run_scratchpad`**
    *   **Guardrail:** Execute code in a disposable, network-isolated cage with strict resource limits.

**Trap to Avoid:** The primary trap is "trust inflation." Do not build a system that encourages the human reviewer to trust the agent's summary of what happened. The trust anchor must always be the raw, verifiable evidence produced by the deterministic servant. The agent finds; the orchestrator proves; the human judges.
