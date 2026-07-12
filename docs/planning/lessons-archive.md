# Lessons Archive

> **Purpose:** The preserved, **never-auto-loaded** tier of the guidance
> lifecycle (Set 064). When a lesson in `lessons-learned.md` is archived —
> superseded, encoded into a live test/lint/guard/template, its subsystem
> retired, or unused for the disuse window **and** unreferenced by active
> guidance — its **full text** is moved here, never deleted. Archived
> knowledge stays grep-able on demand (`python -m ai_router.guidance_search
> --archive <regex>`); it is simply not part of the recurring
> tokens-read-per-session tax that the active files pay at every session
> start.
>
> **NOT in the always-load set.** Do **not** read this file at session
> start. The always-load set (the preload, Set 085) is
> `docs/session-constitution.md` + `project-guidance.md` +
> `lessons-learned.md` (+ the engine bootstrap file). This archive
> is consulted only when searching for prior knowledge.
>
> **Reactivation.** If `python -m ai_router.cite_lessons` is run for an id
> that lives here, the tool updates the entry's `last-used-set` in place
> and prints a `[reconsider]` line so an operator can move the lesson back
> into the active tier. Archival is reversible; nothing here is lost.

---

## Archived Lessons

Archived by Set 073 (promoted-lesson sweep): each lesson below was promoted to
`project-guidance.md` / the authoring guide (its canonical rule), so its active-tier
copy was redundant. Full text preserved here; reactivate with `cite_lessons`.

## ASCII-Only Glyphs In Cross-Platform Terminal Output
<!-- lesson: id="L-064-4" last-used-set="064" status="archived" scope="portable" -->

- **Context:** Any helper that prints status to the terminal.
- **Failure or friction:** Emoji glyphs crash Windows `cp1252` consoles.
- **Lesson:** Use ASCII-only: `[~]` in-progress, `[ ]` not-started, `[x]`
  done. Reserve Unicode for files written with `encoding="utf-8"`.
- **Action for future sessions:** Follow `print_session_set_status()` in
  `ai_router/__init__.py` as the pattern.
- **Promoted to `project-guidance.md` → Conventions → Code Style on
  2026-05-01** after consistent application across five+ CLI surfaces
  (`print_session_set_status`, `print_metrics_report`, `queue_status`,
  `heartbeat_status`, `close_session`).

## Session-State.json Is The Single Source Of Truth For In-Progress Detection
<!-- lesson: id="L-064-5" added-set="007" status="archived" scope="portable" -->

- **Promoted.** This lesson now lives at `project-guidance.md` →
  Conventions → Workflow Expectations: *"Session-state.json is the
  single source of truth for in-progress detection. Call
  `register_session_start()` at Step 1 before the first `log_step()`,
  and `mark_session_complete()` at Step 8."* Set 7
  (`007-uniform-session-state-file`) extended the invariant
  repo-wide: every session-set folder carries a `session-state.json`
  from creation, and readers consult `status` directly via
  `read_status` / `readStatus`. Collapsed to this pointer on
  2026-05-01 to avoid duplicate guidance drifting in two places.

## State The Suite Baseline And Release Contract Up Front In Verification Round 1
<!-- lesson: id="L-064-10" added-set="062" last-used-set="087" status="archived" scope="portable" -->

- **Promoted.** This lesson now lives at `project-guidance.md` →
  Conventions → Workflow Expectations: *"Open every session-verification
  prompt with an up-front conventions block."* Confirmed across Sets 062
  (S5 R1 clean), 063 (S2/S3 narrow R1s), 064, and 065 (S3 R1 focused on
  real consistency defects, not the deliberate proposal-only scope).
  Collapsed to this pointer on 2026-06-15 after the fourth-plus
  confirming context.

## Per-Session-Set E2E/UAT Configuration Is Spec-Declared, Not Inferred
<!-- lesson: id="L-064-11" status="archived" scope="portable" -->

- **Promoted.** The operational rule lives authoritatively in
  `docs/planning/session-set-authoring-guide.md` (Session Set
  Configuration block + the When-UAT-Is-Required and
  When-E2E-Is-Required heuristics) and is reinforced by
  `project-guidance.md` → Conventions → Workflow Expectations:
  *"Obey the spec's Session Set Configuration block at runtime."*
  Collapsed to this pointer on 2026-05-01 to avoid three places
  (authoring guide, project-guidance, lessons-learned) holding
  the same rule.

## A Pure-Python Validator Mirroring A JSON Schema Drifts Looser — Type-Check Optional Fields And Guard Numeric Equivalence
<!-- lesson: id="L-066-1" added-set="066" last-used-set="085" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Code Style on 2026-06-16**
  after instrumental application across Sets 066, 069, and 070. The detailed
  failure-mode record is retained below for reference; the durable rule (incl. the
  Set 070 addition that *cross-field/cross-array invariants which JSON Schema CAN
  express must be encoded in the schema too*, and that dogfooding the gate under its
  own policy is what surfaces parity gaps) now lives in the Convention.

- **Context:** Any runtime validator written in plain Python to enforce the
  same contract as a JSON Schema (so the runtime path avoids a `jsonschema`
  dependency), where a fixture is checked against *both* to keep them aligned
  (Set 066 `path-aware-critique.json`).
- **Failure or friction:** The hand-written validator silently accepted values
  strict JSON Schema rejects, because Python's type/equality semantics are
  looser than the schema's. Two gaps the set's own dogfood critique caught:
  (1) **optional fields went unchecked** — the schema typed `critiquedAt` as a
  string, `blastRadius` as an object, finding `severity`/`category` as strings,
  but the Python validator only checked *required* fields, so an integer
  timestamp or a string-typed object passed at runtime and failed schema
  evaluation; (2) **numeric equivalence** — `schemaVersion 1.0` (float) and
  `True` (bool) both pass `version in (1,)` because `1.0 == 1 == True` in
  Python, while the schema's `"type": "integer"` rejects them.
- **Lesson:** A validator that claims parity with a schema must check the
  **optional** fields the schema constrains (not just required ones), and must
  add explicit `isinstance` guards wherever JSON Schema's `"type"` is stricter
  than Python's `in` / `==` — especially `int` vs `bool`/`float`. "All tests
  green" does not prove parity; the failure modes were uncovered, not failing.
- **Action for future sessions:** When a pure-Python validator mirrors a JSON
  Schema, enumerate every schema-constrained field (required AND optional) and
  pin a type check for each; add `isinstance(x, int) and not isinstance(x, bool)`
  for integer fields. Better still, **dogfood the gate by arming the shipping
  set under its own policy** — the self-gating Set 066 dogfood (a multi-provider
  path-aware critique of the set's own changes) caught four real defects the
  per-session routed verification had missed.

## A Bug Is A Bug CLASS — Fix Every Sibling Site, Not Just The Reported One
<!-- lesson: id="L-069-1" added-set="069" last-used-set="093" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Code Style on 2026-06-19**
  after application across Sets 068 (origin: the `contract_gate` `UnicodeError` fix),
  069 (a probe-template dogfood reproduced the still-latent `path_aware_critique.py`
  sibling class), and 072 (the four deferred sibling readers + `UnicodeError` folded
  in across both modules). The durable rule — when a fix closes a *class* of defect,
  grep the whole codebase for the pattern and either fix every reachable sibling in
  the same pass or explicitly scope + record the deferred residual; ship a probe that
  drives the public entrypoint where practical — now lives in the Convention.
  Collapsed to this pointer to avoid duplicate guidance and relieve the active-lessons
  ceiling.

## An Iterative Dogfood Keeps Its Own Gate Artifact "Pre-Fix" — Frame It As Evidence, Not A Clean Snapshot
<!-- lesson: id="L-070-1" added-set="070" last-used-set="085" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Workflow Expectations on
  2026-06-19** after application across Sets 070 (origin: the path-aware critique
  caught five real defects four single-shot rounds had missed), 071, and 072 (the S4
  path-aware dogfood caught + fixed a real Major in the S3 aggregator, then converged
  on no-new-code). The durable rule — commit the final dogfood round as the gate
  artifact, adjudicate every finding in `disposition.json`, rely on the cross-provider
  session verification (a different surface) for the authoritative `VERIFIED` verdict,
  and converge the dogfood when a round drives no new code change — now lives in the
  Convention. Collapsed to this pointer to avoid duplicate guidance and relieve the
  active-lessons ceiling.


## Dogfood The True Cold Start — A Pre-Seeded Fixture Masks First-Run Defects
<!-- lesson: id="L-079-3" added-set="079" last-used-set="084" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Workflow Expectations on
  2026-07-06** after instrumental application across Sets 079 (origin: the
  install-time config-seed defect that survived three sessions of cross-provider
  verification and a path-aware critique, caught only by the operator's
  empty-folder UAT walk), 081 (the `budget.yaml` write-matrix cold-start
  Builds), and 082 (the marker-set cold-start Builds plus the
  Full-over-Lightweight preservation re-Build). The durable rule — any set
  shipping provisioning (scaffold, install, seed, migrate-from-empty) includes
  at least one dogfood/UAT walk starting from the exact cold-start state (fresh
  empty folder, no pre-seeded config), asserting the provisioned artifacts
  afterward and named in the spec's "Ends with" line — now lives in the
  Convention. Collapsed to this pointer to avoid duplicate guidance and relieve
  the active-lessons ceiling.


## Archived by Set 085 (preload-triage sweep)

Set 085 S2 applied the preload admission test (`docs/guidance-lifecycle.md`)
to the active tier: lessons already enforced by live automation archive with
an `encoded-in` pointer; situational lessons archive to their trigger-moment
reference; and lessons kept active were **condensed to <=150 tokens** in
`lessons-learned.md`, with their pre-condensation full text preserved in the
"Full texts of Set-085 condensed active lessons" subsection at the end of
this section (no metadata trailers there — the live ids stay in the active
tier; cross-file id uniqueness is the D2 lock).

## Truncation Detection: `stop_reason` Alone Is Not Sufficient
<!-- lesson: id="L-064-1" last-used-set="077" status="archived" scope="portable" encoded-in="ai_router/utils.py::detect_truncation" -->

- **Context:** Any routed call whose response is consumed programmatically —
  code generation, test generation, structured data emission.
- **Failure or friction:** Gemini Pro has been observed to return
  `stop_reason: "end_turn"` on responses that visibly cut off mid-string.
  The orchestrator logs the call as successful; the structured consumer sees
  a malformed JSON / unbalanced brace and downstream parsing fails.
- **Lesson:** Use `detect_truncation(content, stop_reason)` from
  `ai_router/utils.py`. It returns True when `stop_reason == "max_tokens"`
  OR when the response shows syntactic incompleteness (odd triple-backtick
  count, more `{` than `}`).
- **Action for future sessions:** Call `detect_truncation()` before treating
  any structured output as canonical. On truncation, halve the batch and
  retry, fall back in-conversation, or escalate a tier.
- **Archived Set 085:** the check is live automation; the one-line reminder
  ("call it before trusting structured output") rides the archive pointer
  table in the active tier.

## Cost Guard On Verification: Skip When Verifier Cost Greatly Exceeds Generator
<!-- lesson: id="L-064-2" status="archived" scope="portable" encoded-in="ai_router/router-config.yaml::verification.max_cost_multiplier" -->

- **Context:** Any auto-verified task type where the generator is a cheap
  tier-1 or tier-2 model and the verifier picks an expensive tier-3 model.
- **Failure or friction:** A cheap Gemini Flash call at $0.0003 can pull a
  $0.15 GPT-5.4 verification call — 500x cost ratio that destroys savings.
- **Lesson:** The router's `router-config.yaml` carries
  `verification.max_cost_multiplier` (default 3.0). When verifier cost
  exceeds `max_cost_multiplier x generator cost`, verification is skipped
  and metrics record `verification_skipped: cost_guard`. Session-verification
  is exempt — that is non-negotiable cross-provider review.
- **Action for future sessions:** Trust the guard for cheap routed work.
- **Archived Set 085:** pure description of router-enforced behavior; no
  orchestrator action exists to remind about.

## Always Route `ai-assignment.md` And Next-Orchestrator / Next-Set Recommendations
<!-- lesson: id="L-064-6" last-used-set="081" status="archived" scope="portable" -->

- **Context:** Authoring `ai-assignment.md` (Step 3.5) or next-orchestrator /
  next-session-set recommendations (Step 8).
- **Failure or friction:** Orchestrator self-opines biased toward its own
  provider. A Claude orchestrator predictably recommends Claude even when
  Gemini Flash would be cheaper.
- **Lesson:** Always produce via `route(task_type="analysis")`. Rule #17 in
  the workflow doc makes this explicit.
- **Action for future sessions:** Never self-opine on which model is cheaper.
- **Archived Set 085:** duplicate of the always-preloaded rule in
  `project-guidance.md` -> Workflow Expectations and the constitution's
  Step 3.5.

## Measure A Verification Surface At Its Strongest Framing Before Demoting Or Retiring It
<!-- lesson: id="L-069-2" added-set="069" last-used-set="083" status="archived" scope="portable" encoded-in="ai_router/prompt-templates/verification.md" -->

- **Context:** Comparing two verification surfaces (e.g. snippet-fed *push* /
  routed vs. repository-reading *pull* / path-aware) to decide whether one earns
  its keep — the Set 065->068 keep/demote/retire program, and the forward telemetry
  the Set 069 `070` pilot will gather.
- **Failure or friction:** *Framing strength* (the adversarial intensity of the
  reviewer prompt) is a real, cheap, prompt-only lever that is **orthogonal** to
  the surface and to provider count, and it is easy to leave uncontrolled. The
  production per-session push template (`verification.md`) shipped *"evaluate
  objectively"* (**weak**); Experiment A held both arms at *"find every defect"*
  (**moderate**, constant — so its context-access conclusion is sound); the pull
  template (`path-aware-critique.md`) is *"devil's advocate, assume flawed, prove
  it"* (**strong**). The DEMOTE evidence therefore tested push at *moderate* and
  deploys it at *weak* — **never at strong** — while comparing it against
  adversarially-framed pull. Operator field experience is that the strong framing
  consistently lifts push's catch rate. A demote/retire decided on that asymmetry
  risks retiring a surface measured in a hobbled form ("throwing out the baby").
- **Lesson:** Before demoting or retiring any verification surface, run it at its
  **strongest adversarial framing**, and in any A/B make framing a **controlled,
  equal** variable across arms (a "steelman" of each surface). "Second provider
  buys nothing" (provider *count*) does **not** cover framing — they are separate
  axes. The clean instrument is a **dual-surface comparison with provenance**
  (which surface uniquely caught which high-severity defect), both arms adversarial.
- **Action for future sessions:** (1) Upgrade `verification.md` to the
  devil's-advocate framing pull uses. (2) In the `070` telemetry, run push at the
  strong framing and record push-unique vs pull-unique catches. (3) Never cite a
  push-vs-pull result whose arms used unequal framing as evidence for retiring push.
- **Archived Set 085:** encoded — both shipped reviewer templates carry the
  strong framing (the Set 070 upgrade); the A/B-methodology history is
  archive material consulted when designing a comparison.

## Strong Adversarial Framing Without A Materiality Bar Manufactures Minor-Finding Churn
<!-- lesson: id="L-071-1" added-set="071" last-used-set="085" status="archived" scope="portable" encoded-in="ai_router/verification.py::is_blocking_verdict" -->

- **Context:** A verification surface running at its **strongest adversarial
  framing** (devil's advocate, "assume the work is flawed, a rubber-stamp is a
  failure" — the Set 070 steelman-push upgrade, **L-069-2**) with **no materiality
  bar**. Set 070 gave both reviewer templates this framing; the operator's field test
  (in `kick-the-orchestrator-tires`) confirmed it lifts the real-defect catch rate.
- **Failure or friction:** With a strong "prove it's flawed" stance and nothing
  defining *what is worth blocking on*, the verifier sometimes **manufactures a Minor
  / false-positive finding** rather than return clean — and because **any**
  `ISSUES_FOUND` (even a manufactured Minor) reopened the loop, the re-verify loop
  **churned remediation rounds on it**. The canonical observed instance: **three**
  consecutive rounds spent on `pytest` vs `python -m pytest -v` — a distinction with
  **no behavioural difference**, on work that was correct.
- **Lesson:** The fix is **never to weaken the framing** (L-069-2 is a hard
  constraint — the gain is real); it is to add a **calibration layer** on top of it,
  and the **primary lever is the loop, not the prompt**:
  1. **Severity-anchored blocking, derived not token-read.** Decide whether a result
     reopens a round from finding **severity**, not the bare verdict token: >=1
     Critical/Major (or any unknown/missing-severity) finding blocks; **Minor-only is
     non-blocking** (effectively VERIFIED for the loop). Make this a first-class,
     tested predicate (`is_blocking_verdict`) — the bare token is *not* sufficient to
     infer blocking. Keep the verdict grammar binary; blocking-ness is a derived
     predicate (a third verdict state is not needed — cross-provider-confirmed).
  2. **A materiality "so what?" gate in the prompt** (calibration *on top of* the
     loop fix, not a substitute — prompt text alone is too soft): a blocker must name
     the **exact requirement violated**, the **concrete impact**, and the
     **evidence**; lacking all three it is a nit. Name semantic-equivalence-not-
     textual-identity explicitly (the `pytest` case as the worked example).
  3. **A cross-round issue ledger** that marks prior blockers RESOLVED/UNRESOLVED and
     **refuses to resurrect a settled point under fresh wording** (key on a stable id,
     not free text — exactly the churn pattern above).
  4. **An anti-laundering guardrail** so the demotion is safe: anchor **Major** to
     *merge impact* ("would this change a reasonable reviewer's merge decision?"),
     require a **plausible-path-to-harm** escalation ("to call it Minor you must be
     confident there is no plausible path to a Major/Critical failure; when in doubt,
     escalate"), and treat a finding of unknown/missing severity (and a non-VERIFIED
     result that parsed to no findings) as blocking — so a real Major *that reaches
     the findings list* cannot be laundered into a nit by an absent label. **Know the
     scope of this net:** it operates on the findings the classifier is *given*. A
     surface that returns structured severities (the pull/path-aware surface) feeds it
     a live list; a surface that **trusts a clean verdict token** (the push parser
     returns no findings on `VERIFIED`, by design, so it never re-mines clean prose
     for a hidden Major and reintroduces churn) protects the Major-under-clean-token
     case via the verifier's own materiality judgment, *not* a post-hoc re-scan. Do
     not document the net as a blanket "blocks regardless of token" guarantee without
     naming which surface trusts its token — that overclaim is itself a defect (Set
     071 S3's own dogfood caught exactly this in the first synthesis draft).
- **Action for future sessions:** When a verification surface runs at strong
  framing, never read the bare verdict token to drive the loop — call
  `is_blocking_verdict` / `classify_blocking`. A Minor-only round is **not** a
  remediation round. Before re-verifying, reconcile the issue ledger and give a
  rephrased-but-same point the **same** id so it cannot reopen (L-065-1's
  propagate-every-echo discipline applies to the *ledger*, not just document
  echoes). The **blocking predicate is surface-agnostic** — it makes one decision
  over any severity-bearing findings, whether from the routed *push* surface or the
  path-aware *pull* surface — while the **re-verify loop discipline** (the workflow
  Step-6 rule) is wired into the routed `api` re-verify loop and the Lightweight
  Mode-B verify->remediate loop. Frame an end-of-set dogfood of this layer
  honestly per **L-070-1** (the dogfood that *is* a live demonstration of the
  discipline is itself evidence, not a clean-snapshot requirement).
- **Archived Set 085:** encoded — `is_blocking_verdict` / `classify_blocking`
  are the shipped, tested predicate; the loop discipline lives in the workflow
  doc's Step 6 and the constitution states the principle.

## An Equal-Arms A/B Isolates Its One Variable — And Is Structurally Blind To That Variable's Interactions
<!-- lesson: id="L-072-1" added-set="072" last-used-set="075" status="archived" scope="portable" -->

- **Context:** A controlled comparison built to isolate **one** variable by holding
  everything else equal — the Set 070 dual-surface verifier held *provider, model, and
  framing* equal across the push and pull arms so that **surface** was the only thing that
  varied, making the artifact clean RETIRE evidence (`_arms_held_equal`).
- **Failure or friction:** That same control is a **blind spot**: an equal-arms design
  *cannot* measure how the controlled variable **interacts** with the variable it isolates.
  Holding provider constant to isolate surface means the instrument can answer "does push
  earn its keep" but is **structurally unable** to answer "which provider should run which
  surface." An independent operator field study
  (`kick-the-orchestrator-tires`, 18 real push-vs-pull runs) found exactly the interaction
  the instrument was blind to — **provider x surface interact** (Gemini strong on push but
  quiet on pull; our live default `push=gpt-5-4`/`pull=gemini-2.5-pro` is the study's
  *single weakest* pull config) — and it was the strongest finding in the study, invisible
  to every equal-arms run we had done.
- **Lesson:** When an A/B holds a variable constant to isolate another, **name the
  interaction it cannot see** and decide whether that interaction matters. If it does, the
  fix is a **second, complementary instrument** that varies the held variable (here: an
  opt-in *matrix* mode with per-arm providers, the framing gate still held equal per
  **L-069-2**, and `_arms_held_equal` strengthened so a matrix artifact can never
  masquerade as the equal-arms RETIRE evidence) — **not** weakening the first instrument's
  control. And measure the interaction on **real built targets**, not synthetic toy diffs:
  a verification-only pass over an already-built solution **with a large/cross-file diff**
  closes the "small snippet-fittable diff" confound *for free* (a small built target does
  not — the confound closes only when the real diff is genuinely non-snippet-fittable), does
  useful verification work, and emits the interaction telemetry as a byproduct (the
  produce<->validate parity of the new report artifact follows **L-066-1**). Ship best-guess defaults now and refine as real per-cell telemetry
  accumulates; do not gate the useful work behind a synthetic confound-set.
- **Action for future sessions:** Before citing an equal-arms result as decisive, ask what
  *interaction* the control made invisible. If a field signal (or first principles) says
  that interaction is load-bearing, add a complementary matrix/interaction instrument
  rather than relaxing the original control — and prefer measuring on real built targets so
  the measurement is also useful work.
- **Archived Set 085:** situational experiment-design methodology; trigger
  moment is designing a comparison, not session start.

## A Replication Confirms One Property, Not A Headline — Name Which Held And Which Did Not
<!-- lesson: id="L-073-1" added-set="073" last-used-set="075" status="archived" scope="portable" -->

- **Context:** Replicating a prior single-datapoint observation on a second target /
  run, then recording the verdict in a settled-strategy doc (Set 073 S1 reran the Set 072
  provider x surface matrix on `dabbler-platform` to retest the N=1 "Gemini-pull is
  non-silent under strong framing" result; the section-9 synthesis recorded the verdict).
- **Failure or friction:** A prior observation usually bundles several properties (here:
  *returns a verdict at all* **and** *catches as much as the alternative*). A binary
  "it replicated / it didn't" headline silently asserts the **whole bundle** replicated.
  On platform the **verdict-not-silence** property replicated cleanly (N=2), but
  Gemini-pull returned **0 findings while GPT-pull returned 2 Major** over the same repo —
  so the *finding-yield* gap was **not** refuted. A bare "replicated" would have
  overclaimed and could have nudged a held decision (the live default pull provider) on
  evidence that actually *cautions the other way*. The same overreach showed up locally as
  the S1 R1 Minor — an adjudication note that called a surfaced finding "normal /
  immaterial" when the evidence established only that the finding *existed*.
- **Lesson:** A replication verifies a **specific, named property**, not the headline.
  When recording one, (1) state the exact property that held *and* every co-bundled
  property that did **not** (or was not tested); (2) keep the not-yet-earned decision the
  replication bears on **explicitly held**, and note when the honest read points *against*
  the tempting move; (3) do not let a clean summary word ("replicated", "immaterial",
  "normal", "verified") outrun what the artifacts establish — the same stay-within-evidence
  discipline L-064-8 applies to inherited claims and L-065-1 to echoed claims.
- **Action for future sessions:** Before writing "X replicated" in a strategy/telemetry
  record, decompose X into its properties, mark each held / not-held / untested against the
  data, and confirm the bordering held decision stays held with a one-line *why N=k does
  not move it* — especially when k is small and one property cuts the other way.
- **Archived Set 085:** situational methodology; trigger moment is recording a
  replication result, not session start.

## A Spec's Prose Cannot Arm A Gate — Declare Every Gate Flag In The Configuration Block
<!-- lesson: id="L-079-2" added-set="079" last-used-set="079" status="archived" scope="portable" -->

- **Context:** Spec authoring for any set whose end-of-set machinery is
  seeded from the Session Set Configuration block (`pathAwareCritique`,
  `verificationMode`, `requiresUAT`/`requiresE2E`).
- **Failure or friction:** Set 079's spec prose said "run the **required**
  end-of-set path-aware critique," but the config block never declared
  `pathAwareCritique`, so the immutable set-start capture recorded `none` —
  and the producer's write-mode identity guard (correctly) refused a
  `--level required` artifact. One full two-provider critique run was
  discarded before the mismatch surfaced.
- **Lesson:** The durable policy record is captured once, at set start,
  **from the config block**, and is immutable thereafter. Prose requirements
  are invisible to the gate machinery; a prose-vs-block mismatch is only
  discovered at the most expensive moment (end of set).
- **Action for future sessions:** When authoring or revising a spec, grep
  the prose for gate words ("required critique", "required UAT/E2E") and
  confirm each has the matching config-block flag; at the first
  `start_session` of a set, confirm the recorded policy matches the spec's
  stated intent before any session work runs.
- **Archived Set 085:** spec-authoring rule; its trigger moment is authoring,
  and the authoring guide (on-demand) now carries the pointer.

## GPT-5.4 In The Pull-Verifier Loop Over-Probes And Times Out On Token Budget Before A Verdict
<!-- lesson: id="L-067-1" added-set="067" last-used-set="073" status="archived" scope="repo-specific" encoded-in="ai_router/pull_verifier.py::PullCaps" -->

- **Context:** Driving `ai_router.pull_verifier.pull_route` (or the
  `pull_critique` producer) with the OpenAI binding (GPT-5.4) over a sandbox
  that is anything but tiny — a real `ai_router/` tree, or even a handful of
  large source files (Set 067 S4 dogfood).
- **Failure or friction:** GPT-5.4 kept issuing probe calls (28 `read_file` /
  `grep` in one run) and **never called `submit_verdict`**, exhausting the
  300k-token executor budget (`stop=token-budget`, ~$0.85) with **no verdict**.
  The forced-verdict-on-the-final-turn safety net never fired because the
  **token-budget cap is checked first and breaks the loop before** the
  `max_turns-1` forced turn is reached. Gemini-Pro and Anthropic-Sonnet both
  converged in ~5 probes on the identical sandbox. (Experiment A's GPT
  path-aware arm converged only because those frozen trees were a few tiny
  files.)
- **Lesson:** The pull verifier's "force a verdict on the last turn" guard did
  **not** protect against budget exhaustion — a verbose prober can spend the
  whole budget probing. **Resolved in Set 068:** `pull_route` now carries a
  **budget-aware forced verdict** (an adaptive headroom reserve; when one more
  call of the last size would breach the remaining token/cost budget, the next
  call is forced to `submit_verdict`). With that shipped, GPT-5.4 **converges**
  as a producer/pull-verifier provider — the Set 068 S6 dogfood ran the default
  `openai` + `google` pair and both produced usable verdicts.
- **Action for future sessions (corrected):** **Over-probe control belongs to the
  adapter, not the orchestrator.** Do **not** hand-pick "converging" providers or
  artificially narrow the sandbox to *prevent* over-probing — that is the job of
  `PullCaps` (turn/token/cost ceilings) + the budget-aware forced verdict + the
  producer treating a no-verdict arm as a failed/skipped arm. Run the default
  providers over the **natural full sandbox** (the producer default: the git repo
  root containing the set dir) and let the mechanism self-limit. The Set 068 S6
  dogfood showed the **cost of over-constraining**: a first run scoped to
  `ai_router/` to "be safe" hid `docs/` from the critics, producing **two false
  positives** (a doc "missing" that was merely out-of-sandbox, and a "wrong path
  prefix" that was just the sandbox-relative view) — narrowing the sandbox
  **degrades the path-aware critique's whole point** (cross-artifact context).
  Only scope down for a genuine, stated reason (e.g. an enormous monorepo), never
  to dodge a provider's probing. (Treat a `stop=token-budget` with no verdict as a
  failed arm, which the producer already skips.)
- **Archived Set 085:** resolved by the Set 068 mechanism; the corrected
  action is encoded in `PullCaps` + the budget-aware forced verdict.

## Full texts of Set-085 condensed active lessons

The eight lessons below remain **active** (their ids and condensed <=150-token
forms live in `lessons-learned.md`); these are their pre-condensation full
texts, preserved verbatim. No metadata trailers here — the live trailer for
each id is in the active tier (D2: one id, one trailer).

### Persist Routed Output To Disk Before Display Or Logging (pre-merge full text of L-064-3, merged into L-079-1)

- **Context:** Any routed call on Windows where the default console code page
  is `cp1252`.
- **Failure or friction:** `print(result.content)` crashes mid-line when
  content contains characters `cp1252` cannot encode. The crash loses the
  paid output that has not yet been written anywhere.
- **Lesson:** Write routed output to a file FIRST (`encoding="utf-8"`), then
  print or log. Pattern:
  ```python
  with open(out_path, "w", encoding="utf-8") as f:
      f.write(result.content)
  print(f"Wrote {out_path} ({len(result.content)} chars)")
  ```
- **Action for future sessions:** Never `print(result.content)` directly.

### Windows Child-Process Text I/O Is A Standing cp1252 Bug Class — Pass Bytes At Every Subprocess Boundary (full text of L-079-1)

- **Context:** Any parent<->child process boundary on Windows where *content*
  (not just ASCII status lines) crosses stdout/stderr — extension spawners,
  `python -c` one-liners, CLI transports.
- **Failure or friction:** Two sets hit the same class from opposite
  directions. Set 078: a `cp1252` **decode** crash reading real CLI output,
  misclassified as a 300 s timeout. Set 079: a `cp1252` **encode** crash
  inside the install's config-seed one-liner (`sys.stdout.write(read_text())`
  of a file containing `U+2192`) — swallowed by a fail-open branch, so every
  fresh Windows scaffold silently got no `router-config.yaml`. It survived
  three sessions of verification and was caught only by operator UAT.
- **Lesson:** The child Python's stdout text layer defaults to `cp1252` on
  Windows (pre-3.15), so any non-ASCII payload crossing a pipe *as text* is a
  latent crash in both directions. Pass **bytes** end-to-end
  (`sys.stdout.buffer.write(p.read_bytes())`) and decode once at the consumer
  with an explicit encoding — and the consumer's decode must be
  streaming-safe (`StringDecoder` / buffer-concat), because per-chunk
  `toString("utf8")` corrupts a multibyte sequence a pipe boundary splits.
- **Action for future sessions:** Route bytes through any subprocess whose
  payload can contain non-ASCII; when touching spawn code, grep for text-mode
  child prints and per-chunk `toString("utf8")` and fix the class, not the
  site (L-069-1). A fail-open branch around such I/O must NAME the skip in
  operator-facing output — a silent skip is what let this ship. Promotion
  candidate to a project-guidance Convention on the next sighting.

### Schema-Only Re-Verifies Need `max_tier` Pinned To Block Auto-Escalation (full text of L-064-7)

- **Context:** Round 2 of cross-provider session verification when the
  Round 1 response was substantively correct but used non-standard
  verdict wording (e.g., `**Verdict:** pass` rather than `VERIFIED`).
  The orchestrator re-routes to the same verifier with a "fix the
  wording, keep the substance" instruction.
- **Failure or friction:** A schema-only re-verify legitimately
  produces a very short response (a single verdict token plus a
  one-line summary). The router's short-response escalation heuristic
  fires on that brevity and re-issues the call against the next tier —
  which is a different provider. In one observed case, a Gemini Pro
  re-verify escalated to Opus and added a $0.54 Anthropic spend the
  user had explicitly excluded for the session.
- **Lesson:** Re-verifies that exist only to fix wording must pin
  `max_tier` to the verifier's own tier (or pass `complexity_hint`
  alongside escalation-suppressing instructions in the prompt). For
  Gemini Pro that means `max_tier=2`. The escalation logic exists for
  the substantive-failure case; it is wrong for the
  parser-friendliness case.
- **Action for future sessions:** When re-verifying for schema reasons
  only, pass `max_tier=<verifier_tier>` to `route()` so the router
  cannot cross-provider on its own. If the substantive re-verify is
  itself the goal, normal escalation is correct — only pin when the
  re-verify is wording-only.
- **Symmetric failure (Set 070 S2 — the misapply).** The pin is
  *directional*: it is only ever a **ceiling**, and it must never sit
  **below** the Round-1 verifier's tier on a **substantive** re-verify.
  In Set 070 S2 a Round-2 substantive re-verify (re-checking real fixes,
  not wording) was launched with `max_tier=2` against a tier-3 GPT-5.4
  Round-1 verifier. The pin dropped the call to a tier-2 model — which
  happened to be **Anthropic**, so it both (a) silently broke the
  cross-provider guarantee (the orchestrator was Claude) and (b) hit an
  Anthropic `529`; the re-run **without** the pin stayed on GPT-5.4 and
  succeeded. The rule: a substantive re-verify must stay on (or above)
  the Round-1 verifier's tier — `max_tier` pinning is for wording-only
  re-verifies, and even then only to the verifier's *own* tier, never lower.
- **Recurring trigger (Sets 081-082).** gpt-5-4 as the session-verification
  verifier has twice returned a format-shortfall response on a **clean**
  review — Set 081: non-standard verdict wording needing a wording-only R3;
  Set 082: a bare `No defects found.` with no verdict token and no
  what-was-checked statement, despite the templated Response Format. When
  the verifier is gpt-5-4 and the work is likely clean, budget for one
  wording-only re-run (~$0.05-0.06); the remedy is exactly this lesson's
  pin (`max_tier=<verifier tier>`, gpt-5-4 = 3).

### A Replacement Doc Inherits The Retired Doc's Claims At Its Peril (full text of L-064-8)

- **Context:** Authoring a doc that supersedes or replaces a retired one
  (Set 063 S3: `docs/budget-yaml-schema.md` replacing the schema section
  of the retired `docs/adoption-bootstrap.md`).
- **Failure or friction:** The new canonical doc carried a sentence
  pasted from the retired doc ("Used by ai_router for spend reporting...")
  that contradicted the new doc's own Readers section and the audited
  reality (no `ai_router` runtime reader exists). The cross-provider verifier
  flagged it as a Major Correctness issue — internally contradictory,
  factually wrong.
- **Lesson:** Prose carried over from a superseded doc is a defect
  class of its own: it was true (or tolerated) in the old context and
  reads authoritative in the new one.
- **Action for future sessions:** When authoring a replacement or
  successor doc, grep the new text for claims of *current* behavior
  (reads, writes, enforcement, defaults) and re-verify each against the
  code before routing verification.

### `git diff`-Based Verification Evidence Omits Untracked Files (full text of L-064-9)

- **Context:** Building a cross-provider verification prompt whose
  evidence bundle includes `git diff` / `git diff --stat` output
  (Set 063 S3 round 1).
- **Failure or friction:** Three newly created deliverables were still
  untracked, so the "whole working tree" diffstat silently omitted
  them. The verifier correctly returned a Major Completeness finding:
  the claimed deliverables were unsubstantiated by the evidence.
- **Lesson:** `git diff` shows only tracked changes; untracked files
  are invisible to it. An evidence bundle that presents diffstat as
  "the change set" understates the work whenever new files exist.
- **Action for future sessions:** `git add` new deliverables before
  generating diff-based evidence, or include `git status --short`
  alongside the diff so additions are visible.

### Propagate A Consistency Fix To Every Echo Before Re-Verifying (full text of L-065-1)

- **Context:** Cross-provider verification of a heavily cross-referenced
  synthesis document — a proposal, design doc, or spec whose central
  claims are restated in an executive-summary table, the body sections,
  per-row table cells, and a bottom-line (Set 065 S3 proposal).
- **Failure or friction:** When the verifier flags a framing /
  consistency issue (e.g., "this rule overclaims" or "this cost is
  overstated"), fixing the primary statement but leaving the *same claim*
  un-updated in its other echoes makes the next round return "still
  inconsistent in section X / table cell Y." Set 065 S3 took **four**
  verification rounds (R1->R4) — R3 and R4 existed only to chase residual
  echoes of fixes already accepted in R2, costing ~2 extra rounds /
  ~$0.15.
- **Lesson:** A consistency finding is rarely local. Before re-verifying,
  `grep` the document for every place the changed claim appears
  (summary, prose, table cells, bottom line) and update them all in one
  pass — treat the fix as global, not point-local.
- **Action for future sessions:** After editing to resolve a consistency
  finding, search the doc for the key phrases of the *old* claim and
  confirm zero stale echoes remain before spending another verification
  round.

### A Dependency-Pin Bump Is Not Enablement Until The Target Venv Is Upgraded And The Entrypoint Confirmed (full text of L-075-1)

- **Context:** Rolling a new tool/version floor out to consumer repos — bumping a
  `requirements.txt` (or equivalent) pin so a downstream session can run a newly-shipped
  capability (Set 075 S2 wired the `verification_only_app` matrix into `dabbler-platform`
  and `dabbler-access-harvester` by raising the `dabbler-ai-router` floor to `>=0.26.0`).
- **Failure or friction:** A pin in `requirements.txt` is **declarative**, not effective:
  it states the floor a fresh install *would* resolve, but it does **not** touch the repo's
  already-provisioned `.venv`. The platform venv still had `0.10.0` installed (harvester
  `0.18.0`) — both predating the entrypoint the pin was added to unlock — so
  `python -m ai_router.verification_only_app` failed with `No module named ...`. Had the bump
  been treated as "done" at the edit, the **first** consumer session would have hit the
  failure at Step 6, mid-measurement, on an expensive path.
- **Lesson:** "Enablement" of a new entrypoint is three steps, not one: (1) bump the pin;
  (2) actually **upgrade the target venv** to satisfy it (`pip install -U "<pkg>>=<floor>"`);
  (3) **confirm the entrypoint is reachable and parses the exact args** the downstream step
  will pass (a non-metered `--help` / argument-parse check, never assumed from the pin).
  This generalizes beyond Python venvs to any "declared floor vs. installed reality" gap
  (lockfiles, container base images, globally-installed CLIs).
- **Action for future sessions:** When a session's job is to *make a downstream step
  runnable*, do not stop at the manifest edit. Upgrade the environment that step actually
  runs in and prove the entrypoint imports + accepts its args before calling the enablement
  done. Record the resolved installed version in the close-out, not just the new floor.

### A Rollback Recipe Naming A Pinned Version Must Confirm That Version Is Actually Available (full text of L-078-1)

- **Context:** Writing a rollback/downgrade recipe as part of a release-prep session,
  before the referenced versions have actually published (Set 078 S5's `copilot-cli`
  transport rollback recipe, written while `dabbler-ai-router` `0.28.0` was only
  version-bumped in the repo and `0.27.0` — the very version the recipe told an operator
  to pin back to — was itself still publish-pending on PyPI).
- **Failure or friction:** A rollback recipe is usually drafted alongside the release it
  protects against, using whatever version numbers are already decided — but "decided in
  the repo" and "installable by an operator" are different facts. The CHANGELOG's
  `Rollback` section and the `repository-reference.md` version-walk entry both told a
  future operator to `pip install dabbler-ai-router==0.27.0` during a hotfix, but that
  exact version was not yet on PyPI — the one moment the recipe would actually be needed
  (a live incident) is exactly when a silently-broken escape hatch is most costly. Caught
  by the end-of-session cross-provider verification, not authoring-time review.
- **Lesson:** Before shipping any rollback/downgrade instruction that names a specific
  package version, confirm that version is **actually installable from the target
  registry** (PyPI, npm, Marketplace, a container registry) at the time the recipe is
  written — not merely present in `pyproject.toml`/`package.json`/a lockfile in the repo.
  If the named version is itself still publish-pending, either name the currently-published
  fallback instead, or qualify the step explicitly ("only reachable once `X.Y.Z` has
  published") and give a reachable interim escape (e.g. a config-only fallback) for the gap.
- **Action for future sessions:** When authoring a rollback recipe in the same session that
  bumps a version, check the target registry's actual published state (not the repo's
  declared state) for every version the recipe names, and for a multi-package coordinated
  release, check every named version independently — one half of the pair being live does
  not imply the other half is.

### A Test Layer Nobody Runs Rots Silently — And Fail-Fast Masks How Far (full text of L-064-12)

- **Context:** The Layer-3 Playwright suite (the only CI gate that
  exercises the real webview) between Set 047 and the 2026-06-12
  CI repair.
- **Failure or friction:** The `Test` workflow had NEVER been green.
  Sessions run the TS unit + Python suites at close; nobody ran
  Layer 3 locally between set closes, so five independent rot
  families accumulated (specs asserting pre-Set-050/060 UI, a
  Set 061 spec that was committed without ever being executed, a
  harness premise invalidated by Set 049's v4 writers). The matrix's
  fail-fast then cancelled the ubuntu/windows jobs whenever macOS
  failed, hiding both that the rot was OS-independent AND a separate
  Linux-only env bug (`XAUTHORITY` missing from the Electron-launch
  allowlist) that had never once executed to failure.
- **Lesson:** A test layer that isn't part of anyone's routine run is
  not a gate — it's decoration that decays. And a red default-branch
  CI is worse than no CI: every new real regression lands invisibly
  behind the standing failure.
- **Action for future sessions:** (1) Any session that changes
  Explorer-rendering surfaces, the state-file writers, or the
  fixture harness must run `npm run test:playwright` locally before
  close — the close-out "suite green" convention includes Layer 3
  for those scopes. (2) When CI is red, treat "which jobs were
  CANCELLED" as unknown coverage, not passing coverage. (3) Repaired
  2026-06-12 (commits 4cc135e, a139f22, 61a9bbf — first-ever green
  run 27420899764); if the workflow goes red again, fix it in-flight
  rather than letting a standing failure re-accumulate.
