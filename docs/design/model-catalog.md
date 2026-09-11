# The Configuration pane's model records, and the one catalog that should replace them

Three defects, one root. The Configuration section offers a person a model
from the record the transport owns, checks their choice against a different
record, and shows them three rows to explain the disagreement — two of which
name the same file and none of which is named for what it holds.

Nothing here is fixed. This page is the input to the session that fixes it,
written on a machine with a Copilot seat and **no provider keys**, which is
the configuration that makes all three visible at once.

## 1. The pane offers models that `configure` refuses

**Measured, 2026-09-11, router 2.1.3, `DABBLER_TRANSPORT=copilot-cli`.**

`projection.ts` resolves both role rows over the enumeration the transport in
force owns — `roleReading` reads the seat catalog on `copilot-cli` and the
registry otherwise. That is session 146's fix and it is correct.
`cli/configure.ts` never got it. `aliasFor` walks `config["models"]` — the
direct-API registry — on every transport, so a seat model the registry does
not declare is refused as though it did not exist:

```
$ dabbler configure --repo-root ../csv-parser --authoring-model claude-haiku-4.5
dabbler configure: 'claude-haiku-4.5' is not a model this registry declares.
Its models are: fable, gemini-3-1-pro, gemini-3-pro, gemini-flash, gemini-pro,
gpt-5-4, gpt-5-4-mini, gpt-5-5, gpt-5-6-luna, gpt-5-6-sol, gpt-5-6-terra,
haiku, opus, sonnet.
```

Every one of the 18 models the pane offered for the authoring role, and every
one of the 12 it offered for the verifier, put through `dabbler configure`:

| role | offered | accepted | refused |
| --- | --- | --- | --- |
| authoring (`generator`) | 18 | 8 | **10** |
| verifying (`verifier`) | 12 | 5 | **7** |

Refused for authoring: `claude-haiku-4.5`, `claude-opus-4.8`,
`claude-opus-4.7`, `gpt-5.3-codex`, `gpt-5-mini`, `gemini-3.5-flash`,
`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gpt-6-astra`.

The eight that pass do so by coincidence: they are the seat ids that happen
to be spelled exactly like a registry `model_id`. `claude-sonnet-5` passes
because the `sonnet` alias carries that id; `claude-haiku-4.5` fails because
the `haiku` alias carries `claude-haiku-4-5-20251001`. **A dated pin in the
registry decides whether a seat model can be chosen**, which is not a rule
anybody wrote.

The refusal then lists registry *aliases* — `fable`, `gemini-3-1-pro`,
`sonnet` — which are not seat ids, are not what the pane offered, and are not
what `/model` shows. Two of them (`fable`, `gemini-3-pro`) are
`is_enabled: false` identity-only entries that cannot be selected at all.

There is a second, quieter half. Once a model is accepted, `effectiveAuthor`
and `resolvedVerifier` also resolve over `explainRegistryCandidates`, which
filters by `providerReachable` — an API key per provider. On a seat-only
machine that yields nothing, so `verifierRefusal` is skipped entirely and the
cross-provider pair rule is never applied to a seat choice. The tier floor
cannot apply either: `tierRank` reads `capability_tier` off a registry entry
keyed by alias, and the seat catalog declares no tier.

## 2. "Entitlement, not existence" is stale vocabulary

Session 146 coined it to justify the billed probe. **Session 148 overturned
it** and nothing that says so was updated.

148's finding was that the seat states `copilotEnablement` for every model it
lists, free, in the ACP `session/new` reply — and `adoptSeatEnumeration` was
discarding it and writing `ENABLEMENT_UNCONFIRMED` over the top, which is
what forced a billed probe to re-establish what the seat had already said.
The fix was `ENABLEMENT_LISTED`, and `selectableEntry` now accepts
`confirmed` **or** `listed`. Entitlement costs nothing and has not gated
selection since 2.1.2.

What the probe uniquely buys is **fidelity** — `echoed_model`, which model
actually answered — and 148's own commit says exactly that. So the axes are:

| fact | cost | where from |
| --- | --- | --- |
| existence, entitlement, cost multiplier | free | seat's ACP enumeration, one read |
| fidelity (`echoed_model`) | one billed turn per model | the prompting probe |

Existence and entitlement collapsed. Three places still assert they are
distinct, and an engine reading any of them reasons wrongly about what a
refresh costs — the exact failure `AGENTS.md` already has a trap section for:

1. `AGENTS.md` — *"It establishes that a model ANSWERS on this seat —
   entitlement, not existence."*
2. `docs/model-and-pricing-sources.md`, §*What the prompting probe is still
   for* — the same sentence.
3. `packages/router/src/discovery.ts`, `REFRESH_COST[RECORD_SEAT]` — *"What
   costs is CONFIRMING that a model answers."*

## 3. Three record rows, named for their implementation

`checkFreshness` emits three rows and `solutionTreeModel.ts` renders
`label: node.record`, so an operator reads the router's internal tokens:

| row | path | dated by | threshold |
| --- | --- | --- | --- |
| `api-enumeration` | `<project>/.dabbler/api-models.lock` | — (no record yet) | 24h |
| `seat-catalog` | `<extension>/dist/copilot-catalog.lock` | `probed_at` | 720h |
| `seat-list` | `<extension>/dist/copilot-catalog.lock` | `enumerated_at` | 24h |

Two rows are one file. The third is a file that does not exist on a machine
with no provider keys, and it reads as stale forever. None of the three names
says what it holds, and the split exists because the file carries two dates
on two clocks — an implementation fact that became a row.

## What the operator proposed

> Why can't we have a more generic json file called `ai-model-catalog.json`
> with a top-level array, whose items are transport objects. The transport
> object has a name (e.g., `copilot-cli` or `api`), as well as a property
> called `models` that holds an array of models. The model objects include a
> name, a `costFactor` property, and `validFrom` and `validTo` properties (or
> perhaps just a `notAvailable` flag). (These can have different names, if you
> like, and if there are other properties that we need to include, they can be
> there.) Then the Solution Explorer would have one entry for
> `ai-model-catalog`, which would show the last time that it was updated.
> Right-clicking on the item would provide an option to update the catalog or
> an option to view the catalog's JSON file. Normally, the framework would
> refresh the catalog automatically at the beginning of the first session run
> on any given day. Only those transports that are active on the computer
> where the catalog is refreshed would be refreshed in the catalog file. This
> `ai-model-catalog` in the Solution Explorer would replace `seat-catalog`,
> `seat-list`, and `api-enumeration`.
>
> In general, I think that the Configuration section of the Solution Explorer
> is potentially very, very helpful. What I am proposing would make it less
> confusing.

— Operator, 2026-09-11. To be implemented on a machine that has both direct
API keys and a Copilot seat, which is the only place the multi-transport
refresh can be walked end to end.

## Recommendation

**Adopt the proposal.** It is the right shape, and it is right for a reason
worth stating: *transport* is already the axis this framework selects on —
`selection.ts` has held since it was written that "the enumeration belongs to
the transport" — and the current design is the only place that axis is not
the top-level one. One file keyed by transport makes defect 1 unrepresentable,
because there is then no second record for `configure` to disagree with.

Seven notes on the details.

**1. One record, read by the offer and the check alike.** This is the
non-negotiable part and the fix for defect 1. Today `projection.ts` and
`cli/configure.ts` each decide for themselves what a model is.
They should share one reader, and the shape the code already wants is a
vocabulary — *the names this transport offers, what each one is, and how a
role resolves over them* — built once from the catalog and handed to both.
Ground rule 3: one implementation of any rule.

**2. Keep the registry; it is not the same thing as the catalog.** The
catalog is *observed* — what a vendor or seat said on a date. The registry is
*declared policy* — `is_enabled_as_verifier`, `capability_tier`,
`generation_params`, `system_prompt_file`. Folding policy into an
auto-refreshed file means a daily refresh silently rewrites the operator's
judgement about who may verify. The catalog should answer "what exists, on
which transport, at what cost", and the registry should keep answering "what
we permit, and how capable we consider it". They join on the model id.

The join is what defect 1's second half needs anyway: `capability_tier` must
be findable from a seat id (`claude-sonnet-5`), not just from an alias
(`sonnet`), so the tier floor applies on a seat. Match on
`normalizeModelToken`, which is already the mechanism `untrustedAsVerifier`
uses for exactly this reason.

**3. `validFrom`/`validTo` over `notAvailable`.** Prefer the dated pair. The
lock already carries `listed_at` and `retired_at` and the pane already says
"last seen … gone since …", which a boolean cannot express. Keep the standing
rule that a model is **marked, never deleted** — one bad enumeration must not
be able to remove a verifier.

**4. `costFactor` needs a unit, and the unit must be named in the file.**
This is the trap that has now caught four engines. A bare number will be read
as premium requests by the next reader. Carry the platform beside the figure
(`aiCredits` per token vs. the legacy `premiumRequests` multiplier) and keep
the seat's own free statement in preference to any probe sample — the samples
are measurably wrong where the two disagree.

**5. Fidelity is a fourth field, not a second record.** `echoed_model` is the
one fact a billed turn buys, and it is global rather than per-seat. Keep it
per model in the same file; it simply refreshes on a different trigger than
the free read. That is the honest version of today's two-date split — one
record, one "last updated", with a separate *manual* action for the priced
part. This is what lets three rows become one.

**6. "Only active transports are refreshed" must be a merge, not a
replacement.** The shipped catalog is how a hundred developers inherit the
operator's record without probing anything. A machine with only a seat must
leave the `api` block intact and stale rather than emptying it, and the file
must record *per transport* when it was last read, even though the pane shows
one headline date. Otherwise the first seat-only laptop to refresh strips the
API models for everyone on the next VSIX.

**7. Where the file lives.** The lock ships inside the VSIX today
(`<extension>/dist/copilot-catalog.lock`) and the API record is per-project
(`<project>/.dabbler/api-models.lock`). The proposal's single file has to
resolve that: recommend the shipped catalog stays the distributed baseline
and a machine's refresh writes a gitignored project-local overlay, with the
pane showing the effective merge. A right-click "view the JSON" should open
whichever one answers.

### Scope

The catalog is a rename plus a merge of records that already exist, so ground
rule 1 is satisfiable: `discovery.ts`'s three-row `checkFreshness` and the
two lock readers collapse into one catalog module. Retire the stale
vocabulary in the same change — the three sentences in §2 — because the next
engine to read them will reason about cost exactly as the last four did.

An interim one-line fix for defect 1 is possible (have `configure` read the
same `roleReading` the projection does) and is **not** recommended as a
separate step if the catalog work is starting; it touches the code the
catalog replaces.
