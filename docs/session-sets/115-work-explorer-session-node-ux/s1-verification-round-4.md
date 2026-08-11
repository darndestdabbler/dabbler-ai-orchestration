**VERIFIED** — I checked the remediated TypeScript scan/synthesis paths, the title-normalization helpers, and the Python activity-log mirror, and the targeted Set 115 unit tests pass. The blocking ledger defects are resolved with no new blocking in-hunk regression found.

- Fix verdict: L1 repeated TypeScript `spec.md` reads in absent-state synthesis -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 empty activity log classified as in-progress -- accepted-with-modification

**NITS**

- **Nit:** For a non-empty legacy bare-list activity log, TypeScript now derives `startedAt` from bare-list entries while Python’s `_earliest_activity_log_timestamp` only derives it from canonical `{ entries: [...] }`; this is a low-impact observability-only parity residual, not a lifecycle defect.