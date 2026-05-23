# Cancelled — superseded by Set 044's log-harvest architecture

**Cancelled:** 2026-05-23
**Operator:** darndestdabbler
**Reason:** Codex was explicitly out of scope for Set 044 (see
`spec.md` line 51 in `044-ai-chat-log-discovery-and-experiments/`).
The empirical evidence Set 044 gathered for Copilot and Claude is
sufficient to retire the per-provider TypeScript launch-adapter
approach across all backends, not just the two measured. Codex
coverage, when needed, will arrive as a parser shim in a follow-on
to Set 045 — comparable in size to Set 045's Copilot or Claude
parser, not as a dedicated session-set.

Per Set 044's cross-provider consensus
([`proposal-consensus-journal.md`](../044-ai-chat-log-discovery-and-experiments/proposal-consensus-journal.md)),
the architectural commitment to harvest-based observability with a
small cross-provider wrapper makes a per-provider Codex adapter
indefensible.

**Successor:** Codex parser, deferred follow-on to Set 045 (or
later). Add when a Dabbler workflow actually needs Codex
observability.

**Restoration:** Drop a `RESTORED.md` in this folder to bring the set
back. Not recommended without a new consensus audit pass.
