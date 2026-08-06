# Session 4 — remediation of the close backstop's round 7

> **Round 7 was the close backstop's own in-process verification** (Set 084):
> `gpt-5.5`, anthropic excluded, diff base `aec367e2`. It returned
> **ISSUES_FOUND** with one blocking Major plus one nit, and refused the close.
> Raw artifact: `s4-verification-round-7.md`.
>
> Both accepted. The Major is the same invariant round 6 established, found at a
> **second creator** round 6 never looked for.

---

## The Major — a second door onto the same file

> **The config editor can still create `ai_router/local-overrides.yaml` without
> making it gitignored.** *Severity: Major. Category: Correctness.*

**Correct, and the more useful half is what it says about round 6's fix.**
Round 6 asked "who creates this file?", found `performCopilotSeatSetup`, guarded
it, and stopped. It was the wrong question. The right one is "what must be true
whenever this file exists?" — and that invariant has to hold at *every* writer.

`ConfigEditorPanel` is the second writer: it builds an empty local-overrides
document when none is on disk (`emptyLocalOverridesDoc()`) and writes it on
Save. Directly above that editor, `localOverridesSummarySection` tells the
operator the file "is in `.gitignore` by design" and that values there are
personal and "never get pushed". So the config editor was making round 6's
promise while doing round 6's damage — in a consumer repo whose bootstrap
template still ships no `.gitignore`, a routine `git add -A` commits
machine-local router state.

### The fix

The same pre-write guarantee, at the config editor's write site:

- `ensureLocalOverridesIgnored` runs **before** `writeAtomic("local-overrides.yaml", …)`,
  so the file never exists in an un-ignored state — the ordering is the point,
  because the un-ignored window is exactly what gets committed.
- The workspace root is **derived from the target** (`localOverridesPath` is
  always `<root>/ai_router/local-overrides.yaml`) rather than carried as new
  panel state, so the fix adds no field that can drift out of sync.
- When the rule cannot be written, the save still proceeds — the operator's edit
  is theirs — but a warning names the exact rule to add. The promise is kept or
  withdrawn, never repeated while false.

### The gate, and why it is a source-level pin

`src/test/suite/configEditorLocalOverridesIgnore.test.ts` pins three things: the
panel calls the guarantee; the call **precedes** the write and sits within forty
lines of it (present-somewhere in a 900-line file is not guarding anything); and
a failed guarantee branches to a warning rather than being swallowed.

Driving `_handleSave` for real needs a live webview panel and workspace — Layer 3
territory, and disproportionate for a call-ordering invariant. The *behaviour*
of the guarantee is already unit-tested against a fake filesystem in
`copilotSeatSetup.test.ts`; this pins that the second writer is wired to it, in
the right order. `costDashboardGate.test.ts` sets the precedent for exactly this
shape and states the same reasoning.

Falsified by seeding round 7's defect — renaming the call away:

```
1 passing, 2 failing
  ConfigEditorPanel.ts must call ensureLocalOverridesIgnored before it writes …
  the local-overrides write is not preceded by ensureLocalOverridesIgnored
```

Restored: 3 passing.

---

## The nit — and it was a real false positive, in the dangerous direction

> `isLocalOverridesIgnored` treated `/local-overrides.yaml` as covering
> `ai_router/local-overrides.yaml`.

**Correct, and worth more than its severity.** A leading slash anchors a
gitignore pattern to the repository root, so `/local-overrides.yaml` matches a
root-level file of that name and **never** the one under `ai_router/`. Counting
it meant a repo carrying that rule would have been reported as protected while
the file was fully committable.

That is precisely the failure direction the function's own comment claims to
rule out: *"A false negative costs one duplicate ignore line, which git
tolerates; a false POSITIVE would leave a seat-local `copilot-cli` committable
while the UI promises it is ignored."* The conservative-by-construction claim was
true of the design and false of one entry in the list.

Removed from the covering set, moved into the **non-covering** test case list
beside `!`-negation and `ai_router/`, and the reasoning recorded in the
docstring so the next reader does not re-add it. `local-overrides.yaml` with no
slash at all stays, because a slash-free pattern does match at any depth.

---

## Suite state at close

Run in this order, after the last code change:

| gate | result |
| --- | --- |
| typecheck (`tsc --noEmit -p .`) | clean |
| Layer 2 (`npm run test:unit`) | **1886 passing / 1 pending** (1883 + 3 new) |
| **Layer 3 full, on the final tree** | **33 passed / 0 failed (11.3m)** |
| VSIX claims, on the rebuilt artifact | **15 / 15 PASS** (63 files, 1.42 MB) |

The `< 1,000 ms` startup gate remains missed and remains an explicitly deferred
residual rather than a waiver.
