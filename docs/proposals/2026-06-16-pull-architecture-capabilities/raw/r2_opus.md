# r2 -- opus

> model_used=None cost=$0.197355 chars=14013

# Round 2: Adversarial Cross-Critique + Synthesis

## 1. Adversarial critique of all three

### Opus (my own) — where it's wrong or over-confident

- **The "ratchet" is asserted as #1 in importance but under-engineered.** Opus declares floor-promotion "matters more than any new tool," then specifies its guardrail as one line: "must fail-on-old and pass-on-fixed before admission." That elides the hard part. A ceiling-authored falsifier that passes-on-fixed/fails-on-old can still be *overfit* (asserts an incidental string, depends on wall-clock, tests the symptom not the contract). Admitting such tests *poisons* the floor — now the cheap deterministic layer carries brittle agent-authored checks that flake and erode trust in the floor itself. Opus never addresses falsifier *quality* gating, only directional correctness. That's hand-waving on the most load-bearing guardrail in its own proposal.
- **"Both bugs were textbook probeable; the floor was just incomplete" is too clever and partly evades the question.** True but non-actionable: *every* bug is "probeable in hindsight." The interesting claim — which Opus uses to demote execution — is that you didn't need execution to find them. The prompt's own honest caveat concedes reading could find them. So Opus leans on the easy case to argue against execution generally, while the *value* of execution is on the bugs reading-alone misses (timing, resource, integration, state-dependent). Opus doesn't engage that residual at all.
- **Refusing model-authored-and-run until "a real OS sandbox exists" is correct but treated as a far-future item (#6).** It's parked without a cost estimate. If the sandbox is cheap (a rootless container + network namespace), parking it at #6 is a mistake; if expensive, saying "forbidden until it ships" is a polite way of saying never. Opus doesn't force that decision.

### GPT-5-4 — where it's wrong or over-confident

- **The capability list is good; the budget numbers are fabricated precision.** "20 reads, 3 executions, 1 follow-up execution" — these numbers have no derivation. Presenting invented caps as if they're guardrails is exactly the kind of false rigor the prompt warns against. A cap pulled from nowhere will either throttle a legitimate deep probe or permit a runaway; it should be operator-tunable per set, not a magic constant.
- **The confidence ladder conflates two orthogonal axes.** "Reproduced on pristine tree = highest confidence" assumes pristine ⇒ trustworthy. But a pristine-tree run of a *wrong probe* (wrong preconditions, mocks that fake the failure) is confidently wrong. Tree-pristineness guards against *contamination*, not against *the probe demonstrating its own assumptions* — which GPT-5-4 itself lists as a bluffing surface two paragraphs earlier, then forgets when building the ladder. Pristine-tree should be necessary, never sufficient.
- **`run_test_subset(selector)` with "selector grammar only" smuggles in author surface.** A pytest selector that accepts `-k` expressions or nodeids is a richer input language than admitted. Allowing arbitrary nodeids means the agent can target *any* test including ones with fixtures that touch the network or filesystem. "Selector grammar, no arbitrary flags" is not the same as "operator-vetted target set," and GPT-5-4 blurs them.

### Gemini-Pro — where it's wrong or unsafe

- **`run_scratchpad(code, language)` is the single most dangerous proposal across all three, and Gemini-Pro waves it through.** It writes *model-authored code* into the **current `run_test` cage** and runs it via `['python', 'scratch.py']`. The system spec is explicit: that cage is "disposable-CWD isolation of a TRUSTED command... explicitly NOT an OS sandbox... a deliberately hostile command could still escape." A model-authored Python file *is the command*. Gemini-Pro has taken the one structure the architecture says is safe only for trusted argv and fed it untrusted code. "No network, 5s timeout, output caps" does not make non-OS-sandbox arbitrary-code-execution safe — those are resource caps, not isolation. This is the trap Opus and GPT-5-4 both name explicitly. **Gemini-Pro's #4 ships an escape hatch.**
- **"No major restructuring needed" contradicts its own most-important-missing-element.** It names the promotion-to-floor loop as the critical missing piece, then says no restructuring is needed. Adding a feedback loop that mutates the floor *is* a structural change with its own admission gate. Internally inconsistent.
- **Network isolation asserted, never specified.** "Execution cages must be network-isolated" — by what mechanism? The current cage is `shell=False` + worktree confinement. There is no stated network namespace. Gemini-Pro assumes a property the described cage does not have.

---

## 2. The real disagreements (the cruxes a human must decide)

**CRUX 1 — May the agent author code and run it, and if so where?**
This is the only sharp three-way split.
- Opus: never in the current cage; only after a real OS sandbox; parked at #6.
- GPT-5-4: never in the current cage; build the OS sandbox as a deliberate prerequisite (#6) then unlock (#7).
- Gemini-Pro: **yes, now, in the current cage** via `run_scratchpad`.

Gemini-Pro is wrong and the architecture's own threat model says so. But the *real* decision the human must make is not "scratchpad yes/no" — it's **"is an OS sandbox on the roadmap or not?"** If yes, the author-and-run capability is a scheduling question. If no, you are permanently capped at trigger-only execution and must accept that the automated ceiling will never reach the manual ceiling on bugs that require a novel reproducer. Both Opus and GPT-5-4 dodge this by saying "after the sandbox" without committing to building it.

**CRUX 2 — Is execution the bottleneck, or is thoroughness?**
- Opus: "most of the manual run's edge was thoroughness, not execution" → deep multi-turn read-only probing is the cheapest catch-up lever; execution is confirmation.
- GPT-5-4 / Gemini-Pro: execution-backed probing is *the* missing lane; one tooled provider beats two read-only ones.

The prompt's honest caveat ("both bugs were ALSO findable by careful reading alone") supports Opus. But that's an N=2 anecdote on the *easy* bugs. A human must decide whether to invest in probing-depth (cheap, safe, immediate) or execution-evidence (more guardrails, higher ceiling). They are not mutually exclusive, but they compete for the first sprint.

**CRUX 3 — Does promoting agent findings into the floor strengthen or poison it?**
All three want the ratchet. None gates falsifier *quality*. The crux: an unmaintained, agent-authored falsifier that flakes is worse than no falsifier, because it discredits the cheap layer the whole architecture rests on. Human must decide the admission bar: does a promoted falsifier require human sign-off, or is fail-on-old/pass-on-fixed enough? (It is not enough.)

**CRUX 4 — Trigger vs. select vs. author.**
Opus draws the line at trigger (operator-authored argv only). GPT-5-4/Gemini add *selection* (the agent picks which test/nodeid). Selection is a strictly larger input space than triggering. Where exactly the trust boundary sits — fixed command IDs only, vs. agent-chosen test targets — is a real and unresolved difference.

---

## 3. What is MISSING from all three

1. **Probe-correctness verification (the meta-oracle problem).** All three obsess over *containment* (can the probe escape?) and *fidelity* (is the raw output faithfully relayed?). None addresses whether the probe *tests the right thing*. A reproducer that passes containment, runs on a pristine tree, and produces faithfully-relayed output can still demonstrate a bug that does not exist (wrong assumptions baked into the probe). The deterministic servant guarantees the *transcript* is real; it does not guarantee the *probe is valid*. This is a strictly harder trust problem than hallucinated narration and none of the three even names it. **Mitigation none proposed:** require an EXECUTED finding to demonstrate the failure *through an existing public entrypoint / contract*, not through an agent-constructed harness — i.e., the probe must drive the real API, not mock its way to a failure.

2. **Cost/latency budget of the whole layered surface.** The architecture justifies itself on cost tiering ("reserve the expensive agent"). Adding multi-turn loops, per-finding re-runs at close-out, fresh-checkout-per-repro, and OS-sandbox spin-ups multiplies wall-clock and dollars. None of the three computes whether the executable ceiling is still cheaper than just running the manual process. If automated-with-all-guardrails costs more than the operator's manual hour, the whole motivation collapses.

3. **Determinism/flakiness of execution evidence.** Every proposal treats a single run's exit code as ground truth. Real execution is flaky (timing, ordering, environment). A close-out gate that "re-runs every EXECUTED finding" (Opus #2) will itself flake, producing spurious "re-run mismatch ⇒ void + integrity flag" — i.e., the integrity machinery generates false accusations against honest critics. Need a flake policy (N-run majority, quarantine) before re-run-to-confirm is safe. Absent everywhere.

4. **What happens to the *manual* process.** The incident's only saving grace was a human watching a terminal. All three implicitly aim to *retire* the manual run (Opus's coverage harness explicitly). None asks whether the manual run should remain as a permanent unautomatable backstop — the human watching the terminal is itself a guardrail against the meta-oracle problem above. Retiring it may be the actual mistake.

5. **Adversarial provider behavior / cross-provider collusion-of-error.** The ceiling is multi-provider for diversity, but two providers can share the same training-induced blind spot and *agree* on a wrong reproduction, manufacturing false consensus. None addresses correlated error across the "diverse" critics.

---

## 4. Synthesis — what I would actually ship

The two others are right that **execution-backed evidence is the missing lane** and that Opus slightly under-weights it. I am right that **the floor makes findings *verifiable*, not execution *safe*** and that the **ratchet, ungated, poisons the floor**. Gemini-Pro is **flatly wrong** on `run_scratchpad`-in-current-cage and that proposal must not ship.

### Ship in this order:

**1. Wire the existing `run_test` cage into `pull_critique.py` — trigger-only.**
*Guardrail:* operator-authored argv mapped by `command_id`; `shell=False`; agent can only trigger, never author or select arbitrary nodeids; servant captures raw exit+output as the finding artifact. This closes the literal 0.22.0 gap.

**2. `get_diff` (raw, deterministic) + deeper multi-turn read-only probing budget.**
*Guardrail:* raw unified diff via byte-equality servant; turn/token caps **set per-set by the operator, not by a hardcoded constant**; read-only. This is the cheapest, safest catch-up lever and addresses CRUX 2 from the thoroughness side first.

**3. Evidence-tiered findings schema: EXECUTED / ASSERTED / HYPOTHESIS, orchestrator-tagged.**
*Guardrail:* the *orchestrator*, never the agent, applies the tag; EXECUTED requires a servant-captured transcript (pinned ref, command_id, exit, output hash). No transcript ⇒ auto-downgrade to ASSERTED. **Plus the missing piece:** an EXECUTED finding must demonstrate the failure through an existing entrypoint/contract, not an agent-built harness — guards the meta-oracle problem.

**4. Constrained test *selection* (not authoring) — `run_test_subset` over an operator-vetted target set.**
*Guardrail:* selection from an explicit allow-list of test targets vetted to be network-free and fixture-safe; **not** an open pytest `-k`/nodeid grammar. This resolves CRUX 4 conservatively: select, don't author, and only within a vetted set.

**5. Floor-promotion ratchet — gated by quality, not just direction.**
*Guardrail:* a ceiling finding produces a *candidate falsifier artifact*, never an auto-merge. Admission requires: fails-on-old, passes-on-fixed, **drives a public contract (not an incidental string/timing), survives an N-run flake check, and carries human sign-off.** This fixes the poisoning hole all three left open.

**6. Close-out re-run of EXECUTED findings — with a flake policy.**
*Guardrail:* re-run uses N-run majority before any "mismatch ⇒ void + integrity flag" fires, so the integrity machinery cannot falsely accuse an honest critic on a flaky test.

**7. Keep the manual terminal-watching run as a permanent periodic backstop**, not a process to be fully retired. Build Opus's seeded-defect coverage harness to *measure* the gap — but use it to decide manual *cadence*, not manual *elimination*. The human watching the terminal is the only current defense against a valid-looking invalid probe.

**Deferred, with an explicit decision forced (CRUX 1):** model-authored author-and-run probes behind a real OS sandbox (rootless container + network namespace + read-only repo mount + scratch + resource caps). I will not park this vaguely "after the sandbox." Decision required now: **is the OS sandbox funded?** If yes, schedule it. If no, accept on the record that the automated ceiling is permanently capped below the manual ceiling on novel-reproducer bugs.

### The one thing I refuse to do:

**Execute model-authored code in the current `run_test` cage** (Gemini-Pro's `run_scratchpad`). The architecture's own threat model states this cage isolates a *trusted* command and that a hostile command can escape. Model-authored code is untrusted by definition; "no network + 5s timeout" are resource caps, not isolation. The operator's thesis — "small well-described residual ⇒ expanded capability is safe" — is precisely the rationalization that leads here, and it is a category error: a small *defect* domain says nothing about the *action space* of an interpreter running agent-authored bytes. Containment comes from the sandbox, never from the floor.
