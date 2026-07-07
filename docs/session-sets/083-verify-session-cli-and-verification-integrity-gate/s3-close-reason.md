# Session 3 close reason — instruction surfaces, the skip removal, and supersession by Set 084

**Outcome:** completed, VERIFIED (round 5; gpt-5-4 across all rounds via
the S1 `verify_session` CLI). Closed under the spec's two dated operator
revisions: Revision 1 (remove the skip — verification mandatory on every
Full-tier session) and Revision 2 (the remaining UAT walk and the two
releases are superseded by Set 084).

## What shipped in this session

- **Instruction surfaces (original S3 scope, by the Copilot-seat
  orchestrator):** `start-here.md.template` command path, removal of the
  "automatic" verification claims, the `start_session` Step-6 advisory,
  regenerated cold-start goldens and dist bundle, and the first
  per-set UAT checklist draft.
- **The skip removal (Revision 1, operator-ordered, by the Claude
  orchestrator after the first UAT walk failed live):**
  - `check_verification_integrity` refuses a **null-verdict** Full-tier
    close; `skipped` / `manual-via-other-engine` are legal only under the
    operator-declared zero-budget `budget.yaml` tier. The Set 068
    "routed-gate SKIP" disposition shape is retired.
  - `python -m ai_router.routed_gate` retired as a skip authority:
    always REQUIRED (exit 0), predicate demoted to informational output
    (`predicate_required` in `--json`), kept only for pre-083 scaffolds.
  - Every instruction surface re-taught: mandatory `verify_session` →
    `close_session`, no skip branch, venv-qualified invocations
    everywhere an engine is told what to run (the bare-`python`
    interpreter-skew class from the incident).
  - e2e harness now declares the zero-budget tier it factually is; S3's
    own bare `runtime_mode` import fixed (the `test_production_imports`
    guard caught work the focused slices had missed).
  - Suites at close: Layer-1 **2575 passed / 5 baseline skips**; Layer-2
    mocha **1270 passing**.
- **Consensus + Set 084 authoring inputs:** the identity/provenance
  design questions were put to two independent models
  (`verification-identity-consensus-prompt.md` + two responses +
  `consensus-synthesis.md`); the resulting Set 084 spec
  (`084-verification-identity-and-close-backstop`) carries the fixes
  this set's incidents proved necessary.

## Verification narrative

Five rounds, all gpt-5-4 via the S1 CLI, each of rounds 1–4 surfacing a
distinct real finding, none resurrected:

1. **R1** — diff vs superseded spec text (resolved by recording the
   operator decision as spec Revision 1 + activity-log entry) and
   releases absent (by design; later formalized as Revision 2).
2. **R2** — the extension's Marketplace README still taught the gated
   flow. Fixed (plus the root README banner).
3. **R3** — the new runtime advisories printed bare `python` — the exact
   interpreter/version-skew class behind the failed walk. Fixed
   venv-qualified across `start_session`, `routed_gate`, close-out doc,
   and the engine tails.
4. **R4** — the round's artifacts were untracked (L-064-9 class) —
   resolved by the close-out commit this file ships in; stopped to the
   operator per the round discipline.
5. **R5** — VERIFIED against the committed tree
   (`--diff-base bc4fffd`).

## The UAT waiver and release deferral (Revision 2 — operator decision)

The re-walked UAT and both releases move to Set 084:

- The first walk failed on two environment/design truths this session
  could not fully cure: the scaffold venv resolved PyPI 0.28.0 (no
  `verify_session`, no gate — L-075-1's declared-floor-vs-installed gap),
  and a third live incident (`C:\temp\orch-test-202607061506`) showed the
  gate's identity model and the verifier selection are structurally
  blind on multi-provider Copilot seats — Set 084's scope, not this
  set's.
- Walking the revised checklist against 0.29.0-in-tree would either pass
  hollow text assertions or rediscover incident 3; publishing 0.29.0
  standalone would ship a version already known to be identity-blind on
  Copilot seats. The operator therefore waived this set's walk (its two
  text assertions migrate verbatim into the 084 checklist) and deferred
  the combined release to 084 S3 (router 0.29.0 — the number never
  reached PyPI — carrying both sets' changelog sections).
- **Not waived:** this close carries corroborated cross-provider
  verification (five rounds of evidence) and the required path-aware
  critique artifact. The waiver covers exactly one thing: the human walk,
  in favor of a strictly stronger one.

## Dogfood note

This session's close runs through the gate it hardened: the
`verification_integrity` row must corroborate five `s3-verification*.md`
artifacts and five cross-provider metrics rows (gpt-5-4 → openai,
registry-resolved) against the session's re-registered anthropic
orchestrator block — including the mandatory-verification rule this very
session added. See `session-events.jsonl` for the recorded proof.
