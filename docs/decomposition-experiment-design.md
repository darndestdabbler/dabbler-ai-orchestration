# Does solution decomposition pay? — experiment design

**Status:** design, not yet run.
**Date:** 2026-08-23
**Runs in:** `dabbler-ai-orchestration-eval` (private; see §11).
**Tests:** the hypothesis in `docs/solution-decomposition-direction.md` §4.1.

---

## 1. What is being tested, and what is not

The direction document bundles three claims. They are separable, they have very
different evidence behind them, and adopting them together would make a result
uninterpretable. This experiment tests **claim 1 only**:

| | Claim | Evidence today | Tested here |
| --- | --- | --- | --- |
| 1 | Decomposing the **solution** into contract-bounded components makes later AI work cheaper and more reliable | **None.** The HL7 study ran on one component and never varied this | **Yes** |
| 2 | Reviewing detailed instructions before delegated implementation improves the result | The HL7 study, §2 — its strongest result | No — already supported |
| 3 | A component Explorer improves the developer's workflow | None | No — usability, not cost |

Claim 3 needs task-completion and preference measurement with real developers,
not model spend. Keep it out.

## 2. Two design decisions that determine whether the result means anything

### 2.1 The comparator is manual decomposition, not a monolith

The obvious experiment — decomposed versus monolithic — would produce a large,
flattering, useless number. It is not the choice anyone faces. The operator's
staff **already** decompose solutions into libraries; they do it outside the
framework, in separate repositories and separate editor windows.

So the comparison is:

- **Arm M (manual)** — components in separate repositories, boundaries chosen by
  the author, no contract artifact, no API gate, no shared view. Today's
  practice.
- **Arm F (framework)** — the same components, with a declared contract
  artifact per component, an API-surface gate, and IDD sequencing
  (contracts → integration against mocks → real implementations).

Both arms are decomposed. What varies is whether the boundaries are
**operationalized** — whether a machine holds anyone to them.

### 2.2 The measurement is on the follow-on work, not the first build

Contracts cost money up front. Arm F is **expected to be more expensive at
T1**, and a first-build-only experiment would report that as a loss and stop.
The claim is that a contract-bounded component is cheap on every *later*
session, which means the experiment must contain later sessions.

This is the design's whole point. T1 pays; T2–T5 collect.

## 3. The fixture

An electronic lab reporting pipeline — the operator's domain, mechanically
checkable, and adjacent to the HL7 study so its single-component costs give a
sanity baseline.

**Built in this pass:**

| # | Component | Owns | Why it is in the first pass |
| --- | --- | --- | --- |
| 1 | `hl7-deserializer` | HL7 v2 → object model | The richest boundary: a whole object model crosses it |
| 2 | `hl7-validator` | Rules over the object model → structurally valid HL7 error/ACK | The output is a **wire contract** — exact text is correctness |
| 3 | `elr-deidentifier` | De-identify the object model for CDC submission | **Behavior-heavy, signature-stable.** Carries T4 |
| 4 | `elr-pipeline` | Composes 1–3 | The integration component; a component whose dependencies are components |

**Deferred to the funded run**, with reasons rather than silence:

- `mllp-listener` — needs socket fixtures. Real, but it tests transport, not the
  thesis.
- `elr-persister` — needs a database. Same.

Both enter the $150 run, where the pipeline becomes end-to-end.

**Both stacks, as two independent solutions.** The full set is built once in
Java and once in .NET. This is not duplicated effort for its own sake — it
exercises both API extractors, and two isolated single-stack solutions is
exactly what `docs/operator-decisions.md` prescribes. It also gives every result
a within-experiment replication, which the HL7 study explicitly lacked.

No cross-language RPC layer. Inventing one would test a wire protocol nobody
asked for.

## 4. The contract artifact

Arm F's contract is the thing under test, so it must be defined before anything
runs. A public API baseline **alone is not a contract** — it detects a changed
signature and proves nothing about behavior. Each component declares:

1. **Typed surface** — the public API baseline, extracted from the built
   artifact. .NET: the public API analyzer's `PublicAPI.Shipped.txt`. Java:
   `javap` over the compiled classes, compared with japicmp or Revapi.
2. **Executable behavior** — consumer scenarios as runnable tests: representative
   inputs, expected outputs, error policy, ordering and nullability where they
   matter.
3. **Fixtures** — the message corpus and expected object-model state.

**The rule that makes the contract real:** the mock and the real component run
**the same** behavior suite, and the provider's build runs it too. A mock that
passes a suite the real component never runs is not a contract, it is a wish.

## 5. Tasks

Applied identically to both arms, in order, on both stacks.

| | Task | What it probes |
| --- | --- | --- |
| **T1** | Build all four components and compose the pipeline | Up-front cost. Arm F expected to be **more** expensive |
| **T2** | Additive change — a new field through deserializer → pipeline | Does the gate stay quiet when it should? |
| **T3** | Breaking change — restructure something in the deserializer the validator depends on | Is the break found at the seam, or at integration? |
| **T4** | **Behavioral change, unchanged signature** — the de-identifier stops masking a field | **The decisive test.** See below |
| **T5** | Integration debug — a defect that only manifests when composed | Whether black boxes hold under debugging |

### T4 is the test that can falsify the mechanism

The de-identifier stops masking a field. Not one signature changes. **API-shape
gating cannot see this**, by construction — that is the point of including it.

The question is whether the contract's behavior suite catches it, and how much
that suite cost to maintain across T1–T3. If nothing catches T4, then §6.3 of
the direction document is insufficient as written and the contract model must
carry executable behavior — which is exactly the objection review raised against
it. Either result is worth the money.

T4 also has a real-world edge: an unmasked identifier reaching CDC is a
disclosure incident, not a test failure.

## 6. What is measured

Per task, per arm, per stack:

- **Model spend** — total, and split by seat (author / implementer / verifier).
- **Context read** — input tokens. The mechanism claim is *smaller context per
  unit of work*; this measures it directly rather than by proxy.
- **Operator minutes** — human time, including adjudication.
- **Elapsed wall clock.**
- **Accuracy** — pooled correctness against a reference parse, as in the HL7
  study, so the numbers are comparable.
- **Escaped defects** — found only at integration or later. The number
  decomposition is supposed to reduce.
- **Contract revisions** — how often a contract changed after being agreed.
  High revision counts falsify the "fix the target before implementation"
  claim in §6.4.
- **Verification rounds** and **findings recorded versus blocking.**

## 7. Pass criteria, stated in advance

Written before the run so the result cannot be interpreted into a success.

**The thesis is supported if**, summed across T2–T5 and both stacks:

- Arm F's total spend is **at least 25% below** Arm M, **and**
- Arm F's escaped defects are **no worse**, **and**
- Arm F's context read per task is lower — the mechanism, not just the outcome.

**The thesis is falsified if** Arm F costs more across T2–T5, or catches no more
escaped defects. T1 being more expensive in Arm F is **expected and is not a
failure**.

**The mechanism is falsified — separately from the thesis — if** T4 escapes Arm
F. That result stands even if every cost number favors Arm F.

**One run per cell is not enough** and the HL7 study says so: it saw 0.032 and
0.426 on identical configuration. Two stacks give one replication. Report every
cell individually; report peak and terminal separately, per that study's §6.
Do not average away a regression.

## 8. Phase 1 — now, on vacation

**Ceiling: $20 per provider.** Claude Code does the building on the operator's
existing subscription. The API budget is spent only where a *different provider*
is structurally required.

1. Clone the eval repo; add an experiment area beside the HL7 study.
2. Build the four-component fixture in both stacks, with reference outputs and
   the message corpus. This is the bulk of the work and it costs no API money.
3. Define the contract artifact format (§4) concretely for both stacks: the
   exact extraction commands, normalization rules, and baseline file layout.
4. Author T1–T5 as scripted, replayable task definitions, so the funded run
   executes rather than improvises.
5. Build the measurement harness — per-seat spend, context read, rounds,
   escapes.
6. **Dry-run the entire protocol end to end using the offline transport**
   (`ai_router/transports/offline.py`). Scripted verifier responses, no network,
   no credentials, **zero spend**. This is what the transport was built for, and
   it proves the harness before any money moves.
7. Spend a small amount of real API — target under $10 total — on a handful of
   live cross-provider verification calls, confirming the live path matches what
   the offline dry run produced.

**Phase 1 succeeds when the funded run is a matter of execution**, not design.

## 9. Phase 2 — the funded run

**Ceiling: $150**, on the work computer. Add `mllp-listener` and
`elr-persister`, run every cell, and report against §7.

## 10. Threats to validity

- **Author advantage.** Arm F is designed by the people who believe in it. Fix
  the tasks and the reference outputs before either arm runs, and do not touch
  them afterward.
- **Fixture too easy.** HL7 parsing scored ≥0.99 in most cells. If both arms
  score near-perfect, cost is the only signal and escaped defects go
  unmeasured. T4 and T5 exist to carry difficulty; keep them hard.
- **The contract suite is doing the work, not the decomposition.** Plausible,
  and worth knowing. If T4 is caught by the behavior suite alone, the honest
  finding is that *executable contracts* pay — which is a narrower and more
  useful claim than "decomposition pays."
- **Small n.** Two stacks, one run per cell. Report cells, not averages.
- **This is not a UI experiment.** Nothing here supports or refutes claim 3.

## 11. Prerequisites

1. **GitHub credentials on this machine.** `dabbler-ai-orchestration-eval` is
   private and cannot currently be cloned here — `gh auth login`.
2. **Java and .NET toolchains.** Neither is installed on this laptop. Both are
   available from Ubuntu's repositories.
3. **The API keys**, which are in place.
4. **IPv6 disabled on this network**, or package installs will hang.
