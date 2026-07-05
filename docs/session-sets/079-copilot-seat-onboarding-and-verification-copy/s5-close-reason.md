# Session 5 close reason — Set 079 (Docs, UAT, and release)

**Verdict:** VERIFIED (gpt-5-4, cross-provider, round 2 — R1's two
docs-honesty findings fixed and RESOLVED)
**Status at hand-off:** `requires_review` — every orchestrator-side step is
done; the session is deliberately held open for the two operator-only
items:

1. **UAT walk** —
   `079-copilot-seat-onboarding-and-verification-copy-uat-checklist.json`
   (6 walks, run through the checklist editor against a locally built
   VSIX: from `tools/dabbler-ai-orchestration` run `npx vsce package`,
   then "Extensions: Install from VSIX…").
2. **Tag authorization** — `vsix-v0.35.0` (extension-only release;
   `dabbler-ai-router` stays 0.28.0).

## What landed

- **Docs (spec steps 1–4).** `docs/concepts/tier-model.md` now presents
  the guided Getting Started flow as the primary `copilot-cli` activation
  path (manual `router-config.yaml` editing is the documented fallback)
  and its evidence basis carries the M3 honesty note: Sets 078 and 079
  validated on the **same single personal seat**; multi-seat /
  enterprise-seat model availability is **not** validated; an
  enterprise-locked one-provider-family seat fails the ≥2-provider check
  even when the guided flow "works"; the POSIX cancel kill is unit-pinned
  only; the config write is process-crash-atomic, not power-loss-durable.
  Both READMEs describe the Full-tier "Provider access" sub-choice, the
  missing-CLI warning, and the same full honesty caveat. The bundled
  getting-started template no longer claims `DABBLER_*` keys are required
  for Full (keys belong to the direct-API option; the Copilot CLI seat is
  the keyless alternative) — cold-start goldens regenerated
  (`UPDATE_GOLDEN=1`). The decomposition prompt was checked and needs no
  change (it references tier only at the spec-authoring level).
- **UAT checklist (spec step 5).** Authored to the Set 078 / 077-rewrite
  bar: literal UI labels and command lines, literal-string Expectations
  quoted verbatim from current source, every non-judgment item carrying a
  `ProgrammaticVerification` with a **freshly re-run** Layer-2 count
  (Set 079 S1 suites 20/20, verification-mode block 5/5 incl. the S4 pin
  test, copilotSeatSetup 82/82, gitScaffold 25/25), and the real-seat
  walks (guided happy path; mid-run cancel) grounded in the S2/S3
  dogfoods (102 s success, 15/18 models, providers
  anthropic/google/openai; real cancel with verified tree-kill and no
  partial lockfile). Honest scope limits are stated in the checklist
  Notes (single personal seat; keys-present walk machine; POSIX branch
  unwalkable on win32; no auth-failure walk — the 078 stance).
- **Path-aware critique (spec step 6).** Run via the first-party
  `ai_router.pull_critique` producer (google gemini-2.5-pro + openai
  gpt-5.4, full-repo sandbox, `get_diff` a05c014..HEAD). Round lineage
  (L-070-1 — the final round is the committed artifact): R1 ran both arms
  but the producer's identity guard refused the write (`--level required`
  vs the recorded policy `none` — the spec prose says "required" but the
  config block never seeded `pathAwareCritique`; the set-start capture is
  immutable; **spec-authoring gap flagged for the Step 9 review**). R2
  wrote a valid artifact but the instruction framed only S4's close
  summary (the producer fills placeholders from `disposition.json`). R3
  (final, committed) ran after a preliminary set-wide disposition summary
  was authored: **gemini VERIFIED, 0 findings** (explicitly confirmed
  release scope, honesty-note propagation, and the UAT checklist);
  **gpt-5.4 ISSUES_FOUND, 1 Major** contract-drift claiming the docs/tests
  promise a nonexistent `Dabbler: Set Up Copilot Seat` command.
  Adjudication (recorded via `record_adjudication`, accept-finding with
  false-premise notes): two of its three evidence claims were empirically
  false — the 079 UAT checklist contains no such reference (grep: zero
  hits) and the production `rerunRefreshHint` is a directly runnable
  `copilot_catalog --refresh` command line, so the recovery path IS
  followable — but the real residue was fixed: the fictional command name
  lived in a test fixture string (`copilotSeatSetup.test.ts`), now
  replaced with the production command shape (8 regex asserts converted
  to string containment; suite 82/82). Converged on no further round: the
  residue was a test-string rename, exactly the Minor-churn the L-071-1
  materiality discipline forbids spending two more provider arms on.
- **Release scope + mechanics (spec steps 7–8).** Zero `ai_router/` /
  `pyproject.toml` changes across the whole set (diff a05c014..HEAD
  empty; router-metrics is gitignored) → **extension-only release**
  confirmed. Extension 0.34.0 → 0.35.0, CHANGELOG entry (including the
  recorded evidence limits), `docs/repository-reference.md` release-status
  row and version-walk entry with publish honestly marked **PENDING**;
  the rollback target it names (extension 0.34.0) is a confirmed-live
  Marketplace version (L-078-1). `npm run compile` resynced
  `dist/templates`. Tag push deliberately **held** for the operator.

## Verification

- Routed gate: REQUIRED (blast-radius, multi-module, breadth ≥14 files,
  build-ci-config via package.json).
- Session verification (gpt-5-4, OpenAI, cross-provider): R1 returned two
  findings with **no verdict token and no severities** — blocking per the
  L-071-1 anti-laundering rule. S5-V-001 (both READMEs' honesty caveat
  missing "same seat as 078" + the explicit "not validated" claim) and
  S5-V-002 (root README's generic "or provider API key" phrasing implying
  keys are required for every Full setup) — both fixed. R2 (narrow,
  fixes-only) **VERIFIED**, both ledger ids RESOLVED, no new defect.
  Artifacts: `s5-verification.md`, `s5-verification-round-2.md`,
  `s5-issues.json`.
- Suites at close: pytest 2483 passed / 5 skipped; `npx tsc --noEmit`
  clean; Layer 2 1238 passing (goldens regenerated for the intended
  template drift). No Playwright run: no Explorer-rendering surface,
  state writer, or fixture harness changed (S3's recorded requiresE2E
  decision + the L-064-12 scope rule); CI runs the full matrix on push.

## UAT remediation (post-attestation round — operator walk 2026-07-05)

The operator's walk PASSED walks 1, 2, and 6 and FAILED walks 4 and 5 on a
real defect (walk 3 was recorded not-passing with no feedback — awaiting
the operator's clarification). The failure: a fresh guided Build produced
**no `ai_router/router-config.yaml`**, so the seat setup's config write
correctly reported its honest `config-write-failed` message ("missing from
the workspace") after a fully successful probe.

**Root cause (orchestrator-reproduced against the real published 0.28.0
wheel on this cp1252 host):** the PyPI install's config-seed one-liner
printed the bundled config through the child Python's **text-mode stdout**
(`sys.stdout.write(p.read_text(...))`). Windows' child stdout text layer
defaults to `cp1252` (pre-3.15 Python) and the bundled config carries
`U+2192` in comments → `UnicodeEncodeError`, non-zero exit, and the
fail-open seed branch **silently skipped**. Pre-existing defect (any fresh
Windows scaffold since the bundled config gained non-ASCII characters) —
the same `cp1252` class as Set 078's decode-side fix, now on the encode
side. Why the set's own evidence missed it: the S2 real-seat dogfood drove
`performCopilotSeatSetup` against a scratch project whose config was
already present, and the Layer-2 install tests stub the one-liner's spawn
— only the operator's true end-to-end form walk exercised the real
venv-python one-liner on a real console. UAT earned its keep.

**Fix (verification rounds 3–4):**

- The one-liner now emits **raw bytes** (`sys.stdout.buffer.write(
  p.read_bytes())`), exported as `READ_BUNDLED_ROUTER_CONFIG_CODE` with a
  Layer-2 pin forbidding the text-mode form; a failed seed is now **named
  in the install message** instead of staying silent. Proven against the
  real 0.28.0 wheel: old form crashes, fixed form emits the full 37,860-
  byte config with the `transport:` anchor intact.
- R3 (gpt-5-4, narrow) confirmed the fix but found one further Major
  (**S5-V-003**): per-chunk `chunk.toString("utf8")` in the spawner sinks
  corrupts multibyte sequences split across chunk boundaries. Fixed
  class-wide (L-069-1): shared `makeUtf8ChunkDecoder`
  (`string_decoder.StringDecoder`) at all five spawner sinks the repo-wide
  grep found, with close/error-path flushes and a 4-test unit suite.
- R4 (gpt-5-4, narrow) **VERIFIED**: S5-V-003 RESOLVED, no regression.
  Suites: Layer 2 1244 passing, tsc clean (no Python change). Artifacts:
  `s5-verification-round-3.md`, `s5-verification-round-4.md`,
  `s5-issues-round-3.json`. CHANGELOG 0.35.0 gained the Fixed entry.

**Still open for the operator:** re-walk 4 and 5 against a REBUILT VSIX,
clarify walk 3's recorded not-pass (no feedback was attached), and the
tag authorization. The operator also requested a table-style visual
reformatting of the two second-level radio groups (provider access /
verification mode) — recorded as a follow-up-scope candidate, operator to
decide whether it lands in a small follow-on set or holds this release.

## For the Step 9 reorganization review (when the set closes)

- Spec-authoring gap: prose that declares an end-of-set critique
  "required" must also seed `pathAwareCritique: required` in the Session
  Set Configuration block — the set-start capture is immutable and the
  producer's write-mode identity guard enforces the recorded level.
