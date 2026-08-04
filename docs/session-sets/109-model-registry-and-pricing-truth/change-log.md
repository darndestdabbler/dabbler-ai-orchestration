# Change log — Set 109: model registry and pricing truth

**Outcome:** The router had been sending `model_id: gpt-5.6` — **an id OpenAI
does not list**. OpenAI served it from `gpt-5.6-sol` at $5.00/$30.00 per 1M
while `router-config.yaml` recorded $2.50/$15.00, so every cost this repo
reported for that model was exactly half the truth, for 254 calls and **$51**.
Nothing in the codebase could have noticed: no check compared a configured id
against what the provider offers, no record captured what the provider actually
served, and one global `pricing_reviewed` date made every rate look equally
fresh whether or not a human had ever looked at it.

This set makes the registry **provably** match the providers and its prices
**confirmed** rather than assumed.

**Four sessions. S1 and S2 VERIFIED; S3 closed WAIVED** on an
operator-directed close over one residual — which **Session 4 then fixed**.
**S4 is `requires_review`**: its verification loop found and remediated five
Majors, and its final round then found that the remediation of one of them
leaves a spec deliverable unmet. That is a conflict inside the spec rather than
a defect, and the close is the operator's decision — see *The cheap model* below
and `disposition.json`'s single blocker.

Router-side only: `ai_router/CHANGELOG.md` carries `[Unreleased]` entries and
the publish is operator-gated. Suite: **3466 passed, 6 skipped, 0 failed**.

## The one-line result

```
$ python -m ai_router.model_inventory --check
[ ] OK: all 15 configured model_id(s) are offered by their provider.
```

That command exited **1** for the whole of Sessions 1–3 by design — `gpt-5.6`
and `gemini-3-pro` were the live specimens it was built to fail on. Session 4
is where it first exits 0.

## What each session did

| Session | Shipped | Verdict |
| :--- | :--- | :--- |
| **1** | `model_inventory` — provider enumeration, `model-inventory.lock`, and a drift gate that fails loud on an id the provider does not offer. Metrics rows now record the **served** model id, not just the requested one. | VERIFIED |
| **2** | Proved `route()` was making a **real second, un-excluded provider call** on three code paths, and fixed all three. Established that **verification was never affected** and spend was never under-reported by it. | VERIFIED |
| **3** | A pricing schema that can express reality — **context-tiered** and **effective-dated** rates plus a per-model `confirmed_on` — and `pricing_proposal`, a scrape-to-**propose** flow where only a human's `accept` writes a rate. Deliberately changed **no** rate. | WAIVED |
| **4** | Corrected the registry through that flow, wired the drift gate, reconciled the cost record, and walked the confirmation screen. Fixed S3's residual, and withdrew its own cheap-verifier pin when verification showed it lacked the evidence the spec requires. | requires_review |

## The registry, before and after

| entry | was | is |
| :--- | :--- | :--- |
| `gpt-5-6` | `gpt-5.6` @ $2.50/$15.00 — **an id that does not exist** | **retired**, split into three |
| `gpt-5-6-sol` | — | `gpt-5.6-sol` @ **$5.00/$30.00** — the pinned verifier, unchanged in behaviour, now honest about its price |
| `gpt-5-6-luna` | — | `gpt-5.6-luna` @ **$0.20/$1.20** — the intended discovery fan-out, pin not armed (below) |
| `gpt-5-6-terra` | — | `gpt-5.6-terra` @ $2.00/$12.00 — registered, priced, disabled |
| `opus` | `claude-opus-4-8` | **`claude-opus-5`** — identical price, so a free upgrade |
| `sonnet` | `claude-sonnet-4-6` @ $3.00/$15.00 | **`claude-sonnet-5`** @ $2.00/$10.00, **$3.00/$15.00 from 2026-09-01** |
| `fable` | *absent entirely* | `claude-fable-5` @ $10.00/$50.00, registered and disabled |
| `gpt-5-5` | $2.50/$15.00 | **$5.00/$30.00** — understated 2×, a *different* cause |
| `gemini-3-1-pro` | $1.25/$10.00 (placeholder) | **$2.00/$12.00 ≤200k, $4.00/$18.00 above** |
| `gemini-pro` | $1.25/$10.00, tier unrepresentable | $1.25/$10.00 ≤200k, **$2.50/$15.00 above** |
| `gemini-3-pro` | `gemini-3-pro` — not offered | **`gemini-3-pro-preview`** |

**Every rate above was written by `pricing_proposal --apply` from the
providers' published pages. None was hand-typed.** Twelve changes accepted, two
rejected, each accepted entry stamped `confirmed_on: "2026-08-04"`.

## The money

Recomputed row by row from each row's own token counts, across the whole
1,237-row ledger:

| | reported | true | understated |
| :--- | ---: | ---: | ---: |
| whole ledger | $177.4150 | $228.5689 | **$51.1539 (28.8%)** |

`gpt-5-6` is **99.8%** of it, at a factor of exactly 2.000. **The raw ledger was
not rewritten** — a record of what was believed at the time is worth more than
one silently improved afterwards — so the correction is published instead, in
`cost_report.py`, in the JSON report, and in `s4-cost-reconciliation.md`.

Two honest notes on that figure. It is a **floor**: OpenAI states its
short/long context boundary nowhere, so a long-context row cannot be identified
from the ledger. And the spec's own estimate was **~85× too small** — it cited
one session's slice ($0.5916) where the problem was ledger-wide; Session 3
caught that while counting and Session 4 published the counted number.

`gemini-pro` is the interesting negative: its missing >200k tier was a real
schema defect, and **not one of its 366 rows ever exceeded 200k input tokens**,
so it cost nothing and is deliberately left out of the disclosure rather than
caveating 366 correct rows.

## The cheap model, and why the pin is NOT armed

Discovery verification runs K=2 calls with **identical prompts**, bought for
breadth of findings — measured pairwise overlap of Jaccard 0.13–0.31, so the
value is a second independent read. Everything it raises is adjudicated
downstream. That makes it the obvious place for a model at 1/25th the price,
and the spec named it as such.

**The mechanism ships. The pin does not.** S4 set
`verification.discovery.model: gpt-5-6-luna`, and its own verification round
caught that the spec's risk register forbids exactly that:

> Moving the fan-out to a cheaper variant may change finding quality; that is
> an empirical question, and the pin should move only with evidence, not with
> the price list.

There was no evidence — only the price list. And the little evidence this
session did produce points the other way. On the same diff:

| verifier | calls | cost | findings |
| :--- | ---: | ---: | ---: |
| `gpt-5-6-luna` (discovery) | 2 | $0.0457 | 1 Major |
| `gpt-5-6-sol` (supplementary) | 1 | $0.5203 | 3 further Majors |

Two of Sol's three were ordinary correctness bugs — a wrong exit code and a
cost disclosure that overstated — which a discovery pass ought to catch. The
framings differ (supplementary is a completeness critic by design), so this is
a data point and not an experiment. It is still not grounds for arming the pin.

The config line is committed **commented out**, above a note stating what would
arm it: both variants over several past sessions' bundles with known findings,
recall and material false negatives compared, and an acceptance threshold
written down *before* looking. The code path is shipped, tested, and inert.

**This is the set's own machinery working.** A cost-truth set talked itself
into a cost saving it had not measured, and the cross-provider round it is
required to run caught it before it shipped.

## What now fails closed that did not before

- **An id no provider offers.** `model_inventory --check`, fail-loud, no
  carve-out — and now **wired into `drift_guard.py`**, so a commit that
  reintroduces one turns CI red instead of waiting for someone to remember the
  command. It reads only local files, so it goes red on a commit and never on a
  provider's release schedule.
- **A routable entry with no rates.** Config load raises. An absent rate reads
  as $0.00 and the selection paths *rank by that number*, so such an entry does
  not merely under-report — it wins the cheapest-candidate tiebreak while
  billing an unknown amount. **This is the set's one breaking change for
  consumer repos**, with the migration recorded in `ai_router/CHANGELOG.md`.
- **A rate change with no human behind it.** `--fetch` proposes and never
  writes; `--apply` writes only what is marked `accept` and **refuses entirely**
  while any decision is still `pending`.
- **A page that cannot describe an entry.** Where the config prices by prompt
  size and the page states one rate with no boundary, the entry is *held* —
  reported side by side, never proposed, unreachable by `--apply`.
- **A rate that was never checked.** `--fetch` exits non-zero, and withholds
  its all-clear line, whenever any routable entry was held or was absent from
  its provider's page — so a cron wrapper cannot record the registry as
  verified over a hole.

## Session 3's residual, closed

S3 closed WAIVED over one Major: once an operator hand-encoded OpenAI's
long-context tier — exactly as the tool's own observation advised — the next
`--fetch` would diff its flat short-context rate against that schedule and
propose **replacing** it, silently deleting the expensive tier.

Session 4 fixed it. Such entries go to `not_comparable_entries`, and the
condition is written on the **data** (the entry prices by prompt size; the page
states one rate with no boundary) rather than on the provider name, so a page
that stops publishing bounds is covered without an edit and no per-entry
"operator-curated" flag exists to be forgotten. Six tests; **falsifier
confirmed** three fail without the guard, with the report reproducing the
defect.

The richer alternative — preserve the schedule and write the page's rate into
its lowest-bounded row — was deliberately declined: it assumes that row
corresponds to the page's unbounded rate, and a wrong write there is precisely
the plausible-wrong-number failure the refusal exists to prevent.

## The UAT item

The set's safety property is **a human confirming a price diff**, so the
confirmation screen is the thing under test. Session 4 walked it live and
treated two readability problems as defects rather than notes:

1. A purely **date-tiered** rate was labelled `(all other prompts)` — the label
   for a *size*-tiered model's unbounded row — inviting the reader to hunt for
   a boundary that does not exist.
2. The S3 residual above, which the walk is what would have triggered.

`109-model-registry-and-pricing-truth-uat-checklist.json` is four items derived
from that criterion, on a throwaway config copy so the walk is consequence-free,
with **every command executed by the orchestrator first**. Evidence:
`s4-walk-evidence.md`.

## Owed, and named rather than quietly carried

- **`route()` still does not validate a recommended model id against the
  registry.** The step-3.5 analyst returned a non-existent model id in three
  consecutive sessions — on the one call this repo makes specifically so it does
  *not* self-opine about models. S4 worked around it by enumerating the registry
  in the prompt, which is weaker than validating the response. Cheap to fix now
  that `model_inventory` knows what every provider offers.
- **`pull_verifier._pricing_for` falls back to `(0.0, 0.0)`** on a `model_id`
  absent from the registry — the same fail-open class closed here, on a cost
  *cap*. Not reachable today; deferred as out-of-plan.
- **`pull_verifier.models`' pins are a `model_id` surface the drift gate does
  not cover.** All three currently name real ids.
- **The identity-only `claude-opus-5` / `claude-sonnet-5` entries are now
  redundant** — `opus` / `sonnet` carry those ids. Kept, unpriced (their rate
  proposals were the walk's deliberate rejections), and flagged for retirement:
  deleting a registry key is a change a consumer repo could be pinned to.
- **`--apply` collapses multi-line `notes:` scalars** on its ruamel round-trip.
  The whole-file list re-indentation it *also* caused was treated as a defect
  and fixed; the scalar collapse is inherent to the round-trip design and is
  recorded rather than re-engineered.
- **Limits were not confirmed.** This session confirmed *rates* against
  published pricing pages. `max_context_tokens` / `max_output_tokens` on every
  re-pointed and new entry are carried forward unconfirmed, and each entry says
  so — loudly, rather than inheriting a superseded entry's numbers in silence.

## Release

Router-side, `[Unreleased]`. No version bump, no PyPI publish — that is
operator-gated. The extension is untouched.
