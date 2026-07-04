# UAT improvement — source notes for the future session set

> **Status:** pre-authoring notes, captured 2026-07-04 when the operator
> suspended the Set 077 UAT. Input for the UAT-improvement session set that
> follows Set 078 (see the sequencing in the Set 077 activity log, session 6).
> The governing principle now lives in
> [`project-guidance.md`](project-guidance.md) → "UAT is written for a
> stranger and pre-verified by automation".

## What went wrong in the Set 077 UAT (operator report)

- Steps required guessing what was being asked, even after a
  name-the-exact-buttons clarification pass and a pre-baked starter kit.
- When an expected element did not appear, the operator could not tell
  whether the product was broken or the instruction was misread — the
  walk could not produce a trustworthy attestation either way.
- Instructions were written as if the human shared the orchestrator's
  context ("sharing a portion of the same brain"); reading level too high.
- Net effect: UAT was costly, tedious, and trust-undermining. The operator
  suspended it rather than finish.

## Direction to evaluate

1. **UAT DSL** — operator prototype at `D:\Projects\dabbler-uat-dsl`:
   a DSL for expressing human-action steps such that they compile to
   Playwright tests. Known imperfect; evaluate honestly against
   alternatives rather than adopting by default.
2. **Hard gate:** any part of a UAT walk that Playwright *can* execute must
   pass as a Playwright test *before* the checklist is offered to a human.
   The human should only ever walk the residue automation cannot verify
   (visual judgment, feel, cross-app flows).
3. A second AI engine following the instructions cold is a cheap
   followability test for the residue steps (the "can a stranger execute
   this?" check), worth considering as a pre-UAT gate too.

## Constraints from the same conversation

- **Simplicity-first:** the fix for UAT must not be another layer of
  complexity. Prefer removing/shrinking the human walk over adding
  tooling; if tooling is added (DSL compiler etc.), it must earn its
  complexity by deleting human steps.
- Extension E2E surface is the Layer 3 Playwright rendering harness —
  the natural place a compiled walk would run.

## Deferred work this set must eventually unblock

- Revisit and complete the Set 077 UAT under the improved experience.
- Run Set 078 UAT the same way.
- Complete the suspended 077 release: VSCE_PAT renewal, tag pushes
  `v0.27.0` + `vsix-v0.34.0`, Marketplace publish (0.34.0 VSIX is
  sideloadable meanwhile).
