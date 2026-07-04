# The Dabbler tier model — Full vs. Lightweight

> **This is the single source of truth (SSoT) for the adoption tier model.**
> README, the Getting Started form, the consumer-repo engine files
> (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`), and
> `docs/spec-md-schema.md` all **point here** rather than restating the model.
> If you are about to explain "what Lightweight means" anywhere else, link to
> this doc instead of paraphrasing it — paraphrases drift, and the drift this
> doc exists to kill cost a real operator a stuck afternoon (see *Why this doc
> exists*, below).
>
> Grounded in the code: [`ai_router/runtime_mode.py`](../../ai_router/runtime_mode.py)
> is the authority for how the tier is resolved at runtime. Where this prose
> and that module disagree, the module wins and this doc is the bug.

---

## The one-sentence model

**The only thing the tier changes is the AI router — i.e. whether the
project makes external, metered LLM API calls. `tier: lightweight` flips
`--no-router` (zero API calls); everything else about a Dabbler project is
identical across both tiers.**

Said the other way, and worth memorizing because it is the exact fact four
setup surfaces used to get wrong:

> **Lightweight is router-off, not Python-off.**

Both tiers install Python and `dabbler-ai-router`, run `start_session` and
`close_session`, use the blessed state-file writer, derive session state the
same way, and pass through the same close-out gate. The router is the *only*
moving part the tier switches off.

---

## What is the same on both tiers

Everything in this list is identical whether the project is `full` or
`lightweight`:

| Surface | Both tiers |
|---|---|
| **Python environment** | A `.venv` and `pip install dabbler-ai-router`. |
| **Lifecycle CLIs** | `python -m ai_router.start_session` / `close_session` at every session boundary. |
| **State file** | `session-state.json` (schemaVersion 4), written only by the blessed writer; never hand-edited on a path that has the CLI. |
| **State derivation** | The same `completedSessions[]` / events-ledger derivation and the same seven-state model. |
| **Close-out gate** | The same `close_session` gate (disposition required, `change-log.md` on the final session, idempotent writes). |
| **Engine files** | All three — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — because the next session's orchestrator may be a different engine. |
| **Cold-start operative doc** | `docs/dabbler/start-here.md` (generated, never hand-edited). |
| **Spec shape** | One canonical `spec.md` template (schemaVersion 4, `NNN-` slug, required `tier` + `verificationMode`). |
| **Session Set Explorer** | Same activity-bar view, same bucket transitions, same per-session orchestrator block. |
| **Folder layout** | Same `docs/session-sets/<slug>/` artifact set. |

If you find a setup step, doc, or setup-form branch that asks a Lightweight
project to *skip* one of these, that is the drift — fix it against this
table.

---

## What the tier changes (the only divergence)

There is exactly **one** intentional divergence, and it has two faces — one
at setup time, one at verification time.

### 1. Setup: router config is Full-only

- **Full** writes router config (`ai_router/router-config.yaml`, and a
  `budget.yaml` if the operator sets a verification budget).
- **Lightweight** writes **no** router config. The single declarative switch
  is `tier: lightweight` in the active `spec.md`. That one field is what
  `runtime_mode.py` reads to enter `--no-router` mode.

Everything else the scaffolder writes (the `.venv`, the package install, the
three engine files, `start-here.md`, the templated `spec.md`) is identical.

### 2. Verification: who/what reviews the session's work

- **Full** runs the router's automatic, rule-based **cross-provider
  verification** at the end of each session (a model from a *different*
  provider reviews the work; the verdict is recorded; issues are remediated).
- **Lightweight** makes **zero metered API calls**, so the router cannot
  auto-verify. Verification on Lightweight is **per-set, not per-session**,
  and follows the `verificationMode` chosen once at set start (Set 057;
  a completed Mode-A set can opt in later through the sanctioned A→B
  blessed writer `python -m ai_router.change_verification_mode`,
  Set 062):
  - **`out-of-band-or-none`** (the default) — the operator pastes a copyable
    review prompt into a *different* path-aware AI assistant and records the
    verdict by hand in `external-verification.md`, **or** opts out entirely
    for explicit reasons. Strictly opt-in cross-provider review.
  - **`dedicated-sessions`** — a structured **typed-session** flow: a blessed
    verification session run on a different engine, an optional remediation
    session, a bounded re-verification loop, and a content-aware close-out
    gate that confirms a different-engine verification ran.

  See [`docs/ai-led-session-workflow.md`](../ai-led-session-workflow.md)
  → *Lightweight tier — verification* for the full flow, and
  [`docs/spec-md-schema.md`](../spec-md-schema.md) for where `verificationMode`
  is declared and how it is recorded.

That is the whole divergence. Two faces, one root cause: the router is off.

---

## How the tier is resolved at runtime

`runtime_mode.py` resolves `--no-router` mode **once at process start** from
four precedence-ordered sources (highest wins):

1. **CLI flag `--no-router`** — one-off override on any router CLI.
2. **Env var `DABBLER_NO_ROUTER`** — truthy values `1` / `true` / `yes` /
   `on` (case-insensitive); a CI- or shell-session-wide default.
3. **`tier: lightweight` in the active `spec.md`** — the declarative,
   per-set default. **This is the normal switch.**
4. **Default** — full mode (router enabled).

When a higher-precedence source overrides a lower one (for example,
`--no-router` on a `tier: full` spec), the resolver logs an informational
line naming the source that won. There is no refusal — explicit overrides
always win.

Two consequences worth internalizing:

- **`tier:` lives in `spec.md`, and nowhere else is authoritative.** No new
  per-tier state is persisted. The runtime reads the field; that is the
  mechanism.
- Because the tier is read per-set from the active spec, a single repo can
  hold Full sets and Lightweight sets side by side. The tier is a property of
  the *set*, not the *repo*.

---

## Why this doc exists (the drift it kills)

A human scaffolded a new **Lightweight** consumer repo and was left stuck: no
engine files, no `.venv`, generated specs missing the `tier:` field, and no
clear next step. The root cause was a **stale, pre-Set-048 tier model** that
four setup surfaces still encoded:

<!-- drift-guard:allow-begin (this blockquote quotes the banned framing in order to ban it) -->
> ❌ "Lightweight = no Python, no venv, no close-out machinery, no
> cross-provider verification — just a docs/Explorer-only workflow."
<!-- drift-guard:allow-end -->

That framing is **wrong** and contradicts the implemented `--no-router` mode.
The pure-docs Lightweight tier was an illusion that the Set 048 runtime had
already replaced. This SSoT is the corrected model; the four surfaces
(`adoption-bootstrap.md` — since retired to a deprecation stub in Set 063 —
the Getting Started form, `sessionGenPrompt`, `gitScaffold`) now
point here, and a CI guard forbids the stale phrasing from reappearing in any
doc.

**Banned framing — never write any of these about Lightweight:**

<!-- drift-guard:allow-begin (this list IS the banned-phrase catalogue the CI guard enforces) -->
- "no Python" / "no `.venv`" / "no venv"
- "no `ai_router` / no PyPI dependency"
- "no close-out" / "no `start_session` / `close_session`"
- "docs-only" / "Explorer-only" as the *definition* of the tier
<!-- drift-guard:allow-end -->

**Correct framing — always:** *router-off, not Python-off; `tier:` is the
single switch; both tiers share the Python lifecycle.*

> A CI drift guard (`ai_router/scripts/drift_guard.py`, Set 058 S3) scans all
> live guidance docs for the banned phrasing above and fails the build if it
> reappears outside an explicit `<!-- drift-guard:allow-begin/end -->` region.

---

## Choosing a tier (one question)

Pick the tier by answering one question: **do you want this project's
sessions verified by an automatic, metered, cross-provider API call at the
end of each session?**

- **Yes, and I'm fine paying per-call for it** → **Full.** You also get
  cost-minded routing of reasoning tasks and automatic metrics.
- **No — I'd rather make zero metered calls and verify out-of-band (or via a
  dedicated different-engine verification session), or not at all** →
  **Lightweight.**

Everything else is the same. You can move a set from Lightweight to Full by
flipping `tier:` in its `spec.md` and adding router config; nothing else has
to change.

---

## The Full tier seat-profile option (Copilot-only shops)

For organizations that cannot hold direct provider API keys (`DABBLER_*` env
vars) under corporate policy but do have GitHub Copilot subscriptions, Full
offers a **seat profile** (Set 078): `route()`/`verify()` keep every part of
Full — task typing, tiering, cross-provider verification, metrics — but
dispatch each call through the GitHub Copilot CLI's headless mode instead of
a direct provider HTTPS API. This gives a Copilot-seat-only shop an
*indirect* Full tier: work generated under one underlying model provider,
independently verified under a different one, inside a single subscription.

This is presented honestly as **Full-compatible with explicitly degraded
guarantees** — never as byte-equivalent to the direct-API Full tier:

- **Provider provenance is asserted, not confirmed.** The Copilot CLI has no
  model-discovery command or first-party `provider` field, so provenance is
  derived from a model-name-prefix heuristic (`claude-*` / `gpt-*` /
  `gemini-*`) recorded in a seat-local catalog, not read off an API.
- **Seat billing is not locally meterable.** The only usage signal is a
  per-call count (`result.usage.premiumRequests`) — no token cost, no dollar
  figure, no remaining balance. Cost-keyed guards (dollar/token budgets,
  price-table estimators, quota/balance preflights) are excluded under this
  profile and the skip is always logged; a hard, non-cost-keyed circuit
  breaker (`transport.max_invocations_per_session`, default 200) caps seat
  burn instead.

**Activation:** set `transport.profile: copilot-cli` in
`ai_router/router-config.yaml` (default is `api`, the unchanged direct-HTTPS
path). Each seat must then build its own local model catalog — run `python -m
ai_router.copilot_catalog --refresh` to discover the seat's dispatchable
models and write `ai_router/copilot-catalog.lock`; every routed call
validates the lockfile against the live CLI and fails closed on version
drift, missing provenance, or fewer than two distinct providers among
confirmed entries.

**Evidence basis:** validated end-to-end (design lock, live dogfood, UAT
attestation) on a single operator's personal Copilot seat. A second,
representative target-team seat and a GitHub Models enterprise-availability
check were never completed and were dropped as a gate requirement by an
explicit, recorded operator override rather than proven — see
`docs/session-sets/078-copilot-cli-hybrid-tier/s1-cli-contract.md`.

**Choose this profile when:** staff are corporate-policy-locked to Copilot
seats only, no `DABBLER_*` key is possible, and Full's cross-provider
verification guarantee (even in its degraded, seat-asserted form) is worth
more than the honest gaps above. Otherwise, a keyed shop should use the
direct-API `api` profile (the default), and a Copilot-locked shop that does
not need Full's guarantees should consider Lightweight's Mode B
(`dedicated-sessions`) provider-picker pattern instead.

---

## See also

- [`ai_router/runtime_mode.py`](../../ai_router/runtime_mode.py) — the
  resolver; the authority for tier resolution.
- [`docs/ai-led-session-workflow.md`](../ai-led-session-workflow.md) — the
  execution mechanics, including the Lightweight per-set verification flow.
- [`docs/spec-md-schema.md`](../spec-md-schema.md) — where `tier` and
  `verificationMode` are declared in a spec's configuration block.
- [`docs/adoption-bootstrap.md`](../adoption-bootstrap.md) — the retired
  conversational setup flow (Set 063); now a deprecation stub pointing at
  the extension's Getting Started form.
- [`docs/templates/consumer-bootstrap/`](../templates/consumer-bootstrap/) —
  the canonical templates every creation path renders.
- [`ai_router/cli_transport.py`](../../ai_router/cli_transport.py) and
  [`ai_router/copilot_catalog.py`](../../ai_router/copilot_catalog.py) — the
  Copilot CLI seat-profile transport and catalog-discovery implementation
  (Set 078).
