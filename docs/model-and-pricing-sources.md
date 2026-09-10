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

**Session 148 made the code read it that way too.** `dabbler copilot refresh`
projects and orders from the seat's stated multiplier wherever the catalog
has one, and falls back to a recorded sample only where the seat has said
nothing; `probe_premium_requests` stays on disk as provenance and is no
longer what a projection reads. The dry run states the rule it applied; it
does not annotate each model with which of the two that figure came from.

## A model the seat lists is selectable without a probe

**Measured 2026-09-10, GitHub Copilot CLI 1.0.83.** The seat's free
enumeration carries `_meta.copilotEnablement` for every model it lists — 21
of the 22 entries answered `"enabled"`, the exception being `auto`, the
seat's own router alias, which states neither an enablement nor a usage and
is not a model.

Until session 148 that answer was parsed and then discarded:
`adoptSeatEnumeration` wrote `unconfirmed` over it, and selection offered a
role nothing but `confirmed` entries, so a model the seat began serving this
morning stayed invisible until somebody spent a billed turn per model to
re-establish what the seat had already said. That is how `claude-opus-5` and
`claude-sonnet-5` came to be missing from an operator's Configuration pane on
the day their seat began listing them.

The catalog now carries three enablement states, and they are not the same
evidence:

| state | what it means | what it cost |
| --- | --- | --- |
| `confirmed` | a real turn was taken and the model answered | one billed turn |
| `listed` | the seat states it can dispatch this model | free |
| `unconfirmed` | neither a probe nor an enumeration has said | — |

Selection accepts `confirmed` and `listed`. The probe scopes (`--quorum`,
`--stale`) still read `confirmed` alone, because re-probing is for what a
probe has already answered for, and an enumeration never lowers a
`confirmed` entry: a free reading must not be able to undo a turn that
happened.

**What the probe is still for is fidelity** — whether the model that answered
is the model that was asked for, which is `echoed_model` and is the subject
of `docs/model-fidelity.md`. That question is a property of the vendor's
routing and the CLI version rather than of one seat, so it is answered once
and shared through the committed lockfile, not re-bought per developer.

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

### Re-measured from the router, 2026-09-10, CLI 1.0.83

`enumerateSeatModels` in `packages/router/src/transports/copilot.ts` is the
reading: it opens an ACP conversation, takes `models.availableModels` from the
`session/new` reply, and closes without ever calling `session/prompt`. Run
against this seat on **2026-09-10**, on **GitHub Copilot CLI 1.0.83**, it
returned **28 entries in 3 seconds and billed nothing**.

- **27 models plus `auto`**, the seat's own router alias, which carries no
  `_meta` and no provider — named because the seat names it, and never
  dispatched to by this framework, because "let Copilot pick" is the one
  answer a framework that has to know which model answered cannot use.
- **The same 27 ids as 2026-09-05**, with the same multipliers. Five days on,
  the free list needed no correction.
- **Two `_meta` fields the earlier transcript does not record**:
  `copilotEnablement` (`enabled` on all 27 — the seat's own statement of what
  it may dispatch) and `copilotPriceCategory` (`low` … `very_high`).
- `currentModelId` was **`gpt-5.6-sol`** with nothing on the argv, so the
  reply also says what the seat would have used if asked for no model.
- `modes`: agent, plan, autopilot. `configOptions`: mode, model,
  `reasoning_effort` (none, low, medium, high, xhigh, max), `allow_all`.

**What the maintained catalog knew, measured the same day.**
`copilot-catalog.lock` held **18 entries, 15 confirmed** — and:

| | |
| --- | --- |
| models the seat lists that the catalog has never heard of | **16** |
| models the catalog carries that the seat no longer lists | **7** (`claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5`, `gpt-5.2-codex`, `gpt-5.2`) |
| entries whose sampled cost disagrees with the seat's own statement | **5** — `gpt-5.4` 0 vs 1x, `gpt-5.3-codex` 0 vs 1x, `gpt-5.4-mini` 0 vs 0.33x, `claude-fable-5` 1 vs 15x, `claude-opus-4.7` unknown vs 7.5x |

A maintained array cannot keep up with a list the vendor publishes for free,
and the probe that samples cost is both expensive and wrong. That is the whole
case for reading the list instead of maintaining one.

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
- Seat list and multipliers: `enumerateSeatModels` (free — it opens a
  conversation and sends no prompt), or the SDK's `models.list`. **Not
  `dabbler agent prompt`**, which takes a real turn and bills for it
- Seat spend: `dabbler seat-cost`
- Billing model: `copilot help billing`

Re-measure when a vendor or a CLI version moves, and **update this page with
the date and the CLI version**, rather than writing the answer somewhere new.
