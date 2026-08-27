# Review: The framework as the only white box

## 1. Verdict up front

**Adopt-with-changes.** The core thesis—encapsulating AI, humans, and implementations as black boxes behind typed interfaces—drastically simplifies state management and correctly aligns the architecture with the reality of asynchronous orchestration. However, the proposal cannot be adopted as written because its mechanics for streaming state (Server-Sent Events based on integer sequence numbers) mathematically fail when combined with the distributed, git-backed journal proposed in WP-5.

## 2. Blocking findings

**State streaming mechanism is fundamentally incompatible with distributed journaling (WP-5).**
*   **Quote:** *§5: "Mechanics: Server-Sent Events, with the event id equal to the journal sequence number... Reconnect sends Last-Event-ID and the server replays from the record"*
*   **Failure:** WP-5 puts the record in git and allows multi-machine appends with union merges. In a distributed, branching/merging git environment, integer sequence numbers are not total or stable. If Machine A appends sequence `10` and Machine B appends sequence `10`, a merge results in a corrupted sequence line. A client reconnecting with `Last-Event-ID: 10` will either miss events, duplicate events, or crash the stream decoder.
*   **Fix:** The `Last-Event-ID` must be the cryptographic hash of the journal append (e.g., the git commit SHA or a Lamport vector clock), and the `GET /events` endpoint must traverse the causal graph, not a linear integer sequence.

**Terminal returns for escalations destroy the ephemeral context window.**
*   **Quote:** *§1: "Escalation is a return value, not a conversation... the call terminates, the inbox files the event, and the framework resumes later with the decision as a parameter..."*
*   **Failure:** By forcing all escalations to terminate the AI subroutine, you drop the AI's ephemeral context. If an AI engine is deep into traversing a complex component graph (say, 80,000 tokens of loaded context) and needs a human decision on an ambiguous API contract, terminating the call discards the context window. Resuming requires a cold start, reprompting, and reloading that exact context—which drives up token costs geometrically and risks the AI losing its train of thought entirely. (Inference: Assuming cold-starts cannot perfectly recreate deep traversal states deterministically).
*   **Fix:** Introduce a `hibernate()` or `suspend()` state primitive. The framework must support parking a session's API thread (if the vendor API supports it, e.g., via cached context persistence) rather than strictly terminating and tearing down the runtime process. 

**"Indifferent party" is anthropomorphic, unfalsifiable, and gameable.**
*   **Quote:** *§1: "Corollary to P3 — branch only on honest fields... authored by a party indifferent to the branch."*
*   **Failure:** AI models do not have motivations; they have token distributions. "Indifference" is a human trait. An evaluating model might output `MAJOR` severity simply because its training data correlates the requested context with severe code reviews, not because it is "indifferent" to the outcome. Stating a model is indifferent makes the axiom unfalsifiable. A human operator can easily prompt-inject a verifier to mimic "critical" sentiment, breaking the branch logic.
*   **Fix:** Redefine this corollary purely mechanically: "Branch only on honest fields: outputs that are deterministically verifiable by the framework, or outputs produced by a cross-vendor verification call utilizing an isolated, pre-versioned prompt."

## 3. Non-blocking findings

**Shifting unit tests entirely to solution time breaks verification.**
*   **Quote:** *§2: "5(b) produce(tests) — unit tests, at solution time."*
*   **Failure:** Moving unit tests to the solution phase removes the framework's ability to use tests as an independent, human-auditable constraint (Test-Driven Development). If the AI writes the test at the same time it writes the solution, the test will structurally conform to the solution's blind spots.
*   **Fix:** `produce(tests)` must remain an available operation at plan time (as part of the package set spec).

**The VS Code Webview creates an unacknowledged sandbox boundary.**
*   **Quote:** *§4: "a VS Code webview hosts the identical static files for developers"*
*   **Failure:** VS Code webviews operate in isolated iframes with restricted content security policies. Assuming the webview can identically substitute the browser without specialized IPC routing for network requests (like the `GET /events` SSE stream) will result in CORS failures or blocked web sockets in the IDE environment.
*   **Fix:** Explicitly define the message-passing proxy required to bridge the VS Code webview context back to the local `dabbler serve` CLI instance.

## 4. The nine attack points of section 10

1. **The compiled axiom:** P1 vs "AI leads work packages" is not fully resolved by the authorship/state distinction. "AI is a function call" implies low-latency, synchronous completion. AI calls are high-latency and prone to timeout. A function call paradigm masks the distributed systems reality of calling an LLM.
2. **The grammar:** `adjudicate` is not a primitive verb; it is just `critique` applied to a `critique` artifact. `decompose` is genuinely missing—moving from a project plan to a package set is an architectural decomposition, not merely "producing" a spec. If the artifact set gains `contract`, `negotiate` must be a verb, otherwise contracts are dictated, not agreed upon.
3. **The honest-fields corollary:** Yes, path-aware pull utterly destroys the "indifferent party" constraint. If the verifying AI decides which files to fetch, it curates its own evidence base. A verifier that chooses to only look at happy-path tests will erroneously pass a broken solution.
4. **SSE on the journal:** Answered in Section 2. Sequence numbers are catastrophic under WP-5 union merges. Record-as-bus *does* couple UI availability to git availability.
5. **The guard line:** The UI leaks power through *attention economics*. If the UI batches approvals or auto-selects "Approve" as a default state, the human authorization becomes a rubber stamp. The projection dictates what the human sees, which means the projection acts as a shadow scheduler.
6. **Terminal returns:** Answered in Section 2. Mid-step clarifications inside large context windows (like long-running repo analysis) cannot be terminal without incurring massive token reload costs and state-reconstitution errors. 
7. **Central serve:** If the central box is down, staff fall back to local CLI appends. Without strict CRDTs or rebase rules, the per-machine journals will encounter race conditions on the "escalation decision" events, leading to split-brain workflow states.
8. **The domain seam:** "Aesthetic findings never block" is a massive loophole. A lazy verifier will classify a hard architectural defect (e.g., tight coupling) as a "messy aesthetic" to avoid substantiating a failure case. Conversely, an author will dismiss a valid severity-1 finding by tagging it as a "stylistic choice".
9. **The UAT checklist:** The per-step UAT checklist fails the mechanize-or-delete rule. Once the human baseline calibrates the weak-model panel, the checklist becomes dead ceremony that slows the supervisor down. It should be a temporary instrumentation phase, not a permanent UI fixture.

## 5. What the document gets right

*   **Atomic versioning via the wheel:** Bundling the UI, framework, guidance docs, and verification prompts into a single `pipx` artifact is structurally brilliant. It eliminates version skew and guarantees prompt-infrastructure consistency.
*   **Human as a black box:** Decoupling the human from real-time monitoring and treating them as an async dependency (attention event → decision) solves the human-latency/machine-timeout impedance mismatch.
*   **Streaming separation:** Divorcing the raw token diagnostic streams from the deterministic state journal correctly isolates non-deterministic execution from application state.

## 6. What is missing

*   **Branch Rot & Human Latency:** The document ignores the consequence of asynchronous human terminal returns. If an AI escalates a decision on Tuesday, and the supervisor answers on Thursday, the underlying `main` branch may have moved by 100 commits. The state refolded from the journal is now invalid against the repository.
*   **Context Rehydration Costs:** Terminate-and-resume workflows assume state rehydration is free. It is not. Rebuilding a 100k token context window costs money and time; the document contains no cost-control bounds for cyclic escalations.
*   **Vendor API Schema Drift:** Treating the AI as a pure typed function `(inputs) → schema` assumes the vendor's structured output mechanism never silently drifts or degrades. There is no failure mode defined for when an LLM returns a structurally valid but semantically hallucinatory schema that bypasses the P3 deterministic branch checks.
*   **State Reconciliation Rules:** WP-5 allows multi-machine git appends. §4 proposes a central serve. There is no mention of how `ai_router` handles git merge conflicts on the `journal.jsonl` when two supervisors approve conflicting branches simultaneously.

## 7. Concrete recommendations

1. **[Must]** Replace integer sequence numbers with cryptographic hashes or causal vector clocks for the `Last-Event-ID` in the SSE implementation to support WP-5 git merges. *Changes §5 Mechanics.*
2. **[Must]** Define a `suspend/hibernate` runtime primitive for AI calls, or explicitly budget and test the token cost of context rehydration for terminal escalations. *Changes §1 Escalation corollary.*
3. **[Must]** Redefine the "honest fields" corollary to rely purely on deterministic verification or independent vendor cross-checking, stripping the word "indifferent". *Changes §1 Corollaries.*
4. **[Must]** Define git merge conflict resolution rules for `journal.jsonl` appends in a multi-actor environment. *Changes WP-5 / §9.*
5. **[Should]** Remove `adjudicate` from the primitive verbs and implement it as `critique(critique(artifact))`. *Changes §2 Grammar.*
6. **[Should]** Add `produce(tests)` to the plan-time phase (5a) to preserve Test-Driven Development constraints. *Changes §2 Grammar.*
7. **[Consider]** Adding a deprecation schedule to the integrated UAT checklist so it is removed once the weak-model panel achieves calibration, adhering to the "mechanize or delete" axiom. *Changes §4 Surface / §10.9.*