# Change Log — Set 084 (Verification Identity And Close Backstop)

> **What this set delivered:** the close of the identity/provenance holes
> behind the third live verification bypass (2026-07-06, a cold-start
> Copilot-seat walk), plus the combined Set 083 + 084 release. Four
> deliverables across three sessions.
>
> **F1 — identity is the underlying model.** New shared resolver
> `ai_router/orchestrator_identity.py`: the **effective provider** is derived
> by model-registry lookup on the orchestrator block's `model` field, never the
> free-text `provider` seat label. `start_session` **requires `--model` for
> multi-provider engines** (`github-copilot` / `copilot`) and validates any
> supplied model against the registry; a new omit-null `identityProvenance`
> field records `direct` (single-vendor) vs `asserted` (Copilot seat). The close
> gate, verifier selection, and `start_session` all consume the one helper
> (L-069-1); unresolvable identity fails closed everywhere.
>
> **F2 — dynamic verifier exclusion.** `verify_session` and
> `route(task_type="session-verification")` resolve the orchestrator's effective
> provider and pass it as a hard `exclude_providers` constraint; the static
> `session-verification:` model pin is demoted to a preference that can never
> override the exclusion. No different-provider verifier (e.g. a single-family
> Copilot catalog) → **`verification_unavailable`**, a hard blocked state (no
> verdict written), resolvable only by the operator-attested `--manual-verify`
> path — never a silent same-provider pass.
>
> **F3 — only stamped evidence corroborates.** `ai_router/verification_stamp.py`
> adds additive, null-on-historical-rows stamp fields to each
> `session-verification` metrics row (`source`, `evidence_sha256`, `template_id`
> + pinned normalized `template_sha256`, verifier/orchestrator identities,
> byte-exact artifact hash, package version, freshness binding, and the verdict
> re-derived from the hashed artifact bytes). The close gate accepts **only** a
> row with a valid, internally consistent stamp; a bare `route()` row (the
> incident-3 shape), a template mismatch, an edited artifact, a copied stamp, or
> a same-effective-provider verifier all fail closed with named reasons.
> Documented as **drift/affordance control, not cryptography.**
>
> **The close backstop (the structural move).** `ai_router/close_backstop.py`:
> on a Full-tier close with no valid stamped evidence, `close_session` **runs
> the verification itself, in-process**, through the same F1/F2/F3 machinery,
> then proceeds on VERIFIED / Minor-only, refuses with the findings on blocking
> `ISSUES_FOUND`, and blocks on `verification_unavailable` / double transport
> failure — never a pass. The policed actor no longer holds the last word.
> Respects `budget.yaml` (zero-budget passthrough), the two-attempt ladder, and
> the close lock (idempotent); `verify_session` pre-empts it; `--force` gets no
> special treatment (an unverified force-close receives the same in-process
> verification); `--manual-verify` is the attested bypass.
>
> **Instruction surfaces + the two releases (S3).** Every operative doc and the
> consumer-bootstrap template bundle now teach effective-provider identity, the
> `--model` requirement, dynamic exclusion, `verification_unavailable`, the
> stamp, and the backstop (`start-here.md`, `AGENTS.md` Copilot guidance,
> `getting-started.md`, `ai-led-session-workflow.md` Step 6/8,
> `close-out.md` incl. the `--manual-verify` attestation contents,
> `tier-model.md`, `quick-start.md`, `repository-reference.md`,
> `session-state-schema.md`; cold-start fixtures + extension dist bundle
> regenerated; stale-echo swept per L-065-1). A per-set UAT checklist reproduces
> incident 3 against the new machinery. The combined **`dabbler-ai-router`
> 0.29.0** (Sets 083 + 084 — 0.29.0 never reached PyPI in between) and the
> **extension 0.39.0** ship from this session.
>
> **Fixed in S3 (found by the out-of-band Copilot UAT):** a Windows
> drive-letter case-sensitivity bug class — a real seat passing
> `--session-set-dir c:\...` while git reports `C:\...` spuriously failed the
> stamp/gate path comparisons, forcing redundant backstop rounds. Every
> two-source path comparison in the close/verify path now `os.path.normcase`s
> both sides (no-op on POSIX); regression tests in `test_windows_path_case.py`.
>
> **Operator decisions encoded (do not re-litigate):** verification is mandatory
> on Full tier with no engine-facing skip (Set 083); asserted provenance is
> labeled, not hidden; the adversarial verifier framing is a hard constraint
> (L-069-2).
>
> **Documented residuals (decisions, not oversights):** `model` is
> self-reported (F1 makes the claim specific, auditable, registry-constrained;
> the compensating control is the `identityProvenance` label + the seat catalog
> reference); a determined orchestrator forging the full stamped artifact set is
> out of scope (metrics-vs-billing audit territory); a framework/CI-owned
> verifier runner is deferred; the Lightweight Mode-B cross-provider check still
> keys on the free-text `--provider` label (unchanged per non-goal — extending
> model-based identity there is a future set).

## Sessions

- **Session 1 — Identity and dynamic verifier exclusion (F1 + F2).** VERIFIED.
- **Session 2 — Stamped evidence and the close backstop (F3 + structural).**
  VERIFIED; the close ran the backstop live (nine rounds) — round 1 refused this
  set's own close with 3 Major findings, the live proof the framework holds the
  last word.
- **Session 3 — Instruction surfaces, incident-3 reproduction UAT, and the two
  releases.** VERIFIED. The out-of-band Copilot UAT confirmed the machinery
  end-to-end and surfaced the Windows path-case bug (fixed). Router 0.29.0 +
  extension 0.39.0 published on operator authorization.
