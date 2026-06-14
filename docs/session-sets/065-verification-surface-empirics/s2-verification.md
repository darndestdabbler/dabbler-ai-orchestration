# Set 065 S2 — Cross-provider verification (gpt-5.4)

> Independent verifier: gpt-5.4 (openai), cross-provider for the Claude
> orchestrator. Round 1.

A more useful question than “is the GO valid?” is actually two questions:

1. **Existence proof:** did this session show that path-aware critique can be executed as a routed/tool-mediated call on at least one usable surface here?
2. **Selection decision:** given the very small fixture and account-specific constraints, is the **surface recommendation** stated with the right confidence and scope?

On (1), the evidence is strong enough for a **feasibility GO**. On (2), the recommendation is mostly defensible, but a few claims are stated more strongly than the pasted evidence supports, and one cost statement is internally sloppy enough to merit correction.

## Review against the focus list

### 1) Does the GO verdict follow from the measurements? Is “both surfaces caught both catch-classes 3/3” consistent with the digest?

**Yes, materially yes.**

Relevant claims:
- TL;DR table: both surfaces “caught both bugs” 3/3.
- “Capability proof” table: Copilot 3/3 on probeable and 3/3 on novel-reasoning; first-party same.
- “GO — path-aware critique can be a routed call.”

Digest support:
- Copilot: all 3 runs `ISSUES_FOUND`, “caught BOTH seeded bugs.”
- First-party: all 3 runs `ISSUES_FOUND`, “BOTH + bonus.”
- Trace sample for first-party run 1 explicitly identifies both seeded defects.

So the **feasibility GO** is supported by the digest. The report stays within the disclosed small-n spike framing, so there is no fatal issue in using these runs as an existence proof.

One nuance: the phrase **“at full determinism over 3 repeats”** in TL;DR is a bit stronger than the evidence. The verdicts were stable, but Copilot tool-call counts varied 5/6/6, and the first-party severities varied “Critical/Major” for the novel bug. That is not full determinism in behavior; it is **stable outcome**. This is not enough to overturn the GO, but it is an overstatement.

### 2) Is the recommendation defensible: first-party PRIMARY vs Copilot ALTERNATIVE? Any logical gap, or better reading?

**Broadly defensible, with one important framing caveat.**

The recommendation rests on:
- Copilot on this seat is effectively Claude-only due to plan gating.
- First-party gives routing control / multi-provider potential.
- First-party preserves a deterministic servant under your control.
- First-party has minimal Python dependency footprint.
- Copilot has $0 marginal seat economics but vendor-controlled servant and a looser default tool posture.

Those points are supported by the digest and adapter source:
- Digest confirms Copilot model swaps all failed on this subscription.
- Adapter source is plainly first-party, httpx-only, with deterministic raw tool results.
- Survey notes Claude Agent SDK wraps Node CLI and brings many deps.

So **as a recommendation for S3 synthesis**, “first-party primary, Copilot alternative” is reasonable.

The caveat: the evidence only proves **Anthropic first-party** on this host, not actual multi-provider routing in this implementation. The report usually says this carefully (“via `route()`”, “analogous bindings”), but some wording makes the first-party path sound as though multi-provider has already been empirically demonstrated rather than architecturally enabled. For a spike recommendation, “best supports future multi-provider control” would be tighter than “delivers multi-provider deterministically.”

A better reading of the same data is:
- **Feasibility:** both surfaces work for this task.
- **Recommendation:** choose first-party **because it best preserves future control and anti-bias properties**, not because this spike has already demonstrated cross-provider execution on that surface.

### 3) Internal consistency: do cost / tool-call / billing claims match digest + trace sample? Any contradiction?

**Mostly consistent, with one minor numerical/wording defect.**

Consistent items:
- First-party run-1 trace shows exactly 4 `read_file` calls, 2755 input, 1067 output, cost 0.02427, wall 21.6s. This matches digest and report.
- Report’s “~$0.024/run” is fair from the 3 runs.
- Copilot “1 premium req/run” and 5–6 tools with 4 file reads matches digest.
- “subscription here, no metered $” matches digest.

Defect:
- Under “Cost / latency envelope,” the report states first-party is “~3.8k tokens.” But run-1 trace totals **3822** tokens, while the digest only gives exact token counts for run 1, not the other two runs. Calling it “~3.8k” is okay for run 1, but the section presents it as a general observed envelope for first-party. Since only run-1 token counts are shown, the statement should be anchored to run 1 or omitted from the envelope summary. Minor issue, not a logic break.

No contradiction found in billing logic:
- The “SDK/CLI ⇒ metered is false” claim is, on this evidence, **supported enough** as a falsification-by-counterexample: Copilot CLI was observed under subscription billing, so transport/surface does not imply metered billing universally.

### 4) OVERCLAIM check

#### a) “Path-awareness empirically confirmed (probes run, not afforded)”
**Warranted.**
- Copilot digest gives concrete tool-call counts and identifies 4 file reads.
- First-party trace sample shows 4 read_file calls.
- Prompt allegedly pasted no file contents; while we cannot independently verify the prompt from pasted materials, the report’s narrower claim—tools were actually used before concluding—is supported.

#### b) “Rung-1 sufficient for both catch-classes”
**Warranted with the report’s stated scope.**
- The report explicitly limits this to “at small scale” and says it does not prove rung-2 unnecessary on large repos.
- Given the fixture and both catches via file reads alone, that constrained statement is supported.

#### c) “SDK⇒metered is false”
**Substantively warranted, though the wording is broader than the direct evidence.**
- The report actually discusses “SDK/CLI ⇒ metered is false,” grounded by Copilot CLI on subscription.
- That is enough to reject any blanket claim that *surface type* determines billing.
- It does **not** prove every SDK can be subscription-billed, only that “CLI/SDK means metered” is not a reliable rule. The report’s longer explanation (“billing is a per-call choice, so it is not the decisive axis”) is acceptable if read as a product-selection heuristic, not a universal theorem.

### 5) Any flaw that would make the go/no-go or the recommendation unsafe to carry into S3?

**No critical flaw.** I do not see anything that makes the feasibility GO unsafe.

What should be corrected before S3 is mainly **confidence calibration**:
- avoid saying “full determinism” when only the outcome was stable;
- avoid implying first-party cross-provider capability was empirically exercised rather than structurally favored;
- tighten one safety phrasing around Copilot.

## Specific defects vs nits

### Real issue 1: “full determinism over 3 repeats” overstates what was measured
Claim/section:
- TL;DR: “with empirically-confirmed tool use … at full determinism over 3 repeats”
- “Instrumentation” section: “Determinism over 3 repeats: identical verdict and near-identical tool counts on each.”

Problem:
- The digest shows Copilot tool calls varied 6/6/5 and wall times varied notably; the capability table also shows first-party severity varied “Critical/Major” for the novel bug. That supports **stable success/outcome**, not “full determinism.”
- This is a genuine consistency issue because the report itself later acknowledges only “near-identical tool counts.”

Fix:
- Replace “full determinism” with “stable outcome across 3 repeats” or “repeat-stable verdicts with small tool-count variance.”

### Real issue 2: first-party “delivers S1’s multi-provider requirement deterministically” is stronger than the demonstrated evidence
Claim/section:
- “First-party tool-loop adapter” bullet: “This is the surface that delivers S1’s multi-provider requirement deterministically.”
- Go / No-Go item 1: “It is the only surface that simultaneously delivers (a) S1’s required multi-provider diversity deterministically…”

Problem:
- The spike empirically demonstrated only **Anthropic API** on the first-party adapter. The code shown contains no `route()` implementation and no exercised second provider.
- The architectural argument is good—first-party is the most controllable path for multi-provider routing—but the wording crosses from “best supports / enables” into “delivers,” which suggests proved execution rather than inferred extensibility.

Fix:
- Rephrase to “best supports deterministic multi-provider routing under our control” or “is the only proven path here that keeps multi-provider routing in our hands, though this spike exercised only Anthropic.”

### Real issue 3: Copilot safety statement slightly over-asserts shell/edit grant from provided evidence
Claim/section:
- “Sandbox / safety posture”: “`--allow-all-tools` … grants shell/edit by default”
- Decision matrix: “Sandbox default permissive (`--allow-all-tools`)”

Problem:
- The digest confirms `--allow-all-tools` was used and that Copilot made dir-list/read-style tool calls in this task, but the pasted materials do not include a trace or help text proving the exact default granted tool set includes shell/edit on this host/version.
- This is not a major logic defect, but it is one place where the report slides from likely product knowledge into a claim not directly grounded by the pasted evidence set.

Fix:
- Tighten to “should be treated as permissive unless restricted with `--available-tools`; for verifier use, constrain to read/grep and a disposable or read-only checkout.”

## Bottom line

- **GO verdict:** supported.
- **“Both surfaces caught both classes 3/3”:** consistent with digest.
- **Recommendation:** defensible, especially given the explicit anti-bias/control rationale and Copilot plan-gating on this seat.
- **Main problems:** confidence overstatement, not outcome invalidation.

```json
{"verdict":"ISSUES_FOUND","issues":[{"severity":"Minor","claim":"TL;DR / Instrumentation: 'at full determinism over 3 repeats'","problem":"The digest shows Copilot tool-call counts varied (6,6,5), wall times varied, and first-party severity labeling varied; this supports stable outcomes, not full determinism.","fix":"Rephrase to 'stable verdicts across 3 repeats' or 'repeat-stable outcomes with small behavioral variance'."},{"severity":"Major","claim":"Go / No-Go and first-party characterization: first-party 'delivers' S1's multi-provider requirement deterministically","problem":"The pasted evidence demonstrates only Anthropic API execution on the first-party adapter. Multi-provider routing is argued architecturally, but not empirically exercised in this spike, so 'delivers' overstates what was proven.","fix":"State that first-party is the surface that best preserves or enables deterministic multi-provider routing under your control, while noting this spike exercised only Anthropic."},{"severity":"Minor","claim":"Sandbox / safety posture: Copilot '--allow-all-tools' grants shell/edit by default","problem":"The evidence set confirms use of --allow-all-tools but does not itself prove the exact default tool set on this host/version; the statement relies on external product knowledge more than the pasted trace/digest.","fix":"Soften to a directly supported operational recommendation: treat the mode as permissive unless constrained, and require --available-tools plus read-only/disposable checkout for verifier use."}]}
```
