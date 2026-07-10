# External Verification-Loop Remediation — Documentation Spec

> **Purpose:** Formally capture, inside the session-set system, work that
> was necessarily done **out of band** — the July 2026 repair of the
> verification loop (a "runaway train" that refused to exit on Minor-only
> findings and whose anti-fabrication gates were bypassable) and the
> **salvage of the cancelled Set 086**. The repair could not run through
> this framework's own verification loop, because that loop was the thing
> under repair (you cannot verify the verification code with itself). The
> fixes already landed on `master` and shipped as `dabbler-ai-router`
> **0.32.0**; the durable narrative lives in
> [`docs/verification-loop-remediation-2026-07.md`](../../verification-loop-remediation-2026-07.md).
> This single-session set exists so that neither the **cancelled Set 086**
> nor the **external remediation** is lost from the project record — it
> routes that document for an independent-provider feedback pass, makes it
> discoverable, and closes through the normal gate.
> **Created:** 2026-07-10
> **Session Set:** `docs/session-sets/088-external-remediation-documentation/`
> **Prerequisite:** None (documents the **cancelled** Set 086 and the
> out-of-band remediation; Set 086 cannot be a completable prerequisite)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false            # Doc-only capture; no UI or behavioral surface.
requiresE2E: false            # No shipping-code change in this set.
uatScope: none
pathAwareCritique: none       # A single documentation artifact; no cross-surface consistency contract to guard.
```

> Rationale: `tier: full` — canonical repo; even a documentation capture
> gets a real different-provider feedback pass (the operator's explicit
> ask). All optional gates are off: this set changes **only documentation**
> — it neither ships code nor touches a UI surface, so UAT/E2E/path-aware
> critique would be pure overhead. The remediation code itself was already
> reviewed cross-provider and is green in the suite (0.32.0); this set does
> not re-verify that code, it captures the record.

---

## Project Overview

### What already happened (context; not redone here)

- **The verification loop was repaired out of band** (separate workspace,
  branches `fix/critical-eval-ss1..ss3`, manual cross-provider review at
  each step). Fixes: a shared `is_blocking_issue()` predicate so a
  Minor-only round exits instead of churning; removal of the `VERIFIED`
  short-circuit; the close's severity decision rebound to the **hash-bound**
  raw artifact (so an edited envelope cannot launder a Major); untracked-
  content coverage, truncation-as-invalid-evidence, and latest-attempt-
  governs anti-rollback. Governing principle: **the builder cannot release
  itself** — release needs different-provider evidence and is computed by
  the framework, never asserted by the agent.
- **Set 086 was formally cancelled** (a casualty of the same runaway loop)
  but its code had landed on `master`; the remediation salvaged it (fixed
  its red CI — four `start_session` tests missing the copilot-preflight
  stub — so Set 086's auth-preflight, close fail-loud, verdict-token
  validation, and transport diagnostics **ship inside 0.32.0**).

### Scope of THIS set

1. Treat [`docs/verification-loop-remediation-2026-07.md`](../../verification-loop-remediation-2026-07.md)
   as the primary artifact. Route it through
   `route(task_type="documentation")` (and/or `analysis`) for an
   **independent-provider feedback pass**; incorporate only **material**
   corrections (factual accuracy, missing linkage, clarity) — do not
   re-open the closed engineering decisions.
2. Make the record **discoverable**: link the remediation doc from the
   shared operational record (`docs/repository-reference.md`) and, where a
   durable lesson is warranted, cite it into `docs/planning/lessons-learned.md`
   (the loop-exit + builder-cannot-release-itself principle).
3. Confirm the Set 086 linkage is captured (the cancelled set's salvaged
   contribution to 0.32.0) so the cancellation does not erase its work from
   the project narrative.

### Non-goals

- **Not** re-verifying or re-opening the 0.32.0 remediation code (already
  cross-provider reviewed and green; re-running the loop here would repeat
  the very over-processing being documented).
- **Not** reviving Set 086 as an active set (it is cancelled; its code
  shipped). Any genuinely-unshipped remainder is noted, not rebuilt.
- **Not** a code change of any kind — documentation only.

---

## Sessions

### Session 1 of 1: Capture, route for feedback, and close

**Steps:**
1. Register (`start_session`); read this spec + the remediation doc.
2. Route the remediation doc for an independent-provider feedback pass
   (`route(task_type="documentation")`); log the routed feedback; apply
   only material corrections to the doc.
3. Make it discoverable: add a pointer from `docs/repository-reference.md`
   (shared operational record) to the remediation doc; if warranted, cite
   the loop-exit / builder-cannot-release-itself principle into
   `docs/planning/lessons-learned.md`.
4. Verify (mandatory Full-tier `verify_session`). Handle the verdict **by
   severity**, honoring the just-repaired stop rule: a Minor-only round is
   effectively VERIFIED — record the nits and proceed; do not grind rounds
   on immaterial doc findings.
5. Author `disposition.json`; commit **and** push; `close_session`; fire
   the session-complete notification only after the gate passes.
6. Last-session Step 9: the reorganization review of
   `project-guidance.md` / `lessons-learned.md` ("no changes recommended"
   is a valid outcome). Produce `change-log.md`.

**Creates:** `change-log.md`; the standard per-session artifacts
(`disposition.json`, `sN-verification*.md`, etc.).
**Touches:** `docs/verification-loop-remediation-2026-07.md` (material
feedback only); `docs/repository-reference.md` (discoverability pointer);
optionally `docs/planning/lessons-learned.md` (one cited lesson).
**Ends with:** the out-of-band remediation and the cancelled Set 086 are a
formally-registered, closed session set in the project record; the
remediation doc has had an independent-provider feedback pass and is linked
from the shared operational record; cross-provider VERIFIED (or Minor-only);
pushed; `close_session` succeeded.
**Progress keys:** doc-routed-for-feedback, discoverability-linked,
086-linkage-captured, set-closed

---

## End-of-set deliverables

- An independent-provider feedback pass applied (material-only) to
  `docs/verification-loop-remediation-2026-07.md`.
- A discoverability pointer from `docs/repository-reference.md` (and, if
  warranted, one cited lesson in `lessons-learned.md`).
- The cancelled Set 086 ↔ 0.32.0 salvage linkage captured in the record.
- `change-log.md`; the standard per-session artifacts; a clean
  `close_session`.
