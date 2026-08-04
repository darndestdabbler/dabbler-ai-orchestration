VERIFIED

The remediation corrects the unsupported startup conclusion, tests the real four-action case, caps inline actions accordingly, and supplies an actionable marker-precedence table. No fix remains materially defective; the residual evidence gaps are non-blocking and explicitly assigned to S4.

Fix verdict: L1 startup claims now distinguish the measured discovery floor from unmeasured activation and rendering costs -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 four-action behavior was re-spiked and the implementation constraint was reduced to at most two inline actions -- accepted-with-modification  
Fix verdict: L4 marker precedence is now explicitly specified and the highest-severity cases are demonstrated -- accepted-with-modification

### NITS

- **Nit:** Two inline actions were demonstrated only at default width, not minimum width. → **Location:** `s1-migration-decision.md` §3(b). → **Fix:** Complete the already-recorded S4 minimum-width check and drop inline actions if labels remain unreadable.
- **Nit:** The spike code comment orders tier mismatch before duplicate name, while the binding decision table orders duplicate name before tier mismatch. → **Location:** `s1-spike-evidence/spike-extension/extension.js`, `SpikeProvider` worst-case-row comment; `s1-migration-decision.md` icon-precedence table. → **Fix:** Align the comment with the table; S2 should treat the documented table as authoritative.