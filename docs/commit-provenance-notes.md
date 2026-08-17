# Commit provenance notes

Append-only. One entry per commit whose contents do not match what its
message describes, recorded so that `git log` stays trustworthy without
rewriting published history.

A commit lands here when reading its message would mislead someone about
**who did what** or **when a change happened** — not for ordinary
imperfections. Nothing in this file changes any commit; it is the honest
index that history is append-only rather than accurate.

---

## `5074ab34` — "Create Set 135: Close-Out Cost Must Be Produced, Not Asserted"

**Date:** 2026-08-17
**Problem:** the commit contains two unrelated bodies of work by two
different authors, and its message describes only one of them.

**What the message describes, and what really is the assistant's work:**

| path | lines |
| :--- | ---: |
| `docs/session-sets/135-close-out-cost-must-be-produced/spec.md` | +270 |

**What was swept in, and is the OPERATOR's work** — a re-plan of Set 113 from
nine sessions to ten, in progress and uncommitted at the moment the commit
was made:

| path | lines |
| :--- | ---: |
| `docs/session-sets/113-narrated-video-walkthroughs/spec.md` | 166 |
| `docs/tutorials/single-module-walkthrough.md` | 37 |
| `docs/session-sets/113-narrated-video-walkthroughs/ai-assignment.md` | 11 |
| `docs/session-sets/113-narrated-video-walkthroughs/session-state.json` | 9 |
| `docs/session-sets/113-narrated-video-walkthroughs/disposition.json` | 4 |

The substance of that re-plan: **Set 113 grew from nine sessions to ten.**
The single-module tutorial recording became a session of its own, Session 9,
and the multi-module tutorial plus the set's accounting moved to Session 10,
which stays set-terminal. `totalSessions` and the `sessions[]` ledger were
updated to match.

> **So: if you are looking for when Set 113 became a ten-session set, it is
> here — inside a commit about creating Set 135.** That is the reason this
> file exists.

`docs/session-sets/113-narrated-video-walkthroughs/decisions.jsonl` (+1) is
the assistant's, but belongs to the *previous* commit's subject (the Set 135
reservation) rather than to this one.

**Cause.** The assistant staged with `git add -A` against a working tree it
had last inspected an hour earlier and assumed was still clean. This repo has
concurrent human edits; a whole-tree stage cannot tell its own work from
anyone else's.

**Why it was not rewritten.** The commit was already pushed to `master`.
Splitting it means a force-push, which is operator-authorized only, and the
operator chose the append-only record instead (2026-08-17). Nothing was lost
or altered by the mix — every line is intact — so the only damage is
attribution, and attribution can be repaired by writing it down.

**Corrected in `0ea2135d`, separately:** Set 135's spec had been authored
against the nine-session plan and named Session 9 as set-terminal. The
re-plan made that stale on arrival.

**The practice this changes.** Stage explicit paths. `git add -A` is not
appropriate in a repository where a human is editing in parallel, and "the
tree was clean when I last looked" is not a substitute for looking.
