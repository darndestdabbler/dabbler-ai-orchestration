# A walkthrough per session, written where developers already look

> **Purpose:** Developers can see *that* work happened — the Work Explorer
> renders sets, sessions, and steps — but not what was built, which tools
> built it, or what the commands actually did. The record holds all of it
> and none of it is readable: `session-state.json` knows the engine and the
> verifier, `activity-log.json` knows every step, `.dabbler/runs/` holds the
> rounds. This set adds one short technical walkthrough per session, half
> machine-written from that record and half authored prose, opened from the
> session row it describes. **Orientation, not documentation** — enough to
> teach a developer what the tooling is and how it was driven.
> **Session Set:** `docs/session-sets/146-session-walkthroughs/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Baseline commit:** head of `experiment/verification-pipeline-v3` after
> set 146.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-146-walkthroughs`. **Not** developed on
> `master`.
> **Prerequisite:** set 146 complete.

> **Note on rule 6:** operator-authorized exception, as sets 136–145.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 2
prerequisites: []
```

---

## The envelope this set runs under

The operator extended the relaxation window to include this set
(`cf746bc5`). Only the window moved: the ceilings are unchanged at
**16,800 LOC / 33 modules / 605 Python tests / 215 TS tests**, measured
against the post-141 baseline and shared across the whole five-set
sequence. This set's ten tests bring the plan to **525 of 605**.

Ground rule 1 is suspended here too, so a new module is *permitted*. This
set does not take one, because the rule that survives the relaxation still
binds: a module earns its existence by making another module smaller, and a
walkthrough module would only add. The scaffolder therefore lives in
`writers.py` — it writes a file, which is what that module is for — reached
through a new subcommand on the existing `session` CLI, and reusing
`bootstrap.py`'s managed-fence helpers rather than growing a second copy of
that idea.

**This set is not part of the verification-pipeline rewrite.** It shares
the window and nothing else. The sequence obligation to leave `verify.py`
under 1,200 lines belongs to sets 143–146; this set does not touch
`verify.py`, does not discharge that obligation, and must not be treated as
absorbing it.

## What a walkthrough is

One file per session, in the set directory, named
`session-<N>-walkthrough.md`. Two zones, and the boundary between them is
the whole design:

**The machine zone** is inside a managed fence — the same
`<!-- dabbler:managed:start -->` idiom `bootstrap.py` already writes into
`AGENTS.md`. It carries what the record already knows:

- which engine, provider, and model orchestrated, and how identity was
  resolved (`asserted` vs. registry-resolved);
- which provider verified, over which transport, in how many rounds;
- the steps, in order, with their real timestamps;
- the exact router commands the session ran, and a link to
  `.dabbler/runs/<set>/s<N>/` for the raw rounds.

**The authored zone** is everything outside the fence, and it is the part
a human writes because no record contains it:

- what was built, in plain terms, and which files carry it;
- why it was built that way — the constraint that made the obvious
  approach wrong;
- what to read next.

### The one thing a walkthrough may never contain

**A verdict.** Not a restated one, not a summarized one. The machine zone
links to `.dabbler/runs/`; it never says VERIFIED. A hand-editable file
that states an outcome is a hand-written verdict surface, and ground rule 5
exists because v1 had one. The fence keeps prose and record physically
separated, so the question "who wrote this line" always has an answer.

## Where the step goes, and why not at the end

The framework seeds plan steps from `spec.md`
(`writers.seed_session_plan`) and appends nothing today. The walkthrough
step is framework-written, for the same reason `register` is: an authored
spec that forgets it produces a session with no walkthrough, and every
spec would have to remember forever.

It is **inserted before the close-out step, not appended after it.**
Appending is the obvious implementation and it is wrong: `session close`
commits and pushes, so a file written after it lands in a dirty tree behind
the push the `pushed_to_remote` gate just checked. The insertion point is
the first plan step whose key begins with `close`; with no such step, the
step appends last and the ordering is the spec author's problem rather than
a guess the framework made. Seeding happens once, before any step is
logged, so ordinals stay consistent.

## No new close gate

The walkthrough is a plan step, visible as a step row, and nothing refuses
to close without it. Ground rule 2 requires every gate to cite the concrete
v1 incident it would have prevented, and there is no incident here — no
session ever failed because its documentation was thin. A sixth gate would
be a gate guarding a habit.

## What this set does NOT do (do not reopen)

- **No retroactive walkthroughs.** Sets 142–146 are not backfilled. The
  session that did the work is the only one that can honestly say why, and
  it is finished. A backfill would be a reconstruction wearing the
  record's clothes.
- **No new module**, for the reason given above.
- **No change to any state file's schema.** The walkthrough reads the
  record and never writes to it.
- **No prose in the projection payload.** `progress.py` reports whether a
  walkthrough exists, not what it says.
- **No change to the five close gates**, to the verification mandate, or
  to `verify.py`.

---

## Sessions

### Session 1 of 2: The framework writes the step and the facts

1. Register.
2. Insert a framework-written walkthrough step into `seed_session_plan`,
   positioned before the first plan step whose key begins with `close`,
   and appended last only when no such step exists. Seeded once, so step
   numbering is stable from the start.
3. Add `walkthrough` as a subcommand of the existing session CLI: it
   creates `session-<N>-walkthrough.md` when absent, and rewrites **only**
   the managed fence when present, preserving every authored line outside
   it. Idempotent, and re-runnable after verification so the round facts
   are current.
4. Fill the fence from `session-state.json` and `activity-log.json`:
   orchestrator identity and its provenance, verifier provider, transport,
   round count, the ordered steps with timestamps, the router commands,
   and a relative link to the session's run directory. A session whose
   verification has not run yet says so; it never invents a round count.
   No verdict token is emitted under any circumstance, including a
   session state that holds one.
5. Project walkthrough existence per session in `progress.py --json`, so
   the extension renders from Python's answer instead of statting files.
6. Teach `bootstrap.py`'s generated orchestrator instructions the step and
   the command, so a fresh engine learns it from `AGENTS.md` rather than
   from this spec.
7. Add the step to `docs/quick-start.md` between "Work the steps" and
   "Close", where a developer following the lifecycle will meet it in the
   order they will actually run it.
8. Affected tests, recorded as the `preverify-targeted` evidence.
9. Cross-provider verification; then the full suite once, against the
   final verified tree.
10. Close-out.

**Creates:** the seeded step, the `walkthrough` subcommand, the fence
writer, the projection field, the lifecycle documentation. Est. 7 Python
tests.

### Session 2 of 2: The row a developer clicks

1. Register.
2. Add the walkthrough filename pattern to the extension's file-watcher
   glob, so writing one refreshes the tree without waiting for the poll.
3. Fold walkthrough filenames and mtimes into `projectionCacheKey`. The
   current `CACHE_INPUTS` is a fixed list of six names and cannot express
   one file per session; a filtered directory scan can. Existence drives
   the row, so a content edit need not invalidate the cache — state that
   constraint where the code makes the choice.
4. Render the walkthrough on the session row: present, and it opens;
   absent, and the row offers nothing rather than a dead command. The
   session row's existing left-click behaviour — open `spec.md` at this
   session's block — is unchanged. This is an additional action, not a
   replacement.
5. Document the row in the Work Explorer section of
   `docs/quick-start.md`.
6. Write both of this set's own walkthroughs, session 1's included. If the
   template cannot explain the work of the session that built it, it is
   the wrong template.
7. Affected tests, recorded as the `preverify-targeted` evidence.
8. Cross-provider verification; then the full suite once, against the
   final verified tree.
9. Close-out, and the end-of-set `change-log.md`.

**Creates:** the watcher and cache wiring, the session-row action, two
worked examples. Est. 3 TypeScript tests.

---

## Acceptance criterion for the set

A session started after this set carries a walkthrough step in its plan,
positioned before close-out, without its spec having asked for one.

`session walkthrough` run twice leaves authored prose byte-identical and
the managed fence current. Run before verification and again after, the
fence gains the round facts and loses nothing.

No walkthrough contains a verdict token, and no code path reads one.

A developer opening a completed session in the Work Explorer reaches a file
that names the engine, the verifier, the transport, the commands, and what
the session built — and can follow its links to the raw rounds.

Both of this set's own sessions are documented by the mechanism they built.
