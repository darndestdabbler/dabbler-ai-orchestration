<!-- routed: task_type=architecture, exclude_providers=['anthropic'] (the
     orchestrator's own provider, so the advice cannot be self-interested);
     served by gpt-5.5 (openai), router's own verify pass
     gemini-3.1-pro-preview -> VERIFIED, 0 issues. Provenance read from
     ai_router/router-metrics.jsonl.

     TWO ROUNDS, and the first one is not preserved because it was invalid
     on its face: the prompt I sent it named `gpt-5.6-sol` as a selectable
     orchestrator model and offered a reason-code vocabulary
     (`switch-for-independence`) that this repo does not have. It duly
     recommended a model `start_session --model` would refuse under a code
     `validate_next_orchestrator` would reject. Rather than translate its
     answer myself -- which is exactly the self-opining the rule forbids --
     the prompt was corrected to carry the real model registry and the four
     real reason codes, and the call was re-run. This file is that second
     round, verbatim.

     Recorded into disposition.json with only mechanical normalisation:
     `engine` "GitHub Copilot CLI" -> the `github-copilot` token the
     lifecycle CLIs take, and `code`/`specifics` moved under the schema's
     `reason` object. -->

### Next orchestrator

```json
{
  "engine": "GitHub Copilot CLI",
  "provider": "anthropic",
  "model": "claude-opus-5",
  "effort": "high",
  "code": "continue-current-trajectory",
  "specifics": "Keep the current orchestrator for continuity through the set-terminal policy session and do not make a cost-driven downgrade; this repo's measured lever is compaction, not model substitution. Preserve adjudication independence by using OpenAI and Gemini for the causal-design panel and cross-provider verification, so the Anthropic orchestrator is not judging its own provider's critique. Session 3 is mostly canonical workflow/policy writing plus careful causal framing, where continuity from Session 2's corrected measurement and tail restatement matters more than changing models."
}
```

### Next session set

Author a **compaction-and-session-budget enforcement set** that turns Session 3's policy decisions into durable mechanics: implement the token-threshold compaction trigger tied to declared N, expose the education-mode brief/operator decision path, add admission/close-out checks that detect drift between authored N, observed token growth, and compaction firing, and document the operator-facing workflow. This beats further analysis sets because Session 2 already found the duration tail is mostly calendar-idle contamination, while Session 3 will settle the causal and policy questions; the next highest-value work is making those decisions enforceable in tooling.