# r1 -- opus

> model_used=None cost=$0.204185 chars=9537

## Verdict up front

The framing is 80% right and wrong in one load-bearing place. The operator's thesis commits a **category error**: it argues that a small, well-characterized *defect residual* makes *execution* safe. It doesn't. The cage makes execution safe; the floor makes execution-backed *findings trustworthy*. Those are different guarantees, and conflating them is exactly how you'd talk yourself into running agent-authored code in a cage that is explicitly **not an OS sandbox**.

What the floor actually buys the ceiling is *epistemic*, not *safety*: it extends the deterministic-servant discipline to the agent's claims. A finding that ships as a re-runnable falsifier doesn't require the human to trust the agent at all â€” the servant re-executes it. That reframe drives everything below.

Also note: both missed bugs (`mkdtemp` outside try/finally; loader catching only OSError/JSONDecodeError) are **textbook probeable falsifier-class defects**. They aren't evidence the residual needs an execute-empowered agent â€” they're evidence the **floor was incomplete and nobody wrote those falsifiers**. The ceiling's highest-value output is therefore not "here's a bug," it's "here's a falsifier you should add to the floor."

---

## 1. Capabilities

| Tool | Get it? | Guardrail | What it buys |
|---|---|---|---|
| **Wire existing `run_test` cage into `pull_critique.py`** (trigger operator-configured argv: declared falsifiers + whitelisted real-suite subset) | **YES â€” do first** | Argv stays operator-authored, `shell=False`, model can only *trigger*; servant captures raw exit+output as the finding artifact | Closes the literal gap that caused this incident; lets the critic *run* the floor it's reasoning about |
| **Diff-awareness** (raw diff of what changed in the set) | **YES** | Raw diff via byte-equality-guarded servant read | Focuses probing on the blast radius; cheap |
| **Deeper multi-turn / multi-round probing budget** | **YES** | Bounded turns + token cap; read-only by default | Most of the manual run's edge was *thoroughness*, not execution. This is the cheapest catch-up lever |
| **Reproduce-then-claim tiering** (EXECUTED vs ASSERTED findings) | **YES** | EXECUTED finding *must* carry a servant-captured transcript (pinned ref, argv/script, exit, output hash); close-out **re-runs** it | Turns "I reproduced this" from a narration into a re-executable fact |
| **Critic-coverage harness** (seed known defects, score automated vs manual catch rate) | **YES** | Deterministic seeded-defect scoreboard | The *only* way to know the automated process approaches manual without running manual every release |
| **Agent-authored-and-run repro / candidate falsifier in a WRITE sandbox** | **Conditional â€” NOT in the current cage** | Requires a real OS sandbox: network-denied, fs-jailed, seccomp/container, resource-capped | High leverage *only after* the sandbox exists; otherwise a trap (see Â§2) |
| **Agent authoring arbitrary shell strings into the current cage** | **NO** | â€” | Violates the "model can only trigger, never author the command" invariant and the trusted-command threat model |
| **Any write to the real working tree / network egress / secret access** | **NO** | â€” | Out of scope for a critic; unbounded action space |

The decisive distinction is **trigger vs author**. Triggering an operator-configured argv keeps the cage's trust assumption intact (the command is trusted; isolation only guards against *accidental* writes). The moment the agent *authors* the executable, the command is no longer trusted and the current cage's stated threat model no longer holds. You cannot paper over that with "the residual is small."

---

## 2. The falsification hinge

**Where it holds:** The floor genuinely makes the ceiling's job *small and sharp* â€” it tells the agent which classes are already covered, so the expensive agent spends its budget on the characterized remainder and on *authoring new falsifiers*. And the floor's discipline (everything is a re-runnable falsifier) is exactly what makes an execution-backed finding trustworthy: the servant re-runs it, so trust never rests on the model's word.

**Where it breaks:** "Small well-described *defect* domain â‡’ expanded *capability* is safe" is a non-sequitur. The defect residual being small says nothing about the action space of an agent that can author and run code. Execution safety is a property of the **sandbox**, not the **floor**. Drawing the line:

- **Safe + high-leverage given the floor:** trigger pre-authored falsifiers/tests in the disposable cage; multi-turn read-only probing; diff-scoped attention. Leverage comes from *the floor telling the agent where to look* and *the servant re-running what it claims*.
- **Must stay forbidden to preserve the deterministic-servant guarantee:** the servant answering with anything other than raw ground truth; the agent's *narration* of an execution being accepted as evidence; agent-authored code running in the current (non-OS) cage.

**Is "reproduced by running" itself trustworthy?** Not intrinsically â€” and this is the most dangerous new fooling vector. In the manual run a human *watched the terminal*; the trust came from the operator, not the model. Automate it naively and "I reproduced this by calling `run_test_in_cage(...)`" becomes a **hallucinated reproduction** â€” a finding that looks stronger than a read-only assertion but is backed by nothing. The fix is non-negotiable: an EXECUTED finding is valid **iff** it carries a servant-captured transcript that the close-out gate independently **re-runs and confirms**. No transcript â‡’ auto-downgrade to ASSERTED. Re-run mismatch â‡’ void the finding *and* raise a critic-integrity flag. "Falsifier-or-it-didn't-happen."

---

## 3. Architecture, generally

**Structurally right?** The floor â†’ ceiling â†’ gated-routed cost tiering is sound. The PUSH (pasted snippet, lossy/stale) vs PULL (agent reads ground truth via deterministic servant) distinction is the best idea in the system and should outlive verification.

**The single most important missing thing:** a **ratchet** â€” a promotion path from ceiling findings back into the floor. Today the ceiling does expensive end-of-set work whose output does not *compound*: a probeable defect found by the critic should become a **permanent falsifier in the floor**, so it can never regress and is never re-discovered at agent prices. Without this, the system relearns the same residual every set, and the automated process will *systematically underperform* because its best findings evaporate instead of hardening the cheap layer. This single gap matters more than any new tool.

A close second: **no deterministic measure of critic thoroughness.** This entire incident was only detected because a human ran the manual process in parallel. You cannot scale that. The critic-coverage harness (seed defects, score catch rate) is what lets you retire the parallel manual run with evidence rather than faith.

**Generalize Mode-2 PULL beyond verification?** Yes for read-heavy work (analysis, docs, code-gen *planning*) â€” reading real repo state beats pasted context every time. **No** for the write/execute dimension until the OS sandbox exists; generalizing PULL must not smuggle in author-and-run.

**Restructure:** keep the three tiers; add a fourth loop *orthogonal* to them â€” a **floor-feedback ratchet** that ingests EXECUTED ceiling findings as new falsifiers. Recast the automated critic's north star from "find bugs" to "author executable falsifiers for the residual, run them to confirm they fail on current code, hand them to the floor." That aligns the agent's output with the deterministic-servant guarantee perfectly.

---

## Prioritized list

1. **Wire the existing `run_test` cage into `pull_critique.py`** (trigger declared falsifiers + whitelisted suite subset). *Guardrail: operator-authored argv, `shell=False`, servant captures raw exit+output; no agent-authored commands.*
2. **Reproduce-then-claim tiering with servant transcripts; close-out re-runs every EXECUTED finding.** *Guardrail: no transcript â‡’ ASSERTED; re-run mismatch â‡’ void + integrity flag.*
3. **Diff-awareness + deeper multi-turn probing budget.** *Guardrail: raw diff via byte-equality servant; bounded turns/tokens; read-only.*
4. **Falsifier-promotion ratchet (ceiling â†’ floor).** *Guardrail: a promoted falsifier must fail-on-old and pass-on-fixed before admission.*
5. **Critic-coverage harness (seeded-defect scoreboard).** *Guardrail: deterministic catch-rate gate before "automated replaces manual" is ever claimed.*
6. **Agent-authored-and-run repro â€” ONLY behind a real OS sandbox.** *Guardrail: network-denied, fs-jailed, seccomp/resource-capped; forbidden until that sandbox ships.*

## Traps

- **Trusting agent narration of a reproduction.** The single largest trust-eroder; "I ran X" without a re-runnable transcript is a hallucination surface.
- **Running agent-authored code in the current cage.** It is disposable-CWD isolation of a *trusted* command, not an OS sandbox; agent-authored code is not trusted. The thesis's "small domain â‡’ safe" reasoning will tempt you straight into this.
- **Believing the floor makes execution safe.** It makes findings *verifiable*, not execution *safe*. Don't let the right idea (re-runnable falsifiers) license the wrong action (unsandboxed author-and-run).
- **A one-shot ceiling with no promotion path.** Expensive work that doesn't compound guarantees perpetual underperformance.
