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
3. **Targeted — per-session routed verification, MANDATORY again** (Set 083,
   reversing the Set 068 S4 + S6 demote). The every-session cross-provider
   review runs on every Full-tier session with no skip: the 2026-07-06 UAT
   incident showed the gating predicate's verdict was only as honest as the
   path list the policed actor fed it. The predicate
   (`ai_router/routed_gate.py`) survives as an informational trigger report
   only. The layer's demonstrated value remains **early interception of
   migrating cross-file coupling defects at their introduction**.

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
- **Targeted — per-session routed, mandatory** (`python -m
  ai_router.verify_session`; Set 083, reversing the Set 068 demote). Runs on
  every Full-tier session at Step 6 of
  [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md) — no skip;
  the verification-integrity close gate refuses an unverified close, and the
  old gating predicate (`ai_router/routed_gate.py`) is informational only.
  As of Set 070 the
  push template it uses (`prompt-templates/verification.md`) runs at **strong
  adversarial framing** (§5.2), and as of Set 071 that strong framing ships with a
  **materiality "so what?" gate** plus a **Minor-non-blocking re-verify loop
  discipline** (§7) — the calibration layer the steelman-push framing needed so it
  catches real defects without manufacturing nit-churn. So the per-session routed
  layer is measured and deployed at its strongest *and* best-calibrated form.

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

> **Overtaken by Set 083.** The question below assumed the demoted (gated)
> policy would run long enough to collect telemetry; instead the demote was
> reversed and per-session routed verification is **mandatory** again. The
> RETIRE question is closed in the opposite direction — the direction of
> travel was toward *more* per-session verification, not less. This section
> is preserved as the historical framing of what the demote-era open
> question was.

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

---

## 7. Set 071 — the materiality gate + the nitpick-churn loop discipline

Set 070 gave **both** reviewer surfaces their strongest devil's-advocate framing
(steelman push, **L-069-2**). The operator's field test of that framing (in the
`kick-the-orchestrator-tires` repo) confirmed it works **and** surfaced its
predicted side effect: strong framing with **no materiality bar** sometimes
**manufactures a Minor / false-positive finding** rather than return clean — and
the re-verify loop then **churns rounds on it**. The canonical observed instance
was three consecutive remediation rounds spent on `pytest` vs `python -m pytest -v`,
a distinction with **no behavioural difference**, on work that was correct. Strong
framing is the *right* lever (it lifts the real-defect catch rate, §5.1); the
missing piece was a **calibration layer** that stops it spinning on immaterial
points — added **without** weakening the framing (L-069-2 is a hard constraint).
Shipped in `ai_router` **0.25.0**.

### 7.1 The three additive layers

1. **A materiality "so what?" gate in both reviewer templates (S1).** Both
   `prompt-templates/verification.md` (push) and `prompt-templates/path-aware-critique.md`
   (pull) gained: the three-part blocking test (a blocker must state the **exact
   requirement/claim violated**, the **concrete impact**, and the **evidence** — a
   finding that cannot produce all three is a nit, not a blocker); an explicit
   **anti-nitpick clause** (a correct+complete response *should* be VERIFIED;
   manufacturing a Minor to avoid a rubber-stamp is **itself** a false-positive
   failure; judge **semantic equivalence**, not textual identity, unless the exact
   text *is* the contract — the `pytest` case is named as a worthless finding); the
   **severity anchor** (Major = *would change a reasonable reviewer's merge
   decision*) + a **plausible-path-to-harm escalation** (*to call it Minor you must
   be confident there is no plausible path to a Major/Critical failure; when in
   doubt, escalate*); and a non-blocking **`NITS`** output section so true-but-
   immaterial observations have a home that does not trip the loop. The strong-
   framing pins (`test_verification_framing.py`) stay green and
   `dual_surface_verify.classify_framing_strength` still returns `ADVERSARIAL` for
   both templates — the edits are provably additive, so the dual-surface
   equal-framing gate (§5.2) is undisturbed.
2. **A severity-anchored blocking classifier in `verification.py` (S2).**
   `is_blocking_verdict(verdict, issues)` (and `classify_blocking(...)` for the
   blocking-vs-nit partition + a log reason) derives the *blocking* decision from the
   **severity of the findings it is given, NOT the bare verdict token**: given a
   findings list, ≥1 Critical/Major (or any unknown/missing-severity) finding
   **blocks regardless of the verdict token passed alongside it** — so a Major handed
   to it under a `VERIFIED` token still blocks; a **Minor-only / nits-only** list is
   recorded but **non-blocking** (effectively VERIFIED for the loop). The two
   surfaces reach that classifier differently, and the difference is load-bearing:
   the **pull** surface passes structured `pull_verifier.Finding` severities (always
   populated, so the anti-laundering net is live there and for any direct caller),
   while the **push** parser `parse_verification_response` **trusts a `VERIFIED`
   token and returns no findings at all** (it deliberately does *not* re-scan a clean
   review's prose for a hidden Major — that would reintroduce the churn this set
   kills; operator-adjudicated in S2). So on the push surface the classifier's
   "blocks regardless of token" guarantee bites on the **`ISSUES_FOUND` path**
   (a mislabeled-severity or unparsed finding still blocks), **not** on a push
   `VERIFIED` verdict, which is trusted. `parse_verification_response`'s `(verdict,
   issues)` contract is unchanged; `parse_nits` reads the new `NITS` section for
   observability only (nits never enter the issues list). The classifier itself is
   **surface-agnostic** (one blocking decision over any severity-bearing findings),
   and it is **wired** onto `VerificationResult` (`.blocking` / `.nits`) so the
   re-verify loop reads `result.verification.blocking` rather than the bare token.
3. **The re-verify loop discipline in the workflow doc (S2).**
   `docs/ai-led-session-workflow.md` Step 6 gained *Materiality and the re-verify
   loop discipline (Set 071)*: a Minor-only round opens **no** remediation round; a
   round continues only on **new or unresolved Critical/Major**; and a **cross-round
   issue ledger** (`reconcile_issue_ledger`) marks prior blockers RESOLVED/UNRESOLVED
   and **refuses to resurrect a settled point under fresh wording** (the exact churn
   pattern above) — keyed on a stable `issueId`, not free text. The existing **1–2
   automatic / 3+ human** bound is unchanged; this only narrows *what counts as a
   round-justifying finding*. Scope, stated precisely: the **blocking predicate** is
   surface-agnostic (§7.1.2 — one decision over push *or* pull findings), while the
   **Step-6 re-verify loop discipline** is wired into the routed `api` re-verify loop
   and the Lightweight Mode-B verify→remediate loop (the two loops the workflow doc
   names); because the predicate is surface-agnostic, the same blocking decision is
   also available to a pull/path-aware critique loop.

### 7.2 The anti-laundering guardrail (why Minor-non-blocking is safe)

Making Minor non-blocking risks a real bug being mislabeled Minor and waved
through — the shared failure mode the scoping consult (GPT-5.4 + Gemini-Pro,
2026-06-18) flagged. Three mechanisms keep the demotion honest: (a) the **merge-
impact anchor** forces Major to track *would-a-reviewer-change-their-merge-
decision*, not surface polish; (b) the **plausible-path-to-harm escalation**
makes Minor a claim of *no plausible path to a Major/Critical failure*, escalating
when in doubt; (c) `is_blocking_verdict` treats a finding of **unknown/missing
severity** and a **non-VERIFIED result that parsed to no findings** as **blocking** —
a real defect that reaches the findings list cannot be laundered into a nit by an
absent label.

The honest scope of (c): it operates on the **findings list the classifier is
given**. On the **pull** surface and for direct callers that list carries real
severities, so the net catches a mislabeled Major. On the **push** surface, the
guardrail is load-bearing on the `ISSUES_FOUND` path — but a push `VERIFIED` token is
**trusted** (the parser returns no findings and does not re-mine prose for a hidden
Major), so the push surface's protection against a *Major-emitted-under-VERIFIED* is
the verifier's own materiality-gated judgment + the strong framing, **not** a
post-hoc prose re-scan. This was the deliberate S2 trade-off (operator-adjudicated):
re-scanning a clean VERIFIED review's prose for severity words reintroduced exactly
the false-positive churn this set exists to remove, so the push surface trusts its
token and the structured-severity net does the anti-laundering work where severities
are actually present.

### 7.3 The verdict grammar — binary, kept

The scoping consult diverged on grammar: Gemini proposed a third verdict state
(`VERIFIED_WITH_NITS`); GPT proposed **keeping the binary** `VERIFIED` /
`ISSUES FOUND` grammar and making blocking-ness a derived predicate. Set 071's S2
operator decision point routed a fresh cross-provider consult (GPT-5.4 + Gemini-Pro
independently, then a fresh-Claude synthesis) — **unanimous binary** — and adopted
the refinement that `is_blocking_verdict` be a first-class, fully-tested, documented
contract artifact (the bare token is **not** sufficient to infer blocking). Binary
preserves the machine contract `parse_verification_response` and the Set 070
framing-pin test depend on, with no parser/envelope change. The churn fixture (the
verbatim three-round `pytest`-vs-`python -m pytest -v` sequence) is pinned in
`test_blocking_classifier.py` as a regression that must classify **non-blocking**.

### 7.4 What this changes about the program

Nothing is retired or demoted here — Set 071 is a **calibration** layer on the
verification surfaces Sets 065–070 built. It removes the failure mode that would
otherwise have made the strong-framing push (§5.2) and the path-aware ceiling (§3)
noisy in practice: a verifier that keeps its strong adversarial framing — and so
keeps catching the real cross-file/correctness defects — but no longer manufactures
immaterial findings or churns re-verify rounds on nits, because a finding must clear
a merge-impact materiality bar to block and a settled point can never be resurrected
under fresh wording.

Module map: `prompt-templates/verification.md` + `prompt-templates/path-aware-critique.md`
(S1) · `verification.py` (`is_blocking_verdict` / `classify_blocking` / `parse_nits`
/ `reconcile_issue_ledger`, S2) · `ai-led-session-workflow.md` Step 6 (S2) ·
`tests/test_blocking_classifier.py` + `test_verification_framing.py` (S1–S2).

---

## 8. Set 072 — the provider×surface matrix instrument + the verification-only application mode

Set 070 built the dual-surface instrument to **hold provider equal across arms** (§5.2)
— deliberately, so that *surface* is the only variable and the equal-arms artifact is
clean RETIRE evidence. That design has a blind spot it was never meant to see: it cannot
measure whether **provider and surface interact**. An independent operator-run field
study (`../kick-the-orchestrator-tires/docs/study-findings.md`, 18 push-vs-pull runs
across its sets 002–005) found exactly that interaction, and it is the strongest finding
in the study:

- **Push won on incisiveness — but only on small, snippet-fittable diffs**, and the
  study flags it would likely **flip toward pull on a large diff** (its #1 caveat).
- **Use both surfaces, always** — push/pull *disagreement* is itself diagnostic of which
  arm had repo/spec context.
- **Provider × surface interact (the headline).** Gemini: strong on push, *quiet on
  pull*. GPT: reliable on both. Anthropic: highest ceiling, lowest reliability. The
  study calls our live default (`push = gpt-5-4` / `pull = gemini-2.5-pro`) the **single
  weakest pull configuration**. (Since Set 084 the push verifier is chosen by dynamic
  exclusion of the orchestrator's effective provider rather than a static pin; `gpt-5-4`
  remains the resolved push verifier for a Claude/Anthropic orchestrator, so the study's
  characterization stands.)

So the strategy must now record an honest correction: **surface is *not* fully orthogonal
to provider.** §5.2's equal-arms mode held provider constant precisely to keep its RETIRE
telemetry uncontaminated — that remains the right instrument for the RETIRE decision — but
it cannot answer "which provider should run which surface," and the field study says the
answer is non-trivial and our live default may be underweighting pull. Set 072 adds the
instrument that *can* answer it, shipped in `ai_router` **0.26.0**.

### 8.1 The opt-in matrix-mode seam (S1)

`dual_surface_verify.run_dual_surface` gained optional per-arm `push_provider` /
`pull_provider` / `push_model` / `pull_model` params. When any is set, `matrix_mode` is
on: each arm resolves its provider/model independently, the **strong adversarial framing
gate stays on both arms** (L-069-2 — the matrix varies *provider*, not framing), and the
provider/model **equality refusal is skipped**, with the divergence recorded as
*intentional* (`mode: "matrix"`, `intentionalDivergence: true`, plus the requested
per-arm identities). With **no** per-arm params the equal-arms steelman default is
**byte-for-byte unchanged** and still raises `UnequalArmsError` on accidental divergence.
`COMPARISON_SCHEMA_VERSIONS → (1, 2)` (schema `1` still accepted; `2` requires `mode`).
Crucially, `_arms_held_equal` was **strengthened** to reject a matrix artifact as RETIRE
evidence: a matrix run is a *per-cell instrument*, never the equal-arms RETIRE-telemetry
path (§5.2 stays the only RETIRE-evidence surface).

### 8.2 The verification-only application mode (S2–S3)

`ai_router/verification_only_app.py` is a **thin orchestration over `run_dual_surface`
(matrix mode)** — no arm logic of its own — pointable at an **already-built external**
target repo via the runner's `sandbox_dir` seam. The operator decision behind it: rather
than burn tokens on another *synthetic* provider×surface study over toy diffs, point a
systematic matrix at a **real built solution** (first target `../dabbler-access-harvester`).
Its large cross-file diffs close the study's snippet caveat *for free*, every run does
*useful* verification work, and the provider×surface telemetry falls out as a byproduct.
Philosophy: **ship a best-guess-optimized verification process now; refine the defaults as
real telemetry accumulates** — no synthetic confound-set gate.

The honest read of an already-built target: this is a strong test of **cost / noise /
false-positive rate / which surface surfaces residual hard-to-find issues**, and a *weak*
test of raw finding power (full finding-power wants a greenfield build — a future track).
The mode is built so the confounds it does **not** vary yet (orchestrator provider; a
future push/pull broker) are **stamped into telemetry** now, keeping later data comparable.

- **`run_verification_matrix`** runs one matrix-mode `run_dual_surface` call per
  `MatrixCell` (push×pull cross-product); a failing cell is recorded as a `SkippedCell`
  so one provider failure never aborts the matrix (the producer-skip discipline,
  L-067-1). It writes **two distinct outputs of one run**:
  1. `verification-matrix-report.json` — the **experimental, per-cell** artifact, with
     `CellTelemetry` stamping every confound (orchestrator provider/model, push & pull
     provider/model, per-arm framing strength, surfaces run, diff size/shape,
     `push_broker` / `pull_broker = "none"`). `validate_matrix_report` holds L-066-1 parity.
  2. `remediation-report.{json,md}` — the **fixer-facing, consolidated** artifact:
     `build_remediation_report` merges the run's cell findings via the Set 070
     `merge_findings` provenance merge (`push-only` / `pull-only` / `both`), dedups by
     stable finding key, severity-ranks, and retains file/location / impact / evidence /
     provenance while dropping the experiment metadata. This is the deliverable the
     target repo remediates from **without re-running verification** (§8.4).
- **The cross-run aggregator (S3).** `aggregate_remediation_reports` rolls up N per-run
  remediation reports over **one** target (a `MixedTargetError` guard refuses a
  mixed-target set) into `remediation-backlog.{json,md}` — the end-of-exploration handoff.
  It re-runs `merge_findings` across runs keyed by stable `defectKey` (max severity, union
  provenance/surfaces) and annotates each finding with **corroboration = the count of
  *distinct* runs** that surfaced it — a finding caught by multiple provider×surface
  configs carries that cross-config agreement as a confidence/priority signal. An unkeyed
  finding is its own single-run group and **never corroborates** (safe over-split — it can
  never inflate confidence). `validate_remediation_backlog` holds L-066-1 parity.

### 8.3 Per-cell telemetry and the best-guess defaults

This set **measures**; it changes **no** keep/demote/retire posture and **no** live
`router-config.yaml` default pull provider (§5.1's RETIRE precondition still stands; the
Gemini-pull cell is an *experiment cell*, not a default change). The shipped best-guess
matrix defaults are documented commentary-only under `pull_verifier.verification_only:` in
`router-config.yaml` (no new behavioral knob): both arms strong framing; pull = GPT
reliable default; push = Anthropic or GPT; and **the first run includes a
Gemini-on-pull-under-strong-framing cell** — the load-bearing first datapoint. The field
study found Gemini *quiet on pull*, but it compared whatever framing each harness shipped;
our pull template is now strong devil's-advocate (`classify_framing_strength →
ADVERSARIAL`), so "Gemini-quiet-on-pull" may already be a fixed framing artifact. That is
cheap to check, and **the load-bearing acceptance check for this set's first external run
is that the Gemini-pull cell returns a verdict, not silence** (if it is silent, *that is
the datapoint* — recorded, with the live-default pull-provider decision held).

### 8.4 The consumer-handoff model

The verification-only mode formalizes a division of labor between the canonical repo and a
consumer target:

> **Canonical runs the verification; the target remediates from the report and never
> re-runs verification.** Canonical points the matrix at a built target, does the real
> verification work, and emits the consolidated `remediation-report` (and, across many
> runs, the `remediation-backlog`). The target repo (e.g. harvester) **consumes that
> report for remediation directly** — it does not re-run the matrix, the dual-surface
> runner, or the path-aware critique. Exploration produces a usable fix-list, not just
> telemetry.

This is what makes the cost honest: the tokens spent measuring provider×surface
interaction are *also* the tokens that produced a real, deduplicated, severity-ranked,
corroboration-annotated fix-list the target acts on.

### 8.5 What this changes about §5 (and what it does not)

Nothing is retired or demoted. The equal-arms dual-surface mode (§5.2) remains the
**only** RETIRE-evidence surface — `_arms_held_equal` now actively refuses to let a matrix
artifact masquerade as that evidence. What Set 072 adds is the **second instrument** the
field study showed was missing: the equal-arms design isolates *surface* and is blind to
*provider×surface interaction*; the matrix mode measures that interaction, on **real built
diffs** rather than synthetic ones. The two are complementary, not competing — equal-arms
answers "does push earn its keep," matrix answers "which provider should run which
surface." Both honesty caveats of §5 carry forward unchanged: the RETIRE decision still
waits on powered equal-arms telemetry, and the matrix defaults are *best-guess*, to be
refined as real per-cell telemetry accumulates.

Module map: `dual_surface_verify.py` (matrix seam + `_arms_held_equal` strengthening, S1)
· `verification_only_app.py` (`run_verification_matrix` / `CellTelemetry` /
`build_remediation_report` / `aggregate_remediation_reports` + validators + CLI, S2–S3) ·
`path_aware_critique.py` + `dedicated_verification.py` (L-069-1 sibling-reader hardening,
S1) · `docs/verification-matrix-report-schema.md` + `docs/remediation-report-schema.md` +
`docs/remediation-backlog-schema.md`. As-built detail lives in
[`../ai_router/docs/pull-verifier.md`](../ai_router/docs/pull-verifier.md).

---

## 9. Set 073 — the second cross-target datapoint and the Gemini-pull replication verdict

Set 072 built the matrix instrument (§8) and ran it **once**, on
`../dabbler-access-harvester`. That single run produced one load-bearing observation —
the field study's "single weakest pull configuration," **Gemini-on-pull under strong
framing, returned a clean verdict, not silence** — but **N=1** supports no
provider×surface *interaction* conclusion. Set 073 ran the **same matrix** (`push =
anthropic/sonnet × {pull = openai/gpt-5.4, pull = google/gemini-2.5-pro}`, both arms
strong `adversarial-devils-advocate` framing, L-069-2 held; orchestrator
`anthropic/claude-opus-4-8`) against a **second, independent built target**
(`../dabbler-platform`) over a deliberately **code-focused** diff range, turning the one
datapoint into two. **This set shipped no `ai_router` code and no release** — it is an
application/telemetry set (the conditional template fix did not fire; see §9.3). The S1
run artifacts live under
[`session-sets/073-cross-target-verification-telemetry/platform-run/`](session-sets/073-cross-target-verification-telemetry/platform-run/)
and the side-by-side analysis in
[`cross-target-comparison.md`](session-sets/073-cross-target-verification-telemetry/cross-target-comparison.md).

### 9.1 The Gemini-pull replication verdict — non-silent REPLICATED (N=2), finding-yield gap not refuted

**On both independent targets, the Gemini-pull-under-strong-framing cell returned a clean
`VERIFIED` — a verdict, NOT silence.** The Set 072 N=1 harvester observation now has an
independent second datapoint on `dabbler-platform`. The **verdict-not-silence** property
of `pull = gemini-2.5-pro` under our strong devil's-advocate pull framing **replicates**.
That is consistent with the §8.3 hypothesis that the field study's "Gemini quiet on pull"
was at least partly a **framing artifact** (the study compared whatever framing each
harness shipped; our pull template classifies `ADVERSARIAL`).

**The honest nuance — what did *not* replicate as a win.** Replication is of the
*verdict-not-silence* property only, **not** of finding power. On the one target that had
real pull findings to surface (platform), **Gemini-pull returned 0 findings while GPT-pull
returned 2 Major contract-drift findings over the same repo**. So the field study's
*finding-yield* gap (Gemini lower-yield on pull than GPT) is **not refuted** by this run —
Gemini-pull is non-silent but, here, lower-yield than GPT-pull. The record is therefore:
**"non-silent: replicated (N=2); relative finding-yield: Gemini-pull still trails GPT-pull
on the target that had real pull findings."**

**This does not move the live default.** Even a cleanly replicated non-silence result is
N=2 on a single property, and the finding-yield read actually *cautions against* promoting
Gemini to the default pull slot on this evidence. The live `router-config.yaml` default
pull provider stays **held** exactly where Set 072 left it (§5.1 RETIRE precondition and
§8.3 both stand) — the default-change decision waits for accumulated telemetry in a later,
dedicated set, not for this datapoint.

### 9.2 Push-blindness contrast across the two targets

Both runs' diffs measured `elided=true` at the same ~61 KB push size budget, so neither
push arm saw the *whole* committed diff. The cross-target value is in **what the elision
dropped**:

- **harvester (Set 072)** — the underlying change was dominated by a ~23.7k-line
  golden-output regeneration, so the elided-away bulk was **generated noise**; push
  reviewed a mostly non-load-bearing snippet and **pull was the load-bearing surface**
  (the field study's #1 caveat: push flips toward pull on large diffs).
- **platform (Set 073)** — the Set 072 harvester lesson was applied deliberately: a
  **source-dominated** `.cs` feature range (`82a95ab..d66c449`, a new
  `tools/Dabbler.CrudSlice` CLI + its tests + 2 consuming `src/` files, no
  golden/`.db`/`pack-output` files dominant) was chosen, so the elided snippet was **real
  source** — and push surfaced a Major in Cell A. Push was **less blind** on platform than
  on harvester, even at the same elided budget.

So the pair gives a clean contrast: **push non-load-bearing on a golden-dominated diff vs.
push a genuine reviewing surface on a source-dominated diff**, both at the same ~61 KB
budget — concrete confirmation of the study's "push flips toward pull on large diffs"
caveat *and* of why the code-focused-range discipline matters. (A secondary observation:
the two platform push arms used the identical provider/model/diff yet returned different
verdicts — Cell A `ISSUES_FOUND`, Cell B `VERIFIED` — ordinary single-shot push
non-determinism, a reminder that the **consolidated remediation report**, which unions both
cells' findings, is the right unit, not any single cell's verdict.)

### 9.3 The pull-template instruction-tension meta-finding did NOT recur → no template fix, no release

Set 072's harvester run surfaced **one** Minor pull-only *meta*-finding: GPT-pull complained
about a tension in our own pull template (mandatory early verdict submission vs. mandatory
inspect-first workflow). Set 073 spec item 5 made a pull-template fix **conditional on
recurrence** (a 2nd context). On platform, **GPT-pull emitted substantive contract-drift
findings instead — the instruction-tension meta-complaint did not reappear.** The
meta-finding is therefore a **single observation (N=1), not a recurring pattern.** Per the
recurrence gate, Set 073 **records the single observation and ships no template change and
no release** (`classify_framing_strength` stays `ADVERSARIAL` either way — nothing touched
it). If a future run surfaces the same tension a second time, the conditional fix reopens.

### 9.4 The cross-target aggregator, exercised on real independently-produced inputs

Set 073 S1 ran the §8.2 cross-run aggregator (`aggregate_remediation_reports`) on a **real,
independently-produced** remediation report for the first time (not a fixture): the platform
report rolled into `platform-run/remediation-backlog.{json,md}` (`runCount=1`, 3 findings,
every `corroboration=1` — a single run cannot corroborate), round-tripping
`validate_remediation_backlog` (`report-ok`). The **`MixedTargetError` contrapositive** was
also confirmed on real inputs: handing the aggregator the harvester report *and* the platform
report together was correctly refused (`a backlog spans exactly one target`). There is
therefore **no merged two-target backlog** — impossible by construction and out of scope per
the spec; the cross-target view is the side-by-side `cross-target-comparison.md`, not a single
mixed fix-list. Two of the three platform findings (a dead `docs/ai-led-session-workflow.md`
SSOT link; a docs↔packaging inconsistency omitting `Dabbler.Api.Querying`) are exactly the
**consumer-handoff value** (§8.4): real repo-state findings `dabbler-platform` can remediate
directly from the report without re-running verification.

### 9.5 What this changes about the program (and what it does not)

Nothing is retired, demoted, or re-defaulted. Set 073 is **measurement**, not a posture
change. It converts the Set 072 N=1 Gemini-pull observation into a **replication test on an
independent built target** (non-silence replicates, N=2; finding-yield gap not refuted),
exercises the cross-target aggregation path on real data, and produces a usable remediation
report `dabbler-platform` acts on directly — while holding every not-yet-earned decision (the
live default pull provider, RETIRE) exactly where Set 072 left it. Both §5 honesty caveats
carry forward unchanged: the RETIRE decision still waits on powered **equal-arms** telemetry
(the matrix is not RETIRE evidence — `_arms_held_equal` refuses it), and the matrix defaults
remain *best-guess*, now refined by **one** additional real per-cell datapoint toward the
comparable corpus §8 says they will eventually be tuned on.

Record: [`session-sets/073-cross-target-verification-telemetry/`](session-sets/073-cross-target-verification-telemetry/)
(spec, `platform-run/` artifacts, `cross-target-comparison.md`, `change-log.md`).

## 10. Set 075 — the greenfield finding-power pilot (set up, not answered)

Set 075 stands up a pilot to measure **raw finding power** on fresh, not-yet-verified
work. Where Sets 072–073 measured cost and noise on **already-built, already-remediated**
diffs — so the defects were already removed before the matrix ran — this set moves the
matrix to **Step 6, before remediation**, to capture yield while real defects are still
present. The pilot measures **relative finding yield + precision against the adjudicated
union of all findings — not true recall** (unknown-unknowns are invisible; the adjudicated
union is a measurable proxy denominator, never the true defect set). Set 075 is a
protocol-and-rollout set only: it ships **no `ai_router` code and triggers no release**,
and it does **not** itself produce a finding-power verdict — a **future canonical synthesis
set** scores the accumulated telemetry, the same data-gated pattern as RETIRE.

### 10.1 Canonical assets and protocol

Session 1 authored the canonical protocol assets. The core protocol is
[`greenfield-matrix-protocol.md`](greenfield-matrix-protocol.md), which establishes
**D1** pre-remediation timing, **D2** per-arm scoring metrics (TP, FP, precision,
share-of-adjudicated-union, unique-TPs, cost-per-TP), **D3** a record-then-remediate
artifact freeze, **D4** doc-only exclusion, and **D5** the committed telemetry layout +
the required `metadata.json` contract. It is supported by a reusable instruction block,
`ai_router/prompt-templates/greenfield-matrix-addendum.md`, and a fixed scoring guide,
[`greenfield-adjudication-rubric.md`](greenfield-adjudication-rubric.md).

### 10.2 Pilot cohort enablement

Session 2 enabled the initial cohort, each consumer repo committing its own integration
(router pin → `>=0.26.0` + the addendum wired into its `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`).
The **LEAD** signal is `dabbler-platform` (`access-migration-generator-consumption`),
whose source-dominated C# diffs are the primary measurement surface. `dabbler-access-harvester`
(`019-...-dotnet-tool-packaging`) provides a **SUPPORTING but CONFOUNDED** signal — its
small packaging diffs are snippet-fittable and favor push for the wrong reason.
`dabbler-access-migration-orchestrator` is **DEFERRED** from the finding-power pool — its
doc-only diffs would starve the push arm and poison the push-vs-pull comparison; an optional
pull-only sidecar is permitted only when tagged `diffClass=docs-only-excluded` /
`includedInFindingPower=false`.

### 10.3 Validity threats and mitigations

The protocol design carries two mitigations against known validity threats. To counter
**selection bias from diff mix** (small packaging diffs favor push; large cross-file source
diffs favor pull), telemetry is **stratified by `diffClass`** (`source-dominated`,
`packaging-small`, `docs-only-excluded`), reported per stratum, with the platform repo
treated as the lead signal. To counter **adjudication drift**, orchestrators adjudicate
from a **provider-blind consolidated `remediation-report.md`** against the **fixed rubric**,
so no high-status provider biases the true/false-positive calls (L-073-1's
stay-within-the-evidence discipline applies to the per-finding verdicts).

### 10.4 Matrix and posture (everything not-yet-earned stays held)

The pilot keeps the established **2-cell** matrix — `push:anthropic × {pull:openai,
pull:google}` — for corpus continuity with Sets 072–073, including the load-bearing
Gemini-pull-under-strong-framing cell from §9. Per **L-069-2** the matrix varies
**provider, not framing** — both arms stay strong adversarial. Set 075 changes **no
posture**: the live default pull provider and the RETIRE decision remain exactly where
Sets 072–073 left them. The matrix is still **not RETIRE evidence** (`_arms_held_equal`
refuses a matrix artifact); RETIRE still awaits powered **equal-arms** telemetry
(§5.1, §5.2). Defect seeding — which would permit a true recall estimate — is a designated
**fast-follow**, not part of this pilot.

Record: [`session-sets/075-greenfield-finding-power-pilot/`](session-sets/075-greenfield-finding-power-pilot/)
(spec, `greenfield-matrix-protocol.md`, the addendum, `greenfield-adjudication-rubric.md`,
`telemetry/`).
