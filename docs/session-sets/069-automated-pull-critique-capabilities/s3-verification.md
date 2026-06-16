## Verdict
**FAIL**

## Findings

1. **Issue** → The template lane ignores its own standardized exit semantics when minting evidence. Any clean `run_probe_template` cage run is captured, so a model can get **REPRODUCED** stamped from a template run that was actually **robust** (`exit 0`) or a **probe-internal error** (`exit 2`), as long as the replay hash matches. That is a false-REPRODUCED path for template findings.
   **Location** → `ai_router/probe_templates.py:474-480`, `ai_router/pull_verifier.py:860-887`, `ai_router/pull_verifier.py:1289-1313`
   **Fix** → Gate template evidence on `exit_code == PROBE_REPRODUCED_EXIT` (`1`). Do not return/capture a replayable `ProbeRun` for template exits `0` or `2`, and/or make `_stamp_evidence_tiers` collapse template findings to `ASSERTED` unless the matched template execution exited `1`. Mark template `exit 2` as an error tool result as well.

2. **Issue** → `commandId` and `templateId` are matched through one untyped string map (`match_id`). If both lanes are active and a run-test command id collides with a template id, a template finding can bind to the wrong execution and still validate as **REPRODUCED**. The same untyped matching also lets a finding with both ids present resolve via the wrong lane.
   **Location** → `ai_router/pull_verifier.py:683-690`, `ai_router/pull_verifier.py:1289-1307`
   **Fix** → Key executions by lane and id, not bare string. Resolve `commandId` only against command executions and `templateId` only against template executions. If both ids are present, or resolution is ambiguous, collapse to `ASSERTED` instead of picking one.

3. **Issue** → The new tests miss both load-bearing negative cases above, so the suite does not actually exercise the template-lane false-REPRODUCED collapse behavior this session depends on.
   **Location** → `ai_router/tests/test_pull_verifier.py:2350-2445`, `ai_router/tests/test_probe_templates.py:219-278`
   **Fix** → Add end-to-end tests that assert:  
   - a template run with `exit 0` collapses a proposed `REPRODUCED` finding to `ASSERTED`;  
   - a template run with `exit 2` also collapses to `ASSERTED`;  
   - with both lanes active, a `templateId` cannot match a `commandId` collision.