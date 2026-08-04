# The cost record, reconciled

> **What this is.** Every routed call this repo has ever made was priced from
> `router-config.yaml`, and four of its rates were wrong. This publishes what
> the ledger *should* say. It does **not** change what the ledger *does* say:
> `ai_router/router-metrics.jsonl` is a record of what was believed at the
> time, and a ledger quietly improved after the fact is worth less than one
> that is wrong and says so.
>
> **Measured 2026-08-04**, against the full ledger as of Session 4 (1,237
> rows). Rates are the ones confirmed the same day from the providers'
> published pages through `pricing_proposal --fetch`.

## The headline

| | reported | true | understated by |
| :--- | ---: | ---: | ---: |
| **Whole ledger, all models** | **$177.4150** | **$228.5689** | **$51.1539 (28.8%)** |

Roughly fifty dollars of routed spend happened and was never reported. Nothing
was overcharged and no invoice is wrong — the providers billed correctly
throughout. What was wrong is this repo's own accounting of it.

## Per model

Recomputed **row by row** from each row's own `input_tokens` /
`output_tokens`, not by applying one blanket multiplier to a total. The
`factor` column is therefore an outcome of the arithmetic rather than an
input to it.

| model | rows | reported | true | delta | factor |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `gpt-5-6` | 254 | $51.0383 | $102.0766 | **+$51.0383** | 2.000 |
| `gemini-3-1-pro` | 7 | $0.2295 | $0.3448 | +$0.1153 | 1.503 |
| `gpt-5-5` | 1 | $0.0003 | $0.0006 | +$0.0003 | 2.003 |
| `gemini-pro` | 366 | $7.9891 | $7.9891 | **$0.0000** | 1.000 |
| *all other models* | 609 | $118.1578 | $118.1578 | $0.0000 | 1.000 |

### `gpt-5-6` — the whole story, and effectively all of the money

The registry sent `model_id: gpt-5.6`. **OpenAI does not list that id.** It
resolved it to `gpt-5.6-sol` and billed $5.00/$30.00 per 1M while this file
recorded $2.50/$15.00. The factor is exactly 2.000 because both published
rates are exactly double what was recorded, on both sides of the call.

254 rows, `$51.0383` reported, `~$102.0766` true. That single entry is
**99.8% of the entire understatement**.

The spec cited a smaller figure — Set 108 S4's one-session slice, "$0.5916
reported, ~$1.18 true". That was correct for that session and wrong as a
characterisation of the problem, which is ledger-wide and roughly eighty-five
times larger. Session 3 caught the discrepancy while counting rows; this
session publishes the counted number.

### `gpt-5-5` — the same magnitude, a different cause, no money

Also understated 2×, but for an unrelated reason: `gpt-5.5` **is** a real
OpenAI id, so Session 1's drift gate passes it. Its rates were copied from
`gpt-5.4` when the entry was added, and its own registry note said so —
*"PLACEHOLDER pricing/limits mirror gpt-5.4"* — for as long as it existed.
Nobody ever confirmed it.

The ledger holds **one** `gpt-5-5` row, so the impact is three hundredths of a
cent. That is luck and not design: the entry was briefly pinned as the
`session-verification` verifier, and had the pin not moved on to `gpt-5-6`
before it saw real use, it would have carried every verification round in the
repo at twice its reported cost, silently.

### `gemini-3-1-pro` — a placeholder that self-identified

`PLACEHOLDER pricing/limits mirror gemini-2.5-pro`, in the entry, in writing.
Google publishes $2.00/$12.00 at ≤200k and $4.00/$18.00 above. Seven rows,
twelve cents.

### `gemini-pro` — mispriced in shape, and it cost nothing

This is the one the spec predicted most confidently and the one that turned
out to owe nothing. Gemini 2.5 Pro bills $1.25/$10.00 at ≤200k and
$2.50/$15.00 above, and the old two-scalar schema could record only the cheap
tier — a real defect, now fixed by the `pricing:` list.

But **not one of the 366 `gemini-pro` rows has more than 200,000 input
tokens**, so the tier that could not be represented was never reached. The
correction is $0.0000, and `gemini-pro` is deliberately **absent** from the
disclosure the cost report prints: caveating 366 correct rows would teach an
operator to scroll past the notice that matters.

## Where this is disclosed

Three places, so it is hard to miss and hard to over-apply:

1. **`ai_router/cost_report.py`** — `HISTORICAL_RATE_CORRECTIONS` carries the
   date, factor, and reason per model, and `print_cost_report` prints a
   `[!] HISTORICAL RATE CORRECTION` block naming only the affected models
   *present in that report*. A report containing none of them carries no
   caveat.
2. **The JSON report** — the same lines under `historical_rate_corrections`,
   so a programmatic consumer cannot read a total as clean.
3. **This file**, linked from both.

Each correction records `corrected_on: 2026-08-04`. A row written after that
date is priced from the confirmed registry and needs no adjustment; the factor
applies only to rows before it. That boundary is what stops a correction from
being applied twice.

## Reproducing it

The recomputation is deliberately not a committed script — it reads a ledger
that grows every session, so a stored result would be stale by the next one.

```python
import json, pathlib, collections

def true_cost(model, tin, tout):
    if model in ("gpt-5-6", "gpt-5-5"):        # short-context rates
        return tin/1e6*5.00 + tout/1e6*30.00
    if model == "gemini-3-1-pro":
        return (tin/1e6*2.00 + tout/1e6*12.00) if tin <= 200_000 \
          else (tin/1e6*4.00 + tout/1e6*18.00)
    if model == "gemini-pro":
        return (tin/1e6*1.25 + tout/1e6*10.00) if tin <= 200_000 \
          else (tin/1e6*2.50 + tout/1e6*15.00)
    return None

agg = collections.defaultdict(lambda: {"n": 0, "rep": 0.0, "true": 0.0})
for line in pathlib.Path(
    "ai_router/router-metrics.jsonl"
).read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    r = json.loads(line)
    t = true_cost(r.get("model"), r.get("input_tokens") or 0,
                  r.get("output_tokens") or 0)
    if t is None:
        continue
    a = agg[r["model"]]
    a["n"] += 1
    a["rep"] += float(r.get("cost_usd") or 0.0)
    a["true"] += t
```

Two caveats on the arithmetic, both stated rather than buried:

- **OpenAI short-context rates are used throughout.** OpenAI publishes a
  long-context rate for every model and states the prompt-size boundary
  nowhere on the page, so a long-context row cannot be identified from the
  ledger. If any `gpt-5-6` call crossed that boundary its true cost is
  *higher* than shown here, which makes $51.15 a floor rather than an
  estimate.
- **Rows with `model` recorded as a wire id** (`gpt-5.4`, `gpt-5.5`,
  `claude-sonnet-4.6`) or as `?` total $0.0000 across 23 rows and are left
  alone. They predate Set 109 S1's served-model recording and carry no
  cost worth correcting.

## What stops it happening again

Not this document. Four executable things, all shipped by this set:

- `model_inventory --check` fails loud on any `model_id` its provider does not
  offer — the check that would have caught `gpt-5.6` on day one. It **passes**
  as of this session, for the first time.
- `pricing_proposal --fetch` diffs every rate against the published page and
  proposes; only a human's `accept` writes one.
- A per-model `confirmed_on` stamp, so "reviewed" is a fact about *an entry*
  rather than about the file. A single global date is exactly what let two
  independent placeholders look equally fresh for months.
- A routable entry with no declared rates now fails config load, because an
  absent rate reads as $0.00 — and selection ranks by that number, so a
  rate-less entry does not merely under-report, it wins the cheapest-candidate
  tiebreak.
