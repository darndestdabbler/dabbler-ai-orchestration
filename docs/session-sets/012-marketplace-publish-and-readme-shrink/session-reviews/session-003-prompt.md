# Cross-provider verification — Set 12 Session 3: README shrink + `docs/repository-reference.md` spinout

You are reviewing the **final session** of Set 012, which restructures
the repo-root `README.md` from a ~700-line feature tour into a lean
~150–200-line on-ramp, and moves the deeper feature descriptions, the
UAT/E2E flag matrix, the worked end-of-session example, and the
repository file map into a new `docs/repository-reference.md`. The
shrink is **restructure, not cull** — every section that moves out of
the README lands intact in the reference doc.

The deliverables are documentation-shaped: a heavy edit on `README.md`
(net reduction ~70%, with the body content largely moving rather than
disappearing), a new file at `docs/repository-reference.md` carrying
the moved content verbatim plus a small front-matter + pointer table,
a one-line edit to Set 011's spec prerequisite, and a cross-link audit
to make sure no internal link points at a fragment that no longer
exists.

**Goal of the verification:** does the lean README still read as an
inviting on-ramp that gets a curious reader from "what is this?" to
"how do I try it?" in under 250 lines, without dropping any content
that genuinely matters? Does the reference doc carry the moved content
intact and resolve cleanly from the README's feature bullets? Are the
internal cross-links sound — both new ones from the README into the
reference doc, and any pre-existing links elsewhere in the repo that
might have pointed at the old README anchors?

---

## Spec excerpt for Session 3

```markdown
### Session 3 of 3: README shrink + technical-detail spinout to `docs/repository-reference.md`

**Goal:** Take the repo-root README from ~700 lines (feature-tour
shape) to ~150-200 lines (lean inviting on-ramp shape). Move the file
map, the UAT/E2E flag matrix, the worked end-of-session output, and
the deeper feature descriptions to a new `docs/repository-reference.md`.

**Steps:**

1. **Confirm Session 2's Marketplace publish landed** — read the
   current Marketplace listing URL and confirm the extension is
   installable via `code --install-extension
   darndestdabbler.dabbler-ai-orchestration`. If Session 2's human
   handoff hadn't completed by the time Session 3 starts, the
   orchestrator falls back to "Install from VSIX" copy in the Quick
   Start (with Marketplace path noted as "coming soon"). Operator
   confirms which copy to use at session start.
2. **Author `docs/repository-reference.md`** — the destination doc.
   Structure:
   - "Highlighted features (deep dive)" — the multi-paragraph feature
     blocks currently in the README's "Highlighted features" section
     move here verbatim. Anchor links matching the README's old
     fragment IDs preserved.
   - "Repos that need UAT and/or E2E support" — the entire matrix +
     decision tree currently in the README, moved verbatim.
   - "End-of-session output (worked example)" — the current README's
     worked example, moved verbatim.
   - "Repository file map" — the entire file-map section, moved
     verbatim.
   - "Pointers" — short list of "this used to be in the README; if you
     came looking for X, find it at section Y of this doc."
3. **Shrink the repo-root `README.md`** — new structure:
   - Hero screenshot + 1-paragraph value prop.
   - 3-paragraph elevator pitch trimmed from "What this repo is for".
   - 4-6 feature bullets — each 1-2 sentences with a link to the
     matching deep-dive section in `docs/repository-reference.md`.
   - Quick start (3 steps).
   - Prerequisites: tools and accounts (kept, lightly tightened).
   - License.
   - Footer pointer to `docs/repository-reference.md`.
4. **Internal cross-link update.**
5. **Update Set 011's spec prerequisite line** to "Set 012 must be
   closed."
6. **Word-count / line-count check** — repo-root `README.md` should be
   under 250 lines (target: ~150-200) and `docs/repository-reference.md`
   should hold roughly what came out of the README plus its own
   front-matter and pointer table.
7. **Verify all internal links resolve** — `grep -rln 'README.md\|repository-reference.md'`
   and walk each link.
8. **End-of-session cross-provider verification.**
9. **Commit, push, run close-out.** Final session — write `change-log.md`.
```

---

## Operator decision recorded for this session

The Marketplace publish (Set 012 Session 2 deliverable) has **not**
yet landed at this session's start: the workflow file
(`.github/workflows/publish-vscode.yml`) and runbook
(`docs/planning/marketplace-release-process.md`) shipped in Session 2,
but the Microsoft account creation, Azure DevOps PAT minting, GitHub
`marketplace` environment configuration, and first `vsix-v0.13.0` tag
push are operator-driven and have not been completed. The new README's
Quick Start uses **Install-from-VSIX copy** with a single-sentence
note flagging the Marketplace publish as in-flight. Once the publish
lands, a follow-up patch can swap the Quick Start to one-click
Marketplace install (the runbook documents that flow already).

---

## Files authored / changed in this session

### NEW: `docs/repository-reference.md` (~480 lines)

Front-matter (purpose + audience + companion pointers), then a
"Pointers" section that names where each old README section now
lives, then four sections carrying the moved content **verbatim**:

- **Highlighted features (deep dive)** — sections 1 through 6 from the
  old README's "Highlighted features", plus "Other features worth
  knowing", with anchor IDs preserved (`#1-work-is-organized-into-session-sets-and-sessions`,
  `#2-cost-minded-orchestration`, `#3-cross-provider-verification`,
  `#4-git-integration-and-parallel-session-sets`,
  `#5-batching-and-robust-fallbacks`, `#6-uat-checklist-editor-integration-with-e2e-pre-screening`).
  Internal references to other repo files updated to use `../`-prefixed
  relative paths since this doc lives in `docs/`. Two small
  factual updates merged in during the move: (a) the "Session sets and
  sessions" section now folds in the file-presence state-derivation
  table that was a separate "Session Set Explorer in action" section
  in the old README; (b) the file map's `ai_router/__init__.py` line
  number reference was retained, and a new row for
  `ai_router/close_session.py` was added (it didn't have a file-map
  entry in the old README despite shipping in Set 003).
- **UAT and E2E support: when to opt in** — the entire matrix +
  decision tree + hard-disable settings + new-spec-flag heuristics
  section, moved verbatim.
- **End-of-session output (worked example)** — the verbatim worked
  example.
- **Repository file map** — the entire file-map section, moved
  verbatim. Updated to reflect current state: the `tools/dabbler-ai-orchestration/`
  block now matches the TS-based shape (the historical
  `vscode-session-sets/extension.js` line is gone — it was already
  superseded in the old README, but the move is a chance to confirm).
  The `docs/` block gained rows for `repository-reference.md` (this
  file), `adoption-bootstrap.md` (Set 013), `release-process.md`
  (Set 010), `marketplace-release-process.md` (Set 012 Session 2),
  and `sample-reports/` (the credibility anchor for the cost-
  orchestration feature bullet).

### EDIT: `README.md` (728 → 228 lines, ~69% reduction)

```diff
 # Dabbler AI Orchestration

 An AI-led coding-session workflow for VS Code. ...

 ![Session Set Explorer in action](tools/dabbler-ai-orchestration/media/session-set-explorer-in-action.png)

-...
-(700 lines of feature-tour body content, file map, worked example, UAT/E2E matrix, etc.)
-...

+## What this repo is for
+
+(3-paragraph elevator pitch, no per-feature drill-down, ends with pointers to ai-led-session-workflow.md and repository-reference.md)
+
+## Highlights
+
+(4-6 feature bullets, each 1-2 sentences, each linking to repository-reference.md#section)
+
+## Quick start
+
+(3 numbered steps: Install-from-VSIX with Marketplace-coming note, open workspace, run Dabbler: Install ai-router)
+
+## For new projects: adoption bootstrap
+
+(Kept from Set 013 — the recommended starting point for greenfield)
+
+## Prerequisites: tools and accounts
+
+(VS Code, orchestrator agents list, three-API-key list, optional Pushover)
+
+## More
+
+(Footer pointer to repository-reference.md, ai-led-session-workflow.md, sample-reports/)
+
+## License
+
+(MIT, with the duplicate-LICENSE-for-vsce note)
```

The lean README's six feature bullets (in order):

1. **Session sets and sessions** → `repository-reference.md#1-work-is-organized-into-session-sets-and-sessions`
2. **Cost-minded orchestration** → `repository-reference.md#2-cost-minded-orchestration` + the `docs/sample-reports/` link as the credibility anchor for the 73% / 32% Opus-baseline savings claim
3. **Cross-provider verification** → `repository-reference.md#3-cross-provider-verification`
4. **Git integration + parallel session sets** → `repository-reference.md#4-git-integration-and-parallel-session-sets`
5. **Robust fallbacks** → `repository-reference.md#5-batching-and-robust-fallbacks`
6. **UAT + E2E support (opt-in)** → `repository-reference.md#uat-and-e2e-support-when-to-opt-in`

### EDIT: `docs/session-sets/011-readme-polish/spec.md`

```diff
-> **Prerequisite:** Set 010 (`010-pypi-publish-and-installer`) must be closed. ...
+> **Prerequisite:** Set 012 (`012-marketplace-publish-and-readme-shrink`) must be closed. Set 012 does the structural rewrite (~700 → ~150-200-line README + spinout to `docs/repository-reference.md`); Set 011 does the polish pass (screenshots, sample-report excerpts, posture-shift framing) on top of that lean structure rather than the bloated original. Originally this prerequisite was "Set 010 must be closed"; reordered as part of Set 012 Session 3's housekeeping touch when the README shrink became the more load-bearing predecessor.
```

### Cross-link audit results

`grep -rln 'README.md#'` from the repo root returned only matches
inside `docs/session-sets/012-.../spec.md` (the spec describing this
work — meta references, not navigation links) and `docs/session-sets/.../change-log.md` (historical references in
already-closed sets). No actual broken anchor remains.

`grep -rln 'README.md'` returned hits in:
- `docs/repository-reference.md` (this session's new file) — both
  references resolve to `../README.md` correctly.
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — checked, no anchor links to
  the old README sections; they reference the file by name only as
  context.
- Various session-set specs and change-logs — historical references,
  no broken anchors.

The progress key from the spec — "no `README.md#<fragment-no-longer-in-readme>`
link is dead anywhere in the repo" — is satisfied.

---

## What to verify

Please act as the cross-provider verifier. Apply the standard
session-verification template (return JSON
`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}` with each
issue carrying severity Critical/Major/Minor).

Specifically probe:

1. **Lean README tone.** Does the new README read as inviting and
   give a reader a clear "how do I try it?" path, or has the shrink
   stripped enough context that a first-time reader bounces off
   without understanding the value? Specifically: does the 3-paragraph
   elevator pitch capture session-set/session structure, the
   orchestrator-router split, and the cross-provider verification
   discipline tightly enough that a reader who only reads the
   elevator gets the framework's shape? Is the tone confident-
   without-overselling (no "paradigm shift" / "AI-first" /
   "revolutionary")?

2. **Feature-bullet calibration.** The six bullets are 1-2 sentences
   each. For each bullet, does the sentence count correctly identify
   the load-bearing single fact about that feature, or does the
   compression elide a detail a reader needs? Is the link target
   correct (anchor exists in `repository-reference.md` with the
   matching content)?

3. **Reference-doc completeness — verbatim moves.** Compare the
   "Highlighted features (deep dive)" section in
   `repository-reference.md` against the README's *previous*
   "Highlighted features" section (sections 1-6 + "Other features
   worth knowing"). Every paragraph that was in the README must
   now be in the reference doc. Anchor IDs (`#1-work-is-organized-…`,
   `#2-cost-minded-orchestration`, etc.) must match what the README's
   feature bullets link to. Flag any drift — even minor wording
   changes — as Minor (the spec is explicit: "every section that
   moves is preserved verbatim").

4. **Reference-doc completeness — UAT/E2E matrix.** Same check
   against the README's previous "Repos that need UAT and/or E2E
   support" section. Matrix rows preserved? Hard-disable settings
   subsection preserved? "Deciding the flags for a *new* spec"
   subsection preserved? Spec authoring guide reference preserved?

5. **Reference-doc completeness — worked example.** The verbatim
   stop-message example, the four "things worth noticing" bullets,
   and the three "other artifacts" bullets — all preserved?

6. **Reference-doc completeness — file map.** Compare against the
   README's previous file map. Every row preserved? The 12 new rows
   I added (close_session.py + the docs/ block additions
   — repository-reference.md, adoption-bootstrap.md,
   release-process.md, marketplace-release-process.md, sample-reports/)
   — are these accurate? Note: the spec said "moved verbatim" for the
   file map; my edits added a few rows that document the doc files
   themselves. Flag if you think this drifts from "verbatim" — I'd
   argue documenting the new docs is a reasonable update because
   leaving them out would now be a stale file map; the verifier's
   call.

7. **Quick Start fallback copy.** The new README's Quick Start uses
   "Install from VSIX" because the Marketplace publish hasn't landed
   yet. Is the framing of "the first Marketplace publish (`v0.13.0`)
   is in flight" calibrated correctly — readers who try the VSIX
   path today should get a working install, and readers who come
   back after the publish lands should not be confused by the
   wording?

8. **Adoption bootstrap section retention.** The "For new projects:
   adoption bootstrap" section is *kept* in the README (not moved to
   the reference doc). Does this make sense given Set 013 just
   shipped this and it's the recommended starting point for
   greenfield? Does the section's placement (after Quick Start,
   before Prerequisites) work, or does it create confusion about
   when to use Quick Start vs. the bootstrap prompt?

9. **Cross-link integrity.** The "More" section at the bottom of
   the README links to `docs/repository-reference.md`,
   `docs/ai-led-session-workflow.md`, and `docs/sample-reports/`.
   Each anchor link from the feature bullets into the reference doc
   has a target in the reference doc. The reference doc's links
   back into the repo (`../ai_router/...`, `../tools/...`,
   `../README.md`) all resolve. Walk a representative sample: at
   minimum the six feature-bullet links from the README, and the
   "Companion to" + file-map links in the reference doc.

10. **Set 011 prerequisite update.** The one-line edit changed the
    prerequisite from "Set 010 must be closed" to "Set 012 must be
    closed." Is the new wording self-consistent with Set 012's
    actual deliverable (the README shrink, which is what Set 011's
    polish pass needs as a predecessor)? Does the parenthetical
    explanation read as appropriate context or as defensive prose?

11. **Word-count / line-count.** README is 228 lines (target:
    150-200). Reference doc is 484 lines. Total: 712 lines vs. the
    original 728 — close to a 1:1 restructure as the spec required.
    Flag if 228 feels high (over-target) or genuinely lean.

12. **Anything else the spec called out.** The spec's Session 3
    cross-provider-verification step says the verifier should
    review "README diff for tone (does the lean shape read as
    inviting? does the value prop survive the shrink?), the new
    reference doc for completeness (every section that left the
    README must land in the reference doc), the cross-link
    integrity. Wording-quality issues are normal at this step;
    expect a small Round 2 if the lean copy needs tightening."
    Confirm each is covered above and flag anything specific to
    those probes that you'd want to see addressed.

Return your verdict in the standard JSON shape.
