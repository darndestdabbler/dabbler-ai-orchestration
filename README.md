# dabbler-ai-router (v2)

Multi-provider model routing for AI-led coding sessions: complexity-based
model selection, cost accounting, escalation, and an append-only metrics
ledger, over two transports — direct provider APIs (Anthropic, OpenAI,
Google) and the GitHub Copilot CLI.

Session lifecycle, verification, and the VS Code Work Explorer arrive in
later sessions of the rebuild; see `STATUS.md` for current state.

```python
from ai_router import route

result = route("Review this diff for correctness bugs", task_type="code-review")
print(result.model_name, result.cost_usd)
```
