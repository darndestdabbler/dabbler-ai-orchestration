# Session 1 close reason — 082-omit-verification-mode-from-full-tier-scaffolds

Session 1 ("Conditional template line + tier-gated marker") completed all five
spec steps and closes with a round-2 `VERIFIED` verdict.

## What landed

- `docs/templates/consumer-bootstrap/spec.md.template`: the fixed
  `verificationMode:` line replaced by the whole-line
  `{{VERIFICATION_MODE_LINE}}` token; `consumerBootstrap.ts` fills it with the
  full pre-082 line (comment included) on `lightweight` and the empty string on
  `full` — no blank-line residue. Template README token table and never-emit
  rule updated.
- `gitScaffold.ts`: the `.dabbler/verification-mode` marker write is gated to
  `tier === "lightweight"`; on Full it is neither written nor deleted (a prior
  Lightweight pick survives a tier round-trip — documented in the code
  comment). `.dabbler/tier` stays unconditional.
- Sibling audit (L-069-1): `buildSessionGenPrompt`'s hard-requirements prose
  rescoped (Full sets OMIT `verificationMode`); the Full exemplar now omits the
  line via the shared `renderSpec`; pinned with two Layer-2 tests.
  `verificationModeRewrite` already handles key-absent specs — no change.
  Named residual: `start-here.md.template` step 4's unconditional "Read `tier`
  + `verificationMode`" prose stays — editing the shared template would break
  the Lightweight byte-identity tripwire, and absence-means-default makes it
  benign.
- Fixtures: `test-fixtures/cold-start/full` regenerated (the sample spec's
  config block no longer carries `verificationMode:`); the lightweight tree is
  byte-identical (scope tripwire held). Layer-2 suites extended:
  `consumerBootstrap.test.ts` (per-tier line presence/absence, no residue),
  `gitScaffoldCore.test.ts` (marker write matrix incl. full-preserves),
  `sessionGenPrompt.test.ts` (Full prompt renders no `verificationMode:` line),
  `gettingStartedActions.test.ts` (structureOnly write counts).
- Docs: omission notes in `docs/spec-md-schema.md` and
  `docs/planning/session-set-authoring-guide.md`.

## Verification

- Round 1 (gpt-5-4, $0.159): `ISSUES_FOUND` — one Major (S082-V1-001: fixture
  `.dabbler/verification-mode` "not deleted") + two comment-arithmetic nits.
- Adjudication: the Major was a context gap — no `.dabbler` file has ever
  existed under `test-fixtures/` (the golden is render-output only; the
  snapshot test rejects extra files). Resolved via option (c) re-verify with
  reshaped context; `record_adjudication` logged
  (cause=context-gap, resolution=reverify-reshaped). Nits fixed.
- Round 2 (gpt-5-4, $0.064): **VERIFIED** — S082-V1-001 confirmed
  not-reproducible against the evidence; both nit fixes confirmed.
- Artifacts: `s1-verification.md`, `s1-issues.json` (dispositions annotated),
  `s1-verification-round-2.md` (raw, never edited).

## Suite state at close

Layer-2: 1270 passing. Layer-1 pytest: 2483 passed, 5 skipped (baseline).
`tsc --noEmit` clean. Layer 3 not run — no Explorer-rendering surface touched.
