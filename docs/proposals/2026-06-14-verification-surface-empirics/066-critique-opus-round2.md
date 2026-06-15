# Set 066 Decomposition Critique — Round 2 — Opus

> Independent third-panelist verdict. Produced with full read access to the
> repository — I read `proposal.md` (esp. the Erratum, §1, §7, §9),
> `forward-ab-design.md`, `spike-report.md`, and
> `docs/planning/session-set-authoring-guide.md` directly, and verified the
> code anchors myself (`ai_router/providers.py`, `ai_router/__init__.py`,
> `ai_router/dedicated_verification.py`, `ai_router/close_session.py`,
> `ai_router/worktree.py`). This is my own reasoning from those files; the
> repo wins over any summary. I honor the round-1 settled constraints handed
> to me (parallel `pull_route()` seam; A/B are separate harnesses; bindings and
> the `run_test` sandbox are separate sessions; Full-tier wiring is net-new; no
> release bundled with an unsettled routed-fate decision) and independently
> confirmed the code behind them.

## Verdict at a glance

- **Pick:** a **better option than A/B/C — call it D** — a clean three-set
  roadmap. **066 ships the *feature*** (manual, **tier-orthogonal** Path-Aware
  Critique policy + release); **067 builds and capability-validates the
  *adapter*** (engine + Experiment A); **068 runs the cadence study +
  routed-fate + the contract gate**.
- **Fork status: dissolved.** Q3 is *yes* — shipping the feature does **not**
  require the adapter, so "build the engine" and "ship the feature" are simply
  different sets.
- **Strongest rival: Option A** (engine + feature + release all in 066). It
  loses on *risk-staging* and *sizing*, and the place it is weakest is exactly
  the property the proposal cares most about (multi-provider).

---

## 1. Which option (A / B / C, or a better one)?

**A better one — Option D.** The A/B/C trilemma assumes 066 must choose between
*building the engine* and *shipping the feature*. Q3 collapses that: the feature
is **separable from the adapter at the code level**. `providers.call_model` is a
single-shot text-in/text-out call (`ai_router/providers.py` ~L43; body L35–77),
and `route()`/`verify()` expose **no** tool-loop or parallel-pull entrypoint
(`ai_router/__init__.py`) — so the Mode-2 adapter is a distinct future seam
(`pull_route()`), and *requiring a path-aware critique before close* is plain
per-set config + close-out wiring that is **independent of how the critique is
produced**. The proposal says exactly this in its own voice: §1 row (c) and
Candidate 4 — "**institutionalize the manual critique now** … build a first-party
tool-loop adapter as the primary Mode-2 engine"; Candidate 1's "where it lands"
axis — "out-of-band … **manual today, adapter later**"; Candidate 4 — "Manual is
proven now (harvester already adopted it)." The manual flow is not hypothetical:
the proposal's own **Erratum** was produced by a manual path-aware review
(Copilot driving GPT + Gemini over the repo), and this very critique is another
instance of it. So 066's first consumer is the **manual feature**, and the
adapter is *later automation behind an already-shipped surface*. That cleaves the
proven, low-risk feature off from the unproven, multi-provider engine — the
correct cut.

**The one correction the option must carry:** the feature is **tier-orthogonal**,
not a "Full-tier feature." Candidate 1's verdict locks it — "Tier-orthogonal (not
a Full-tier bolt-on — Lightweight's existing out-of-band-or-none mode is already
this shape)." The Erratum's phrase "Full-tier … close-out wiring is net-new work"
is true **because the existing `dedicated-sessions` gate is Lightweight-only**
(`dedicated_verification.py` ~L441 "inert on Full tier"; `close_session.py` ~L1709
fires only when `verificationMode == dedicated-sessions`), so wiring path-aware
critique into the Full-tier close path is net-new — **not** because the attribute
is Full-tier-specific. 066 implements `pathAwareCritique: none | advisory |
required` tier-orthogonally; the net-new wiring is the cost of reaching the
Full-tier close path the Lightweight machinery never covered.

Why not the catalogued options (sizing detail in Q4):

- **A** (engine + feature + release in 066, ~5→6): ships the never-run
  OpenAI/Gemini bindings to **PyPI** before any cross-provider validation, and
  ties the proven feature's release to the unproven engine. Coherent, but it
  couples proven value to unproven risk.
- **B** (engine + feature + Experiment A + release, ~6): breaches the sizing band
  by cramming one of two **non-substitutable** experiments into the product set.
- **C** (engine + Experiment A, **no feature, no release**, ~4): disciplined, but
  once the fork dissolves a consumed release is *safe*, so withholding all
  release and delaying a §1(a)-adopted feature a full extra set is unjustified
  latency — and it puts the feature in 067, which the **Erratum** (the newest
  word in the file) contradicts: "Set 066 scopes it accordingly."

## 2. The strongest counterargument — engaged

The strongest case against D is the **§9 + cohesion argument**, in two prongs:

**(a) "§9 sequences adapter → A/B → ship-feature, and step 3 ships the feature
*'wiring the adapter as the automated path'* — so a purely-manual 066 ships
something *thinner* than §9's 'Ship Path-Aware Critique', and inverts §9's
order."** This is the real bite. Answer: §9's numbered list is *suggested*
sequencing across **future sets**, and "Steps 1–3 are committable now" uses "now"
in the **planning** sense (the evidence is sufficient; not data-gated) — not
"ship this set." Two newer, more specific signals govern the bare ordering: (i)
the **Erratum (dated 2026-06-15, after the proposal body)** names **Set 066** as
the set that scopes the feature's net-new wiring — putting the feature *in* 066;
and (ii) **§9 itself** says the A/B (step 2) "is the gate for **step 4**"
(routed-fate) — *not* a gate for step 3 (the feature). So shipping the feature
before the A/B carries **no ordering hazard**: the A/B is a downstream
capability/cadence *measurement* about **routed**, not a gate on whether the
feature should exist (`forward-ab-design.md`: "Exp A alone only rules out a
*capability* defense"). Shipping the manual form first is a *defensible
re-reading* — provided it is **honestly labeled** "ship the policy gate, defer the
automated engine," not mis-sold as §9-step-3's full form.

**(b) "A manual gate ships a `required` close-out check with *nothing behind
it*."** Two reasons this fails. First, the enforcement mechanism is **not**
nothing — it is the **operator-run multi-provider critique**, proven (12 unique
catches incl. two Criticals in the S1 bake-off) and already operating (this
review; the Erratum it produced). The adapter only *automates* it later. Second,
the wiring is **real engineering**: the Erratum kills the "free reuse" premise, so
066 builds a net-new content-aware close-out gate plus the tier-orthogonal per-set
attribute, the `P_set = any(P_task)` blast-radius predicate, the saved-artifact
contract, and a cross-provider-verified close check — structurally the **same
shape as `verificationMode: dedicated-sessions`** (which already shipped as a real
release). So 066-as-feature is a legitimate, in-band engineering set, not a
documentation no-op.

**The other-direction counter — "if manual ships in 066, why not *also* build the
adapter there (= Option A)?"** Because the dissolution that makes A *possible* also
makes its coupling *gratuitous*: with no engineering dependency forcing feature
and adapter together, bundling them only (i) busts the band (5→6 under the
Erratum's heavier-than-scored wiring), (ii) ships the **multi-provider** engine —
the proposal's load-bearing "path-aware **AND** multi-provider" property (the
010-vs-C3 split that proves a single provider is insufficient) — to PyPI with
**zero** cross-provider proof (the spike ran **Anthropic only**; Copilot collapsed
to Claude by plan-gating), and (iii) makes 066's release the most
close-out-stall-prone shape (dual-release + heavy net-new wiring in one terminal
session). D defuses all three: 066's release carries a *consumed, proven* feature;
the adapter releases in 067 only after Experiment A — whose 2×2 context×provider
design *is* the cross-provider acceptance test — validates the load-bearing
property.

## 3. Does shipping Path-Aware Critique require the adapter?

**No — and this is what dissolves the fork.** The feature is config + a net-new
close-out gate; the adapter is a separate agentic-executor seam. The proposal
frames a manual-now → automated-later phase (§1c; Candidate 1's "manual today,
adapter later"; Candidate 4's "ADOPT, phased"), the manual practice is proven and
already adopted (harvester; this review), and `forward-ab-design.md` confirms
Experiment A is a capability *measurement* informing **routed's** fate, not a gate
on the feature's existence. The A/B/C fork was a false trilemma: "build engine
vs. ship feature" are **different sets**, because the feature ships without the
engine.

## 4. Where is the 066/067 line, and is each set in-band?

**066/067 line = proven PRODUCT vs. unproven ENGINE.** 066 ships the feature whose
value is already established (manual, releasable, low-risk); 067 builds and
validates the automation. **067/068 line = building/validating the engine vs. the
irreversible, data-gated decisions** (cadence, routed-fate, the deterministic
gate).

Authoring-guide band (`docs/planning/session-set-authoring-guide.md`): 2–4
typical; 5+ needs a clear synthesis-point DAG; ~8+ with no synthesis points is the
"set too broad" anti-pattern.

- **066 = 3 sessions**, squarely in-band. Synthesis point: *"the tier-orthogonal
  Path-Aware Critique policy exists and is enforceable at close."*
- **067 = 4 sessions**, top-of-band with a clean DAG (seam → bindings →
  capability study). Synthesis: *"validated multi-provider Mode-2 engine +
  capability evidence vs. routed."*
- **068 = 3 sessions**, in-band. Synthesis: *"routed's fate decided on data;
  deterministic gate shipped for the encodable share."*

Contrast: A puts 066 at 5 (expandable to 6 under the Erratum, with a
stall-prone dual-release final session); B at ~6; C/D have the cleanest bands, and
D is the only clean-band option that **also ships the §1(a)-adopted feature as a
consumed release**. None of D's sets approach the split trigger; each has exactly
one synthesis point.

---

## Recommended decomposition

### Set 066 — Ship Path-Aware Critique (tier-orthogonal manual policy) · ~3 sessions · **releases**

- **S1 — Policy surface + artifact contract.** Add the **tier-orthogonal**
  `pathAwareCritique: none | advisory | required` per-set attribute (locked at set
  start, mirroring `verificationMode`); implement `P_set = any(P_task)` — the
  **blast-radius predicate** that auto-gates `required` (cross-artifact /
  shared-schema / wiring / index changes); define and validate the saved
  manual-critique **artifact shape** (multi-provider, end-of-set,
  `sN-issues.json`-style). *Synthesis: attribute + predicate exist and are
  spec/state-readable.*
- **S2 — Net-new close-out wiring.** Implement the content-aware close-out check
  that fires when `pathAwareCritique == required` and the close is set-terminal,
  confirming a recorded multi-provider end-of-set critique artifact exists and is
  content-non-trivial, with an explicit fail-posture and a non-blocking path for
  `advisory`. **Net-new per the Erratum** — the `dedicated-sessions` gate is inert
  on Full tier and is *not* reused. *Synthesis: the policy is enforceable at
  close.*
- **S3 — Docs, prompts, tests, release.** Document the manual operator workflow +
  the multi-provider prompt/template discipline (make this review's flow
  canonical); focused tests on attribute/predicate/gate/fail-posture; dogfood the
  policy on this set; **PyPI feature release**. *Routed verification stays
  unchanged.* *Synthesis: the manual feature is canonical, tested, released.*

**Ships:** the tier-orthogonal manual Path-Aware Critique feature + release.
**Defers:** the adapter, all experiments, routed-fate, the contract gate.

### Set 067 — Build + capability-validate the Mode-2 adapter · ~4 sessions · adapter release rides Experiment A

- **S1 — Executor seam + Anthropic core.** First-class **`pull_route()`** agentic
  entrypoint (a parallel seam, **NOT** nested in `providers.call_model`) +
  Anthropic read-only tool loop (`read_file`/`grep`/`list_dir`) +
  **deterministic-servant guardrail** (raw bytes, never model-summarized) +
  tool-call-trace instrumentation.
- **S2 — OpenAI binding** (`tool_calls`) against the seam — never run before;
  net-new.
- **S3 — Gemini binding** (`function_declarations`) against the seam — different
  shape; net-new. (Split from any sandbox per the round-1 constraints.)
- **S4 — Experiment A** (capability): blind parallel review of a frozen
  pre-remediation tree, 2×2 context×provider, seeded-defect catalogue
  (probeable-vs-novel labelled) + the deterministic falsifier suite, K-repeat
  non-determinism sampling now enabled by the programmatic surface. Wire the
  adapter behind 066's gate as the automated path; release the validated adapter.
  *Synthesis: a validated multi-provider engine + capability evidence.*

> `run_test` is **deferred to 068**: Experiment A runs on **frozen trees**
> (read/grep/list only — exactly the 4-read shape that caught all 12 bake-off
> defects), so a read-only adapter delivers the proven value in 067. The
> disposable-worktree sandbox is genuinely net-new (distinct from
> `ai_router/worktree.py`'s long-lived session-set worktree CLI) and belongs with
> the work that actually executes tests.

**Ships:** the (read-only) adapter as automation behind the already-shipped
feature + Experiment-A capability evidence. **Defers:** Experiment B, routed-fate,
the contract gate, the `run_test` sandbox.

### Set 068 — Cadence study, routed-fate, deterministic gate · ~3 sessions · data-gated · release iff routed status changes

- **S1 — `run_test` disposable-worktree sandbox + Experiment B** (cadence,
  staged-snapshot intervention — the only study that can settle routed's surviving
  cadence defense).
- **S2 — Routed keep/demote/retire** decision from Experiments **A + B together**
  (the only set licensed to touch routed's status; §1b / §9-step-4 data-gate,
  needs both).
- **S3 — Contract-test / CDC gate** for fully-encodable functionality with all
  three hole-fixes; release if a routed-status change ships (now data-backed).
  *Synthesis: routed's fate decided on data; deterministic gate shipped for the
  encodable share.*

**Constraint check:** no PyPI release is ever bundled with an **unsettled**
routed-fate decision — 066 releases the feature only (routed unchanged); 067
releases the adapter (routed unchanged); 068's release, if any, ships *after* the
decision is settled.

---

## Residual risks (honest)

1. **066's net-new close-out wiring is heavier than the proposal body scored**
   (the "free reuse" premise was wrong; Erratum-confirmed). If S2 overruns, 066
   grows to 4 by splitting wiring from release — still in-band.
2. **Tier-orthogonal discipline must hold.** If 066 hard-codes Full-tier
   assumptions it breaks the locked design decision. The wiring is net-new
   *because the existing gate is Lightweight-only*, not because the feature is
   Full-tier.
3. **067's adapter ships behind tests, validated in-field by Experiment A.** Lower
   risk than shipping the bindings to PyPI cold, but if the operator's bar is "no
   provider binding releases until it has caught a real seeded defect
   cross-provider," gate the 067 adapter release on Experiment A passing (the plan
   already orders it that way).
4. **The A/B may be underpowered** (`forward-ab-design.md`: "effect-size clarity,
   not p-values"; ~20–30 seeded defects). If 068's data is inconclusive, routed
   stays in "keep unchanged" limbo — inherent to the data-gate, not to D.

## When Option A would win instead

If the operator's bar is **"the feature must ship *with* its automated engine or
not at all"** (i.e. §9-step-3's full form is non-negotiable and a manually-enforced
gate is unacceptable), or if there is **urgency to get the adapter onto PyPI**
independent of cross-provider proof, then **Option A** is the right call — accept
the 5→6 band and ship Anthropic-core-stable / OpenAI-Gemini-experimental. My
disagreement with that bar is that it pays a real risk + sizing cost to buy
*cohesion* the dissolution proves you don't need.

---

## BOTTOM LINE

The repo dissolves the fork: Path-Aware Critique ships **manually now** and the
adapter is **later automation** — so **066 is the (tier-orthogonal) manual feature
set + release, 067 is the adapter + Experiment A, and 068 is Experiment B +
routed-fate + the contract gate**; ship proven value first, and release the
unproven multi-provider engine only after Experiment A validates it.
