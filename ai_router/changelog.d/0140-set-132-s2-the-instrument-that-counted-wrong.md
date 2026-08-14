## [Unreleased] — the instrument that counted wrong (Set 132)

### Fixed

- **(Set 132 S2) `spec_admission` no longer hoists a nested ordered list
  into the step count.** `_STEP_RE` capped a step marker's indent at three
  characters, on the reasoning that "4+ spaces is a nested list in
  Markdown". That holds under a *bullet*; under the ordinary `2. ` parent
  the content column is **3**, which is exactly where CommonMark nests a
  child list — so every nested ordered list this repo's specs actually
  write was counted as top-level steps. Set 131's Session 1 declared six
  steps, nested five precedence rules under step 2, and was reported
  `OVER CAP` at eleven, then seeded into `activity-log.json` as five plan
  rows that could never be logged as steps in their own right. Depth is
  now resolved the way Markdown resolves it, by `_top_level_step_starts`
  comparing each marker's indent against the content column of the items
  still open above it; sub-steps stay inside their parent step's text
  rather than becoming steps beside it. Across the 374 sessions in this
  repo the parse loses 25 phantom steps in five sessions, one of which
  (Set 107 S1) was being counted at 16 against a declared 9.

- **(Set 132 S2) Ceremony is classified by role, not by mention.**
  `intents_named` charged any step containing "verification", "register"
  or "close" as ceremony, so a work step reading *"Independence
  requirement. Work whose value is an independent perspective is always
  routed: session-verification, code review, security review"* was tallied
  as a verification step, and `N` — the authored work-step count
  `WORK_STEP_BUDGET` budgets — was deflated wherever a session's work
  discussed a stage. New `classify_steps()` / `work_step_count()` decide
  the question the way the skeleton already poses it: the first slot and
  the last three are the ceremony positions, a step there is ceremony only
  when it also **names** the stage it stands for, and everything else is
  work. Requiring the naming as well as the position is what keeps the
  pre-skeleton corpus honest — a session that compressed its whole tail
  into one step is charged for one ceremony step, not four.
  `intents_named` is unchanged and stays the mention primitive
  `check_step_shape` needs at a fixed position. `SessionPlan` gained a
  derived `work_step_count`, and the report now prints `N` beside the
  declared step count.

### Changed

- **(Set 132 S2) `spec_admission --spec` exits non-zero when the named
  spec fails admission.** It used to print `OVER CAP` and return success
  unless `--check` was passed, which is a gate announcing a violation and
  permitting it. `--spec` names one spec, which the caller is authoring
  and wants a verdict on. `--all` deliberately stays a census and still
  needs `--check` to gate: 47 sessions across 31 of this repo's 131 specs
  are over cap with no declared exception, so an enforcing default there
  would be a gate that always fires. `--check` still means "enforce" in
  either mode. Journaled in the set's `decisions.jsonl`
  (`goal-over-letter`).

  Not the cause of the Set 131 incident, and the code now says so:
  `start_session` does not consult the admission test at all, so those
  eleven mis-parsed rows would have been seeded whatever `--spec`
  returned. The parse was the defect.

- **(Set 132 S2) The "longest sessions on record" claim is corrected in
  both places it was printed** (`spec_admission`'s docstring and
  `session-set-authoring-guide.md`). Re-running the probe on the fixed
  parser over 225 sessions found longer sessions than the quoted 591 /
  562 / 544 / 509 minutes — and found why. Duration is
  `completedAt - startedAt`, elapsed **calendar** time: 15 sessions were
  registered on one day and closed the next, **all 15 sit in the 23
  longest sessions on record**, and excluding them takes the population
  p90 from 301 to 147 minutes. Trimming idle gaps from `activity-log.json`
  step timestamps instead takes it from 311 to 140. The cap did not move —
  the median still steps up between `N = 3` and `N = 4-5` — but the tail
  it disclaims responsibility for was mostly sleep. Method, tables and
  caveats:
  `docs/session-sets/132-session-length-and-explorer-captions/s2-measurement.md`.
