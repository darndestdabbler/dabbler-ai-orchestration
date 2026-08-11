# Set 120 — Strict writer and one projection

## What this set was for

The step ledger rendered wrong because the field it renders had no
vocabulary. Measured 2026-08-11 across every `activity-log.json` in the
repo:

- **"Done" was spelled four ways.** `complete` (2,412) alongside
  `completed` (229), `done` (42) and `complete-with-known-failures` (1).
- **Prose had been written into a status field** — nine blobs, one about
  1,000 words, another a JSON array of routing costs.
- **Roughly 10% of step entries carried a token no reader recognised.**
- **The two readers disagreed about what an unknown token meant.** Python
  rendered `[?]`; the TypeScript tree mapped it to `not-started`, under a
  comment claiming the two matched. One surfaced a data-quality error;
  the other concealed it.
- **The derivation existed twice** — ~1,680 lines of Python against
  ~1,830 of TypeScript, guarded by 110 TS tests plus a parity test whose
  only job was to check that the two agreed.

It had visible consequences. Set 119 S1 wrote `complete` and rendered
correctly; S2 wrote `completed` and the whole session rendered as
not-started with `<- here` stranded on step 1. The marker was not
misbehaving — it selects the first non-terminal row, and with steps 1–4
unparseable, step 1 *is* first.

Six decisions were locked before any session ran and none was reopened:
readers stay lenient while the writer is strict; the tree is not the
authority; no extension changes; no new blocking gate; the Session 2
migration scope is the operator's ruling, not an open question; and
`skipped` is not canonical.

## What shipped

### Session 1 — the writer refuses what it cannot mean

`SessionLog.log_step` now fails closed on anything outside a named
vocabulary, exactly as `session_state.validate_verification_verdict` does
for verdicts (Set 086 S1). Readers were not touched.

**The spec asked the session to *confirm* the vocabulary against the
readers, and the confirmation did its job.** The spec's candidate list
included `skipped`; the round-1 discovery found on **both** lenses that
no reader could name it — no entry in `session_checklist.STATUS_BOXES`,
so it renders `[?]`, and neither reader counted it as terminal, so a
skipped step stole the current-step marker from real work. The operator
ruled it out. The shipped vocabulary is the **intersection** of what was
measured on disk and what the readers understand:

    pending, in-progress, complete, blocked

**The sibling audit found four bypass writers and routed all four.**
`contract_gate`, `path_aware_critique`, `dual_surface_verify` and
`suggestion_disposition` each did their own read-modify-write of
`activity-log.json`. Every one already hard-coded `"complete"`, so none
could drift *today* — but an allowlist at one entry point is worthless if
another path writes the file directly (`L-069-1`), and "it happens to be
a literal right now" is not a guarantee.

Falsifiers, per `L-112-1`: one planting each drifted token and asserting
the refusal names the legal set, one asserting every canonical token is
still accepted.

### Session 2 — what to do about the history already on disk

Making the writer strict does not fix what was already written. **The
operator ruled option (c) before the session opened:** normalise the
lossless synonyms, leave the semantically loaded entries intact.

**The inventory was re-derived from a command, not inherited.** It
corrected the spec twice: the blast radius is **286 drifted entries of
2,798 (10.2%) across 24 files**, not "~281 across roughly a hundred
session-set directories" — the entry count was close, the file count was
a guess and was wrong.

**The premise was falsified before the ruling was executed.** The ruling
holds only if `completed` and `done` are *pure* synonyms wherever they
appear, so `--check-premise` tests three independent signals over all 271
occurrences: the owning session never completed, the same step was
re-logged later as non-terminal, and the step's own description asserts it
did not finish. No counter-example survived, so the ruling stood.

The migration rewrote **271** tokens across 21 files and left the **15**
loaded entries byte-identical: 4 with no `status` field, 8 prose blobs, 1
JSON array, 1 `skipped`, 1 `complete-with-known-failures`. `git diff`
across the migrated files is exactly 271 removed `"status"` lines and 271
added, and nothing else; re-running changes 0 files.

**Both verification findings were the same defect class, and both were
right: intent documented, not enforced.** `--check-premise` and
`--migrate` were independent CLI branches, so a consumer repo could
migrate history that had never been through the check; and the journaled
UAT-fixture exclusion was implemented as *nothing at all*, holding only
because the default scan root avoided it. Both are now behaviour — the
premise check is an enforced precondition at both entry points with no
`--force`, and `EXCLUDED_PATH_SEGMENTS` matches on path segments so
`--scan .` cannot reach a fixture tree.

### Session 3 — compute the projection once

`ai_router/session_projection.py` computes a session set's progress once
and serializes it to `session-progress.json` beside the artifacts it
derives from. Canonical shape: `docs/session-progress-schema.md`.

**It reuses the derivation rather than shipping a third one.** The
projection calls `session_checklist.build_rows` instead of
reimplementing it, because a set whose premise is *"the derivation exists
twice"* answering it with a third implementation would have been the joke
writing itself. "Computed once" is therefore **structural** — there is no
second Python answer that could drift — and it makes the parity proof
non-tautological, since the real check is that the *serialized file*
reproduces the renderer.

**Derived and regenerable — a cache, never a source.** Every file carries
`derived: true`, the regenerate command, and the SHA-256 of each input,
so `projection_state()` always answers `fresh` / `stale` / `absent` /
`unreadable`. `close_session` regenerates it after the state flip, via
the Set 119 S3 `CLOSE_MANDATED_WRITES` declaration mechanism rather than
by adding a filename to a list — so a close-time write cannot stale the
verification stamp it is written after.

**The states absence used to hide.** `unknown` for a token no reader can
name (where 11 of Session 2's 15 preserved entries now surface, raw token
intact rather than laundered); `unreadable` beside `absent` and `read`,
so *"no work"* and *"cannot read the evidence"* stop being the same empty
row; `stale` for the projection against its own inputs. And a fourth the
spec did not name: `orphanEntries`, counting ledger entries with no
`sessionNumber` — every reader in both languages silently drops them,
which is where Session 2's other 4 preserved entries had gone. A count
and not rows, because inventing rows for entries that name no session
would have broken the parity the projection has to hold.

**The `<- here` marker is gone** (operator ruling, 2026-08-11).
`HERE_MARKER`, both rendering sites, `_mark_here` and
`ChecklistRow.is_here` are removed, and `record_post` records
`inProgressStepKeys` — a list, since two steps can be in flight and zero
is a real answer the marker had to fake. The `in-progress` token carries
the fact directly now that the writer is strict, so nothing is inferred.

## What was deliberately not done

- **No extension changes.** Deleting the TypeScript derivation belongs to
  the extension carve. The shared parity corpus keeps its `cases`
  byte-identical so the TS suite stays green and its `markHere` stays
  covered; the Python half compares the five fields both implementations
  still produce, and the divergence is declared in the corpus's
  `_readme`. Named residual: the extension's comments still describe
  `markHere` as mirroring `session_checklist._mark_here`, which the carve
  will delete along with the code.
- **The UAT-matrix fixture's 2 `completed` tokens were not migrated.**
  It is pinned test data, not a record of a real session, and changing it
  is an extension-test change.
- **`skipped` was not re-admitted.** Session 3 makes it substantially
  cheaper — after the carve, teaching a new token is a one-place change
  instead of a two-language one — but that is a decision, not a
  consequence.
- **The absent-`status` four remain an open writer decision.** Whether
  absence should be refused at the writer was named by S1, inherited by
  S2, and is not answered here. Session 3 made them *visible*
  (`orphanEntries`) rather than deciding their fate.
- **Nothing consumes the projection yet.** It is written at close and
  checkable with `--check`; the Work Explorer still derives its own rows.

## What this unblocks

- **The extension carve.** `session-progress.json` is the one computed
  answer §6.5 of the target-state proposal was waiting on. That set can
  delete `sessionStepModel.ts` (~1,830 lines), its ~110 tests,
  `test_step_row_parity.py` and the shared corpus in the same pass that
  teaches the Explorer to read the projection.
- **Set 115 Session 4**, which was blocked because it would have rendered
  corrupt data. Whether it is re-authored or dropped remains its own
  decision.

## Test budget

The spec capped this set at **40 new test functions** — an explicit irony
budget for adding tests to a framework already carrying ~3,900. Spent:
**39** (S1 19, S2 14, S3 6 net). Every session's suite was checked for
vacuity by mutation rather than only for green.

## Verification

| session | rounds | verdict |
| :--- | ---: | :--- |
| 1 | 3 | VERIFIED (round 1 found the `skipped` contradiction on both lenses; the fix was the operator's vocabulary ruling) |
| 2 | 3 | VERIFIED (two findings, same class: intent documented, not enforced) |
| 3 | 1 | VERIFIED, 0 blocking, 4 nits — two accepted and fixed, one taken as a named residual, one dismissed on measurement |

All rounds cross-provider to a non-`anthropic` effective provider.
