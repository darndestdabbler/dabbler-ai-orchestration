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

Where the wall is a rule and no fix within the rules clears it, the entry is
a **request for an exception**, and it carries four more lines. A person
decides it with `dabbler session waive`, which prints these lines on its card
in the Mechanic's words; the **Deterministic fix** line is the framework
change the exception argues for.

```markdown
- **Stop at:** `<the stop's at, from run.json>` -- the request is of that
  stop only, and a later stop needs its own.
- **Rule in the way:** the rule, in its own words, from the stop.
- **Why it is wrong here:** why this case is not the one the rule is for.
- **What going past it lets through:** what stays unmet, plainly.
- **What was tried within the rules:** each attempt and what happened.
```

<!-- Entries follow. -->
