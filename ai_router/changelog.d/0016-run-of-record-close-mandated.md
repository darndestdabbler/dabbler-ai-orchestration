## [Unreleased] — the run of record honours close-mandated writes too

### Fixed

- **Two files a writer had already declared close-mandated still staled the
  test run of record.** Three mechanisms ask "did the work change since we
  checked?" — the verification freshness digest, the close backstop's delta
  anchor, and `test_run_fresh`. The first two consult **both** shared
  sources: `WORK_DIFF_SET_BOOKKEEPING` *and* the writers' own
  `CLOSE_MANDATED_WRITES` declarations. `is_active_set_bookkeeping` consulted
  only the list.

  So a session ran its suites, recorded them, and then had the run invalidated
  by files the framework itself was required to write:

  - **`path-aware-critique.json`** — `pull_critique` writes it at **Step 8**,
    which the constitution places *after* the suites.
  - **`session-progress.json`** — `close_session` writes it **during the
    close**, so a close that had to be retried found the run it had just
    recorded already stale.

  Measured: replaying everything Set 113 S6 wrote after its pytest run of
  record, these were the **only two of seventeen** files still binding once the
  freshness list covered the rest. The session paid ~6 minutes re-running 5021
  tests to prove that documents which cannot break a Python test had not broken
  any.

  `is_active_set_bookkeeping` now reads `close_mandated_excludes`, so all three
  consumers share both mechanisms. Source-level discovery means a **fourth**
  writer is exempt here with nothing in `run_of_record` edited — asserted by a
  test that declares a synthetic writer in a throwaway package tree.

  The name stays accurate: a `scope: set` declaration is that set's own
  bookkeeping by construction. Repo-scoped declarations are honoured on the
  same call for completeness; no suite covers `docs/planning/` today, so none
  reaches here.

  Scope held deliberately narrow. Another set's `path-aware-critique.json` is
  still an ordinary changed file, `spec.md` and `operator-notes.md` still stale
  a run, and with no active set nothing is exempt by set scope. Both mutants —
  the check removed, and the active-set scope dropped — are caught by the new
  falsifiers.
