# Mechanic log

One entry per intervention, written by the Mechanic -- a fresh AI instance a
person opens with `dabbler consult --mechanic` when a session is stuck -- in
the same change as its fix. The file is tracked, so the Primary Reviewer reads
the entry beside the fix in the session's diff and judges "minimum" against
what actually changed. A fix made after the land is taken by the framework
only with an entry here, and the entry's heading is the reason it records.

The list is also the defect report: each entry is a wall a person met, and
enough entries on one wall earn the framework a deterministic fix.

Newest entry last. Each entry has this shape:

```markdown
## Session <N> -- <the stop, in a few words>

- **Stop:** the kind, the code and the reason, as the framework wrote them.
- **Diagnosis:** why the session could not go on.
- **Agreed:** what the person agreed to, and any verb they typed themselves.
- **Files:** every file the fix changed.
- **Why this was the minimum:** what was left alone, and why the author's work
  still stands.
- **Deterministic fix:** what the framework would do so that no Mechanic is
  needed here next time.
```

<!-- Entries follow. -->
