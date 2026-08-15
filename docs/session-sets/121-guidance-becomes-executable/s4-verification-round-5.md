**VERIFIED** — I checked the current measurement module, raw/markdown cap artifacts, S1-S4 round ledgers, issue JSONs, and the cap self-application guard. The fixes now include Session 4 traffic, count only `round-completed` rows, and align the test with the shipped `lines <= cap` semantics; I found no blocking in-hunk regressions.

- Fix verdict: L1 four-session reproducible cap measurement -- fix-accepted
- Fix verdict: L2 authorization rows counted as verification rounds -- fix-accepted
- Fix verdict: L3 cap self-application test forbids valid headroom usage -- fix-accepted