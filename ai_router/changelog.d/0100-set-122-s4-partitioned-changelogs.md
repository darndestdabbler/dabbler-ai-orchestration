## [Unreleased] — the append-only files stop colliding (Set 122 S4)

### Added

- **(Set 122 S4) `python -m ai_router.changelog` — one fragment file per
  contribution, one computed view.** The verdict-adopted fix for the one
  genuine merge conflict Option A has (§7 of
  `docs/proposals/2026-08-11-multi-module-architecture/verdict.md`).
  `CHANGELOG.md` was a file every session edited, at the same offset — the
  top — so two developers running concurrent session sets in separate
  worktrees were **guaranteed** a conflict on it, of the worst kind: both
  sides correct, so resolving it is manual reading rather than a rule. Not
  hypothetical: over the sixty days before this change `ai_router/
  CHANGELOG.md` was touched by 79 commits.

  Sessions now write `changelog.d/<order>-<slug>.md` and never touch the
  shared file. A new file per contribution is a shape git merges without a
  conflict. `render` concatenates preamble + fragments + released history on
  demand; `fold` writes the view back and clears the fragments at release
  time, which is a serialized one-person act and so cannot race. Ordering is
  descending and `add` allocates `max + 10`, so a new entry lands on top —
  where a changelog entry belongs — without renumbering anything.

  This is less a new convention than an existing one made executable. This
  changelog already carried **nine stacked `## [Unreleased] — … (Set NNN)`
  sections**, one per set, and the extension's carried ten `### Section`
  blocks inside one Unreleased. Sessions were already partitioning by hand.
  They were doing it inside a single file, which is exactly what conflicts.

  **The partition does not rewrite history, and that is enforced rather than
  asserted.** A fragment stores the *verbatim slice* of the pending region,
  so concatenation equals the original by construction rather than by care.
  `changelog.d/.baseline.json` freezes the pre-partition digest, each
  fragment's digest, and the fragment ORDER; `check` re-renders from the
  baseline set alone — a fragment added later cannot make the assertion
  vacuous — and fails on a reorder, a drop, an edit, or an edit to frozen
  prose. `restamp` exists for a deliberate correction to released text and
  **refuses to run if any fragment moved or changed**, so the escape hatch
  for "I fixed a typo" cannot become the escape hatch for "I reordered
  history". Byte-identity is claimed after LF normalization, because
  `core.autocrlf=true` would otherwise make the digest an assertion about
  which CI runner ran it.

  The round trip earned its keep during the session itself: the first
  implementation spliced fragments after the *preamble* rather than after the
  pending lead, which silently dropped the extension changelog's 1,086-byte
  Unreleased header. Every entry still rendered. Only the byte comparison
  found it.

  Two named exclusions, both deliberate. `lessons-learned.md` and its archive
  are exempt per verdict §7 even though they churn hardest of all.
  `router-metrics.jsonl` was named by the verdict but is gitignored and
  untracked, so it cannot conflict — partitioning it would defend against a
  defect that cannot occur. Canonical:
  `docs/partitioned-append-files.md`.

- **(Set 122 S4) `resolve_set --check`, and a duplicate set number refused
  before the work starts.** Verdict §6.4 asks developers to reserve set
  numbers in chat before scaffolding; nothing enforced it, and the collision
  is invisible inside a single worktree — two branches each mint `123-…`,
  and the clash only exists after they merge. `resolve_set` already treated
  the collision as a bug, but only at *address* time, which reports it once
  the work is done.

  The refusal now fires where it can act. `start_session` refuses to register
  a set whose number another directory already carries — scoped to that set's
  number, so an unrelated collision elsewhere does not block unrelated work.
  `resolve_set --check` sweeps the whole tree and exits `3`, naming both
  sides and the corpus size. `ai_router/scripts/drift_guard.py` runs that
  sweep *and* the changelog round trip in CI's fast gate, which is the right
  home because both defects are introduced by a merge.

  `ai_router.modules create` deliberately gained **no** check. It mints
  `max(existing) + 1` from a live directory listing, so within one worktree
  it cannot take a number that is already there; a refusal there could only
  ever pass, and L-112-1 is explicit that such a gate proves nothing. The
  property is asserted by a test instead. Every refusal ships with the
  legitimate look-alike it must not fire on: a bare descriptive slug, an
  `_archived` holding pen, and an idempotent re-scaffold of a set's own
  number.
