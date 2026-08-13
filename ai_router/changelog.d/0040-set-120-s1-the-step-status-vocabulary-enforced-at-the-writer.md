## [Unreleased] — the step-status vocabulary, enforced at the writer (Set 120 S1)

### Added

- **(Set 120 S1) A closed step-status vocabulary, and a writer that fails
  closed on anything outside it.** `ai_router.session_log` now defines
  the four tokens that are both measured in use across every
  `activity-log.json` in the repo **and** nameable by every reader —
  `complete`, `in-progress`, `pending`, `blocked` — and exports
  `CANONICAL_STEP_STATUSES`, `ALLOWED_STEP_STATUSES`,
  `is_valid_step_status`, `validate_step_status`, `require_step_status`,
  `suggest_step_status` and `InvalidStepStatusError`. Nothing was
  invented; the vocabulary is a confirmation of practice.

  **`skipped` is deliberately excluded** (operator ruling, 2026-08-11)
  even though it appears once on disk. It has no entry in
  `session_checklist.STATUS_BOXES`, so it renders as `[?]` — the
  corrupt-data glyph — and neither `_mark_here` nor the Work Explorer's
  mirrored `markHere` counts it as terminal, so a skipped step steals the
  current-step marker from real work. Admitting a token the readers
  cannot name is the exact defect this change exists to prevent, so the
  vocabulary is the *intersection* of what was measured and what the
  readers understand. Teaching both readers is a two-language change that
  belongs with the extension carve.

  This follows the Set 086 S1 pattern for verification verdicts:
  **readers stay lenient, the writer is strict.** Every reader keeps
  rendering whatever it finds on disk — history is a record, not a bug to
  crash on — while nothing a reader cannot name may be written from here
  on.

### Changed

- **(Set 120 S1) `SessionLog.log_step()` raises `InvalidStepStatusError`
  on a status outside the vocabulary.** Previously it accepted arbitrary
  strings, and roughly 10% of the step entries on disk carry a token no
  reader recognises: "done" is spelled four ways, and prose up to ~1,500
  characters had been written into the status field. The consequence was
  visible — Set 119 S2 wrote `completed`, and the whole session rendered
  as not-started with the `<- here` marker stranded on step 1, because
  `session_checklist` selects the first *non-terminal* row and an
  unparseable row is never terminal.

  **Breaking for library consumers** that log a non-canonical status.
  `InvalidStepStatusError` subclasses `ValueError`, so existing
  `except ValueError` handlers still catch it. Near-misses the readers
  happen to tolerate (`completed`, `done`, `Complete`, `" complete"`) are
  refused too, and the refusal names both the legal set and the token the
  caller most likely meant.

- **(Set 120 S1) `SessionLog.append_entry()` validates a `status` when
  one is present.** Absence is still accepted: "no status recorded" is a
  different defect from "a status no reader can name", and Set 120 S3
  owns it explicitly.

- **(Set 120 S1) The four writers that bypass `SessionLog` now route
  through the same chokepoint.** `contract_gate`,
  `path_aware_critique`, `dual_surface_verify` and
  `suggestion_disposition` each do their own read-modify-write of
  `activity-log.json`. All four already hard-coded `"complete"`, so none
  could drift at runtime — but an allowlist at one entry point is
  worthless if another path writes the file directly (`L-069-1`). Each
  now spells the token from the shared `STEP_STATUS_COMPLETE` constant
  and passes it through `require_step_status`, and a structural `ast`
  scan over every production module enforces the rule for writers that do
  not exist yet.

