# Session 3 — remediation, round 1

One Major finding, from the discovery fan-out's failure-scenario lens
(call 2). Accepted in full: it is correct, and it is the same defect class
this session already fixed twice — a guarantee whose only failure signal is
dropped on the floor.

## Finding: the extension hid `verify_type`'s fail-open `.gitignore` skip

**Verifier's failure scenario.** `.gitignore` is unwritable but the project
file is writable. `write_project_verify_type` warns on stderr and exits 0 by
design (an operator must still be able to declare what verifies their
project). `writeVerifyTypeThroughRouter` treated exit 0 as unconditional
success and discarded stderr, and the toast then asserted the file was
"gitignored". The operator commits their machine-local answer with the next
`git add -A` — the exact failure this set exists to remove, reintroduced on
the extension's primary Copilot path.

**Why it was there.** Earlier in this same session I removed the extension's
own `.gitignore` guarantee — correctly, because it had become a second
implementation of one fact once the writer took the guarantee over. But I
removed its *reporting* with it. The guarantee moved; the signal did not.

## The fix — relay, do not re-derive

The extension does not re-check anything. It relays the one writer's own
report:

- `extractWriterWarning(stderr)` reads `ai_router`'s stderr convention: a
  non-fatal skip is a line **beginning** `WARNING: `. Line-anchored on
  purpose — Python's own `<frozen runpy>:130: RuntimeWarning: ...` reaches
  the same stream and must not be mistaken for it, or *every* successful
  setup would tell the operator their answer is committable.
- `VerifyTypeWriteResult` gains an optional `warning` on the `ok: true` arm;
  exit 0 is explicitly no longer read as unconditional success.
- `SeatSetupOutcome`'s `success` arm gains `writerWarning?: string`, and
  `describeSeatSetupOutcome` flips the toast to `level: "warning"` with
  "…but it is NOT git-ignored: <warning>" instead of the gitignored claim.

This keeps exactly one guarantee and exactly one place that decides whether
it held — which is why the fix is a relay rather than a re-check.

## Falsifiers (both directions, L-112-1)

| test | plants | asserts |
| :--- | :--- | :--- |
| `success: relays the writer's stderr warning instead of claiming gitignored` | a real `WARNING: could not add …` line on stderr with exit 0 | `writerWarning` is set, toast level is `warning`, message says `NOT git-ignored` |
| `success: unrelated stderr noise is NOT reported as a warning` | the genuine `<frozen runpy> … RuntimeWarning` noise | `writerWarning` is `undefined`, toast level is `info`, message still says `gitignored` |
| `extractWriterWarning: fires on the contract, ignores the noise` | the contract line, empty input, runpy noise, and a mid-sentence `WARNING:` look-alike | only the contract line matches |

The look-alike half is the load-bearing one here: a naive `includes("WARNING")`
would have matched the runpy noise that appears on *every* invocation, turning
the honest signal into permanent noise — a gate that fires always proves as
little as one that never fires.

## Suite after remediation

mocha Layer 2: **1462 passing, 2 pending** (was 1459; +3 falsifiers).
Full pytest and full Playwright re-run after this, the last code change.
