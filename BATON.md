# BATON: the seven-step workflow, the contract kit, and what is still unproven

**Date:** 2026-08-24
**From:** Claude Opus 5 (1M context)
**To:** the next session
**Status:** Both repositories clean and pushed. Nothing in flight.

---

## Read this first

The operator restated the whole direction in his own words, and **his framing
supersedes the earlier documents**. It is clearer than what preceded it. Do not
reintroduce the old vocabulary.

Seven steps, in order. Steps 1–6 are one person working with AI; step 7 is where
a team works in parallel.

1. **Plan and design** — developer explains the objective and supplies documents;
   AI works interactively until the objective is genuinely clear. Two AI
   reviewers from two different vendors. Developer approves.
2. **Decompose into components** — AI proposes candidate decompositions in plain
   language with diagrams, recommends one, drawing on published decomposition
   guidance. Cross-reviewed. Developer approves.
3. **Formalize the contracts** — public methods for libraries, endpoints for
   services. Cross-reviewed. Developer sees them and may object, but this does
   **not** block: no approval gate.
4. **Build the mocks** — conforming to the contracts. Cross-reviewed.
5. **Build the integration against the mocks** — cross-reviewed.
6. **Build the real components** — parallel work, one developer per component.
7. **Fold contract changes back** — when building the real thing proves the
   contract wrong. Returns to step 3 and names everyone affected.

Step 7 is my addition, not the operator's. His list numbered 1, 3, 4, 5, 6, 7 —
six items — while calling it seven steps. I read the gap as the feedback loop,
which he had already not objected to. **Confirm this with him** rather than
treating it as settled.

Steps 1–6 get one work breakdown; step 7 gets a work breakdown per component.
That maps directly onto the Solution/Component Explorer.

## What the operator said about contracts

Developer review of contracts is wanted, **provided a contract is more than
signatures**. It must state restrictions and expectations that a signature
cannot carry — on arguments and otherwise — and each of those should become a
test. Contracts must be documented systematically, in tables and diagrams, so a
developer can digest them quickly.

## The deliverable he now has

**https://claude.ai/code/artifact/b0ba9206-1cb5-4d36-bfe6-2c4dcb61ca99**

An orientation page for developers with two working simulations: a step-through
of the seven steps showing who holds the work at each moment, and a Solution
Explorer you can scrub from empty project to finished, including a contract
change that flags affected consumers before their teams are hit. Colour carries
one meaning throughout — spruce for the authoring AI, slate for the two
reviewers, amber for the developer.

To update it, republish from this conversation, or pass that URL as `url` from
another. Publishing without the URL creates a second artifact.

## What is built and working

In `dabbler-ai-orchestration-eval`, under `study-artifacts/decomposition/`:

- **`reference/java/`** — a Maven reactor on Java 21. Four components plus
  `elr-contracts`. 54 tests. `mvn verify` runs everything.
- **`tooling/`** — the contract kit and `verify-contract-kit.sh`, which breaks
  the provider two ways and requires each break to be caught, treating a canary
  that unexpectedly passes as failure.
- **`pilot/`** — a 45-minute exercise; see below.
- **`harness/ledger.py`** — append-only measurement for the experiment.
- **`CONTRACT-FORMAT.md`**, **`TASKS.md`** — the experiment's apparatus.

Two gates on a component, both under ordinary `mvn verify`: an API baseline read
from compiled classes, and behaviour scenarios as neutral JSON executed by a
parameterized JUnit test. Neither is sufficient alone — the API gate is blind to
behaviour changing under a stable signature, which is the failure mode that
matters most for a black box.

## What is NOT proven, and must not be claimed

1. **That a consumer can write a good contract.** The kit proves a provider
   matches its scenarios. It cannot prove the scenarios match what a consumer
   needs — one author can encode a single misunderstanding into the component,
   the mock and the scenarios and get a confident green. `pilot/` exists to test
   exactly this and **has not been run**. If the operator misses most of the
   breaks, the honest response is to keep the API baseline and ordinary JUnit
   and drop the rest.
2. **That decomposition pays.** The HL7 study does not support it — it ran on
   one component and never varied decomposition. The experiment in
   `docs/decomposition-experiment-design.md` is designed and unrun.
3. **Anything about .NET.** Not installed on this laptop; `dotnet-sdk-10.0` is in
   Ubuntu's own repositories when needed.

## Open items

### For the operator
- **Run `pilot/`.** One hour. It is the highest-value unknown.
- **Push `hl7-pipe-parser`** from the work computer, or confirm deserializer
  accuracy is deferred. `ct-dph-hl7` was checked and rejected as a substitute —
  its `model251` has diverged and `ElrMessage` is absent.
- **Confirm step 7.**

### For the next session
- **Write the contract documentation format** — tables and diagrams, per the
  operator's instruction. This is specified and unbuilt, and it is what makes
  step 3's review possible.
- **Find and cite the decomposition guidance** for step 2. Parnas 1972 (*On the
  Criteria To Be Used in Decomposing Systems into Modules*) is the one that
  matters — decompose to hide decisions likely to change, not by processing
  steps. Then DDD bounded contexts and shared kernel, ports and adapters,
  functional core / imperative shell, vertical slices, Conway's law.
- **The `.dabbler/` record is per-repository and git-ignored** (`.gitignore:8`),
  so the Explorer cannot show another developer's work. Either state that MVP
  status is local-only, or design a shared event source.
- **`ai_router/modules.py` already declares a module manifest** with a
  TypeScript reader watching `docs/modules.yaml`. State whether the component
  manifest replaces or extends it.
- **Adjudication already exists** at `verify.py:1010-1303` and is stronger than
  what the direction document described. Extract, do not rebuild.
- **§6.6 of the direction document is wrong in a useful way.** "Block only on a
  concrete failure case" is already in `prompt-templates/verification.md:59-79`.
  Nothing enforces it; `verdict.py` blocks on parsed severity. The work is
  enforcement, not a new rule.

## Two things a next session must not undo

- **The contract deliberately omits `PID-6 mothersMaidenName`.** The reference
  de-identifier masks it and its unit tests require it — that is the answer key.
  It is kept out of the contract artifact because the experiment uses that exact
  field to test whether contract discipline produces such coverage. Do not fill
  the gap.
- **`docs/operator-decisions.md` governs.** Size constraints are set aside for
  the rebuild. A reviewer reading only `AGENTS.md` reported this work as
  violating rules already lifted.

## Environment

Ubuntu on a vacation laptop until midweek. Java 21 + Maven work; Maven needs
`MAVEN_OPTS="-Djava.net.preferIPv4Stack=true"` because the router advertises a
dead IPv6 route. No .NET, no Node — the VS Code extension cannot be built here.
Git identity is set per-repo, not globally.

## Style note that cost two rewrites

The operator asked twice for plain language, and both times the first attempt
failed. What worked: say what a thing is and why it exists before any detail,
use short sentences, and never make a reader resolve a path or a term to
understand the first paragraph. He is a developer and a manager; he is not
short of context, he is short of patience for documents that make him assemble
the point himself.
