# Verification-Surface Strategy (settled)

> **Status:** Settled strategy. This is the canonical synthesis of the
> verification-surface program Set 065 framed and Sets 066–068 built and
> measured. It **supersedes the open questions** of the Set 065 proposal
> ([`docs/proposals/2026-06-14-verification-surface-empirics/proposal.md`](proposals/2026-06-14-verification-surface-empirics/proposal.md)) —
> that proposal remains the design-rationale record; this doc records what was
> decided, built, and measured, and the live policy that resulted.
> **Created:** 2026-06-16 (Set 068 S6). **Owners:** the four Set 065 questions
> (a)–(d) + the open author-independence question.

---

## 0. TL;DR

The framework verifies AI-led work on **three layers**, chosen by a single
**blast-radius predicate** over the change:

1. **Floor — contract-test / CDC gate** (Set 068 S5, `contractGate`). A
   deterministic per-set gate confirming the set's contract/falsifier tests ran
   and **passed** in the disposable `run_test` cage and cover every probeable
   defect class. Carries the **~95%-probeable** bulk with no model in the loop.
2. **Ceiling — path-aware critique** (Sets 066–067, `pathAwareCritique`). A
   multi-provider, **repository-reading** (Mode-2 *pull*) review at set close,
   reserved for the **non-probeable residual** and for *authoring* the
   falsifiers. Catches the cross-artifact / index / fabricated-data class a
   snippet-fed (Mode-1 *push*) verifier structurally cannot see. **Set 069 made
   this ceiling *executable*:** the automated producer can now generate
   **replayable, execution-backed evidence** (not just read-only commentary) and
   pay reproduced probeable defects back into the floor under a quality gate — see
   §6.
3. **Targeted — per-session routed verification, now gated** (Set 068 S4 +
   S6). The every-session cross-provider review is **demoted**: it fires only
   when a deterministic blast-radius / coupling predicate trips on the session
   diff (`ai_router/routed_gate.py`). Its retained, demonstrated value is
   **early interception of migrating cross-file coupling defects at their
   introduction**.

All three layers, plus the `pathAwareCritique` set-level gate, are governed by
**one** core predicate (§4) — *does the work change cross-artifact contracts,
indexes, wiring, or shared schema?* — so the framework gained capability without
accreting independent knobs.

---

## 1. The Set 065 questions, settled

The Set 065 proposal posed five questions. All are now resolved on built code
and pre-registered experimental evidence:

| # | Set 065 question | Settled answer | Where |
|---|---|---|---|
| (a) | Promote path-aware critique? | **Yes — shipped.** Tier-orthogonal per-set `pathAwareCritique: none\|advisory\|required`, multi-provider, end-of-set, `required` recommended by the blast-radius predicate. Automated producer added. | Set 066 (`ai_router` 0.20.0), Set 067 producer (0.21.x) |
| (b) | Keep / demote / retire per-session routed verification? | **DEMOTE** — the open question Set 065 *deferred to forward Experiments A and B* is now answered on that data, and **cut over** to a gated check. | Set 067 (Exp A) + Set 068 (re-grade, Exp B, S4 decision, **S6 cut-over**) |
| (c) | Manual now → automated later? Which surface? | **Yes, phased — done.** Manual flow institutionalized (Set 066); first-party tool-loop **pull adapter** built as the primary Mode-2 engine (Set 067). | Set 066 manual stage, Set 067 `pull_verifier.py` + `pull_critique.py` |
| (d) | Which TDD / contract elements earn their overhead? | **Contract-test / CDC gate adopted** as the deterministic floor (the ~95%-probeable share); the path-aware agent reserved for the residual + falsifier *authoring*. | Set 068 S5 (`contract_gate.py`) |
| (open) | One blast-radius predicate, applied where? | **One predicate, now three live applications** (§4). | Set 066 (`blast_radius.py`) + Set 068 S6 (`routed_gate.py`) |

Question (b) is the headline. Set 065 explicitly recorded *"Keep unchanged for
now; do not demote or retire on current evidence… Gate any status change on
forward Experiments A and B."* Both experiments ran; the gate is now satisfied;
the status changed. The rest of this doc records how.

---

## 2. The evidence that moved question (b)

Two pre-registered experiments, plus a symmetric re-grade that settled an audit
asymmetry, supply the verdict. Full records are linked; the load-bearing reads:

### 2.1 Experiment A (capability) + the symmetric re-grade

**Finding: the lever is repository context-access, not provider multiplicity —
and routed, fed snippets, structurally lacks it.**

- Path-aware catches **real, high-severity cross-file defects** snippet-fed
  routed cannot. The **direction** is audit-independent: D5 is an unconditional
  existence proof (routed never matched it even by the automated predicate; both
  path-aware arms caught it in every replicate), and held to the *identical*
  "name the mechanism" standard, path-aware's cross-file catches survive
  **13/14** vs routed's **2/8**.
- **Magnitude** is metric-sensitive but positive everywhere: the GPT contrast
  exceeds the noise band under every regime (+0.23 audit-free to +0.29
  mechanism-audited); the Gemini contrast is within-band under the
  pre-registered automated primary but resolves to +0.28 once routed's
  wrong-mechanism cross-file credits are removed symmetrically — **masked, not
  absent**.
- **"A second routed provider buys nothing"** is robust and audit-independent
  (`A1_auto == A2_auto`, +0.0000).

Records: [`experiment-a-regrade.md`](session-sets/068-cadence-study-and-contract-gate/experiment-a-regrade.md)
(symmetric re-grade, Set 068 S2) and the Set 067 `experiment-a-results.md`
(original 2×2, 60 runs).

### 2.2 Experiment B (cadence)

**Finding: the cadence defense DOES NOT HOLD under the pre-registered rule
(clause B3) — but the cadence *mechanism* is real and narrow.**

- Per-session routed (**R**) realizes the early window on **5/5** cadence-payoff
  defects in both providers, and saves resolved rework over both end-of-set
  routed (**Q**) and the end-of-set path-aware replacement (**E**) on that class
  — R *does* catch migrating coupling defects at introduction.
- **But** R's edge over end-of-set is **confounded**: the no-coupling control
  shows a pure surface-coverage saving (R is handed every file's diff across the
  build; the end-of-set snippet is not) and the always-visible control shows a
  pure earliness saving. Per the pre-committed rule this is the **B3** branch —
  the saving is not cleanly attributable to Q-invisible cadence.
- Capability ranking at close reproduced Experiment A in the staged setting:
  **E (11–12/12) ≫ R (10/12) ≫ Q (4/12)** — path-aware is the ceiling (though
  not a *perfect* one: one provider's E missed a cross-file Critical).

Record: [`experiment-b-results.md`](session-sets/068-cadence-study-and-contract-gate/experiment-b-results.md)
(Set 068 S3).

### 2.3 The decision

On that evidence, cross-provider **decision-time consensus** (the two
non-orchestrator providers, devil's-advocate two-pass — both steelmanned KEEP
and found it not decisive) **+ operator confirmation** chose **DEMOTE**, with a
**transition guard**: do not remove the live per-session safety net until its
deterministic replacement floor (the S5 contract-test gate) is built. RETIRE was
rejected as premature (the floor was not yet built; path-aware E is not a perfect
ceiling; the live gate has caught real pre-commit defects the toy study does not
bound) and is reopenable later **only on telemetry**.

Record: [`routed-fate-decision.md`](session-sets/068-cadence-study-and-contract-gate/routed-fate-decision.md)
(Set 068 S4).

---

## 3. The live layered model (target state, now in effect)

The transition guard cleared in Set 068 S5 (the floor shipped) and the cut-over
executed in S6. The verification surface is now:

- **Floor — `contractGate`** (`ai_router/contract_gate.py`,
  [`docs/contract-gate.md`](contract-gate.md)). Per-set, opt-in
  (`none|advisory|required`). The producer (`python -m ai_router.contract_gate
  run`) runs the operator-declared contract command in the disposable `run_test`
  cage and saves the raw `contract-floor-result.json`; the close-out gate
  validates it passed, matches the set, and covers every probeable defect class.
  Posture mirrors the path-aware gate (hard-TTY / soft-headless on `required`).
- **Ceiling — `pathAwareCritique`** (`ai_router/path_aware_critique.py`,
  [`docs/path-aware-critique-schema.md`](path-aware-critique-schema.md)). Per-set,
  opt-in, multi-provider (≥2 distinct providers), repository-reading, end-of-set.
  Produced manually or by the automated `python -m ai_router.pull_critique`
  producer over the Set 067 read-only adapter.
- **Targeted — per-session routed, gated** (`ai_router/routed_gate.py`).
  Demoted from mandatory-every-session to fire only when the predicate (§4)
  trips on the session diff. The orchestrator runs it at Step 6 of
  [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md); the gate
  verdict (and its triggers) is logged whether or not the routed call runs, so a
  skipped call is an auditable decision, not a silent omission. As of Set 070 the
  push template it uses (`prompt-templates/verification.md`) runs at **strong
  adversarial framing** (§5.2), so the retained gated layer is measured and
  deployed at its strongest form.

The execution substrate for the floor and for any test-running pull review is
the Set 068 S1 **disposable-worktree `run_test` cage**
(`ai_router/run_test_sandbox.py`,
[`run-test-contract.md`](session-sets/068-cadence-study-and-contract-gate/run-test-contract.md)):
an operator-authored command runs write-confined in a detached, crash-safe
worktree returning raw exit+output (deterministic-servant discipline extended to
execution). It is a bounded verification cage, **not** a CI runner and **not** an
adversarial OS sandbox — its scope and threat model are stated in the contract.

---

## 4. One predicate, three applications

The unifying insight of Set 065 §7 held up and is now **realized in code**. The
core predicate — *does the work change cross-artifact contracts, indexes,
wiring, or shared schema?* — is implemented once in
`ai_router/blast_radius.py` (`P_set = any(P_task)`, `classify_paths`) and applied
in three places:

1. **`pathAwareCritique: required`** — a **set-level** recommendation
   (`blast_radius` recommends the level; the operator confirms at set start).
   Set 066.
2. **Per-session routed gating** — a **session-level** decision
   (`routed_gate.evaluate_routed_gate` reuses `classify_paths` as its core, then
   adds the session-level triggers the S4 decision named: multi-module span,
   diff breadth, build/CI/config surface, and the three honestly-declared
   operator overrides that can only *raise* to REQUIRED). Set 068 S6.
3. **Contract-floor coverage** — a set declares its probeable defect classes and
   the contract tests that cover them; the floor carries exactly the probeable
   share the predicate scopes, and the agent takes the residual. Set 068 S5.

The predicate is **deterministic and legible** by design. The S4 consensus's
load-bearing requirement was that gating be a *programmatic diff heuristic, not
an operator's per-session feeling* — the most dangerous sessions are the ones
whose risk is under-recognized at the time — and that the heuristic be **biased
toward review** (a false REQUIRED costs one extra out-of-band review; a false
SKIP silently drops the safety net).

---

## 5. What is still open (reopenable on telemetry)

**RETIRE** of per-session routed verification was rejected *now*, not forever.
Reopen it only after the demoted policy has run long enough to collect, under the
contract-gate-era stack:

- escaped-defect rate (defects that reached commit);
- intro-stage vs end-of-set catch timing;
- rework saved by the retained gated routed calls;
- false-positive churn from routed;
- sessions where the gating predicate failed to trigger but should have.

If that telemetry shows the retained gated routed calls no longer catch unique
high-severity defects or save meaningful rework, RETIRE becomes the
evidence-backed next step. Until then, routed stays — **gated, not gone**
(`routed-fate-decision.md` §5).

Two measured caveats carry forward as honesty notes, not open decisions: the
experiments rest on small, author-seeded instruments (direction robust,
magnitudes illustrative), and path-aware E is not a perfect ceiling (a provider
missed a cross-file Critical) — which is itself an argument for the multi-provider
(≥2) requirement on the ceiling and for keeping the gated routed layer rather than
retiring it.

### 5.1 Before RETIRE: push must be measured at its adversarial best (operator directive, 2026-06-16)

A precondition on any future RETIRE decision: **the push (routed, snippet-fed)
layer must be evaluated in its strongest form — adversarial "devil's-advocate"
framing — not the form it ships in today.** Three framings exist at different
strengths, and they are *not* equivalent: the production per-session push template
(`ai_router/prompt-templates/verification.md`) says *"evaluate objectively"*
(**weak**); Experiment A held both arms at *"meticulous, find every defect"*
(**moderate**, and constant across the contrast — so the context-access conclusion
is sound); the production pull template (`path-aware-critique.md`) says *"be a
genuine devil's advocate: assume the work is flawed and try to prove it"*
(**strong**). Operator field experience is that the strong framing **consistently
lifts push's catch rate** — a cheap, prompt-only lever **orthogonal** to the
"second provider buys nothing" finding (that finding is about provider *count*, not
framing). The three commitments below were forward intentions when the directive
was written; **Set 070 built all three** (see §5.2):

1. **Adversarial framing is the floor for push.** `verification.md` should be
   upgraded to the devil's-advocate framing pull already uses (a small `ai_router`
   change; own release-bearing pass).
2. **Steelman-push is a required control.** Any push-vs-pull comparison that feeds
   a RETIRE decision must run push at the strong framing — comparing
   adversarial-pull against objective-push is confounded and would retire push on a
   hobbled measurement. The DEMOTE evidence tested push at *moderate* and deploys it
   at *weak*; it had **never** been measured at *strong*.
3. **The instrument is a dual-surface ("overdetermined") verification mode**: at end
   of a sampled or opted-in session, run **both** push and pull (both adversarial)
   over the same committed state, merge findings **with provenance** (push-only /
   pull-only / both), and record the disjoint sets — that push-unique-vs-pull-unique
   high-severity tally is exactly the telemetry the RETIRE criterion above needs.
   Random sampling gives unbiased telemetry; operator/orchestrator opt-in gives a
   high-assurance mode for complex modernization work. This is the forward A/B the §2
   evidence always pointed to, and a standing `verificationMode`-pattern option.

### 5.2 Set 070 — the steelman-push upgrade and the dual-surface instrument (BUILT)

Set 070 (`ai_router` **0.24.0**) shipped all three §5.1 commitments. The push surface
is now measured at its adversarial best, and the head-to-head instrument exists:

1. **Steelman push — shipped (S1).** `ai_router/prompt-templates/verification.md` was
   upgraded from *"evaluate objectively"* (weak) to the devil's-advocate framing pull
   already uses (*"assume the work is flawed and try to prove it; a rubber-stamp is a
   failure"*, strong), preserving the machine contract `build_verification_prompt` /
   `parse_verification_response` depend on. A regression
   (`test_verification_framing.py`) pins the strong-framing language, so a future
   silent weakening trips a test. The standing per-session push now runs at its
   strongest form by default.
2. **The dual-surface ("overdetermined") mode — shipped (S1 + S2).**
   `ai_router/dual_surface_verify.py` runs the **push** arm (snippet-fed
   `route`/`call_model` over the committed diff, repo-blind) and the **pull** arm
   (`pull_route` repo-reading agentic loop) over the **same committed state**, with
   **provider, model, and framing held equal across arms** (a steelman of each
   surface, isolating *surface* as the only variable). Equality is **measured** from
   each arm's actual reported identity, not assumed; framing is classified from each
   template's single-source body so interpolation cannot spoof it. The two arms are
   merged **with provenance**: a finding is `both` only when both arms share a
   non-empty explicit `defectKey`, **never** on free-text wording (the Set 069 S6
   floor-ratchet lesson that a description is not an identity). The **safe direction**
   is enforced — an unkeyed defect both arms caught becomes two single-surface
   entries (conservative over-split that never *hides* a push-unique catch, which
   would bias RETIRE toward retiring push), and the artifact honestly flags
   `provenanceComplete=false` with per-surface unkeyed counts. The merge is captured
   as a validated `dual-surface-comparison.json`
   ([`dual-surface-comparison.schema.json`](dual-surface-comparison.schema.json),
   pure-Python validator at L-066-1 parity incl. cross-field provenance invariants).
3. **The fair-shake telemetry — shipped (S2).** `score_comparison` derives the
   push-unique / pull-unique / shared **high-severity** tally (reported as an *upper
   bound* when provenance is incomplete); `score_against_benchmark` scores that tally
   over the Set 069 pre-registered seeded + holdout benchmark (ground truth =
   `defectKey` is a registered case) and is **honest under power**: too few real cases
   forces an `INCONCLUSIVE` verdict even when `push_unique > 0`, unkeyed high-severity
   findings are excluded from the real tally, and **the gated push layer is never
   retired by this machinery** — it emits a recommendation toward the
   operator-confirmed decision, not the decision. `aggregate_retire_telemetry`
   **refuses to pool** `sampled` (unbiased) with `opt-in` (operational) runs.
4. **The mode, recorded and triggered (S2).** `dualSurfaceMode`
   (`off` / `sampled` / `opt-in`) follows the `verificationMode` / `pathAwareCritique`
   pattern: recorded **once at set start and immutable** in `activity-log.json` (a
   distinct entry kind, overloading neither existing enum). `should_run_dual_surface`
   takes an **injected** random draw (hermetic, deterministic) — `off` never runs,
   `opt-in` only on explicit request, `sampled` fires when the draw is below the
   sample rate (tagged `sampled`), while a deliberate opt-in under sampled mode is the
   operational `opt-in` tag (never folded into the unbiased telemetry). CLI:
   `python -m ai_router.dual_surface_verify record-mode | read-mode | score`.

**Telemetry status as of Set 070 (the honest number):** the instrument is built and
**dogfooded over this set's own diff** (a recorded `dualSurfaceMode: opt-in` run, the
operational high-assurance tag — see this set's `dual-surface-comparison.json`), but
**no powered benchmark-scored datapoint exists yet.** The dogfood is a single
self-referential run with no ground-truth defect labels, and the Set 069 seeded +
holdout benchmark is not yet populated with real-workload cases, so
`score_against_benchmark` is `INCONCLUSIVE` (underpowered, `real_cases = 0`) by
construction. Powered telemetry — the data the §5 RETIRE decision actually reopens on
— awaits the downstream **consumer-repo field pilots** (a complex modernization
project and the Access Harvester) that adopt 0.24.0 and accumulate sampled runs
against a populated benchmark. As of this set: **the measurement apparatus is ready;
the measurement has not yet run at scale, so RETIRE stays closed and the §5 honesty
caveats carry forward unchanged.**

---

## 6. Set 069 — the execution-backed evidence layer

The 0.22.x release exposed the ceiling's weak spot: the **automated**
`pull_critique` producer drove its critics **read-only** (`read_file` / `grep` /
`list_dir`), so it was a *commentator* where the **manual** critic (a frontier
model in an editor with a terminal) was an **evidence-producing probe runner** —
the manual run reproduced two Major bugs by executing code; the automated run
could not. Set 069 closed that gap by making the ceiling **executable**, built to
the operator-reviewed
[`proposals/2026-06-16-pull-architecture-capabilities/proposal.md`](proposals/2026-06-16-pull-architecture-capabilities/proposal.md)
panel synthesis and shipped in `ai_router` **0.23.0**.

**The reframe (the load-bearing idea).** The floor does **not** make execution
*safe* — containment does (the cage / the container). The floor makes the agent's
*claims* into **re-runnable falsifiers**, so trust never rests on the agent's
word. Every capability below is governed by the **deterministic-servant**
discipline: tools return raw ground truth, and the **orchestrator** applies the
evidence tag, **never the agent**.

### 6.1 The single execution-evidence protocol (S1)

`ai_router/evidence_protocol.py` defines one protocol both the manual and
automated critics share. A finding carries an **evidence tier** —
`REPRODUCED` / `ASSERTED` / `HYPOTHESIS` (default `ASSERTED`, additive) — that the
**orchestrator** stamps, never the agent. `REPRODUCED` is conferred only when a
servant-captured **transcript** (pinned ref, trusted `commandId` **XOR**
`templateId` + typed args, pristine-checkout status, exit, raw output, output
hash) **replays on a second pristine checkout and the output hash matches**. The
**meta-oracle rule** holds by construction: an executed finding must drive a
**real public entrypoint**, not an agent-built harness. The Set 066
validator/schema enforce it (`ARTIFACT_INVALID_EVIDENCE`): a `REPRODUCED` finding
lacking a valid replayed transcript is **invalid**.

### 6.2 The capability ladder, as built

The producer gained a **constrained evidence-generation lane** — all additive
(absent the new config, a critique is byte-for-byte the read-only Set 067/068
loop):

- **Trusted-command execution + diff-awareness (S2).** A critic may **trigger**
  an operator-authored **command id** in the disposable-worktree `run_test` cage
  (never author argv) and read `get_diff` (raw unified diff + changed paths).
  Loop depth is **blast-radius-budgeted**, not a magic constant.
- **The probe-template lane — "the missing middle" (S3).** Operator-authored,
  **versioned** probe harnesses the critic invokes with **typed, validated args**
  (`ai_router/probe_templates.py`). The narrowest lane that finds *novel-but-local*
  edge cases without authoring code — exactly the 0.22.x bug shape. Its seed
  library **dogfooded a still-latent instance of the 0.22.x `UnicodeError` class**
  (four readers in `path_aware_critique.py`), confirming the class-fix discipline
  (L-069-1).
- **The Podman model-authored-probe lane — rung (b) (S4).** The one lane where
  the model **authors the probe body**, so it runs **only inside a real Podman
  container** (`ai_router/podman_sandbox.py`: `--network=none`, read-only repo,
  tmpfs scratch, `--cap-drop=ALL`, crash-safe teardown, lane-labeled disk
  hygiene). Autonomous + severity-gated; the AI safety check is **triage-only**
  (may reject/escalate, never approve — the container is the boundary). Shipped
  **only because the §3.6 Podman feasibility spike came back GREEN** (6/6
  acceptance criteria, podman 4.9.3). **Central safety property:** a
  model-authored probe can **never** mint `REPRODUCED` — `_build_transcript`
  returns `None` for an authored execution, so the finding is **capped at
  `HYPOTHESIS`** (a container-backed suspicion a human verifies), and the S5
  ratchet is the only path that promotes it.

### 6.3 The ceiling → floor ratchet + the measured replacement gate (S5)

- **The quality-gated ratchet** (`ai_router/floor_ratchet.py`). A reproduced
  probeable defect yields a **candidate falsifier artifact** that is **never
  auto-merged**. Admission requires five mechanical gates (fails-on-old,
  passes-on-fixed on a *different* ref, drives a **public contract**, an N-run
  flake check, has-owner) **AND** human sign-off; a **rubber-stamp guard** rejects
  a human-approved candidate whose mechanical gate fails, so a brittle
  agent-authored test can never poison the deterministic floor. This is how a
  good autonomous (`HYPOTHESIS`) probe is graduated into a trusted template that
  *can* then mint `REPRODUCED`.
- **The measured replacement gate** (`ai_router/replacement_gate.py`). A
  **pre-registered** seeded + holdout (recent real misses, e.g. the two 0.22.0
  Major bugs) benchmark whose verdict is **derived, never hand-asserted** (recall
  / precision / replay-success / false-`REPRODUCED`), plus the gated-surface
  **telemetry** the §5 RETIRE-reopen decision waits on. Honesty rules:
  underpowered (`real_cases < minCasesForPower`) **forces** `meets_thresholds =
  False`; the **manual run is never retired** — the strongest recommendation the
  gate can emit is *reduce the manual cadence to a periodic backstop*, because the
  human watching execution remains the current defense against the meta-oracle
  problem.

### 6.4 What this changes about §5's open question

Set 069 does **not** retire anything: the manual whole-set critique and the gated
routed layer both stand. What it adds is the **instrumentation** §5 named as the
precondition for reopening RETIRE — the replacement gate's scoreboard and
telemetry are exactly the escaped-defect / catch-timing / rework / false-positive
/ predicate-miss signals §5 listed. The cadence decision is now **a measurement,
not a matter of faith** — but the measurement has not yet run at scale, so the
honesty caveats of §5 (small author-seeded instruments) carry forward unchanged
until the queued pilots (the two complex projects + the Access Harvester) supply
real-workload data.

Module map: `evidence_protocol.py` (S1) · `pull_critique.py` execution lanes +
`get_diff` (S2) · `probe_templates.py` (S3) · `podman_sandbox.py` +
`podman/Containerfile` (S4) · `floor_ratchet.py` + `replacement_gate.py` (S5).
As-built detail lives in
[`ai_router/docs/pull-verifier.md`](../ai_router/docs/pull-verifier.md).
