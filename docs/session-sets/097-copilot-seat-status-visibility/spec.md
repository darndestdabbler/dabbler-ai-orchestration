# Copilot Seat-Status Visibility Spec

> **Purpose:** Fix the operator-reported Getting Started defect
> (2026-07-13, during the 0.42.0 release-asset work): selecting the
> **GitHub Copilot CLI seat** and clicking **Build project structure**
> silently repaints the form back to the defaults (Full / Direct
> provider API keys) whenever the guided seat setup does not confirm.
> The durable state is honest by design — `transport.profile:
> copilot-cli` is written only after the catalog refresh confirms ≥2
> providers (the Set 086 provenance rule) — but the only explanation is
> a transient toast, and the first-ever profile seed (`null → "api"`,
> materialized by the user's own build action) outranks the user's
> explicit dirty flip under the Set 077 changed-seed precedence. The
> user's intent is discarded visually with no durable signal.
> **Created:** 2026-07-13 (operator-directed follow-on from the 0.42.0
> release push; diagnosis in the Set 096-era orchestrator session)
> **Session Set:** `docs/session-sets/097-copilot-seat-status-visibility/`
> **Prerequisite:** None (Set 096 complete; 0.42.0 tagged)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true        # Getting Started form + system-status strip are UI surfaces.
requiresE2E: false
uatStyle: ad-hoc         # IDE webview — non-browser-automatable walk, 078-bar instructions.
uatScope: per-set
pathAwareCritique: none  # Small, well-bounded UI change; Layer 2 + Layer 3 + UAT + routed verification cover it.
prerequisites: []
```

---

## Project Overview

### The defect chain (diagnosed 2026-07-13, file anchors current at 0.42.0)

1. The form's build-structure message DOES carry the pick
   (`client.js` `wireGettingStarted`: `msg.transportProfile =
   gsState.transportProfile`), and the scaffold honors it (no
   `budget.yaml` on the Copilot path; seat setup attempted after a
   successful install — `gitScaffold.ts` `decideCopilotSeatSetup`).
2. The scaffold seeds `router-config.yaml` with `transport.profile:
   api`; the `copilot-cli` value is written ONLY by the seat setup's
   confirmed path (catalog refresh through the scaffolded venv, ≥2
   confirmed providers — `copilotSeatSetup.ts`). Cancel, missing or
   unauthenticated CLI, <2 providers, or an incomplete install all
   honestly keep `api` — explained by a TRANSIENT toast only
   (`describeSeatSetupOutcome`).
3. The post-build snapshot's durable profile seed
   (`readTransportProfile`) is therefore `"api"`; the pre-build seed
   was `null` (no router-config yet). `restoreGsState`
   (`gettingStartedHtml.js`) treats the changed seed as "a newer
   sanctioned choice", overrides the user's `profileDirty` flip, and
   the radios repaint Full / Direct API with no adjacent explanation.
4. The tier and verification-mode seeds do NOT exhibit this class:
   their durable markers are written FROM the build rider itself
   (`.dabbler/tier`, `.dabbler/verification-mode`), so the post-build
   seed equals the user's pick. Only the profile's durable source is
   confirmation-gated — that asymmetry is the bug surface.

### The design (two small changes, simplicity-first)

- **D1 — a persistent seat-status signal in the system-status strip.**
  When the workspace's durable evidence says the operator chose the
  Copilot seat but the seat is not confirmed, the existing
  system-status strip (`systemStatusHtml.js`) renders a persistent,
  quiet note naming the honest state and the exact re-run command
  (reuse `rerunRefreshHint`) — a durable replacement for the toast,
  never a nag on workspaces that never chose Copilot. The session
  chooses the durable evidence source with a removal-over-addition
  bias: prefer deriving "chosen but unconfirmed" from state that
  already exists (the seat-setup outcome / catalog lockfile written by
  the refresh, plus `transport.profile`) before minting any new marker
  file; if a new marker is unavoidable, it must distinguish
  "never attempted" from "attempted, unconfirmed" and join the
  work-diff bookkeeping exclusions review.
- **D2 — the first-seed precedence carve-out, profile only.** In
  `restoreGsState`, a profile seed transitioning `null → <first value>`
  must NOT override a `profileDirty` explicit flip (the flip is the
  newer human choice; the first seed merely materialized the template
  default during the user's own build). A genuinely CHANGED seed
  (`"api" ↔ "copilot-cli"`) keeps today's precedence — including the
  confirmed-seat case, where the seed becomes `copilot-cli` and the
  form agrees with the user anyway. Sweep the seed-precedence siblings
  (tier, verificationMode) per L-069-1 and document in-code why they do
  not need the carve-out (their seeds are rider-derived, per the
  asymmetry above); do not change their behavior.

### Non-goals

- No change to the Set 086 confirmation gate itself (`copilot-cli` is
  still written only on a confirmed seat), no optimistic profile write,
  no weakening of `describeSeatSetupOutcome`'s honesty rules.
- No Marketplace publish inside the set (operator-gated, as always).

---

## Sessions

### Session 1 of 1: Persistent seat status + first-seed carve-out

**Steps:**
1. Register; read this spec, the diagnosis anchors above
   (`gettingStartedHtml.js` `restoreGsState`, `client.js` seed block,
   `gitScaffold.ts` seat-setup sequencing, `copilotSeatSetup.ts`
   readers/writers, `systemStatusHtml.js`), and the Set 079–082 UAT
   walks for the form's existing contract.
2. **D1:** durable "chosen but unconfirmed" derivation + the persistent
   strip note (quiet styling consistent with the strip's existing
   faults; names the honest transport state and the copy-pasteable
   re-run command). Layer 2 tests for the derivation matrix (never
   chose / chose+confirmed / chose+cancelled / chose+CLI-missing /
   chose+install-incomplete) and the render states.
3. **D2:** the `restoreGsState` profile-only first-seed carve-out +
   Layer 2 matrix tests (null→api with dirty copilot flip survives;
   api→copilot and copilot→api changed-seed precedence unchanged; tier
   and mode seed behavior pinned unchanged). Sibling-sweep note in
   code (L-069-1).
4. Layer 3 Playwright locally (Explorer-rendering surfaces changed —
   L-064-12) plus the full extension suite (`tsc`, Layer 2).
5. UAT checklist (ad-hoc, per-set, the 078 quality bar: literal
   copy-pasteable HumanAction + literal-string Expectation,
   live-dogfood-first, cold-start walk per L-079-3 — the walk starts
   from a fresh empty folder, selects the Copilot seat, cancels the
   probe, and verifies the persistent note + surviving radio). Every
   automation-checkable step pre-verified by Layer 2/3 before the
   checklist is offered.
6. Extension version bump + CHANGELOG (release prep; publish and tag
   stay operator-gated); build the vsix.
7. Verify (mandatory — the phased loop per the constitution:
   `--phase discovery`, supplementary on C/M, remediation-review on the
   fix delta); disposition; end-of-set `change-log.md`; commit + push;
   `close_session`; notify; Step 9 review.

**Creates:** the persistent seat-status strip note, the
`restoreGsState` carve-out, Layer 2/3 tests, `uat/uat-checklist.md`,
`change-log.md`.
**Touches:** `media/session-sets-tree/systemStatusHtml.js`,
`media/session-sets-tree/gettingStartedHtml.js`,
`media/session-sets-tree/client.js`,
`src/providers/CustomSessionSetsView.ts` (snapshot payload),
`src/utils/copilotSeatSetup.ts` (outcome persistence/read, if the
session lands there), extension `package.json`/`CHANGELOG.md`, tests.
**Ends with:** a cancelled/unauthenticated Copilot build leaves a
persistent, honest strip note with the re-run command instead of a
silently reverted form; the user's Copilot radio survives the
first-seed repaint; changed-seed precedence and the Set 086
confirmation gate are pinned unchanged by tests; suite green (Layer 2 +
Layer 3 local); UAT checklist authored and offered (cold-start walk
included); vsix built; cross-provider VERIFIED via the phased loop.
**Progress keys:** seat-status-note-live, first-seed-carveout-live,
uat-offered, session-closed

---

## End-of-set deliverables

- The persistent seat-status signal (D1) and the profile first-seed
  precedence carve-out (D2), both test-pinned, with the Set 086
  confirmation gate untouched.
- UAT checklist at the 078 bar, cold-start walk included, offered to
  the operator (walk may complete asynchronously per repo practice).
- Version-bumped, buildable vsix; publish and tags operator-gated.
