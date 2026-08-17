**VERIFIED** — I checked `cost-audit.md`, `cost-audit.json`, the session spec, and the `seat_cost.py` engine/store rules. The fixes now separate open/in-flight sessions from historical omissions and recompute the primary corpus over in-scope schema-v4 sessions; no blocking issue found.

Fix verdict: L1 open sessions inflated the recoverable gap count -- accepted-with-modification  
Fix verdict: L2 out-of-scope corpus used as authoritative totals -- fix-accepted

**NITS**
- **Nit:** `cost-audit.json`'s `classificationTests` glossary still defines `recoverable` generically and omits `open_no_block_owed`, though the actual session classes, counts, and Markdown conclusions use the corrected distinction.