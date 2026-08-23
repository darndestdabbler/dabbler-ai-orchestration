# Solution decomposition — proposed direction

**Status:** proposal, for critique. Nothing here is built except where §8 says
so.
**Date:** 2026-08-23
**Branch:** `design/solution-decomposition`, cut from `spike/thin-run-core`
at `b47e69a4`.

---

## 1. Background

`dabbler-ai-orchestration` is an AI-led coding-session framework: a Python
package (`ai_router`) that routes work to models, runs a session lifecycle,
and enforces cross-provider verification, plus a VS Code extension that
displays it.

Three things arrived close together and, taken together, argue for a change
of direction rather than another increment.

**The Phase 0 slice measured out to roughly break-even.** The thin run core
(`docs/run-core-blueprint.md` §§3–9, §11) was built, reviewed, and
remediated. Measured against what its cutover unconditionally deletes, it
came to 5,258 lines added against 5,748 deleted — 8% smaller. The blueprint's
own §12.17 says a replacement that is not markedly smaller has falsified its
thesis. `docs/run-core-phase0-report.md` §5 carries the numbers.

**The operator suspended the size constraints.** LOC budgets, the module
ceiling, and the test budget are set aside for the duration of the rebuild,
to be reapplied against a working baseline afterward. That resolves §12.17 by
removing the test rather than passing it — and it reframes the question. Size
was a proxy for "did the new core really replace the old one, or does it sit
beside it?" That question was answered separately and passes:
`tests/test_runcore_independence.py` proves the core imports and runs with the
deletion-row modules blocked at `sys.meta_path`.

So the rebuild is sound, and the interesting question is no longer whether it
is smaller. It is whether it is aimed at the right thing.

**The HL7 study reported.** `hl7-study-results.md` measured verification
across engines and prompts on an HL7 v2 parsing task in the sibling
`dabbler-ai-orchestration-eval` repository. Its findings are in §4.

## 2. Context

- **Two teams, two stacks.** One Java team, one .NET team. Support for both
  is mandatory from the first release, not a later port.
- **Staff already decompose solutions into libraries — outside the
  framework.** The practice exists; the tooling does not know about it.
- **The status quo for a developer is N windows.** VS Code defaults to one
  folder per repository, so a solution built from six components means six
  windows, plus a seventh repo for integration, and no view that shows the
  whole thing. Nobody can see which components exist, what they expose, or
  who breaks when one of them changes.
- **The operator's two success criteria.** (a) Developers get over the finish
  line faster and cheaper. (b) Developers *want* to use it, because the
  architecture is simple enough to understand and intuitive. (b) rules out
  ceremony as firmly as (a) rules out sloppiness — a correct mechanism people
  route around has failed.

## 3. The shift, stated precisely

An earlier version of this framework already had decomposition as a
first-class goal. It decomposed **the work needed to produce a solution** —
sessions, steps, task breakdown.

This proposal is about decomposing **the solution itself** — components,
libraries, published artifacts, APIs.

The distinction is not pedantry, and every document describing this shift
must state which kind it means. Work decomposition is spent once: you
schedule the effort, you do it, the breakdown is consumed. Solution
decomposition keeps paying — a well-cut component is cheap on every future
session, forever. Conflating the two is how the old session-scheduling
machinery gets rebuilt under a new name while the durable half never gets
built.

**Both halves of solution decomposition are load-bearing:**

- **(a) Each component individually** has a clear objective and needs little
  AI context to build.
- **(b) The integration collectively** also has a clear objective and needs
  little AI context — because components are true black boxes behind
  well-defined interfaces, so integration reasons over contracts, not
  internals.

(b) is the half that gets lost. Decomposition that optimizes only (a)
relocates the complexity into integration rather than removing it. A boundary
is correct only if a later session can consume the component without reading
inside it.

## 4. Research and evidence

### 4.1 The HL7 study

The task was one small library — an HL7 v2 parser — with a clear objective
and a mechanical test. Results relevant here:

- **Reviewing the plan was the study's strongest single result.** It moved
  the same defect, judged by the same model, from unsubstantiable to
  Critical, and halved implementer cost in all four cells.
- **The house prompt mattered more than engine tier.** Three of four weak
  cells went from 0.03–0.43 accuracy to 0.99+ on the prompt alone.
- **A verifier found the central defect and filed it as speculative.** Under
  the code as it stood, that run would have finished `VERIFIED`,
  `blocking_findings: 0`, with no record the finding existed. See §8.

**The generalization caution is the operator's, and it is correct:** HL7
parsing was small, bounded, and mechanically testable. Domains with UI,
complex workflows, or the shape of this framework itself will do worse.

**But the corollary is the point of this proposal.** Those success conditions
— small scope, clear boundary, unambiguous done-ness — are not luck. They are
properties you can manufacture, and decomposition is the manufacturing
process. The study did not only measure whether verification works; it
described the conditions under which AI work is cheap. Verification catches
what went wrong. Decomposition keeps the unit small enough that less goes
wrong. The second is worth more.

This conflicts with the current blueprint, which excludes plan machinery from
`fast`/`verified` (§5.4, §14) and lists `plan_review.py` for deletion (§13).
The evidence for investing before implementation is stronger than the
evidence for anything the run core does after it. **Resolve toward the
study.**

### 4.2 The severity-inflation incident (v1)

v1 hit runaway verification rounds — routinely 7+, once over 15. The response
was to cap rounds and make `minor` findings non-blocking. Almost immediately,
**95%+ of findings came back marked MAJOR.**

No intent need be assumed. The verifier both writes the severity label and
wants its findings acted on, so pressure moved to the label. The general
lesson: **any cost-control rule keyed to a field the verifier authors will
drift.** The lever was placed in the hands of the party it was meant to
constrain.

### 4.3 Prior art for the sequencing in §6.4

The operator's "IDD" — integration-driven design — has no single industry
name but three well-established components: the **walking skeleton**
(Cockburn) for thin-end-to-end-first; **consumer-driven contracts** (the Pact
ecosystem) for the consumer defining what the provider must satisfy; and
**outside-in / London-school TDD** for mock-first construction. Pact's
tooling targets HTTP and messaging and will not drop onto in-process
libraries unchanged, but the concept transfers.

### 4.4 Prior art for API gating

Both target ecosystems already solve public-API-surface gating, and neither
requires parsing source — both compile to a typed artifact whose public
surface can be read directly.

- **.NET:** the public API analyzer, with checked-in
  `PublicAPI.Shipped.txt` / `PublicAPI.Unshipped.txt` baselines.
- **Java:** `javap` in the JDK for extraction; japicmp or Revapi for baseline
  comparison in a Maven build.

Python and TypeScript would have been the hard cases. The two languages
required are the two that make this straightforward.

## 5. Objectives

1. **Decompose solutions into reliable, black-boxable components** with
   well-defined interfaces — satisfying both (a) and (b) of §3.
2. **Show the whole solution in one place**, across repositories, without
   becoming an IDE.
3. **Make a black box actually black** — a component cannot quietly change
   what it exposes.
4. **Keep verification honest and bounded** — record everything, block on
   little, never erase.
5. **Beat the status quo**, which is N windows and no shared view. This bar
   is low and it is the real bar. An improvement over that is a win; perfect
   is not required.

## 6. Proposed direction

### 6.1 The Solution Component Explorer

Reconceive the Work Explorer. Today it shows what is being done; work floats
free of what it is work *on*. Make components top-level, and hang the
existing work breakdown underneath, so every session has an address.

```
SOLUTION  Electronic Lab Reporting
├─ ▣ hl7-parser            v1.4.2  ✓   3 consumers   ● 1 in progress
│    ├─ ⧉ Interface — 12 public members
│    ├─ ▾ In Progress
│    │    └─ 139-seat-catalog-refresh
│    │         └─ Session 3 — Sam — verification, round 2
│    └─ ▸ Completed (4)
├─ ▣ terminology-mapper    v0.9.0  ⚠ you're pinned to 0.8.1
│    └─ ⧉ Interface — 7 public members
├─ ◈ elr-pipeline  (integration)
│    ├─ ⧉ Composition
│    └─ ▸ Not Started
└─ ⌂ Solution-wide work
```

Design decisions:

- **Not a second file tree.** VS Code already does files. What hangs under a
  component is its contract and state: interface, version, green/red,
  consumers, in-flight work.
- **"Consumers" is the highest-value row.** Who breaks if I change this is
  invisible today and stays invisible in the N-windows world. It is also what
  makes people brave enough to change a component at all.
- **Only non-empty status folders render**, In Progress first, with a summary
  badge on the component row so the whole solution reads without expanding.
- **Lazy loading; Completed rolls up to a count** and loads on expand. No
  archiving for MVP.
- **Solution-wide work gets a real node.** Work that spans components —
  an API change plus the three consumers it breaks — otherwise has no home
  and becomes unfindable. And if that node keeps filling up, the seams are
  wrong: the tree doubles as a decomposition diagnostic. So does a component
  accumulating dozens of completed sets, which says the box has been reopened
  repeatedly or is accreting scope.
- **Interface opens an editor tab, not a popup.** It is the only node serving
  the *consumer* of the box rather than its builder, so it must survive being
  read side-by-side with calling code.
- **Group-by is a pivot, not a second tree.** A view-title toggle switches
  between grouping by component and grouping by status, over the same data.

### 6.2 The project manifest — not an IDE

The cross-repo capability is a **manifest**, not a platform. One file naming
each component: its repository, artifact coordinates, interface location, and
the version this solution pins.

Two facts keep this cheap:

- **VS Code multi-root workspaces already display several repositories at
  once.** One folder per repo is a default, not a limit. The framework
  generates a `.code-workspace` from the manifest; it does not invent an IDE.
- **Distribution is already solved.** NuGet and Maven do artifact hosting.
  The framework declares and checks the contract; it never rebuilds the
  plumbing.

**Scope line: declare and check, do not orchestrate.** The moment the
framework decides build order or propagates version bumps across repos, it is
a build system, and that is a different product.

### 6.3 Interface contracts and the API gate

A component's public API surface is a **checked-in baseline**. The build
diffs the real surface against it; if they differ and the baseline was not
updated in the same change, the build fails. Changing the API becomes a
deliberate, reviewable act instead of a side effect. Use the ecosystem tools
in §4.4 rather than inventing a mechanism.

**Local and published are both needed, for different jobs.** The local build
feeds the *gate*, catching a break while it is still cheap to reconsider. The
published version feeds the *consumer view*, which must show what other teams
actually get. Toe-stepping is prevented structurally: the gate is
per-component, its baseline lives in that component's repo, and consumers see
a change only when they bump their pin.

### 6.4 IDD — integration-driven design

1. Basic decomposition lands.
2. Operationalize it as interface contracts.
3. **Build the integration component against mocks first.**
4. Replace mocks with real implementations, gradually.

**The integration's needs are primary and drive everything else.** A required
change to the integration means upstream contracts adapt, or new components
are introduced — not the reverse.

This fixes each component's target before implementation begins, so component
work has no discovery churn and stays inside the small-context regime that
makes AI work cheap. It also exposes a wrong decomposition at the cheapest
possible moment, when the only thing built is mocks.

**Known risk:** contracts over-fitted to a premature understanding of the
integration. Do not fight it — expect early revision, treat the first
integration pass as disposable, and let the API gate make revisions *visible*
rather than prevent them.

### 6.5 Isolation over reuse (settled)

Components are isolated to their solution. Redundant implementations across
solutions are acceptable and preferred. AI reads across solutions
periodically to spot alignment opportunities, producing a **report, never an
automatic refactor**.

**Rationale:** shared libraries trade duplicated code for coordination, and
coordination is exactly the cost AI does not reduce. Implementation cost is
collapsing; coordination cost is not moving. DRY was priced against expensive
implementation; change that price and duplication starts winning.

**One boundary:** duplicate **mechanism** freely, share **meaning**
deliberately. Two solutions each with their own retry helper is fine. Two
solutions disagreeing about what a LOINC code means, or about a wire format,
a unit, or a regulatory code set, is a defect rather than redundancy. Where
divergence is a correctness bug, it still belongs in one versioned artifact.

### 6.6 Verification, rebalanced

The §4.2 incident says where the cost lever must not go. Severity becomes
honest description — recorded, never a gate — and cost is controlled by
things the verifier does not author:

- **A finding blocks only if it carries a concrete failure case** — this
  input, this wrong result. Inflating that requires inventing something the
  author can go check, which flips the incentive toward substantiation.
- **No new topics after round 1.** Rounds ≥2 review only the fix delta.
  Anything that could have been raised in round 1 and was not is recorded and
  deferred, not blocking. This kills the drip-feed that produced the
  15-round run.
- **A deferral queue separates "recorded" from "must fix now."** Honesty and
  cost only conflict while those are the same list.

The round cap remains as a backstop, not the normal stopping condition.

**Adjudication ladder**, entered only for a *blocking, disputed* finding:

1. The author supplies evidence and rationale to the verifier and requests
   the verifier's own; the verifier may reconsider.
2. A **third engine** is asked the falsifiable question — "is there a real
   failure case here; produce the failing input or refute it" — never "who is
   right." A judge refereeing a debate splits the difference.
3. The human adjudicates, last.

**The human brief is a product feature, not formatting.** Assume a reader
arriving cold, who has let AI do the dirty work, and who may not be a native
English speaker. It must be decidable **without reading the code**: what the
code should do; what the verifier says goes wrong, with the specific
input/expected/actual; the author's response; what happens if each side is
right; the choice as two plain options with consequences. Short sentences, no
jargon, no section numbers, no severity vocabulary. If a competent developer
cannot decide in two minutes, the brief failed.

## 7. Things considered and rejected

| Considered | Disposition |
| --- | --- |
| Keep tuning which severities block | Rejected. §4.2 — the label is authored by the party it constrains. |
| Cut NITS/minor findings to bound cost | Rejected. Erasure is worse than mis-severity; a wrong severity still leaves something a human can overrule. |
| A cross-repo IDE / custom editor | Rejected as scope. Multi-root workspaces plus a manifest get most of it. |
| Framework orchestrates cross-repo builds and version bumps | Rejected. That is a build system. Declare and check only. |
| Rebuild artifact hosting | Rejected. NuGet and Maven already do it. |
| Shared cross-solution component libraries | Rejected — §6.5. Coordination is the cost AI does not reduce. |
| Hand-written API documentation beside the code | Rejected. It drifts, and a black box with drifted docs is worse than none because people trust it. Generate from the interface plus acceptance tests. |
| Archiving / paging completed session sets | Deferred past MVP. Lazy loading and a rollup count suffice, and the accumulation is itself a useful signal. |
| Source-parsing for API extraction | Rejected. Both languages compile to a typed artifact; read the thing you ship. |
| Incremental projection cache | Not built, deliberately. The 70 s that motivated it is now 0.19 s; §8.1's two-second contract crosses at roughly 14,000 events. Report §4.4. |

## 8. Already built (this session, on `spike/thin-run-core`)

Committed at `b47e69a4`. 691 tests pass.

- **Finding erasure fixed, on two paths.** The NITS section was cut before
  any issue was read, and the `VERIFIED` branch filtered out everything
  non-blocking before returning. Recording and blocking are now separate
  decisions: both sections parse, NITS findings default to `minor` and carry
  `section: "nits"`, and an explicit blocking severity inside NITS survives —
  the section is a formatting convention, not a severity. NITS bodies are
  usually bullets rather than `Issue N:` blocks, so bullets parse too and an
  unstructured section is recorded whole. A regression test reproduces the
  study's arm-2 case.
- **Issue-marker fix.** Every recorded description was prefixed with a stray
  `**` from `**Issue 1:**`. It landed directly in the human-facing record.
- **An offline transport.** Scripted responses from a directory: no network,
  no credentials, no spend. No default location, so it cannot be selected by
  accident; exhaustion raises rather than replaying a response into a later
  round; results are stamped `simulated: true` with the answering file named.
  Nothing in it claims to be a provider.
- **A leaking test fixed.** `test_metrics` used a Windows path to prove an
  unwritable location does not raise; on POSIX that is a legal filename, so
  the test passed vacuously and dropped a file in the working tree each run.

## 9. Open questions

1. **Where does a cross-repo project's record live?** The machine record is
   per-repo, under `.dabbler/runs/`. A project spanning five repositories has
   no decided home for its project-level record. This needs answering before
   anything in §6.2 is built — a fragmented record loses the one thing the
   framework guarantees.
2. **How much of the existing run core survives this reframing?** §6 does not
   contradict the thin run core, but it does demote it from the centre. What
   changes in the blueprint's module inventory?
3. **What is the MVP boundary?** Manifest + tree + generated workspace is
   days. The API gate for two languages is the piece most likely to expand.
4. **Plan machinery.** §4.1 argues for resurrecting it against the
   blueprint's deletion list. Which form — and does it become the
   decomposition phase rather than a review step?
5. **Does the deferral queue live in the machine record or beside it?** It is
   durable and human-read, which pulls in different directions.

## 10. Non-goals

Build orchestration. Artifact hosting. A custom editor or IDE. Cross-repo
refactoring. Automatic cross-solution alignment. Any ceremony that cannot be
described as "here is the work it removes."
