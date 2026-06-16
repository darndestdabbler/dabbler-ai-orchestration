# Proposal — Verification-Surface Strategy

> **Superseded (2026-06-16, Set 068 S6):** this proposal's open questions are
> now settled and the strategy is built. See the canonical
> [`docs/verification-surface-strategy.md`](../../verification-surface-strategy.md)
> for the decided-and-shipped outcome (path-aware critique + contract-test gate +
> the demoted/gated per-session routed verification). This proposal remains the
> design-rationale record.
>
> **Status:** Proposal (not adopted). Production changes are a *future*
> implementation set.
> **Date:** 2026-06-14
> **Source set:** `docs/session-sets/065-verification-surface-empirics/`
> (Session 3 synthesis).
> **Evidence:** `bake-off-results.md` + `bake-off-data.json` (S1 retrospective),
> `forward-ab-design.md` (S1), `spike-report.md` + `spike_first_party_adapter.py`
> (S2 spike), `consensus-journal.md` (this dir), `s3-openq-analysis.md` (routed
> open-question analysis).
> **Governing constraint:** the complexity/quality rubric (below). Every
> recommendation is scored against it.

---

## Erratum (2026-06-15)

A **path-aware** review (GitHub Copilot driving GPT-5.4 + Gemini-Pro over the
repo) of the Set 066 decomposition found a factual error in this proposal:
Candidate 1 (§5) and §7 claim Path-Aware Critique can **reuse the content-aware
close-out gate that `dedicated-sessions` already implements**. That is
**incorrect** — that gate is **inert on Full tier**: `dedicated_verification.py`
(see its module header, ~L440) states the mode machinery applies only to
`tier: lightweight`, and `close_session.py` (~L1709) wires the gate only when
`verificationMode == dedicated-sessions` (a Lightweight Set-057 feature).
**The Path-Aware Critique close-out wiring is net-new work, not free reuse** —
Set 066 scopes it accordingly. (Precision, per the round-2 panel: the feature is
**tier-orthogonal** — `none | advisory | required` on both tiers, as Candidate 1
locks it — *not* Full-tier-specific. The wiring is net-new because the existing
`dedicated-sessions` gate is Lightweight-only and never covered the Full-tier
close path, not because the attribute is Full-tier.) (Verified against the code on
2026-06-15. Noted in passing: the routed cross-provider verification of this
proposal — gpt-5.4, four rounds — did not catch this; the path-aware review did,
which is itself an instance of the marginal-value thesis the proposal argues.)

---

## 1. Executive summary

The framework today outsources every reasoning task through `route()`, a
**single-shot push**: the orchestrator pre-packs "just enough context" and the
delegate answers blind. Empirically, that push-only posture has a structural
blind spot — a class of real, high-severity defects (fabricated data, index
undercounts, cross-artifact contract drift) that a snippet-fed verifier
*cannot* see because the biased author chose what to paste. A **pull**-mode
verifier that retrieves ground truth itself ("path-aware critique") catches
them. This proposal turns that finding into an adoptable strategy.

**Recommendations at a glance:**

| # | Question | Recommendation | Rubric verdict |
|---|---|---|---|
| (a) | Promote path-aware critique? | **Yes** — as a **tier-orthogonal, per-set attribute** `pathAwareCritique: none \| advisory \| required`, **multi-provider**, **end-of-set**, with `required` auto-gated by **blast radius** (cross-artifact / shared-schema / wiring / index changes). Name it **Path-Aware Critique**. | **PASS** (out-of-band, gated; deterministic *tooling* layer — the critique itself is model-based) |
| (b) | Keep / demote / retire per-session routed verification? | **Keep unchanged for now; do not demote or retire on current evidence.** The retrospective cannot answer it (order confound); routed's only surviving defense is **cadence**, which is plausible but **unmeasured**. Gate any status change on **forward Experiments A *and* B**. | n/a (decision deferred to data) |
| (c) | Manual now → automated later? Which surface? | **Yes, phased.** Institutionalize the **manual** critique now (zero marginal *metered-API* cost — it costs operator-minutes; proven) **and instrument it**; build a **first-party tool-loop adapter** (metered BYOK via `route()`) as the primary Mode-2 engine; offer the **GitHub Copilot CLI** (subscription) as a $0-marginal alternative for seat-holders. | **PASS** (httpx-only, anti-bias under our control) |
| (d) | Which TDD / contract elements earn their overhead? | **Pre-registered falsifiers: adopt** (authoring-time-once; out-of-band when independently authored, an upfront in-band authoring cost when same-agent on low-blast-radius work — §6/§8) for the **~92% probeable** share. **Contract-test/CDC gate: adopt for fully-encodable functionality only**, *with all three hole-fixes*. **Reject** working-agent per-claim falsifier authoring mid-session (in-band, re-imports author bias). | mixed — see §6 |
| (open) | Can one agent author the falsifiers/contract **and** implement, and still get the pre-commitment benefit? | **Blast-radius-gated:** same-agent is sufficient for **low-blast-radius / probeable** work under strict temporal-separation + immutability; **independence is mandatory** for **high-blast-radius / cross-artifact** work (plus a heuristic extension for genuinely ambiguous / novel-reasoning work — see §6). | **PASS** (one core gate, reused) |

**The unifying insight (§7):** all of the above share **one core predicate** —
*does the work change cross-artifact contracts / indexes / wiring / shared
schema?* That blast-radius gate decides (1) whether path-aware critique is
`required` (a **set-level** decision), (2) whether the contract/falsifier author
must be a different engine, and (3) whether a task should be delegated push
(Mode 1) or pull (Mode 2) (both **task-level** decisions). The author-
independence decision additionally fires on a heuristic extension (ambiguity /
novel-reasoning) beyond the deterministic core. One core concept, three
applications — which keeps the framework from accreting three independent knobs,
without overclaiming a single bit-identical test (§7 states the exact relation).

---

## 2. Organizing frame — the two delegation modes

`route()` answers *when* to outsource (the existing **Delegation Discipline**).
This proposal adds an orthogonal axis: *how*.

- **Mode 1 — manager / delegator (PUSH).** The orchestrator pre-packs context
  and one-shots the delegate. The orchestrator's judgment of *what context
  matters* is the quality ceiling. This is `route()` today.
- **Mode 2 — dispatcher / proxy (PULL).** The orchestrator lends its hands; the
  delegate drives — requesting reads, greps, test-runs — and pulls ground truth
  itself. This **is** path-awareness, generalized.

**The asymmetry that motivates everything here:** the orchestrator *is*
path-aware (it runs in an agentic tool loop), yet `route()` drops every
outsourced task into Mode 1. So a Full-tier project outsources *from* a
path-aware orchestrator *to* non-path-aware delegates — discarding the very
capability that makes the orchestrator effective. **C9 and C3 are the
symptom**, not special cases. *Hypothesis (not yet measured):* the same
asymmetry plausibly extends to code-generation, documentation, and analysis —
but this set measured **only verification**, so the evidence-backed scope of
this proposal is path-aware *critique*. Generalizing Mode 2 to other task types
is a design extrapolation to be tested before adoption, not a proven result.

**Balance (do not switch everything to pull).** Mode 1 is one cheap, bounded,
deterministic call; Mode 2 is a 10–100× agentic loop plus sandbox plus variable
cost. Choose **per task** (`P_task`, below) by whether *context-assembly is the
bottleneck*: cross-artifact / high-blast-radius → Mode 2; local / self-contained
→ Mode 1.
(The retrospective's 010 local-logic defects held up fine under Mode 1.) This
is the complexity/quality rubric applied to the **delegation axis**.

---

## 3. Evidence base (condensed)

### 3.1 S1 retrospective bake-off (harvester 008–012, n=5)

- **Promoting path-aware critique is strongly supported.** Two clean existence
  proofs (C9, C3) + **12 unique real defects** path-aware caught that routed
  missed — mostly Major, two wrong-data/structural Criticals.
- **Both effects are real and entangled.** 012 **C3** isolates *context-access*
  (GPT was both the routed validator *and* a path-aware provider — it missed C3
  across four routed rounds, caught it with repo access: same model, one
  variable). 010 isolates *provider-diversity* (both critique-only Majors were
  Gemini-only; GPT-with-repo-access also missed them). They imply **opposite**
  fixes, so the supported configuration is **path-aware AND multi-provider** —
  "just add a second routed validator" would catch the 010-class but miss the
  C3-class.
- **~92% of the unique catches are *probeable*** — a cheap pre-committed
  deterministic falsifier would have caught 11 of 12 *in retrospect*. Only one
  (011 C7b, a latent-not-triggerable state) is genuinely novel-reasoning. This
  is the single biggest lever toward the deterministic-gate direction.
- **"Is routed worth keeping" is unanswered.** Every routed-only catch is
  order-confounded or out-of-scope; there is **no clean case** of routed
  catching a real defect path-aware missed on the *same* code. Routed's only
  *evidenced* defense is **cadence** (catching defects during construction,
  before later sessions compound them) — plausible, unmeasured.
- **Path-aware is not noise-free.** Gemini over-escalated twice (009), both
  disproven by GPT — the two-provider cross-check is load-bearing and carries a
  real false-positive / remediation-churn cost.

### 3.2 S2 integration-surface spike — GO

Path-aware critique **can be a routed call**. Two surfaces proven headless,
each independently catching **both** catch-classes with **empirically-confirmed
tool use** (not just afforded capability), repeat-stable over 3 runs:

| Surface | Billing observed | Both bugs | Tool calls | Cost/run |
|---|---|---|---|---|
| First-party tool-loop adapter (Anthropic via httpx) | metered BYOK | 3/3 (+1 bonus) | 4 reads | **~$0.024** |
| GitHub Copilot CLI (`copilot -p`) | subscription (1 premium req) | 3/3 | 5–6 (4 reads) | $0 marginal |

- **Recommended primary: the first-party adapter** — best preserves
  multi-provider control (via `route()`), keeps the **deterministic-servant
  anti-bias property under our control** (servant returns raw bytes/grep/test
  output, never a model-summarized view — a summarizing servant would
  reintroduce the biased context-assembler that path-awareness exists to
  remove), and has a minimal footprint (httpx + ~150 LOC vs. the vendor SDK's
  20 deps + Node CLI).
- **Caveats to carry forward:** the spike exercised **only Anthropic**;
  OpenAI/Gemini bindings are architecturally enabled but not yet run. Copilot's
  "one harness, all providers" was **plan-gated** (Claude-only on the seat
  tested) and `claude -p` **refuses to nest** inside a Claude Code session.
  Rung-2 semantic indexing (the ~8% novel-residual insurance) was **not
  exercised** (4-file fixture) — deferred to the forward A/B.

---

## 4. The governing complexity/quality rubric

Every proposal below is scored on five axes (from the design discussion, carried
in `consensus-journal.md`):

1. **Quality added** — does it catch real defects the status quo misses?
2. **Overhead added** — tokens, wall-clock, ceremony, new failure surfaces.
3. ***Where* the overhead lands** — the working agent's critical path (in-band,
   bad) vs. out-of-band tooling / a separate critic / operator / authoring-time
   (good). *Location beats magnitude.*
4. **Gated by blast-radius vs. universal** — applied only where it pays off, or
   imposed everywhere.
5. **Net effect** — does it *reduce* something elsewhere (net-neutral or
   net-negative complexity for the working agent)?

**Prefer:** deterministic + out-of-band + gated + net-neutral-or-negative.
**Reject:** in-band + universal + additive-only.

**Self-application warning.** 065 must not *become* the complexity it warns
against. This ecosystem already bleeds ceremony (endless "close gate failed
because X" gotchas; Set 064 exists because guidance bloated 2.18× over ceiling).
Every new gate is a new failure surface — see §8.

---

## 5. Candidate scoring

### Candidate 1 — Path-aware critique as a tier-orthogonal per-set attribute

`pathAwareCritique: none | advisory | required`, locked at set start (mirrors
`verificationMode`), reusing the content-aware close-out gate that
`dedicated-sessions` already implements. End-of-set cadence. Multi-provider.

| Axis | Assessment |
|---|---|
| Quality added | **High** — directly captures the 12-defect critique-only class incl. both Criticals. |
| Overhead added | Moderate, and **bounded**: one end-of-set pass, opt-in. |
| Where it lands | **Out-of-band** — runs on the critic's own context (manual today, adapter later), not the working agent's tokens. |
| Gated by blast-radius | **Yes** — `required` auto-fires only on cross-artifact/shared-schema/wiring/index changes; `none`/`advisory` otherwise. Preserves Full's walk-away promise. |
| Net effect | Neutral-to-positive; pairs with the contract gate (C3) to *remove* per-session rounds later. |

**Verdict: ADOPT.** Strongest-evidenced change in the set. Tier-orthogonal
(not a Full-tier bolt-on — Lightweight's existing `out-of-band-or-none` mode is
already this shape). Keep it **multi-provider** (the 010 vs C3 split proves a
single provider is insufficient). Name: **Path-Aware Critique** (drop "devil's
advocate" — it invites theatrical negativity).

### Candidate 2 — TDD as pre-registered falsifiers

Claim-linked executable invariants ("anticipate the evidence"): reify each claim
as a count / cross-ref / round-trip / schema-conformance check, authored *before*
"done". The gift is **pre-commitment** (Popperian pre-registration), not the
suite itself: `TDD : code :: pre-registration : verification`.

| Axis | Assessment |
|---|---|
| Quality added | **High on the probeable share** — ~92% of catches are exactly this shape (C9 = `count(index) == count(artifacts)`). |
| Overhead added | Authoring-time-once per claim. |
| Where it lands | **Out-of-band** if independently authored; **upfront in-band authoring cost** (under temporal-separation + immutability) if same-agent on low-blast-radius work; **in-band and self-defeating** if the *working agent* authors a falsifier per claim mid-session (bleeds budget *and* re-imports author bias). |
| Gated by blast-radius | Should be — falsifiers pay off most on cross-artifact invariants. |
| Net effect | Lets the critic spend scarce reasoning on the un-probeable residual (Pass 2) instead of re-deriving probeable checks. |

**Verdict: ADOPT — with the bias safeguard gated by blast-radius, not
universal.** The load-bearing invariant is **pre-commitment + immutability**:
falsifiers authored in a distinct, prior phase and frozen before implementation
(editing a registered falsifier is a flagged, reviewed event). That alone earns
the bias-reduction benefit on **low-blast-radius / probeable** work, where the
same agent may author and implement (see §6). **Author-independence becomes the
make-or-break caveat only under the gated high-risk conditions** —
high-blast-radius / cross-artifact / ambiguous work — because there the risk
shifts from implementation error to *specification* error (author-written tests
then inherit the author's blind spots; tests are evidence of *presence*, never
*absence*). Always **REJECT** the working-agent-authors-a-falsifier-per-claim-
mid-session form (it is in-band and re-imports author bias with none of the
pre-commitment). Honesty guards: write falsifiers against the **spec, not the
implementation** (tautological probes that assert what the code *does* are worse
than none); **green ≠ safe** (the novel-reasoning Pass 2 stays mandatory); and
**don't force-fit** — UI/render/UAT claims are often cheaper to verify by
inspection (label them inspection-only, same axis as
`requiresUAT`/`requiresE2E`).

### Candidate 3 — Contract-test / CDC gate

Consumer-driven-contract shape: orchestrator defines the contract (coding API,
or the deliverable's falsifiable claims for non-coding work); the critical tests
are written against it — **by an independent engine when `P_task` holds or the
work is ambiguous/novel** (high-blast-radius), or **by the same agent under
temporal-separation + immutability for low-blast-radius / probeable work** (the
§6 rule applies identically here); the orchestrator implements and may add its
own tests but **cannot modify** the frozen contract tests; close-out = those
tests pass. (Hole 1 below is what *forces* independence when `P_task` holds.)

| Axis | Assessment |
|---|---|
| Quality added | **High on fully-encodable functionality** — makes the implementation gate *deterministic*, killing the "clean routed R1 = false assurance" failure mode. |
| Overhead added | Real: contract authoring + independent test generation + the amendment process. |
| Where it lands | Gate execution is **out-of-band** (subprocess red/green). Test authoring is **out-of-band** when independently authored (high-blast-radius), or an **upfront in-band authoring cost** (under temporal-separation + immutability) when same-agent on low-blast-radius work — same split as Candidate 2. |
| Gated by blast-radius | Must be — only worth it where functionality is meaningfully encodable. |
| Net effect | **Net-negative** for the working agent *if it replaces* per-session routed verification on the encodable share. |

**Verdict: ADOPT for fully-encodable functionality, but only with all three
hole-fixes — never as a naked replacement for verification.** It **relocates**
independent judgment (to the contract); it does not eliminate it.
- **Hole 1 (bias moves up to contract design, which the orchestrator authors):**
  fix with **independent review of the contract itself** (a missing-capability
  bug is an *absence* in the contract, uncatchable by any contract test — e.g.
  harvester 011's "module-level has no manifest signal at all"). See the open
  question (§6) for who authors.
- **Hole 2 ("sufficient coverage" is undecidable; tests prove presence not
  absence):** the gate is precisely true on the probeable subset, silent on the
  novel residual → keep a **residual novel-reasoning completeness critique**
  (Candidate 1) for the un-encodable share.
- **Hole 3 (Goodhart — orchestrator can see the frozen tests):** make "fresh" a
  **held-out test set** the orchestrator never saw, or have the independent
  engine generate **new** tests at close-out (the ML train/test split applied to
  verification).
- **Evidenced failure mode to pin:** *green-but-unwired* (contract tests at the
  wrong level — unit, not the real downstream-consumption path — pass green while
  the seam is broken). Tests must run end-to-end against the "only the API is
  consumable" path.

### Candidate 4 — Manual now → automated later, and the integration surface

| Axis | Assessment |
|---|---|
| Quality added | Manual is proven now (harvester already adopted it); automation makes it cheap/repeatable + enables the forward A/B. |
| Overhead added | Manual = operator-minutes now; adapter = ~150 LOC + httpx (already a dep). |
| Where it lands | **Out-of-band** (critic's own context / subprocess). |
| Gated by blast-radius | Yes (inherits Candidate 1's gate). |
| Net effect | The adapter is the **reusable Mode-2 engine** — path-aware critique is just its first application; it doubles as the forward A/B's execution vehicle. |

**Verdict: ADOPT, phased.** Institutionalize the manual critique now (zero
marginal metered cost) **and instrument it** (log prompts / responses / verdicts
/ tool-call traces); build the **first-party tool-loop adapter** (primary) per
the S2 GO; keep the **Copilot CLI** as the subscription alternative for
seat-holders. Router today is HTTP-only (`providers.call_model`); the adapter is
a new provider *kind* (an agentic tool loop), not a new model.

---

## 6. Open-question resolution — who authors the contract/falsifiers?

**Question:** can a single agent author the contract / pre-registered falsifiers
*and* implement against them and still get the pre-commitment benefit, or does
Hole 1 force a different engine?

**Resolution (blast-radius-gated; independent routed analysis in
`s3-openq-analysis.md`, gemini-pro, corroborating the in-set reasoning):**

- **Same-agent is sufficient — and is the default low-cost path — for
  low-blast-radius, probeable work**, under two hard controls: (1) **strict
  temporal separation** (author the falsifiers in a distinct, prior phase) and
  (2) **immutability** (once written they are committed; the implementer phase
  cannot edit them — editing a registered falsifier is a flagged, reviewed
  event). Pre-commitment guards against implementation-stage drift; it **cannot**
  guard against a flawed initial *premise*.
- **Independence is mandatory for high-blast-radius / cross-artifact / ambiguous
  / novel-reasoning work**, where the risk shifts from implementation error to
  *specification* error (Hole 1). A single agent cannot effectively critique its
  own foundational assumptions — it will correctly implement a flawed contract.
- **Source the independent author cheaply:** default to the **cheap routed
  verifier** to generate deterministic contract tests (nulls, dup-keys,
  boundaries, schema adherence) against the orchestrator's contract; escalate to
  the **path-aware critic** only for the highest-risk changes, tasked with
  critiquing the *contract itself* (unstated assumptions, missing capabilities)
  rather than implementing.

This is the same gate as Candidate 1's `required` predicate — see §7.

---

## 7. The unifying rule — one blast-radius gate, three applications

The proposal's recommendations are not three independent knobs. They share **one
core predicate**, evaluated at two granularities:

> **Core predicate (P):** the unit of work changes **cross-artifact contracts,
> indexes, wiring, or shared schema** — exactly where a snippet-fed Mode-1
> delegate is structurally blind.
>
> - **`P_task`** — P evaluated for a single delegated task (governs delegation
>   mode and contract-author independence, both **task-level** decisions).
> - **`P_set` = any(`P_task`)** — true if *any* task in the set trips P (governs
>   the **set-level** `pathAwareCritique: required` gate).
> - **Heuristic extension (independence only):** the author-independence decision
>   *also* fires when a task is genuinely ambiguous / novel-reasoning, even if the
>   deterministic core P is false — there the risk is specification error, which
>   the core predicate does not capture. This is an explicit heuristic add-on, not
>   part of the deterministic core.

| Decision | Granularity | Fires when |
|---|---|---|
| Path-aware critique → **`required`** (Candidate 1) | set-level | `P_set` |
| Delegation mode → **Mode 2 (pull)** (§2) | task-level | `P_task` |
| Contract / falsifier author → **independent engine** (§6) | task-level | `P_task` **or** ambiguous/novel (heuristic) |

Deriving these from one operator-legible core is what keeps this from becoming
the complexity it warns against. The core is **derived, not a guessed risk
list**, and already exists in the framework's vocabulary (`dedicated-sessions`,
the `verificationMode` per-set attribute). Implementation evaluates `P_task` per
delegated task and rolls it up to `P_set` for the set-level gate — it is *not* a
single bit-identical test reused verbatim, but one concept at two scopes plus a
named heuristic extension.

---

## 8. Complexity self-check

- **Net token/time cost to the *implementing* agent:** near-zero for the
  out-of-band mechanisms — the path-aware critique (separate critic context), the
  contract/test gate (subprocess red/green), and independent falsifier authoring
  all run off the implementer's critical path. **The one in-band exception is
  honest:** when same-agent authoring is permitted (low-blast-radius, §6), the
  agent spends upfront tokens writing falsifiers / contract tests in its prior
  authoring phase before implementing — that is real authoring cost, just not
  *marginal metered API* cost and not on the *implementation* leg. The rejected pattern (a
  working-agent falsifier per claim mid-session) is the one that bleeds budget
  in-band, which is why it is rejected.
- **New failure surfaces:** the per-set attribute + close-out gate (mitigated by
  reusing the *existing* `dedicated-sessions` content-aware gate, not a new one);
  the adapter's sandbox for `run_test` (mitigated — only execution needs the
  cage; read/grep/list are path-confined and low-risk). The contract-amendment
  escape hatch must mirror the blessed-writer pattern or frozen-contract +
  evolving-understanding will deadlock.
- **Reductions banked:** the contract gate, where adopted, *removes* per-session
  routed rounds on the encodable share (net-negative); pre-registered falsifiers
  *remove* re-derivation of probeable checks by the critic.
- **Rule of restraint:** adopt the gate per blast-radius, never universally; one
  predicate, not three knobs; reuse existing machinery before adding new.

---

## 9. Scope, sequencing, and what this is NOT

**This proposal ships no production change.** No edits to `close_session`,
`router-config.yaml`, the extension, or the guidance docs; no new CLI adapter;
no PyPI / Marketplace release. The deliverable is a scored recommendation.

**The routed keep/demote/retire decision is explicitly deferred to data.** The
retrospective cannot answer it (order confound); the clean instrument is the
**forward A/B** (`forward-ab-design.md`): **Experiment A** (capability — blind,
same frozen pre-remediation tree, 2×2 context×provider, seeded defects) settles
whether routed has unique *capability*; **Experiment B** (cadence —
staged-snapshot intervention) settles whether per-session routed earns its keep
by catching defects *earlier*. **Both** are required before changing routed's
status — Experiment A alone only rules out a capability defense.

**Suggested implementation sequencing (each a future set, each scorable
against the rubric):**

1. **Build the first-party tool-loop adapter** (the Mode-2 engine + the A/B
   execution vehicle). Minimal toolset `read_file`/`grep`/`list_dir`; add
   sandboxed `run_test` in a disposable worktree; forced `sN-issues.json`
   verdict; deterministic-servant guardrail; tool-call-trace instrumentation.
2. **Run the forward A/B** (Experiments A + B) using the adapter for the
   path-aware arms and `route()` for the routed arms. This is the gate for
   step 4.
3. **Ship Path-Aware Critique** as the per-set attribute + close-out gate
   (Candidate 1), institutionalizing the manual practice and wiring the adapter
   as the automated path. Evaluate `P_task` per delegated task and roll up to
   `P_set` for the set-level `required` gate (§7).
4. **Decide routed's fate** from the A/B results, and ship the contract-test
   gate (Candidate 3) for fully-encodable functionality with the three
   hole-fixes — replacing routed rounds on the encodable share only.

Steps 1–3 are committable now on the current evidence; step 4 is data-gated.

---

## 10. Bottom line

Promote **Path-Aware Critique** as a multi-provider, end-of-set, blast-radius-
gated per-set attribute; build the **first-party tool-loop adapter** as its
engine (Copilot CLI the subscription alternative); adopt **pre-registered
falsifiers** and a **contract-test gate** for the encodable share with their
hole-fixes; and **keep per-session routed verification unchanged until the
forward A/B measures its cadence value**. One core blast-radius predicate — plus
an explicit heuristic extension for author-independence — governs all three
decisions; every adopted mechanism is out-of-band *except* the upfront, in-band
authoring cost when same-agent contract/falsifier authoring is permitted on
low-blast-radius work (§6/§8); and the routed keep/demote/retire call is honestly
deferred to the one instrument that can settle it.
