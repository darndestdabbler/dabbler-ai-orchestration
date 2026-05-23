# Cancelled — superseded by Set 044's log-harvest architecture

**Cancelled:** 2026-05-23
**Operator:** darndestdabbler
**Reason:** Set 044's empirical spike (see
[`proposal.md`](../044-ai-chat-log-discovery-and-experiments/proposal.md)
v1) confirmed that Claude Code already writes a complete JSONL log
of every session to `~/.claude/projects/<workspace>/<session-id>.jsonl`
— always-on, no opt-in env-var setup required, assistant content
inlined by default. A per-provider TypeScript launch adapter wrapping
the Claude CLI invocation buys nothing the JSONL doesn't already
deliver.

Set 044's cross-provider consensus
([`proposal-consensus-journal.md`](../044-ai-chat-log-discovery-and-experiments/proposal-consensus-journal.md))
locked this call across both Pass A and Pass B: 3/3 endorsement of
retiring this set in favor of native-log parsing.

**Successor:** Set 045 (`045-log-harvest-implementation`) — Session 4
ships the Claude JSONL parser as part of the dual-primary harvester
implementation.

**Restoration:** Drop a `RESTORED.md` in this folder to bring the set
back. Not recommended without a new consensus audit pass.
