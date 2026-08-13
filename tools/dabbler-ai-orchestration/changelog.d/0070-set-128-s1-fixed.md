### Fixed

- **(Set 128 S1) The step list stopped showing a policy record as a
  finished step, and the close-out group row stopped colliding with the
  close-out step.** Both were reported by the operator against a live
  session, from one screenshot of the Work Explorer.

  A `path_aware_critique` / `contract_gate` / `dual_surface_mode` /
  `suggestion_disposition` entry is machinery's record ABOUT a session,
  written at **registration**, before any work exists. It rendered in the
  step list as a `complete` row — so the panel showed the path-aware
  critique, a stage that runs once at the **end of a set**, with a done
  glyph minutes after the session began. `buildStepRows` (and its Python
  original, `session_checklist.build_rows`) now render only steps, using
  `isLoggedStep` — the predicate that already decided such an entry may
  not CLAIM a planned row, so the two answers cannot diverge. The record
  is untouched in `activity-log.json`, where the close gates read it. 50
  sets carried such a row; all of them render honestly now, including
  ones that closed months ago.

  The obligations group row is renamed **`Close-out readiness`**
  (`CLOSE_OUT_GROUP_LABEL`). Set 128 made a step literally named
  *Close-out* part of the skeleton every session declares, which put two
  identically-named rows under one session — one a pending plan step, one
  this summary. They answer different questions: whether close-out has
  been executed, versus what still stands in its way.

- **(Set 126 S2) The README stopped telling operators to commit a
  gitignored file, and now names the command that finishes setup.** The
  extension README still described the project's verify type as *"written
  to `project-verify-type.txt` at the repo root and **committed** — it is
  project configuration, not machine state"*. That is the precise inverse
  of Set 124 S1's ruling: the file **is** machine/project state, the writer
  adds the `.gitignore` rule before writing it, and committing it publishes
  one seat's transport to every clone. The README now says so, and its
  setup section names `python -m ai_router.verify_type --set-env` — the
  Set 126 helper that persists `AI_ORCHESTRATION_VERIFY_TYPE` at USER scope
  on Windows and prints the `export` line on macOS/Linux — because setup is
  finished only when both halves carry the same value. The
  consumer-bootstrap `getting-started.md.template` this extension renders
  at scaffold time carries the same correction (and `dist/templates/` was
  rebuilt from it).

