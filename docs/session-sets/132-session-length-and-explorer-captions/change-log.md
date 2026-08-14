# Change log — Set 132: session length, causality, and two Explorer captions

**Set:** `132-session-length-and-explorer-captions` (3 sessions)
**Ships:** a sidebar caption that says its own name once, a step-counting
instrument that counts steps, and the answer to the question the set was
built on — which is that the question was second-order.

---

## The set in one line

Set 131 measured session length with an instrument that was wrong in two
ways, drew a tail conclusion from timestamps that were measuring sleep, and
left the causal question open. This set fixed the instrument, re-measured,
found the tail was mostly nights, and then measured the thing nobody had
measured: **what a session's fixed overhead actually costs.** It is 5–7×
a work step, which makes the step budget the wrong lever.

Two unrelated one-line UI fixes rode along in Session 1 rather than paying
per-set overhead of their own — the same amortization argument the set then
went on to quantify.

---

## Session 1 — Two captions, said plainly

**The caption is composed, not stored.** `package.json` contributes a
container title and a view name, and VS Code renders `AI ORCH: WORK
EXPLORER` by joining them. Set 123 S3 had changed the container title *away*
from `AI Work Explorer` for a real reason — the header then read **AI WORK
EXPLORER: WORK EXPLORER**, the same words twice — so restoring the old value
alone would have reintroduced the defect that rename fixed.

The fix was determined **by probing a running workbench**, not by reading
the manifest: a single-view container joins the two names with a colon
*unless they are identical*. Setting container title, view name and
`contextualTitle` all to `AI Work Explorer` renders exactly `AI WORK
EXPLORER`. The Layer 3 spec asserts the **rendered header**, with two
falsifiers — no colon, and exactly one occurrence of "Work Explorer" — both
planted and confirmed to fire.

The sibling site was the one that mattered (L-069-1): the aria-label
selector in `electronLaunch.ts` is how *every* Layer 3 spec opens the
sidebar at all, and reverting the container title timed that helper out —
proving the coupling rather than asserting it.

**`not computed` left the close-out readiness row.** The row already carries
a timestamp when a projection exists, so the presence or absence of the
timestamp *is* the signal, and the phrase sat in the gray slot where that
timestamp appears. Set 127 S2's rule — "no answer" and "nothing remains" are
opposite facts — survives, enforced rather than worded: the rewritten test
asserts an absent projection has no phrase *and* no timestamp, while a
settled row is dated and takes a different icon.

Verification found the one thing the sweep missed: a menu-parity test still
asserting the retired view name, in the file that calls itself "the ONE
place the shipping identity is asserted". Remediated beyond the literal —
the old assertion pinned one of three fields that must agree, so a new test
asserts all three are equal, closing the class.

---

## Session 2 — Fix the instrument before trusting it

Two defects, both found by using the instrument rather than reading it.

**D1 — nested ordered lists were hoisted to top level.** `_STEP_RE` capped a
step marker's indent at three characters, on the reasoning that "4+ spaces
is a nested list". That holds under a *bullet*; under the ordinary `2. `
parent the content column is exactly 3, which is where CommonMark nests a
child list. So every nested ordered list this repo's specs actually write
was counted as top-level steps. Set 131 S1 declared six steps and was
reported `OVER CAP` at eleven — and `--spec` printed the violation while
exiting 0, so nothing blocked and eleven rows were seeded into the activity
log. Depth is now resolved the way Markdown resolves it. Corpus-wide the
parse loses 25 phantom steps across five sessions; `--spec` now exits
non-zero, while `--all` stays a census (it would otherwise fire on every
run against 47 legacy sessions).

**D2 — ceremony was classified by mention, not by role.** Any step
containing "verification", "register" or "close" was charged as ceremony, so
a work step that merely *referenced* those things deflated N. Ceremony is
now a role the skeleton assigns by **position**, confirmed by naming.
`intents_named` was deliberately left alone and `classify_steps` added
beside it, because the mention test is the right one at a fixed skeleton
slot — narrowing it would have broken the shape check while fixing the
count.

Both shipped with falsifiers on each side, then **proven to fire by planting
the defect back**: nine plants, nine caught (L-112-1). One plant went
uncaught on the first attempt and the harness said so — a second guard was
still refusing the bad input, so the plant had not actually planted the
defect.

**The re-measurement, and a third defect the code cannot fix.** N was
deflated in 40% of sessions (mean 2.83 → 3.26). The direction held but
weakly. And the p90 tail that motivated the whole set turned out to be
**nights**: duration is `completedAt − startedAt`, elapsed calendar time,
and 15 of 225 sessions crossed a day — *all fifteen* in the 23 longest
sessions on record. Excluding them takes the p90 from 301 to 147; trimming
idle gaps takes it 311 → 140, with the median unmoved. Call it D3: not a bug
in code but in what the timestamps mean. The spec's own argument that
"constant `w̄` does not fit the data" did not survive either — it rested on
an impossible `F ≈ −16`, which was an artifact of fitting two band medians.

---

## Session 3 — Why the tail, what N should be, and where compaction fires

**A two-provider panel, after a transport defect nearly prevented one.** The
panel was pinned with `route(prefer_model=...)`; all four generations came
back served by the same model. `_route_via_copilot_cli` does not accept that
parameter at all — the profile resolves one generator *role* from the seat
catalog rather than walking a tier ladder — so a documented preference is
silently dropped on one transport and honoured on the other, invisibly:
the metrics row even records `served_model_mismatch: false`, because the
model that answered *was* the one the transport asked for. `exclude_providers`
is the lever that path does honour, and the google half was re-run through
it. The mislabeled artifacts were renamed, not edited. Shipped as a known
issue (R3), not fixed in a documentation session.

**What the panel killed:** self-reported effort estimates as the primary
outcome ("models are text predictors"), step count as an outcome (it is the
treatment), the single-spec design, and — in round B, from opposite starting
positions — the uncapped arm, which is **confounded** rather than merely
less relevant, because "use the minimal sufficient number of steps" changes
the instruction's semantics instead of raising the dose. Both also concluded
nobody can compute `n` until a pilot estimates the standard deviation.

**The observational fallback was run, not merely evaluated.** Fixed overhead
partitioned directly from ceremony-step timestamps: **`F` = 41 min** over 97
sessions, beside an independent-*formula* regression intercept of 39 over
199–225. The two are not two witnesses — they split and fit the *same*
`startedAt`/`completedAt` interval, as both path-aware critics pointed out —
but a fitted intercept landing where a measured partition lands is a real
check on the decomposition. A median work step is **6–9 min**. `corr(N, w̄)`
is −0.03 to −0.40 across every cut — **directly measured, `w̄` does not rise
with N**, which is the test the `F/N + w̄` ratio was algebraically unable to
perform.

A composition artifact was hypothesised, put to the panel, and confirmed:
the four-step skeleton was only mandated at Set 128, so high-N sessions are
overwhelmingly older specs whose ceremony time is charged to their work
steps. That biases `w̄` **upward** at high N, making the flat-to-falling
result a *conservative* bound. It also means the skeleton-era cut can
validate `F` but **cannot** estimate the N slope — every skeleton-era
session has N ≤ 3, because the cap already removed the variance.

**The tail, answered as far as the evidence allows.** Among sets 111+,
verification artifacts correlate with session duration at **+0.767**; N at
**+0.228**. The residual tail is not idle either — largest-gap *share* is
lower in the tail and correlates negatively. The strongest observed correlate
of a long session is how many verification rounds it ran, though the arrow's
direction is unresolved: running long gives more opportunity to open a round.
Both providers predicted this ranking before seeing the numbers.

**Compaction.** Set 131's threshold (~150K, first step boundary after the
crossing) is unchanged. What this session added is the half that forbids
firing at every boundary — a flush resets the transcript into the cheap
plateau, so the next flush pays 400 credits to save nothing — and the
coupling, in one place: **N determines how many boundaries exist; the
threshold determines which of them fire.**

**The operator's prevention question, answered by adding nothing.** The
consequence rubric (probability × impact) already existed and was already
preload; it needed an application point, not a mechanism. A first draft that
put it in `project-guidance.md` breached that file's preload ceiling by 126
tokens — and ceilings ratchet down only — which was the right signal: the
rule does not change, only where it is applied, so it belongs in the
authoring guide beside the sizing rules it modifies.

---

## What the operator decided, mid-set

Two rulings, both journalled:

- **"I can't afford to spend hundreds of dollars on this. I can live with
  results that are suggestive, as opposed to definitive."** The rigorous
  experiment became a documented upgrade path rather than the plan — which
  is where both advisors had independently landed for evidentiary reasons.
- **The `not computed` removal** (Session 1), on the reasoning that the row
  already carried the signal.

## What is still open

- **N: ruled, not yet in force.** The operator ruled on 2026-08-14 for a
  **ceiling of 4 with 3 as the stated target**, reversing the 2026-08-12
  ratification. The argument that moved it is the split-cost asymmetry this
  set measured: being one step too tight risks a whole extra session
  (~40–60 min), being one too generous costs ~7–9 min. Implementation —
  `WORK_STEP_BUDGET`, the admission test, and the authoring-guide echoes — is
  the first act of the follow-on set, which must re-run the three suites
  anyway. Evidence and reasoning: `s3-causality-and-compaction.md` §7.1.
- **R1** — `cite_lessons` stales the verification stamp, buying a routed
  round every session on a delta of bookkeeping files. Now with a price:
  §4 says rounds are what long sessions are made of.
- **R2** — `vsix-first-run-walkthrough.spec.ts` is a chronic flake inside a
  close gate.
- **R3** — `route(prefer_model=...)` silently ignored on `copilot-cli`.
- **R4** — the automated path-aware-critique producer (`pull_critique`) is
  wired to the `api` transport only. Not a capability gap: routed children on
  `copilot-cli` already carry read-only `view`/`grep`/`glob`, so path-aware
  review works — it is `pull_verifier`'s hand-rolled tool loop that needs
  provider keys. Same family as R3.
- **The parked cost-report proposal must be renumbered** off 132.
