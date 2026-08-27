**VERIFIED** — I checked the fractional `premiumRequests` path through CLI metadata parsing, catalog load/write, refresh planning, the shipped lockfile, and the targeted tests. The prior finding is resolved: finite non-negative floats now persist and price the quorum instead of being discarded as unknown.

**NITS**
- **Nit:** `docs/quick-start.md:254` still lists `--all` as `39` plus unsampled entries, but the current lockfile’s known subtotal is `39.33` after adding `claude-haiku-4.5 = 0.33`; documentation-only and non-blocking.