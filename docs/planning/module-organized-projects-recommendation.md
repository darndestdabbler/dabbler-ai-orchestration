# Module-Organized Projects — Final Recommendation

> **Status:** Recommendation for approval — synthesizes the Opus 4.8 plan,
> cross-provider input (GPT 5.5, GPT 5.4, Gemini Pro 3.1), and a
> code-verified review of this repo's extension and `ai_router` surfaces.
> Intended audience: the team (overview sections) and the implementing
> orchestrator (implementation sections).
>
> **New to branching strategies, tagging, or monorepos?** Read the
> educational companion first:
> [module-organized-projects-primer.md](module-organized-projects-primer.md).

---

## 1. What we're building (plain-English overview)

Today the Orchestrator assumes **one project = one `project-plan.md` = one
flat `docs/session-sets/` folder**, and the Session Set Explorer shows four
status buckets (In Progress / Not Started / Complete / Cancelled).

We want a small team (2–4 developers) to work on **one project at the same
time**, each owning a **module** (e.g. `billing`, `notifications`), each
with their **own project plan** that decomposes into their own session
sets. The Explorer gains a top tier: a **collapsible node per module**
(labeled with the module's title), and under each module the familiar four
status buckets.

The design goals, in priority order:

1. **Minimize merge conflicts** between developers.
2. **Support cross-module integration work** as a first-class activity.
3. **Follow industry best practice** (trunk-based development, monorepo
   conventions, ownership enforcement).
4. **Don't break anything** — existing single-module repos, all 86+
   existing session sets, and consumer repos must work unchanged.

---

## 2. The decisions (settled)

### 2.1 Repo topology: monorepo

One repository per project, one directory subtree per module's code.
**Not** git submodules (a vendoring tool — actively co-developed submodules
force a two-step commit + pointer-bump ceremony). **Not** multi-repo (an
integration tax of coordinated PRs and registry publishing that directly
fights the integration requirement). All four providers and this review
agree; this is settled.

### 2.2 Branching: trunk-based; production is a tag

- `main` is the only long-lived branch — protected, always releasable,
  PR + green CI to merge.
- All work happens on **short-lived session-set branches** (the existing
  worktree-per-session-set model), merged to `main` frequently.
- **Production is a tagged commit on `main`**, not a branch. Deploy from
  the tag; hotfix by branching from the deployed tag, fixing, merging back
  to `main`, and retagging.
- **No** `develop`, no `release` branches, no per-developer or per-module
  long-lived branches. Long-lived divergence is exactly the merge pain
  we're avoiding.

### 2.3 Tagging: annotated semver

Annotated tags (`git tag -a`). Default **per-module** tags
(`billing-v1.2.0`) since "module" usually implies independently deployable;
use repo-wide `v1.2.0` if the project ships as one unit. This is a
per-project choice recorded in the module manifest's docs
(open decision — see §8).

### 2.4 The module manifest: `docs/modules.yaml`

One file, at one canonical path (the plan draft wavered between
`docs/modules.yaml` and `.dabbler/modules.yaml` — it is **`docs/modules.yaml`**):

```yaml
modules:
  - slug: billing
    title: Billing & Invoicing
    codeRoots: [services/billing]
    planPath: docs/modules/billing/project-plan.md
  - slug: notifications
    title: Notifications
    codeRoots: [services/notifications]
    planPath: docs/modules/notifications/project-plan.md
  - slug: integration
    title: Cross-Module Integration
    codeRoots: []              # sanctioned to touch other modules' roots
    touches: [billing, notifications]
    planPath: docs/modules/integration/project-plan.md
```

- `slug` — machine identity of the module; lowercase, hyphenated.
- `title` — what the Explorer displays on the module node.
- `codeRoots` — the code path(s) the module owns. This is what makes
  ownership *enforceable* (CODEOWNERS, path-scoped CI) rather than
  cosmetic.
- `planPath` — where the module's project plan lives.
- Module display order in the Explorer = file order.
- **Absent manifest ⇒ single implicit module**, rendered exactly like
  today's flat view. This is the backward-compatibility rule.

### 2.5 ⚠ The key correction: session-set names stay globally unique

The original plan proposed per-module session-set numbering (`billing/001…`,
`notifications/001…`). **We recommend against this.** It is the single most
expensive decision in the plan, and it buys nothing the directory split
doesn't already provide:

- The entire codebase — webview row identity, prerequisite resolution,
  set-by-name lookups, close-out, metrics aggregation — keys session sets
  by their **full directory name** (`087-some-slug`), assumed globally
  unique. Per-module numbering forces a composite `(module, name)` identity
  through the webview protocol, the prerequisite schema, and roughly
  fifteen `ai_router` modules.
- Merge-conflict avoidance comes from **developers working in different
  directories**, not from numbering. Two devs creating
  `087-billing-webhooks` and `088-notif-digest` never conflict in git.

**The rule:** session-set directory names remain globally unique across the
repo. The manifest reader / discovery layer validates this and fails
loudly on a collision. `module` becomes a **grouping attribute** on a
session set — *not* part of its identity. If two developers race to the
same number (two `087-…` sets with different slugs), nothing breaks; only
bare-number CLI resolution (`start_session 87`) becomes ambiguous, and it
should error with "ambiguous — use the full slug."

This one rule eliminates the majority of the plan's hidden migration work.

### 2.6 Physical layout: metadata first, move files later (maybe never)

Adopting GPT 5.5's phasing, which is safer than the original plan's:

- **Phase 1 keeps session sets flat** in `docs/session-sets/` and adds
  module *metadata*. The Explorer's module tier, CODEOWNERS, and CI
  guardrails are all validated with **zero file moves**.
- **Phase 3 (optional)** migrates physical storage to
  `docs/session-sets/<module>/<NNN-slug>/` — note: *under the existing
  `docs/session-sets/` prefix*, not the plan's `docs/modules/<slug>/session-sets/`.
  Keeping the prefix means the ~15 Python files that hardcode
  `docs/session-sets` need one extra recursion level, not a
  manifest-driven root change.
- **Exit ramp:** if flat-plus-metadata proves sufficient for a 2–4 person
  team (it likely will), Phase 3 never needs to happen.

Per-module **plans** live under `docs/modules/<slug>/project-plan.md` from
day one — plans are new files, so there's no migration cost there.

---

## 3. How users create project plans and session sets

### 3.1 Setting up modules (once per project)

1. Create `docs/modules.yaml` listing each module (§2.4). A "New module"
   action in the extension scaffolds the manifest entry plus
   `docs/modules/<slug>/` with a plan stub.
2. Generate/commit `CODEOWNERS` mapping each module's `codeRoots` to its
   owner(s).
3. Adopt the monorepo CI template: path-scoped jobs per module's
   `codeRoots`, **plus all-module build/test on every merge to `main`**
   (Gemini's insisted guardrail — surfaces cross-module breakage
   continuously instead of at "integration time").

### 3.2 Authoring a module's project plan

Each developer runs the existing Getting Started / plan-authoring flow,
now **targeting their module**: the flow reads `docs/modules.yaml`, asks
which module (skipped when there's only one), and creates or imports
`docs/modules/<slug>/project-plan.md`. Nothing else about plan authoring
changes.

### 3.3 Decomposing into session sets

The decomposition flow targets the chosen module's plan and writes session
sets into `docs/session-sets/` (flat, Phase 1) with one addition — each
generated `spec.md` carries the module attribute:

```yaml
sessionSetName: 091-billing-webhook-retries
module: billing            # ← new; grouping attribute, validated against docs/modules.yaml
prerequisites: []
```

- `module:` must name a manifest slug (validated the same way
  `sessionSetName` must equal the directory basename).
- Sets without `module:` fall into the implicit/default module — old sets
  keep working untouched.
- **Naming convention (recommended, not enforced):** include the module
  slug in the set name (`091-billing-webhook-retries`). It keeps names
  self-describing and makes accidental collisions essentially impossible.
- **Prerequisites are unchanged** — because names stay globally unique, a
  prerequisite can point at any set in any module with today's syntax.
  Cross-module prerequisites (integration sets depending on module sets)
  work for free.

### 3.4 What the Explorer shows

```
▾ Billing & Invoicing            ← module node (title from manifest), collapsible
    ▾ In Progress
        091-billing-webhook-retries
    ▸ Not Started
    ▸ Complete
    ▸ Cancelled
▾ Notifications
    ▾ In Progress …
▸ Cross-Module Integration
```

Bucket collapse state is keyed per `(module, bucket)`; module collapse
state per module slug. A repo with no manifest renders exactly today's
two-level view. Accessibility: `aria-level` 1 (module) / 2 (bucket) /
3 (row).

---

## 4. The git workflow (developer's view)

1. **Start a set:** `python -m ai_router.worktree open <slug>` — unchanged.
   Branch `session-set/<slug>`, worktree at `<repo>-worktrees/<slug>/`.
   (Branch/worktree names only become module-qualified if/when Phase 3
   runs — see §6.3.)
2. **Work inside your module's `codeRoots`.** The session-set scope check
   (new, §6.4) warns/blocks when a non-integration set edits paths outside
   its module's `codeRoots`.
3. **Merge early, merge often.** Small, path-scoped PRs into `main`.
   Path-scoped CI runs your module's tests; merge to `main` runs everyone's.
4. **Integration work** happens in session sets belonging to the
   `integration` module — the only sets sanctioned to edit across multiple
   modules' `codeRoots`. If you find yourself needing to touch another
   module's code in a regular set, that's the signal to either hand it to
   that module's owner or promote the work to an integration set.
5. **Shared surfaces get extra care.** Contracts, schemas, migrations,
   root CI config, and shared packages are where conflicts actually
   cluster (unanimous provider finding). Each shared path gets an explicit
   owner in CODEOWNERS; changes to them are integration-lane work.
6. **Release:** tag the `main` commit that ships (`billing-v1.2.0`).
   Rollback = redeploy the previous tag. Hotfix = branch from the deployed
   tag → fix → merge to `main` → retag.

---

## 5. How it works behind the scenes (extension)

Phase 1 is display + metadata only; all edits are in the extension.

| Seam | Change |
| --- | --- |
| `src/utils/fileSystem.ts` | New `readModulesManifest(root)` (mirrors `parseSessionSetConfig` conventions). `readSessionSets` gains the `module` attribute per set (from `spec.md`'s `module:` key, defaulting to the implicit module). **New validation: duplicate set names across the workspace fail loudly.** `readAllSessionSets()` merge stays keyed by `name` (identity is unchanged). |
| `src/types.ts` | `SessionSet` gains `module` / `moduleTitle`. `SessionSetConfig` gains optional `module`, validated against the manifest. |
| `src/types/sessionSetsWebviewProtocol.ts` | New `ModulePayload { slug; title; buckets: BucketPayload[] }`; `SnapshotPayload.modules: ModulePayload[]`. **`RowPayload.slug` and all action messages are unchanged** — row identity is still the globally-unique set name. |
| `src/providers/SessionSetsModel.ts` | `groupByModule(all)` before the existing `bucketSets`; reuse `sortBucket` per module. |
| `src/providers/CustomSessionSetsView.ts` | Wrap `buildBuckets` in a `buildModules` layer; `buildRow` and `findSetBySlug` unchanged. |
| `media/session-sets-tree/client.js` | Collapsible module group above the existing bucket rendering; extend collapse state with `moduleCollapsed[slug]`; key bucket collapse per `(module, bucket)`. |

Single-module / no-manifest repos produce one implicit `ModulePayload`
rendered without a module header — pixel-compatible with today.

---

## 6. How it works behind the scenes (Python / `ai_router`) — later phases

### 6.1 Phase 2: the locator API

Before any physical file moves, introduce **one locator module per side**
(TS and Python) that owns "given a slug/number/path, find the session-set
directory," and route every existing resolver through it:
`resolve_set.py`, `start_session` bare-number resolution,
`change_verification_mode` bare-slug resolution, `close_session
--session-set-dir`, `reconciler.DEFAULT_BASE_DIR`, the four migration
scanners' `_default_scan_root`, `metrics.py` / `cost_report.py`
canonicalization, `pending_verification` sibling scan, and the extension's
discovery. After this refactor, a physical layout change is a one-file
edit instead of fifteen.

### 6.2 Two known traps (must be on the Phase 3 checklist)

- **`ai_router/writer_discipline.py`** derives the workspace root as a
  **fixed parent count** from `session-state.json` (4 parents under the
  flat layout). Any deeper layout breaks the D3 writer-bypass check
  silently — it must go through the locator.
- **`ai_router/cost_report.py`** canonicalizes on the assumption that
  every set lives at `docs/session-sets/<unique-slug>`. After a physical
  move, historical metrics rows and new paths must canonicalize to the
  same key or cost aggregation silently drifts.

### 6.3 Phase 3 (optional): physical migration

- Move sets to `docs/session-sets/<module>/<NNN-slug>/` (prefix preserved).
- Worktree naming: branch `session-set/<module>/<slug>` is fine for git,
  but worktree **folders stay flat** per the repo layout standard
  (`docs/planning/repo-worktree-layout.md`) using a flattening convention:
  `<repo>-worktrees/<module>--<slug>/`. This is a deliberate,
  documented compatibility break in `worktree.py`, not an afterthought.
- One-shot migration script + drift check, following the existing
  `check_migrations.py` pattern.

### 6.4 Scope enforcement (new machinery — do not overclaim)

The original plan says integration-set sanctioning is "enforced by the
scope check" — **no such check exists today**. `writer_discipline.py`
covers state-file writers only. This is new work: a check that compares a
session set's changed paths against its module's `codeRoots` (integration
sets: the union of their `touches` modules' roots). The natural seam is
alongside `blast_radius.py` / the gate-check family. Phase 2 scope; warn
first, block later.

---

## 7. Phasing summary (what Opus should implement, in order)

| Phase | Contents | Risk |
| --- | --- | --- |
| **1. Metadata + Explorer tier** | `docs/modules.yaml` reader, `module:` spec attribute, global-uniqueness validation, 3-level Explorer, "New module" scaffold, module-targeted plan/decomposition flows, CODEOWNERS + CI templates in `docs/templates/consumer-bootstrap/`. **No file moves, no identity changes, no Python changes.** | Low |
| **2. Locators + scope check** | Shared locator API (TS + Python), route all resolvers through it, codeRoots scope check (warn mode), bare-number ambiguity errors. | Medium |
| **3. Physical layout (optional)** | `docs/session-sets/<module>/…` migration, module-qualified branches, flattened worktree folder names, migration script + drift check, writer-discipline and cost-report canonicalization fixes verified. | Highest — only if flat storage becomes a real problem |

Each phase ships independently through the normal PyPI + Marketplace
gates. This work should itself be authored as a session set per
`docs/session-constitution.md`.

### Verification (all phases)

- Unit: manifest parsing, `groupByModule`, uniqueness validation,
  implicit-module fallback.
- Layer 2/3: fixture repo with 2–3 modules + an integration module —
  assert collapsible titled module groups each containing the four
  buckets; assert a **no-manifest fixture renders today's flat view
  unchanged**; Playwright smoke for the 3-level DOM + `aria-level`.
- Phase 2+: locator round-trip tests; scope-check fixtures (in-module
  edit passes, cross-module edit warns, integration set passes).
- Full pre-commit pass + CI matrix per `CONTRIBUTING.md`.

---

## 8. Open decisions for the operator

1. **Tag scope** — per-module (`billing-v1.2.0`, default) vs repo-wide
   (`v1.2.0`). Choose per project based on deploy granularity.
2. **Scope-check strictness** — warn-only vs blocking, and when to flip.
   Recommendation: warn in Phase 2, decide on blocking after a few weeks
   of real use.
3. **Whether Phase 3 ever runs** — revisit only if the flat
   `docs/session-sets/` directory demonstrably causes friction. The
   default expectation is that it won't at this team size.

---

## 9. Deviations from the original Opus plan (summary for reviewers)

| Original plan | This recommendation | Why |
| --- | --- | --- |
| Per-module session-set numbering | **Globally unique set names; `module` is a grouping attribute** | Numbering-per-module forces composite identity through the webview protocol, prereq schema, and ~15 Python modules, for zero merge-conflict benefit |
| Phase 1 moves sets to `docs/modules/<slug>/session-sets/` | **Phase 1 keeps storage flat; physical move is a later optional phase** | Validates UI/ownership/CI with zero migration risk (GPT 5.5's phasing) |
| Physical layout `docs/modules/<slug>/session-sets/` | **`docs/session-sets/<module>/` if the move ever happens** | Preserves the hardcoded `docs/session-sets` prefix throughout `ai_router` |
| `.dabbler/modules.yaml` (verification section) | **`docs/modules.yaml`** everywhere | Plan-internal inconsistency, frozen |
| "Enforced by the scope check" | **Scope check named as new machinery** (seam: `blast_radius.py` / gate-check family) | No such check exists today |
| Worktree folder "likewise" module-qualified | **Flat worktree folders, `<module>--<slug>`** | Repo layout standard requires flat worktree folders |
| Phase 3 touches only `worktree.py` | **Locator API first; writer-discipline parent-count and cost-report canonicalization on the checklist** | These two break silently under any deeper layout |
