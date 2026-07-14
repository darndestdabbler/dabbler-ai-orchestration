# Copilot + Azure DevOps Hello-World Tutorial Spec

> **Purpose:** Give the operator's actual team a walkthrough they can follow
> in their exact stack. The flagship hello-modules tutorial
> (`docs/tutorials/module-team-hello-world.md`) is agent-agnostic and uses
> GitHub as its worked host; the operator's staff is **locked to GitHub
> Copilot** as its only AI agent (no direct provider API keys) and hosted on
> **Azure DevOps** today. This set authors a **standalone, linear
> Copilot + Azure DevOps cut** of that tutorial — including the **executable
> ADO bootstrap** (branch policies, automatically-included reviewers, an
> `azure-pipelines.yml` with the two-layer CI contract) that Set 102
> explicitly deferred rather than ship untested — and then **validates it
> live** in an operator-assisted walk that doubles as Set 102's still-armed
> Azure DevOps UAT.
> **Created:** 2026-07-14
> **Session Set:** `docs/session-sets/103-copilot-ado-hello-world-tutorial/`
> **Prerequisite:** `102-git-workflow-automation` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # The live operator walk IS the acceptance test: the operator quality bar forbids shipping untested step-by-step instructions, and the ADO + Copilot-seat steps are only runnable with operator-supplied resources.
requiresE2E: false        # Docs-only set: no extension or router code changes, no UI surface to pin.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 102-git-workflow-automation
    condition: complete
```

> Rationale: authored on the operator's direct request (2026-07-14, received
> mid-Set-102-S3: *"We are going to need a version of the hello-modules
> tutorial that uses GitHub Copilot. That's what my staff uses."*), recorded
> as a queued follow-on in Set 102's disposition and change-log. The four
> structural calls below (standalone document, Copilot-seat-primary tier
> path, 2-session split, these gates) were confirmed by a routed
> cross-provider analysis before this spec was committed — raw verdict in
> [`authoring-structure-analysis.md`](authoring-structure-analysis.md).
> Session 2's live walk additionally discharges the **armed Azure DevOps
> UAT walk** recorded open in Set 102 Session 1 (the 102 S3 backstop
> remediation, `../102-git-workflow-automation/s3-remediation-round-2.md`,
> explicitly points the executable ADO bootstrap at this follow-on).

---

## Project Overview

### The problem

The teaching surface and the team's reality don't match. The flagship
tutorial teaches the workflow through interchangeable AI agents and a GitHub
repo with CODEOWNERS + Actions; the operator's staff has exactly one agent
(GitHub Copilot) and a different host (Azure DevOps), where the guardrail
concepts exist but every concrete step differs — and the Full tier itself is
reached differently (a **Copilot CLI seat** transport instead of
`DABBLER_*` API keys). Set 102 made the *loop* host-neutral and made the ADO
callouts actionable, but deliberately kept the hands-on bootstrap
GitHub-concrete and deferred the executable ADO walkthrough: no ADO
organization was reachable to validate it, and untested instructions cannot
ship. A staff-ready document must be **one linear walkthrough in their exact
stack, validated end-to-end at least once**.

### Authoritative design (routed structure check — do not re-litigate at runtime)

- **Standalone, linear, full-length document** at
  `docs/tutorials/module-team-hello-world-copilot-ado.md` — same cast, same
  toy program, same module/trunk concepts as the base tutorial, re-cut for
  Copilot + ADO. A companion/overlay doc that bounces the reader between two
  documents violates the zero-context linear-walkthrough bar. The ~700-line
  duplication risk is managed with process, not structure:
  - a **sync-map appendix** in the new doc (base-tutorial part ↔ this doc's
    part, plus "shared spine" vs "host/agent-specific" labels);
  - a **maintenance note in both tutorials**: an edit to shared-spine
    content lands in both documents in the same PR (the L-065-1
    every-echo discipline);
  - one **review-prompt line item** so the companion workflow review audits
    the pair for drift.
- **Full tier via the Copilot CLI seat is the PRIMARY taught path** — the
  flagship workflow (integrated cross-provider verification) demonstrated
  through the transport the team actually has: `Dabbler: Set Up Copilot
  Seat` (Set 097), the auth preflight, and `transport.profile: copilot-cli`
  (Set 078). The **Lightweight tier is the alternative callout** (zero
  metered spend, copy/paste verification), not the spine. **Set 086
  principle, load-bearing:** the tutorial must never hand the engine — or
  the reader — an unrunnable required step: every seat-dependent step is
  preceded by the checklist that proves the seat is installed +
  authenticated, and the walkthrough shows what failure looks like (the
  friendly preflight) before the first step that needs it.
- **The ADO bootstrap becomes executable, then validated.** Project + repo
  creation, teammate access via project membership, branch policies
  (minimum reviewers, **Automatically included reviewers** with per-module
  path filters — the CODEOWNERS equivalent, request *and* requirement),
  **Build validation** wiring, and a complete `azure-pipelines.yml`
  implementing the same two-layer contract as the base tutorial's Actions
  workflow (path-scoped per-module jobs + an always-on all-modules
  guardrail on `main`). Session 1 authors it and machine-checks what it can
  (YAML parses, structure lints); **Session 2's live walk is what earns it
  the right to ship** — until the walk passes, the doc carries a visible
  draft banner and is not linked from the discoverability surfaces.
- **The git-workflow commands appear in their ADO clothes.** Part 0.5's
  ADO path (az CLI + `az extension add --name azure-devops` + `az login` /
  `AZURE_DEVOPS_EXT_PAT`, with the real-read PAT check) is the primary
  setup; `Dabbler: Open PR for this set` → review/complete in the ADO PR UI
  (including the **Delete source branch after merging** default) →
  `Dabbler: Finalize merged set` → `Dabbler: Cut release tag` + the
  hotfix/rollback drills. The no-CLI degradation floor (push + ADO
  create-PR web page) gets one explicit spot check in the walk.
- **Portability rule** (unchanged): these are teaching docs for UI/workflow
  conveniences; the universal core still works with `requiresUAT: false` /
  `requiresE2E: false` defaults. This set changes no product code.

### Operator-supplied preconditions for Session 2 (named up front — never an unrunnable step)

- An Azure DevOps **organization + scratch project** the walk may freely
  create/destroy repos, policies, and pipelines in (parallel-job grant or
  self-hosted agent sufficient to run one small pipeline).
- A **GitHub Copilot seat** (the staff-like license) usable from VS Code +
  the Copilot CLI on the walk machine.
- ~Half a day of operator time for the walk itself (it is the tutorial's
  stated time-to-complete, minus the parts pre-staged in-session).

If any of these cannot be supplied when Session 2 starts, the session is
rescheduled by the operator rather than run degraded — a degraded walk would
re-create exactly the untested-instructions gap this set exists to close.

### Non-goals

- Changing the base tutorial's structure or teaching (it gains only a
  pointer line and the maintenance note) — and no attempt to make ONE
  document serve both stacks; the pair + sync discipline is the design.
- Any extension or router code change (no version bumps; the README /
  quick-start cross-links added here ride the next operator-gated publish).
- GitHub Enterprise specifics (the base tutorial + settings docs already
  cover GHE via `gitHost` override); GitLab or other hosts (explicit Set 102
  non-goal, unchanged).
- Automating ADO bootstrap (project/policy/pipeline creation stays a taught,
  one-time human setup — same policy-not-toil boundary as Set 102).

---

## Sessions

### Session 1 of 2: Author the Copilot + ADO cut (draft-banner until validated)

**Steps:**
1. Register; read this spec, the base tutorial
   (`docs/tutorials/module-team-hello-world.md`, post-102 state), Set 102's
   change-log + `s3-remediation-round-2.md` (the deferral being discharged),
   the Copilot-seat surfaces (`Dabbler: Set Up Copilot Seat`, Set 097; the
   Set 086 close-out checklist; `transport.profile: copilot-cli`, Set 078),
   and the shipped git-workflow command fact base
   (`src/commands/gitWorkflow.ts`, `gitRelease.ts`, `utils/gitHost.ts`,
   `utils/hostCli.ts`).
2. Author `docs/tutorials/module-team-hello-world-copilot-ado.md` — the
   standalone linear cut per the authoritative design: Copilot-only agent
   steps (Copilot Chat agent mode; the starter-line paste flow), Full tier
   via the Copilot seat as the spine (auth-preflight checklist before the
   first dependent step; Lightweight alternative callout), the executable
   ADO bootstrap (project/repo/membership, branch policies incl.
   automatically-included reviewers with per-module path filters, build
   validation, the complete `azure-pipelines.yml` two-layer CI), the
   ADO-clothed automated loop (az-first Part 0.5, ADO PR UI, finalize, tag,
   hotfix/rollback drills), the self-check checklist re-cut to ADO
   acceptances, and the **sync-map appendix**. Machine-check what is
   checkable now (pipeline YAML parses; command titles / settings keys /
   dialog strings verified against the shipped code — the L-064-8
   replacement-doc discipline). The doc opens with a visible
   **DRAFT — not yet validated live** banner.
3. Author the per-set UAT checklist
   (`103-copilot-ado-hello-world-tutorial-uat-checklist.json`) to the Set
   078 exemplar bar: literal copy-pasteable HumanAction + literal-string
   Expectation, a per-walk "where you are" preamble, a checklist-level
   order map; every functional item carries `ProgrammaticVerification` or a
   one-sentence `NoProgrammaticPathReason` (most ADO/seat steps are
   genuinely operator-only — say so honestly). The walk order mirrors the
   tutorial's natural order; any intentionally skipped/out-of-order step is
   flagged as intentional.
4. Cross-links, behind the draft status: the base tutorial + quick-start +
   extension README each gain one pointer line to the new doc **added in
   this session but explicitly marked** (the README line ships to the
   Marketplace only at the next operator-gated publish); add the
   maintenance note to both tutorials and the drift line item to the
   companion review prompt.
5. Build + full suite (docs-only — expect no code deltas; the suite run
   proves it); verify (mandatory phased loop, conventions block up front);
   `disposition.json` (next_orchestrator for Session 2); commit + push;
   `close_session`.

**Creates:** the new tutorial (draft-bannered), the per-set UAT checklist,
the sync-map appendix, cross-link + maintenance-note edits.
**Touches:** `docs/tutorials/` (new doc + base-doc pointer/maintenance
note), `docs/tutorials/module-team-hello-world-review-prompt.md` (drift
line item), `docs/quick-start.md`, `tools/dabbler-ai-orchestration/README.md`.
**Ends with:** the complete Copilot+ADO cut exists in draft with every
machine-checkable claim verified against shipped code; UAT checklist
authored to the 078 bar; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** tutorial-authored, ado-bootstrap-executable,
copilot-seat-spine, lightweight-callout, sync-map, uat-checklist-authored,
crosslinks-staged, suite-green

### Session 2 of 2: Operator-assisted live validation walk + remediation + de-draft

**Steps:**
1. Register; confirm the operator-supplied preconditions (ADO org + scratch
   project, Copilot seat, walk time) — if absent, stop and reschedule per
   the spec preamble; read Session 1's checklist and the armed-walk record
   from Set 102 S1.
2. Run the live walk with the operator against the checklist: ADO
   bootstrap end-to-end (project, repo, membership, policies, pipeline —
   the first-ever live validation of the `azure-pipelines.yml`), Copilot
   seat setup via `Dabbler: Set Up Copilot Seat` + auth preflight, at least
   one full module session through Copilot, the automated loop on ADO
   (`Open PR for this set` via az → review/complete in the ADO UI with
   delete-source-branch → `Finalize merged set` → `Cut release tag` +
   hotfix/rollback drills), plus the one no-CLI floor spot check. Record
   each item's PASS/FAIL with evidence; this walk **also discharges Set
   102's armed ADO UAT** — cross-reference the outcome in this set's
   artifacts (102 is closed; its record stays immutable).
3. Remediate everything the walk catches (doc fixes; any product defect
   found on the ADO path is triaged: in-scope doc workaround + a named
   follow-on set for the code fix — this set ships no code). Re-walk only
   the remediated items.
4. Remove the draft banner; activate the cross-links (the README line's
   Marketplace visibility still rides the next publish). UAT attestation
   recorded per the ad-hoc floor.
5. Build + full suite; verify (mandatory); `disposition.json`; commit +
   push; `close_session`; end-of-set `change-log.md`; Step 9; the advisory
   path-aware critique. Notify the operator — no release boundary (docs
   only), but the 102-armed-walk discharge is called out.

**Creates:** walk evidence + attestation, remediation deltas, the
de-drafted tutorial, `change-log.md`.
**Touches:** the new tutorial, the UAT checklist (attestation), set
artifacts.
**Ends with:** the tutorial validated live end-to-end and de-drafted; Set
102's armed ADO walk discharged with a recorded outcome; UAT attested;
suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded; Step 9 + advisory critique recorded.
**Progress keys:** preconditions-confirmed, live-walk-executed,
102-ado-walk-discharged, remediation-complete, de-drafted, uat-attested,
suite-green, set-closed

---

## End-of-set deliverables

- `docs/tutorials/module-team-hello-world-copilot-ado.md`: a standalone,
  linear, **live-validated** hello-world walkthrough for a GitHub-Copilot-
  locked team on Azure DevOps — Copilot-seat Full tier as the spine
  (Lightweight callout), the executable ADO bootstrap Set 102 deferred
  (policies, automatically-included reviewers, build validation,
  `azure-pipelines.yml`), and the confirm-gated git commands in their ADO
  clothes.
- The per-set UAT checklist (078 bar) with the operator's attestation, whose
  walk also discharges Set 102's armed Azure DevOps UAT.
- Drift discipline for the tutorial pair: sync-map appendix, dual
  maintenance notes, review-prompt line item.
- Cross-links from the base tutorial, quick-start, and extension README
  (Marketplace visibility at the next operator-gated publish; no version
  bump in this set).
