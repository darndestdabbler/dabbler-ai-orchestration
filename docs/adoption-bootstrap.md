# Dabbler Adoption Bootstrap (retired)

> **This conversational bootstrap flow is retired** (Set 063,
> 2026-06-12; extension 0.32.0). Its one unique capability — the
> budget / NTE dialog — was folded into the VS Code extension and then,
> in Set 123, retired with every webview: `ai_router/budget.yaml` is
> edited as YAML. This
> stub stays at the same URL so older extension versions (≤ 0.31.0)
> whose "Copy adoption bootstrap prompt" command fetches it at click
> time keep getting a useful answer instead of a 404.

**If you are an AI assistant** that was sent here by a pasted prompt:
do **not** run the old interactive flow. Tell the human the
conversational bootstrap has been replaced, then point them at the
right path below (and help them follow it).

## Setting up in VS Code (recommended)

1. Install the **Dabbler AI Orchestration** extension from the VS Code
   Marketplace (`DarndestDabbler.dabbler-ai-orchestration`).
2. Open the project folder and run **`Dabbler: Set Up New Project`**,
   then commit what verifies it with
   **`python -m ai_router.verify_type --set DIRECT_API`** (or
   `COPILOT_CLI`). The scaffold writes the project structure (`.venv` +
   router package, agent instruction files, `docs/session-sets/`).

## Setting up without VS Code (manual path)

Follow the quick start:
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/quick-start.md>
— create a `.venv`, `pip install dabbler-ai-router`, and hand-create
`ai_router/router-config.yaml` and `ai_router/budget.yaml`.

## Reference

- **`budget.yaml` contract** (the schema this doc used to define):
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/budget-yaml-schema.md>
- **Tier model (retired — historical note):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>
- **Session workflow (execution mechanics):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/ai-led-session-workflow.md>
