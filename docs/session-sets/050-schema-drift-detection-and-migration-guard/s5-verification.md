# Set 050 — S5 cross-provider verification record

**Performed:** 2026-05-29 (Session 5 close-out)
**Method:** cross-provider IV&V — single verifier
**Verifier:** `gemini-pro` (google / `gemini-2.5-pro`) — different
provider from the Claude (anthropic) orchestrator, satisfying the
different-provider rule.
**Call mechanics:** `providers.call_model` invoked directly with the
provider-scoped config (`cfg["providers"]["google"]`) to avoid the
recurring `RouteResult.provider` attribute trap. `thinking_budget=4096`,
`max_tokens=16000` (a first attempt at `max_tokens=4000` returned a
candidate with no text parts — gemini-2.5-pro's dynamic thinking
consumed the whole budget; bumping the cap fixed it).
**Cost:** $0.0053 (1501 in / 344 out tokens).

## Scope

Cross-provider verification of the S2–S5 deferred work, which prior
sessions deferred to S5 per the established per-set pattern. Five
load-bearing claims were put to the verifier:

1. The pure-JS hot-path drift scan has no `ai_router` dependency, no
   network, and is fail-open.
2. **(deviates from the S1 verdict)** the bulk-upgrade chain requires
   **three** migrators, not the verdict's two — a genuine v2 file is
   skipped by both v4 migrators and needs the `migrate_session_state`
   (v2→v3) step first.
3. `check_migrations` is detect-only; the manifest is advisory and off
   the hot path.
4. The number→slug resolver contract (exact integer-prefix match,
   collision, no-match, `--next` zero-pad).
5. The Explorer UX revision (asterisk + tooltip replaces the per-row
   nag; title-bar bulk-upgrade icon gated on `hasSubCurrentSets`).

## Verdict: **VERIFIED**

- **Critical:** none.
- **Important (noted risks, not defects):**
  1. The safety of the three-step bulk migration relies on each
     migrator's idempotency — this property must be preserved.
     *Disposition:* already a documented, test-asserted property (each
     migrator is `--in-place`, idempotent, `.bak`-backed). No change
     needed; recorded as a standing invariant.
  2. The dual Python/TS implementation of the number→slug resolver is a
     minor code-drift risk and requires discipline to keep in sync.
     *Disposition:* acknowledged. The pure-TS `resolveSetNumber.ts` twin
     deliberately mirrors the Python contract so router-less consumers
     get the handle. A convention-lint pinning the two is a candidate
     for a future hygiene set, not an S5 blocker.
- **Nice-to-have:** investigate the two pre-existing Set-026 TS
  stub-harness test failures. *Disposition:* out of scope for Set 050 —
  these predate the set and were flagged in S3/S4; carried as known
  pre-existing failures.

No item required an in-flight fix. The independent verifier confirmed
all five claims, including the empirically-corrected three-migrator
chain (claim 2) as "a sound and empirically-validated correction" and
the release discipline as sound.
