# Cross-repo notice — the Lightweight tier is removed (Set 112)

**Authored:** 2026-08-09 (Set 112 Session 2)
**Audience:** every repo that consumes `dabbler-ai-router` or the
`DarndestDabbler.dabbler-ai-orchestration` VS Code extension —
`dabbler-access-harvester`, `dabbler-platform`,
`dabbler-homehealthcare-accessdb`, and any consumer not yet listed.
**Status:** ready to send. **Sending it is the operator's call** (an
outward-facing action, decision-rights rubric); this file is the content,
not the send.

> **Read this if any `spec.md` in your repo declares `tier: lightweight`.**
> Those sets will stop loading on the next major `dabbler-ai-router`. The fix
> is one line, and this notice walks it. If no spec in your repo declares a
> `tier:` line at all, nothing here affects you — you are already on the one
> tier.

---

## What changed, in one paragraph

`dabbler-ai-router` had two adoption tiers. `tier: full` routed reasoning
through provider APIs and verified every session against a **different**
provider; `tier: lightweight` made zero metered calls and substituted one of
two per-set verification modes (`verificationMode: out-of-band-or-none`, a
hand-recorded verdict file, or `dedicated-sessions`, typed verification
sessions appended at runtime). **Set 112 deleted the Lightweight tier and both
of its verification modes.** There is one tier now, and one verification
story: the router's routed cross-provider round, corroborated by the close-out
gate.

The tier existed for shops with no provider API keys. That population is now
covered by the **Copilot CLI seat profile** — routed calls dispatch through an
authenticated GitHub Copilot seat, no `DABBLER_*` keys required — which keeps
cross-provider verification instead of trading it away. That is why the tier
could go rather than being kept for compatibility.

## What breaks

**A spec declaring `tier: lightweight` no longer loads.** The router's spec
loader raises `LightweightTierRemovedError` at the lifecycle boundary — before
`start_session` writes anything — with this message:

```
tier: lightweight was removed in Set 112 -- there is one tier now. Fix: set
'tier: full' in the Session Set Configuration block (or drop the tier: line
entirely), then give the router a provider to call -- either
DABBLER_ANTHROPIC_API_KEY / DABBLER_GEMINI_API_KEY / DABBLER_OPENAI_API_KEY
for the Direct APIs transport, or an authenticated GitHub Copilot CLI seat
with 'transport: {profile: copilot-cli}' in ai_router/local-overrides.yaml.
See docs/cross-repo-lightweight-removal-notice.md.
```

This refusal is **deliberate and is not softened**. A silent conversion to
`full` would start billing a project whose whole premise was zero metered
spend, and would do it without anyone deciding to. Failing loud at the
boundary, before any state is written, is the safe behavior.

Also removed, in case your repo or tooling reaches for them:

| Removed | Notes |
|---|---|
| the `tier:` spec field | Drop the line. There is no replacement field. |
| the `verificationMode:` spec field | Drop the line. Both modes are gone. |
| `external-verification.md` as a gate input | The file is no longer parsed. Existing ones stay readable as history. |
| typed `verification` / `remediation` sessions | `start_session --type` is gone; sets no longer grow sessions at runtime. |
| `python -m ai_router.change_verification_mode` | The A→B writer is deleted. |
| `python -m ai_router.migrate_lightweight_to_canonical_v4` | The migrator is deleted; the `lightweight-to-v4` slot left the migrator chain. |
| the extension's `Switch Tier…` row action | Command removed. |
| the extension's `Set Up Dedicated Verification…` row action | Command removed. |
| the extension's `Open External Verification Note` row action | Command removed. |
| the extension's `Verification Kickoff` copy prompt | Command removed. |
| the Getting Started form's tier radio | The form's first question is now **provider access** (direct API keys vs. Copilot seat). |

**Archived sets are safe.** A completed or cancelled Lightweight set is
history: nothing re-loads its spec, and the removal does not rewrite it. Only
sets you still intend to *run* need the fix below.

## The fix

For each **not-started or in-progress** set whose `spec.md` declares
`tier: lightweight`:

1. **Delete the `tier:` line** from the Session Set Configuration block. (Or
   set `tier: full` — both load; the field is simply ignored now. Deleting is
   cleaner.)
2. **Delete the `verificationMode:` line** if present.
3. **Give the router a provider to call** — one of the two below.

### Option A — direct provider API keys

Set at least one of `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`,
`DABBLER_OPENAI_API_KEY` in your environment. Verification picks a verifier
from a **different** provider than the one that did the work, so a repo with
exactly one provider family available will hit `verification_unavailable` (a
blocked state, resolvable only by the operator-attested `--manual-verify`
path) rather than silently passing itself. Plan for two families.

### Option B — a GitHub Copilot CLI seat (no provider keys)

If your shop has Copilot seats and no provider API keys, this is the direct
replacement for what Lightweight gave you:

1. Install the GitHub Copilot CLI and log in to your tenant. The one-time
   per-machine checklist is
   [`docs/copilot-seat-setup-checklist.md`](copilot-seat-setup-checklist.md).
2. Create `ai_router/local-overrides.yaml` (gitignored — it is per-machine,
   not per-repo) containing:

   ```yaml
   transport:
     profile: copilot-cli
   ```

3. Run `python -m ai_router.copilot_preflight` to confirm the seat
   authenticates and to refresh its model catalog.

Your seat must serve **at least two provider families** for cross-provider
verification to be satisfiable. Some enterprise-managed seats expose only one;
the preflight tells you honestly which case you are in rather than discovering
it at close-out. Note also that on a Copilot seat every session must pass
`--model` to `start_session` — a seat relays whatever model the picker
selected, so the model, not the seat label, is the session's identity.

### Option C — you genuinely cannot verify

If a project truly has no second provider and never will (a local-only
teaching repo, a demo), declare that **on disk** rather than per-session, in
`ai_router/budget.yaml`:

```yaml
threshold_usd: 0
mode: "zero-budget"
verification_method: "skipped"    # or "manual-via-other-engine"
verification_nte_usd: 0
```

The close-out gate accepts a `verification_method` of `skipped` /
`manual-via-other-engine` **only** when the budget file declares the
zero-budget threshold and a matching method. This is an operator declaration,
by design: an engine cannot record "skipped" in a disposition and walk past
verification on its own say-so.

> **One more thing if your repo relied on `--no-router` or
> `DABBLER_NO_ROUTER` for gate relief:** it no longer provides any. Set 112
> found that those inputs alone disarmed two close gates — which, once the
> documented tier was gone, would have left an environment variable as an
> undocumented back door. `--no-router` now means exactly one thing: suppress
> routed API calls. It remains supported for CI and hermetic tests.
> `--manual-verify` is the only attested bypass.

## Versions

- **`dabbler-ai-router`** — this is a **major-version breaking release**
  (a routable Lightweight spec no longer loads). Pin deliberately: a repo not
  ready to migrate should hold its current pin until it is.
- **`DarndestDabbler.dabbler-ai-orchestration`** (VS Code extension) — the
  Getting Started form and four row actions changed. Older extension versions
  keep working against older router pins.

The exact published version numbers are recorded in the packages' changelogs
(`ai_router/CHANGELOG.md`, `tools/dabbler-ai-orchestration/CHANGELOG.md`) at
release time.

## If you get stuck

The retired model, why it went, and what replaced it are written up in
[`docs/concepts/tier-model.md`](concepts/tier-model.md) (a historical note).
The complete file-level inventory of what was deleted is in
`docs/session-sets/112-remove-lightweight-tier/s1-kill-inventory.md`.
