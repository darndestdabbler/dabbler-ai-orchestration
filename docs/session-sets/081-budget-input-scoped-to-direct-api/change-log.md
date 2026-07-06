# Change Log — Set 081 (Budget Input Scoped To The Direct-API Sub-Choice)

> **What this set delivered:** The Full tier's "Verification budget
> (USD, not-to-exceed)" block now renders as an indented child of the
> "Direct provider API keys" option row and exists only while Full +
> that sub-option are selected — because the budget governs metered
> provider-API verification spend, which the Copilot seat profile
> excludes by design. Build matches the UI's honesty: a Copilot-seat
> Build validates no budget and writes no `ai_router/budget.yaml`
> (absence has documented compat defaults). Requested by the operator
> during the Set 080 UAT walk.
>
> **Non-goals (unchanged):** the `budget.yaml` schema and compat
> defaults, the $0 zero-rule semantics, all budget copy, the
> Lightweight tier, the Command-Palette `setupNewProject` flow, and
> everything in `ai_router/` (extension-only release; router stays
> 0.28.0).
>
> **Release:** extension **0.37.0** — published 2026-07-05, tag
> `vsix-v0.37.0`, commit `bc3b43f`, publish run 28764677942;
> extension-only, `dabbler-ai-router` stays 0.28.0.

---

## Session 1 of 2 — Conditional budget block + Build gating

**Status:** VERIFIED (cross-provider, round 3)

Nested the budget block inside the transport-profile group as an
indented child of the Direct-API option row, omitted (not hidden) while
the Copilot sub-option or the Lightweight tier is selected — the form's
existing conditional pattern; `gsState` preserves a typed value across
flips so hiding never clears it. Build gating landed at three defense
lines: `client.js` validates/posts budget riders only while the block
is live, the action router drops stray riders under `copilot-cli` and
scopes the Set 063 fail-closed reject to the Direct-API path, and
`gitScaffold`'s `effectiveBudget` caller condition passes no budget to
the scaffold step on the Copilot path (`writeBudgetYaml` unchanged).
New Layer-2 suites pin placement/visibility, flip persistence, the
Build write matrix at the `runScaffold` seam, and the action-router
matrix — with zero semantic edits to pre-existing budget tests (the
Set 080 scope tripwire held). Verification round 1 caught a real
evidence-packet gap (a path-filtered diff omitted the tracked
session-state boundary write — the L-064-9 class extended); rounds 2–3
resolved it to VERIFIED.

---

## Session 2 of 2 — UAT, screenshot, and release

**Status:** VERIFIED (cross-provider, round 1)

Authored the per-set ad-hoc UAT checklist to the Set 078/079/080 bar —
five walks including one REAL cold-start Build per sub-option in fresh
empty folders asserting the `budget.yaml` write matrix (L-079-3) — and
the operator attested all six functional/judgment items PASS, including
the judgment that the nesting reads as scoped to the Direct-API option.
The walk's one "Other" finding (the Build button read as belonging to
the last option row) was remediated in-session with a single CSS rule
closing both sub-choice groups (both tiers — the same class of issue),
operator re-checked. The operator captured the refreshed
`getting-started.png`. The advisory end-of-set path-aware critique ran
via the first-party producer (gpt-5.4 + gemini-2.5-pro, repo-root
sandbox, whole-set diff): both arms VERIFIED with zero findings. The
extension released as 0.37.0 (the version bump also realigned a
package-lock.json that had silently sat at 0.34.0 through two
releases); cross-provider verification returned VERIFIED in round 1
with two non-blocking nits, both addressed.
