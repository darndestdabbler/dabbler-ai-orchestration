Set 051 Session 4 (4 of 4, FINAL) close-out — docs, changelog, dual version bumps, cross-provider verification, set close.

Executed the spec's Session 4 plan. This is the final session; `close_session` flips the set's top-level `status` to `complete`.

## What shipped

**CHANGELOGs.** New `ai_router/CHANGELOG.md` `[0.14.0]` entry (Set 051
ai_router half: joiner/`dabbler_launch` island removal, D3 salvage to
`writer_discipline.py`, backfill entry-point retirement, stray-test
relocation + the 3 latent utility fixes, wheel/entry-point regression
guards, `MIGRATIONS.md`, dependency audit). New extension
`tools/dabbler-ai-orchestration/CHANGELOG.md` `[0.26.0]` entry (Set 051
S3 Claude `SessionStart` hook retirement).

**Dual version bumps.** `dabbler-ai-router` 0.13.0 → **0.14.0**
(`pyproject.toml` + `ai_router/__init__.__version__`); extension 0.25.0
→ **0.26.0** (`package.json` + `package-lock.json` both nodes). Version
note recorded in both CHANGELOGs and the CLAUDE.md walk: the intervening
ai_router `0.13.0` was claimed by **Set 053** (lifecycle `summarize_drift`)
and was never tagged/published to PyPI (last published is `v0.12.0`); the
single `0.12.0 → 0.14.0` PyPI release carries both Set 053's and Set 051's
changes, each with its own CHANGELOG entry. The extension `0.25.0` is
Set 050's (tag `vsix-v0.25.0` exists), so Set 051's hook retirement takes
`0.26.0`.

**CLAUDE.md version walk** restructured: new `Current: v0.26.0` (Set 051,
both halves) prepended; the `Current → Previous → Pre-…-Previous` chain
cascaded down one level (7 labels). Companion-PyPI references updated.

**Live-docs reconciliation finished (S1 verdict V8).** Corrected the
remaining present-tense `ai_router/joiner/` references that S2's island
deletion left stale: `CLAUDE.md` (the post-Set-049 contract section now
points D3 at `ai_router/writer_discipline.py`; the historical Set-049
walk entry notes the joiner deletion) and `docs/ai-led-session-workflow.md`
(both the D3-survives paragraph and the Set-045-Explorer paragraph).
`narration-templates.md` + `cross-repo-harvest-notice.md` already carried
Set 051 "removed" banners from S2, so they needed no further edit.

**`change-log.md`** created for the set (S1–S4 summary).

## Verification — CROSS-PROVIDER, VERIFIED (0 critical, 0 important)

`gemini-pro` (google / `gemini-2.5-pro`) IV&V via `providers.call_model`
with the provider-scoped config (`cfg["providers"]["google"]` — the full
cfg has no top-level `retry`; this also sidesteps the `RouteResult.provider`
trap), `thinking_budget=6000`, `max_tokens=16000`. Given the **actual
code** (old `joiner/conflicts.py` vs new `writer_discipline.py`, the S2
packaging diff) with each deviation framed neutrally — not a pre-framed
narrative. The verifier scrutinized the four highest-risk surfaces and
confirmed all:

1. **D3 salvage (V2)** — "almost perfectly behavior-preserving … the core
   logic … is identical to the source." No `joiner` dependency.
2. **V3 backfill entry point RETIRED not repointed** — "correct and
   justified … shipping a known-broken console script is worse than not
   shipping it."
3. **V4 relocate-and-fix the stray tests** — "correct and justified … the
   non-goal has a legitimate exception for code that was demonstrably *not
   live* because it was broken." Both fixes judged correct.
4. **S3 spec-implied deletions** — deleting `claudeSessionStartInvoker.test.ts`
   is "the correct and clean final step"; the watcher-allowlist line bump
   (154→153) "is the test working as designed."

**1 NICE-TO-HAVE — KEPT (deliberate, verifier fix declined).** The
salvaged report `note` string changed from `±2s` (unicode) to `+/-2s`
(ASCII); the verifier suggested reverting. Empirically confirmed the
change is real but the revert is **declined**: this repo has a documented,
reproduced gotcha that non-ASCII output crashes the Windows cp1252 console
(Set 050 S2). The ASCII form is the correct defensive rendering;
detection *behavior* (tolerance, logic) is unchanged. Full record at
`s4-verification.md`.

## Suite state

- Python: **1028 passed / 1 skipped / 0 regressions** (the −1 vs S2's 1029
  is the deleted `test_invoker_schema_constant.py`).
- TypeScript: `tsc --noEmit` clean; `test:unit` **554 passing / 2 failing**
  — both are the known pre-existing Set-026 stub-harness failures
  (`configEditor-foundation` panel-lifecycle + `notificationsSection`),
  unrelated to Set 051. No TS source changed in S4 (version + CHANGELOG
  only).
- Extension packages clean at **0.26.0** (`vsce package` → 21 files,
  930 KB).

## Cost

S4 routed the single verification call: **$0.0219** (9242 in / 1031 out).
Cumulative Set 051 routed: **$0.0491 of $10 NTE (0.49%)** — $0.0272 (S1
consensus) + $0.0219 (S4 verification); S2 + S3 invoked no router.

## Publishes — HELD for operator-initiated tag-push

Per established release discipline (tag-driven GitHub Actions, never local
`vsce publish` / `twine upload`):
- **PyPI** `dabbler-ai-router 0.14.0` — push tag `v0.14.0` (`release.yml`,
  OIDC trusted publishing).
- **Marketplace** `dabbler-ai-orchestration 0.26.0` — push tag
  `vsix-v0.26.0` (`publish-vscode.yml`). **Confirm `VSCE_PAT` freshness
  first** — it expired during the 0.24.0 publish (2026-05-28).

Operator follow-ups (out of session scope): push the two held tags;
consumer repos that installed the Claude `SessionStart` hook should remove
the dabbler entry from `~/.claude/settings.json` per
`docs/cross-repo-hook-retirement-notice.md` (drift now rides the router
lifecycle automatically).
