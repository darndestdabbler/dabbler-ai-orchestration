# Change Log — Set 082 (Omit VerificationMode From Full-Tier Scaffolds)

> **What this set delivered:** A freshly scaffolded **Full**-tier project
> no longer carries the phantom Lightweight-only `verificationMode`
> choice at either site: the spec template's fixed line became the
> whole-line `{{VERIFICATION_MODE_LINE}}` token (rendered in full, comment
> included, on `lightweight`; the empty string on `full` — no blank-line
> residue), and the `.dabbler/verification-mode` marker is written on
> Lightweight only (on Full it is neither written nor deleted, so a prior
> Lightweight pick survives a tier round-trip). Fix for a live
> operator-reported misreading: a GitHub Copilot session read a fresh Full
> scaffold back as "tier: full, verificationMode: out-of-band-or-none" —
> the exact wrong message, since automatic cross-provider verification is
> the Full tier's defining feature. Per simplicity-first the fix is
> omission, not a sentinel — omission is already schema-legal
> (absence-means-default in every reader).
>
> **Non-goals (unchanged):** the `verificationMode` enum and its
> Lightweight semantics, the Set 057/062 mode machinery, the Lightweight
> scaffold output (byte-identical — the golden-snapshot tripwire held),
> the Getting Started form UI, `.dabbler/tier`, and everything in
> `ai_router/` (extension-only release; router stays 0.28.0).
>
> **Release:** extension **0.38.0** — published 2026-07-06, tag
> `vsix-v0.38.0`, commit `e9bbfae`, publish run 28806840851 (Test run
> 28806467299 green on the tagged commit); extension-only,
> `dabbler-ai-router` stays 0.28.0.

---

## Session 1 of 2 — Conditional template line + tier-gated marker

**Status:** VERIFIED (cross-provider, round 2)

Replaced the template's fixed `verificationMode:` line with the
whole-line `{{VERIFICATION_MODE_LINE}}` token (`verificationModeLine()`
in `consumerBootstrap.ts` renders the full pre-082 line on `lightweight`,
the empty string on `full`); gated the `.dabbler/verification-mode`
marker write in `gitScaffold.ts` to Lightweight, with the
preserve-on-Full choice documented in the code comment. Sibling audit
per L-069-1: `buildSessionGenPrompt`'s hard-requirements prose rescoped
(`full` sets OMIT the field; the Full worked example omits the line via
the shared `renderSpec`), pinned with two Layer-2 tests;
`start-here.md.template`'s Lightweight-scoped prose mention named as a
deferred residual (byte-identity tripwire). Full cold-start fixture
regenerated; lightweight fixture byte-identical. Layer-2 suites extended
(per-tier line presence, marker write matrix incl. full-preserves,
structureOnly write counts). Omission notes added to `spec-md-schema.md`
and the authoring guide. Verification round 1 returned one context-gap
Major (adjudicated not-reproducible via reshaped-context re-verify —
the golden trees are render-output-only and never carry `.dabbler`
markers) plus two nits, fixed; round 2 VERIFIED.

---

## Session 2 of 2 — Cold-start UAT and release

**Status:** VERIFIED (cross-provider, round 2 — round 1 was a
format-noncompliant bare verdict, re-run wording-only with `max_tier`
pinned per L-064-7)

Authored the per-set ad-hoc UAT checklist to the Set 078–081 bar — every
literal re-grounded against current source, fresh suite counts quoted
per walk (Layer-2 1270/0, tsc clean), one honest documented adaptation
(both real Build entry points are structure-only since Set 060, so the
spec's `001-sample-feature` file assertion is pinned by the
golden-snapshot suite and the operator walks the step-3 session-set
prompt's worked example instead — same shared `renderSpec` writer). The
operator walked all three walks 2026-07-06 — two REAL cold-start Builds
from fresh empty folders, one per tier (L-079-3), plus a
Full-over-Lightweight re-Build asserting marker preservation — and
attested all 5 functional items PASS with no findings. The required
end-of-set path-aware critique ran via the first-party producer
(repo-root sandbox, whole-set diff): gemini-2.5-pro VERIFIED with zero
findings; gpt-5.4 found one real Major — `docs/concepts/tier-model.md`
still claimed the canonical spec shape requires `tier` +
`verificationMode` (a missed L-065-1 echo) — fixed in-session, repo-wide
sweep clean, artifact kept raw/pre-fix per L-070-1. Released as 0.38.0
on operator authorization.
