# Session 3 — what the live proposal run found

> **What this is.** The first end-to-end run of
> `python -m ai_router.pricing_proposal --fetch` against the three live
> pricing pages, on **2026-08-04**. It is evidence, not a decision: no rate in
> `router-config.yaml` was changed by this session. Session 4 walks the
> confirmation flow and applies what it accepts.

## The run

```
python -m ai_router.pricing_proposal --fetch      # exit 1 (changes proposed)
```

Five changes proposed, two configured entries not on their provider's page,
and 37 published models no registry entry claims. Verbatim output below,
followed by what each item means.

```
[~] claude-opus-5 (anthropic / claude-opus-5)
    currently recorded:
      (no rates declared)
    the page says:
      in $5.0 / out $25.0 per 1M
[~] claude-sonnet-5 (anthropic / claude-sonnet-5)
    currently recorded:
      (no rates declared)
    the page says:
      in $2.0 / out $10.0 per 1M  (all other prompts)
      in $3.0 / out $15.0 per 1M  (from 2026-09-01, all other prompts)
[~] gemini-3-1-pro (google / gemini-3.1-pro-preview)
    currently recorded:
      in $1.25 / out $10.0 per 1M
    the page says:
      in $2.0 / out $12.0 per 1M  (prompts <= 200,000)
      in $4.0 / out $18.0 per 1M  (all other prompts)
[~] gemini-pro (google / gemini-2.5-pro)
    currently recorded:
      in $1.25 / out $10.0 per 1M
    the page says:
      in $1.25 / out $10.0 per 1M  (prompts <= 200,000)
      in $2.5 / out $15.0 per 1M  (all other prompts)
[~] gpt-5-5 (openai / gpt-5.5)
    currently recorded:
      in $2.5 / out $15.0 per 1M
    the page says:
      in $5.0 / out $30.0 per 1M
    also on the page, NOT proposed -- Long context: in $10.0 / out $45.0 per 1M

[x] NOT ON THE PAGE: gemini-3-pro (model_id 'gemini-3-pro')
[x] NOT ON THE PAGE: gpt-5-6 (model_id 'gpt-5.6')

[ ] anthropic also publishes 11 model(s) no registry entry claims: Claude Fable 5, ...
[ ] google also publishes 20 model(s) no registry entry claims: ...
[ ] openai also publishes 6 model(s) no registry entry claims: gpt-5.4-nano,
    gpt-5.4-pro, gpt-5.5-pro, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra
```

## The finding the spec did not know about

**`gpt-5-5` is understated by exactly 2×, the same as `gpt-5-6`.** The registry
records `$2.50/$15.00`; OpenAI publishes `$5.00/$30.00`.

The spec's evidence table names one 2× understatement — `gpt-5-6`, caused by
the bare `gpt-5.6` alias resolving to `-sol`. This is a *different* entry with
a *different* cause: `gpt-5.5` is a real id that OpenAI does list, so Session
1's drift gate passes it. Its rates were simply copied from `gpt-5.4` when the
entry was added, and its own registry note says so in as many words —
*"PLACEHOLDER pricing/limits mirror gpt-5.4 — confirm against OpenAI's
published GPT-5.5 rates before trusting cost reports."* Nobody ever did.

**The spend impact is negligible, and that is luck rather than design.**
`gpt-5-5` was promoted to verifier and briefly pinned as the
`session-verification` verifier (the Set 090 follow-up, before the pin moved
on to `gpt-5-6`), so it *could* have carried every verification round at twice
its reported cost. Counting the ledger says it did not: `router-metrics.jsonl`
holds **one** `gpt-5-5` row, $0.0003 reported, ~$0.0006 true. The pin moved
before the model saw real use.

What the count does not excuse is the state of the entry. A model wired into
the verifier pool with a self-declared placeholder rate is one operator
decision away from carrying every verification round, and nothing in the repo
would have reported the error if it had.

Two entries, two independent causes, one shared shape: a placeholder that
nobody could see was a placeholder. That is the argument for `confirmed_on`
being per-model rather than one global date — a global date would have looked
equally fresh for both.

**Owed to Session 4:** correct `gpt-5-5` through the confirmation flow, and
mention it in the cost reconciliation (spec S4 step 4) with its true
magnitude — one call, sub-cent — so the disclosure is not read as a second
material understatement.

### While counting: the `gpt-5-6` reconciliation is far larger than the spec's figure

The spec's S4 step 4 cites Set 108 S4's slice — "$0.5916 reported, ~$1.18
true". Across the **whole** ledger, `gpt-5-6` has **245 rows totalling $48.95
reported**, so the true figure is **~$97.90** and the repo's lifetime routed
spend is understated by roughly **$49**. S4 should publish the ledger-wide
number, not only the one session's.

| model | rows | reported | true (2×) |
| :--- | ---: | ---: | ---: |
| `gpt-5-6` | 245 | $48.95 | ~$97.90 |
| `gpt-5-5` | 1 | $0.0003 | ~$0.0006 |
| `gpt-5-4` | 466 | $95.46 | $95.46 (rate confirmed correct) |

## The other four, in brief

| entry | what it means |
| :--- | :--- |
| `gemini-pro` | The ≤200k rate is right; the >200k tier was never representable. Exactly the defect the spec predicted, now expressible. |
| `gemini-3-1-pro` | Another self-declared placeholder (`PLACEHOLDER pricing/limits mirror gemini-2.5-pro`). Understated 1.6× on input at the cheap tier, and missing the tier split entirely. |
| `claude-opus-5`, `claude-sonnet-5` | Identity-only entries, so nothing routes to them and no cost was ever misreported. They surface because S4 re-points `opus` → Opus 5 and `sonnet` → Sonnet 5, and the confirmed rates are what those aliases will need. Sonnet 5's proposal already carries both dated rows. |

## The two entries not on their page

`gpt-5.6` and `gemini-3-pro` — the same two Session 1's `model_inventory
--check` fails on, reached independently through a different mechanism. The
tool reports them as **not checked** rather than passing over them, because a
run that silently skipped an entry would report success while a rate went
unexamined.

## What was read, and what was refused

**Not proposed, deliberately: OpenAI's long-context rates.** The page prints
them for every model (`gpt-5.4`: `$5.00/$22.50`, exactly the 2× input /
1.5× output the registry describes in prose) but never states where the
boundary falls — the "272K" figure appears only in a separate embedded payload
and is per-model. The tool reports the pair as an observation and refuses to
write a tier, because manufacturing that boundary would be inventing the one
number the page does not state. To adopt it, a human adds an explicit
`max_input_tokens`.

**Not read at all:** cached-input and cache-write columns, Anthropic's 5m/1h
cache columns, Google's Batch / Flex / Priority sections, free tiers, storage
and grounding rows. The router bills none of them. On Google the exclusion is
load-bearing rather than tidy: Batch is exactly half Standard, so a parser
that wandered one section over would understate by 2× — the same magnitude and
shape as the defect this set exists to end. A test pins it.

## Why no rate was changed this session

This set's own rule is that a human confirms every rate change, always. The
flow that makes that possible did not exist until this session built it, so
hand-editing five rates here would have meant breaking the rule in the act of
implementing it. The rates below are wrong, visibly and on the record, until
Session 4 walks the flow.
