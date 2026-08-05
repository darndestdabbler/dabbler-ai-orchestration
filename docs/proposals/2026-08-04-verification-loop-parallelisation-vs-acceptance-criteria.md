# Verification loop: parallel lenses vs. verifier-authored acceptance criteria

> **What this is.** A decision brief on two proposed changes to the mandatory
> cross-provider verification loop, written after Set 109 closed and two
> cross-provider critiques were commissioned. It is **self-contained** — it
> assumes no prior conversation.
>
> **Status:** no code changed, nothing committed against it. Candidate scope for
> **Set 111**, which has a reserved number and is not authored.
>
> **Date:** 2026-08-04. **Author:** Claude Opus 5 (the orchestrator that ran Set
> 109 and originated both proposals — so an interested party, see *Provenance*).

---

## 1. Who this is for, and what is wanted

The next reader is asked for **depth on a question already argued from one
side**, not a tiebreak. Two independent cross-provider critiques already exist
and are reproduced faithfully below; the open questions in §10 are the ones
neither of them settled.

If the reader is an **Anthropic** model: note that the author is too. That makes
this a stronger read of the same family's reasoning, not an independent one.
The OpenAI and Google critiques in §6–§7 remain the cross-provider evidence and
should not be double-counted as agreement with the author.

## 2. The system as it works today

A Python AI router drives an AI-led development workflow. Every work session
ends with **mandatory cross-provider verification**: the session's evidence
bundle (spec excerpt, `git status --short`, the complete working-tree diff) is
routed to a verifier from a **different provider** than the orchestrator that
did the work. That exclusion is enforced in `route()` and gated on
`task_type == "session-verification"`; it is the only guarantee a session is not
verified by itself.

Verification is a **sequential phased loop**:

1. **`discovery`** — K=2 calls with **identical prompts** to the **same** model,
   merged into one round envelope. K was sized by an experiment
   (`docs/session-sets/096-.../s1-fanout-experiment.md`) measuring pairwise
   finding overlap between identical calls at **Jaccard 0.13–0.31**.
2. **`supplementary`** — a completeness-critic pass over the **same** evidence,
   fed the prior findings with a **do-not-re-report** instruction. Run when
   discovery found Critical/Major.
3. Orchestrator remediates and writes a per-round remediation sidecar.
4. **`remediation-review`** — reviews the **fix delta** since the discovery
   baseline tree, plus an auto-assembled cross-round ledger. Issues per-finding
   `fix-accepted` / `fix-rejected` / `accepted-with-modification` verdicts. New
   defects are admissible only within the fix hunks.

Bounded at **2 discovery passes and 2 remediation-review cycles**. A severity
rubric (L-095-1) grades by consequence — probability the stated failure
materialises × impact; no plausible failure scenario ⇒ Minor by definition —
introduced after an ungraded loop was measured **not to converge**: 17 rounds,
39 fresh "Majors", zero disputed.

## 3. The measured problem

Measured across **181 sessions in 63 session sets** — every schema-v4 set;
schema-v3 sets carry no timestamps — from `session-state.json` start/complete
stamps, split into work and verification phases using `router-metrics.jsonl`
rows with `task_type="session-verification"`. No instrumentation was added.

| sets | n | median total | p90 | >2h | median sv-calls | work / verify (min) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 047–074 | 98 | **33 min** | 73 | 5 | 2.0 | **24 / 13** |
| 075–094 | 49 | 73 min | 220 | 11 | 3.0 | 40 / 22 |
| 095–096 | 3 | 366 min | 562 | 2 | 14.0 | 40 / 326 |
| 097–105 | 17 | 54 min | 343 | 4 | 4.0 | 37 / 17 |
| 106–110 | 14 | **115 min** | 432 | 5 | 6.5 | **44 / 72** |

- Work roughly **doubled** (24 → 44 min).
- **Verification grew 5.5×** (13 → 72 min); calls per session 2.0 → 6.5.
- Sets 047–074 **already met** the operator's target, so this is a regression,
  not a stretch goal.
- The round cap exists and is **routinely exceeded in practice** — one session
  ran 13 calls over 379 minutes, after the cap shipped.
- **46 of 181 sessions ran zero verification calls.** This matters in §6.

Two honest exclusions: one 934-minute session was a human stopwatch walk and one
432-minute session built three services from scratch. Those sessions genuinely
*were* the work.

**Operator targets:** 15–20 min of work per session, plus 5–20 min of
verification scaled to risk, with the risk estimate itself costing under a
minute.

## 4. What one recent session actually produced

Set 109 Session 4, same working diff at every round:

| round | configuration | cost | Majors |
| :--- | :--- | ---: | ---: |
| R1 `discovery` | 2× `gpt-5-6-luna`, **identical prompts** | $0.046 | 1 |
| R2 `supplementary` | 1× `gpt-5-6-sol`, different framing | $0.520 | 3 |
| R3 `remediation-review` | 1× `gpt-5-6-sol` | $0.251 | 0 |
| R4 `remediation-review` | 1× `gpt-5-6-sol` | $0.232 | 1 |
| path-aware critique (tool-using, reads the repo) | google + openai | ~$0.30 | 1, **after the loop returned VERIFIED** |

All five Majors were real; all were accepted, none disputed. Full record:
`docs/session-sets/109-model-registry-and-pricing-truth/s4-remediation-round-1.md`.

## 5. The two proposals, as originally framed

**PROPOSAL A — parallelise the finding phase with diverse lenses.**
Replace sequential `discovery` + `supplementary` with **one parallel wave of N
verifiers**, each with a different lens (framing, model, provider) rather than K
identical prompts. Dedupe afterwards in deterministic code. Width and model mix
chosen by `ai_router/blast_radius.py` — an existing path-based, deterministic,
sub-second risk predicate. Claimed rationale: finding rounds have no true
dependency; the do-not-re-report instruction is a token optimisation, not a
correctness requirement. Fix-*checking* stays sequential because a fix must
exist before it can be reviewed. Estimated ~$0.72 parallel vs $1.05 sequential,
~3 min vs ~8 min.

**PROPOSAL B — the verifier emits an explicit acceptance criterion per
finding**, stating what would demonstrate the finding fixed, preferring an
executable check (command + expected exit code/output) over prose. Remediation
is then checked by **running** those criteria — shell where executable, a cheap
third-party model only where genuinely judgment-based — instead of another
open-ended re-verification round. Rationale: re-verification is an **open**
prompt ("look at this again"), which is why a salience-limited reviewer keeps
returning fresh findings; an acceptance criterion is a **closed** question.
Today the orchestrator decides when its own fix is adequate and writes its own
falsifier, which is self-marking.

## 6. Critique 1 — OpenAI `gpt-5.6-sol`, adversarial lens ($0.112)

Asked to find failure modes, not to balance merits. Raw:
`consult-openai.json` (scratchpad).

**Against A.** *Duplicate amplification* — independent lenses rediscover the
most salient defect, and deterministic dedupe cannot reliably identify semantic
aliases with different locations, triggers, severities or remedies; false splits
burn attention, false merges discard distinct failure modes. *Loss of adaptive
coverage* — the do-not-re-report instruction reallocates the second model's
limited attention toward omissions; parallel reviewers cannot condition their
search on what others covered. *Ledger degradation* — a deduplicated list is not
a cross-round ledger; merging loses provenance, dissent, and finding→remediation
mapping. *Unresolved contradictions* — one lens may demand rejecting unknown
enum values while another demands forward compatibility; with no arbiter the
orchestrator chooses, **restoring self-marking**. *Severity instability* — max
inflates escalation, min hides risk, keeping both duplicates remediation.
*Front-loaded waste* — sessions that would pass after cheap discovery now pay
for every lens; the path predicate cannot detect semantic risk from paths alone.
*Correlated blind spots* — different prompts and models are not independent
evidence.

**Against B.** *Vacuous criteria* — "run tests", "confirm errors are handled"
pass without exercising the stated failure, giving false closure merely by being
formatted as a closed question. *Proxy success* — a narrow test passes while the
defect remains on another platform, config, call path, race window or input
class. *No adequacy checker* — the verifier authors both the allegation and its
success condition; a later model checking only whether the condition passed
cannot tell whether it was the **right** condition without reopening the
analysis, which is the loop B removes. *Remediator gaming* — hard-code the
tested input, modify fixtures, `xfail`, weaken assertions, wrap for exit 0.
*Invalid commands* — a bundle-only verifier may invent targets, dependencies or
credentials. *Unsafe execution* — **verifier-generated shell is untrusted code**;
running it with repository credentials and a mutable workspace creates
exfiltration and destructive-command risk, and sandboxing it adds the complexity
being avoided.

**Its proposed guard — baseline discrimination:**

> Run the **unchanged** criterion in an isolated harness against **both** the
> pre-fix and the fixed tree. It may auto-close a finding **only if it fails
> before and passes after**. The harness, not the remediator, executes it; edits
> to the criterion or its test assets invalidate the result. Criteria that
> already pass before remediation remain judgment-based and cannot auto-close.

**Its attack on the author's reasoning.** The "no true dependency" claim is
**false**: there is no *artifact* dependency between finding rounds, but there
is an **informational** one — prior findings identify covered areas, expose
assumptions, and direct scarce attention toward gaps. And the one-session
result **does not generalise**: model, price, capability, framing, tool access,
round order and access to prior findings all changed simultaneously, so Major
count cannot isolate identical prompting as the cause. It further notes the
Jaccard 0.13–0.31 range shows identical calls **already** produce substantially
different findings, **directly weakening** the inference drawn from §4.

## 7. Critique 2 — Google `gemini-2.5-pro`, silent-loss lens ($0.013)

Asked not for bugs but for value the sequential design provides that the
proposals would quietly discard. Raw: `consult-google.json` (scratchpad).

**Which undocumented properties are load-bearing.**
*Findings ordered by salience* — **load-bearing**; the cheap-then-expensive
sequence is crude but effective triage, and A delivers a flat unordered list
that raises cognitive load. *Orchestrator informed by round 1* —
**incidental**; the orchestrator sees the full bundle before acting, so the real
loss is only that verifier 2 cannot focus its search. *A clean round is a
genuine STOP signal* — **load-bearing**; a clean cheap discovery pass ends
verification, a fast path that rewards good work, and A eliminates it. *Cost
scales with how bad the work was* — **load-bearing**; an elegant implicit
feedback loop that A replaces with a fixed higher floor, **losing the economic
incentive to produce clean work first time**.

**Second-order effects of B — Goodhart's Law.** The orchestrator's objective
shifts from "fix the problem" to "pass the criterion", producing *minimal viable
fixes* satisfying the literal text while ignoring its spirit. Verifiers carry a
heavier burden, since a weak criterion is **worse than none** — it supplies
false security. And the system loses **holistic review**: `remediation-review` is
open-ended and can spot unintended consequences or new adjacent bugs introduced
*by the fix*; an acceptance criterion is narrow, so correctness becomes a
function of criterion quality rather than of an independent final look.

**Adoption.** A trades waiting time for thinking time — the run feels faster,
then presents a larger unordered list from multiple sources; a **firehose**,
whose triage burden likely outweighs the speed gain, and whose loss of the fast
pass for good work "will feel unfair". B "will be perceived as help, not
hindrance": the main source of frustration in a review loop is ambiguity, and an
explicit criterion converts *"is it right yet?"* into *"does it pass?"* — clarity
it expects to be **a massive driver of adoption**.

**Forced choice: keep B, discard A.** The severe problem is non-convergence, not
latency; B attacks the root cause and makes the remediation loop converge by
definition, while A is "a brute-force attack on a symptom" that sacrifices
scaled cost and the fast-path exit and increases triage burden — "it solves the
speed problem at too high a cost to the system's design and usability."

## 8. Errors in the author's reasoning, now conceded

1. **The dependency claim was wrong.** Artifact dependency and informational
   dependency are different things; only the first is absent. The
   do-not-re-report instruction allocates attention, and calling it a token
   optimisation was incorrect.
2. **The §4 inference does not survive.** n=1 with at least seven simultaneous
   confounds. Worse, the Jaccard 0.13–0.31 figure was cited as background while
   it actually **contradicts** the conclusion drawn — evidence quoted against
   its own argument without noticing.
3. **The fast-path was never weighed.** 46 of 181 sessions ran zero verification
   calls. Proposal A would charge every one of them a full parallel wave, making
   good work cost *more* — a perverse incentive, and the largest single flaw,
   caught independently by both critiques.
4. **Untrusted-code execution was missed entirely** in Proposal B.

## 9. The counterexample that bounds Proposal B

Set 109 S4, R2 raised: *the discovery pin was moved to a cheaper model without
the empirical quality evidence the spec requires.* A reasonable acceptance
criterion — *the pin is not armed without evidence* — would have **passed** the
remediation cleanly.

R4 then found a new Major: withdrawing the pin left an explicit end-of-set
deliverable unmet. That is a property of **what the fix broke**, not of whether
the original finding was addressed, and **no criterion written at finding time
could have anticipated it**.

This is a measured instance, from the session that motivated the proposal, of
Google's "loss of holistic review". **B reduces re-verification rounds; it
cannot eliminate the final delta review.**

## 10. Revised position, and the open questions

**Revised position (author's, post-critique):**

- **Drop Proposal A as framed.** Keep only its residue: within the K=2 discovery
  fan-out *already paid for*, **vary the framing** instead of sending identical
  prompts. Same cost, same loop position, fast-path and cost-scaling preserved,
  no front-loading. Set 096 S1's Jaccard methodology already exists to test
  whether framing beats repetition — properly, with **one** variable.
- **Keep Proposal B, gated by baseline discrimination** (§6).
- **Retain `remediation-review`** as the final delta look (§9).

**Open questions the critiques did not settle:**

1. Is framing-variation inside the existing fan-out worth measuring at all, or
   is the Jaccard 0.13–0.31 result already sufficient evidence that identical
   calls diverge enough?
2. Baseline discrimination proves a criterion is *related* to the defect. It
   does not prove it is *sufficient*. Is there a cheap check for sufficiency, or
   is that irreducibly a judgment call?
3. Google calls criterion quality "tractable"; OpenAI says there is "no adequacy
   checker" short of reopening the analysis. **They disagree.** Who is right?
4. If `remediation-review` is retained, how much does B actually save? Its value
   may be convergence and clarity rather than round count — and if so, the
   measured 5.5× verification growth may not shrink as much as hoped.
5. Does the round cap fail because it is too loose, or because nothing
   *enforces* it? The data says it is exceeded in practice; neither proposal
   addresses that directly.

## 11. Constraints any answer must respect

- **The realistic alternative is abandonment.** Operator, 2026-08-04: staff find
  the orchestrator too complicated and may "set it aside and do their own
  thing" — ad-hoc chat with **no** cross-provider check, no ledger, no record,
  and the engine deciding for itself whether to seek a second opinion.
  **Adoption dominates rigour**; a little lost verification depth beats an
  abandoned tool.
- **Standing operator guidance:** stop adding complexity; remove rather than
  add; "don't add any more than is necessary for this to be functional." A
  proposal in this area that does not *shrink* the machinery should be regarded
  with suspicion. Note that B-plus-baseline-discrimination is a candidate
  **replacement** for several phase types, two caps, the cross-round ledger and
  the no-resurrection tracker — that is its strongest argument.
- **Orchestrator attention is the scarcest resource.** More findings to triage
  is a real cost, not a free benefit.
- **Verification must not silently weaken.** The loop earned its cost in Set 109
  S4: five real Majors, one found *after* it had already returned VERIFIED.
- **The capability-scaling test** *(operator-elevated to a guiding principle
  for Set 111, 2026-08-05)*. Judge every piece of machinery this set adds,
  keeps, or removes by one question: **does it become more valuable, or less
  necessary, as models improve — or does it stay equally costly?** Machinery
  built around weak verifiers fails the test: sequential round-grinding, dedup
  ledgers, no-resurrection tracking, adjudication chains, and count-based caps
  are fixed ceremony a stronger model cannot shrink. Machinery that absorbs
  upgrades passes: a deep tool-provisioned discovery pass (capability arrives
  as a registry pin), executable acceptance criteria with baseline
  discrimination (ground truth is capability-independent, and criterion
  quality *improves* with the writer), measurement close-gates, and
  consequence-weighted budgets in place of round counts (better models finish
  under them, so the stop is economic rather than arbitrary — and when rounds
  keep yielding agreed Majors, a budget lets them run while they earn their
  cost). Two structures are exempt from being scored as weak-model
  scaffolding: **cross-provider exclusion** and **ground-truth anchoring** —
  correlated blind spots are not known to decay with capability. Evidence
  anchors: 110 S1, where the decisive verification act was a real-host
  measurement (stub figures off by 10×) that no review round could have
  produced; and Set 109 S4, where a tool-using critique found a Major after
  the bundle-only loop had returned VERIFIED.
- **Decision-rights rubric + education mode** *(operator-directed,
  2026-08-05)*. Operator-gated adjudication assumes an operator who can
  responsibly decide; in an AI-led workflow the operator usually lacks the
  surfaced context, and most will not rebuild it. Route decisions by whose
  **authority or preferences** they need, not how much judgment they need.
  Human-required: external or hard-to-reverse consequences (publish, spend,
  delete — beyond version control's undo horizon), underivable value
  trade-offs, accountability sign-offs. Everything judgment-shaped —
  spec-vs-reality conflicts, waiver adjudications, severity disputes — is
  **AI-decidable under an ordered rubric**: (1) the spec's goal over its
  unmeetable letter; (2) prefer reversible; (3) tied → the option that makes
  the code simpler (fewer branches, fewer tests to hold it true); (4) prefer
  deferring evidence to an existing later gate over inventing a new one;
  (5) still tied → cross-provider consensus (extend the existing
  `decision_consensus` machinery — 111 re-draws its human-only split per this
  test); (6) consensus splits → human. Every AI-made call is journaled for
  after-the-fact operator audit — **the human moves from gate to auditor**.
  Hard carve-out: decisions that *reduce verification* stay outside AI
  authority (no-skip mandate; the agent never authors its own permission).
  When a human genuinely is required, the ask runs in **education mode**: a
  self-contained brief — where the set stands, the question in one sentence,
  options with likely consequences and costs, a recommendation with
  confidence, the default on no-answer — written for a developer who has not
  been watching. Both halves pass the capability-scaling test: a rubric
  executed by models improves with models; an operator gate is a fixed
  bottleneck that does not.

## 12. Provenance

| item | source | cost |
| :--- | :--- | ---: |
| Duration measurement | 181 sessions, 63 sets, existing state files | $0 |
| Adversarial critique | `openai / gpt-5.6-sol`, anthropic + google excluded | $0.112 |
| Silent-loss critique | `google / gemini-2.5-pro`, anthropic + openai excluded | $0.013 |

Both critiques were given the same evidence (§2–§5) and **different lenses** —
deliberately, since the proposal under review claims diverse lenses beat
repetition. They converged on the fast-path objection from different directions
and diverged on criterion-quality tractability (§10 Q3).

Raw responses are in the session scratchpad rather than the repo; ask the
operator if they are needed verbatim.
