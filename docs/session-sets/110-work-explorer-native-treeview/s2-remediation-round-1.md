# Session 2 — remediation of round 1's nits

> **Round 1 returned VERIFIED with ZERO blocking findings**, on both
> discovery fan-out calls (`gpt-5-6-sol` ×2, $1.34). By the loop's own
> rules that is a stop: a Minor-only round is effectively verified, and
> grinding further rounds is what the severity-gated-stop guidance
> exists to prevent.
>
> These fixes were made anyway, because they are cheap and several are
> genuine correctness defects rather than polish — and because leaving
> them would mean shipping code the verifier had already named. One
> `remediation-review` round then runs on the fix delta, so the verdict
> covers the state that actually ships rather than the state that was
> reviewed. That is one bounded round, not a loop.

## Convergent findings carry more weight

Both fan-out calls independently raised the empty-bucket twisty, the
malformed-session-number identity gap, the vacuous zero-roots test, the
tracked-file rewrite, and the overstated icon claim. Two independent
reads reaching the same five is a stronger signal than either alone, and
it is why those five were fixed rather than recorded.

## Disposition, finding by finding

| # | finding | disposition |
| --- | --- | --- |
| 1 | Empty buckets advertise expansion | **Already fixed** before the round returned — found in self-review. Independent corroboration. |
| 2 | Malformed ledgers can produce duplicate row identities | **Fixed** |
| 3 | Titles trim-tested but stored untrimmed | **Fixed** |
| 4 | `markWebviewResolveStart/End` overwrite on re-resolve | **Fixed** |
| 5 | The "zero root modules" test does not test zero roots | **Fixed** |
| 6 | The Playwright probe rewrites a tracked artifact every run | **Fixed** |
| 7 | `types.ts` comment contradicts the synthesis behaviour | **Fixed** |
| 8 | Notes say "one Layer-3 spec"; there are two | **Fixed** |
| 9 | The stale-path note is itself stale | **Fixed** (removed) |
| 10 | "Fallback offers no actions" overstates the gating | **Fixed** (prose) |
| 11 | Theme-asset test passes for visually identical files | **Fixed** |
| 12 | The icon docs overstate what the probe proves | **Fixed** (claim narrowed) |

Nothing was disputed. Nothing was deferred.

---

## The two that were real correctness defects

### 2 — duplicate session numbers could collide row identity

**Acceptance check.** The fourth level derives `TreeItem.id` as
`session:<set>/<number>`, and VS Code keys selection and expansion state
on that id. A hand-edited or corrupt ledger carrying the same number
twice therefore produced two rows sharing one identity, which move
together. Zero and negative numbers were accepted for the same reason.

Pre-fix, driving `normalizeLedgerSessions` with a duplicate:

```
> normalizeLedgerSessions([
    { number: 1, title: "first wins", status: "complete" },
    { number: 1, title: "shadow",     status: "in-progress" },
  ])
[ { number: 1, title: 'first wins',  status: 'complete' },
  { number: 1, title: 'shadow', status: 'in-progress' } ]     <-- two rows, one id
```

Post-fix:

```
[ { number: 1, title: 'first wins', status: 'complete' } ]
```

Pinned by three new tests in `sessionLedgerRows.test.ts`
(`non-positive session numbers are rejected`, `a DUPLICATE session number
keeps the first and drops the rest`, `titles are stored trimmed`). All
pass; each fails against the pre-fix normaliser.

**First-wins rather than drop-both**, because dropping both would hide
work — the Explorer's standing rule — and first-wins is deterministic.

### 4 — the webview resolve marks were not first-wins

**Acceptance check.** `markFirstChildrenServed` guarded against
overwrite; `markWebviewResolveStart/End` did not, though a `WebviewView`
is re-resolved on hide/re-expand and on window reload. The figure Session
4 quotes would silently have become "the last time the operator toggled
the panel".

The new test `the webview resolve marks are ALSO first-wins` calls the
pair twice and asserts both marks are unchanged. It fails against the
pre-fix module (the second call overwrites both) and passes after.

Fixing it exposed a second-order problem the verifier had also named:
the emission test depended on those marks being settable twice, so it
began failing. That is the coupling nit 5 was about — the module is
stateful and the tests were order-dependent. `resetStartupMarksForTests()`
resolves both.

---

## Notes on the ones that were not code defects

**5 — the vacuous test.** `zero root modules is a legitimate
measurement` asserted only that `treeFirstChildrenServed` was a number,
which the *previous* test had already made true by calling
`markFirstChildrenServed(4)`. It would have passed whether or not zero
was handled. It now resets, asserts the mark is null first, calls
`markFirstChildrenServed(0)`, and asserts both the timestamp and a count
of exactly `0`. This is the more useful category of finding: the test was
green and meaningless.

**6 — the tracked artifact.** Running the Layer 3 suite rewrote
`s2-evidence/icon-render-mechanism.json` with a fresh timestamp and a
machine-specific absolute URI, so merely running tests dirtied the
checkout — and it had already silently superseded the artifact the
write-up quotes, which is how nit 9 came to exist. The probe now always
writes to the run's own `testInfo.outputPath()`, and touches the tracked
file only under `DABBLER_WRITE_EVIDENCE=1`. The committed measurement is
the record; a re-run reproduces it beside the run, not over it.

**12 — the overstated claim.** The probe proves the SVG's authored
colours are what render, hence that `currentColor` cannot inherit the
workbench foreground. It does **not** prove a `{light, dark}` pair is the
only workable answer — one asset painted legibly on both themes would
also work. The docs now say the pair is the *selected* solution and why,
rather than the required one. Worth taking seriously: this session's own
headline finding was that two advisors over-generalised from one
mechanism, and generalising in the other direction would be the same
mistake wearing different clothes.

---

## A 13th finding, from running the suite rather than from the round

Nit 6 turned out to have a sibling the verifier could not have seen,
because it only manifests when the FULL Layer 3 suite runs.

**`real-host-baseline.spec.ts` overwrote `s1-real-host-baseline.json`.**
That file is Session 1's measurement of record — quoted by
`s1-migration-decision.md` and by the operator's Session 4 startup gate
(*"the 5,102 ms webview figure is the before-number"*). It is part of the
standing Layer 3 suite, so every full run silently re-measured and
replaced it. This session's run did exactly that.

This is the same defect class as nit 6 (a test writing over tracked
evidence), and per the repo's own convention a fix that closes a class
must reach every sibling site rather than the reported one. So:

1. **S1's artifact was restored** from git, unmodified.
2. The re-run's numbers were kept as *S2* evidence
   ([`s2-evidence/webview-baseline-rerun.json`](s2-evidence/webview-baseline-rerun.json))
   rather than discarded — they are a THIRD independent reproduction of
   the webview before-number, on the post-remediation build.
3. The write is now gated behind the same `DABBLER_WRITE_EVIDENCE=1`
   opt-in as the icon probe. The measurement still runs and still prints
   on every suite run; only the write to the tracked file is gated.

**The numbers agreed, and that is not the point.** Re-run
view-open→first-row: 5250 / 5185 / 5429 ms at 10 / 100 / 500 sets,
against S1's 5344 / 5293 / 5605 — within ~2%, and flat across the same
50× change in set count, which independently reproduces S1's central
finding. A later session silently rewriting an earlier session's recorded
evidence would be wrong even when the rewrite is an improvement.

## Suite state after remediation

| layer | result |
| --- | --- |
| typecheck | clean |
| lint | 7 errors / 61 warnings — the same pre-existing set; no new-file findings |
| Layer 2 | see `disposition.json` |
| Layer 3 | re-run in full against the post-remediation build before close |
