# Default Module Scaffold and Docs Spec (Module lifecycle simplification — Set 4 of 4)

> **Purpose:** Make "Build the project structure" produce a working
> starting point: a **real `default` module** in `docs/modules.yaml` with
> its **plan set and decomposition set scaffolded** (the Visual Studio
> `Class1` pattern — rename it or delete it, both one action away since
> Set 100), while **legacy pseudo-Default repos keep working unchanged**
> (no forced migration). Closes the sequence with the docs: hello-world
> tutorial and quick-start updated to the new flow, plus the
> module-reorganization / optional-migration guidance. **This set ends
> the sequence's single release boundary.**
> **Created:** 2026-07-13
> **Session Set:** `docs/session-sets/101-default-module-scaffold-and-docs/`
> **Prerequisite:** `100-work-explorer-module-lifecycle-ui` (complete;
> transitively 098, 099)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # The fresh-scaffold first-run experience is the deliverable; arm the ad-hoc human walk (Set 078/087-S3 bar): Build → see default + Sets 001/002 → rename/delete Default.
requiresE2E: suggested    # Scaffold output changes; the scaffold-facing Layer 3 / harness pins must match the new end-state.
uatStyle: ad-hoc          # Non-web VS Code UI.
uatScope: per-session
pathAwareCritique: advisory  # The scaffold seam spans gitScaffold, the manifest writer, the 098 set scaffolder, and both tiers (Full/Lightweight) — portability rule applies.
prerequisites:
  - slug: 100-work-explorer-module-lifecycle-ui
    condition: complete
```

> Rationale: last set of the sequence — the release gate. Publish
> (Marketplace + PyPI if router changes accrued) is **operator-gated**
> after this set closes, per standing policy.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements P3 per the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-13-module-lifecycle-simplification/verdict.md)):

- **The scaffold writes a real `default` entry** (slug `default`, title
  `Default`, `planPath: docs/modules/default/project-plan.md`) via the
  existing format-preserving writers, then scaffolds its plan set
  (Set 001 on a fresh repo) and decomposition set (Set 002) via
  `scaffoldModuleLifecycleSets` (Set 098). The special AI guidance
  rides in the scaffolded spec text.
- **The `Class1` pattern is the point:** the scaffolded Default is a
  familiar, disposable starter — renaming it or deleting it are the
  Set 099/100 one-action flows. Scaffold copy/guidance says so
  explicitly.
- **No forced migration** (verdict decision 4). The pseudo-module
  rendering path (`Default`/`Unassigned`, Set 091 rules) is untouched
  and keeps serving legacy repos. Note the Set 091 rule interaction: a
  declared literal `default` slug means the pseudo-module, when it
  appears, labels itself `Unassigned` — on a fresh scaffold every new
  set is born stamped, so the pseudo-module simply never appears.
- **Both tiers, portability rule:** the scaffolded lifecycle sets work
  unmodified with `requiresUAT: false` / `requiresE2E: false` defaults
  on Full and Lightweight.

### Non-goals

- Retiring the pseudo-module code path — it is the legacy-repo surface,
  permanently supported until a future operator decision.
- Auto-stamping legacy sets, migration modals, detection prompts — all
  adjudicated out.
- UAT re-cuts owed by other queues (e.g. 077-redo) — unrelated.

---

## Sessions

### Session 1 of 2: Scaffold the real Default module

**Steps:**
1. Register; read this spec, the verdict,
   `src/commands/gitScaffold.ts` (`buildProjectStructureNoPrompt`), and
   the Set 098/100 outcomes.
2. Extend the Build flow: after `ensureModulesManifest`, append the
   `default` entry (reuse `scaffoldNewModule` — manifest entry + plan
   stub) and call `scaffoldModuleLifecycleSets` for it. Idempotency:
   re-running Build on a repo that already has modules or sets makes no
   module/set writes (skip-existing posture throughout); a legacy repo
   opened without Build sees zero new behavior.
3. Scaffold copy + engine guidance: the getting-started/start-here
   template text explains the Default-is-Class1 pattern (rename or
   delete it; plan first, then decomposition) in one short paragraph.
4. Tests: fresh-scaffold end-state (manifest entry, plan stub, Sets
   001/002 with kinds + prereq link, tree shows one declared module
   with two pending sets and no pseudo-module), idempotent re-run,
   legacy-repo non-interference (empty `modules: []` repo renders
   pseudo-Default exactly as before), both tiers.
5. Live dogfood: Build in a scratch repo; walk Default → rename →
   delete → re-add a real module — the full first-run loop against the
   locally built VSIX.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront
   prompt; author `disposition.json`; commit + push; `close_session`.

**Creates:** the real-Default scaffold behavior + tests.
**Touches:** `src/commands/gitScaffold.ts`,
`src/utils/moduleAuthoring.ts` (reuse only),
`docs/templates/consumer-bootstrap/` (copy), Layer 2/3 + harness suites.
**Ends with:** fresh Build yields `default` + Sets 001/002 ready in the
tree; re-runs and legacy repos are untouched; dogfood pass; suite green;
cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded.
**Progress keys:** default-module-scaffolded, lifecycle-sets-scaffolded,
idempotent-rerun, legacy-untouched, dogfood-pass, suite-green

---

### Session 2 of 2: Docs, guidance, and the release gate

**Steps:**
1. Register; read this spec, Session 1's outcome, and the shipped
   Set 095 docs (`docs/tutorials/module-team-hello-world.md`,
   `docs/quick-start.md`).
2. Update the hello-world tutorial + quick-start to the new flow:
   Build → Default module with Sets 001/002 → run the plan set → run
   the decomposition set → rename/delete Default when real modules
   arrive. Retake affected screenshots (the Set 095 convention).
   Remove/replace references to the retired `AI Plan` / `Import Plan` /
   `AI Sets` strip flows and the `Plan` / `Session sets` child nodes.
3. Author the module-reorganization guidance (new
   `docs/module-reorganization.md`, pointed to from the tutorial and
   the modules.yaml header comments): when to use Rename/Delete (UI),
   the ask-the-AI path for split/merge reorgs, and the **optional**
   legacy-repo migration recipe (declare modules, use `Assign legacy
   sets to module…`, adopt lifecycle sets going forward — manual/AI,
   never forced).
4. Sweep the remaining doc surface for contradictions (workflow doc,
   authoring guide, repository-reference, extension README) — pointer
   fixes only; the deep teaching content lives in the tutorial.
5. Update both package changelogs; confirm the version walk per
   `docs/repository-reference.md`.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront
   prompt; author `disposition.json`; commit + push; `close_session`;
   end-of-set `change-log.md`; Step 9 review; the armed advisory
   path-aware critique before the set-terminal close. Notify the
   operator: the sequence's release boundary is reached — publish is
   the operator's click.

**Creates:** updated tutorial/quick-start + screenshots,
`docs/module-reorganization.md`, changelog entries, `change-log.md`.
**Touches:** `docs/tutorials/module-team-hello-world.md`,
`docs/quick-start.md`, `docs/ai-led-session-workflow.md` (pointers),
`docs/planning/session-set-authoring-guide.md` (pointer),
`tools/dabbler-ai-orchestration/README.md` + `CHANGELOG.md`,
`ai_router/CHANGELOG.md` (if router changes accrued this sequence).
**Ends with:** docs teach the shipped flow with no references to
retired UI; reorg/migration guidance exists and is linked; changelogs
staged; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded; Step 9 + advisory critique recorded;
operator notified at the release boundary.
**Progress keys:** tutorial-updated, screenshots-retaken,
reorg-guidance-authored, doc-sweep-clean, changelogs-staged,
suite-green, set-closed

---

## End-of-set deliverables

- Fresh scaffolds produce a real `default` module with its two
  lifecycle sets (Class1 pattern); legacy repos untouched.
- Updated hello-world tutorial + quick-start with retaken screenshots;
  `docs/module-reorganization.md` guidance (UI ops, AI reorg path,
  optional migration recipe).
- Changelogs staged for the operator-gated publish.
- `change-log.md`; standard per-session artifacts.

> **Release boundary:** this set closes the sequence — no
> Marketplace/PyPI publish before it closes; publish after it is the
> operator's click.
