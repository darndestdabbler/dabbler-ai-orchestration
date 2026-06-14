# Set 065 S1 — Cross-provider verification (gpt-5.4)

> Independent verifier: gpt-5.4 (openai), cross-provider for the Claude
> orchestrator. Round 1.

I checked the more useful meta-question first: not “is the retrospective causally clean?”—it explicitly says it is not—but whether its specific de-confounding claims, count logic, and recommendation strength are internally supported by the supplied `bake-off-data.json` and whether the forward A/B would actually answer the open questions. On that basis, most of the analysis is internally coherent, but there are a few real overstatements / design gaps.

## 1) De-confounding logic

### 1.1 012 C3 as same-provider context-access isolation
This is **supported** by the data as presented.

- `bake-off-results.md`, “De-confounding: both effects are real” claims:
  > “GPT-5.4 was both the routed validator and a path-aware provider… As a snippet-fed validator it missed C3 across four rounds; as a repo-aware agent it caught it. Same model, one variable (context mode).”
- `bake-off-data.json` for Set 012 says:
  - routed validator: `gpt-5-4`, `max_rounds: 4`
  - path-aware providers: `["gpt-5-4","gemini-pro"]`
  - critique-only real C3 note: routed GPT verified across R1–R4; path-aware GPT caught it
  - explicit `same_provider_isolation`: “Single isolation variable = context mode. CLEAN context-access evidence.”

Given the conventions, I should not contest source-truth, only whether the inference follows from the supplied record. It does. This is the cleanest within-corpus same-provider contrast.

One nuance: “single isolation variable = context mode” is a bit stronger than the actual design, because path-aware also includes probe affordances and possibly different prompting surface. But the document consistently defines the contrast as “snippet/diff-fed” vs “repo+probes,” i.e., the broader treatment is context-access/path-awareness, not just raw repo visibility. So this is not a defect if read in that operational sense.

### 1.2 010 as provider-multiplicity isolation
This is **mostly supported**, but phrasing it as “cleanly isolates provider-multiplicity” is somewhat stronger than warranted.

- `bake-off-results.md` claims:
  > “010 cleanly isolates provider-multiplicity (context-access via GPT did not help — only the second provider, Gemini, caught it).”
- `bake-off-data.json`, Set 010:
  - both critique-only Majors were `found_by: ["gemini-pro"]`
  - both notes: `GPT-path-aware MISSED (VERIFIED)`
  - routed validator was also GPT

This does support the narrower claim that **for those two defects**, adding path-aware context to GPT was insufficient, while switching provider within the same path-aware context found them. That is evidence that provider identity matters and that context alone is not sufficient.

But “provider-multiplicity” is slightly overstated because the evidence is really **provider substitution/diversity within path-aware**, not yet the effect of “having two reviewers” per se. The pairwise-union logic later (“A1∪A2 − A1”) is what measures multiplicity. The retrospective’s 010 case shows **a provider-specific blind spot**, which supports the value of diversity, but not by itself the full causal effect size of multiplicity. This is a **minor overclaim**, not a logical collapse.

### 1.3 “Both effects real, entangled, unseparable at n=5”
This is **supported** and appropriately caveated.

The corpus contains:
- one same-provider context case (012 C3),
- one same-context different-provider case (010’s two defects),
- plus aggregate within-path-aware provider split:
  - both: 5
  - GPT only: 4
  - Gemini only: 3

Those are enough for the existence-proof claim “neither effect is zero,” and the writeup avoids pretending to estimate magnitudes. That part is logically sound.

## 2) ~92% probeable (11/12)

This is **defensible from the JSON**.

The critique-only defects are 12 total:
- 008: 2 probeable
- 009: 2 probeable
- 010: 2 probeable
- 011: 5 total, of which 4 probeable and `C7b` non-probeable
- 012: 1 probeable

Total = 12, probeable = 11. So the arithmetic is correct.

I do not see a mislabeled case from the supplied descriptions. The alleged probes are all of the contract/invariant/assertion type:
- count/assertion for C9,
- dup-key uniqueness for C3,
- parser/querytype test for 010 MakeTable,
- parameterized numeric cases for regex,
- key-set/count probes for 011 C1/R2-1/R2-2,
- BOM / byte / round-trip probes for 009,
etc.

The stronger conclusion:
> “Strong support for the pre-registered-falsifier / contract-test direction”
does follow as a **hypothesis / design lever**. The stronger phrase
> “the expensive agent is strictly needed for only ~8%”
is a bit too absolute. The retrospective only shows that 11/12 caught defects appear mechanizable **after the fact**; it does not prove those falsifiers would have been obvious or economically pre-authorable beforehand, nor that they would generalize without substantial agent/human discovery effort. The writeup partly repairs this by adding:
> “crucially, for discovering which falsifiers to write”
which is the right nuance.

So the **figure is fine**, but one sentence overstates what it means operationally.

## 3) Bucket counts and aggregate consistency

These are **internally consistent**.

From per-set JSON:
- critique-only real: 2 + 2 + 2 + 5 + 1 = 12
- routed-only real: 0 + 3 + 4 + 0 + 3 = 10
- both: 0 + 1 + 0 + 0 + 3 = 4

This matches `bake-off-results.md`:
- critique-only 12
- routed-only 10
- both ~4

And `missed-by-both`:
- JSON has `missed_by_both_disproven` in 011 only; no real missed-by-both defects
- Markdown says “missed-by-both 0 real”

Provider split also checks:
- both providers: 008 H3/H4 = 2; 009 DA-1 = 1; 011 C9 = 1; 012 C3 = 1 → 5
- GPT only: 009 DA-2 = 1; 011 C1/R2-1/R2-2 = 3 → 4
- Gemini only: 010 two defects = 2; 011 C7b = 1 → 3

So no count inconsistency found.

## 4) Recommendation strength / overclaim

### 4.1 “Promoting path-aware critique is strongly supported”
This is **mostly warranted**, with one caveat.

Evidence cited:
- 12 critique-only real defects vs 0 clean routed-beats-path-aware cases
- includes two high-severity headline cases C9/C3
- C3 survives same-provider routed miss over four rounds

As an existence-proof that path-aware can catch serious things routed missed, yes, “strongly supported” is fair.

What is **not** established is that path-aware is globally superior independent of cadence/scope/order. But the writeup generally avoids that stronger claim and frames it as “promote,” not “replace routed.” So I would not call this a defect.

### 4.2 “Keep it multi-provider”
This is **supported** by the provider split and especially Set 010. A single-provider path-aware run would indeed have missed some observed catches.

### 4.3 “Routed unanswered”
This is **supported**. The document correctly notes every routed-only real catch is either:
- order-confounded because path-aware saw post-remediation code (009, 010), or
- out-of-scope because path-aware reviewed different session/code slice (012 S1/S2)

That is consistent with the JSON.

### 4.4 One notable overstatement
The sentence in `bake-off-results.md`:
> “there is no clean case of routed catching a real defect path-aware missed on the same code.”

This is okay.

But:
> “Routed's surviving defense is cadence, not unique capability.”

That goes a step too far. The retrospective shows **no clean evidence** of unique capability, not that cadence is the only surviving defense. Another possible defense is lower cost / operational simplicity / different prompt surface, though those are not evaluated here. Since the recommendations are about verification value, this is not a fatal flaw, but it is a real argumentative overreach.

## 5) Forward A/B design soundness

The design is good in structure, but **one major methodological gap** remains.

### 5.1 What it gets right
The A/B correctly addresses the retrospective confounds better than the retrospective:

- **Blind + same frozen tree** controls order/remediation-state/sequencing.
- **2×2 factorial**:
  - A1 routed/GPT
  - A2 routed/Gemini
  - B1 path-aware/GPT
  - B2 path-aware/Gemini
  lets you estimate same-provider context contrasts and same-context provider contrasts.
- **Pair cells** allow multiplicity comparisons.
- **Seeded defects** do solve much of the oracle problem for true positives.
- **K repeats** is appropriate given stochasticity.

So the core experiment is sound.

### 5.2 Major gap: cadence is not actually tested, despite being named as routed’s remaining defense
The retrospective says the unresolved routed question is about **cadence**:
- `bake-off-results.md`:
  > “Routed's surviving defense is cadence… catches defects while the work is being built… Whether that early-catch is worth its metered cost… is precisely what the blind, same-frozen-tree forward A/B exists to measure.”
- But `forward-ab-design.md` explicitly says:
  > “Cadence and round-count are matched by running every arm single-round on the same unit (or all arms at the same fixed N).”

That means the forward A/B **does not measure cadence advantage**; it intentionally removes it. It measures surface capability on the same frozen code, not value of earlier intervention during iterative construction. Therefore it cannot, by itself, settle the practical question “is per-session routed verification worth keeping?” if that worth derives from catching defects sooner and preventing downstream compounding.

This is the clearest real defect in the analysis set: the retrospective correctly identifies cadence as routed’s plausible contribution, but the proposed A/B then designs cadence away while claiming it will answer routed’s marginal value question.

A fix would be a second experiment or extension:
- simulate multi-session development with interventions after each session,
- compare cumulative defect burden / rework / latency / cost under per-session routed vs end-of-set path-aware vs both,
- or run a staged frozen-snapshot experiment across S1/S2/S3 checkpoints, not just one frozen tree.

### 5.3 Secondary design gap: seeded-defect representativeness for “novel reasoning”
The design includes “≥2 genuinely novel-reasoning defects,” but that is thin. Since one retrospective thesis is that only a small residual is genuinely novel, under-sampling that class could make the falsifier suite look stronger than it is. This does not invalidate the experiment, but it weakens the ability to estimate the residual class with confidence. Minor issue, not fatal.

### 5.4 Oracle on false positives
The design mentions false-positive rate, but for natural defects says:
> “take the adjudicated union of all arms' catches + downstream-discovered defects.”

That can work, but only with strong independent adjudication. Since false-positive cost was salient in 009, the design should explicitly require blinded human adjudication or predetermined acceptance criteria per seeded defect/catch claim. Again, a refinement rather than a fatal flaw.

## Bottom line

Overall, the retrospective is internally consistent and its key existence-proof claims are supported by the supplied JSON. The biggest real problem is not in the retrospective counts, but in the forward-A/B claim that it will settle routed’s marginal value while it actually holds cadence constant and therefore cannot test routed’s main surviving practical advantage.

{"verdict":"ISSUES_FOUND","issues":[{"severity":"Major","claim":"forward-ab-design.md claims the blind same-frozen-tree A/B will answer 'Routed's marginal value' / whether 'per-session routed verification is worth keeping'","problem":"The retrospective explicitly identifies cadence as routed's remaining plausible value ('catches defects while the work is being built'), but the A/B then matches cadence and reviews one frozen pre-remediation tree. That measures surface capability on identical code, not the value of earlier intervention during iterative development. So the proposed experiment cannot by itself settle the practical keep-or-drop routed question as framed.","fix":"Add a second experimental component that varies cadence: e.g., staged S1/S2/S3 snapshot reviews with intervention after each stage, comparing cumulative defects, rework, latency, and cost for per-session routed vs end-of-set path-aware vs both. Reframe the current A/B as testing capability, not cadence value."},{"severity":"Minor","claim":"bake-off-results.md: '010 cleanly isolates provider-multiplicity'","problem":"Set 010 shows that provider identity/diversity matters within the same path-aware context: Gemini found two defects that path-aware GPT missed. But this is stronger evidence for provider-specific blind spots than for the full causal effect of 'multiplicity' per se; multiplicity is measured by pair-vs-single comparisons, not a single-provider substitution case.","fix":"Rephrase to '010 cleanly shows a provider-diversity effect within path-aware context' or 'provider identity matters; a second provider can add catches context alone does not recover.' Reserve 'multiplicity effect size' for the forward pair-vs-single A/B comparisons."},{"severity":"Minor","claim":"bake-off-results.md: 'the expensive agent is strictly needed for only ~8%'","problem":"The 11/12 probeable figure is retrospective and post hoc. It supports that most observed catches can be mechanized as falsifiers, but not the stronger operational claim that agents are 'strictly needed' only for the residual; agent/human discovery may still be required to identify and author those falsifiers prospectively.","fix":"Soften to 'Only ~8% of observed unique catches appear non-probeable in retrospect; the forward study should test how much of the rest can be pre-authored deterministically in practice.'"},{"severity":"Minor","claim":"bake-off-results.md: 'Routed's surviving defense is cadence, not unique capability'","problem":"The data support 'no clean evidence here of unique capability over path-aware on the same code,' but not the stronger exclusion that cadence is routed's only surviving defense. Cost, simplicity, and deployment ergonomics are outside the retrospective's measurements.","fix":"Rephrase to 'Within this corpus, the only evidenced defense is cadence; no clean same-code unique-capability case appears.'"}]}
