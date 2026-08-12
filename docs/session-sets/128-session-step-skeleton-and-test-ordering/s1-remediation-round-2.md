# Remediation — Set 128, Session 1, Round 2 (supplementary discovery)

One Major finding, accepted and fixed.

## Finding — a bare `close` let any final work step satisfy the skeleton

**Accepted.** `_INTENT_RE[CLOSE_OUT]` was `\bclos(?:e|e[-\s]?out|ing[-\s]?out)\b`,
whose first alternative matches a bare `close` anywhere. So a spec ending
in *"Close the tracking issue."* or *"Close remaining docs."* had its
final **work** step read as the close-out stage, and a spec that declares
**no close-out at all** passed the gate that exists to require one.

That is a false all-clear, which the conventions block names as
Critical/Major by construction: it is strictly worse than the prose it
replaced, because an author would then have reason to trust it.

**Why the bare form existed, and why it could not simply be deleted.**
The Set 127 S2 shape ends *"...; verify; close."* — the planted
falsifier — and the compression finding there is precise only if `close`
in that position registers as close-out intent. The fix therefore
narrows rather than removes: a bare `close` counts **only where it stands
as the instruction itself**, at the end of the step or before punctuation.

**Fix:**

```
\bclos(?:e|ing)[-\s]?out\b                       close-out / close out / closeout / closing out
\bclose\b\s*(?:[.;,)\]]|$)                        "...; verify; close."
\bclos(?:e|es|ing)\s+(?:the\s+|this\s+)?(?:session|set)\b
\bclose_session\b
```

`Close the tracking issue.` matches none of them; `Close-out.` and
`...; verify; close.` match as before.

## Falsifiers added

| test | direction |
|---|---|
| `test_a_bare_close_on_an_unrelated_object_is_not_close_out` (3 cases) | FIRES — "Close the tracking issue.", "Close remaining docs.", "Close the loop with the consumer repos." |
| `test_close_out_is_still_recognised_however_it_is_spelled` (6 cases) | DOES NOT FIRE — hyphen, two words, one word, "Closing out", trailing "close.", "Close the session." |

The second row is the one that matters here. **Narrowing a recogniser to
kill a false positive is exactly where a false negative gets
introduced**, so every legitimate spelling is asserted rather than
assumed — and writing that test caught a real mistake in its own case
list: `"Record the runs of record; close."` was offered as a legitimate
close-out step and the check correctly refused it, because that step
*is* a compression of the full suite and close-out. The case was wrong,
not the checker.
