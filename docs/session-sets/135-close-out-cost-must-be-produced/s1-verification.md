**VERIFIED** — I tried to break the audit against the plan and the high-risk claims. The substantive claims are supported by the artifacts I checked: `cost-audit.json` has per-session rows/classifications, the named Set 113/121/130–135 rows support the markdown findings, and `ai_router/seat_cost.py` confirms `routed_api: measured` is not producer-reachable.

**NITS**
- `cost-audit.md` says all four recoverable sessions “wrote nothing at all” as support for an owed-block gate, but its own table shows only 121 S3 was a closed post-contract omission; the others were pre-contract or not closed yet.
- The “129 closed sessions… Their blocks said so” wording overstates the record: many had no cost block at all.
- The reachable-status falsifier count says 7 versions, but adding “component outside `seat_cost.COMPONENTS`” would also catch the `operator_time` version.
- Markdown read time (`12:52Z`) and JSON `readAt` (`12:48:45Z`) do not match.