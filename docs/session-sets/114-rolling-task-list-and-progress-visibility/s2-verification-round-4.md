VERIFIED — The fixes centralize the “logged work” predicate on entries with no `kind`, apply it in both activity-log and checklist-transition gates, and gate ordinal reconciliation on an intact spec so inserted/renumbered plan rows no longer evict seeded rows. I checked the relevant code paths and ran the focused gate/plan tests successfully.

- Fix verdict: L1 bookkeeping excluded from real-work filters -- fix-accepted
- Fix verdict: L2 bookkeeping-only activity log rejected -- fix-accepted
- Fix verdict: L3 identity-first reconciliation prevents inserted steps from hiding seeded rows -- fix-accepted
- Fix verdict: L4 ordinal fallback gated by intact spec for ordinary-key renumbering -- fix-accepted