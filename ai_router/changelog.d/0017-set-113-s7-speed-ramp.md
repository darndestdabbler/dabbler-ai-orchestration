## [Unreleased] — the waiting comes out of a recording, derived rather than eyeballed

### Added

- **(Set 113 S7) `ai_router.speed_ramp` — compress the waiting out of a long
  session recording, using the framework's own timestamps.** A recording of a
  real Dabbler session is mostly waiting: a routed call returns in a minute or
  two, a suite runs for the better part of an hour, and nothing on screen
  changes while it does. Playing that back at real speed is unwatchable, and
  cutting it by hand produces something that cannot be regenerated when the
  product changes.

  This is the one place the framework has an advantage over a video editor.
  `session-events.jsonl` and `activity-log.json` already carry real
  timestamps, so *which stretches were waiting* is **derivable** rather than
  eyeballed. The output is a **plan** — segments, rates, and a sentence per
  segment saying why — written to a file and meant to be read before an hour
  of video is re-encoded. An edit decision list can be reviewed, diffed and
  regenerated; a timeline inside an editor can be none of those.

  ```
  python -m ai_router.speed_ramp plan --session-set-dir DIR --session N \
      --recording-start <ISO-8601> --recording FILE --out ramp.json
  python -m ai_router.speed_ramp apply --plan ramp.json --input IN --output OUT
  ```

  **The rule it keeps: an interval in which something happened is never
  compressed.** That is built structurally rather than checked afterwards —
  the real-time intervals are constructed first, from a pad around every
  mark, and the quiet segments are whatever is left over. Building it the
  other way round, by finding gaps and then protecting marks, is how an
  off-by-one puts a mark inside a compressed stretch.

  Two more properties worth knowing:

  - **A wait is shortened, never removed.** Compressing a forty-minute suite
    to nothing would tell the viewer it did not happen.
  - **The plan states what fraction of the recording it is compressing**, and
    says so in words when that is nearly all of it. An orchestrator session
    writes a mark every few minutes, so a person sitting reading the screen
    looks exactly like a suite running — and that is the one judgement the
    plan cannot make for you.

  Refuses rather than guessing where guessing would be silent: a recording
  the record has no timestamps inside is refused outright, because
  compressing on no evidence reads the whole thing as waiting.

  Proved on real data — this set's own Session 6, 2h58m of record and 29
  marks, plans to 6m08s — and applied end to end to a real recording, where
  the plan predicted 22.46s and ffmpeg produced 22.52s. 26 falsifiers,
  including one that fails if *nothing* is compressed, since otherwise "no
  mark was compressed" passes vacuously.
