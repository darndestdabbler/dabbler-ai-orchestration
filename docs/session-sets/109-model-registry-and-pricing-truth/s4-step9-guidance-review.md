# Step 9 — guidance reorganization review (set-terminal)

> Run on the last session of every set, after the notify. "No changes
> recommended" is a valid outcome; skipping the review is not.

## Reviewed

`docs/planning/project-guidance.md` and `docs/planning/lessons-learned.md`
against what Set 109 actually taught.

**The ceiling constrains everything below.** `project-guidance.md` is at
**100%** of its 3,499-token ceiling and `lessons-learned.md` at **99%** of
2,385. Ceilings ratchet down only, so every recommendation here has to name
what it removes. That is why three of the four candidates below are recorded
rather than proposed.

---

## Recommendation 1 — WITHDRAWN by operator guidance: no guidance change

**What it would have been.** L-069-1's promoted rule says to *"grep the whole
codebase for the pattern"* — which points **outward**, at siblings in other
modules. This session missed a sibling **four lines away in the same
function**, while citing L-069-1 in the same hour: I fixed a fail-open exit
code for `not_comparable_entries` and left the identical fact reached through
the adjacent branch (`unmatched_config_entries`) untouched, and cross-provider
verification caught it as a Major. The proposal was a ~45-token clause naming
the local sibling, paid for by removing a clause the remediation-review phase
now covers as an executable gate.

**Withdrawn, on operator guidance (2026-08-04):**

> *"We are making things more and more complicated. My staff have expressed
> concerns that the orchestrator is too complicated and they might just set it
> aside and do their own thing. So, whatever we decide here, let's err on the
> side of simplicity. Let's not add any more than is necessary for this to be
> functional."*

The rule already exists, in the right file, and says the right thing. The gap
was **my application of it**, not its wording — and a guidance file at 100% of
its ceiling is exactly where a well-meant clarifying clause becomes the
accretion the operator is describing. Editing prose to prevent a mistake the
prose already covers buys nothing and costs a reader's attention on every
future session.

Recorded here so the miss is on the record without the corpus growing.

## Recommendation 2 — RECORD ONLY: a deferral's stated reason can expire

**Not proposed for admission.** One instance, and the admission test requires
recent *recurrence*.

Session 1 shipped `model_inventory --check` deliberately unwired, for a stated
reason: the repository's own registry failed it, so arming it would have turned
the suite red on the day it landed. **This session corrected the registry — and
then restated the deferral in three files instead of re-examining it.** Worse,
the reason I restated was not S1's; I wrote that arming it would make CI "go red
on a provider's schedule", which is false — `--check` reads only local files and
never probes.

So the deferral survived on a rationale that was both invented and obsolete,
until cross-provider verification named it. The general shape — *an inherited
deferral carries a precondition; when your own session discharges it, the
deferral needs re-deciding, not re-stating* — is close to L-064-8 (*a
replacement doc inherits the retired doc's claims at its peril*) but concerns
**decisions** rather than **prose**.

Watch for a second instance. If one appears, this is a strong candidate for
either a new lesson or a one-clause widening of L-064-8.

## Recommendation 3 — RECORD ONLY: the verification loop caught a spec violation the orchestrator argued itself into

**No guidance change. Recorded because it is evidence the existing process
works, and that is worth knowing as precisely as a failure.**

The spec's risk register says: *"Moving the fan-out to a cheaper variant may
change finding quality; that is an empirical question, and the pin should move
only with evidence, not with the price list."* I moved the pin on the price
list, with three plausible arguments — the 25× rate gap, the Set 096 Jaccard
overlap, downstream adjudication — none of which is evidence about *this*
model's recall. Every one of them argues that discovery is the right *place*
for a cheap model; none argues that this cheap model works.

The mandatory cross-provider round caught it and quoted the spec back. The pin
was withdrawn.

Nothing to add to guidance: the rule was already written, in the right place,
and enforced by a gate that already exists. It is worth recording that a
cost-truth set talked itself into an unmeasured cost saving, because the next
orchestrator to feel that pull will feel it the same way.

## Recommendation 4 — FOR THE OPERATOR: a spec line that could not be followed as written

**Carried forward from Session 3, which flagged it for this review.**

The spec's Session 3 step 2 says the per-model `confirmed_on` stamp replaces
`metadata.pricing_reviewed`. S3 kept `pricing_reviewed`, because the VS Code
extension's Cost Dashboard renders its staleness banner from that exact field —
and *"No Explorer or extension work"* is an explicit **non-goal** of the same
spec. The two lines are in direct conflict; either instruction can be obeyed,
not both.

S3's resolution was right: `pricing_reviewed` survives as a maintained rollup
(the oldest per-model stamp, written by `--apply`), so it cannot drift from the
stamps it summarises. **No action is owed in this set.** It is recorded because
the authoring guide has no check for a spec whose steps contradict its
non-goals, and this is the cheapest possible example of one.

---

## The set's configuration flags were correct

Reviewed per the constitution's instruction not to re-litigate flags mid-session
but to surface a wrong one here.

- `requiresUAT: true` — **correct, and load-bearing.** The safety property is a
  human reading a price diff. Walking it found two defects in the confirmation
  screen that no test would have flagged, because both were about whether a
  sentence could be understood.
- `requiresE2E: false` — **correct.** Router-side Python only; no
  Explorer-rendering surface, state writer, or fixture harness, so L-064-12
  never armed.
- `pathAwareCritique: advisory` — **correct, and the rationale held.** The spec
  justified `advisory` over `required` on the grounds that the executable gates
  here are unusually strong. They were: the drift gate, the enumeration
  lockfile, and S2's HTTP-call instrumentation each settled questions no
  reviewer needed to opine on.
- `contractGate` — not declared, correctly. No cross-repo contract surface.

## Outcome

**No changes recommended** — the constitution's explicitly valid outcome.
The one candidate was withdrawn under the operator's simplicity guidance; the
other three were recorded rather than proposed. **Neither guidance file was
edited, and neither grew.**
