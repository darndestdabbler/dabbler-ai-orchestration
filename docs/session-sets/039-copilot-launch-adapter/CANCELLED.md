# Cancelled — superseded by Set 044's log-harvest architecture

**Cancelled:** 2026-05-23
**Operator:** darndestdabbler
**Reason:** Set 044's empirical spike (see
[`proposal.md`](../044-ai-chat-log-discovery-and-experiments/proposal.md)
v1) confirmed that Copilot 1.0.51 emits OTel JSONL spans that carry
13 of 15 enumerated harvest objectives natively (with one required
env var: `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`).
A per-provider TypeScript launch adapter wrapping the Copilot CLI
invocation buys nothing the OTel doesn't already deliver, except
setting the one required env var — which is a one-line addition to
the extension's terminal-launch helper, not a session-set.

The S5 effort sidebar additionally established that
`gen_ai.request.reasoning_effort` is **absent at every effort level**
on Copilot (low, medium, high), so even the original adapter's role
in capturing reasoning effort would not have worked natively. The
launch wrapper in Set 045 carries effort as a CLI arg instead.

**Successor:** Set 045 (`045-log-harvest-implementation`) — Session 3
ships the Copilot OTel JSONL parser + the wrapper as part of the
dual-primary harvester implementation.

**Restoration:** Drop a `RESTORED.md` in this folder to bring the set
back. Not recommended without a new consensus audit pass.
