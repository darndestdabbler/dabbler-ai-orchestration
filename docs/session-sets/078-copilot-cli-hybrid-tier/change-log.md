# Change Log — Set 078 (Copilot CLI Hybrid Tier)

> **What this set delivered.** The Full tier gains a subscription-billed
> **seat profile**: a new `transport.profile: copilot-cli` in
> `router-config.yaml` dispatches every `route()`/`verify()` call through the
> GitHub Copilot CLI's headless mode instead of a direct provider HTTPS API,
> so a shop whose staff hold only a Copilot seat (no `DABBLER_*` provider key
> possible under corporate policy) gets an *indirect* Full tier — work
> generated under one underlying model provider, independently verified
> under another, inside one subscription. Presented honestly as
> **Full-compatible with explicitly degraded guarantees**, never
> byte-equivalent Full: provider provenance is **asserted** (a name-prefix
> heuristic over a seat-local catalog lockfile — the CLI has no
> discovery/list-models command or first-party provenance field), and seat
> billing is **not locally meterable** (a per-call count is the only usage
> signal; cost-keyed guards are excluded; a hard, non-cost-keyed invocation
> circuit breaker caps burn instead).
>
> **Non-goals (unchanged):** no use of the internal `api.githubcopilot.com`
> completions endpoint; no extension/UI for profile selection (config-file
> activation only); no GitHub Models adapter built in this set; no changes
> to the Lightweight tier or its verification machinery.
>
> **Design background:**
> [`spec.md`](spec.md) (folds two adversarial pre-authoring critiques,
> `planning-critique-1-planning.md` and `planning-critique-2-architecture.md`,
> plus a recheck, `planning-critique-3-recheck.md`).
> **Release:** `dabbler-ai-router` **0.28.0** — published 2026-07-04, after
> Set 077's `v0.27.0` (see *Release status* below).

---

## Session 1 of 5 — CLI contract discovery and design lock (GO-WITH-OPEN-ITEMS)

**Status:** CLOSED, ISSUES_FOUND (recorded, operator-overridden).

Pinned the installed GitHub Copilot CLI contract (v1.0.62, silently
auto-updated to v1.0.68 mid-probe — surfacing the design-lock requirement
that every invocation pass `--no-auto-update`) against the spec's six-point
go/no-go gate, on the **operator's personal seat only**. Gate points 1, 2, 4,
5 passed outright; point 3 (provenance) passed via a weaker-than-envisioned
mechanism (a model-name-prefix heuristic, since the CLI has no first-party
provenance field); point 6 (concurrency) shipped the spec's own conservative
default (serialized calls) rather than being proven. Two items were left
open rather than failed (auth-failure error shape, quota/rate-exhaustion
shape — both contained by conservative non-retryable defaults); a third — a
representative target-team seat and GitHub Models enterprise-availability
check — was never completed, since the operator's only available account is
personal with no organizations. **Operator override (2026-07-04):** put to
the operator directly after cross-provider verification flagged the go/no-go
verdict as self-authorized rather than sanctioned by the spec's own binary
gate language, the operator gave explicit, recorded authority to proceed
without the two-seat evidence: *"We don't need that artificial hurdle here.
I am giving authority to override any and all requirements by AI engines for
proceeding to a next stage."* Sessions 2–5 proceeded on single-seat evidence;
the two-seat/GitHub-Models check is dropped as a gate, not merely deferred.
Also locked the lockfile schema, role/alias mapping, timeout defaults
(10s/30s/300s), retryable-error classes, breaker default (200), and the
guard-exclusion list via routed architecture adjudication.

Full detail: [`s1-cli-contract.md`](s1-cli-contract.md),
[`s1-design-adjudication.md`](s1-design-adjudication.md),
[`s1-issues.json`](s1-issues.json), [`s1-verification.md`](s1-verification.md).

---

## Session 2 of 5 — Transport layer and catalog lockfile (VERIFIED)

**Status:** CLOSED, VERIFIED (gpt-5.4 cross-provider, 5 rounds).

Shipped `ai_router/cli_transport.py` (the `Transport` interface, the
invocation state machine against an injected spawner, `TransportResult`) and
`ai_router/copilot_catalog.py` (catalog dataclasses, a hand-rolled restricted
TOML reader/writer, `validate_catalog`'s four fail-closed rules,
`discover_catalog` + `--refresh`). `router-config.yaml` gained
`transport.profile` (default `api`) and the `transports.copilot-cli` block.
A Layer-1 fake-spawner suite covers the full state machine. Code review
(auto-verified) found and fixed 7 findings in-session, including a Major
where the `copilot-cli` profile still required provider API keys — defeating
its own "no keys needed" premise. Five rounds of cross-provider verification
each found one genuine, distinct, reproducible defect (a timing/config-gate
cluster, then three progressively narrower field-shape gaps in the same
success-path parser — `content` → `outputTokens` → nested
`usage.premiumRequests`) before converging VERIFIED. Final suite: 2432
passed, 5 skipped, 1 pre-existing unrelated failure.

Full detail in the S2 section of [`session-state.json`](session-state.json)
history and [`spec.md`](spec.md) § Session 2 result.

---

## Session 3 of 5 — Routing integration, verification provenance, honest accounting (VERIFIED)

**Status:** CLOSED, VERIFIED (gpt-5.4 cross-provider, 4 rounds).

Wired `route()`/`verify()` to the `copilot-cli` profile as a fully separate
code path from the untouched `api`-profile body: catalog-role resolution,
the verifier provenance rule (`cross_role_provider_diversity`, fail-closed
to a non-blocking `verification_unavailable`), the hard invocation breaker
(lock-guarded), cost-keyed guard exclusions, and honest metrics/cost-report
fields. Code review + 4 verification rounds found and fixed an inverted
cost-guard default (found twice, independently, by two different reviewing
passes), a same-provider exclusion trusting `model_name` instead of the
canonical `model_id`, and a name-prefix-heuristic fallback that bypassed the
catalog-confirmed safety check — removed entirely rather than patched. One
Round-1 Major (a suspected missing verification-template load) was
confirmed **false** with evidence rather than deflected. A known, disclosed
limitation was carried forward: the invocation breaker is scoped to one
Python process, not a multi-process ai-led-workflow session. Final suite:
2478 passed, 5 skipped, 1 pre-existing unrelated failure.

---

## Session 4 of 5 — Live dogfood and UAT (VERIFIED)

**Status:** CLOSED, VERIFIED (gpt-5.4 cross-provider).

Live dogfood against the **real** Copilot CLI (v1.0.68) surfaced and fixed
three defects the S2/S3 fake-spawner suite could not see because it modeled
the wrong wire shape: (1) the lockfile's TOML writer choked on the real
CLI's multi-line `--version` banner; (2) `_success_result()` read fields
directly off the `assistant.message` envelope, but the real CLI nests them
under a `data` key — every real dispatch silently returned `content=""` as a
false success; (3) `Popen(text=True)` with no explicit encoding decoded the
real CLI's UTF-8 JSONL as `cp1252` on Windows, crashing the reader thread on
ordinary prose (an em dash) and manifesting as a misleading ~300s
"total-timeout" instead of a local decode bug. All three fixed and
regression-tested. A routed code-review pass found 6 further findings (2
fixed, 3 adjudicated-no-fix with recorded reasoning, 1 discarded as a
confirmed fabrication). The operator authored and walked a 7-item ad-hoc UAT
checklist on their own seat and attested all 7 PASS. Final suite: 2482
passed, 5 skipped, 1 pre-existing unrelated failure.

Full detail: [`s4-code-review.md`](s4-code-review.md),
[`s4-dogfood-evidence.json`](s4-dogfood-evidence.json),
[`s4-issues.json`](s4-issues.json), [`s4-verification.md`](s4-verification.md),
[`078-copilot-cli-hybrid-tier-uat-checklist.json`](078-copilot-cli-hybrid-tier-uat-checklist.json).

---

## Session 5 of 5 — Docs, path-aware critique, and release preparation (VERIFIED)

**Status:** CLOSED, VERIFIED (round-2 convergence). Final session of the set.

### Delivered

- **Documentation** across five surfaces: a new *"The Full tier seat-profile
  option"* clause in [`docs/concepts/tier-model.md`](../../concepts/tier-model.md);
  a pointer in [`docs/ai-led-session-workflow.md`](../../ai-led-session-workflow.md)
  (*AI Router Details* → *Importing the Router*); a consumer engine-tail
  pointer in
  [`docs/templates/consumer-bootstrap/engine-file.agents-tail.md`](../../templates/consumer-bootstrap/engine-file.agents-tail.md);
  a version-walk entry + release-status row in
  [`docs/repository-reference.md`](../../repository-reference.md); and a
  dated `[0.28.0]` section with a config-only **Rollback** recipe in
  [`ai_router/CHANGELOG.md`](../../../ai_router/CHANGELOG.md).
- **Required end-of-set path-aware critique** (`docs/session-sets/078-copilot-cli-hybrid-tier/path-aware-critique.json`,
  >= 2 distinct providers per schema), run via the first-party automated
  producer (`python -m ai_router.pull_critique`, default openai+google
  providers, natural full sandbox). Both providers returned `ISSUES_FOUND`:
  - **openai/gpt-5.4** found a real Major: an `assistant.message` event with
    **no `data` key at all** defaulted to an empty-dict success instead of
    failing closed — the same silent-false-success class Session 4 fixed for
    the wrong-shaped-`data` case, one level up. This exact question had been
    raised once before as a Suggestion in Session 4's own code review and
    adjudicated no-fix at the time; a second independent reviewing surface
    catching the identical gap was treated as superseding that earlier
    adjudication rather than deferring again. **Fixed** in
    `ai_router/cli_transport.py` (the `data` key must be present before
    being treated as a payload dict) with the regression test renamed and
    flipped to assert the malformed classification.
  - **google/gemini-2.5-pro** returned no new issue against this session's
    work — it independently re-confirmed a Session-4 code-review fabrication
    (a cited method/attribute that does not exist in the file) that Session
    4 had already caught and discarded. Recorded as `no_change_needed`.
  - Full adjudication: [`s5-issues.json`](s5-issues.json).
- **Release-ordering check.** Confirmed via `git tag -l` that neither
  `v0.27.0` nor `v0.28.0` exists yet and that Set 077 (session-state.json)
  is still `in-progress` (Session 6 of 6). Per the spec's own invariant
  (`v0.28.0` never tagged before 077's `v0.27.0`), this session **prepares**
  the release (`pyproject.toml` bumped to `0.28.0`, dated CHANGELOG section,
  repository-reference entries) but pushes **no tag** and claims **no
  publish date/run-id** — both docs explicitly record the required
  `v0.27.0`-then-`v0.28.0` order for the operator. This mirrors how Sets 058
  and 063 both closed their own session-set `status: "complete"` while their
  release entries still read "publish pending the operator tag push" — set
  closure and PyPI/Marketplace publish are decoupled by design.
- **End-of-session cross-provider verification** (routed, gpt-5.4, 2
  rounds). Round 1 (`ISSUES_FOUND`) found 4 real documentation-accuracy
  issues: a CHANGELOG "Fixed" bullet describing only the S4 behavior (not
  the S5 refinement); a rollback recipe recommending `pip install
  dabbler-ai-router==0.27.0` without noting `0.27.0` is itself still
  publish-pending; an engine-tail pointer phrase ("full Full-tier
  guarantees") that read as overclaiming against the rest of the docs' own
  degraded-guarantee framing; and an absolute "No extension changes" claim
  that didn't account for the recompiled extension dist mirror. All 4
  fixed. Round 2 confirmed **VERIFIED** — all 4 resolved, no new issues.
  Full detail: [`s5-verification.md`](s5-verification.md),
  [`s5-verification-round-2.md`](s5-verification-round-2.md).
- **Self-caught build-sync defect.** The full pytest suite's `drift_guard`
  check flagged that editing the canonical `engine-file.agents-tail.md`
  template desynced the extension's compiled
  `tools/dabbler-ai-orchestration/dist/templates/consumer-bootstrap` mirror
  — fixed by running `npm run compile` (twice, once per template edit) to
  recopy the bundle.
- **Final suite:** 2482 passed, 5 skipped, the same single pre-existing
  `test_real_repo_passes_all_drift_checks` failure throughout this entire
  set (both Set 077 and Set 078 simultaneously `in-progress`, by explicit
  operator direction) — expected to clear once this close lands and only
  Set 077 remains in-progress.

Full detail in the S5 `disposition.json`, `s5-verification.md`,
`s5-verification-round-2.md`, `s5-issues.json`, and `path-aware-critique.json`
(saved raw, never edited).

---

## Release status (as of this close)

**Published.** `dabbler-ai-router` `0.28.0` shipped to PyPI 2026-07-04 (tag
`v0.28.0`, release.yml run
[28718741271](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718741271),
tagged commit `a391f61`), after Set 077's `v0.27.0` tag per the
release-ordering invariant — Set 077 Session 6 completed its UAT re-walk
(14/14, clean) earlier the same day, and both sets' releases were pushed
together in sequence: `v0.27.0` → `vsix-v0.34.0` → `v0.28.0`. See
`docs/repository-reference.md` → *Current release status* / *Recent
version walk* for the live pointer and full run-id evidence.

A real gap surfaced after this publish: the `copilot-cli` seat profile has
no representation anywhere in the Getting Started onboarding flow (a
Copilot-locked operator has no way to discover it exists short of reading
`docs/concepts/tier-model.md`). This was an explicit non-goal of this set
("no extension/UI for profile selection" above) but is now planned as
follow-on scope in a new session set, alongside simplifying the Lightweight
verification-mode radio copy.

---

## End-of-set deliverables (all met except the pending publish, by design)

- Copilot CLI transport layer (profile-selected at startup; injected-spawner-
  tested state machine; fail-loud probes; no API fallback; no `DABBLER_*`
  reads) with the seat-local catalog lockfile + discovery command; the `api`
  profile regression-suite-identical.
- `route()` + cross-provider verification on one seat across two asserted
  underlying providers, failing closed to "verification unavailable" when
  provenance cannot be asserted.
- Honest seat accounting: `local_invocations`/`attempts`/
  `billed_usage_unavailable` metrics (additive-schema back-compat tested),
  cost-guard exclusions with recorded reasons, hard invocation circuit
  breaker.
- Pinned single-seat CLI contract (two-seat check dropped by explicit
  operator override) + GitHub Models availability note (unchecked, same
  override); tier-model SSoT seat-profile clause with explicit
  degraded-guarantee caveats; UAT attestation incl. induced failures;
  required, multi-provider path-aware critique (with a real Major found and
  fixed); router `0.28.0` version-bumped and documented with a named
  rollback recipe, **publish pending the operator's sequenced `v0.27.0` then
  `v0.28.0` tag pushes**.
