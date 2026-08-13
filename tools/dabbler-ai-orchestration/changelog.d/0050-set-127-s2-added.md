### Added

- **(Set 127 S2) The Work Explorer says which step a session is ON, and
  since when.** Expand an in-flight session and the step it is actually
  working now carries the **in-progress** glyph, says so in its tooltip,
  and shows its start time (`12:06-`) in the dimmed slot at the end of the
  row. Neither fact was ever written to disk: `start_session` seeds every
  planned step as `pending` and `log_step` writes `complete` *after* a step
  finishes, so the tree could not tell *"step 5 has not been started"* from
  *"step 5 has been running for forty minutes"* — the exact question the
  in-progress icon exists to answer. Both are **derived** at read time from
  rows the tree already reads, which is why they also light up on sets that
  closed months ago.

  The rule is deliberately silent rather than confident. It fires only on a
  session `session-state.json` reports as in flight; it stands down
  entirely the moment any row already says `in-progress`, `blocked` or
  `failed` (the record has answered); it will never mark two rows at once;
  an unrecognised status token makes it silent rather than confident; and a
  step that has not started shows no time at all, because a seeded row's
  own timestamp is *registration* time, not a start. This is not the
  `<- here` marker returning — that named exactly one row whether or not it
  knew, which is how it came to point at a step that had finished hours
  earlier.

  `providers/sessionStepModel.ts` gains `sessionFlightFacts`,
  `activeStepIndex`, `deriveProgress` and `effectiveStatusOf`, mirroring
  the Python originals in `ai_router/session_checklist.py`; the
  cross-language parity corpus grew from 14 cases to 22 and now compares
  both derived fields in both languages, with the derivation's
  does-not-fire direction pinned case by case.

- **(Set 115 S4) The Work Explorer's sixth level: what still stands
  between an in-flight session and its close.** Expand the session in
  flight and, under its steps, a **Close-out** row summarises the
  obligations `close_session` will check — `1 blocking, 3 advisory`, or
  `nothing outstanding` — and expands to one row per obligation, each
  carrying the predicate's own remediation in its tooltip.

  Two in five sessions fail close-out at least once, always on an
  obligation nobody knew about until a gate refused. This is that list,
  on the surface the operator already watches while work is in flight.

  **The tree never computes it.** `python -m ai_router.close_preflight
  --session-set-dir <set> --write` does, and the tree reads the file it
  writes. The preflight takes 2–7 seconds (git-backed predicates plus
  interpreter startup); calling it from a view that redraws on every
  watcher tick would have made the panel feel broken and made a display
  feature fail whenever the interpreter was unresolvable.

  **It says how old its answer is, in four ways, and never claims more:**

  - **absent** — nobody has run the preflight for this session. The row
    says `not computed` and names the command, because "no answer" and
    "nothing remains" are opposite facts.
  - **unreadable** — the file is damaged, from a newer schema, or carries
    a row this build cannot parse. It takes the cancelled glyph rather
    than quietly rendering as empty; a damaged record is never silently
    shortened into a confident one.
  - **stale** — the set directory has changed since the projection was
    computed. Said first in the row's own text and repeated on every
    obligation under it; a list that silently lags is worse than none.
  - **volatile rows** — `working tree clean`, `pushed to remote`,
    `verification integrity`, `test run fresh` and the backstop read
    state that lives **outside** the session-set directory: git, the
    repo-wide work diff, or a digest of the source files a suite covers.
    Those rows are dated `as of HH:MM` even in a projection that is
    otherwise provably fresh, because no digest of the set directory can
    speak for them.

  A row may only render as done when the projection is fresh, nothing at
  all is outstanding, **and** the recorded verdict says the close would
  actually proceed — an all-met report whose verdict is
  `undecided-backstop-would-route` still has a routed round standing
  between it and closing.

  The panel follows the file: `close-obligations.json` is on the same
  watcher as the other session-set state files, so running the command
  moves the row rather than waiting for the 30-second poll.

