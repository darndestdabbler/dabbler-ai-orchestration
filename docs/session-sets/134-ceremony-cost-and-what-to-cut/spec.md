# Ceremony Cost, and What To Cut — Spec

> **The operator's standing concern, made measurable.** Every attempt to pare
> the framework down for the last several weeks has ended with it larger. An
> out-of-band analysis on 2026-08-15 measured why, and found the growth is
> **entirely in ceremony** and **not at all in work**. This set attributes that
> growth to specific steps and specific causes, tests whether the mechanism
> that drives the largest component still carries information, and then cuts
> what the evidence justifies — and only what the evidence justifies.

## Session Set Configuration

```yaml
requiresUAT: false        # No rendering surface. The deliverables are two measurements over committed artifacts and a reduction — judged by a diff, by re-running the measurement, and by a net line count.
requiresE2E: false        # No extension source is touched in Sessions 1-2. If Session 3's cut reaches Layer 3 scenarios, the run-of-record obligation covers it; no new E2E surface is created.
uatStyle: ad-hoc
prerequisites:
  - slug: 133-release-and-listing-truth
    condition: complete
```

> **`pathAwareCritique` is deliberately absent.** The guide's default is `none`
> and a set that declares nothing pays nothing. It cost Set 116 S3 roughly half
> of that session's $4.75 and returned a false positive. This set is about
> reducing ceremony; buying an optional stage would be self-refuting.

---

## The measurements this set acts on

Taken out-of-band 2026-08-15, over 245 schema-v4 sessions. **Session 1 step 2
re-derives every one of them before anything is acted on.** This repo's specs
have been wrong about their own numbers three times in the last week (Set 118's
coupling count, Set 120's file count, Set 132's step parser), and every time it
was the session that re-measured which caught it.

### 1. Session length grows linearly, and the growth is ceremony

Duration vs calendar day, sessions over 240 min excluded as away-dominated
(26 of 245):

| fit | n | slope | R² |
| :--- | ---: | ---: | ---: |
| trimmed OLS | 219 | **+0.947 min/day** | 0.307 |
| trimmed Theil–Sen | 219 | **+0.901 min/day** | — |

Over the 81-day corpus that is **+77 minutes**. Splitting at 2026-08-07 and
attributing per-step intervals from `activity-log.json` (interval before a
completion belongs to the step that completed; each capped at 45 min to bound
away-time), over **208 sessions**:

| cohort | n | ceremony steps | work steps | **min/ceremony step** | **min/work step** |
| :--- | ---: | ---: | ---: | ---: | ---: |
| pre-cap | 151 | 3.0 | 4.0 | **7.1** | **7.2** |
| post-cap | 58 | 3.0 | 3.0 | **16.3** | **7.1** |

**Work costs what it always did. Each ceremony step costs 2.3× what it did.**
The obvious instrumentation explanation — that Set 128's skeleton merely made
ceremony steps loggable — predicts a rise in the ceremony step *count*, and the
count is identical at 3.0. The flat work column is the control: it is both a
check that the instrument is not inflating every interval, and an independent
reproduction of Set 132's `w̄ ≈ 6–9 min` from a different measurement path.

### 2. Where the ceremony minutes sit

| phase | median | note |
| :--- | ---: | :--- |
| verification loop (first round → last) | **41.7 min** | median 3 rounds, ~21 min per remediate-and-re-verify cycle |
| Step 8 tail (last round → close requested) | 17.9 min | ~15 min of it is real suite runtime |
| close execution | **0.2 min** | not a cost; do not spend here |

Of the 41.7-minute verification loop, **~4.5 minutes is model latency** — about
11%. Verifier pins, fan-out width and cheaper discovery variants all act on that
11%. **The lever is rounds, not models.**

### 3. Severity has stopped discriminating

Across **680 findings** in 378 `sN-issues*.json` envelopes:

| severity | count |
| :--- | ---: |
| **Major** | **628 (92%)** |
| Minor | 21 |
| Critical | 3 |
| `?` / `Unknown` / prose-in-the-field | 28 |

By round: 280 Majors in round 1, then 98 / 66 / 48, and **136 in rounds 5+**.

The Step 7 gate is *"only a Critical/Major finding continues the loop."* If 92%
of findings are Major, **that gate approves continuation almost every time it is
consulted** — which is a mechanism for exactly the round-grinding the bounds
were later invented to cap. Note also that the Set 119 doc-only cap, which
caps a class of finding at Minor, is consistent with there being only 21 Minors
in the entire corpus: it has essentially never fired.

The 28 non-canonical values include prose written into the severity field
(`"Unspecified (treated as blocking per the anti-laundering rule)"`,
`"Major (reviewer) / adjudicated minor"`, `"Major (claimed)"`). That is the same
closed-vocabulary drift Set 120 S1 fixed for step status, in a second field,
and the fix is a known-good pattern already in this repo.

---

## Sessions

### Session 1 of 3: Attribute the 2.3×

Which ceremony step grew, when, and because of what. Analysis over committed
artifacts only — **no new instrumentation, no new module.**

**Steps:**

1. Register.
2. **Re-derive the numbers above, then attribute the growth per ceremony
   step.** Rebuild the per-step interval analysis from `activity-log.json`
   across every schema-v4 session (method stated in *The measurements this set
   acts on*; state your outlier rule and idle cap explicitly, and report
   medians). Then break the ceremony total down **by step key** — register,
   cross-provider-verification, required-portion-of-the-full-test, close-out —
   so the 7.1 → 16.3 rise is attributed rather than aggregate. Any number that
   fails to reproduce is reported as a correction, and the corrected value is
   what the rest of the set uses.
3. **Date each rise against what landed.** For whichever ceremony step(s) carry
   the growth, identify the changes that plausibly caused it, by date, from the
   session sets and changelog fragments in that window (Sets 111, 116, 119,
   127, 128 are the candidates the timeline suggests — confirm or refute).
   Distinguish a step that got **slower** from a step that acquired **more
   obligations**; they have different remedies and conflating them is how a
   reduction pass cuts the wrong thing.
4. **Name the reduction candidates, with a cost and a consequence each.** For
   each candidate: minutes it would return (from the measurement, not
   estimated), what verification or record is lost, and whether the operator or
   the orchestrator owns the decision. Candidates that only *move* cost do not
   qualify. **A candidate with no measured minutes attached does not go on the
   list.**
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `s1-ceremony-attribution.md`
**Touches:** —
**Ends with:** the 2.3× is attributed to named ceremony steps with dated
causes; a candidate list exists in which every entry carries measured minutes,
a named consequence, and an owner.
**Progress keys:** `numbersRederived`, `growthAttributedByStep`, `causesDated`, `candidatesCosted`

---

### Session 2 of 3: Does severity still carry information?

The verification loop is the largest ceremony component, and the gate that
decides whether it continues reads one field. This session tests that field.

**Steps:**

1. Register.
2. **Measure the severity distribution and what it predicts.** Over every
   `sN-issues*.json` envelope: severity by round, by phase, and by whether the
   finding was ultimately settled, waived, or fixed (the round ledgers,
   remediation sidecars and acceptance-harness results are all on disk).
   The question is not "are there Majors in later rounds" — there are — but
   **whether severity distinguishes findings that changed the outcome from
   findings that did not.** Report the 92% figure's accuracy first; it is the
   premise everything else here rests on.
3. **Decide what the defect is, and journal it.** Exactly one of: (a) the
   severity *rubric* under-discriminates and should be sharpened, (b) the
   *gate* reads the wrong signal and should read something else, or (c)
   neither — 92% Major is accurate, the findings are genuinely material, and
   the loop's cost is the honest price of the guarantee. **(c) is a real
   outcome and must be reportable without embarrassment**; a session that
   concludes the machinery is correct has done its job. Journal the call via
   `python -m ai_router.decision_journal`. Note the authority boundary: any
   change that would make the loop *stop earlier* reduces verification and is
   therefore the **operator's** decision, not the orchestrator's — surface it
   as an education-mode brief with the measurement attached.
4. **Give severity the Set 120 treatment.** 28 of 680 findings carry
   non-canonical severity, including prose written into the field. Apply the
   closed-vocabulary pattern Set 120 S1 established for step status: a writer
   that refuses an unknown token, readers left lenient about the history
   already on disk. This is a small, known-good, already-proven fix; do not
   redesign it.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `s2-severity-discrimination.md`; a `decisions.jsonl` entry for the (a)/(b)/(c) call
**Touches:** the severity writer and its tests; `docs/session-issues-schema.md`
**Ends with:** the 92% figure is confirmed or corrected; severity is shown
either to discriminate or not to; the defect is named and journaled with the
right authority; and the severity field has a closed vocabulary enforced at the
writer.
**Progress keys:** `severityMeasured`, `discriminationAnswered`, `defectNamedAndJournaled`, `vocabularyClosed`

---

### Session 3 of 3: Cut, on the evidence

**Steps:**

1. Register.
2. **Take the cuts Sessions 1 and 2 justify — and only those.** Work the
   candidate list in descending measured minutes. Every cut is a deletion, a
   parameter change, or a document edit. **If a candidate cannot be taken
   without adding a module, it is not taken in this set** — record it as a
   residual with its measured minutes so a later set inherits the number rather
   than re-deriving it.
3. **Re-run the measurement on this set's own sessions.** Sessions 1 and 2 are
   themselves sessions; run the Session 1 instrument over them and report their
   ceremony-per-step alongside the corpus median. A reduction set that made its
   own sessions heavier has found something important about itself and must say
   so.
4. **Report the net.** Lines removed minus lines added; ceremony minutes
   returned; obligations retired. **A net-positive line count is a failed
   outcome for this set and must be stated as one in `change-log.md`** — not
   explained away. "Nothing could responsibly be cut" is a legitimate result;
   "we cut nothing and added 400 lines" is not.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `change-log.md`
**Touches:** whatever Sessions 1–2 justify
**Ends with:** the justified cuts are taken; unjustifiable candidates are
recorded as residuals carrying their measured minutes; this set's own ceremony
cost is measured and reported; and the net effect on lines and on ceremony
minutes is stated plainly.
**Progress keys:** `justifiedCutsTaken`, `residualsRecorded`, `ownCostMeasured`, `netReported`

> **Step 9** (the reorganization review of `project-guidance.md` /
> `lessons-learned.md`) runs after the notification, as the terminal session.

---

## The rule this set operates under

**No new module.** Every deliverable is a measurement document, a deletion, a
parameter change, or an edit to an existing file. The framework's characteristic
failure — established by its own history — is answering a problem with a new
governor over the old mechanism: `close_preflight` is 1,047 lines predicting
what ~2,500 lines of gates will say; the retention mechanism guards guidance
from re-bloating; the acceptance harness shortens the loop. Each is locally
correct and globally additive. A set about ceremony cost that ships another
governor has demonstrated the thesis rather than addressed it.

The 2026-08-15 analysis was done with three read-only scripts over committed
artifacts and no changes to the framework at all. That is the existence proof
that Sessions 1 and 2 need to build nothing.

## Non-goals

- **Reducing verification on intuition.** Every cut traces to a measured number
  from Session 1 or 2. Anything that makes the loop stop earlier is an
  operator decision under the verification-reduction carve-out, and the
  orchestrator may never self-authorize it.
- **Re-opening the round bounds as a number.** The bounds are enforced and the
  operator set them. This set asks whether the *gate feeding* them
  discriminates, which is a different question from whether 2 is the right cap.
- **Re-opening `WORK_STEP_BUDGET`.** The 2026-08-14 ruling (ceiling N = 4,
  target 3) stands and its implementation is owed elsewhere. The measurement is
  clear that N is worth ~7–9 min against a ceremony block several times larger;
  it is not this set's lever.
- **The extension carve.** Still correctly scheduled last, and still not this.
