**VERIFIED**

- Fix verdict: L1 unknown session statuses dropped before the run-prompt gate -- fix-accepted

I checked the fix-delta paths in `rowMenuHelpers.ts`, `fileSystem.ts`, and the scan-driven session-row tests. The remediation now fails closed on before-candidate numbering gaps created by dropped invalid ledger entries while preserving healthy and after-candidate behavior; no blocking defects found.