# Set 065 S1 — Cross-provider verification Round 2 (gpt-5.4)

All four Round-1 findings appear resolved.

1. **Resolved.** `forward-ab-design.md` now explicitly separates **Experiment A = capability** from **Experiment B = cadence**, and says routed’s keep/drop decision needs both. That fixes the prior misuse of the blind same-frozen-tree A/B as a test of routed’s cadence value.

2. **Resolved.** The 010 claim is now correctly narrowed to **provider-diversity / provider-identity blind spot**, with explicit caveat that it does **not** by itself identify the full **two-reviewer multiplicity** effect; that is deferred to the forward pair-vs-single comparison.

3. **Resolved.** The ~8% statement is now framed as **observed post-hoc non-probeable residual**, with explicit caveat that pre-authorability is unproven and belongs to the forward falsifier study.

4. **Resolved.** The routed-defense language is now properly bounded: **“the only evidenced defense in this corpus is cadence”** and **capability is unsupported here**, rather than claiming cadence is the only possible defense.

**New issues introduced:** None material. The revised docs are internally consistent on capability vs cadence, provider-diversity vs multiplicity, and post-hoc probeability vs forward pre-authorship.

{"verdict":"VERIFIED","resolved":["1","2","3","4"],"remaining":[]}
