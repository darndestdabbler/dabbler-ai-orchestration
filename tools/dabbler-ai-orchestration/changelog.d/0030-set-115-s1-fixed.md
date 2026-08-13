### Fixed

- **(Set 115 S1) Session rows say what the session is about.**
  `utils/sessionState.ts`'s `buildSessions` hardcoded ``title: `Session
  ${n}` `` in a module that already imported and called
  `extractSessionTitlesFromSpec` — so the extension synthesized a
  generic ledger while holding the real titles. It now resolves through
  the same `healTitle` rule the router's writer uses, and the read view
  (`normalizeToV4Shape`) heals a stored `Session N` from `spec.md` too,
  so **already-closed sets display their real titles** without anything
  rewriting their state files. The spec read is conditional on
  `needsTitleHeal`: a healthy set costs no additional disk read on the
  tree scan.

- **(Set 115 S1) Scanning the Work Explorer no longer writes to your
  repo.** `readStatus` used to call `ensureSessionStateFile` on any
  session-set folder that had a `spec.md` but no `session-state.json`,
  creating the file as a side effect of a *read*. Because the extension
  also watches those files, its synthesizer routinely won the race
  against the router's writer and put a generic-titled ledger on disk
  first — which title resolution then carried forward forever.

  The ownership rule is now explicit: **the router's writers create
  `session-state.json`; the extension writes it only on an explicit
  operator action (cancel / restore), never on a read.**
  `ensureSessionStateFile` is removed; `inferStateInMemory` returns
  exactly what it used to write, and `readSessionSets` consumes that
  derivation directly — so a spec-only set still lists its planned
  sessions, with their real titles, and no untracked file appears in
  your tree. `docs/session-state-schema.md` → *Lazy synthesis* carries
  the record.

