VERIFIED

- Fix verdict: L1 inferred `session-state.json` fallback must not arm Explorer active/start derivation -- fix-accepted

The delta now distinguishes a real state file from an inferred snapshot and passes `null` into the flight-facts path when the file is absent, while preserving inferred bucketing/session rows. I found no in-hunk Critical/Major regression.