# Walking the confirmation flow

> **What this is.** The spec's Session 4 step 5: run the scraper against the
> live pages, read the proposed diff as an operator would, accept and reject at
> least one change each, and confirm the stamps. *A confusing diff is a
> defect* — so this records not only what the flow did but what it read like,
> and the two things that were changed because they read badly.
>
> **Walked 2026-08-04** against the three live pricing pages, on the registry
> as this session had just restructured it (aliases re-pointed, the 5.6 family
> split, Fable 5 added). Every rate in `router-config.yaml` was written by
> `--apply`. **No rate in this set was hand-typed**, which was the point.

## What was walked

```
python -m ai_router.pricing_proposal --fetch      # exit 1, 14 items to review
# ...edit pricing-proposal.json, set accept / reject on each...
python -m ai_router.pricing_proposal --apply      # exit 0, 12 written
python -m ai_router.pricing_proposal --fetch      # exit 1, the 2 rejects only
```

14 items: **10 rate changes and 4 confirmations**. 12 accepted, 2 rejected.

## The decisions, and why

### Accepted (12)

| entry | what changed | why accept |
| :--- | :--- | :--- |
| `sonnet` | $3.00/$15.00 → **$2.00/$10.00**, and **$3.00/$15.00 from 2026-09-01** | The re-point's whole argument. Sonnet 5 is newer *and* currently cheaper than the 4.6 this alias used to serve; the dated row means the 2026-08-31 lapse needs no future edit. |
| `opus` | unchanged $5.00/$25.00 — a **confirmation** | Opus 5 bills exactly what 4.8 billed, so the re-point is a free upgrade. Accepting stamps `confirmed_on` and writes no rate. |
| `fable` | *(none)* → **$10.00/$50.00** | The registry had no Fable 5 entry at all. Now present and priced. |
| `gpt-5-6-sol` | *(none)* → **$5.00/$30.00** | The real price of the model the bare `gpt-5.6` alias was silently reaching. |
| `gpt-5-6-luna` | *(none)* → **$0.20/$1.20** | The cheap variant, now on the discovery fan-out. |
| `gpt-5-6-terra` | *(none)* → **$2.00/$12.00** | Registered and priced though nothing routes to it, so the family is completely enumerated. |
| `gpt-5-5` | $2.50/$15.00 → **$5.00/$30.00** | Understated 2×, for a different reason than `gpt-5-6`: a real id whose rates were copied from `gpt-5.4` and never checked. |
| `gemini-3-1-pro` | $1.25/$10.00 → **$2.00/$12.00 ≤200k, $4.00/$18.00 above** | A self-declared placeholder, understated ~1.5×. |
| `gemini-pro` | $1.25/$10.00 → **$1.25/$10.00 ≤200k, $2.50/$15.00 above** | The tier the old two-scalar schema could not express. The cheap tier was always right. |
| `gemini-flash`, `gpt-5-4`, `gpt-5-4-mini` | unchanged — **confirmations** | Correct all along. Accepting stamps them so "confirmed" becomes a fact about the entry rather than about the file. |

### Rejected (2) — and this is the interesting half

`claude-opus-5` and `claude-sonnet-5`, the identity-only entries. The tool
offered to give each of them the same rates it had just written to `opus` and
`sonnet`.

**Rejected, because accepting would have recreated this set's origin defect.**
After the re-point, `opus` carries `model_id: claude-opus-5` and `sonnet`
carries `claude-sonnet-5` — so accepting would have put the price of one model
in two places, free to drift apart. The registry's own rule, from Session 3,
is that an entry declares its rates one way and only one way; two entries
declaring the same model's rates is that rule evaded rather than broken.

The rejection held: the second `--fetch` shows both entries still at
`(no rates declared)`, and both still appear as pending proposals — the tool
has no memory of a rejection, correctly, since a rejection is a judgement about
today's number and not a permanent policy.

**Both entries are now redundant** and are flagged for retirement rather than
deleted here: removing a registry key is a change a consumer repo could be
pinned to, and that wants the operator's sanction, not a passing edit while
closing a gate.

## Reading the diff as an operator: two defects, both fixed

The spec makes the readability of this screen a deliverable. Two things read
badly enough to be treated as defects rather than notes.

### 1. A dated rate was labelled as though it were a size tier

Sonnet 5 has two rows because its price **changes on a date**. The first run
rendered them:

```
      in $2.0 / out $10.0 per 1M  (all other prompts)
      in $3.0 / out $15.0 per 1M  (from 2026-09-01, all other prompts)
```

"all other prompts" is the label for the unbounded row of a *context-tiered*
model — it means "and above". On a model with no tiers at all it invites the
reader to hunt for a boundary that does not exist, on the one screen whose
entire job is that a human understands a price before accepting it.

`_render_declaration` now says it only when some other row in the same period
actually claims a size range. After:

```
      in $2.0 / out $10.0 per 1M
      in $3.0 / out $15.0 per 1M  (from 2026-09-01)
```

Pinned by `test_a_dated_row_is_not_labelled_as_a_size_tier`, with
`test_a_size_tiered_row_still_says_all_other_prompts` holding the contrast so
the fix cannot swallow the case the label was written for.

### 2. `--fetch` would have proposed deleting a hand-encoded tier

This is the residual Session 3 closed **WAIVED** over, and the walk is where it
would have bitten. OpenAI prints a Short and a Long context rate for every
model and states the boundary between them nowhere, so `parse_openai` proposes
the short pair and reports the long pair as an observation telling the operator
to *"add a pricing: row with an explicit max_input_tokens"*.

An operator who follows that advice has an entry that says more than the page
does. The next `--fetch` diffed its flat short-context rate against their
two-row schedule, found them different, and proposed **replacing** it —
silently deleting the expensive tier they had just added, and under-reporting
every long prompt by the margin between the two.

Such an entry is now held in `not_comparable_entries`: both rate sets are
printed side by side for the operator to compare by eye, no change is
generated, and `--apply` has nothing it could write. The condition is written
on the data — *the entry prices by prompt size and the page states one rate
with no size boundary* — not on the provider name, so a page that stops
publishing bounds is covered without an edit, and there is no per-entry
"operator-curated" flag anyone can forget to set.

The richer alternative — preserve the schedule and write the page's rate into
its lowest-bounded row — was deliberately not taken. It assumes the page's
unbounded rate corresponds to that row, and a wrong write there is exactly the
plausible-wrong-number failure the refusal exists to prevent.

Six tests pin it, including
`test_a_hand_encoded_tier_is_never_proposed_away` and
`test_a_not_comparable_entry_cannot_be_accepted`. **Falsifier check:** with the
guard disabled, three fail and the report shows `[~] gpt-5-4` proposing the
flat replacement — the defect, reproduced.

## Two observations that are not defects

**`gemini-3-pro` reports as NOT CHECKED.** Its corrected `model_id`,
`gemini-3-pro-preview`, is offered by the Gemini API — `model_inventory
--check` passes on it — but it is not on the published *pricing* page, which
lists generally-available models. The drift gate and the pricing page are
different sources and an id can be real in one and absent from the other. The
entry is identity-only and carries no rates, so nothing is unpriced. The tool
reporting it rather than passing over it is the behaviour that matters.

**53 published models no registry entry claims**, across the three providers.
Informational by design: this tool updates the rates of models the registry
already has and never adds models, because deciding what to route to is
curation and not scraping.

## The stamps

Every accepted entry carries `confirmed_on: "2026-08-04"`, and
`metadata.pricing_reviewed` was refreshed to the same date as the maintained
rollup of the oldest per-model stamp. The load-time warning that fired on every
run — *"9 model(s) have no confirmed_on stamp"* — is gone.

The two rejected entries carry no stamp, which is correct: nothing about them
was confirmed.

## What the flow proved about itself

- **`--fetch` never wrote to `router-config.yaml`.** Verified across three runs.
- **`--apply` wrote only the 12 marked `accept`.** The 2 marked `reject` are
  unchanged on disk.
- **A pending decision refuses the whole apply**, so a half-read proposal
  cannot write half a registry (pinned by the suite, not re-walked here).
- **The accept step is a file edit**, not a `[y/N]` keystroke: accepting
  requires opening the proposal and finding the entry. That is why both halves
  of the flow are exercised by the hermetic suite and not only by the operator
  who walks it.
