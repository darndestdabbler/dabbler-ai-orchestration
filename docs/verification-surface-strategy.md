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
   snippet-fed (Mode-1 *push*) verifier structurally cannot see.
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
  skipped call is an auditable decision, not a silent omission.

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
