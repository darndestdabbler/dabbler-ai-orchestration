# Partitioned append-only files

> **Canonical for:** how `CHANGELOG.md` entries are written, how the full
> changelog is produced, how a release folds pending entries in, and why
> duplicate session-set numbers are refused. Shipped by Set 122 Session 4,
> implementing verdict §7 of
> [`docs/proposals/2026-08-11-multi-module-architecture/verdict.md`](proposals/2026-08-11-multi-module-architecture/verdict.md).

## The problem this solves

Two developers running concurrent session sets, in separate worktrees,
were **guaranteed** a merge conflict on `CHANGELOG.md`. Both sessions
append, both append at the top, and both sides are correct — so
resolving it is manual reading rather than a rule. The same shape
applies to session-set numbers: two branches each scaffold `123-…`, and
nothing notices until the merge, by which time both sets have work in
them.

Neither is a hypothetical. Over the sixty days before this change,
`ai_router/CHANGELOG.md` was touched by 79 commits and
`tools/dabbler-ai-orchestration/CHANGELOG.md` by 42.

## Writing a changelog entry

**Do not edit `CHANGELOG.md`.** It is no longer an append target. Write a
fragment instead:

```
python -m ai_router.changelog add --target router \
    --section Added --title "what you shipped" --slug set-123-s1-what-you-did
```

That creates `ai_router/changelog.d/<order>-set-123-s1-what-you-did.md`.
The stub matches the target's own shape: the **router**'s fragments are
whole `## [Unreleased] — <title>` sections with `### Added` nested under
them (`--title` supplies the headline, defaulting to the slug), while the
**extension**'s fragments are a bare `### Added` block inside the single
Unreleased section. Fill it in as you would have filled in the changelog.
Targets are `router` (`ai_router/CHANGELOG.md`) and `extension`
(`tools/dabbler-ai-orchestration/CHANGELOG.md`).

Because your session writes a **new file**, a concurrent session cannot
conflict with you. Two sessions that allocate the same order key produce
a tie broken by slug — two distinct files, no shared write.

## Reading the whole changelog

```
python -m ai_router.changelog render --target router      # to stdout
python -m ai_router.changelog list   --target all         # fragments, in order
```

`render` prints preamble + pending fragments + released history: the
document `CHANGELOG.md` used to be.

## Ordering

Fragments are named `<order>-<slug>.md` and render in **descending**
order, so the newest contribution is at the top of the changelog where a
changelog entry belongs. `add` allocates `max + 10`, which puts your
entry first without renumbering anything that already exists. The gap of
ten leaves room to slot an entry between two others by hand.

## Releasing (operator only)

At release time the operator folds the pending fragments into the
rendered file and clears them:

```
python -m ai_router.changelog fold --target router
```

`fold` writes the computed view back into `CHANGELOG.md` and deletes the
fragments. Assign the version heading by hand afterwards, exactly as the
release walk does today. This is deliberately **not** part of any
session: a session that folded would put the shared file back in the
write path and re-create the conflict.

## The byte-identity contract

The partition must not rewrite history. `changelog.d/.baseline.json`
records, at partition time:

| field | meaning | re-stampable |
| :--- | :--- | :--- |
| `partitionSha256` | digest of the whole pre-partition document | **no** |
| `partitionPendingSha256` | digest of the fragments' concatenation | **no** |
| `fragments[]` | each migrated fragment's name, digest and **order** | **no** |
| `originalSha256` | digest of the current rendered document | yes |

`python -m ai_router.changelog check` re-renders from the baseline
fragment set alone — so a fragment added later cannot make the
assertion vacuous — and fails on a reorder, a dropped fragment, an
edited migrated fragment, or an edit to frozen prose.

A **deliberate** edit to the preamble or to released history is
re-recorded with `python -m ai_router.changelog restamp`, which
**refuses to run if any fragment moved or changed**. The escape hatch
for "I fixed a typo in a released section" can therefore never become
the escape hatch for "I reordered history".

"Byte-identical" means after line-ending normalization. This repo sets
`core.autocrlf=true`, so the same commit is CRLF in a Windows worktree
and LF in a Linux one; every digest is taken over the LF form, which is
the only claim that can be true on both CI runners.

## Duplicate session-set numbers

Verdict §6.4 asks developers to reserve set numbers in chat before
scaffolding. That is a convention, and the collision is now refused:

- **`python -m ai_router.start_session`** refuses to register a set whose
  number another directory already carries — before the work starts.
  Scoped to *that set's* number, so an unrelated collision elsewhere in
  the tree does not block unrelated work.
- **`python -m ai_router.resolve_set --check`** sweeps the whole tree and
  exits `3` on any duplicate. Use it as a merge captain.
- **`ai_router/scripts/drift_guard.py`** runs the same sweep, plus the
  changelog round trip, in CI's fast `drift_guards` job — the right
  place, because both defects are introduced by a *merge*.

The module lifecycle scaffolder (`python -m ai_router.modules create`)
needs no check of its own: it mints `max(existing) + 1` from a live
directory listing, so within one worktree it cannot take a number that
is already there. A refusal there could only ever pass, and
`lessons-learned.md` L-112-1 is explicit that such a gate proves
nothing. The property is asserted by a test instead.

## What is deliberately NOT partitioned

- **`docs/planning/lessons-learned.md` and `lessons-archive.md`** —
  exempt by verdict §7, which rules them out of scope because they are
  headed for deletion under the executable-or-drop rule. They are the
  highest-churn files in the repo, so this is the largest remaining
  conflict surface; re-opening the exemption is not this doc's call.
- **`ai_router/router-metrics.jsonl`** — named by the verdict, but it is
  gitignored and untracked (`.gitignore:7`), so it cannot produce a merge
  conflict. Partitioning it would defend against a defect that cannot
  occur.
- **Per-set artifacts** under `docs/session-sets/<slug>/` — already
  partitioned by construction. Concurrent sessions are in different sets.
