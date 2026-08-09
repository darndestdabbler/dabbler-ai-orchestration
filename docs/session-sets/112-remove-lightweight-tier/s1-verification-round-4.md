**VERIFIED** — I checked the live remediation paths for start/close refusal, `_uat_policy` propagation, quoted `tier` parsing, close-out doc cleanup, and the extension/Python bulk-upgrade chains; the targeted remediation tests pass.

- Fix verdict: L1 fail-loud error swallowed by gate caller -- fix-accepted
- Fix verdict: L2 close-out doc documented deleted Lightweight paths -- fix-accepted
- Fix verdict: L3 real lifecycle path did not fail loud -- fix-accepted
- Fix verdict: L4 bulk-upgrade invoked deleted migrator -- accepted-with-modification

**NITS**

- **Nit:** The upgrade confirmation dialog still says it runs “the three schema migrators,” though source and built command lists now execute only the two surviving modules.