# Verifier Pre-Close Review Scope Spec

> **Purpose:** Retire a **recurring verifier category error** that has now
> blocked two consecutive closes (Sets 088 and 089), each requiring an operator
> override. When `verify_session` runs (Step 6, **before** close-out), the
> adversarial verifier reads the spec's close-out lines ("**Ends with:**
> `close_session` succeeded / `change-log.md` / `disposition.json` / committed +
> pushed / status `complete`") as **due deliverables**, sees they are absent —
> which they always are at verify time, because close-out is Step 8+ — and
> raises a **Major "completeness"** blocker. It also treats the review's own
> **prior-round** verification artifacts (`sN-verification*.md`, `sN-issues*.json`)
> as reviewable/contradictory, flagging a superseded round-1 record as "stale /
> false" — though those are immutable, append-only raw records. Both are
> **category errors, not defects**, and they fire reliably on small / low-surface
> sets. This set teaches the verifier its **review scope** — verify the WORK, not
> the not-yet-existent close-out state or the review's own machinery — **without**
> weakening substantive review. Source: the recurring finding documented in
> `088`/`089` `s1-adjudication.md`; the ss4 doc's deferred "Related: prompt-
> template" territory.
> **Created:** 2026-07-10
> **Session Set:** `docs/session-sets/090-verifier-preclose-review-scope/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false            # Prompt-template + a small framing line; no UI surface.
requiresE2E: false            # Internal verification machinery; unit-testable.
uatScope: none
pathAwareCritique: none       # Single-surface change; the mandatory cross-provider verify_session (dogfooded here) is the review.
```

> Rationale: `tier: full` — verification-critical, and this set **dogfoods** the
> fix: its own `verify_session` run is the behavioral test that the circular
> finding no longer fires. UAT/E2E off (no UI); `pathAwareCritique: none` (single
> surface).

---

## Project Overview

### Root cause
`ai_router/prompt-templates/verification.md` — the canonical adversarial
verification prompt — scopes the verifier to Correctness / Completeness / False-
positives but never tells it that **the session is verified mid-flight, before
close-out**. So:
- **Completeness criterion (#2)** treats the spec's close-out "Ends with" lines
  as unmet deliverables. They cannot be met at Step 6 — `close_session`,
  `change-log.md`, the final disposition verdict, committed/pushed/`complete`
  state, and the ledger's close events are all created **after** verification.
- The verifier grades the set's own **prior-round** verification artifacts as
  work-under-review, calling a round-1 record "stale/false" when round 2
  supersedes it — but verification artifacts are **immutable append-only raw
  records** (constitution); superseding is by design, not falsification.

### Fix (surgical — do NOT weaken substantive review)
Add a **"Review scope"** section to `verification.md` that carves out exactly
two always-not-work categories, and reinforce the Completeness criterion with a
one-line pointer. Thread a matching **pre-close context note** into
`build_prompt` so the scope is present in the assembled prompt even independent
of the template file. The carve-out is precise: a genuinely missing **spec-
promised code / test / doc deliverable** that is due at *this* session's work
stays fully in scope — only (a) the not-yet-created close-out lifecycle
artifacts/state and (b) the review's own verification artifacts are out of
scope.

### Acceptance
1. `verification.md` and the assembled `build_prompt` output carry the scope
   guidance (regression-guard tests).
2. Full existing suite green (mind the no-`copilot` + drift-guard CI conditions).
3. **Dogfood:** this set's own `verify_session` run does **not** emit the
   circular "set-not-closed-at-verify-time" finding, so 090 closes **without**
   an operator override for that finding. (If a genuine substantive finding
   arises, that's the loop working — fix and re-verify.)

### Non-goals
- **Not** relaxing adversarial rigor, materiality, severity anchoring, or the
  anti-laundering escalation — substantive Correctness/Completeness/False-
  positive review is untouched.
- **Not** the separate "require a severity on every finding" idea (the template
  already requires severity and routes non-blocking observations through NITS).
- **Not** a router version bump / publish (operator-gated).

---

## Sessions

### Session 1 of 1: Teach the verifier its pre-close review scope

**Steps:**
1. Register (`start_session`); read this spec + the 088/089 `s1-adjudication.md`
   records.
2. Add a **"### Review scope — verify the WORK, not the close-out"** section to
   `ai_router/prompt-templates/verification.md`: (a) the session is reviewed at
   Step 6, **before** close-out; the absence of close-out lifecycle
   artifacts/state (`close_session` success, `change-log.md`, the final
   disposition verdict, committed/pushed/`complete` state, ledger close events)
   is **never** a defect; verify the work against the spec's substantive intent.
   (b) The set's own `sN-verification*.md` / `sN-issues*.json` are immutable
   append-only records of THIS review, not deliverables under review; a later
   round superseding an earlier one is by design. Preserve the rule that a
   genuinely-missing spec-promised code/test/doc deliverable IS in scope.
3. Reinforce the Completeness criterion (#2) with a one-line pointer to the
   scope carve-out (so the two are read together).
4. Thread a **pre-close context note** into `build_prompt` (verify_session.py)
   so the assembled prompt states the mid-flight/pre-close context regardless of
   the template file.
5. Tests: assert `load_verification_template()` / the built prompt carry the
   scope guidance (regression guard); confirm existing verify_session tests stay
   green.
6. Build + **full pytest suite** green (no-`copilot` + drift-guard conditions).
7. Verify (mandatory `verify_session`) — **the dogfood**. Handle any genuine
   finding by severity; the circular finding should be gone.
8. Author `disposition.json`; commit **and** push; `close_session`; notify;
   Step 9 review; end-of-set `change-log.md`.

**Creates:** the "Review scope" template section; scope-guidance regression
tests; `change-log.md`.
**Touches:** `ai_router/prompt-templates/verification.md`,
`ai_router/verify_session.py` (`build_prompt` context note),
`ai_router/tests/test_verify_session.py` (and/or `test_verification_framing.py`),
`ai_router/CHANGELOG.md`.
**Ends with:** the verifier is scoped to pre-close work (close-out state and the
review's own artifacts are explicitly out of scope) with substantive rigor
intact; regression tests assert the guidance is present; full suite green; this
set's own verification does not raise the circular finding; cross-provider
VERIFIED (or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** review-scope-section-added, completeness-criterion-reinforced,
build-prompt-context-note, scope-guidance-tested, suite-green, set-closed

---

## End-of-set deliverables

- A "Review scope" section in `verification.md` carving out pre-close lifecycle
  state and the review's own artifacts, with substantive review preserved.
- A pre-close context note in `build_prompt`.
- Regression tests asserting the scope guidance is present in the template /
  assembled prompt.
- Full suite green; `CHANGELOG.md` entry; `change-log.md`; the standard
  per-session artifacts. Dogfood evidence: 090's own verification free of the
  circular finding.
