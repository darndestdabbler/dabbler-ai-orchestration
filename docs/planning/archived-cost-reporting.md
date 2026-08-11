# Archived capability — cost and pricing reporting

> **Status:** archived 2026-08-11 by operator decision, removed in Set 119
> Session 3. **Not deleted in the sense of lost** — this note exists so it
> can be revived deliberately rather than rebuilt from scratch.
>
> **Scope of the archival:** the *reporting and rate-maintenance* surface
> only. Cost **capture** is untouched: `router-metrics.jsonl` still records
> `cost_usd`, `input_tokens` and `output_tokens` on every routed call, and
> `pricing.py` still ships.

## What was archived

| module | lines | tests | what it did |
| :--- | ---: | ---: | :--- |
| `ai_router/pricing_proposal.py` | 1,398 | 110 | Fetched published provider rates, produced a reviewable proposal, and applied accepted rates to `router-config.yaml` (`--fetch` / `--apply`) |
| `ai_router/cost_report.py` | 482 | 40 | `get_costs()` / `print_cost_report()` — the rollup surface over `router-metrics.jsonl`, re-exported from `ai_router/__init__.py` |
| **total** | **1,880** | **~150** | |

## What was deliberately NOT archived

- **`ai_router/pricing.py` (344 lines)** — load-bearing. `models.py`,
  `pull_verifier.py`, `config.py` and `__init__.py` import it, and it
  feeds the api-profile verifier's `max_cost_multiplier` guard
  (`__init__.py:1632`). Removing it breaks the Direct API path.
- **`ai_router/metrics.py` (555 lines)** — the routed-call ledger. Cost is
  one field among ~30, and the ledger is the evidence base for
  cross-provider verification claims.
- **The recorded data.** Every historical `router-metrics.jsonl` row keeps
  its cost fields. **Nothing about the archive destroys history** — a
  revival can compute over the full corpus retroactively.

## Where it lives in history

The deletion lands in Set 119 Session 3. To retrieve the code without
needing a SHA recorded correctly here:

```bash
# find the commit that removed it
git log --diff-filter=D --oneline -- ai_router/pricing_proposal.py

# read the file as it last existed
git show <that-commit>^:ai_router/pricing_proposal.py
git show <that-commit>^:ai_router/cost_report.py
git show <that-commit>^:ai_router/tests/test_pricing_proposal.py
git show <that-commit>^:ai_router/tests/test_cost_report.py
```

Last commit that modified all four before removal: **`171e7107`**. Any
commit at or before it contains the full working implementation, its
tests, and its schema.

Related documentation that also predates the archive and can be recovered
the same way: the pricing schema notes, and `docs/cost-metrics-icon`
material under `docs/proposals/2026-05-29-cost-metrics-icon/`.

## Why it was archived

**Operator decision, 2026-08-11.** Recorded in the operator's words:

> *"I see that being a risk and a lot of extra code with limited value.
> Even when I had that information available to me with my other computer
> that used DIRECT_API, I rarely referenced it. Instead, I kept checking
> how much funding I had left for each of the APIs. The cost data were
> never authoritative and quickly got stale. Also, right now, my staff use
> the COPILOT_CLI, which doesn't have cost data."*

Four reasons, in the order they matter:

1. **The dominant transport cannot populate it.** Across 83 routed calls on the Copilot CLI seat, **every row** carries `billed_usage_unavailable: true`, `input_tokens: 0` and `cost_usd: 0.0`. Total recorded spend: **$0.00**. A reporting surface over structurally-empty data is worse than absent — it invites conclusions from zeros.
2. **It was not authoritative even where it worked.** Published rates drift, proposals go stale between fetches, and the operator's actual question — *how much funding is left on this account* — is answered by the provider's own dashboard, not by a local rollup.
3. **It was not used.** The operator, holding the data on a Direct API machine, checked provider balances instead.
4. **Cost per unit of value.** 1,880 lines and ~150 tests, against a framework whose stated problem is that a successor will not touch it.

## Considerations for reviving it

**Revive when at least one of these is true:**

- **Direct API becomes the dominant transport again**, or a mixed fleet needs comparable spend across seats.
- **Someone asks a question the ledger can already answer** — e.g. "which task type costs most per session," "did the doc-only cap reduce spend." Those need `metrics.py` and a query, **not** `cost_report.py`. Prefer writing the query.
- **A budget control needs to block something.** Today only `max_cost_multiplier` does, and it lives in `pricing.py`, which stayed.

**How to revive it well — do not simply restore the files:**

1. **Restore `cost_report.py` before `pricing_proposal.py`.** The report is 482 lines against 1,398, and answers the question people actually have. Rate maintenance is the expensive half and the one that goes stale.
2. **Make it degrade honestly on seats without billing.** The original reported zeros; it should report *"unavailable on this transport"* and say why. That distinction — absent versus zero — is the same one the step-ledger findings identified elsewhere in this repo.
3. **Do not re-add the re-exports to `ai_router/__init__.py`.** The archived version surfaced `get_costs` / `print_cost_report` at package level, which coupled a reporting surface to every importer. A CLI module is enough.
4. **Check whether `pricing.py` already covers it.** It survived, so rate resolution and the cost guard still exist; a revival may need only the rollup.
5. **Weigh it against the retention rule** in `docs/planning/guidance-candidates.md`: expensive machinery that never fires is dropped. A cost report that nobody opens is exactly that.

## What would make this archival wrong

If a routed-spend question becomes load-bearing for a **decision** —
choosing a model, sizing a verification budget, justifying a transport —
then a rollup over `router-metrics.jsonl` is cheap and this note is the
starting point. The judgement recorded here is that no such decision has
needed it, not that none ever could.
