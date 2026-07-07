# Raw consult response — gemini-pro (2026-07-07)

> Captured verbatim from `ai_router.query("gemini-pro", …,
> task_type="analysis")` console output. Prompt: see
> `consensus-synthesis.md` (neutral framing, measured facts, invitation
> to disagree).

### Analysis and Recommendations

#### 1. Cost of ~65k Token Context

Yes, a ~65k token static preamble is a significant cost to model reasoning quality, latency, and expense. It is not negligible.

The primary mechanisms of degradation are:

*   **Attentional Dilution:** The model's attention mechanism has a finite capacity. A large volume of static, low-relevance process documentation dilutes the attention paid to the actual, session-specific task instructions. This is a "needle-in-a-haystack" problem; the model must expend significant effort to locate and focus on the most relevant parts of the context for the immediate task, increasing the probability of misinterpretation or oversight.
*   **Instruction Collision & Redundancy:** The prose likely describes rules that are also enforced by executable gates. If the prose description is even slightly ambiguous or differs from the gate's implementation, the model will waste cycles trying to reconcile them. The observed "10 verification rounds to close" is a classic symptom of this: the model is satisfying its understanding of the prose rules, but failing the stricter, executable gate checks.
*   **Positional Bias:** Models often exhibit bias toward information at the beginning and end of the context window. Critical task-specific instructions, if placed after the 65k token preamble, may be in a position of lower effective attention.
*   **Latency and Financial Cost:** Every token in the context increases API latency (time-to-first-token) and incurs direct costs. For a cadence of 3-5 sessions per day, this overhead is a material, recurring expense.

#### 2. Criteria for Context Inclusion

A rule or piece of guidance should only be in the always-loaded context if it is **strategic, not tactical**. Use the following decision framework:

| Rule Type | Ideal Implementation | Rationale |
| :--- | :--- | :--- |
| **Absolute & Machine-Verifiable** (e.g., format, syntax, state logic) | **Executable Gate** (Linter, schema validator, unit test, CLI check) | Code is the unambiguous source of truth. Gates provide immediate, deterministic feedback without ambiguity. |
| **Strategic Guidance** (e.g., architectural principles, persona, tone) | **Always-Loaded Context** (Kept concise) | These guide the model's reasoning and cannot be captured by a simple linter. This is the context's core job. |
| **Detailed/Situational Reference** (e.g., esoteric APIs, complex examples) | **On-Demand Reference** (Retrievable via RAG/search) | Loading this information for every session is wasteful. The model should fetch it only when needed. |
| **Low-Impact/Trivial Error** (e.g., minor formatting slip-up) | **Delete/Accept** (Allow the mistake; let a fast, cheap gate catch it) | The cost of prevention (permanent context overhead) exceeds the cost of a fast, automated correction. |

A lesson earns its place in the always-loaded context if it imparts a **non-obvious, strategic principle** that has been shown to prevent a high-cost, difficult-to-detect class of error. A lesson about a specific JSON field format should be demoted to the schema validator.

#### 3. Principle of "Allowing Cheap Mistakes"

"Allow easily-detected, easily-corrected mistakes" is a sound engineering principle for AI-led workflows. It mirrors the software development principle of "fail fast." A tight feedback loop between generation and automated verification is more efficient than attempting to prevent all possible errors through exhaustive upfront instruction.

**The principle is sound when:**
*   **Detection is Automated and Fast:** A linter, test, or validator can identify the error in seconds.
*   **Correction is Cheap:** The model can fix the error in a single subsequent attempt with minimal new instruction.
*   **State is Preserved:** The mistake does not corrupt state or cause irreversible side effects. Your idempotent close-out CLI is a good example of mitigating this risk.

**The limits of this principle are:**
*   **High-Cost Errors:** Mistakes that require significant human intervention to diagnose or repair.
*   **Non-Idempotent Actions:** Errors involving external API calls that have real-world side effects (e.g., deploying code, sending notifications, processing payments).
*   **Security and Data Integrity:** Any action that could lead to a security vulnerability or data corruption must be prevented, not reactively corrected.
*   **Compound Errors:** Errors that are subtle and lead to a cascade of subsequent, harder-to-diagnose failures.

Your framework's existing gates already appear to manage these limits correctly. The current problem is that you are paying for both proactive prevention (in context) and reactive correction (via gates). You should rely on the gates.

#### 4. Triage and Target Size

**Target Context Size: < 10,000 tokens. Aim for ~5,000.**

This requires aggressive, principled cuts. The goal is to transform the context from a procedural manual into a strategic briefing.

**Cut First (Highest Priority):**

1.  **`State-File Schema` (~9k tokens):** This is 100% redundant with your JSON schema validation. **Replace the prose with a compact, machine-readable format like a TypeScript interface or a summarized key-value structure.** A 9k token natural language description of a schema is pure overhead.
2.  **`Close-out Reference` (~8.5k tokens):** This is redundant with the `close-out CLI`. The model does not need an 8.5k token manual for a tool it can interrogate directly. If specific complex flags are needed, provide only those as examples.
3.  **`Workflow Procedure` (~27k tokens):** This is the largest source of waste. State transitions and procedural rules should be enforced by the orchestrating code and state machine, not described in prose. **Distill this down to a high-level summary of phases or goals (1-2k tokens max).** The "how" is the framework's job; the context should only contain the "what" and "why."

**Review and Prune:**

*   **`Authoring Guide` (~6.5k tokens):** Separate stylistic/strategic guidance (keep) from formatting rules (enforce with a linter).
*   **`Lessons-Learned` (~7.5k tokens):** Re-evaluate every loaded lesson against the criteria in section 2. Most are likely candidates for demotion to on-demand search or conversion into new linting rules. Keep only the most critical, cross-cutting strategic insights.

**Never Cut (Core Value):**

*   **`Project Guidance` (~2.5k tokens):** This appears to be the session-specific goal and background. This is the most valuable part of the context. It should be preserved, refined for clarity, and placed at a high-priority position in the prompt (e.g., immediately after a system role prompt).
