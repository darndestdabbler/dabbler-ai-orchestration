# HL7 ELR translator study — results

> **Copied here for reference. This is not a document about this repository.**
> It reports an empirical study run in the sibling `dabbler-ai-orchestration-eval`
> repository, and every path it cites — `study-artifacts/`, `RUNBOOK.md`,
> `OVERVIEW.md`, the ledgers and snapshots — lives **there**, not here.
>
> What it means *for this framework* is written up separately, in
> `framework-implications.md` in that same repository: the verifier evidence
> gap (`facts.py:174-200`), the NITS/`minor` path that silences a found defect
> (`verdict.py:101-103`, `229-236`), the unwired `plan_review.review_round()`
> (`plan_review.py:801`), and the corpus selection bias in set 146.
>
> The study used this repository's own `ai_router/prompt-templates/verification.md`
> as its verifier prompt, and §5 measures what that prompt was worth.

One task: given the model classes and the parsed implementation guide, write a
parser that turns an HL7 v2.5.1 ELR message into a populated `ElrMessage`.
Scored on 15 held-out real messages from published state and national guides.

**$110.88 total** against a $400 ceiling. Everything below is recomputable from
`study-artifacts/hl7/study/` **in the eval repository** without dispatching
anything. Method: `RUNBOOK.md`, also there.

---

## 1. Results

All cells below use the same adversarial verification prompt, ported from
`dabbler-ai-orchestration`. **Accuracy** is the pooled tally: correctly
populated model properties across all 15 scored messages, over the 4911 the
reference parser populates. Costs in parentheses are what each seat spent.

| Arm | Authoring engine | Implementer | Verifying engine | Accuracy | Cost |
| --- | --- | --- | --- | ---: | ---: |
| 2 | claude-opus-5 ($0.00) | claude-opus-5 ($4.12) | gpt-5.6-sol ($0.61) | 0.997 | $4.73 |
| 2 | gpt-5.6-sol ($0.00) | gpt-5.6-sol ($0.43) | claude-opus-5 ($1.10) | 0.426 | $1.53 |
| 3 | claude-opus-5 ($2.28) | claude-haiku-4.5 -> claude-sonnet-5 ($1.22) | gpt-5.6-sol ($0.30) | 0.997 | $3.80 |
| 3 | gpt-5.6-sol ($0.56) | gpt-5.6-luna -> gpt-5.6-terra ($0.29) | claude-opus-5 ($2.47) | 0.996 | $3.31 |
| 3+plan | claude-opus-5 ($4.36) | claude-haiku-4.5 ($0.66) | gpt-5.6-sol ($0.86) | 0.997 | $6.19 |
| 3+plan | gpt-5.6-sol ($0.63) | gpt-5.6-luna ($0.09) | claude-opus-5 ($2.22) | 0.997 | $4.12 |
| 4 | claude-opus-5 ($3.33) | claude-sonnet-5 -> claude-opus-5 ($3.37) | gpt-5.6-sol ($0.78) | 0.997 | $7.48 |
| 4 | gpt-5.6-sol ($0.39) | gpt-5.6-terra -> gpt-5.6-sol ($0.72) | claude-opus-5 ($2.50) | 0.997 | $3.62 |
| 4+plan | claude-opus-5 ($4.32) | claude-sonnet-5 ($1.62) | gpt-5.6-sol ($0.79) | 0.997 | $7.05 |
| 4+plan | gpt-5.6-sol ($0.65) | gpt-5.6-terra -> gpt-5.6-sol ($0.48) | claude-opus-5 ($3.02) | 1.000 | $5.32 |
| 5 | claude-opus-5 ($1.95) | claude-opus-5 ($2.29) | gpt-5.6-sol ($0.34) | 0.991 | $4.58 |
| 5 | gpt-5.6-sol ($0.53) | gpt-5.6-sol ($0.74) | claude-opus-5 ($2.01) | 0.426 | $3.29 |
| cheap+plan | claude-haiku-4.5 ($1.21) | claude-haiku-4.5 -> claude-sonnet-5 ($2.38) | gpt-5.6-sol ($0.46) | 0.998 | $4.05 |
| cheap+plan | gpt-5.6-luna ($0.13) | gpt-5.6-luna -> gpt-5.6-terra ($0.38) | claude-opus-5 ($1.74) | 0.997 | $3.60 |
| cross+plan | claude-opus-5 ($3.56) | gpt-5.6-luna -> gpt-5.6-terra ($0.35) | claude-opus-5 ($1.93) | 0.997 | $7.17 |
| cross+plan | gpt-5.6-sol ($0.75) | claude-haiku-4.5 ($0.00) | gpt-5.6-sol ($2.22) | 0.000 | $2.97 |

**Arms.** 2 — author implements, independent verifier. 3 — author writes a
plan, a **cheap** engine implements it. 4 — same, **medium** engine. 5 — same,
**top** engine. Arms 3 and 4 escalate one tier on a blocking verdict. **+plan**
means the plan was reviewed by an independent reviewer *before* any code was
written. **cheap+plan** puts a cheap engine in every seat except the final
verifier; **cross+plan** gives the author a delegate from the *other* provider
family. An implementer shown as `X -> Y` escalated: Y finished the job, and
crediting X with the result would name the wrong engine.

A **$0.00 author** is an arm that never dispatched a separate authoring call —
the implementer is the author. Arm 1 (no independent verifier) ran only under
the earlier prompt: opus-5 0.997 / $3.54, gpt-5.6-sol 0.426 / $1.68, with three
rounds of self-review moving the latter 0.426 → 0.425 → 0.426.

`cross+plan` orientation B is **void, not a zero**: see §4.

## 2. Verifying the plan is the strongest result in the study

The plan here is what the author hands a cheaper engine: **detailed
implementation instructions** — classes, method signatures, field-to-setter
mappings, and the order in which delimiters are resolved. It costs more to
write than a one-line brief, and it gives a reviewer far more to judge.

Head to head, same arms, same prompt, with and without a plan review:

| cell | plan reviewed | accuracy | total | implementer's own spend | escalated? |
| --- | --- | ---: | ---: | ---: | --- |
| arm3-A | no | 0.997 | $3.80 | $1.22 | yes, haiku → sonnet |
| arm3-A | **yes** | 0.997 | $6.19 | **$0.66** | **no** |
| arm3-B | no | 0.996 | $3.31 | $0.29 | yes, luna → terra |
| arm3-B | **yes** | 0.997 | $4.12 | **$0.09** | **no** |
| arm4-A | no | 0.997 | $7.48 | $3.37 | yes, sonnet → opus |
| arm4-A | **yes** | 0.997 | $7.05 | **$1.62** | **no** |
| arm4-B | no | 0.997 | $3.62 | $0.72 | yes, terra → sol |
| arm4-B | **yes** | **1.000** | $5.32 | **$0.48** | yes, terra → sol |

Three things happened, and they are consistent across all four cells:

1. **The implementer got cheaper every time** — halved or better. A reviewed
   plan removes the remediation rounds the delegate would otherwise be paid for.
2. **Escalation stopped being necessary** in three of four. The cheap tier
   produced a 0.997 parser on its first attempt. `gpt-5.6-luna` — the cheapest
   engine in the study, which scored **0.032** in an earlier unplanned run —
   hit **0.997 first time for nine cents of its own spend**.
3. **The ceiling moved.** `arm4-B` scored **1.000 — 4911 of 4911** — the only
   perfect result in the study.

### Why it worked: the defect became substantiable

This is the mechanism, and it is worth stating precisely.

Reviewing the **implementation**, `claude-opus-5` found the study's central
defect and declined to block on it:

> No exception tolerance anywhere… one malformed timestamp or non-numeric NM
> discards the entire `messages` list… **I could not substantiate a concrete
> triggering value in the artifacts available, so this is speculative rather
> than blocking.**

Reviewing the **plan** — same model, same task, same reference material — it
graded the same defect **Critical**:

> The defects are all in **failure policy**, and they are severe.
>
> **Issue 1: Malformed values are ordered to throw, destroying the whole
> message *and* the rest of the batch.** …The plan puts `parse` in a state
> where a single bad token annihilates every property in the message, and
> because the exception escapes `parse`, every *other* message in a batch too.

It then enumerated four concrete triggering cases it could not produce when
reading code — `OBX-2=NM` with a value of `NEGATIVE`, a CLIA identifier in
`XON-3`, partial dates, a stray trailing component.

**A plan declares intent; source only implies it.** The plan literally said
malformed values "must throw `IllegalArgumentException`", so the reviewer did
not need a triggering input to substantiate the finding — the policy was on the
page. That is why the same reviewer blocks on the plan and shrugs at the code.

### Who reviewed, and how many plans were actually signed off

The review was done by the cell's **independent cross-provider verifier**, not
the author — `gpt-5.6-sol` reviewed `claude-opus-5`'s plans, and `claude-opus-5`
reviewed `gpt-5.6-sol`'s. Both produced substantive critique, so the effect is
not specific to one reviewer. Reviewing Opus's plan, Sol raised a Correctness
defect (`OBX-7` treated as component-bearing, losing `referencesRange` on the
guide's own recommended representation) and a Failure-policy defect (composite
builders returning objects whose every property is null).

**But only one of the four plans reached VERIFIED**, and this qualifies the
result:

| cell | plan review 1 | plan review 2 | plan at implementation |
| --- | --- | --- | --- |
| arm3p-A | ISSUES FOUND | ISSUES FOUND | revised once more, **unreviewed** |
| arm3p-B | ISSUES FOUND | ISSUES FOUND | revised once more, **unreviewed** |
| arm4p-A | ISSUES FOUND | ISSUES FOUND | revised once more, **unreviewed** |
| arm4p-B | ISSUES FOUND | **VERIFIED** | signed off |

Three of four hit the two-round plan cap with findings still outstanding, and
their final revision went into implementation without being re-reviewed. So the
gain measured in the table above comes from **the review-and-revise cycle**, not
from reaching an approved plan — a weaker claim than "verified plans produce
better code", and the honest one.

Worth noting, with n=1 and no weight attached: `arm4p-B` is both the only cell
whose plan was actually signed off and the only cell that scored **1.000**.
**§4 supplies the counterexample**: `cross-A`'s plan *was* signed off and its
implementation still scored 0.426. So sign-off is not sufficient, and the
revise cycle rather than the approval is the better explanation on the evidence
available.

### What it costs

Not free, and not uniformly cheaper. Total spend rose in three of four cells,
because the **author** pays for the review cycle: `claude-opus-5` revising its
own plan cost $2.08 and $0.99 extra, while `gpt-5.6-sol` revising cost $0.07 and
$0.26. Whether plan review pays therefore depends on how expensive your author
is, not on how cheap your delegate is.

The clean statement: **plan review buys reliability and a cheaper implementer;
it does not buy a cheaper total when the author is a premium model.**

## 3. What the whole low-score spread came down to

Every low score in this study is **one unchecked exception**, not weak
comprehension. The OpenAI-implemented cells crashed at runtime on exactly the
same eight messages, worth 2814 properties — **57.3%** of the corpus. On
everything they did not crash on, precision was 0.997. 0.426 + 0.573 = 0.999.

```
iowa-enteric   161 paths   ok
nj-small        66 paths   ok
natl-01          0 paths   java.lang.IllegalArgumentException:
                           Invalid HL7 timestamp: 2008081830-0700
```

`2008081830-0700` has hour 30 and appears in the **national guide's own
published examples**. Note the arithmetic honestly: it is the *identical string*
in eight of the nine national messages, and `natl-06` — the only one that
parsed — is the only one without it. That is **one copy-paste defect in one
source document, not eight independent occurrences**. The 57.3% is a true
corpus fact and a poor severity prior.

The reference parser had this same defect until it was fixed this month: *"an
out-of-range timestamp threw — one bad field failed the whole message."* Both
stacks understood HL7 equally well; they differed on **fail-open versus
fail-closed**.

## 4. How cheap can the middle be?

Two further configurations, both with plan review.

**All-cheap except the final gate** — a cheap planner, a cheap plan reviewer, a
cheap implementer, and one expensive verifier at the end — produced the
**cheapest 0.997 in the study**:

| config | planner | plan reviewer | implementer | accuracy | cost |
| --- | --- | --- | --- | ---: | ---: |
| cheap-B | gpt-5.6-luna ($0.13) | claude-haiku-4.5 | luna → **terra** | 0.997 | **$3.60** |
| cheap-A | claude-haiku-4.5 ($1.21) | gpt-5.6-luna | haiku → **sonnet** | **0.998** | $4.05 |

`cheap-A` also returned **precision 1.000** — the cleanest output of any cell.

Read the arrow, though, because it is the whole result: **neither cheap
implementer got there on its own.** Luna's first attempt scored 0.396, Haiku's
scored 0.010. The expensive verifier caught both, and the escalation ladder
pulled in a *medium*-tier engine to finish. So the configuration works, but
"cheap implementer" means "cheap first attempt plus a mid-tier rescue", and the
expensive verifier is what triggers the rescue. In `cheap-B`, Opus-as-verifier
was $1.74 of the $3.60.

The cheap **planners** were genuinely weak. Luna's plan cost $0.09 and produced
0.396; Sol's plan for the same implementer produced 0.997 first try. Plan
quality tracks planner tier — what rescued `cheap-B` was not a good plan, it was
the escalation.

**A delegate from the other provider family** was the weaker idea:

- `cross-A` — Opus plans, Sol approves the plan, Luna implements — reached 0.997
  but cost **$7.17**, $3.56 of it Opus authoring. Notably its plan reached
  **VERIFIED** and Luna still produced 0.426, hitting the same fail-closed
  timestamp defect. That is a direct counterexample to the idea in §2 that
  sign-off rather than revision carries the effect; weight that hypothesis down.
- `cross-B` — Sol plans, Opus approves, Haiku implements — **failed twice,
  identically.** Haiku ran the full 30-minute dispatch cap and wrote nothing,
  on both attempts. §11's unattributed-cost rule voided the cell correctly, so
  the 0.000 in the table is a **void, not a score.** Haiku implements Opus's
  plans without trouble (`cheap-A`, `arm3p-A`) but reproducibly hangs on Sol's.
  Recorded as a cross-family compatibility failure, on n=2, worth one more probe
  before anyone relies on that pairing.

### Where the money actually goes

The per-seat columns settle a question the earlier tables could not:

| seat | share of cell spend, across all cells |
| --- | --- |
| implementer | **2–33%**, never the largest |
| author | $0.13 (luna) … $4.36 (opus) |
| verifier | $0.30 (sol) … $3.02 (opus) |

**The implementer seat is never where the money is**, and every cheap
implementer failed its first attempt. What determines the outcome is the
**planner's tier** — which sets the quality of the instructions — and the
**verifier's willingness to block**, which decides whether the failure is
caught. Optimising the delegate tier is optimising the smallest line item.

Opus costs $1.93–$4.36 wherever it sits. The cheapest route to ≈0.997 puts it
in exactly one seat, and the seat that pays best is the **final verifier**.

## 5. The verification prompt was worth more than the engine tier

Repeating the eight verified cells with only the verifier prompt changed —
from a condensed version to the full `dabbler-ai-orchestration` prompt — lifted
three of four weak cells from 0.03–0.43 to 0.99+.

| cell | condensed prompt | house prompt |
| --- | ---: | ---: |
| arm3-B | 0.032 | **0.996** |
| arm4-B | 0.426 | **0.997** |
| arm5-B | 0.426 | 0.997 → regressed to 0.426 |
| arm2-B | 0.426 | 0.426 |

The additions that plausibly did the work: an explicit **Completeness**
criterion, and the **anti-laundering escalation** — *"when in doubt, escalate"*.
`arm2-B` still passed, for the evidence reason in §2.

## 6. Methodological findings

**Remediation can regress.** `arm5-B` went 0.426 → 0.997 → 0.426. Partly a
harness artifact: the loop breaks at the round cap *before* verifying, so round
3 was scored and never reviewed. Report peak and terminal.

**Variance is large at the cheap tier.** `arm3-B`'s first implementation scored
0.032 in one run and 0.426 in another on identical configuration. One run per
cell cannot distinguish an arm from a coin flip down there — which makes the
plan-verified result's consistency (four cells, all ≥0.997) more interesting
than any single cell.

**Decomposition alone did not pay.** Arm 5 never beat arm 2 on accuracy and cost
more. The authoring call is only worth its price when someone reviews it (§2) or
when it lets a much cheaper engine implement (arm 3).

**The build gate paid repeatedly.** Red builds returned to the author with no
verifier spend; the fixes cost about $0.03.

**`extra_fields` earned its place.** Several cells populated ~2074 paths the
reference never reaches, building the `OBR.observationResults` group nesting the
reference deliberately leaves unbuilt. Counted separately, not penalised.

## 7. What this cannot support

One run per cell per configuration, no variance estimate beyond the accidental
replicate above. Fifteen messages from three publishers are not independent
samples of "ELR parsing"; two orientations are not a model ranking.

Provider is confounded with role: every Anthropic implementer had an OpenAI
verifier and vice versa, and only `claude-opus-5` reviewed the systematically
weak artifacts. Parsing HL7 is hard but well-specified — a task with genuine
design latitude could invert every disposition seen here.

**The hard-set score measured less than intended.** Two of its five criteria
(escape sequences, absent-versus-empty) are not exercised by the scored set at
all, and it tracked accuracy almost exactly.

## 8. What to change before running this again

1. **Review the plan on any delegated work.** Strongest lever found, and the
   only one that moved the defect from "unsubstantiable" to "Critical". Weigh
   it against the **author's** price, not the delegate's.
2. **Spend on the plan and on the final gate; let the middle be cheap — but
   keep the escalation ladder.** The implementer is 2–33% of a cell and every
   cheap implementer failed its first attempt. The cheapest route to ≈0.997 was
   a cheap planner and cheap implementer with one expensive verifier and one
   rung of escalation ($3.60).
3. **Raise the plan-round cap above two.** Three of four `+plan` cells went into
   implementation with findings outstanding. Note the counterevidence, though:
   `cross-A` had a fully VERIFIED plan and still scored 0.426, so sign-off is
   not sufficient on its own.
4. **Run the candidate before verifying it.** Give the verifier the result of
   executing the parser over a message that is not `iowa-enteric`. This is what
   would close the one cell plan review did not reach.
5. **Record best round as well as last.**
6. **Probe the cross-family delegate failure.** `claude-haiku-4.5` hung for the
   full dispatch cap on `gpt-5.6-sol`'s plan, twice, while implementing Opus's
   plans without trouble. Two data points is enough to avoid the pairing and not
   enough to explain it.
7. **Repeat the cheap-tier cells** before treating any single cheap-tier number
   as a policy rather than an observation.

---

*Ledgers: `study/ledger.jsonl` (house prompt, incl. plan-verified),
`study/ledger-v1-condensed-prompt.jsonl`. Snapshots with candidate dumps and
raw verifier transcripts — including `roundplan<N>-verification.md`, the plan
reviews — under `study/snapshots/`. Table: `study/results-v2.csv`. Regenerate
with `python study-artifacts/hl7/report.py [--markdown]`.*
