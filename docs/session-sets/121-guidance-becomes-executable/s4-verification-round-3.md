**VERIFIED** — I checked the fix delta against the current measurement code, tests, S1-S4 ledgers/issues, regenerated JSON/Markdown report, and instruction-cap gate/test. The prior blockers are resolved and I found no new in-hunk Critical/Major defects.

- Fix verdict: L1 four-session reproducible cap measurement -- fix-accepted
- Fix verdict: L2 authorization rows counted as completed rounds -- fix-accepted
- Fix verdict: L3 cap self-application test conflicted with equality-at-cap semantics -- fix-accepted

L2’s auto-criterion is stale because the L1 fix legitimately adds S4 to the rendered round-count map; the underlying counter now uses only `round-completed` rows and matches the source ledgers.