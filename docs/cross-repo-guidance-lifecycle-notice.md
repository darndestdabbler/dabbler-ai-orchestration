# Cross-repo notice — Guidance lifecycle and pruning

**Authored**: 2026-06-14
**Audience**: The `dabbler-access-harvester` and `dabbler-platform` repositories, and any future consumer repository whose guidance files grow over budget.

## What changed (one-paragraph summary)

Set 064 introduces a guidance lifecycle model to manage the size and token cost of always-loaded guidance files like `lessons-learned.md`. The new steady-state mechanism includes per-lesson metadata, usage tracking via `cite_lessons`, and an active/archive split (`lessons-archive.md`) to prevent unbounded growth. For repositories that are already over budget, a one-time, operator-reviewed backlog remediation recipe is provided to triage existing lessons into a manageable state. The canonical references live in the orchestration repo: the lifecycle model in [`docs/guidance-lifecycle.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-lifecycle.md), and the one-time recipe in [`docs/guidance-backlog-remediation.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-backlog-remediation.md). The guidance CLIs ship in the pip-installed `dabbler-ai-router` package.

## Ships in

-   `dabbler-ai-router` 0.19.0
-   `DarndestDabbler.dabbler-ai-orchestration` VS Code extension 0.33.0

## Action for over-budget repos

Repositories with over-budget guidance files must run the one-time remediation recipe. This is an operator-led process; no automated edits will be made to your files.

1.  Upgrade your repository's dependency pin to `dabbler-ai-router>=0.19.0` to access the new guidance lifecycle CLIs.

2.  Read the [guidance lifecycle doc](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-lifecycle.md) to understand the new steady-state model for managing guidance files going forward.

3.  Execute the one-time backlog remediation detailed in the [backlog-remediation recipe](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-backlog-remediation.md). The high-level workflow is:
    -   Measure current costs with `python -m ai_router.guidance_report`.
    -   Generate a remediation PROPOSAL with `python -m ai_router.guidance_triage`.
    -   Manually review the proposal and apply the recommended `keep-active`, `archive`, `merge`, `promote`, and `drop` actions to your guidance files.
    -   Seed the `last-used-set` metadata for kept lessons.
    -   Re-measure to confirm the file is within budget.

4.  Adopt the steady-state mechanisms for all new lessons: add metadata trailers and use `disposition.lessons_cited` in task dispositions to track usage.

## Adoption status (2026-06-14)

| Repo                       | Over-budget?      | Recipe run (operator) | Router pin >=0.19.0 |
| -------------------------- | ----------------- | --------------------- | ------------------- |
| `dabbler-access-harvester` | yes, ~3.9x        | pending               | pending             |
| `dabbler-platform`         | yes, comparable   | pending               | pending             |
