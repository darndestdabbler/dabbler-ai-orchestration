# Sample reports

Real `python -m ai_router.report` outputs captured against real
reference projects, not mocked-up examples. Each is a faithful copy
of the markdown the report tool produces against that project's
`router-metrics.jsonl`.

| Sample | Shape | Calls | Spend | Savings vs Opus baseline |
|---|---|---:|---:|---:|
| [`cli-library-shape-example.md`](cli-library-shape-example.md) | CLI / library / parser project (~20 session sets, no UAT, no E2E) | 990 | $63.48 | **73.1%** |

A second sample drawn from a full-stack UI project with UAT + E2E
gates is in flight; it shows a contrasting profile (370 calls, ~$63
spend, **31.7% savings vs Opus-only**) where UAT-driven verification
dominates routing decisions. Will land alongside this one once the
session-set-name redaction pass on its source project completes.

Two readings worth pulling out:

1. **A 73% savings figure isn't a benchmark to compete on** — it's a
   readout of *this* project's task-type mix. A project dominated by
   `documentation` and `analysis` (both tier-1/tier-2 routing) shows
   high savings; a project dominated by `session-verification` or
   UAT pipelines (tier-3 by design) shows lower savings. Both are
   the router doing its job; the savings figure is meaningful per
   project, not across projects.

2. **The auto-generated action items are the marketable bit.** The
   report doesn't just print numbers — it names task types whose
   unreliability suggests a prompt-template tightening or a tier
   bump. The manager doesn't have to hunt for "where am I bleeding
   cost or quality"; the report points at it.
