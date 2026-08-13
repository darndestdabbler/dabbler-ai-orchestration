**VERIFIED** — I checked the remediated install/probe path, scaffold handoff, dogfood assertions, and CI provisioning against the ledger. The fixes now late-resolve the launcher interpreter, fail closed when that interpreter lacks `ai_router.modules`, and exercise real default-module creation in the dogfood lane.

- Fix verdict: L1 launcher interpreter divergence -- fix-accepted
- Fix verdict: L2 dogfood full setup/default recovery coverage -- fix-accepted
- Fix verdict: L3 -- duplicate-of L1
- Fix verdict: L4 -- duplicate-of L2
- Fix verdict: L5 clean-runner host ai_router premise -- fix-accepted
- Fix verdict: L6 late launcher interpreter resolution after venv creation -- fix-accepted
- Fix verdict: L7 dogfood production handoff bypass -- fix-accepted