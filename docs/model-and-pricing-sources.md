# Where the models and their prices come from

> **Read this before saying anything about which models are available or what
> they cost.** Three AI engines have now re-derived these facts from stale
> vocabulary in this repository and got them wrong — twice in one
> conversation on 2026-09-10. Everything below is measured, dated, and names
> the command that re-measures it.

## The one-line answer

**Every model list here is free to obtain.** No prompt, no tokens, no
credits, on any of the three surfaces. If you are reasoning about the cost of
*finding out what models exist*, you have taken a wrong turn.

| surface | how to enumerate | cost | measured |
| --- | --- | --- | --- |
| Direct API (Anthropic, OpenAI, Google) | `dabbler discovery enumerate` | **free** — 2.4 s, 195 models | 2026-09-10 |
| GitHub Copilot seat | `session/new` over `copilot --acp` returns `models.availableModels` | **free** | 2026-09-05, CLI 1.0.83 |
| Claude Code CLI | **cannot be enumerated** — see below | — | 2026-09-10 |

## Copilot is billed in AI CREDITS, per token

`copilot help billing`, in the CLI's own words:

> Usage is measured in **AI credits**. If you're on the **legacy billing
> platform**, you may see premium requests instead.

**Premium requests are the legacy platform.** GitHub has billed this seat per
token since 2026-06-01 (recorded in `STATUS.md` under session 96). A person
sees it in the footer, in `/usage` (credits plus an input/output/cached token
breakdown), in `/statusline quota`, and in the `/model` picker, which shows
"per-token costs (input, cached input, and output)".

**This repository already measures it correctly.**
`packages/router/src/seatCost.ts` reads the CLI's own session store:

    SUM(assistant_usage_events.total_nano_aiu) / 1e9 = AI credits
    credits / 100 = US dollars

`dabbler seat-cost` is the verb. **D29** measured one code session at roughly
**$22 in AI credits** before verification.

### The stale half, and why it keeps misleading engines

`copilot-catalog.lock` carries `premium_request_weight` and
`probe_premium_requests`, and `dabbler copilot refresh --dry-run` prints
"projected cost: N premium request(s)". **That vocabulary is the legacy
platform**, and it is the trap: an engine reads it, reasons in premium
requests, and concludes that finding out what models exist is expensive.

It is also **measurably wrong**. The catalog samples cost by making a billed
call; the seat states its own multipliers for free. They disagree:

| model | catalog sample | seat says |
| --- | --- | --- |
| `gpt-5.4` | 0 | 1x |
| `claude-fable-5` | 1 | 15x |

Session 97 recorded that disagreement on 2026-09-05. On 2026-09-10 a probe of
`gpt-5.4` moved its recorded sample from 0 to 1 — the same finding, bought a
second time with a billed call that established nothing new.

**Never quote a cost from the catalog's samples.** Read the seat's own
statement, or read what was actually spent from `seatCost.ts`.

## The Copilot seat's model list, free

**Measured route, 2026-09-05, CLI 1.0.83** — `docs/acp-walkthrough.md` §1 has
the full transcript and the whole table:

`session/new` over `copilot --acp` answers with more than a session id. Its
reply carries **`models.availableModels`** — every model the seat can
dispatch — each with a `_meta.copilotUsage` multiplier, plus
`currentModelId`, the available `modes` (agent, plan, autopilot) and
`configOptions` (mode, model, reasoning effort, permissions).

It listed models the maintained catalog has never heard of: `gpt-6-astra`,
`grok-4.5`, `grok-4.6`, `kimi-k3`, `kimi-k2.7-code`, `mai-code-1.1-flash`.

**Newer route, not yet exercised here.** The Copilot SDK shipped inside the
VS Code install (`@github/copilot-*/copilot-sdk/`) declares
`client.listModels(): Promise<ModelInfo[]>` and the RPC
`models.list(...) => ModelList`. `ModelInfo` carries `id`, `name`,
`capabilities`, `policy`, `supportedReasoningEfforts` and **`billing`** —
where `ModelBilling` has `multiplier?` (legacy) *and* **`tokenPrices?`**
(input, cached input, output, with a long-context variant). That is the
current-platform answer and is worth preferring once it is measured.

**The catalog's own note is out of date.** It says "The CLI has no
list-models command, so this is a maintained list, not an enumeration."
There is no `copilot models` subcommand, which is true and irrelevant: the
list arrives over the protocol, not as a subcommand.

## The direct-API list, free

`dabbler discovery enumerate` reads each enabled vendor's models endpoint —
a metadata request that bills no tokens. Measured 2026-09-10: **2.4 seconds,
195 models** (Anthropic 11, OpenAI 129, Google 55), written to the dated
record `.dabbler/api-models.lock`.

`dabbler discovery status` reports the record's age against the declared
`discovery.max_age_hours` (24). `dabbler discovery drift` reports what the
roles name that the record does not have, and what the record has that no
role names.

## The Claude Code CLI cannot be enumerated

`claude --help` has no models command; `--model` takes an alias (`opus`,
`sonnet`, `fable`) or a full model name. **Its reachable set is the Anthropic
key's API enumeration**, which `discovery enumerate` already collects. Do not
maintain a third list.

## What the prompting probe is still for

`dabbler copilot refresh` sends a real prompt to each named model. That is
the only way to establish that a model **actually answers on this seat** —
entitlement, not existence. Keep it for confirmation, never for enumeration,
and never in an automatic path.

## Re-measuring

- Direct API: `dabbler discovery enumerate` (free, seconds)
- Seat list and multipliers: `dabbler agent prompt --engine copilot` and read
  the `open` line's `session` payload, or the SDK's `models.list`
- Seat spend: `dabbler seat-cost`
- Billing model: `copilot help billing`

Re-measure when a vendor or a CLI version moves, and **update this page with
the date and the CLI version**, rather than writing the answer somewhere new.
