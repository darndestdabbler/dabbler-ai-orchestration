# Cancelled — fallback no longer needed after 044's log-harvest pivot

**Cancelled:** 2026-05-23
**Operator:** darndestdabbler
**Reason:** Set 042 was originally scoped as a fallback path: if
opening the vendor TUI (Copilot, Claude Code, etc.) proved insufficient
for the operator workflow, Dabbler would need its own in-extension
chat surface to retain control of the conversation loop. Set 044's
empirical spike (see
[`proposal.md`](../044-ai-chat-log-discovery-and-experiments/proposal.md)
v1) removed that pressure: 13 of 15 enumerated harvest objectives are
natively reachable from the AI CLIs' own log files, and the remaining
two close via Set 045's dual-primary wrapper + native-log architecture.
Cross-provider consensus on the proposal did not endorse the chat-
interface investment as a near-term need.

The underlying product question this set asked — *"is opening the vendor
TUI sufficient, or do we need our own chat surface?"* — is now answered
"yes, sufficient" for the visibility/coordination case Set 042 was
hedging against. If a different product question later requires a
Dabbler-owned chat surface (e.g., a curated multi-AI cockpit), that
should be a fresh design pass against the then-current architecture,
not a resumption of this spec — which still references the now-
retired `beginSession()` / `LaunchAdapter` contract from cancelled
Set 037.

**Successor (for the upside use case):** Set 046
(`046-explorer-enrichment-from-harvest-records`) leverages the
information surface Set 045 produces to enrich the existing Session
Set Explorer — second-line orchestrator badges, live cost surfacing,
writer-bypass warnings, and other candidate signals. That set
captures the value 042/043 were originally reaching for (richer
operator visibility into in-flight AI work) without building a new
UI surface.

**Restoration:** Drop a `RESTORED.md` in this folder to bring the set
back. Not recommended without a new consensus audit pass against the
post-044 architecture — the spec's prerequisites and Session 3
`beginSession()` wiring would need a re-spec before resumption is
viable.
