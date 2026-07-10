# Module-Organized Projects — Foundations Spec

> **Purpose:** Let a small team (2–4 developers) work on **one project at
> once**, each owning a **module** with its own project plan and session
> sets, and see their work grouped by module in the Session Set Explorer.
> This foundational set ships **Phase 1** of the accepted design: the
> `docs/modules.yaml` manifest + per-set `module` metadata (with a
> **fail-loud global set-name uniqueness** invariant), the Explorer's
> collapsible **module → status-bucket → row** tier, module-targeted plan
> authoring / decomposition + CODEOWNERS & monorepo-CI scaffolds, and a
> **Hello World guided walkthrough for a three-person team** plus a reusable
> **AI feedback prompt**. Phase 1 is **display + metadata only** — no
> session-set file moves, no identity change, no `ai_router` changes; those
> are deferred to sibling sets 088 (locators + scope check) and 089
> (optional physical layout). Design is settled in two operator-approved
> docs (see Project Overview); this spec decomposes them into sessions.
> **Created:** 2026-07-09
> **Session Set:** `docs/session-sets/087-module-organized-projects-foundations/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested        # Sessions 2–3 change the extension UI (Explorer module tier, authoring flow); arm UAT for the UX sessions, skip for the manifest/doc sessions.
requiresE2E: suggested        # The Explorer's 3-level rendering has a Playwright smoke layer; arm E2E on the Explorer session.
uatStyle: ad-hoc              # Non-web VS Code UI; DSL/Playwright parity does not apply.
uatScope: per-session
pathAwareCritique: advisory   # The change spans extension discovery + view-model + webview client + authoring flow + scaffold templates + docs; a multi-provider path-aware critique guards cross-surface consistency (esp. the globally-unique-name invariant echoed across fileSystem.ts, the protocol, and findSetBySlug). Advisory: warns at close, never blocks.
```

> Rationale: `tier: full` — canonical repo; curator work runs through real
> cross-provider verification. UAT/E2E `suggested` so the manifest-only and
> doc sessions pay nothing while the Explorer and authoring sessions arm the
> gates against their real UX scope. `pathAwareCritique: advisory` because one
> invariant — *session-set names stay globally unique; `module` is a grouping
> attribute, never identity* — must stay consistent across discovery, the
> webview protocol, the row/action resolution path, and the scaffold docs.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

The strategy is **settled** by a cross-provider consensus (Opus 4.8 +
GPT 5.5/5.4 + Gemini Pro) captured in two operator-approved docs. This spec
**implements** them; it does not redecide topology, branching, or tagging:

- [`docs/planning/module-organized-projects-recommendation.md`](../../planning/module-organized-projects-recommendation.md)
  — the formal spec: monorepo (not submodules/multi-repo); trunk-based with
  production-as-a-tag; annotated semver; `docs/modules.yaml` manifest
  (`slug`/`title`/`codeRoots`/`planPath`/`touches`); **globally-unique set
  names**; flat Phase-1 storage; the extension seam table (§5); the later
  Python work (§6); the phasing table (§7); the deviations table (§9).
- [`docs/planning/module-organized-projects-primer.md`](../../planning/module-organized-projects-primer.md)
  — the human-oriented primer on branching, tagging, worktrees, monorepos,
  CODEOWNERS/CI, and the "integration bomb" failure mode.

### The invariant this set must protect

The framework identifies a session set by its **name alone**:
`readAllSessionSets()` merges by `set.name`
([`fileSystem.ts`](../../../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts)),
`RowPayload.slug` is the webview event/action key
([`sessionSetsWebviewProtocol.ts`](../../../tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts)),
and `findSetBySlug()` resolves that key by `set.name`
([`CustomSessionSetsView.ts`](../../../tools/dabbler-ai-orchestration/src/providers/CustomSessionSetsView.ts)).
Per GPT 5.5's identity review, two modules each holding `001-bootstrap` would
collapse/misroute. This set **keeps names globally unique** (rather than
introducing composite identity) and adds a **fail-loud uniqueness check at
discovery** so a collision surfaces an error instead of a silent merge.
`module` is a **grouping attribute**, never part of row/action identity — so
the protocol's `slug` and `findSetBySlug` are unchanged **on purpose**.

### In scope (Phase 1)

- `docs/modules.yaml` reader + `module` metadata on each set; the
  global-uniqueness invariant.
- Explorer module tier (module → four status buckets → rows), collapsible,
  backward-compatible (no manifest ⇒ today's flat view, pixel-identical).
- "New module" scaffold + module-targeted Getting Started / decomposition
  flows; CODEOWNERS + monorepo-CI templates in the consumer bootstrap.
- The three-person Hello World walkthrough + the AI feedback prompt.

### Non-goals (explicitly deferred)

- **No `ai_router`/Python changes and no shared locator API** — deferred to
  set 088 (recommendation §6.1).
- **No `codeRoots` scope-check enforcement machinery** — it does **not exist
  today**; deferred to set 088 (§6.4). Session 4's tutorial *describes* the
  boundary discipline the future check will enforce, and Session 3 lands the
  *declarative* half (CODEOWNERS `touches` review), but no runtime path-scope
  blocker ships here.
- **No physical session-set file moves and no worktree-name changes** — the
  existing `session-set/<slug>` naming stays correct under global uniqueness;
  physical migration is optional set 089 (§6.3).
- **No numbering/identity change.** Names stay globally unique; prerequisites
  keep today's `{ slug }` syntax.

---

## Sessions

### Session 1 of 4: Manifest + module metadata + global-uniqueness invariant

**Steps:**
1. Register (`start_session`); read this spec + both design docs' §2/§5.
2. Add `readModulesManifest(root)` to `fileSystem.ts` — parse
   `docs/modules.yaml` (`slug`, `title`, `codeRoots`, `planPath`, optional
   `touches`) mirroring `parseSessionSetConfig` / `parsePrerequisites`
   conventions (tolerant read; absent manifest ⇒ single implicit module).
3. Thread a `module` / `moduleTitle` attribute onto each `SessionSet`
   (`types.ts`), sourced from the set's `spec.md` `module:` key (parsed in
   `parseSessionSetConfig`; add optional `module` to `SessionSetConfig`),
   validated against the manifest slugs; unknown/absent ⇒ implicit module.
4. Add the **fail-loud global-uniqueness check**: `readAllSessionSets()`
   detects duplicate set names across the workspace and surfaces a
   first-class error (never a silent merge). Decide, via routed
   `route(task_type="architecture")`, the exact surfacing (error row vs
   notification vs both) so it composes with the existing merge-by-name path
   without breaking single-module repos.
5. Tests (extension harness): manifest parse (present/absent/malformed);
   `module` attribution + manifest validation; **duplicate-name detection
   fails loud**; implicit-module fallback leaves existing sets untouched.
6. Build + full suite; verify (mandatory, routed cross-provider); author
   `disposition.json`; commit + push; `close_session`.

**Creates:** `readModulesManifest` + tests; a modules-manifest fixture.
**Touches:** `src/utils/fileSystem.ts`, `src/types.ts`
(`SessionSet` + `SessionSetConfig`), the extension test suite.
**Ends with:** the manifest parses (or absents cleanly to one implicit
module); every set carries a validated `module`; a duplicate set name across
the workspace is a loud error, not a silent collapse (proven by tests); suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded.
**Progress keys:** manifest-reader-built, module-attribute-threaded,
global-uniqueness-fails-loud, implicit-module-fallback-intact, suite-green

---

### Session 2 of 4: Explorer module tier (module → buckets → rows)

**Steps:**
1. Register; read this spec and Session 1's outcome.
2. Protocol: add `ModulePayload { slug; title; buckets: BucketPayload[] }`
   and `SnapshotPayload.modules: ModulePayload[]`
   (`sessionSetsWebviewProtocol.ts`). `RowPayload.slug` + all action
   messages stay unchanged (identity is the globally-unique set name).
3. View-model: add `groupByModule(all)` before `bucketSets` in
   `SessionSetsModel.ts`; reuse `sortBucket` per module; module order = manifest
   file order (implicit module last / unlabeled).
4. Host: wrap `buildBuckets` in a `buildModules` layer in
   `CustomSessionSetsView.ts`; `buildRow` and `findSetBySlug` unchanged.
5. Webview (`media/session-sets-tree/client.js`): render a collapsible module
   group above the existing bucket rendering; add `moduleCollapsed[slug]`; key
   bucket-collapse per `(module, bucket)`; `aria-level` 1 (module) / 2 (bucket)
   / 3 (row). A **no-manifest repo renders exactly today's two-level view**
   (one implicit module, no module header — pixel-compatible).
6. Tests: `groupByModule`; `buildModules` payload shape; Layer 2 fixture with
   2–3 modules + an integration module → titled collapsible groups each with
   the four buckets; **no-manifest fixture renders unchanged**; Playwright
   Layer 3 smoke for the 3-level DOM + `aria-level`.
7. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt
   (this session has UX scope); author `disposition.json`; commit + push;
   `close_session`.

**Creates:** `ModulePayload` type; `groupByModule`; module-tier tests +
fixtures.
**Touches:** `src/types/sessionSetsWebviewProtocol.ts`,
`src/providers/SessionSetsModel.ts`, `src/providers/CustomSessionSetsView.ts`,
`media/session-sets-tree/client.js`, the Explorer test suites.
**Ends with:** the Explorer groups sets by module (collapsible, titled) with
the four status buckets nested under each, `aria-level` correct; a no-manifest
repo is pixel-identical to today; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** protocol-module-payload, group-by-module, build-modules-layer,
client-3-level-render, no-manifest-backward-compat, suite-green

---

### Session 3 of 4: Module authoring, scaffolding & ownership templates

**Steps:**
1. Register; read this spec and Sessions 1–2's outcomes.
2. "New module" scaffold action: append a `docs/modules.yaml` entry and
   create `docs/modules/<slug>/project-plan.md` stub (extend the Getting
   Started action set + `gettingStartedActions.ts`).
3. Module-targeted authoring: the plan-authoring / decomposition flow reads
   `docs/modules.yaml`, asks **which module** (skipped when there's one), and
   writes `module: <slug>` into each generated `spec.md` (validated against
   the manifest, like `sessionSetName` must equal its dir). Sets stay **flat**
   in `docs/session-sets/` (Phase 1). Recommend (not enforce) the module slug
   in the set name so names stay self-describing and collision-free.
4. Ownership + CI templates into `docs/templates/consumer-bootstrap/`: a
   `CODEOWNERS` template mapping each module's `codeRoots` to owner(s) — and
   **requiring review from every module named in an integration module's
   `touches`** — plus a monorepo CI template (path-scoped jobs per `codeRoots`
   **and** an all-module build/test on every merge to `main`, the anti-
   integration-bomb guardrail).
5. Tests: scaffold writes a valid manifest entry + plan stub; decomposition
   stamps a manifest-valid `module:`; template presence/shape checks.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`.

**Creates:** "New module" scaffold; `CODEOWNERS` + monorepo-CI templates
under `docs/templates/consumer-bootstrap/`; scaffold/decomposition tests.
**Touches:** the Getting Started action host + protocol
(`src/commands/gettingStartedActions.ts`, the webview action union), the
decomposition prompt template, `docs/templates/consumer-bootstrap/` (mirrored
into `dist/`), relevant tests.
**Ends with:** a developer can scaffold a new module (manifest entry + plan
stub) and decompose that module's plan into flat, module-stamped session sets;
new projects scaffold with CODEOWNERS + path-scoped/all-module CI; suite green;
cross-provider VERIFIED (or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** new-module-scaffold, module-targeted-decomposition,
codeowners-template, monorepo-ci-template, suite-green

---

### Session 4 of 4: Hello World team walkthrough + AI feedback prompt

**Steps:**
1. Register; read this spec and Sessions 1–3's outcomes.
2. Author `docs/tutorials/module-team-hello-world.md` — a copy-pasteable,
   runnable walkthrough for a **three-person team** (Priya → `greeter`,
   Sam → `clock`, Alex → `integration`, `touches: [greeter, clock]`),
   exercising every workflow element end-to-end: init the `main` trunk →
   declare modules in `docs/modules.yaml` (via the Session-3 scaffold) →
   commit CODEOWNERS + monorepo CI → each dev authors
   `docs/modules/<slug>/project-plan.md` → decompose into module-stamped,
   globally-unique session sets → open worktrees
   (`python -m ai_router.worktree open <slug>`) → confirm the Explorer groups
   each set under its module (the 3-level tree) → small PRs merged to `main`
   (path-scoped CI, then all-module CI) → the integration set composing both
   modules, reviewed by both owners → tag a release (`greeter-v0.1.0` or
   repo-wide `v0.1.0`) → demonstrate redeploy-previous-tag rollback and
   branch-from-tag hotfix. End with a "what to observe" self-check checklist.
   Reuse the primer's Priya/Sam narrative for consistency; add Alex.
3. Author `docs/tutorials/module-team-hello-world-review-prompt.md` — a
   reusable markdown prompt (modeled on the repo's verification/review prompt
   style) an AI engine runs against the team's repo **after** the walkthrough:
   it states the inputs to gather (git log/branches/tags, `docs/modules.yaml`,
   `CODEOWNERS`, CI config, each set's `spec.md`/`session-state.json`, PR/diff
   history), scores each principle with cited evidence (trunk hygiene / merge
   cadence; global set-name uniqueness + correct `module:` metadata; directory
   discipline vs `codeRoots`; integration-lane `touches` correctness + owner
   review; CODEOWNERS coverage of shared conflict-magnets; annotated-semver
   tag correctness + production-as-a-tag; integration-bomb symptoms), and emits
   coaching-tone structured feedback (what went well → per-principle findings
   with a fix → prioritized next actions). Runnable via
   `route(task_type="analysis")` **or** pasted into any engine.
4. **Dogfood the prompt**: run it (via `route`) against a scratch repo where
   the walkthrough has been executed once with a **deliberately-planted
   violation** (e.g. a `greeter` set editing `services/clock/`); confirm it
   flags the violation with a correct citation and actionable feedback.
5. Doc pass: link both tutorials from the Getting Started surface / quick-start
   and the consumer-bootstrap docs.
6. Build + full suite (docs/link checks + any touched extension tests); verify
   (mandatory); author `disposition.json`; commit + push; `close_session`;
   notify; **Step 9** guidance/reorg review (last session); end-of-set
   `change-log.md`; the armed **path-aware critique** stage before the
   set-terminal close.

**Creates:** `docs/tutorials/module-team-hello-world.md`,
`docs/tutorials/module-team-hello-world-review-prompt.md`; `change-log.md`.
**Touches:** Getting Started / quick-start links; consumer-bootstrap docs.
**Ends with:** a three-person team can follow the walkthrough end-to-end and
run the AI feedback prompt to get cited, actionable coaching (proven by the
dogfood run against a planted violation); both tutorials are linked from
onboarding; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded; Step 9 review done; path-aware critique recorded.
**Progress keys:** walkthrough-authored, review-prompt-authored,
prompt-dogfooded-on-planted-violation, tutorials-linked-from-onboarding,
set-closed

---

## End-of-set deliverables

- `readModulesManifest` for `docs/modules.yaml` + `module`/`moduleTitle` on
  `SessionSet`, with the **fail-loud global set-name uniqueness** invariant
  and tests.
- Explorer **module → status-bucket → row** tier (collapsible, titled,
  `aria-level` correct), fully backward-compatible with no-manifest repos, with
  unit + Layer 2/3 tests.
- "New module" scaffold + module-targeted plan authoring / decomposition
  (sets stay flat, stamped with a manifest-valid `module:`).
- `CODEOWNERS` + monorepo-CI (path-scoped + all-module-on-`main`) templates in
  `docs/templates/consumer-bootstrap/`.
- `docs/tutorials/module-team-hello-world.md` — three-person guided walkthrough.
- `docs/tutorials/module-team-hello-world-review-prompt.md` — reusable AI
  feedback prompt, dogfooded against a planted-violation scratch repo.
- Both tutorials linked from onboarding; `change-log.md`; the standard
  per-session artifacts.

> **Follow-on sets (not authored here):** `088-…` — the shared TS+Python
> locator API + the `codeRoots` scope check (warn→block) + bare-number
> ambiguity errors (recommendation §6.1/§6.4), prerequisite: this set.
> `089-…` — optional physical layout migration to
> `docs/session-sets/<module>/` + module-qualified branches + the
> `writer_discipline.py` parent-count and `cost_report.py` canonicalization
> fixes (§6.2/§6.3), prerequisite: 088. Author each when this set closes.
