# Session 4 verification conventions — Set 122

Read this before the evidence. It states the baseline, the scope
decisions already journaled, and the by-design exclusions, so a round is
spent on real defects rather than on the agreed starting position.

## What this session shipped

Session 4 of 4, *"Remove the guaranteed merge conflicts."* Verdict §7 and
§6.4, adopted. Two things two developers running concurrent session sets
collide on — an append-only file and a set number — and neither had a
control.

Three deliverables:

1. **`ai_router/changelog.py` and the partition.** Both tracked
   changelogs are cut into `changelog.d/<order>-<slug>.md` fragments (9
   for the router, 10 for the extension). Sessions now create a **new
   file** per contribution instead of editing a shared one, which is a
   shape git merges without a conflict. `render` concatenates preamble +
   pending lead + fragments + released history on demand; `fold` writes
   the view back and clears the fragments at release time.
2. **The byte-identity contract, enforced.** A fragment stores the
   *verbatim slice* of the pending region, so concatenation equals the
   original by construction. `changelog.d/.baseline.json` freezes the
   pre-partition digest, each fragment's digest, and the fragment ORDER.
3. **Duplicate set numbers refused.** `resolve_set` gained
   `find_collisions` / `assert_number_available` / a `--check` sweep,
   wired into `start_session` (before the work starts) and into
   `drift_guard.py` (CI's fast gate).

## Scope decisions already journaled — read before flagging

Both are in `decisions.jsonl` for this set, session 4, authority `ai`,
tiebreak `goal-over-letter`.

- **`router-metrics.jsonl` is deliberately NOT partitioned.** The verdict
  names it, but it is gitignored (`.gitignore:7`) and untracked, so it
  cannot produce a merge conflict. Partitioning it would defend against a
  defect that cannot occur. Settled — not a finding.
- **`lessons-learned.md` / `lessons-archive.md` are deliberately NOT
  partitioned.** They churn hardest of all (125 and 54 commits in 60
  days) and are the largest remaining conflict surface, but verdict §7
  exempts them explicitly and the spec repeats the exemption in its
  Non-goals. Re-opening a decided exemption is outside this set's
  authority. Settled — not a finding.

## Two things that look like gaps and are not

- **`ai_router.modules create` gained no collision check.** One was
  written, then deliberately **removed**: `_next_set_number_from` mints
  `max(existing) + 1` from a live directory listing, so within one
  worktree it cannot take a number that is already there. A refusal there
  could only ever pass, and L-112-1 is explicit that such a gate proves
  nothing. The property is asserted by a test instead
  (`test_create_never_mints_a_number_another_set_already_holds`). If you
  believe the scaffolder *can* self-collide, that is a genuine finding —
  name the input.
- **`start_session`'s refusal is scoped to the set being started**, not
  to repo health. Refusing to register `124-mine` because `087-a` and
  `087-b` collide elsewhere would block work unrelated to the bug. The
  repo-wide sweep is a separate entry point (`resolve_set --check`,
  exit 3) and runs in CI. Deliberate, with a test for each half.

## Suite baseline

- **Layer 1 (pytest)**: entering the session, green. Targeted run over
  every changed surface (`test_changelog_partition`,
  `test_set_number_collision`, `test_resolve_set`, `test_drift_guard`,
  `test_modules_lifecycle`, `test_start_session`,
  `test_production_imports`): **232 passed, 0 failing.** 44 + 21 test
  functions are new. The full run of record is taken at Step 6, after the
  last code change.
- **Layers 2 and 3 are NOT owed.** `covers` is by path and this session
  touched no extension source and no `package.json`. The only file under
  `tools/dabbler-ai-orchestration/` that changed is `CHANGELOG.md` plus
  the new `changelog.d/` fragments — documentation, not the MANIFEST, so
  L-064-12 does not fire.

## Falsifier evidence (L-112-1)

Every guarantee is asserted twice — once that the honest case passes,
once that a **planted** violation fails:

- reordered fragments, a dropped fragment, an edited migrated fragment,
  an edited released section, an empty baseline, a missing baseline;
- a `###` heading inside a fenced code block is **not** a split point,
  while a real sibling heading still is;
- a duplicate set number is flagged (including across leading-zero
  spellings), while a bare descriptive slug, an `_archived` dir, and an
  idempotent re-scaffold of a set's own number are **not**.

**Mutation-checked.** Flipping the fragment sort from descending to
ascending — a real reordering bug — fails **10** tests. That mutation
also exposed a genuine gap while the session was running: `check` had
re-sorted internally, making it self-consistent and therefore blind to an
ordering bug in the production render path. `check` now asserts against
the order `load_fragments` actually returns.

## Two real defects the round trip caught in-session

Recorded because they are the evidence the assertion is not decorative:

1. The first `render` spliced fragments after the **preamble** rather
   than after the pending lead, silently dropping the extension
   changelog's 1,086-byte `## [Unreleased]` header and blockquote. Every
   entry still rendered. Only the byte comparison found it. `migrate` now
   verifies in memory **before** anything reaches disk, so a partition
   that cannot round-trip leaves no trace.
2. `render` printed through the stdout *text* layer, so the first real
   invocation died with `UnicodeEncodeError` on `\u2192` under Windows
   `cp1252` — the standing bug class L-079-1 names. Fixed with bytes
   end-to-end, with a falsifier that forces `PYTHONIOENCODING=cp1252` in
   a subprocess so it is caught on the Linux runner too.

## Byte-identity is claimed after LF normalization

This repo sets `core.autocrlf=true`, so the same commit is CRLF in a
Windows worktree and LF in a Linux one. A raw-byte digest would assert
which runner executed the test. Every digest is taken over the LF form.
The claim was verified directly against `git show HEAD:<path>`:
`render()` reproduces both pre-session changelogs exactly (306,974 and
237,977 characters), and the only difference in the committed files is
the added pointer blockquote telling readers where entries now go.

## By-design, not defects

- **No version bump.** The operator ruled on 2026-08-11 that the next
  Marketplace push is a single folded release. This session's own
  changelog entries are fragments, which is the mechanism it ships —
  deliberate dogfooding.
- **The rendered `CHANGELOG.md` no longer shows unreleased entries
  inline.** That is the trade-off the design chose and it is journaled:
  keeping the file complete would require regenerating it every session,
  which re-creates the exact conflict being removed. A pointer blockquote
  names the render command in both files, and a test asserts the pointer
  is present.
- **`fold` is not run by this session.** Folding is a release-time
  operator act; a session that folded would put the shared file back in
  the write path.

## What is genuinely worth finding

Any input where `render` does not reproduce the pre-partition document;
any way the baseline could pass while history is reordered or lost; any
path where `restamp` could launder a fragment change; any concurrency
shape where two sessions still write the same file; and any place the
collision refusal fires on a legitimate look-alike or fails to fire on a
real duplicate.
