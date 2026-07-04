## 1. Lockfile schema — `ai_router/copilot-catalog.lock`

TOML (JSON acceptable). The lock is **seat-scoped truth**, not a global catalog. Because there is no discovery command, every entry is probe-populated; because the CLI self-updates, the lock is bound to one CLI version; because provenance is never returned, provider is stored explicitly with its derivation recorded.

```toml
[meta]
schema_version        = 1
cli_name              = "GitHub Copilot CLI"   # exact product string; guards against wrong binary
cli_version           = "1.0.68"               # version this lock was validated against
cli_version_pin_required = true                # run MUST assert --no-auto-update / COPILOT_AUTO_UPDATE=false
seat_id               = "op-personal-a1b2c3"   # operator-assigned stable label
account_login_sha256  = "…"                    # optional, if login is discoverable; else omit
seat_label            = "operator-personal"    # human label; e.g. "target-team"
probe_host_os         = "windows"              # credential resolution is OS-dependent
source                = "empirical-probe"      # no discovery command exists; entries are hand/probe-populated
probed_at             = "2025-01-01T00:00:00Z"

[[models]]
id                    = "claude-sonnet-4.6"
provider              = "anthropic"            # explicit; never derived at runtime
provider_source       = "name-prefix-heuristic"  # claude-*→anthropic | gpt-*→openai | gemini-*→google
enablement            = "confirmed"            # confirmed | unconfirmed | blocked — only "confirmed" is routable
confirmed_at          = "2025-01-01T00:00:00Z"
confirmed_on_cli_version = "1.0.68"
premium_request_weight = 1                     # observed result.usage.premiumRequests; informational only
echoed_model          = "claude-sonnet-4.6"    # assistant.message.model echo; catches silent substitution

[[models]]
id                    = "gpt-5.4"
provider              = "openai"
provider_source       = "name-prefix-heuristic"
enablement            = "confirmed"
premium_request_weight = 0
echoed_model          = "gpt-5.4"
# … gemini-3.1-pro-preview likewise …
```

**Fail-closed rules the loader runs on every routed dispatch:**

1. **Version drift** — `copilot --version` must equal `meta.cli_name`/`meta.cli_version`; mismatch → fail closed. (This is why `cli_version_pin_required` exists — an unpinned CLI can drift mid-session and silently invalidate the lock.)
2. **Missing provenance** — any `enablement="confirmed"` entry with `provider` empty or `"unknown"` (prefix outside `{claude,gpt,gemini}`) → fail closed.
3. **Same-provider-only** — distinct `provider` values across confirmed entries must be `> 1`; otherwise → fail closed. (Enforces the diversity gate; no extra field needed, computed from the set.)
4. **Seat mismatch** — running config must assert a seat identity equal to `meta.seat_id`; a lock probed on seat A must never be used on seat B, because enablement is per-seat.

The documented-but-never-dispatched catalog IDs (opus/haiku/fable/mini/flash/etc.) are recorded only as `enablement="unconfirmed"` and are **not routable** — enablement is empirical per model per seat.

---

## 2. Role/alias mapping — `router-config.yaml`

Roles are **late-bound aliases**, never bare model IDs in business logic. Config declares a seat-agnostic ordered preference; the resolver intersects it with the *active seat's* lock. Same YAML + different lock → different concrete model, always provider-diverse or fail-closed.

```yaml
transports:
  copilot-cli:
    kind: cli_subprocess
    binary: copilot
    lockfile: ai_router/copilot-catalog.lock
    require_pinned_version: true          # asserts --no-auto-update / COPILOT_AUTO_UPDATE=false
    billed_usage_unavailable: true        # see §6
    roles:
      generator:
        prefer: [claude-sonnet-4.6, gpt-5.5, gemini-3.1-pro-preview]
        require_provider_in: [anthropic, openai, google]
      verifier:
        prefer: [gpt-5.4, gemini-3.1-pro-preview, claude-sonnet-4.6]
        require_provider_in: [anthropic, openai, google]
    constraints:
      cross_role_provider_diversity:
        distinct_provider: [generator, verifier]   # verifier family MUST differ from generator
        on_violation: fail_closed
```

**Resolution algorithm:**
1. Load active seat lock → map of `confirmed` model → provider.
2. Per role, walk `prefer` in order; take the first model that is `confirmed` **and** whose provider ∈ `require_provider_in`.
3. Apply `cross_role_provider_diversity`: if `generator.provider == verifier.provider`, advance verifier to its next candidate of a different family; if none exists → **fail closed**.
4. Any unresolved role → **fail closed**.

Example of seat divergence: operator-personal resolves `generator=claude-sonnet-4.6, verifier=gpt-5.4`. A target-team lock with `claude-*` policy-blocked resolves `generator=gpt-5.5, verifier=gemini-3.1-pro-preview` — same config, different concrete models, still cross-provider. The lock is model-truth; the config is intent; the resolver is the only place they meet.

---

## 3. Timeout defaults

Observed trivial: `totalApiDurationMs` ~1.3–2.9 s, `sessionDurationMs` ~3.4–4.9 s (⇒ ~1.5–2.5 s of non-API CLI overhead). Real prompts run far longer, so defaults are headroom over the *overhead* phase, not the *generation* phase.

| Class | Default | Reasoning |
|---|---|---|
| **spawn** | **10 s** | Child process up / first `session.*` event on stdout. ~2× the entire worst trivial session — ample for launch even under Windows process-creation + AV scanning. |
| **first-byte** | **30 s** | Launch → first JSONL event. ~6× worst trivial full session; absorbs a cold credential-store hit and backend connect. This is where an auth stall or a forgotten `--allow-all-tools` interactive prompt manifests. |
| **total** | **300 s** | Whole run to the `result` event / exit. ~60× worst trivial session — covers real multi-paragraph generation, bounds a wedged process. Per-role override expected (verifier usually shorter). |

Constraint: `spawn < first-byte < total`. First-byte and total are the backstop that converts a missing-`--allow-all-tools` interactive hang into a killable, classifiable failure rather than an indefinite block.

---

## 4. Retryable-error classes

Only signal: exit code + stderr text. **Default-deny on retry** — the sole class that ever becomes retryable is one whose stderr shape is empirically pinned *and* semantically transient. This matters doubly because the transport is premium-request-billed and quota-blind: a retry storm has real cost and no local guard sees it.

| Class | Signal | Retryable? | Auto-classify today? |
|---|---|---|---|
| **invalid-model** | exit 1 + stderr `Error: Model "X" from --model flag is not available.` | **No** — deterministic | **Yes** (confirmed). Substring `from --model flag is not available`. |
| **auth-class** | conservative case-insensitive substring set: `auth`, `login`, `credential`, `unauthorized`, `authentication`, `401`, `403`, `not logged in` | **No** — needs remediation, not retry | **Fallback yes; positive heuristic provisional.** |
| **quota/rate-class** | none confirmed | **No today** (candidate for retry-with-backoff *after* S2) | **No** — needs S2. |
| **generic/unknown** | any other non-zero exit; malformed/missing `result` event; timeout-kill | **No** — fail closed | **Yes**, as fail-closed. |

**The load-bearing rule:** any **unclassifiable non-zero exit** is treated as *auth-class-or-worse* → **non-retryable, fail closed**. Nothing unknown ever falls through to "generic → retry."

- **invalid-model** also *is* a lock-validation failure — the lock claimed a model this seat can't serve. Note it masks both genuinely-invalid names and policy-blocks; you can't distinguish them, and you don't need to — both are correctly "not routable on this seat."
- **quota/rate** must not be guessed. Auto-retrying on a speculative `429`/`rate limit`/`quota` substring risks a retry storm burning premium requests if the match is a false positive. S2 must capture the real shape before *only that exact shape* is promoted to retryable (1 retry, capped exponential + jitter).
- **timeout-kill** is non-retryable by default: a killed-after-partial run may already have incurred a premium request (we saw `premiumRequests=1` on sub-5s calls), so retrying risks double-billing; and the hang may be a config error (`--allow-all-tools`) that retry won't fix.

**Safe now:** invalid-model (fully), generic/unknown-as-fail-closed (fully), the unknown-nonzero fallback (fully). **Needs S2 fake-spawner + captured real stderr:** the positive auth-class heuristic and the entire quota/rate class.

---

## 5. Breaker default — `transport.max_invocations_per_session`

**200.**

route() issues 1 generate + 1 verify = 2 invocations/task; retries are default-off (§4). 200 ≈ 100 tasks of gen+verify — generous for a large real batch, yet a firm circuit breaker before an orchestration loop drains the seat's premium quota. It counts **every spawn** (successes, failures, any future retries, re-probes), resets per session-process, and is framed as a **safety breaker, not a budget**. Under this profile it is the *primary* runaway-cost defense (see §6). Override upward with explicit intent.

---

## 6. Guard-exclusion list (gated on `billed_usage_unavailable: true`)

The CLI surfaces no dollar figure, no token price, no remaining balance — only a per-call `premiumRequests` integer weight and `outputTokens` (no input tokens). Exclusion is **data-driven** off the profile flag, and **every skip is logged loudly** ("guard X disabled under copilot-cli: billed usage unavailable") — never silent, so no one assumes cost protection that isn't there.

**Must skip** (cost-keyed, cannot function or would false-safe to 0):
- Dollar/spend-budget guards — inferred class: `CostBudgetGuard` / `SpendCeilingHeuristic` (no dollar figure to key on).
- Token-*cost* guards — inferred: `TokenBudgetGuard` (has `outputTokens` only, no input side, no price → misleading).
- Provider price-table estimators — inferred: `PriceTableEstimator` (per-1k-token pricing is inapplicable to a subscription transport).
- Remaining-quota / balance preflight guards — inferred: `QuotaPreflightGuard` (no balance is exposed).

**Stay active** (not cost-keyed):
- **Hard invocation breaker** (`max_invocations_per_session`, §5) — counts spawns, not dollars → active, and primary.
- Timeout guards (§3), retry/backoff policy (§4, default-deny), rate/concurrency limiters keyed on count/wall-clock.
- Lockfile-validation and provider-diversity guards (§1–2) — integrity guards, *more* important here.

**Optional new guard (recommended):** a **premium-request counter** keyed on `result.usage.premiumRequests` (a *count*, not a dollar figure) offering warn/stop at N — a count-keyed guard is permissible and partially restores the visibility lost by disabling the cost guards. Introduce it as a new guard; do not repurpose a disabled cost guard.

---

## Named gaps for the S1 go/no-go writeup

- **GAP-1 — auth-failure error shape unconfirmed.** Documented in `--help`, never reproduced (non-destructive S1 could not deauth the operator's live seat; empty `COPILOT_HOME` and a bad `COPILOT_GITHUB_TOKEN` both still succeeded). **Contained** by the unknown-nonzero ⇒ non-retryable/fail-closed fallback; the *positive* auth heuristic is unvalidated. **Close in S2** on a throwaway/deauthed seat.
- **GAP-2 — quota/rate-exhaustion shape unconfirmed.** No throttling in 5 sequential calls; concurrency untested; no balance ever surfaced. Shipped **non-retryable**. **Close in S2** (fake-spawner + real captured sample if obtainable).
- **GAP-3 — second-seat (target-team) attestation missing.** Operator's only account is personal/no-org — explicitly not the corporate-policy-locked representative seat. Diversity + provenance are confirmed on the operator seat (3 provider families); the gate's *second data point* is the operator's to run under arranged access. **Subsumes:** GitHub Models enterprise-availability unchecked (no org surface from this seat).

---

**GO-WITH-OPEN-ITEMS** — four of six gate points are met and the design fails closed on both open paths (auth-failure shape → unknown-nonzero non-retryable; second-seat diversity+provenance → same-provider-only fail-closed + seat-scoped lock); GAP-1/2/3 are contained open items for S2, not gate failures.