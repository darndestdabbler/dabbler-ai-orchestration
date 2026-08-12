# `session-progress.json` — the derived progress projection

> **Status:** canonical reference for the projection's shape (Set 120
> Session 3). The producer is
> [`ai_router/session_projection.py`](../ai_router/session_projection.py);
> keep the two in sync the way
> [`docs/session-state-schema.md`](session-state-schema.md) is kept in
> sync with its writers.

## What this file is, and is not

`session-progress.json` is **derived and regenerable — a cache, never a
source.** It answers one question about a session set, once: what steps
each session has, what state each step is in, what is in flight, and what
remains.

It exists because the derivation used to exist **twice** — once in
`ai_router/session_checklist.py` and once in the extension's
`sessionStepModel.ts` — guarded by a parity test whose only job was to
check that two implementations agreed. A parity test is a tax on
duplication. This file is the one computed answer both surfaces can read,
which is the prerequisite for a later set deleting one of the two
implementations.

**Nothing may treat it as authority.** Its inputs are the authority:

| input | what it contributes |
| :--- | :--- |
| `activity-log.json` | the step entries themselves — the record |
| `session-state.json` | each session's own status (the SSOT for progress), and its `startedAt` — which is the first row's derived start time |
| `spec.md` | whether the seeded plan still matches, which decides only whether ordinal reconciliation is trusted |

Every one of those is digested into the file, so a reader can always ask
whether the cache still describes them. See **Staleness** below.

## Who writes it

`close_session` regenerates it after flipping the state snapshot, so the
committed copy describes the set as it stands at close. That write is
declared through the Set 119 S3 `CLOSE_MANDATED_WRITES` mechanism
(`session_projection.CLOSE_MANDATED_WRITES`), which is what stops a
close-time write from staling the verification stamp it is written after.

`python -m ai_router.session_projection --session-set-dir <dir> --write`
regenerates it on demand. Prefer **not** to run that mid-session inside a
set that has a stamped verification round — the exemption above covers
the close write, and a hand-run write is only safe because the file is a
pure function of inputs that bind the diff on their own.

## Shape

```jsonc
{
  "schemaVersion": 1,
  "derived": true,                  // never a source; regenerate, do not edit
  "regenerateWith": "python -m ai_router.session_projection --session-set-dir <dir> --write",
  "generatedAt": "2026-08-11T05:53:09.745162-04:00",
  "sessionSetDir": "120-strict-writer-and-one-projection",
  "inputs": {                       // SHA-256 of each input's bytes, or null when absent
    "activity-log.json": "155d2c80...",
    "session-state.json": "ab00361c...",
    "spec.md": "ebd3da23..."
  },
  "orphanEntries": 0,               // ledger entries no session can claim (see below)
  "sessions": [
    {
      "number": 3,
      "status": "in-progress",      // from session-state.json, or null
      "evidence": "read",           // read | absent | unreadable
      "steps": [
        {
          "stepNumber": 1,
          "stepKey": "register",
          "description": "Registered session 3 ...",
          "status": "complete",     // the RAW token, exactly as written
          "state": "complete",      // the normalized state (see below)
          "box": "[x]",             // what session_checklist renders
          "isPlanned": false,       // a seeded plan row nothing has logged yet
          "isActive": false,        // DERIVED: the step the session is on
          "startedAt": null,        // DERIVED: when it started, or null
          "isTerminal": true
        }
      ],
      "counts": {                   // every state always present, even at zero
        "pending": 1, "in-progress": 1, "complete": 3,
        "blocked": 0, "unknown": 0, "total": 5
      },
      "current": ["prove-parity"],  // stepKeys whose state is in-progress
      "remaining": ["prove-parity", "full-pytest"]
    }
  ]
}
```

### `status` and `state` are both there on purpose

`status` is the record — the token as the writer put it on disk. `state`
is what a consumer renders. They are kept separate because Set 120 S2
deliberately **preserved** 15 semantically loaded tokens (`skipped`,
`complete-with-known-failures`, prose blobs, entries with no status at
all) rather than normalising them, and collapsing the two fields here
would launder exactly the entries that were protected from laundering.

`state` is one of the writer's four canonical tokens — `pending`,
`in-progress`, `complete`, `blocked` — or `unknown`. **`unknown` is not a
writer token**; nothing may be *logged* as `unknown`. It is what the
projection *says* about a token it found and cannot name.

Read-side leniency is derived from `session_checklist.STATUS_BOXES` by
box glyph rather than re-spelled as a second alias table, so the
projection can never recognise a token the renderer does not, nor miss
one it does. `done` → `[x]` → `complete`; `started` and `in_progress` →
`[~]` → `in-progress`; and so on.

### `isActive` and `startedAt` are DERIVED, and say so (Set 127 S1)

Nothing on disk records which step a session is *currently on*:
`start_session` seeds `pending` and `log_step` writes `complete` after
the step has finished, so the `in-progress` token was almost never
written and the checklist could not tell "not started" from "running for
forty minutes". Both fields close that gap by **derivation** — no writer
was added, nothing is stored to make them true, and they are computed
from rows this file already carries:

| field | rule |
| :--- | :--- |
| `isActive` | the first seeded plan row nothing has been logged against, in a session `session-state.json` reports as `in-progress`, and only when **no** row already boxes `[~]` or `[!]` — the record answering for itself always wins |
| `startedAt` | the **previous** row's completion, or the session's own `startedAt` for the first row; `null` on any row that has not started |

Two consequences worth stating plainly:

- **`state` and `box` follow the display; `status` stays the record.** On
  a derived row `status` is `pending` while `state` is `in-progress` and
  `box` is `[~]`. That is not a normalization inconsistency —
  `isActive` is there precisely so a consumer can see *why* they differ
  and never has to read the difference as a corrupted token. The raw
  token is still untouched, which is the same protection the `status` /
  `state` split has always given the entries Set 120 S2 preserved.
- **`startedAt` is a wall-clock proxy.** Nothing records a start, so a
  step's start is when the previous one finished, gap included. That is
  the honest reading of "how long is this taking". A row that has not
  started carries `null` rather than its own seeded `dateTime`, which is
  *registration* time — one stamp shared by the whole plan — and would
  otherwise hand every unstarted step a plausible-looking start
  (operator ruling, 2026-08-12).

`counts` and `current` follow `state`, so a derived active step is
counted as `in-progress` and appears in `current`. No gate reads any of
this: the derivation is display-only.

### `current` is a list, and may be empty

There is no `<- here` marker (removed by operator ruling, 2026-08-11).
The old marker had to name exactly one row, so it invented a current step
for a session that had not started one — that is how it came to point at
step 1 of Set 119 S2 while the real work was four steps further on — and
it could not describe a session working two steps at once. `current` is
read straight off the `in-progress` state, which the strict writer
guarantees since Set 120 S1. Zero and two are both real answers.

Set 127 S1's `isActive` does not bring the marker back. It never names a
row in a session the state file does not report as in flight (the marker
had no idea whether a session was running); it is eligible only on a
**seeded plan row**, so it cannot point at a logged step that finished
hours ago — which is exactly how the marker failed on Set 119 S2's four
unparseable statuses; it stands down entirely the moment any row already
boxes `[~]` or `[!]`, so it can never add a second current row; and an
unrecognised token makes it silent rather than confident. Zero is still a
real answer, and it is still the answer for every closed session.

## The states absence used to hide

| state | where | replaces |
| :--- | :--- | :--- |
| `unknown` | `steps[].state` | a bare `[?]` glyph a consumer had to interpret |
| `unreadable` | `sessions[].evidence` | an unreadable ledger rendering as an empty session — "no work" and "cannot read the evidence" were the same row |
| `absent` | `sessions[].evidence` | the same silence, for a ledger that is simply not there |
| `orphanEntries` | top level | ledger entries with no integer `sessionNumber`, which every reader in both languages silently drops (Set 028 has four) |
| `stale` | `projection_state()` | a cache with no way to know it had gone out of date |

`orphanEntries` is a **count**, not rows. Inventing rows for entries that
name no session would put the projection at odds with the renderer it has
to reproduce, and the parity proof would be the thing that broke.

## Staleness

```
python -m ai_router.session_projection --session-set-dir <dir> --check
```

Exit `0` when the recorded digests match the live inputs, `3` otherwise
(with the regenerate command on stderr). Programmatically,
`session_projection.projection_state(dir)` returns one of `fresh`,
`stale`, `absent`, `unreadable`.

An input that **appears** or **vanishes** since the projection was built
is a change like any other, so the digest map is compared key-set first.
A projection whose `schemaVersion` is newer than the reading code reads
as `unreadable` rather than being guessed at — guessing at an unknown
shape is how a cache becomes a source.

## Parity with the renderer

`ai_router/tests/test_session_projection.py` asserts, over the same
corpus the cross-language parity gate uses
(`ai_router/tests/fixtures/session-step-parity.json`), that the
projection carries every field `session_checklist` renders, in the
renderer's order, **including the `[?]` posture for unknown tokens** — a
projection that quietly healed a bad token would be a third opinion about
the data rather than one answer. The serialized file is then read back
and checked to reproduce the same answer, because it is the *file* a
later consumer has to be able to trust, not just the computation.

The two Set 127 S1 derived fields are proven the same way, through the
file rather than the in-memory dict — a serializer that dropped
`isActive` or `startedAt` would pass every parity assertion above and
still leave the Work Explorer unable to draw the glyph. They are not yet
in the cross-language corpus's compared field set, because both are
functions of inputs that corpus does not model; Session 2 adds those
inputs alongside the TypeScript mirror, and
`test_the_derived_fields_are_inert_on_every_corpus_case` fails the moment
it does, so the window cannot be left open silently.
