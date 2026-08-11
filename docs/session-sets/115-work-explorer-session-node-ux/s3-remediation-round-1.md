# Set 115 Session 3 — remediation, round 1

One finding, one fix. The finding is **accepted in full**: it is correct,
it names a reachable failure, and the mechanism it describes is one I
asserted against and did not actually have.

## The finding

> **Major / Correctness.** Unknown session statuses can be dropped before
> the run-prompt gate, so a later row can incorrectly offer
> `Copy Run Prompt`.

## Why it was right, and why my own test missed it

The conventions block for this round claims:

> An unrecognised session status offers the prompt **nowhere** in that set
> rather than guessing which session is next.

`nextRunnableSessionNumber` implemented exactly that — and it was
unreachable. `utils/fileSystem.ts::normalizeLedgerSessions` does not pass
an unreadable ledger entry through with a funny status; it **`continue`s
past it**, so the entry never reaches `set.sessions` at all. On the
verifier's scenario — session 1 `complete`, session 2 `"finished"`,
session 3 `not-started` — the scan yields `[1, 3]`, my walk saw two
perfectly legal records, and session 3's row offered a prompt that would
have started session 2.

My Layer 2 coverage asserted the rule by casting bogus `SessionRecord`
values straight into the helper. That proves the one code path production
never takes. This is the "a gate that only ever passes proves nothing"
lesson (L-112-1) in a form I had not anticipated: the falsifiers were real
but they were planted **downstream of the filter that made the defect
possible**.

## The fix

`providers/rowMenuHelpers.ts::nextRunnableSessionNumber` now fails closed
on a **number gap** as well as on an unrecognised status:

```ts
let expected = 1;
for (const session of ordered) {
  if (session.number !== expected) return null;
  expected += 1;
  …
}
```

A gap is the observable signature of a dropped entry. Every sanctioned
writer emits `sessions[]` as `1..N` — `_build_sessions_array`, the
extension's `buildSessions`, and `inferStateInMemory` — so a hole is never
legitimate, and "which session is next" is genuinely unknowable across
one. Only corruption at or *before* the candidate matters: a broken
session 5 has no bearing on whether session 2 is next, and the walk
returns before reaching it.

**Chosen over the alternatives** the finding offered ("a scan-level
unknown-status blocker or equivalent preserved sentinel"):

- A **preserved sentinel** would mean widening `SessionRecord.status`
  beyond its closed union and giving Set 110's icon table and Set 114's
  step rules a fifth status to answer for — a tree-wide change to fix one
  menu entry.
- A **new `SessionSet` field** would plumb a boolean from the scan through
  the row model for a fact the data already carries.

The gap check needs neither, and it is strictly wider than an
unknown-status flag would have been: it also catches the **sibling drop
paths** in the same function (L-069-1) — a non-integer number, a numeric
string, a non-positive number — which produce an identical hole and which
an unknown-status flag would have missed entirely.

`normalizeLedgerSessions` gained a comment at the drop site naming the
coupling in the other direction, so the next consumer that asks a
sequential question of that array is told it owes the same check.

## Coverage

New suite, `Set 115 S3 round 1 — a corrupt ledger, through the real scan`,
which satisfies the finding's acceptance criterion by driving
`readSessionSets` over a real `session-state.json` on disk and rendering
through `sessionDescriptor` — the scan/descriptor path, not a cast:

1. **the status case** — the verifier's exact ledger. It also pins the
   fact that made the defect possible (`sessions` comes back `[1, 3]`), so
   a future change to the drop behaviour surfaces here.
2. **the number cases** — `"2"`, `2.5`, `0`, the sibling drop paths.
3. **a healthy ledger still offers the prompt, on exactly one row.** The
   other half of the falsifier pair: a guard that suppressed everything
   would satisfy 1 and 2 and be worthless.

The guard was falsified before being trusted: with the gap check disabled
(`&& false`), cases 1 and 2 fail with the real rendered `contextValue` in
the message; with it restored, 24/24 pass.

## Suite

Layer 2 targeted: 24 passing in `sessionRowActions.test.ts`, 56 passing
across it plus `sessionLedgerRows.test.ts` and
`workExplorerMenuParity.test.ts`. Full Layer 2 and Layer 3 runs of record
are taken at close, after the last code change.
