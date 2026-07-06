# Change Log — Set 080 (Getting Started Sub-Choice Legibility)

> **What this set delivered:** A presentation-only restyle of the two
> Getting Started second-level radio groups (Provider access and
> Verification mode). At the operator's request during Set 079's UAT,
> each option was changed to a more legible, table-like layout of radio
> button, bold name, and description per row.
>
> **Non-goals (unchanged):** This set did not change the wording,
> values, schema, or persistence behavior of the options. The underlying
> `ai_router` was also unchanged.
>
> **Release:** extension **0.36.0** — published 2026-07-05, tag
> `vsix-v0.36.0`, commit `2efaa92`, publish run 28760570916;
> extension-only, `dabbler-ai-router` stays 0.28.0.

---

## Session 1 of 2 — Row-structured option layout for both sub-choice groups

**Status:** SKIPPED (routed gate)

Landed the presentation-only restyle for the two second-level radio
groups in the Getting Started form. A shared helper now renders each
option as a theme-aware, grid-aligned row containing the radio button, a
bolded short name, and the description. The copy was split for display
only; the source constants and all radio values remain unchanged. Layer-2
tests were updated to assert the same literal strings across the new
markup, with all persistence and visibility tests passing without
semantic edits. The set's routed verification gate was skipped under Set
068 policy, as the change was small and self-contained, deferring the
set's judgment to the Session 2 operator UAT.

---

## Session 2 of 2 — UAT, screenshot, and release

**Status:** VERIFIED (cross-provider, round 2)

Authored and conducted the UAT walk, which the operator attested as PASS
across all items, including the core judgment that the new row layout
improved legibility. A minor checkbox oversight from the walk was
resolved via chat attestation. The operator captured a refreshed
screenshot of the Getting Started form, updating an image that predated
the provider-access group. The extension was released as version 0.36.0,
and operator feedback from the UAT queued follow-up Set 081 to scope
the verification-budget input. Verification round 1 found and fixed a
doc-consistency issue before the final pass.