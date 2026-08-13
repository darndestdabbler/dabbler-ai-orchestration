**VERIFIED**

- Fix verdict: L1 capability probe targets launcher interpreter -- fix-accepted
- Fix verdict: L2 dogfood proves setup/default-module recovery -- fix-accepted
- Fix verdict: L3 -- duplicate-of L1
- Fix verdict: L4 -- duplicate-of L2
- Fix verdict: L5 dogfood CI host Python premise provisioned -- fix-accepted
- Fix verdict: L6 launcher interpreter resolved after venv creation -- fix-accepted
- Fix verdict: L7 dogfood exercises production handoff/default scaffold -- fix-accepted

I checked the fix hunks in the installer, scaffold command, launcher resolver, dogfood lane, and CI workflow. The remediations now late-resolve the launcher interpreter after install, pass that resolver through the real setup/install call sites, provision the CI host import premise, and dogfood real default-module creation rather than only the gate.