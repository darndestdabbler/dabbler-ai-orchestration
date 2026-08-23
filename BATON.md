# BATON: solution decomposition — direction proposed, experiment designed and half-built

**Date:** 2026-08-23
**From:** Claude Opus 5 (1M context), on `design/solution-decomposition`
**To:** the next session, and Sol
**Status:** Both repositories clean and pushed. Nothing in flight. Two items
need the operator; one needs the work computer.

---

## TL;DR

The project's defining objective changed: from decomposing **the work** that
produces a solution to decomposing **the solution itself**. That direction was
proposed, reviewed twice by GPT-5.6 Sol, corrected against both reviews, and is
now backed by a pre-registered experiment that can falsify it.

Four erasure defects in the verdict parser are fixed. An offline transport means
the framework runs with no API keys. The experiment's apparatus is built and
green on this laptop.

**The one thing to understand before touching anything:** the operator has set
aside the size constraints for the duration of the rebuild —
`docs/operator-decisions.md` is the governing record, and `AGENTS.md` now points
at it. A reviewer reading only `AGENTS.md` reported this work as violating rules
that were already lifted, which was a fair reading of what the repository said.
Read the decisions file first.

## The two repositories

| Repo | Branch | Head | State |
| --- | --- | --- | --- |
| `dabbler-ai-orchestration` | `design/solution-decomposition` | `9a0cd749` | clean, pushed, 695 tests pass |
| `dabbler-ai-orchestration-eval` | `main` | `b266b07` | clean, pushed, 54 Java tests pass |

`spike/thin-run-core` was pushed to `b47e69a4` and is the branch point.

## What changed in the orchestration repo

**`docs/solution-decomposition-direction.md`** — the proposal. Components with
real contracts, a Solution Component Explorer that hangs the existing work
breakdown under each component, a cross-repo project manifest, API gating, IDD,
and isolation over reuse. Section 7 records what was rejected and why; section 9
holds six open questions.

**`docs/decomposition-experiment-design.md`** — the experiment. Pass criteria
are fixed in advance so the result cannot be interpreted into a success.

**`docs/operator-decisions.md`** — new, and load-bearing. Constraints set aside;
what is explicitly *not* set aside (the machine record, verdict provenance, key
handling, one-test-per-behavior); solution decomposition as the objective;
isolation over reuse; IDD; findings never discarded.

**Four erasure paths closed** in `ai_router/verdict.py`. The first pass fixed
two and described the problem as solved; review of that pass found two more,
both real. A NITS bullet declaring `Severity: Major` was still recorded as
minor, and a `VERIFIED` response whose concern was a plain bullet parsed to
nothing at all. All recording paths now share one field parser.

**An offline transport** (`ai_router/transports/offline.py`) serves scripted
responses from a directory: no network, no credentials, no spend. No default
location, so it cannot be selected by accident; exhaustion raises rather than
replaying into a later round; results stamped `simulated: true`.

## The thing to show staff

`study-artifacts/decomposition/tooling/README.md` in the eval repo, and the
reactor beside it. This is the part that is finished, demonstrable, and
copyable into a real repository.

Two gates on a component, both under ordinary `mvn verify` — no second command,
no framework to install:

| Gate | Answers | Blind to |
| --- | --- | --- |
| API baseline (`api-baseline.txt`) | "What may I call?" | Behaviour under a stable signature |
| Contract scenarios (`elr-contracts`) | "What happens when I call it?" | Nothing about shape |

The second gate is the one the whole direction was missing, and both reviews
said so. It is now built, generic across components, and **verified by breaking
the provider and watching it fail** — `tooling/verify-contract-kit.sh` treats a
canary that unexpectedly passes as a failure, because a green build that means
nothing is the outcome worth catching.

What makes it plausible for staff to adopt: scenarios are plain JSON files
authored against a normal parameterized JUnit test; declaring an intended API
change is one command and a reviewable diff; failures name the scenario, the
path, expected, actual, and why anyone cared. One runner drives both the
de-identifier (returns a message) and the validator (returns errors), so it is
not a one-off.

The mock lives in the contract artifact and runs the same scenarios as the real
provider — that is what stops a mock from being a wish that comes due at the
mock-to-real step.

## What is in the eval repo

`study-artifacts/decomposition/`:

- **`CONTRACT-FORMAT.md`** — the shape of a contract, and deliberately none of
  any component's content. The arm authors that during T1. Pre-writing the
  scenario that catches T4 would measure the author's foresight instead of the
  discipline.
- **`TASKS.md`** — T1–T5, fixed before either arm runs. Every field checked
  against the corpus. T4 uses `PID.mothersMaidenName` (9 of 30 messages) rather
  than `patientName` (30 of 30); `PID-19` was rejected because the corpus never
  populates it and the test would have been vacuous.
- **`harness/ledger.py`** — append-only measurement. Refuses an unpriced model
  by name, and refuses a dispatch row whose snapshot directory does not exist,
  because three earlier studies became unreplayable exactly that way.
- **`reference/java/`** — components 2–4 plus `elr-contracts`, **54 tests**,
  Maven on Java 21.
- **`tooling/`** — the contract kit and its canary script. See above.

## Verified, not assumed

- The handover package compiles under Java 21 on Linux, and all 30 corpus files
  match `corpus-manifest.json` at 356 segments. The `.gitattributes` `-text`
  rule survives a fresh clone.
- The ledger's arithmetic matches the real Sol call: 30,292 in / 10,506 out
  prices to $0.4666, which is what the API reported.
- **T4 and T5 were verified by breaking the reference and watching the tests
  fail**, not by reading them. Removing the `mothersMaidenName` masking fails
  exactly one test and names the leaked surname. Moving the control-ID capture
  after de-identification fails two and shows the pseudonym where the sender's
  ID belongs.

## Open items

### For the operator

1. **Push `hl7-pipe-parser`** from the work computer, or confirm deserializer
   accuracy is deferred to Phase 2. The scorer *generates* reference dumps by
   running that parser; `report.json` places it at `D:\Projects\hl7-pipe-parser`
   and it is not on GitHub. `ct-dph-hl7` was checked and **rejected** as a
   substitute — its `model251` has diverged, and `oru_r01/ElrMessage`, the type
   `CandidateParser.parse` returns, is absent. This blocks accuracy and the
   claimed comparability to the HL7 study; it does not block the experiment's
   own pass criteria, which are spend, escaped defects and context read.
2. **Approve the first dispatch.** No API money has been spent on the
   experiment. The interim budget is $20 per provider.
3. **IPv6 is still broken on this network** — the router advertises a default
   route that drops everything. `apt` fell back to IPv4 on its own; Maven needs
   `-Djava.net.preferIPv4Stack=true`, which is how it is invoked here. The
   per-SSID fix is `nmcli connection modify Theholdeninnguest ipv6.method
   disabled`.

### For Sol

4. **§6.6 was wrong in a specific way, and the correction is better than the
   proposal.** "Block only on a concrete failure case" is already in the house
   prompt — `prompt-templates/verification.md:59-79` requires Violation, Impact
   and Evidence, and says a finding with no stated scenario is Minor by
   definition. Nothing in code enforces it; `verdict.py` blocks on parsed
   severity alone. The work is enforcement, not a new rule. Sol adds: widen the
   standard, because races, data-loss windows and security holes often have no
   compact input/output triple.
5. **Adjudication already exists** at `verify.py:1010-1303`, and is stronger
   than what the proposal described — it excludes the author's provider *and*
   every prior verifier's, and fails closed with no third provider. Extract it;
   do not rebuild it.
6. **The Explorer cannot show team state.** `.dabbler/` is git-ignored
   (`.gitignore:8`) and the record is per-repository. The tree mockup shows
   another developer's in-flight work. Either say MVP status is local-only, or
   design a shared event source.
7. **An existing module manifest was missed.** `ai_router/modules.py` calls
   itself "the one declaration of what a module is," with a TypeScript reader
   watching `docs/modules.yaml` (the file is not checked in; the mechanism is
   built). State whether the project manifest replaces or extends it.

### For the next session

8. **The pilot is the real test, and it is not done.** Sol's stated risk is
   worth quoting: the kit proves a provider matches its scenarios, but cannot
   prove the scenarios match what a consumer actually needs. The same author can
   encode one misunderstanding into the mock, the provider and the scenarios and
   get a confident green. The validation is whether a Java team can author
   useful scenarios from its own calling code without reading provider
   internals. If that fails, keep japicmp and ordinary JUnit and drop the rest.

9. **The contract deliberately omits `PID-6 mothersMaidenName`.** The reference
   de-identifier masks it and its unit tests require it — that is the answer
   key. It is kept out of the contract artifact because the experiment uses that
   exact field to test whether contract discipline *produces* such coverage, and
   the artifact is what teams copy. Do not helpfully fill the gap.

10. **The .NET stack is unbuilt.** SDK 10 is in Ubuntu's own repositories as
   `dotnet-sdk-10.0`; deferred deliberately, since one stack proven end to end
   demonstrates the protocol and the second is replication.
11. **A verifier result schema** would end the erasure class rather than its
   instances. Every defect so far has been a prose-parsing defect and every fix
   has been shape-specific. Question 6 in the direction document.
12. **The experiment's runbook** — dispatch settings, stop conditions, what to
    report — is not written. `study-artifacts/hl7/RUNBOOK.md` is the model.

## Reading order

1. `docs/operator-decisions.md` — what is in force. Read this first.
2. `docs/solution-decomposition-direction.md` — the direction, §7 and §9.
3. `docs/decomposition-experiment-design.md` — how it gets falsified.
4. `../dabbler-ai-orchestration-eval/study-artifacts/decomposition/` — the
   apparatus, `CONTRACT-FORMAT.md` §1 first.
