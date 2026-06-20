# Design consult: openai/gpt-5.4

Below is the recommendation I’d ship.

---

## Executive recommendation

Run the verification matrix **inside Step 6, on the first fresh diff before any remediation**, treat the result as **relative finding-power telemetry rather than absolute recall**, freeze that pre-remediation artifact as the measurement record, then let the consumer repo remediate normally from the generated backlog. Start with the **two source-bearing repos only**; exclude the docs-only repo from the finding-power pilot and, if desired, run it only as a labeled pull-only scrutiny sidecar.

The weakest assumption in this whole plan is that **“adjudicated union of findings on fresh work” is a good enough proxy for finding power**. It is useful, but it is not recall. Don’t oversell it.

---

# D1. TIMING

## Recommendation: **(a) Run as an extra review arm at Step 6, before remediation, on the freshly-built diff.**

### Why
This is the only point that cleanly measures “could this cell catch a real defect while it still exists?”

- **Before remediation**: defects are still present.
- **Inside Step 6**: operationally natural; Step 6 is already the cross-provider verification gate.
- **Same diff for all cells**: reduces contamination from code churn.
- **No separate workflow burden**: higher adoption, less drift.

### Be opinionated
Do **not** make this a separate later pass unless Step 6 operationally cannot tolerate runtime/cost. A separate pass invites:
- changed diffs,
- inconsistent invocation,
- skipped runs,
- weaker comparability.

### Concrete rule
At Step 6:

1. Build the implementation diff.
2. Run existing Step-6 verification gate.
3. Run matrix on that exact diff **before any fixes**.
4. Persist artifacts immediately as the **measurement snapshot**.
5. Only then begin remediation.

### Devil’s advocate
If Step 6 itself causes edits before the matrix runs, your “fresh diff” is already partially scrubbed. That weakens validity. So define **“matrix-first within Step 6’s verification phase”** or at least ensure it runs **before issue-driven edits**.

---

# D2. GROUND TRUTH

## Recommendation: **(a) Use relative cell-yield + false-positive rate + adjudicated union as proxy now; seeding is a fast-follow, not a gate.**

### Why
You explicitly said: ship useful defaults now, don’t block on perfect synthetic benchmarking. Requiring seeding now would stall the pilot and likely kill the measurement altogether.

You can measure now:
- **Per-cell true-positive count against adjudicated union**
- **Unique findings by cell**
- **Overlap / corroboration**
- **False-positive rate**
- **Noise per KLOC / per diff shape**
- **Push vs pull contribution**

That is enough for an initial provider/surface decision.

### But say it correctly
Do **not** claim “recall.” Claim:
- **relative finding yield on fresh defects**
- **coverage against adjudicated union**
- **precision / noise characteristics**

### Concrete adjudication standard
For each distinct finding in the consolidated remediation report, classify:
- **True defect**
- **Not a defect / false positive**
- **Duplicate / same underlying issue**
- **Unclear / deferred**

Then score each cell by:
- TP count
- FP count
- TP / (TP+FP)
- share of adjudicated-union TPs found
- unique TPs found only by that cell
- time/cost per TP

### Fast-follow
Add seeded-defect work later as a **calibration lane**, not as a precondition for Set 075.

### Devil’s advocate
The union-of-findings proxy is biased toward what the matrix can notice at all. Unknown unknowns remain invisible. That’s the biggest methodological weakness after selection bias. Acknowledge it in every readout.

---

# D3. SCRUTINY vs MEASUREMENT TENSION

## Recommendation: **Freeze measurement at first-run artifacts; then immediately allow normal remediation from those artifacts.**

This is the cleanest compromise.

### Concrete operating model
For each session:

1. Run matrix on fresh diff.
2. Save:
   - `verification-matrix-report.json`
   - `remediation-report.json/md`
   - commit SHA / base/head refs
   - timestamp
3. Mark those artifacts as the **authoritative measurement record**.
4. Consumer repo then remediates normally using the backlog.
5. Optional: after remediation, rerun matrix as a **scrutiny follow-up**, but keep it analytically separate.

### Why this works
You get:
- clean pre-remediation measurement,
- real consumer value,
- no pressure to defer fixes “for science.”

### Important analytic rule
**Never overwrite the first-run measurement with later reruns.** Later runs are for:
- residual-risk checking,
- “did remediation reduce findings?”
- operational workflow value,
not finding-power on fresh defects.

### Devil’s advocate
Adjudication can itself be contaminated if engineers only fix what high-status providers say. Mitigation: adjudicate from the **deduped consolidated report**, not provider-branded raw output where possible.

---

# D4. DOC-ONLY REPO

## Recommendation: **Exclude migration-orchestrator from the finding-power pilot; optionally run it as explicitly out-of-scope pull-only scrutiny telemetry.**

### Why
This repo does not test the stated question.

- No source diffs
- Push arm effectively null
- Pull arm reviews prose/planning, which is a different task
- Including it in the same aggregate will muddy interpretation badly

### Concrete handling
Two acceptable choices, in order:

#### Preferred
- **Defer entirely from Set 075 finding-power pool**
- Revisit later under a separate “docs/planning scrutiny” study

#### Acceptable sidecar
- Allow local teams to run pull-only scrutiny if they want extra review
- Label telemetry:
  - `target_type = docs_only`
  - `excluded_from_finding_power_aggregate = true`

### Devil’s advocate
If you include docs-only now because “more data is better,” you’ll poison the analysis with non-comparable diffs and make push-vs-pull conclusions less credible.

---

# D5. AGGREGATION HOME

## Recommendation: **Copy normalized artifacts back to a canonical-owned aggregation location. Do not leave aggregation dependent on pulling ad hoc from consumer repos.**

### Why
Canonical owns the instrument and the cross-repo analysis. Therefore canonical should own the pooled dataset.

Leaving artifacts in-repo and pulling on demand creates:
- version drift,
- missing files,
- access friction,
- inconsistent naming,
- silent loss.

### Concrete pattern
Use a **canonical-managed aggregation repo or directory tree** with one folder per run, e.g.:

- `set-075-telemetry/<consumer-repo>/<session-id>/<timestamp>/`
  - `verification-matrix-report.json`
  - `remediation-report.json`
  - `metadata.json`

### Minimal required metadata
Include:
- target repo name
- session/set ID
- base/head refs
- matrix package version
- orchestrator provider/model
- push provider/model
- pull provider/model
- diff stats
- whether run is **pre-remediation measurement** or **post-remediation follow-up**
- repo class: source-dominated / packaging / docs-only
- included_in_aggregate: true/false

### Transport
Best practical option: consumer workflow copies artifacts into a canonical-accessible location at session end. If that’s too heavy, check in a small manifest pointing to attached artifacts, but I prefer direct artifact copy.

### Devil’s advocate
A “shared network location” sounds easy but often becomes an unversioned junk drawer. If you do shared storage, it still needs canonical schema, naming, and ingestion rules.

---

# D6. SET 075 SHAPE

## Recommendation: Set 075 should deliver **instrument readiness + consumer instructions + cross-repo aggregation path + first real fresh-diff runs on the two eligible repos**.

## Suggested session shape

### Session 075.1 — Instrument and protocol hardening
Deliver:
- standard Step-6 addendum for consumers:
  - exactly when to run matrix,
  - exact command template,
  - artifact capture rules,
  - pre/post-remediation labeling,
  - adjudication rubric
- telemetry schema/version note
- aggregation folder/naming convention
- router version bump guidance (`ai_router >= 0.26.0`) for consumer repos
- explicit exclusion rule for docs-only repos from finding-power aggregate

Output:
- “Measurement pilot instruction addendum”
- “Aggregation contract”
- example commands for Windows

### Session 075.2 — Consumer repo enablement
Touch the two eligible repos:
- `dabbler-platform / access-migration-generator-consumption`
- `dabbler-access-harvester / 019-dotnet-tool-packaging`

Deliver:
- bump `dabbler-ai-router` / `ai_router` dependency to required version
- add workflow step text / script wrapper for Step 6 matrix invocation
- verify local Windows execution path
- ensure `--target .` telemetry target stamping is acceptable

Output:
- ready-to-run consumer setup on both repos

### Session 075.3 — First fresh-diff pilot runs
As the consumer sessions happen naturally:
- capture **pre-remediation** matrix runs on the fresh diffs
- copy artifacts to canonical aggregation home
- perform adjudication of consolidated findings
- compute first comparative table

Output:
- first cross-repo pilot dataset
- per-cell TP/FP/union coverage summary
- operational notes: runtime, cost, failure cases

### Session 075.4 — Readout and default recommendation
Deliver:
- opinionated interim default on provider/surface usage
- recommendation on whether Gemini-pull remains viable despite lower yield
- recommendation on whether packaging diffs need separate stratification from source-heavy diffs
- plan for fast-follow seeded calibration

Output:
- Set 075 findings memo
- next-step backlog

---

# Single biggest threat to validity

## Biggest threat: **selection bias from diff mix, especially tiny/snippet-fittable or non-source diffs, swamping the comparison you actually care about.**

This pilot could easily “prove” push is competitive simply because one repo’s diffs are small packaging changes that fit nicely into snippets, while the source-heavy repo would tell a different story.

### Why this is the biggest threat
It directly distorts the provider x surface conclusions:
- small diffs favor push/snippet review,
- source-heavy path-aware work favors pull,
- docs-only diffs make push meaningless.

If you pool all of that naively, the result is analytically weak.

## Mitigation
Be strict on cohorting from day one:

1. **Primary aggregate**: source-bearing fresh diffs only
2. **Stratify by diff class**:
   - source-dominated
   - packaging/config small diff
   - docs-only excluded
3. Report metrics **per stratum**, not just pooled
4. Weight conclusions toward the source-dominated repo for framework-default decisions
5. Tag diff size/shape in every run and use it in analysis

### Practical implication
For early pilot conclusions, I would treat:
- `dabbler-platform / access-migration-generator-consumption` as the **lead signal**
- `dabbler-access-harvester / 019-dotnet-tool-packaging` as **supporting but confounded**
- `migration-orchestrator` as **out of scope**

---

# Bottom-line decisions

- **D1:** Run at **Step 6 pre-remediation** on the fresh diff.
- **D2:** Use **relative yield / FP / adjudicated-union proxy now**; seed later.
- **D3:** **Freeze first-run artifacts as measurement**, then remediate normally.
- **D4:** **Exclude docs-only repo from finding-power aggregate**; optional labeled pull-only scrutiny sidecar.
- **D5:** **Copy artifacts to canonical-owned aggregation storage** with strict metadata/schema.
- **D6:** Set 075 should deliver **protocol, repo enablement, first fresh-diff runs on the two eligible repos, and a comparative readout**.

If you want, I can turn this into a one-page “Set 075 pilot protocol” with exact command lines and artifact schema.
