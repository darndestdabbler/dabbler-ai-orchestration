### Changed

- **(Set 122 S4) The extension's changelog is written as fragments, not as
  edits to `CHANGELOG.md`.** Nothing in the shipped extension changes; this
  is a contributor-workflow change with one user-visible consequence, so it
  is recorded here rather than left to the router changelog alone.

  `tools/dabbler-ai-orchestration/CHANGELOG.md` is no longer an append
  target. Unreleased entries live in
  `tools/dabbler-ai-orchestration/changelog.d/`, one file per contribution,
  and the full document is produced on demand with `python -m
  ai_router.changelog render --target extension`. The reason is the merge
  conflict two concurrent session sets were guaranteed on it — see the
  router changelog entry for the full rationale and the byte-identity
  contract, and `docs/partitioned-append-files.md` for the canonical
  reference.

  **The user-visible consequence:** the Marketplace page shows released
  history plus a pointer, rather than inlining shipped-but-unversioned work,
  until the operator folds the fragments into a version at release time
  (`python -m ai_router.changelog fold --target extension`). That fold is
  the act the Unreleased lead already described the operator doing by hand;
  it is now one command, and it is deliberately not something a session does.

  Every historical byte was preserved through the partition, proven against
  the committed file rather than asserted: rendering the fragments reproduces
  this changelog exactly as it stood before the change, and CI re-checks that
  on every commit.
