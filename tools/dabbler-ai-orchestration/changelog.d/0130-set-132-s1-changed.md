### Changed

- **(Set 132 S1) The sidebar reads `AI Work Explorer` — once.** This
  **supersedes the Set 123 S3 entry under *Removed*** ("the activity-bar
  container is `AI Orch`"), which is still pending in this same unreleased
  section and never reached the Marketplace. Read them together and only
  this one describes what ships.

  The header is **composed**, not stored: a single-view container merges
  its one view into the sidebar title and joins the two names with `: `
  **unless they are identical**. Set 123 S3 hit that join as **AI WORK
  EXPLORER: WORK EXPLORER** and broke it by renaming the container to `AI
  Orch`, which cured the duplication but left the panel labelled with an
  abbreviation. Setting the container `title`, the view `name` and
  `contextualTitle` all to `AI Work Explorer` collapses the join instead,
  so the header is the panel's actual name and says it once. Verified
  against a running workbench — Layer 3 asserts the **rendered** header
  rather than the manifest fields, since the manifest is only the input to
  a rule VS Code owns. No command id, keybinding or `when`-clause changed.

- **(Set 132 S1) The close-out readiness row no longer says `not
  computed`.** The readiness answer renders in the same gray slot that
  carries the projection's own `as of HH:MM` timestamp, so an **empty**
  slot already says no answer has been computed — the phrase was a second
  rendering of a fact the row was already carrying (operator ruling,
  2026-08-14). Set 127 S2's rule that "no answer" and "nothing remains"
  are opposite facts is unchanged and still enforced: an all-clear is
  dated and takes the done glyph, an un-run projection is undated and
  cannot, and the hover still names
  `python -m ai_router.close_preflight … --write` as the way to resolve it.
