# Set 066 Decomposition Critique — Round 2 — GPT-5.4

## 1. Pick

**Better than A / B / C: Option D — ship the manual Path-Aware Critique feature in 066, then automate and capability-test it in 067.**

The repo no longer supports the binary framing behind A/B/C. The current proposal says two things at once: Path-Aware Critique is already justified as a per-set attribute, and the rollout should be **phased**: "institutionalize the manual critique now" and automate later via the adapter (`proposal.md`, Erratum + §1). The new erratum also says the Full-tier wiring is net-new work and that **Set 066 scopes it accordingly**, which is the opposite of "defer the feature." Once you take the repo at its word, 066's first consumer is not Experiment A and not the adapter; it is the **manual workflow feature** itself. The adapter then becomes automation for an already-shipped surface, and Experiment A becomes validation of that automation rather than a gate on whether the feature should exist.

## 2. Strongest Counterargument

The strongest counterargument to Option D is that `proposal.md` §9 sequenced adapter -> A/B -> feature integration, so shipping the feature first looks like a contradiction. I do not think that survives the rest of the same document. The same proposal explicitly says "Manual now -> automated later? **Yes, phased**" and tells us to institutionalize the manual critique now because it is already proven and costs operator-minutes, not metered API spend. After the erratum, the clean reading is: the **feature** is justified now, the **automation** is not the feature, and the **routed-fate** decision remains data-gated. Shipping the manual feature first is not reckless because the risky surface is the agentic executor, not the policy of requiring a path-aware critique before close.

The strongest counterargument from the other direction is: if the feature can ship manually, why not still keep Experiment A in 066? Because that recreates the same sprawl problem under a different name. The authoring guide's normal band is 2-4 sessions, and the round-1 constraints already split architecture seam, provider bindings, sandbox, and experiments into distinct synthesis points. Once the manual feature can ship on its own, there is no reason to overload 066 with automation research as well.

## 3. Does the Feature Require the Adapter?

**No.** This is the key point that dissolves the fork.

The proposal explicitly says:

- promote Path-Aware Critique now as a per-set attribute;
- institutionalize the **manual** critique now;
- build the first-party adapter as the later primary Mode-2 engine.

That is already a two-phase product story. The team is also already running the manual path-aware flow today; this very review prompt is proof of the operating model. So the adapter is **automation**, not a prerequisite for shipping the feature. What 066 must add is the formal Full-tier workflow surface: the spec/config knob, the artifact/prompt discipline, the close-out behavior, and the docs/tests that make the manual practice canonical rather than ad hoc.

## 4. The 066/067 Line

The clean line is:

- **066 = product workflow set.** Ship Path-Aware Critique as a real Full-tier manual feature and leave routed unchanged.
- **067 = automation + capability-study set.** Build the adapter behind that existing feature and run **Experiment A** against the automation.

That keeps 066 inside the authoring guide's normal sizing band and gives it one clear synthesis point: "the manual feature exists and is enforceable." It also keeps 067 coherent: "the automation exists and has been capability-tested." **Experiment B** and the routed keep/demote/retire decision remain a later policy set because Experiment B is the cadence study and is still the only thing that can settle routed's surviving defense.

## Recommended Decomposition

### Set 066 — Ship Path-Aware Critique (manual Full-tier workflow)

1. **S1 — Spec/config surface + artifact contract.** Add the `pathAwareCritique` per-set attribute, decide the saved artifact shape for manual critiques, and wire the spec/state readers that need to see it.
2. **S2 — Full-tier close-out/manual flow wiring.** Implement the net-new Full-tier gate/close-out behavior for manual Path-Aware Critique, including the operator prompt/recording path and failure posture.
3. **S3 — Docs, prompts, tests, and release.** Document the manual workflow, land the prompt/template artifacts, add focused tests, and ship a PyPI release for the **feature**. Routed verification stays unchanged.

**What ships in 066:** Path-Aware Critique as a real, manual, end-of-set Full-tier workflow feature.

**What defers from 066:** all adapter work, Experiment A, Experiment B, routed-fate, and the contract gate.

### Set 067 — Automate Path-Aware Critique and run Experiment A

1. **S1 — Agentic executor seam + Anthropic core.** Add the first-class pull/agentic entrypoint and harden the Anthropic read-only loop.
2. **S2 — Multi-provider bindings.** Add the OpenAI and Gemini tool-loop bindings against that seam.
3. **S3 — `run_test` sandbox.** Build the disposable-worktree execution helper and wire guarded test execution.
4. **S4 — Experiment A + synthesis.** Run the capability study on the automated surface and publish the Experiment-A results.

**What ships in 067:** the automated engine behind an already-shipped feature, plus Experiment-A evidence about capability overlap.

**What defers from 067:** Experiment B, routed keep/demote/retire, and the contract-test gate.

### Later set (expected 068)

1. **Experiment B.** Run the cadence study.
2. **Routed-fate + contract gate.** Use A+B together to decide routed's status and scope the deterministic gate work.

## BOTTOM LINE

The repo's own proposal already dissolves the fork: Path-Aware Critique can ship manually now, and the adapter is later automation. So 066 should be the **manual feature** set, 067 should be the **automation + Experiment A** set, and routed-fate should wait for Experiment B.# 066 Decomposition - Critique Round 2 (GPT)

## 1. Which option?
**Option A (Product Set + Research Set)** is the structurally correct path, but it needs a fundamental adjustment based on untangling the workflow feature from the automation. Option A correctly isolates the engineering delivery (building the adapter and integrating the Path-Aware Critique feature) into Set 066, and pushes the empirical capability/cadence measurements (the A/B test) into Set 067. Attempting to mix engine-building, feature-integration, and a massive two-part controlled experiment (Option B) flatly violates the sizing heuristic (5+ sessions) and invites failure. Option C strands the adapter without a production consumer and violates the proposal's §9 dictate that steps 1-3 are committable now. 

## 2. Strongest counterargument
*Is shipping the feature before any controlled capability study reckless?* 
No, because the manual path-aware practice already has strong baseline evidence (the 12 unique defects from the S1 bake-off, including two criticals). We are not shipping an untested capability; we are automating and standardizing a capability that has already proven its existence and worth. Experiment A exists to carefully quantify capability margins vs. routed, not to prove that path-awareness works at all. Delaying the rollout of a known-valuable safety net (Path-Aware Critique) while we construct a pristine A/B research harness in 067 is backward. 

## 3. Does shipping Path-Aware Critique actually require the adapter?
**No. This dissolves the central tension of the fork.** 
As stated in `proposal.md` §5 (Candidate 4), the proposal is expressly phased: "Institutionalize the manual critique now... and instrument it; build a first-party tool-loop adapter". Path-Aware Critique can be shipped as a formal workflow gate (the per-set attribute, the `P_set` blast-radius predicate, the close-out `verificationMode` update) *before* the automated adapter is finished, relying entirely on the operator-run process (like this current Copilot Chat / GPT review). The adapter is simply the automation engine that will eventually plug into this new gate. This means 066 can confidently ship the feature integration alongside the adapter implementation without sequential risk.

## 4. Where exactly is the 066/067 line and sizing?
The line sits firmly between **Engineering** (066) and **Empirics / Decision-Making** (067).
- **Set 066 (Engineering & Enablement):** 4-5 sessions. It builds the parallel executor seam, the provider bindings, the worktree sandbox, and wires in the Path-Aware Critique full-tier close-out phase. It ships a PyPI release (the adapter) and extension updates (the new workflow gate + `verificationMode` attribute). This perfectly fits the "2-4 typical, up to 5" sizing band.
- **Set 067 (Research & Strategy):** 3 sessions. S1 executes Experiment A utilizing the now-production 066 adapter. S2 executes Experiment B (cadence). S3 synthesizes results to decide the fate of per-session routed verification and implementation of the contract-test gate.

## Recommended decomposition

**Set 066 (Path-Aware Engine & Integration):**
- **S1:** Parallel executor seam (`pull_route`) + Anthropic loop + deterministic tools (read/grep).
- **S2:** Multi-provider tool loop bindings (OpenAI + Gemini).
- **S3:** Sandboxed `run_test` execution utilizing disposable Git worktrees (net-new capability, distinct from `worktree.py`).
- **S4:** Ship Path-Aware Critique (per-set attribute, `P_task/P_set` predicate logic, Full-tier close-out wiring - acknowledging this is net-new work). 
- **S5:** Synthesize, document, and ship PyPI release + Marketplace bump.

**Set 067 (Forward A/B & Routed Evaluation):**
- **S1:** Forward A/B Experiment A (Capability: static frozen trees).
- **S2:** Forward A/B Experiment B (Cadence: staged snapshots).
- **S3:** Synthesize keep/demote/retire decision + scope the contract-test gateway.

**BOTTOM LINE:** Option A wins because the Path-Aware feature is already justified by S1 evidence and can ship using the manual flow; build the engine and feature in 066, run the formal A/B empirics in 067.