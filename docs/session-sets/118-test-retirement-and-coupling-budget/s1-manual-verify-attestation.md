# Operator attestation — Set 118 Session 1 verification evidence

**Operator authorization:** "I authorize manual verification", given
2026-08-14 at the Session 1 close-out stop, after `close_preflight`
reported the round-4 stamp stale and priced a fifth routed round.

## What is being attested, and what is NOT

This is **not** a bypass of a review that never happened. Session 1's
verification ran in full through the automated path and returned
**VERIFIED**. What went stale is the *stamp*, not the evidence: two
paths changed after round 4 was stamped, so `work_diff_sha256` no longer
matches the tree diffed from `evidence_base b6002eb73cfb`.

The two paths are:

- `docs/planning/lessons-learned.md` — the `cite_lessons` metadata stamp
  (`last-used-set=118` on L-112-1, L-064-9, L-064-8). Close-out itself
  mandates this write, so the close-out procedure necessarily stales the
  evidence it then asks to be fresh.
- `docs/session-sets/118-test-retirement-and-coupling-budget/changelog-fragment-draft.md`
  — a documentation draft held for Session 3.

`post_round_delta` classifies both as `shipped-code` because
`classify_changed_paths` is path-based and neither path sits under a
declared test surface. Neither is shipped code, and neither alters any
behaviour the verifier reviewed.

## The evidence this attestation stands in for

- **Verifying surface:** `python -m ai_router.verify_session`, routed on
  the `copilot-cli` transport from the authenticated GitHub Copilot CLI
  seat. Not a hand-rolled review.
- **Verifier model:** `gpt-5.5`, effective provider **openai** — on
  every one of the four rounds.
- **Orchestrator:** `claude-opus-5`, effective provider **anthropic**.
  The providers differ, and the difference was machine-enforced, not
  asserted: each round printed `excluded providers: anthropic
  (orchestrator effective provider via model-registry)`.
- **Template:** the canonical adversarial `session-verification` task
  type, driven by `verify_session`'s own phased prompts
  (`discovery` 2-lens fan-out → `supplementary` → `remediation-review`
  ×2). No diluted or hand-authored prompt was substituted.
- **Timestamps:** rounds 1–4 ran 2026-08-13; round 4 returned VERIFIED
  and patched `disposition.json` at that time.
- **Raw artifacts, unedited, committed:**
  - `s1-verification.md`, `s1-verification-fanout-2.md` (round 1, both lenses)
  - `s1-verification-round-2.md` (supplementary)
  - `s1-verification-round-3.md` (remediation-review cycle 1)
  - `s1-verification-round-4.md` (remediation-review cycle 2 — **VERIFIED**)
  - `s1-issues.json`, `s1-issues-round-2.json`, `s1-issues-round-3.json`
  - `s1-acceptance-round-1.json`, `-2`, `-3` (acceptance harness)
  - `s1-rounds.jsonl` (the true round ledger)
  - `s1-remediation-round-1.md`, `-2`, `-3` (per-round fix sidecars)

## Outcome of that verification

Five Major findings across rounds 1–3, **all accepted, none disputed,
all fixed**; round 4 returned **VERIFIED, 0 findings, 4 fixes accepted,
0 rejected**. No operator-authorized round was required, and the round
budget was not exhausted. Findings and fixes are described per round in
the remediation sidecars.

## Suites, unaffected by this attestation

`test_run_fresh` passes on its own terms — all three declared suites are
recorded fresh and green against the final tree: pytest 4,374 passed / 9
skipped (595s), mocha 1,455 passing (44s), playwright 31/31 (509s, the
separately-attested serial run).

## Why the override rather than a fifth round

A fifth routed round would review a lessons-learned metadata stamp and a
documentation draft — neither of which is behaviour, and one of which
close-out required. The operator was shown the price and authorized the
attested path instead. The verdict this close records, `VERIFIED`, is
the one the automated cross-provider path actually produced.
