# Verification-Surface Empirics Spec

> **Purpose:** Empirically determine (a) whether the path-aware adversarial
> critique should be promoted to a first-class workflow stage, and (b) whether
> per-session routed cross-provider verification still earns its keep once
> path-aware critique exists — then produce a *data-grounded* proposal and a
> de-risked path toward automating path-aware critique via provider CLIs. This
> set produces evidence and a recommendation; it does **not** implement the
> workflow change.
> **Created:** 2026-06-14
> **Session Set:** `docs/session-sets/065-verification-surface-empirics/`
> **Prerequisite:** None (sequenced after Set 064 by operator choice for a
> clean field, not a data dependency).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
```

> Rationale: research / tooling / doc set — no UI, no shipping-code behavior
> change, so UAT and E2E gates do not apply. Full tier is deliberate: the
> per-session cross-provider verification both quality-gates the deliverables
> **and** incidentally contributes one more live data point to the very
> bake-off this set runs.

---

## Project Overview

A multi-turn design discussion (2026-06-14, captured in the parked memo
`project_set_065_verification_empirics_planned.md` and the gpt-5.4 +
gemini-2.5-pro consensus journal) converged on a set of candidate workflow
changes but flagged that the central claims are **empirical, not arguable**:

- **Gemini's cannibalization thesis** — if a path-aware critique is available
  on both tiers, per-session routed verification (Full's sole differentiator)
  may be low-value. **Two** confirming data points now exist: harvester Set 011
  **C9** (routed R1 marked clean; path-aware pair caught a Major/Critical
  undercount + two errors in the orchestrator's own fixes) and Set 012 **C3**
  (a fabricated-`Report`-endpoint *wrong-data* bug that survived routed gpt-5-4
  R1–R4 VERIFIED, caught by both path-aware providers independently). The
  harvester **codified** this on 2026-06-14 (`ff1e5ae`) as a Convention — "a
  clean routed VERIFIED does not waive the devil's-advocate pass on
  closeout-grade work; the two have **non-overlapping blind spots**." So 065
  is no longer "is this worth doing" (the consumer repo adopted it) but whether
  the *canonical framework* should, in what form, and the routed-cost question.
  Note the C3 case also gives a clean **same-provider context-access
  isolation** (routed-GPT missed C3 across 4 rounds; path-aware-GPT caught it —
  same model, snippet vs. full-repo), which de-confounds provider-multiplicity
  for that case for free. Caveat: this confirms path-aware's *marginal value*
  but does **not** settle "is routed still worth keeping" (the opposite
  direction, still order-poisoned — the A/B's job).
- **The probeable vs. novel-reasoning split** — how much of path-aware's
  catch value could be captured by cheap, pre-committed deterministic
  falsifiers vs. how much genuinely needs an adversarial agent.
- **The strategic fork** — institutionalize the *manual* path-aware critique,
  or automate it as a new router adapter kind that drives an agentic,
  path-aware tool. If automated, a second question: integrate via the new
  provider **SDKs** (Claude Agent SDK, Codex SDK, GitHub Copilot SDK —
  in-process, typed I/O, programmatic sandbox control) or by shelling out to
  the **CLIs** (`claude -p`, Gemini headless, `codex exec` — language-agnostic,
  may run on the existing subscription session). The choice turns primarily on
  **auth/billing model** (metered API key vs. subscription session) and
  dependency footprint — and can flip the cost conclusion.

This set gathers the evidence to settle those, then writes a proposal scored
against a **governing complexity/quality rubric** (overhead *location* beats
magnitude; prefer deterministic + out-of-band + gated-by-blast-radius +
net-neutral-or-negative).

### Candidate designs under evaluation (do not re-derive — score them)

1. Path-aware critique as a **tier-orthogonal**, per-set, opt-in attribute
   (`none | advisory | required`), reusing the `dedicated-sessions`
   content-aware close-out gate.
2. **TDD as pre-registered falsifiers** — claim-linked executable invariants
   authored before "done"; the make-or-break caveat is author-independence.
3. **Contract-test / CDC gate** — independent (non-orchestrator) contract
   tests as a deterministic implementation gate, with its three known holes
   (contract-design bias, coverage undecidability, Goodhart) and their fixes
   (independent contract review, residual novel-reasoning critique, held-out
   "fresh" tests).
4. **Manual now → automated later**, and *if* automated, the integration
   surface — a vendor **SDK**, a vendor **CLI**, or a **first-party tool-loop
   adapter** (see below) — decided by auth/billing model (metered vs.
   subscription), dependency footprint, and how much of the value is mechanizable.

### Non-goals

- **No** production workflow change — no edits to `close_session`,
  `router-config.yaml`, the extension, or the guidance docs. The deliverable
  is a proposal, not a gate.
- **No** shipped CLI adapter — Session 2 is a throwaway spike, not a
  production provider-adapter.
- **No** PyPI / Marketplace release.

---

## Sessions

### Session 1 of 3: Retrospective bake-off

**Primary corpus:** `dabbler-access-harvester` Sets **008–012** (n=5, complete
as of 2026-06-14) — each ran *both* a session-end routed verification and a
path-aware critique with GPT and Gemini. Two existence proofs already known: 011
**C9** (routed-R1-clean) and 012 **C3** (survived routed gpt-5-4 R1–R4 VERIFIED;
fabricated-data bug; both path-aware providers caught it independently). Mine the
harvester's own 011/012 Step-9 lessons + the new project-guidance Convention
(`ff1e5ae`) as primary sources. Add any qualifying sets from this repo if found.

**Steps:**
1. **Inventory the corpus + the confound metadata.** For each set, record the
   verification provenance needed to de-confound the comparison (below):
   **which provider/model was the single routed validator**, the routed
   **cadence** (per-session vs per-set), the **round count of each surface**
   (routed R1→R2→R3 vs path-aware rounds — only 1 of 5 sets ran a 2nd
   path-aware round), and confirm the path-aware findings are attributed
   **per-provider** (separate GPT vs Gemini verdicts —
   `s*-external-verification-gpt.md` / `-gemini.md`).
2. **Extract findings** from all surfaces per set: routed
   (`sN-verification*.md` / verdicts), path-aware GPT, and path-aware Gemini
   (`*-devils-advocate*` / `*-external-verification*` records), kept distinct
   by provider.
3. **Classify** each finding into four buckets: routed-only / critique-only /
   both / missed-by-both (defect surfaced later, in a downstream set or prod).
   **Split the critique-only bucket** by remediation-timing: findings that
   existed in the *original work* (routed had a shot, missed them = clean
   marginal-value evidence) vs. findings *introduced by remediation* (routed
   structurally never saw them — e.g. C9's "errors in my own R1 fixes").
4. **De-confound (the load-bearing step).** Four variables differ between the
   surfaces; with n=5 they cannot be cleanly *separated* statistically, so this
   step is qualitative/case-by-case + existence-proof, not a causal estimate:
   - **context-access** (the variable of interest) — single routed validator
     vs. *one* path-aware provider (same provider where the routed validator
     was GPT/Gemini = a same-model snippet-vs-full-repo natural experiment).
     **012 C3 is exactly this, for free:** GPT was both the routed validator
     and a path-aware provider — routed-GPT missed C3 across R1–R4, path-aware-GPT
     caught it. A within-corpus clean isolation, no reconstruction needed;
   - **provider-multiplicity** — path-aware GPT-only vs. GPT∪Gemini (the
     second-provider lift, independent of context). Implies the opposite fix
     (just add a second routed validator) from context-access (build path-aware
     tooling) — so this split picks the strategic direction;
   - **cadence** (per-session vs per-set) — covariate;
   - **round-count** — path-aware was mostly single-round vs routed's R1→R2(→R3);
     run an **R1-vs-R1** comparison as the apples-to-apples measure, and report
     the aggregate separately. Path-aware being round-handicapped means a
     positive aggregate result is a **conservative lower bound** (more rounds
     could only add value, likely at lower ROI) — record this as a stated
     robustness argument. The one multi-round path-aware set (likely 011, source
     of the C9-R2 "errors in my own fixes" catch) is corrected for by R1-vs-R1;
   - **order (the worst, confound #5)** — routed always ran *first* on the
     pre-remediation tree; path-aware ran *second* on the post-remediation tree.
     This does not bias magnitude — it makes the **routed-only bucket
     uninterpretable**: it cannot distinguish "path-aware genuinely missed it"
     (routed has marginal value) from "already fixed before path-aware looked"
     (no evidence). Capability-superset (path-aware sees all the snippet showed,
     plus more) ≠ outcome-superset (finite attention / non-determinism), so we
     **cannot assume** path-aware-first subsumes routed — that *is* the question.
     The retrospective cannot answer it; see 4b and the forward A/B (step 8).
4b. **(Optional — may graduate to its own session) Complete the 2×2.** We have
   both path-aware cells (GPT, Gemini) but only **one** routed cell. Fill the
   missing routed cell: `git`-restore each set's **pre-remediation** commit
   (against HEAD the bugs are already fixed), faithfully **reconstruct the
   routed evidence bundle** at that tree, and run the *other* provider's routed
   verification. This is the cleanest available control for the
   provider-multiplicity confound. Bounded (~5 re-verify calls) but the bundle
   reconstruction is fiddly; scope it to the missing cell only. **On the same
   restored pre-remediation trees**, S2's programmatic path-aware agent can also
   be run *first* — recreating the order-confound counterfactual ("would
   path-aware, going first, find what the API found?"). Caveat: non-deterministic
   (needs repeats, not one run), real cost, still n=5 — a ceiling, not a clean
   answer.
5. **Stratify** every set by type: cross-artifact / whole-repo-state vs.
   local-logic (and note cadence as a covariate).
6. **Partition** every path-aware catch: **probeable** (could have been a
   pre-committed deterministic falsifier — e.g. C9's index-vs-artifact count)
   vs. **novel-reasoning** (no probe would anticipate it).
7. **Compute the metrics:** unique-catch rate per surface (severity-weighted,
   and per *single* provider for the de-confounded view), false-positive rate
   per surface, cost-per-real-defect (metered $ for routed vs. operator-minutes
   for critique), and the decisive question — *did routed verification ever
   catch a real defect the path-aware critique missed?*
8. Write the results; be explicit about small-n (n=5) and **five** confounds
   (context, provider-count, cadence, round-count, order) — so the retrospective
   is existence-proof + hypothesis-generating, not a clean causal estimate;
   separate the context-access verdict from the provider-multiplicity verdict.
   **Produce a forward-A/B design as a first-class deliverable.** Its core
   requirement, dictated by the order confound: **both surfaces run blind and
   independent on the *same frozen pre-remediation tree*** (neither sees the
   other's output), which removes order, remediation-state, and sequencing at
   once. Also control provider-count, cadence, and round-count. With five
   confounds the A/B is the only clean causal instrument.

**Creates:** `bake-off-results.md`, `bake-off-data.json` (structured: sets,
findings, bucket + stratum + partition + per-provider/round provenance per
finding), `forward-ab-design.md`.
**Touches:** none (read-only mining; cross-repo reads of the harvester). The
optional 2×2 reconstruction (4b) `git`-restores pre-remediation commits on a
throwaway checkout only — never the working tree.
**Ends with:** `bake-off-results.md` committed, carrying the 4-bucket table,
the cross-artifact/local stratification, the probeable/novel partition, the
context-vs-multiplicity decomposition, and an explicit (confound-caveated)
verdict on routed verification's marginal value — plus a `forward-ab-design.md`.
**Progress keys:** corpus-enumerated, findings-extracted, buckets-classified,
confounds-decomposed, metrics-computed, forward-ab-designed, results-written.

---

### Session 2 of 3: Integration-surface spike — SDK vs CLI

**Steps:**
1. **Survey the surfaces** (no runs yet). Candidates: **GitHub Copilot SDK
   (primary — the dabbler team's standard)**, Claude Agent SDK, Codex SDK, the
   `claude -p` / Gemini headless / `codex exec` CLIs, and a **first-party
   tool-loop adapter** (see *First-party adapter* below — a `route()`-based
   agentic loop we build ourselves). Record per surface:
   - **path-awareness LEVEL** (not binary — characterize the rung). (1) tool-loop
     access: read-file / grep / run-terminal? (2) workspace **semantic indexing**:
     @workspace-style retrieval over a prebuilt index, or literal file/grep only?
     (3) execution permissions: can it build/run tests, or read-only? **Co-equal
     with billing — arguably above it: an SDK that lacks the tool loop forfeits
     the path-awareness we'd be paying $0-marginal for.** Prior to verify: a
     "Copilot CLI SDK" likely *drives the same agent as the CLI* (so matches
     rung 1) but may differ from the VS Code extension on rung 2 and on default
     rung-3 permissions.
   - **auth & billing model.** Copilot SDK supports **both** BYOK (metered /
     "variable") **and** Copilot OAuth (subscription / "fixed"), mixable per
     call — this **dissolves the "SDK ⇒ metered" assumption**, so for the team's
     tool billing is a non-constraint and the decisive axis becomes
     path-awareness parity. Other SDKs may still bind to metered keys.
   - **harness vs. model.** Copilot SDK is a *harness* that can drive multiple
     underlying models (GPT / Claude / Gemini), so one SDK still yields
     cross-provider model diversity — confirm which models are reachable under
     OAuth vs. BYOK.
   - language / **Python** availability, native structured-output, sandbox
     controls, and dependency footprint.
2. **Prove one representative pair.** Pick one SDK and one CLI that are
   available and **non-interactively authable** here; run each headless against
   a **read-only** checkout (or disposable worktree) at HEAD with a
   structured-output critique prompt over a known set; capture a parseable
   verdict from each.
3. **Measure** what decides feasibility on both: billing model actually
   observed, determinism (repeat runs), token / cost, wall-clock latency, and —
   **the empirical signature of path-awareness** — **instrument the tool-call
   trace**: count the file-reads / greps / terminal-runs the agent actually made.
   Path-awareness is a property of the harness's *agentic retrieval loop* (who
   assembles context, and whether it iterates against ground truth), not of the
   SDK/CLI label or the remote model. An agent that made **zero** tool calls is
   not path-aware *in practice* regardless of capability — so report probes-run,
   not just "could probe."
4. **Capability proof — against both catch-classes.** Re-run the critique that
   caught harvester C9 (or a constructed analog) and check whether each surface
   *independently* catches it. C9 is a **probeable** catch (open two artifacts,
   count, compare) — it needs only rung-1 tool-loop access, so it tests the
   floor. Add a **novel-reasoning / broad-exploration** probe (an issue that
   requires ranging across unfamiliar files) to test whether rung-2 workspace
   indexing actually matters. The rung *needed* depends on the catch-class
   (probeable vs novel, per S1's partition) — so report parity per class, not
   as a single yes/no.
5. **Document** headless-auth reliability and the sandbox / safety posture
   (read-only or disposable worktree mandatory), then build a **decision
   matrix** (SDK vs. CLI across the axes) scored against the complexity/quality
   rubric — especially dependency footprint and billing model.
6. Write a **go / no-go** on "path-aware critique can be a routed call," naming
   the recommended integration surface and billing model, with the cost /
   latency envelope. Deliberately **not** a full provider×surface matrix — axes
   plus one proven pair, per the rubric.

**Creates:** `spike-report.md` (incl. the SDK-vs-CLI decision matrix), a
throwaway spike script (set dir or `c:/temp`).
**Touches:** none (no router adapter shipped).
**Ends with:** `spike-report.md` committed, with a demonstrated headless
structured-output critique run from at least one surface, the decision matrix,
and an explicit go/no-go naming the recommended surface + billing model.
**Progress keys:** surfaces-surveyed, representative-pair-proven,
structured-verdict-captured, measurements-recorded, c9-analog-retested,
decision-matrix-built, report-written.

> **SDK references** (provided 2026-06-14): Claude Agent SDK (Python) —
> `https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python`;
> Codex SDK — `https://developers.openai.com/codex/sdk`; GitHub Copilot CLI
> SDKs — `https://github.com/github/copilot-sdk`. Note: the orchestrator
> itself runs *inside* the Claude Agent SDK harness, so that surface has
> first-hand grounding.

#### First-party adapter (third option — evaluate alongside SDK/CLI)

Path-awareness is just a **tool loop**, with no proprietary algorithm: the
verifier model is given tools + a task; it emits a tool call; local code executes
it and returns the result; repeat until a final verdict. All three providers
expose this natively (Anthropic `tools`/`tool_use`/`tool_result`, OpenAI
`tool_calls`, Gemini function calling). So a **first-party adapter** = a
`route()`-based agentic loop we build:
- **Toolset (minimal):** `read_file`, `grep`, `list_dir`/`glob`, `run_test`.
  The S1 bake-off found **~92% of catches are probeable**, needing only this
  deterministic toolset — **no semantic workspace indexing required for the
  bulk**; vendor indexing only buys the ~8% novel residual. This *lowers the bar*
  for building our own.
- **Inversion of control:** today `route()` *pushes* pre-packed context; the
  adapter *pulls* — the orchestrator becomes the **servant** of the verifier,
  serving its file/grep/test requests. That inversion **is** path-awareness.
- **Guardrail — deterministic servant only.** The servant returns **raw ground
  truth** (bytes / grep output / test result), never a *model-summarized* view.
  A summarizing "lesser-model servant" reintroduces the biased context-assembler
  that path-awareness exists to remove (the C9/C3 mechanism). Keep intelligence
  in the verifier; keep the servant dumb.
- **Components:** per-provider tool-use binding (or use a provider SDK's loop),
  a loop driver with turn/token/cost caps, a **sandbox for `run_test`**
  (disposable git worktree — read/grep/list are low-risk; only execution needs
  the cage), a forced structured verdict (`sN-issues.json` schema), and tool-call
  -trace instrumentation.
- **Trade vs vendor harness:** first-party = metered (BYOK), full control,
  minimal deps, anti-bias property under our control, cross-provider via
  `route()`, but we tune the verifier prompt + sandbox ourselves. Vendor harness
  (Copilot SDK) = subscription option + tuned indexing for the 8%, but vendor
  dependency. The bake-off's 92%-probeable finding makes first-party more
  attractive than it first appears.

---

### Session 3 of 3: Synthesis proposal

**Steps:**
1. **Synthesize** S1 evidence + S2 spike + the captured gpt-5.4 /
   gemini-2.5-pro consensus into a single recommendation.
2. **Score** each candidate design (1–4 above) against the governing
   complexity/quality rubric — quality added, overhead added, *where* the
   overhead lands, gated-by-blast-radius vs. universal, net effect.
3. **Recommend explicitly:** (a) promote path-aware critique? in what form?
   (b) keep / demote-to-smoke-pass / retire per-session routed verification?
   (c) manual now → CLI-adapter later? (d) which TDD/contract elements are
   worth their overhead, and which fail the rubric?
4. **Resolve the open question:** can one agent author the contract /
   falsifiers *and* implement against them and still get the pre-commitment
   benefit — or does Hole 1 force a different engine for the contract/tests?
5. Write the proposal (carry the consensus journal), author the end-of-set
   `change-log.md`, route cross-provider verification of the proposal, and
   author the next-set recommendation via routed analysis.

**Creates:** `docs/proposals/<YYYY-MM-DD>-verification-surface-empirics/proposal.md`
(+ consensus journal), `change-log.md`.
**Touches:** none (proposal only — production changes are a *future* set).
**Ends with:** a routed-verified proposal + `change-log.md`; the set closes.
**Progress keys:** evidence-synthesized, candidates-scored, recommendations-made,
open-question-resolved, proposal-verified, change-log-written.

---

## End-of-set deliverables

- `bake-off-results.md` + `bake-off-data.json` (S1)
- `spike-report.md` + spike script (S2)
- `docs/proposals/<date>-verification-surface-empirics/proposal.md` + consensus
  journal (S3)
- `change-log.md` (S3)

A concrete production proposal whose recommendations are each scored against
the complexity/quality rubric and grounded in the bake-off data — ready to be
authored as an implementation set (or rejected) in a future effort.
