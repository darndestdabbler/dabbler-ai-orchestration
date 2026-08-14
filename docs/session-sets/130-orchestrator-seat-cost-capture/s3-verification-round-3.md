VERIFIED

- Fix verdict: L1 close_session validates and refuses invalid recorded disposition.cost before reporting -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 whole-session cost command derives routed_api applicability from recorded metrics rows -- fix-accepted

Checked the close-session cost application/render path, the shared cost validator/schema contract, and the `seat_cost.measure_session` derivation/rendering changes. The fixes address the prior fail-open `$0.00` path and the advertised `--session-set-dir --cost-block` path without introducing a new blocking defect in the remediation hunks.