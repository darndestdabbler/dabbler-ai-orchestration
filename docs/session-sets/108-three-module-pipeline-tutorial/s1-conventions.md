# S1 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects rather than burning
findings — and re-verify rounds — on an agreed baseline.

## What this session is

Set 108 Session **1 of 4**, the set's first session. Set 108 writes a tutorial
for the shape the product was designed around: **several modules, built
independently, composed over agreed contracts.**

**This session writes no tutorial prose.** It settles everything the other three
sessions depend on, and its whole deliverable is **two session-set documents plus
the evidence behind them**:

| File | What it is |
| --- | --- |
| `s1-service-contracts.md` | Both HTTP contracts, every literal captured from a real run |
| `s1-walk-outline.md` | Rulings R1–R8b, the four parts, the happy path, the ownership table, the handover |

Session 2 writes `docs/tutorials/three-module-pipeline.md`. Session 3 trims the
estate. Session 4 walks it with a human. **Nothing outside this set's directory
was touched**, with one deliberate exception noted below.

## The severity rubric (L-095-1) — apply it

Grade by **CONSEQUENCE**: probability the stated failure scenario materialises
for a real reader × impact on the deliverable's objectives. **Low-probability OR
low-impact is Minor even when technically correct. No plausible failure scenario
⇒ Minor by definition.** A finding must name who is harmed and how.

This matters especially here: most of the diff is a *planning* document whose
audience is three future sessions, not an end user. "This could be phrased more
crisply" is not a Major. The material question is: **would Session 2, reading
only these two documents, write the wrong tutorial?**

## Scope — what this session deliberately did NOT do

1. **No tutorial prose.** That is Session 2's Creates.
2. **No estate edits.** `adopt-dabbler.md`, `README.md`, `quick-start.md` and the
   video folder are Session 3's Touches. **A finding that this session should
   have trimmed `adopt-dabbler.md` is out of scope**, and doing it here would
   have broken the set's deliberate separation of the wide-blast-radius edit into
   its own verified session.
3. **No walk, no UAT checklist.** `requiresUAT: true` points at **Session 4**.
4. **No redesign of the reference solution** (`D:\Projects\dabbler-csv-pipeline`,
   published as the answer key). Explicit spec non-goal; it was built and proven
   before the spec existed.
5. **No product or router code.** `requiresE2E: false` — this set ships
   documents, so L-064-12 does not arm.

## The two files outside the set directory, and why

`tools/dabbler-ai-orchestration/src/test/poc-nine-modules-ondisk.ts` and
`.../poc-nine-modules-dom.ts` — both **added, nothing modified.**

The spec's Session 1 step 5 requires confirming the pre-set POC's four findings
*"against the running product, not just the model functions."* The existing
`poc-nine-modules.ts` fabricates `SessionSet` objects in memory. This one writes
a real nine-module workspace to a temp directory and drives the shipping chain
end to end — `classifyModulesManifest` → `readSessionSets` →
`computeVisibleModules` → `buildVisibleModulePayloads`, the payload the renderer
has actually consumed since Set 092.

`poc-nine-modules-dom.ts` carries the same payloads one stage further, into a
real DOM: headless Chromium loads the shipping `media/session-sets-tree/client.js`
verbatim and the assertions are made against the tree it actually builds
(`role="treeitem"`, `aria-level`, document order). It was written between
verification rounds 1 and 2, in response to the discovery round's finding that
payload-level assertions do not establish claims about *rendered rows*.

Both are **peers of the existing POC and sit beside it**, outside
`src/test/suite/**`, so they are deliberately not in `npm run test:unit`. That
matches the existing POC's placement and is not an oversight. They are run
explicitly:

```
npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
          --ui tdd --timeout 120000 src/test/poc-nine-modules-ondisk.ts
npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
          --ui tdd --timeout 180000 src/test/poc-nine-modules-dom.ts
```

**5 passing** and **4 passing** respectively. No shipping code was touched, so no
version bump and no release.

## Suite baseline (this tree)

| Suite | Result |
| --- | --- |
| Extension unit (`npm run test:unit`, vscode-stub path) | **1821 passing** |
| `poc-nine-modules-dom.ts` (new; authored between rounds 1 and 2 — see provenance note) | **4 passing** — rendered-DOM assertions |
| `poc-nine-modules-ondisk.ts` (new) | **5 passing** |
| `poc-nine-modules.ts` (pre-existing) | **4 passing**, re-run unchanged |
| Reference solution `dotnet build` | **succeeded**, 0 warnings, SDK 10.0.201 |
| `guidance_report --check` | **OK** — 10,895 / 12,000 tokens (91% of ceiling) |
| pytest (`ai_router`) | See `disposition.json`; **this session adds no Python to the package**, so the count is inherited from Set 107's close, not moved by this work |

**Layer 2 electron (`npm test`) is a known-broken harness on this machine** —
`@vscode/test-electron` fails to launch on VS Code 1.128.0 (`bad option:
--no-sandbox`). The vscode-stub mocha path above is the sanctioned substitute.
**A finding that `npm test` was not run is a known residual, not a defect of this
session.**

**Layer 3 (Playwright) was not run locally.** L-064-12 arms it for sessions that
change Explorer-rendering surfaces, state-file writers, or the fixture harness.
**This session changes none of those** — it adds a test file that *reads* the
render path and asserts on it. CI is the signal.

## Facts established by execution — do not re-derive, and do not treat as claims

Every one of these was produced by running something on 2026-08-03, not by
reading source. The evidence table in `s1-walk-outline.md` §6 maps each to its
method.

1. **Both contracts' literals are captured wire bodies.** Both services were
   started and driven with real HTTP requests. Status codes, envelopes, error
   bodies and the `Location` header are transcriptions.
2. **All four `watcher` decision-table rows were forced live**, including a
   deferred file retried and stored on a later tick.
3. **Part D was proven for BOTH services, twice.** Run 1: a second `converter` on
   `:5201`, the watcher repointed by configuration only, then **the original
   `:5101` killed** and the pipeline still working. Run 2 (added in round-3
   remediation, closing a supplementary finding): `converter` on `:5201` **and**
   `persistence` on `:5202`, with **both** `:5101` and `:5102` confirmed
   unreachable first, a batch stored, and the rows read back **through `:5202`**.
4. **The answer key is published and reachable** — `git ls-remote` resolved
   `HEAD` to `2acc7b7`, matching the local reference solution's `master`. There
   is no placeholder URL anywhere in this session's output.
5. **The POC's four findings hold against the running product** (5 assertions).
6. **LocalDB is not part of the .NET SDK** — verified against this machine's
   installed-products registry, where `Microsoft SQL Server 2025 LocalDB` and
   `Microsoft SQL Server 2019 LocalDB` appear as their own MSI entries.

## Known limits, already disclosed on the artifacts

**A finding that restates one of these is the artifact working, not a defect.** A
finding is only material if it shows a disclosure is *missing*, *insufficiently
prominent*, or *contradicted elsewhere in the tree*.

1. **Part D's proof used two instances of the SAME build.** It establishes the
   repoint *mechanism* — configuration only, no code change — and explicitly
   **not** cross-implementation conformance. Disclosed in `s1-walk-outline.md`
   R6 and in `s1-service-contracts.md` → *What is NOT established here*.
2. **No contract test exists.** There is no executable conformance suite a reader
   could run against another member's `converter`. Named as a follow-on
   candidate, not built here.
3. **Cross-machine Part D is unverified.** Binding to `0.0.0.0` is confirmed;
   firewall traversal from a genuinely remote machine cannot be tested from one
   machine and is **not claimed**. Appendix item (R7).

## Two places this session departed from its inputs

Both are deliberate, argued, and flagged for the operator. **Disagreeing with
either is legitimate; reporting them as undisclosed is not.**

1. **R1 revises the spec's POC naming recommendation** (slug `converter-v1` →
   `{owner}-{service}`). The spec's own POC section says *"S1 confirms this
   against the running product and may still choose otherwise."* The reason:
   version-in-slug stays unique only with a **central version-number allocation
   step before anyone can start**, contradicting the model's premise that nobody
   waits on anybody. Decided by a two-engine consult that converged
   (`s1-layout-naming-consensus.json`), and the collision condition is pinned as
   a test assertion.
2. **R8b corrects a factual claim in the spec's prose.** The success criterion
   says *"having installed nothing but the .NET 10 SDK."* That is false. The
   spec's own risk register suspected it and assigned the check to Session 4 —
   too late, because **Session 2 writes the prerequisite list**. Flagged for the
   operator in the outline and raised again at Step 9.

**The spec's Session Set Configuration block is untouched and immutable** —
`tier: full`, `requiresUAT: true`, `requiresE2E: false`,
`pathAwareCritique: advisory`. A disagreement with a *flag* belongs in the Step 9
review, not here.

## Decision-time consensus — the deviation to expect

`delegation.decision_consensus.enabled` is **`false`** repo-wide, yet this
session ran a two-engine consult. That is not an oversight: the spec's Session 1
step 4 explicitly directs it, and the question's category (`file-layout`) is in
the configured whitelist. **The config flag was not touched** — flipping it is an
operator config edit — and the configured `unresolved_action: ask_user` fallback
was honoured (it did not fire; the engines converged). The bias-cautions preamble
was prepended verbatim. Raw responses saved.

## What a material finding would look like here

- **A literal in `s1-service-contracts.md` that does not match what the service
  actually returns** — this is the highest-value check available, because
  Session 2 copies these strings into reader-facing prose and Session 4's walk
  cannot recover from a wrong one.
- **A ruling in R1–R8b that Session 2 cannot act on** — ambiguous, internally
  inconsistent, or contradicted by another ruling.
- **An overclaim**: anywhere the evidence is asserted more strongly than the
  method supports, especially around Part D.
- **A gap that would stall a reader**, of the kind the routed outline review
  already caught once (the missing entry-state prerequisite).
- **A bookkeeping defect** that would mislead the next orchestrator:
  `disposition.json`, `session-state.json`, the activity log, or the handover
  section.
