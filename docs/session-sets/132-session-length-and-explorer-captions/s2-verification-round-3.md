VERIFIED — I checked the remediation delta against the prior ledger items and the touched code/docs/log surfaces. The fixes resolve the substantive correctness problems; I found no Critical or Major in-hunk regression.

- Fix verdict: L1 stale pre-fix `HEAD` rerun wording -- fix-accepted
- Fix verdict: L2 Parkinson/refit attribution overstated as a deflated-N artifact -- fix-accepted
- Fix verdict: L3 unexcepted over-cap corpus count inconsistent across surfaces -- accepted-with-modification

NITS

- **Nit:** `decisions.jsonl` still preserves the original decision text saying “50 legacy over-cap sessions,” while the shipping/code/doc surfaces now say 47 sessions across 31 specs.
- **Nit:** The Session 2 Playwright `test-runs.jsonl` record lacks a `detail` field disclosing the composite run, though `decisions.jsonl` and `disposition.json` do disclose it.