## [Unreleased] — the drift inventory and the scoped history migration (Set 120 S2)

### Added

- **(Set 120 S2) `ai_router.step_status_drift` — the drift inventory
  command, and the migration that executes the operator's ruling about
  the history already on disk.** Set 120 S1 stopped *new* drift; this
  measures and repairs what was already written. The command has three
  read-only modes and one writing one:

  - default — the inventory: every `activity-log.json` under
    `docs/session-sets`, per file, per token, with the session and step
    each occurrence belongs to, sorted into the two populations the
    ruling treats oppositely. `--json` for machine output, `--verbose`
    for per-entry detail, `--only <slug>` to narrow.
  - `--check-premise` — the falsifier for the ruling's premise, that
    `completed` and `done` are *pure* synonyms wherever they appear.
    Three independent signals: the owning session never completed, the
    same step was re-logged later as non-terminal, and the step's own
    description asserts it did not finish. Exits `2` on any
    **unadjudicated** flag.
  - `--migrate` — the migration plan (dry run, no writes).
  - `--migrate --in-place` — apply. Idempotent and re-runnable.

  **The premise check is an enforced precondition of the write path, not
  a companion command you are trusted to remember.** One unadjudicated
  premise flag anywhere in the scan refuses the whole run and writes
  nothing, and `migrate_file()` checks for its own set when called
  directly, so a library caller is equally fail-closed. There is no
  `--force`: the way past a flag is to read it and record the reading,
  because the operator authorised a lossless rename and not a judgement
  call about outcomes.

  **Scope is enforced structurally, not left to the default scan root.**
  Any activity log under a `test-fixtures/` tree
  (`EXCLUDED_PATH_SEGMENTS`) is test data rather than a record of a real
  session: it is reported, kept out of the drift totals, and never
  migrated whatever `--scan` says. This repo's pinned UAT fixture is the
  case that forced it — `--scan .` would otherwise have rewritten an
  extension test fixture from inside a Python-only history migration.

- **(Set 120 S2) The 271 lossless synonyms in this repo's history are
  now canonical.** Measured from the command rather than a one-off
  query: 286 drifted entries of 2,805 (10.2%) across 24 files, split
  271 lossless (`completed` 229, `done` 42) and 15 semantically loaded.
  The lossless population was rewritten to `complete` across 21 files;
  the 15 loaded entries — 4 with no status field, 8 prose blobs, 1 JSON
  array, 1 `skipped`, 1 `complete-with-known-failures` — are byte-for-byte
  untouched, because normalising them would launder meaning that
  Set 120 S3's projection will instead render as an explicit `unknown`.

  **The rewrite is byte-surgical, not a re-serialize**, and that is not
  a stylistic choice. These logs were written by several tools over a
  year: 108 of 109 use CRLF, 39 carry a trailing newline and 69 do not,
  and Set 028's was written `ensure_ascii=False` so it holds a literal
  `→` that a default `json.dump` would escape. A parse-mutate-dump
  migration would have rewritten bytes in files it was asked not to
  touch, and would have made the ruling's own acceptance condition — the
  loaded entries come out byte-identical — impossible to check. The
  migrator locates each `"status"` member as a span of raw text,
  cross-checks those spans against what the JSON parser sees (a file the
  scan cannot explain is **refused**, never rewritten blind), replaces
  only the ruled ones, and then asserts both that no byte outside those
  spans moved and that the re-parsed document differs by exactly those
  statuses.

### Changed

- **(Set 120 S2) Nothing in the public API changed.** The migration is a
  one-time repair of this repo's own records plus a standing inventory
  command; no reader, writer, or gate behaviour is altered. Consumer
  repos carrying their own drifted history can run
  `python -m ai_router.step_status_drift --check-premise` and then
  `--migrate --in-place` against their own `docs/session-sets` — the
  write path enforces that ordering itself and refuses while any flag is
  unadjudicated — but nothing obliges them to; readers stay lenient by
  standing decision 1.

