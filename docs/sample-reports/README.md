# Sample reports

Real `python -m ai_router.report` outputs captured against real
reference projects, not mocked-up examples. Each is a faithful copy
of the markdown the report tool produces against that project's
`router-metrics.jsonl`.

The two samples are deliberately contrasting in shape so a reader can
calibrate "what does this look like at scale" against more than one
project profile.

| Sample | Shape | Calls | Spend | Savings vs Opus baseline |
|---|---|---:|---:|---:|
| [`cli-library-shape-example.md`](cli-library-shape-example.md) | CLI / library / parser project (~20 session sets, no UAT, no E2E) | 990 | $63.48 | **73.1%** |
| [`fullstack-ui-shape-example.md`](fullstack-ui-shape-example.md) | Full-stack UI app (~20 session sets, `requiresUAT: true`, `requiresE2E: true`) | 370 | $63.14 | **31.7%** |

Two readings worth pulling out:

1. **The two projects spent almost the same amount** ($63.48 vs $63.14)
   despite the CLI project running 2.7× the routed calls. The
   difference is task-type mix: the UI project's UAT pipeline routes
   more verification + uat-coverage-review calls (which run on Opus /
   Sonnet) versus the CLI project's documentation + analysis calls
   (which run on Gemini Pro / Flash). The router doing its job, not
   a tooling difference.

2. **The savings spread (73% vs 32%)** is the other side of the same
   story. The CLI project's task mix is dominated by tier-1/tier-2
   work; the UI project's is dominated by tier-3 verification. The
   savings figure is *meaningful per project*, not a benchmark to
   compete on.

3. **The auto-generated action items are the marketable bit.** Both
   reports don't just print numbers — they name task types whose
   unreliability suggests a prompt-template tightening or a tier
   bump. The manager doesn't have to hunt for "where am I bleeding
   cost or quality"; the report points at it.
