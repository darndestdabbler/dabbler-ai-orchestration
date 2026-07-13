# Verdict — Module lifecycle simplification panel

> **Status:** OPERATOR-CONFIRMED 2026-07-13 — the operator accepted the
> Sol-adjudicated design and directed session-set authoring ("let's
> create the session sets to implement this"). This verdict is the
> design of record for module lifecycle simplification.
> **Panel:** round 1 — gpt-5-4 (`consensus-gpt-5-4.md`) and gemini-pro
> (`consensus-gemini-pro.md`), routed independently 2026-07-13 with the
> bias-cautions preamble, neither saw the other's review. Round 2 —
> gpt-5-6 "Sol" (`consensus-gpt-5-6.md`) adjudicated the contested
> refinements under the operator's simplicity-at-a-premium criterion.
> Raw responses are immutable. Journaled in
> `ai_router/consensus-decisions.jsonl` (2026-07-13, two records).
> **Synthesizer:** claude-fable-5 (session orchestrator).

## Bottom line

All three engines endorse P1+P2+P3. The one substantive amendment
(convergent across all three): the session set is the **audited
transaction**, not the artifact — `project-plan.md` stays stable and
amendable; plan/decomposition sets are **typed by a small optional
`kind` attribute**, never by magic set numbers (numbers are global, so
only the first module gets literal 001/002). Verification on planning
documents was unanimously judged proportionate: the plan is the
highest-leverage artifact and a mandatory-verification policy already
exists.

## Adjudicated decisions (Sol, simplicity premium applied)

1. **Slug stays identity.** Rename = preflighted, all-or-nothing
   rewrite of `modules.yaml` + every affected `module:` stamp. Reject
   renames that would merge with an undeclared slug's existing history.
   `moduleId`, tombstones, and a slug registry: **cut** (overengineering).
2. **Delete = operator's rule.** Remove manifest entry; cancel
   non-terminal sets with the existing `CANCELLED.md` writer; completed
   sets fall into the existing fallback group. No archive state.
   Re-adding a deleted slug explicitly restores its preserved history.
3. **Removal exception = type + execution state.** Remove outright only
   an unstarted `kind: plan|decomposition` set with no execution
   artifacts. Content hashing / untouched-template detection: **cut**.
4. **No forced migration.** Legacy pseudo-Default behavior is
   preserved; migration is a documented optional manual/AI-assisted
   path. Guided modal migration (round-1 gemini): **declined**.
5. **Keep the `kind` attribute, minimally.** Optional, machine-readable
   only where needed (decomposition precondition, delete's removal
   rule); it must not grow into a workflow/state schema.
6. **Decomposition gating reuses `prerequisites:`.** The scaffolded
   decomposition set declares its sibling plan set as a prerequisite —
   no new gating mechanism.

## Round-1 positions superseded by adjudication

- gpt-5-4's `moduleId`/tombstone/slug-registry package (decision 1–2).
- gemini-pro's guided one-time migration modal (decision 4).
- gpt-5-4's P2+P3-first sequencing — **atomic bundle adopted** (Sol +
  gemini): P3's Class1-style rename/delete comfort depends on P2's
  writers, and its scaffolded sets depend on P1's behavior. "Atomic"
  means one session-set sequence with a **single release boundary after
  the last set** — the Sets 091–094 pattern.

## Decomposition (authored 2026-07-13)

1. **Set 098 — `098-module-plan-and-decomposition-set-kinds`** — the
   optional `kind` field (types, parser, schema doc), the plan/
   decomposition spec templates with the special AI guidance, the
   module-lifecycle-sets scaffold writer, prerequisite-based
   decomposition gating.
2. **Set 099 — `099-module-rename-and-delete-writers`** — the
   transactional rename writer + preflights, the delete writer with the
   cancel/remove rules, palette commands. UI wiring waits for Set 100.
3. **Set 100 — `100-work-explorer-module-lifecycle-ui`** — remove the
   `Plan`/`Session sets` child levels (buckets nest directly under the
   module), kind-aware set rows, module-row management actions (Open
   plan / Add / Rename / Delete), retire the superseded strip actions,
   Add-module scaffolds the two lifecycle sets, Layer 2/3 pins.
4. **Set 101 — `101-default-module-scaffold-and-docs`** — scaffold
   writes the real `default` module + its two lifecycle sets (Class1
   pattern), legacy pseudo-Default untouched, docs (hello-world
   tutorial update, module-reorg + migration guidance).

**Release boundary: no Marketplace/PyPI publish until Set 101 closes.**

## Items the operator has confirmed

1. P1/P2/P3 with the transaction-not-artifact amendment and the
   optional `kind` field.
2. Adjudications 1–6 above (simplicity premium).
3. The four-set decomposition with a single release boundary.
