# The Dabbler tier model — retired (historical note)

> **Status: RETIRED.** Set 112 deleted the Lightweight tier. This document
> used to be the single source of truth for a two-tier adoption model
> (`tier: full` vs `tier: lightweight`); there is now exactly one tier, so
> there is no model to be the source of truth for. The file survives only
> so links from archived session sets, proposals, and changelogs resolve to
> an explanation rather than a 404.
>
> **Do not cite this doc as current behavior, and do not restore it.** If
> you arrived here from a live doc, that link is a bug — the live doc
> should not reference the tier model at all.

---

## What the tier model was

Between Sets 048 and 112 a session set declared `tier: full` or
`tier: lightweight` in its `spec.md` Session Set Configuration block. The
switch controlled exactly one thing: **whether the project made external,
metered LLM API calls.** `tier: lightweight` resolved to `--no-router` (zero
API calls); everything else — the `.venv`, `dabbler-ai-router`,
`start_session` / `close_session`, the sanctioned state-file writer, the state
schema, the close-out gate — was identical on both tiers.

The single most-repeated correction the doc carried was:

> Lightweight was **router-off, not Python-off.**

Four setup surfaces got that wrong at various times, and a CI drift guard
(`ai_router/scripts/drift_guard.py`, `stale-framing` check) existed purely to
stop the stale "Lightweight = no Python, no venv, docs only" framing from
reappearing. Set 112 S2 retired that guard along with the tier it defended.

Because Lightweight made no routed calls, it could not run the routed
cross-provider verification the Full tier requires. It substituted two
per-set verification **modes**, selected by a `verificationMode` spec field:

- **`out-of-band-or-none`** (Mode A, the default) — the operator pasted a
  review prompt into a second AI assistant and recorded the verdict by hand
  in an `external-verification.md` file.
- **`dedicated-sessions`** (Mode B) — the set grew typed `verification` /
  `remediation` sessions at runtime, run on a different engine or provider,
  with a bounded re-verification loop and a content-aware close gate.

## Why it was removed

The tier existed for shops with no provider API keys. Sets 078/079/084/086/104
shipped the **Copilot CLI seat profile** (`transport.profile: copilot-cli`),
which dispatches routed calls through an authenticated GitHub Copilot seat and
needs no `DABBLER_*` keys at all. That covers the same population *without*
giving up routed cross-provider verification.

The gate that cleared the removal was measured on 2026-08-05: a probe of an
enterprise Copilot seat confirmed 11/18 models across three provider families
(`anthropic`, `google`, `openai`), which is enough for the verifier-exclusion
guarantee to hold on a seat-only shop. The probe lockfile is archived at
`docs/session-sets/112-remove-lightweight-tier/probe-evidence-copilot-catalog.lock`.

With every known user reachable by the Full tier — keyed or seat-profile —
the second tier bought nothing and cost a great deal: two verification modes,
their typed-session machinery, a migrator, a tier-marker store, a
Getting Started fork, a drift guard, and a dual-tier narrative in every
teaching doc. Set 112 deleted all of it.

## What replaced it

- **One tier.** A spec declares no `tier` field. `tier: lightweight` in a
  spec is refused by the loader with a migration message — deliberately
  loud, never silently converted.
- **One verification story.** Every session runs the router's routed
  cross-provider `verify_session` round, and the close-out gate corroborates
  it. There is no per-set mode.
- **`--no-router` survives as a CI/test affordance only.** The CLI flag and
  the `DABBLER_NO_ROUTER` env var still suppress routed API calls for
  hermetic runs. Set 112 S1 additionally closed a hole here: those inputs
  used to disarm two close gates on their own, which would have made an
  environment variable an undocumented back door once the documented tier
  was gone. `--no-router` now means exactly one thing — suppress routed
  calls — and buys no gate relief. `--manual-verify` is the only attested
  bypass.
- **Zero-cost projects declare it honestly.** A project that genuinely
  cannot verify (the shipped sample project, for one) declares
  `threshold_usd: 0` with a matching `verification_method` in
  `ai_router/budget.yaml`. That is an operator declaration on disk, which is
  the point — an engine cannot record "skipped" and walk past the gate.

## Where the record lives

- The removal set: `docs/session-sets/112-remove-lightweight-tier/`
  (`spec.md`, and `s1-kill-inventory.md` for the complete file-level
  inventory of what was deleted).
- The reservation and evidence basis:
  `docs/proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md`.
- The consumer migration notice:
  [`docs/cross-repo-lightweight-removal-notice.md`](../cross-repo-lightweight-removal-notice.md).
- The seat profile that replaced the tier:
  `docs/session-sets/078-copilot-cli-hybrid-tier/spec.md` and
  [`docs/copilot-seat-setup-checklist.md`](../copilot-seat-setup-checklist.md).
