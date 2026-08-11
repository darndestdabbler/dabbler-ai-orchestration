# Remediation — Set 115 Session 1, Round 2 (supplementary)

**Round 2 finding:** the extension's absent-state path treats a present
`activity-log.json` as evidence of progress even when its `entries` list
is **empty**, while the router's backfill explicitly calls that
not-started. A freshly authored set — `spec.md`, no `session-state.json`,
and the `{"entries": []}` the authoring flow creates up front — therefore
renders in the Explorer as a session in flight nobody started.

**Verdict: ACCEPTED. Real divergence, correctly graded Major, fixed.**

The finding is precise about why it matters *now*: the divergence is
older than this session (the TypeScript side never mirrored Set 077 S4's
`_activity_log_has_entries` fix, added 2026-07-02 after the same false
in-flight state was reproduced live), but this session **published a
claim of parity** — `inferStateInMemory`'s docstring says it applies "the
same inference the Python backfill applies", and
`docs/session-state-schema.md` now presents one table for both sides. A
documented equivalence that does not hold is worse than an undocumented
divergence: it tells the next reader not to check.

This is also the L-069-1 pattern, from the other direction. Set 077 S4
fixed the reported site and did not sweep the sibling implementation in
the other language; the residual sat until a session that touched the
same code advertised parity.

## The fix

`inferStateInMemory` now mirrors `_activity_log_has_entries` exactly,
including its deliberate asymmetries:

| Log content | Router | Extension (before) | Extension (now) |
| :--- | :--- | :--- | :--- |
| `{"entries": []}` | not-started | in-progress ❌ | **not-started** |
| `[]` (legacy bare list) | not-started | in-progress ❌ | **not-started** |
| entries present | in-progress | in-progress | in-progress |
| entries without `dateTime` | in-progress | in-progress | in-progress |
| unreadable / malformed JSON | in-progress | in-progress | in-progress |
| unexpected shape (`entries` not a list) | in-progress | in-progress | in-progress |

The conservative rows are conservative **on purpose**, and the fix keeps
them: file presence stays the in-progress signal when we cannot *prove*
the log is empty. Only a cleanly-parsed, genuinely-empty entries list
demotes to not-started.

The read was restructured while fixing it: the log is parsed **once** and
its entries reused for both the emptiness test and the earliest-timestamp
scan, rather than parsed once for presence and again for timestamps.

## The falsifier

`sessionTitleParity.test.ts` → *"an EMPTY activity log is not evidence of
progress"*: five cases, one per row of the table above, driving
`inferStateInMemory` and `readStatus` over real fixture folders. The two
that would have failed before the fix (`{"entries": []}` and `[]`) sit
beside the three that must **not** change, so the test proves the fix is
narrow as well as present.
