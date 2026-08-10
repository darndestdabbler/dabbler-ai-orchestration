# Set 114 S3 — remediation of the end-of-set path-aware critique

> **Stage:** the Set 066 end-of-set path-aware critique (`pathAwareCritique:
> advisory`), run after the routed session verification returned VERIFIED.
> The raw artifact is `path-aware-critique.json` and is **never edited**;
> this sidecar records what was done about it.
>
> **Critics:** `gpt-5.5` (openai) — ISSUES_FOUND, one Major.
> `gemini-3.1-pro-preview` (google) — VERIFIED, three nits.
> Two distinct providers, each reading the repository itself.

## Why this stage earned its cost

The routed session verification (round 1, discovery, both lenses,
`gpt-5.5`) returned **VERIFIED with zero findings**. The path-aware
critique — same set, same code, different access — then found a real
defect the routed round structurally could not: it reads a *diff*, and
the defect is a **semantic difference between two files neither of which
changed in a suspicious way**. That is the Set 065 finding restated, and
this is the second time in this set that a second lens over the same code
paid for itself (Set 114 S2 round 1 was the first).

It also found, indirectly, two close-gate regressions this set had
already shipped — see §3.

---

## 1. Major (gpt-5.5) — a falsy non-string `kind` diverged. FIXED.

**The finding.** Python reads `kind` with `str(entry.get("kind") or "")`;
the TypeScript mirror used `String(entry.kind ?? "")`. `??` falls back
only on `null`/`undefined`, so an entry carrying `kind: 0` or
`kind: false` — valid JSON, and this reader treats on-disk data as
untrusted — read as **absent** in Python and as the literal strings
`"0"` / `"false"` in TypeScript. That flips `isLoggedStep`, which decides
whether an entry may **claim a planned row**. The terminal and the panel
would then disagree about which row is current and whether a planned step
had been executed — the exact failure the whole parity mechanism exists
to prevent.

**Reproduced before fixing** (not accepted on the critic's word):

```
Python  is_logged_step({'kind': 0})     -> True    (a logged step)
        is_logged_step({'kind': False}) -> True
Node    String(0     ?? '').trim() == ''-> false   (bookkeeping)
        String(false ?? '').trim() == ''-> false
```

**Adjudication: accepted, and treated as a CLASS rather than a point
defect** (L-069-1). The same `String(x ?? "")` coercion appeared at every
string-ish field read — `kind`, `stepKey`, `description`, `status` — so
fixing only the reported site would have left the class alive at four
others. The fix is one helper, `pyStr`, that reproduces Python's
`str(x or "")` exactly, used at every field read. That is the same shape
Set 114 S2 used when it collapsed two `kind` filters into the single
`is_logged_step` predicate: **one coercion, used everywhere, is what stops
the two languages drifting again.**

**Pinned, not just fixed** (L-112-1 — a gate that only ever passes proves
nothing). Two new cases in the shared corpus, which both languages assert
against:

- `a-falsy-non-string-kind-is-no-kind-at-all` — `kind: 0` and
  `kind: false` are ordinary logged steps and **do** claim their planned
  rows.
- `falsy-non-string-fields-read-as-empty` — a falsy non-string `stepKey`
  / `description` / `status` reads as the empty string, so such a step is
  anonymous (uncollapsible: two of them are two rows) and its status is
  unknown rather than the literal text `"0"`.

Both cases were written against Python's real behaviour first
(`pytest ai_router/tests/test_step_row_parity.py` — 30 passed), then run
against the TypeScript mirror. Before the fix the TypeScript half of
those two cases fails; after it, both languages agree.

**Severity note.** By this repo's consequence rubric this sits at the
Minor/Major boundary — no shipping writer emits a non-string `kind`, so
the probability arm is low. It was fixed anyway rather than adjudicated
down, for three reasons: the set's central claim is that the two
implementations *cannot* disagree, and a demonstrated counterexample is a
hole in the claim rather than in the code alone; the fix is five lines
and reversible; and it closes a whole class, not one input.

## 2. Nits (gemini-3.1-pro-preview) — two fixed, one dismissed.

- **`isLoggedStep` accepted an array.** `typeof [] === "object"` in
  JavaScript, so an array read as a keyless — therefore logged — step,
  where Python's `isinstance(entry, dict)` rejects it. The critic noted it
  is unreachable today because `buildStepLedger` filters on
  `sessionNumber` first. **Fixed anyway** (`Array.isArray` guards in both
  `isLoggedStep` and the two entry filters) — "unreachable via the
  current caller" is exactly how a latent class survives to be found
  later on an expensive path.
- **`FENCE_RE` was stricter than Python's.** `[ \t]*` versus Python's
  `\s*`: a fenced block prefaced by a vertical tab or form feed would be
  stripped by Python and retained by TypeScript, so a spec's embedded
  sample could be read as that spec's own steps. **Fixed** — the mirror
  now uses `\s*`.
- **Float `stepNumber`.** The critic asserted Python's `int(val)` would
  truncate `3.9` to `3` while TypeScript returns `null`. **Dismissed as
  factually wrong about the code:** `session_checklist._step_number_of`
  is `isinstance(value, int) and not isinstance(value, bool)`, so a float
  answers `None` — identical to the mirror's
  `typeof value === "number" && Number.isInteger(value)`. Verified by
  reading the function rather than by taking either side's word.

## 3. What the critique surfaced indirectly: two close-gate regressions
   this set had already shipped

Re-running the **Layer 2** suite as part of this remediation (it is in
`CONTRIBUTING.md`'s canonical full pass, but Sessions 1 and 2 recorded
only pytest and Playwright) turned up `sampleProjectSmoke.test.ts`
failing at `close_session` — **broken by this set's own new gates**:

1. **Set 114 S2's `check_activity_log_entry`** stopped counting
   `kind`-bearing entries. The sample smoke wrote an activity log whose
   *only* entry was `{sessionNumber: 1, kind: "sample_smoke"}`, so the
   sample project could no longer close.
2. **Set 114 S1's `checklist_posted`** then refused the same close: the
   sample session had never posted a checklist.

Both are real: they would have hit any consumer following the sample
path, and neither was visible to the suites S1 and S2 recorded. Fixed in
the fixture, through the shipping writers rather than by hand-writing
ledger lines — the smoke now logs a real step (no `kind`) *alongside* the
bookkeeping entry, so it still exercises the mixed shape a real set has,
and it renders the checklist through the real CLI before closing, because
**rendering is what records**.

This is the same lesson the set already carries, arriving one level up:
a gate that changes what counts must be walked across every fixture that
depended on the old meaning.

## 4. Suites after remediation

| Layer | Result |
|---|---|
| pytest (full repo) | 3795 passed / 0 failed / 9 skipped (32m51s) |
| Layer 2 mocha | 1672 passing / 0 failing / 1 pending (27s) |
| Layer 3 Playwright | 36 passed / 0 failed (19.7m) |

All three run **after** the last code change.
