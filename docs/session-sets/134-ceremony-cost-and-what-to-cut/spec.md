# Ceremony Cost, and What To Cut — Spec

> **The operator's standing concern, made measurable.** Every attempt to pare
> the framework down for the last several weeks has ended with it larger. An
> out-of-band analysis on 2026-08-15 measured why, and found the growth is
> **entirely in ceremony** and **not at all in work**. This set attributes that
> growth to specific steps and specific causes, tests whether the mechanism
> that drives the largest component still carries information, and then cuts
> what the evidence justifies — and only what the evidence justifies.

---

## Revision 1 — 2026-08-17, operator-directed, after Session 1

**Session 1 did its job and the news is bad for this spec.** The 2.3× it was
built on **does not reproduce** — re-derived over 255 sessions it ranges
**1.01×–2.96×**, and under this spec's own four named step keys it is flat. The
2026-08-07 cohort split turned out to be the exact day Set 111 installed the
instruments the "after" cohort is measured with. Detail:
[`s1-ceremony-attribution.md`](s1-ceremony-attribution.md).

The operator then raised a **different hypothesis** — that the binding cost is
not minutes but **context**: ceremony crowds the transcript. A first
measurement (§4) supports it, and it names things that can be **deleted**
rather than deferred.

**Operator ruling, 2026-08-17.** Session 2 runs **unchanged**. **Session 3 is
re-scoped from cutting minutes to cutting context.**

**Changed:** §1, §2, §2b, §4 (new), Session 3's three work steps, Non-goals.
**Unchanged:** the **Session Set Configuration block** (immutable at runtime
once `start_session` recorded the gate policy), Session 2 entirely, Session 3's
title and its 4 ceremony steps + N=3 budget, and §3 — which Session 2 exists
to test.

> Refuted numbers are **struck through, not deleted**: a spec that quietly
> edits its own premises leaves the next reader unable to tell a corrected
> claim from one that was never made (L-064-8).

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
re-derived every one of them**, over 255 sessions, and the results are folded in
below. This repo's specs have been wrong about their own numbers three times in
the last week (Set 118's coupling count, Set 120's file count, Set 132's step
parser), and every time it was the session that re-measured which caught it.
**This set is now the fourth.**

### 1. Session length grows linearly — CONFIRMED

Duration vs calendar day, sessions over 240 min excluded as away-dominated:

| fit | original | **re-derived (Session 1)** | verdict |
| :--- | ---: | ---: | :--- |
| trimmed OLS | +0.947 min/day, R² 0.307, n=219 | **+0.966 min/day, R² 0.321, n=226** | reproduces |
| trimmed Theil–Sen | +0.901 min/day | **+0.909 min/day** | reproduces |
| excluded as away-dominated | 26 of 245 | **29 of 255** | reproduces |

Over the 82-day corpus that is **+79 minutes**. This is the one headline that
survived untouched, and it is what justifies the set continuing to exist.

**But the trend does not survive into the window the framework can observe.**
Within the 57 sessions carrying a round ledger, the slope is **+0.122 min/day at
R² 0.000**. The +0.97 is a May→August baseline effect, not ongoing drift.

### 2. ~~The growth is ceremony~~ — REFUTED as stated

> ~~pre-cap 7.1 min/ceremony step → post-cap 16.3; work flat at 7.2 → 7.1.~~
> ~~**Work costs what it always did. Each ceremony step costs 2.3× what it did.**~~

The same attribution, re-run under six defensible method choices, spans
**1.01×–2.96×** — including **1.01× (flat) under this spec's own four named step
keys**, where it is *work* that rises. **A quantity that moves that far on
method choice cannot size a deletion.** Three named failures, evidenced in
[`s1-ceremony-attribution.md`](s1-ceremony-attribution.md) §2:

- **"By step key" cannot be produced at all** — 1,427 distinct `stepKey` values;
  the four canonical keys appear on a minority of sessions.
- **The instrumentation explanation was dismissed on the wrong control** — the
  artifact is timestamp dispersion, not step count: **44%** of pre-cap step
  intervals are under **one second** (burst-logged) against 34% post-cap.
- **The flat-work control does not hold** — work rose +29% to +79%.

**Dated cause.** The 2026-08-07 split **is Set 111's landing date**, which
shipped `sN-rounds.jsonl` (08-07 03:16) and `test-runs.jsonl` (08-07 15:40): the
"before" cohort was not measured worse, it was not measured at all. Also
corrected — the step skeleton originates in **Set 114**, not Set 128, and **Set
116 is a cost reduction** (~3.6×) this spec misread as a cause.

### 2b. What survives — the numbers Session 3 may cut against

| measurement | value |
| :--- | ---: |
| marginal cost of a verification round | **+17.9 min** of loop span (R² 0.625) |
| `remediation-review → remediation-review` | 62 transitions, **2,332 min (38.9 h)** |
| recorded suite runtime | **18.6 min/session** across 3 runs |
| verification loop span / Step 8 tail | **35.8** (~~41.7~~) / **12.6** (~~17.9~~) min |
| close execution | 0.2 min — confirmed, not a cost |

~~Of the 41.7-minute loop, ~4.5 min is model latency — about 11%.~~ **No latency
figure is operative**: the only instrument measuring it is gitignored and
unreproducible from a fresh checkout (a blocking Major in Session 1).
**The lever is rounds, not models** still holds on the committed round cost
alone — a round costs 17.9 min, which dominates any per-call speed-up.

Already disqualified by measurement — **do not re-propose**: staleness-forced
re-runs (**67 min corpus-wide**; Sets 116/119 closed it), registration + close
ceremony (**< 1.1 min/session**; `register` got 3× *cheaper*), and
`discovery → supplementary` (4.6 min, cheapest transition measured).

### 3. Severity has stopped discriminating — UNVERIFIED, Session 2's job

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
consulted**. Note also that the Set 119 doc-only cap is consistent with there
being only 21 Minors in the entire corpus: it has essentially never fired.

The 28 non-canonical values include prose written into the severity field
(`"Unspecified (treated as blocking per the anti-laundering rule)"`,
`"Major (reviewer) / adjudicated minor"`, `"Major (claimed)"`). That is the same
closed-vocabulary drift Set 120 S1 fixed for step status, in a second field,
and the fix is a known-good pattern already in this repo.

> **Session 1 raised the stakes on this section rather than settling it.** These
> figures are **exactly as unverified as §1 and §2 were**, and two of those three
> did not survive contact with the data. Session 2 step 2 re-derives the 92%
> **first**, and is expected to treat a refutation as a normal outcome.

### 4. Context, not minutes — the operator's hypothesis (2026-08-17)

A first measurement, taken when the hypothesis was raised:

| what | measured |
| :--- | ---: |
| **preload read before every session** | **~11,644 tokens** — and **all four files sit at exactly 100% of their ceiling** |
| Session 1's deliverable | 3,103 words |
| Session 1's ceremony *about* that deliverable | **~7,700 words** |
| **ratio** | **≈ 2.5 : 1 ceremony to answer** |

Composition of `lessons-learned.md`, read in full every session: **4 live
lessons and 5 sections of tables recording where lessons used to live** — half
its top-level sections are a changelog of its own curation.

Corroborating, from the repo's own docs: `docs/ai-led-session-workflow.md` →
*Rotation, and the trade we declined* already calls transcript rotation **"the
largest measured cost effect in this repo's history"** (conversation
`a9f211a7`: 1,148 inferences, $367.18, compaction at turn 75). The framework has
known context was the dominant cost since Set 131 and has never targeted it.

**Honest limit on this section.** *"Ceremony crowds the context"* is measured;
*"and therefore the model produces worse work"* is **not**, and Session 3 must
not assert it. What is available is the consequence: at 100% of ceiling on every
preload file, **any addition now requires a deletion**, so the corpus cannot
absorb another lesson, principle or convention without one leaving.

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

> **COMPLETE, 2026-08-17 — VERIFIED.** Ends-with satisfied, with the growth
> attributed to a dated cause the spec did not anticipate: the arrival of the
> instruments on 2026-08-07. The candidate list carries two live entries and
> three disqualified by their own measurement. See §2/§2b above and
> [`s1-ceremony-attribution.md`](s1-ceremony-attribution.md).

---

### Session 2 of 3: Does severity still carry information?

The verification loop is the largest ceremony component, and the gate that
decides whether it continues reads one field. This session tests that field.

> **Unchanged by Revision 1**, on the operator's ruling: severity is genuinely
> the gate feeding the expensive loop and closing its vocabulary is cheap.
> **Two carry-forwards from Session 1:**
> 1. Step 2's premise (§3, the 92%) is **exactly as unverified as the 2.3× was**,
>    and the 2.3× did not survive. Re-derive it first, state your classifier,
>    and treat a refutation as a normal, publishable outcome.
> 2. Step 4 gets easier and larger. Session 1 found the *same* open-vocabulary
>    defect in a **third** field: **1,427 distinct `stepKey` values**. Session 1's
>    instruments already parse every `sN-issues*.json` envelope this session
>    needs. If closing `stepKey` at the writer is the same shape of fix as
>    closing severity, say so and record it as a costed candidate for Session 3
>    — do **not** widen this session to take it.

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

> **Re-scoped by Revision 1, on the operator's ruling: this session cuts
> CONTEXT, not minutes.** The minutes hypothesis was tested in Session 1 and
> the number it rested on did not reproduce. The context hypothesis (§4) is
> measured, has independent corroboration in the repo's own rotation analysis,
> and — unlike minutes — names things that can be **deleted** rather than
> merely deferred to the operator. The title stands: it is still a cut, still
> on the evidence, and the evidence is what changed.

**Steps:**

1. Register.
2. **Measure the context footprint, then cut the preload.** Re-derive §4 with
   `guidance_report --check` and a word/token count over what a session
   actually reads and writes. Then take the cuts the measurement justifies,
   **largest first**. `lessons-learned.md` is the named starting point — 4 live
   lessons against 5 sections of archive bookkeeping — but the measurement
   picks the targets, not this sentence. **Archival is not deletion**: moving
   text to `lessons-archive.md` is the sanctioned route and keeps every word
   greppable. Preload ceilings **ratchet down only**; lowering one after a cut
   is the point, raising one is an operator decision.
3. **Cut the per-session ceremony this set can see itself producing.** Session
   1 emitted **~7,700 words of ceremony against a 3,103-word deliverable**, and
   named its own worst offender: **1,666 words of `activity-log.json` step
   descriptions that nothing asked for.** Work the artifacts a session writes
   every time — the log entry, `ai-assignment.md`, the conventions block, the
   disposition — and for each, either cut it, cap it, or record why it earns
   its bytes. **A cap is a documented convention, not a new validator**; if a
   candidate cannot be taken without adding a module, it is a residual.
4. **Report the net, and measure this set's own footprint.** Tokens removed
   from the preload; words removed from the per-session artifact set; lines
   removed minus added. Then run the same instrument over Sessions 1–3 of this
   set. **A reduction set whose own sessions got heavier has found something
   important about itself and must say so.** A net-positive line count, or a
   preload that did not shrink, is a **failed outcome** and must be stated as
   one in `change-log.md` — not explained away. *"Nothing could responsibly be
   cut"* remains legitimate; *"we cut nothing and added 400 lines"* does not.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `change-log.md`
**Touches:** `docs/planning/lessons-learned.md`, `docs/planning/lessons-archive.md`,
and whatever else Sessions 1–2 and step 2's measurement justify
**Ends with:** the preload is measurably smaller and its ceilings are ratcheted
down to match; the per-session artifact set is cut or capped or justified
line by line; unjustifiable candidates are residuals carrying their measured
cost; this set's own context footprint is measured and reported; and the net
effect on tokens and on lines is stated plainly, including when it is a failure.
**Progress keys:** `contextMeasured`, `preloadCut`, `perSessionCeremonyCut`, `netReported`

> **Step 9** (the reorganization review of `project-guidance.md` /
> `lessons-learned.md`) runs after the notification, as the terminal session.
> Revision 1 makes it unusually load-bearing: step 2 will have just edited one
> of the two files it reviews.

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
  from Session 1, Session 2, or Session 3 step 2. Anything that makes the loop
  stop earlier is an operator decision under the verification-reduction
  carve-out, and the orchestrator may never self-authorize it.
- **Re-opening the round bounds as a number.** The bounds are enforced and the
  operator set them. This set asks whether the *gate feeding* them
  discriminates, which is a different question from whether 2 is the right cap.
- **Re-opening `WORK_STEP_BUDGET`.** The 2026-08-14 ruling (ceiling N = 4,
  target 3) stands and its implementation is owed elsewhere.
- **The extension carve.** Still correctly scheduled last, and still not this.

Added by Revision 1:

- **Re-litigating what Session 1 settled.** The three disqualified candidates in
  §2b are dead on measured grounds; §1 reproduced and is not re-derived again.
- **Rescuing the 2.3×** — not by a better classifier, not by closing `stepKey`
  and re-measuring. If closing that vocabulary is worth doing, it is worth doing
  as a **context** cut costed on its own merits.
- **Deleting guidance content.** Archival to `lessons-archive.md` is what "cut
  the preload" means here: a cut moves text out of the always-read tier, it
  never destroys it.
- **Claiming context pressure degrades output quality.** §4 measures that
  ceremony crowds the context. It does **not** measure that the model therefore
  reasons worse, and no deliverable may assert it. The defensible consequence is
  narrower and sufficient: at 100% of ceiling, nothing is added without
  something leaving.
- **Building a context meter.** `guidance_report --check` already reports
  preload tokens against ceilings and word counts are a shell command. The
  no-new-module rule binds hardest in the session most tempted to break it.
