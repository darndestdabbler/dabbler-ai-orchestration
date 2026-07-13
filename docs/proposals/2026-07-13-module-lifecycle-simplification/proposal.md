# Proposal — Module lifecycle simplification (plan/decomposition as session sets; module management; real Default)

> **Author:** operator (2026-07-13), refined through two consensus rounds
> (see `verdict.md` for the panel record and the adjudicated decisions).
> **Design criterion (operator-set):** simplicity at a premium — when two
> options are close, the simpler one wins.
> **Builds on:** the shipped module-first Work Explorer
> ([`2026-07-11-work-explorer-module-first-ux`](../2026-07-11-work-explorer-module-first-ux/proposal.md),
> Sets 091–094).

## Problem

After the module-first redesign, three rough edges remain:

1. **Plans and decompositions bypass the quality machinery.** Plan
   authoring, plan import, and decomposition run through four separate
   per-module flows (copy-a-prompt, file-import dialog) — none of them
   session sets, so the two highest-leverage artifacts in a module get
   no verification rounds and no session-set audit trail.
2. **The tree pays for it.** Every module carries two extra semantic
   child levels (`Plan`, `Session sets`) whose main job is signaling
   state that session sets could carry themselves.
3. **Modules can't be managed safely.** There is no rename or delete
   command. A hand-rename in `docs/modules.yaml` strands every set
   stamped with the old slug into an undeclared-slug fallback group.

## Proposal

### P1 — Plan and decomposition become session sets

Every module's plan creation/import and its decomposition are session
sets — for a fresh module, its first two sets. They run through the
full existing pipeline (spec, sessions, mandatory verification,
close-out), which delivers: (a) verification input on the plan and the
decomposition, (b) a tree with no separate Plan level, (c) an audit
trail for both artifacts, (d) one unified initiation flow instead of
four.

**The session set is the audited transaction, not the artifact** (all
three panel engines, convergent). `docs/modules/<slug>/project-plan.md`
stays the stable artifact; a later plan amendment or a
continue-decomposition pass is simply another set of the same kind.
Nothing is frozen.

**Typing is by a `kind` attribute, not by set number.** Set numbers are
global, so only the first module can literally own Sets 001/002. A
small, optional `kind: plan | decomposition` field in the spec config
block carries the machine-readable identity; the special AI guidance
lives in the scaffolded spec text of those sets. Sets without `kind`
are ordinary work sets — fully backward compatible.

**Decomposition is gated on the plan by existing machinery**: the
scaffolded decomposition set declares a `prerequisites:` entry on its
sibling plan set. No new gating code; the Explorer's existing
`[BLOCKED BY PREREQS]` badge does the work.

### P2 — Module management on the module node

The module row (and Command Palette) gains: **Open plan**, **Add
module**, **Rename module…**, **Delete module…**.

- **Rename** is a preflighted, all-or-nothing writer: update the
  manifest entry and restamp `module:` in every affected set's spec.md
  in one transaction. Preflight rejects a rename that would collide
  with an existing declared slug or merge into an undeclared slug's
  existing history, and refuses while an affected set has a running
  session. Slug remains the module's identity — no `moduleId`, no
  tombstones, no slug registry (adjudicated: overengineering).
- **Delete** removes the manifest entry, cancels non-terminal sets via
  the existing `CANCELLED.md` cancel writer, and outright removes only
  an **unstarted** `kind: plan|decomposition` scaffold with no
  execution artifacts. Completed sets are untouched — they fall into
  the existing fallback group (audit history preserved). Emergent
  property: re-declaring a deleted slug restores its history.
- **Complex reorganizations** (split/merge modules) stay an
  ask-the-AI path with written guidance — no UI.

### P3 — "Build the project structure" creates a real Default module

The scaffold writes a real `default` entry into `modules.yaml` and
scaffolds its plan set (Set 001) and decomposition set (Set 002),
carrying the special AI guidance. This is deliberately the Visual
Studio `Class1` pattern: developers routinely rename or delete the
scaffolded starter, so the flow is familiar — rename Default via P2,
or add real modules and delete it.

**No forced migration** (adjudicated). Legacy repos with the
pseudo-Default arrangement keep working unchanged — the pseudo-module
rendering path stays. Migration is a documented manual/AI-assisted
path for operators who want it.

## What this retires

- The `Plan` and `Session sets` child levels in the tree (buckets nest
  directly under the module row; plan/decomposition state is visible as
  the kind-typed sets themselves).
- The `AI Plan` / `Import Plan` / `AI Sets` module-row strip actions
  (superseded by the scaffolded kind sets; palette commands survive for
  legacy repos). `Open Plan` survives on the row.

## Explicitly cut as overengineering (panel-adjudicated)

Immutable `moduleId`; tombstone/archive lifecycle; persistent
slug-reuse registry; forced/modal migration; content-hash "untouched
template" detection; any planning state machine beyond the single
optional `kind` field.

## Decomposition

Four sets, one release boundary after the last — see `verdict.md`.
