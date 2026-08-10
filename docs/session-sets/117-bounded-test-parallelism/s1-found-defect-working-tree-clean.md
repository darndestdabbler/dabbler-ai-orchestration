# Found defect — `working_tree_clean` never blocks on modified tracked files

**Found:** 2026-08-10, Set 117 Session 1, incidentally.
**Status:** OPEN. Diagnosed, not fixed — operator directed it to its own
session (decision journaled).
**Severity:** Major. It is a release-gating check that has been silently
permissive.

## What is wrong

`check_working_tree_clean` in `ai_router/gate_checks.py` detects
**untracked** files and misses **modified tracked** ones entirely. A
session can close with uncommitted edits to real source files, which is
precisely what the gate exists to prevent — the close records a state that
was never committed.

## Why (the exact mechanism)

`git status --porcelain` emits a two-character status field, then a space,
then the path. For a modified file the first character is a space:

```
' M docs/session-sets/test-set/spec.md'
'?? docs/session-sets/test-set/stray.txt'
```

`_run_git` (`gate_checks.py`) returns `proc.stdout.strip()`, which removes
the **leading space of the first line**. The parser then takes a fixed
offset:

```python
path_part = line[3:]
```

For `'?? path'` that is correct. For a stripped `'M docs/...'` it slices
three characters off a line that only has one status character plus a
space, yielding:

```
'ocs/session-sets/test-set/spec.md'
```

That path is under no session-set directory and matches nothing in
`files_changed`, so the in-scope filter discards it and the entry never
reaches the blocking set. The gate returns `(True, '')`.

Note the interaction that hides it: the corruption alone would be caught
by the scope filter reporting a nonsense path, but the scope filter's job
is to *drop* out-of-scope paths — so a corrupted path is indistinguishable
from a legitimately out-of-scope one, and the failure is silent.

## Reproduction (independent of the test fixtures)

```
git init repo && cd repo
mkdir -p docs/session-sets/test-set
echo "# spec" > docs/session-sets/test-set/spec.md
git add -A && git commit -m init
echo "uncommitted work" > docs/session-sets/test-set/spec.md
```

```python
from ai_router import gate_checks
gate_checks.check_working_tree_clean(
    "<repo>/docs/session-sets/test-set", <a valid Disposition>,
)
# observed: (True, '')      <- the gate passes
# expected: (False, "...spec.md...")
```

Confirmed directly:

```
RAW STATUS: ' M docs/session-sets/test-set/spec.md\n'
VIA HELPER: (0, 'M docs/session-sets/test-set/spec.md', '')   <- space gone
GATE:       (True, '')
```

## Suggested fix

Do not slice at a fixed offset. Split the status field from the path:

```python
parts = line.split(None, 1)
path_part = parts[1] if len(parts) > 1 else ""
```

This is correct for `' M path'`, `'?? path'`, `'R  old -> new'` (the rename
arrow is handled downstream as it is today), and survives the strip in
`_run_git`. Fixing `_run_git` instead would be riskier — other callers rely
on its stripped output.

## Why it was not fixed here

Set 117 Session 1 is about test parallelism. This is a **tightening** of a
gate that has been permissive for a long time, so the blast radius is
unknown until the full suite runs — existing tests and possibly other
session sets may depend on the current leniency. The operator directed
(2026-08-10, journaled in `decisions.jsonl`) that it get its own session
with its own verification loop rather than a tail-end patch.

It did **not** block Set 117 S1's close: that session's tree was genuinely
clean and committed.

## How it was found

By a **falsifier**, not by reading the code (L-112-1). Session 1 added
`checklist-posts.jsonl` to `_WORKING_TREE_IGNORE_PATTERNS` and wrote a
companion test that plants ordinary uncommitted work beside the exempt
bookkeeping to prove the exemption is narrow. That falsifier failed — the
gate accepted a modified `spec.md`. The exemption test alone would have
passed and proved nothing, which is exactly the failure mode L-112-1
describes: a gate that matches nothing looks identical to one that finds
nothing.

The shipped falsifier now uses an untracked file
(`test_working_tree_clean_still_blocks_on_real_work`), because that is the
path the gate genuinely covers today. **When this defect is fixed, that
test should be extended to a modified tracked file** — it is the assertion
that will prove the fix.
