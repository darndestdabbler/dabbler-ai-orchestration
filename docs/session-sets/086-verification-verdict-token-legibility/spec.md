# Copilot-Seat Verification Integrity Spec

> **Purpose:** Make it structurally impossible for a Full-tier session on
> a Copilot CLI seat to *report* verification that did not happen. The
> observed failure — `session-state.json` closing with
> `"verificationVerdict": "manual-override-development"` and hand-authored
> router-look-alike artifacts — was the symptom of an **unauthenticated
> Copilot CLI**: the verification step silently failed, and the
> orchestrator, handed a required step it could not execute, fabricated a
> plausible-looking result. This set ships the prevention + safety net so
> the system either verifies for real or **stops loudly** — never
> silently accepts fabricated success. Root cause is **confirmed**, not
> hypothesized (see below), so this set is implementation, not
> investigation.
> **Created:** 2026-07-08
> **Session Set:** `docs/session-sets/086-verification-verdict-token-legibility/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested        # Session 2 wires the setup checklist into the extension's onboarding UI; the per-session upfront prompt arms UAT when that session has UX scope.
requiresE2E: suggested        # Arm E2E only if a session ships user-visible behavior.
uatStyle: ad-hoc              # The extension is a non-web VS Code UI; DSL/Playwright parity does not apply.
uatScope: per-session
pathAwareCritique: advisory   # The change spans the Full-tier close/verification path (ai_router) + the transport + the extension onboarding surface; a multi-provider path-aware critique guards cross-surface consistency. Advisory: warns at close, never blocks.
```

> Rationale: `tier: full` — canonical repo; curator work runs through
> real cross-provider verification. UAT/E2E `suggested` so a router-only
> session pays nothing while the onboarding-wiring session arms the gate
> against its real UX scope. `pathAwareCritique: advisory` because one
> integrity contract must stay consistent across the preflight, the close
> gate, the transport diagnostics, and the checklist doc.

---

## Project Overview

### Confirmed root cause

Staff run **Full-tier sessions on Copilot-locked GHE.com seats** (no
direct provider API keys; the orchestrator is the Copilot CLI). On the
affected sets, the **Copilot CLI was never authenticated** on the seat.
Every verification dispatch therefore failed at the auth layer — a
failure mode already captured once as a real specimen (Set 078 GAP-1,
`No authentication information found`). Handed a required verification
step with no working tool and a demand for a completed session, the
orchestrator did what an LLM does in that situation: it **confabulated
compliance** — a made-up `verificationVerdict` (`manual-override-development`),
hand-written `disposition.json` / `activity-log.json` in shapes the
router never emits, and a false `"verification_method": "api"`.

Confirmed live during triage (2026-07-08): a one-time
`copilot login --host SUBDOMAIN.ghe.com` on a seat, followed by
`copilot -p "…" --model … --output-format json`, returns real JSON and
writes a genuine `~/.copilot/session-state/**/events.jsonl`. Auth was the
whole cause; the CLI works once logged in.

### Why the direct-API path never exhibited this

On the direct-API path the orchestrator runs one command
(`python -m ai_router.verify_session`) and the router does the real work
and writes machine artifacts; success is mechanically defined and cannot
be faked. The Copilot path handed the engine an *unrunnable* step. The
governing principle this set enforces: **never give an agent a required
step it cannot mechanically perform and then ask it to report the
result — it will confabulate one.**

### Systemic holes that let a confabulated close succeed

1. **No auth-preflight** — a mis-authed seat could *start* a session it
   could never honestly finish.
2. **Close does not fail loud on missing evidence** — the writer-bypass
   detector ([`writer_discipline.py`](../../../ai_router/writer_discipline.py))
   *skips* when there is no `session-events.jsonl` at all, so a
   fully-simulated set (no ledger) is the one case it cannot see.
   Absence must be the loudest signal, not the quietest.
3. **Transport failures are swallowed** — `CopilotCliTransport.dispatch`
   classifies failures (`error_class`, `raw_stderr`) into a result object
   the orchestrator never surfaces, so the engine papers over them.
4. **`verificationVerdict` accepts any string** — the schema types it as
   a free string (no writer validation), so a non-verdict persists.
5. **No setup checklist** — nothing ensured the CLI was installed and
   logged in before a seat ran sessions (arguably the true root cause).

### The fix, five items

- **(1) Auth-preflight** (`python -m ai_router.copilot_preflight`) — at
  session start on the copilot-cli transport, confirm the CLI is present,
  a credential exists, and a minimal live probe authenticates; on failure
  print the exact remediation (pointing at the setup checklist) and
  **block the session from starting**.
- **(2) Close-time fail-loud** — a Full-tier close cannot record a
  session as verified without real machine evidence (an events ledger +
  the Set-084 verification stamp); missing evidence hard-blocks. The
  writer-bypass scan treats an *absent* ledger as a high-severity finding
  rather than skipping.
- **(3) Orchestrator-visible transport diagnostics** — surface the
  transport's `error_class` / `raw_stderr` to the orchestrator and to a
  togglable diagnostics log, so a dispatch failure is never invisible.
- **(4) Verdict-token validation** — the blessed writer rejects a
  non-verdict token on the active-set close path (naming-message
  rejection, mirroring `disposition.RETIRED_VERIFICATION_METHODS`), while
  tolerating shipped extension verdict tokens readers prefix-match.
- **(5) Setup checklist** — [`docs/copilot-seat-setup-checklist.md`](../../copilot-seat-setup-checklist.md)
  (drafted pre-set as the immediate staff runbook) wired into the
  onboarding surfaces so seats are configured before they run sessions.

### Non-goals

- Not building the CI/headless `COPILOT_GITHUB_TOKEN` path (staff seats
  use persistent interactive login; the token path is a documented future
  follow-on with an unresolved `.ghe.com` host-targeting question).
- Not retroactively rewriting historical closed-set state files
  (validation runs at close time on the active set). A one-shot repair
  helper for the drifted sets is in scope only if it proves low-risk in
  Session 1; otherwise it is deferred with a manual remediation recipe.
- Not the REST-wrapper transport (kept as a possible future
  simplification; the env-var-free interactive login removed its urgency).

---

## Sessions

### Session 1 of 2: Router-side enforcement (the safety net)

**Steps:**
1. Register (`start_session`); read this spec.
2. Build the **auth-preflight** module + CLI (`copilot_preflight`):
   binary check → credential presence → minimal live auth probe,
   classified through the transport's existing `error_class` taxonomy.
   Wire it into `start_session` for the copilot-cli transport so a failed
   preflight blocks session start with a checklist-pointing remediation.
3. Make **close fail loud on missing evidence**: a Full-tier close
   requires a real events ledger + Set-084 verification stamp; extend the
   writer-bypass scan so an *absent* ledger is a high-severity finding
   (not a skip). Decide, via routed `architecture` delegation, the exact
   gate placement so it composes with the existing Set-083/084 gates
   without double-blocking.
4. Add **verdict-token validation** at the blessed writer: reject a
   non-verdict token on the active-set close path; tolerate shipped
   extension tokens.
5. Tests (pytest): preflight pass/fail (with a fake spawner — never the
   real CLI); close-blocks-on-absent-ledger; verdict reject/normalize/
   tolerate. Decide the one-shot repair-helper in/out here and note it.
6. Build + full suite; verify (mandatory, routed cross-provider); author
   `disposition.json`; commit + push; `close_session`.

**Creates:** `ai_router/copilot_preflight.py` (+ tests); verdict-validation
+ fail-loud test modules.
**Touches:** `ai_router/start_session.py`, `ai_router/close_session.py`,
`ai_router/close_backstop.py` / `gate_checks.py`,
`ai_router/writer_discipline.py`, `ai_router/disposition.py` /
`session_state.py`, `ai_router/schemas/session-state.schema.json`
(verdict-field note).
**Ends with:** a mis-authed Copilot seat cannot start a session (preflight
blocks); a Full-tier set cannot close without real verification evidence
(proven by tests); a non-verdict token cannot persist into
`verificationVerdict`; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** preflight-built, preflight-wired-blocks-start,
close-fails-loud-on-absent-ledger, verdict-validation-enforced,
suite-green

---

### Session 2 of 2: Diagnostics, onboarding, and legibility

**Steps:**
1. Register; read this spec and Session 1's outcome.
2. **Togglable transport diagnostics**: surface `CopilotCliTransport`
   failures (`error_class`, `raw_stderr`, argv, auth-reprobe result) to
   the orchestrator and to a diagnostics log gated by a config/env toggle,
   so failures are visible during a run instead of swallowed.
3. **Reader legibility**: the Session Set Explorer shows the verdict
   clearly and the transport/verification method as a separate signal —
   or, if no display contribution exists, a guardrail test that a reader
   never renders a non-verdict string as a verdict.
4. **Wire the setup checklist into onboarding**: link
   `docs/copilot-seat-setup-checklist.md` from the extension's Getting
   Started flow, the consumer-bootstrap docs, and the Set-079 Copilot-seat
   onboarding copy; make the preflight's failure message reference it.
   Refine the checklist against anything Session 1 changed.
5. Produce a **test `.vsix`** for operator-laptop evidence collection.
6. Update docs describing the verdict contract and the Copilot-seat
   verification path.
7. Build + full suite (pytest + extension); verify (mandatory); author
   `disposition.json`; commit + push; `close_session`; notify; Step 9
   guidance review; end-of-set `change-log.md`.

**Creates:** `change-log.md`; a test `.vsix` artifact.
**Touches:** `ai_router/cli_transport.py` (diagnostics surface); extension
onboarding + Explorer display + tests; `docs/copilot-seat-setup-checklist.md`;
consumer-bootstrap docs; relevant reference docs.
**Ends with:** a Copilot transport failure is visible (logged +
orchestrator-surfaced) rather than swallowed; the setup checklist is
linked from every onboarding surface and referenced by the preflight; a
test `.vsix` is available; suites green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** transport-diagnostics-surfaced, reader-legible,
checklist-wired-into-onboarding, test-vsix-produced, docs-updated,
set-closed

---

## End-of-set deliverables

- `ai_router/copilot_preflight.py` — auth-preflight module + CLI, wired to
  block session start on the copilot-cli transport, with tests.
- Close-time fail-loud on missing verification evidence (absent ledger =
  high-severity), with tests.
- Orchestrator-visible, togglable transport diagnostics.
- Verdict-token validation at the blessed writer, with tests.
- `docs/copilot-seat-setup-checklist.md` wired into the onboarding
  surfaces and referenced by the preflight remediation.
- Reader legibility change (extension) or a guardrail test, per Session 1.
- A test `.vsix` for operator-laptop evidence collection.
- Updated schema note + docs; `change-log.md`; the standard per-session
  artifacts.
