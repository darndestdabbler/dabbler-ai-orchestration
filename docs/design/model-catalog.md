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
actually answered — and 148's own commit says exactly that. So the axes were:

> **Superseded by §10 of the ruling.** The probe is deleted and nothing is
> stored under `echoed_model` any more. The table below is why the probe
> ended up costing what it did, kept because §8's stale-vocabulary cleanup is
> aimed at these exact sentences.

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

## 4. The authoring row configures a role that nothing dispatches

**Found 2026-09-11, while answering the operator's question about which models
each role may draw from.** It is not one of the three defects this page was
opened for and it is the largest of the four.

The pane's **Authoring model** row resolves `roles.generator`
(`projection.ts`, `roleNode(reading, ROLE_GENERATOR, ...)`) and `dabbler
configure --authoring-model` writes `roles.generator.prefer`. Nothing
dispatches that role. `ROLE_GENERATOR` appears in exactly three places
outside its own declaration — the pane, the `configure` command, and as the
fallback on `route()`'s `options.role ?? ROLE_GENERATOR` — and every one of
the four live `route()` callers names a role explicitly:

| caller | role |
| --- | --- |
| `verify/rounds.ts` | `verifier` |
| `verifyjob.ts` | `verifier` |
| `triage.ts` | `verifier` |
| `planReview.ts` | `plan-review` / `plan-review-escalated` |

**The model that actually authors a session is the engine's**, declared once
at `dabbler session start --engine <e> --provider <p> [--model <m>]` and kept
in the orchestrator block, and it is that model's provider the verifier
excludes at run time (`verify/rounds.ts`, `orchestrator.effectiveProvider`).
So the pane has two authors: the one a person picks, which changes nothing,
and the one the session runs on, which the pane never shows.

It also means the verifier list the pane offers is filtered against the wrong
author. `projection.ts` excludes the provider of the *pane's* authoring row
while the runtime excludes the provider of the *orchestrator* — the same
family of defect as the pin in §5 of the ruling, one layer up.

**And which models may author is a property of the engine's CLI, not of the
transport.** Claude Code runs Anthropic models and nothing else; the Gemini
CLI runs Google's; the Copilot CLI fronts every vendor its seat lists. The
code already draws exactly this line and has since identity was written —
`identity.MULTI_PROVIDER_ENGINES` and `classifyIdentityProvenance`, which
calls a seat's identity `asserted` and a single-vendor CLI's `direct`.
Nothing in the Configuration pane reads it.

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

**The ruling below carries this forward and amends it in three places**, on
the operator's own direction after the consultations: the catalog lives at the
**user level** rather than shipping with the extension, `validFrom`/`validTo`
become the `listed_at`/`retired_at` the lock already keeps, and the
capability grading a `costFactor` would have fed is **deferred** — the data to
do it honestly does not exist yet.

## The ruling

**Settled by the operator on 2026-09-11**, after two rounds of consultation
with `gpt-5.6-sol` and `gemini-3.1-pro-preview` and a reading of the code
behind each claim below. This section replaces the recommendation that stood
here before it, which argued for a registry join, a capability floor and a
shipped-baseline merge. All three are cut.

The measure the design is held to is the developer who opens an AI chat panel
in VS Code instead: they pick whatever model they like and nothing stops them.
A framework that refuses more than that has to earn the difference, and in
almost every case here it does not. **Reliability, simplicity and adoption
decide this design.** A framework nobody uses governs nothing.

### 1. The catalog is one user-level file, and nothing ships

`ai-model-catalog.json` lives outside every repository, at
`%LOCALAPPDATA%\dabbler\` on Windows and the XDG equivalent elsewhere. It
holds one block per **transport**, and a block is written only for a transport
that machine actually has.

Nothing is shipped in the VSIX and nothing is tracked in git. The current
`packages/router/copilot-catalog.lock` is a committed snapshot of one
developer's seat — it carries `seat_id = "op-personal"` — and the VSIX
distributes it to every other seat, which is how a machine comes to be told
about models it does not have and not told about models it does. The reason a
baseline was ever worth having was cost, and reading what exists is free on
both transports: three vendor metadata calls, 195 models, 2.4 seconds on the
API path; the seat's own reply to opening a conversation on the other. A
refresh that costs nothing does not need a fallback to be seeded from.

So there is no baseline, no project-local overlay, and no merge. A new
developer on day zero sees *not read yet*, and the first session reads it.
**Both advisors reached this independently and both rejected the merge as
solving a problem created by shipping runtime observations as package data.**

The old records are not migrated. `.dabbler/api-models.lock` and
`copilot-catalog.lock` are derived and free to rebuild, so they are deleted
rather than converted.

**One guard, and it is the one this file has already needed.** A block records
the scope it was read for — the seat it came from, and for the API path which
providers' keys were present. A block whose recorded scope is not the current
one is treated as unread and refreshed. That is what the shipped
`op-personal` catalog would have failed, and `seat_id` is already in the file
today as provenance that nothing ever checks.

### 2. One record, read by the offer and the check alike

This is the non-negotiable part and the whole of defect 1. `projection.ts` and
`cli/configure.ts` each decide for themselves today what a model is, and they
disagree for ten of the eighteen models the pane offers. **Whatever the pane
offers, `configure` accepts**, because both read the same catalog for the
transport in force. Not a shared helper alongside two readings — one reading.

### 3. The registry is deleted

The `models:` block in `router-config.yaml` — aliases, dated `model_id` pins,
`capability_tier`, `is_enabled`, `is_enabled_as_verifier` — goes. The catalog
is the inventory and the ids in it are what goes on the wire, so the alias
layer has nothing left to do, and the dated pin that decided whether
`claude-haiku-4.5` could be chosen stops existing.

What is genuinely load-bearing in that block is read **only on the direct-API
path** — on the seat, `route.ts` already returns `{}` for both model config
and generation params, because the CLI exposes no generation knobs. It is
three things, and they become per-provider defaults with **no model names in
them**, which is what makes them incapable of going stale:

| what | was | becomes |
| --- | --- | --- |
| `max_output_tokens` | per model | one default per provider |
| `generation_params` | per model (thinking level, effort) | one default per provider family |
| `system_prompt_file` | repeated on all 13 entries | one value |

Identity resolution already falls back to the catalog
(`identity.resolveModelProvider`), so it loses nothing.

The direct-API enumeration returns 130 OpenAI, 55 Google and 11 Anthropic ids,
including embeddings, transcription, image and speech models that are not
dispatchable as chat. Those are excluded by **a rule over the ids** at the
point of display, not by a curated list. A rule that is occasionally wrong
about a new family shows one extra row; a curated list is a second inventory
to maintain, which is what was just deleted.

### 4. Exactly one thing is enforced: the verifier is not the authoring model

Nothing else refuses anything. Not provider, not tier, not capability.

**Cross-provider stops being a rule and becomes a label.** It was never
enforced for the reason it reads as — it is a good default, not a truth — and
a framework that refuses a pair a developer deliberately chose is a framework
that gets uninstalled in favour of the chat panel. Both advisors agreed.

The one refusal survives because it is the only one that requires no judgment:
**two strings are compared.** No capability data, no provider inference, no
heuristic. It prevents a model reviewing its own literal output, which is the
degenerate case the product's entire claim rests on. It is stated with its
limit: it does not prevent *correlated* review — `gpt-5.6-sol` and
`gpt-5.6-terra` are different ids and very likely the same base model — and
that judgment is the developer's, which is where this design puts it.

**This does not touch the 2026-07-06 no-skip mandate.** That mandate is about
an *engine* being unable to skip verification mid-session, and it stands
exactly as it was. What moves is a *human's* choice at configuration time,
from refused to labelled. The human chooses who verifies; the engine still
cannot choose whether verification happens.

### 5. The model on the screen is the model that runs

Today `configure` writes the operator's choice to the **front of a preference
order** (`config.writeConfigurationChoice`) while the verify pipeline
**excludes the authoring model's provider** when it resolves that same role
(`verify/rounds.ts`). An explicitly chosen same-provider verifier would be
dropped at run time and something else used instead — the pane promising one
thing and the session doing another.

Both advisors named this, unprompted, as the single fastest way to lose a
developer in the first hour.

- A model chosen in the pane is a **pin**, and the runtime uses it.
- A pinned model that cannot be dispatched **fails visibly** and says which
  model and why. It is never silently substituted.
- Where **nobody chose**, the engine resolving a role on its own may still
  prefer a different provider. That is a default, not an override of a person.
- The dispute adjudicator keeps its third-provider rule. That role is
  engine-selected by definition and no human choice is being overridden.

### 6. Labels repeat what the source said; they never grade a model themselves

> **Amended 2026-09-11 after review.** The band was called `capability` when
> this was first written. It is the seat's **price category** and it is stored
> and shown under that name — calling a price a capability is the framework
> grading a model it cannot judge, which is the one thing this section
> forbids. The value is the seat's own token, verbatim.

The verifying dropdown tags each option against the chosen authoring model:

- **Different provider** / **Same provider** — *reviews may share the author's
  blind spots* / **Provider unknown**
- and, where the source stated one, the model's own **price category**, in
  the source's own words.

One static line of help encourages a different provider. That is all.

**The band is read, not inferred — this corrects the recommendation that
stood here before.** It was written to defer capability grading on the
grounds that inferring it from cost fails on the data that exists. The
premise was wrong, and the evidence is in the seat's own free reply. Every
model it lists carries `_meta.copilotPriceCategory` — `low`, `medium`,
`high`, `very_high` — alongside `copilotUsage` and `copilotEnablement`. It
costs nothing, it is stated for all 28 entries, and **of those three fields
it is the only one the catalog writer discards**: `adoptSeatEnumeration`
keeps the usage as `seat_usage` and the enablement as 148's
`ENABLEMENT_LISTED`, and drops the band on the floor. Measured 2026-09-11
from the live seat:

| model | usage | category |
| --- | --- | --- |
| `claude-fable-5.1` | 15x | very_high |
| `claude-opus-5` | 15x | high |
| `claude-sonnet-5` | 1x | medium |
| `claude-haiku-4.5` | 0.33x | low |
| `gpt-5.6-sol` | 1x | high |
| `gpt-5.6-terra` | 1x | medium |
| `gpt-5.6-luna` | 1x | low |

So the operator's own example — *when the author is Opus, do not recommend
Luna as the verifier* — is answerable today on free data: Opus 5 is `high`
and Luna is `low`, said by the seat rather than judged by this framework.
That is the only kind of grading the ruling permits: **repeat the source,
name the source, and hold no opinion where the source is silent.** The
direct-API path has no such statement from any vendor, so the band there is
`null`, nothing is shown, and nothing is guessed.

Note that `copilotUsage` and `copilotPriceCategory` are independent: all three
5.6 models bill `1x` and sit in three different bands. A cost-derived grade
would have called them equal.

**Cost is carried from the free statement, and the probe field is dropped.**
Both are in the lock today and they are not the same fact: `seat_usage` is
what the seat itself says, present on all 26 listed models; the older
`premium_request_weight` is a probe sample, present on 8, and it **disagrees**
with the seat wherever both exist — `claude-fable-5` sampled at `1` against a
stated `15x`, `gpt-5.4` sampled at `0` against a stated `1x`. The stated one
survives, with its unit and platform beside it, because a bare number has now
been read as premium requests by four engines in a row. The sampled one goes.

"Ask an AI which pair to choose" stays as a sentence of help text. It is not a
mechanism, and it is not the framework's answer to missing metadata.

**The sample file is `docs/design/ai-model-catalog.sample.json`** — the seat's
26 listed models, every one of them carrying a cost and a price category,
8 retired ids archived by name and date, and 196 vendor models carrying
neither. It is generated through the framework's own `enumerateSeatModels` and
`adoptSeatEnumeration` against a live free read of this machine's seat, so the
listed/retired/provider/usage rules in it are the real ones rather than a
transcription of them. There is not one partly-filled row in the active list,
which is what moving the retired entries out of it bought.

### 7. Three rows become one

One `ai-model-catalog` row in the Solution Explorer, showing when it was last
updated, with *Update the catalog* and *View the JSON* on its context menu.
The framework refreshes it on the first session of any given day, free, for
whichever transports that machine has. `api-enumeration`, `seat-catalog` and
`seat-list` go.

### 8. The stale vocabulary goes with it

Three places said a probe establishes "entitlement, not existence", which
session 148 overturned when it made the seat's own free statement authoritative
(`ENABLEMENT_LISTED`): `AGENTS.md`, `docs/model-and-pricing-sources.md`, and
`discovery.ts`'s `REFRESH_COST[RECORD_SEAT]`. A fourth was not listed here
before: `router-config.yaml` told its reader that "the seat cannot
enumerate — the CLI has no list-models command", which session 146 disproved.

**Done.** Session 150 cleared the two in code, and session 151 cleared the
documents — along with `README.md`, `docs/quick-start.md`,
`docs/acp-walkthrough.md` and `docs/model-fidelity.md`, which were teaching
the same probe and the `dabbler discovery enumerate` that is now `refresh`.
A control over those six pages keeps the phrases from coming back.
What a probe uniquely bought was **fidelity** — `echoed_model` — and nothing
else, which is why §10 deletes the probe rather than re-describing it.

### 9. The engine constrains the author; the transport constrains the verifier

**Settled 2026-09-11, on the operator's observation.** The two roles do not
draw from the same list, and the thing that narrows the authoring list is a
provider-specific CLI constraint — not a choice this framework is making.

- **The authoring model is the engine's model**, so the list is whatever that
  engine's CLI can run. A **single-vendor CLI** (Claude Code → Anthropic, the
  Gemini CLI → Google) offers that vendor's models from the catalog and no
  others; a **multi-provider seat** (the Copilot CLI) offers its whole
  catalog. `identity.MULTI_PROVIDER_ENGINES` already draws this line and the
  pane reads it rather than restating it.
- **The verifying model is dispatched by the router, not by the CLI**, so its
  list is the catalog for the transport in force — the whole seat list on
  `copilot-cli`, every reachable vendor model on `api`. The engine does not
  narrow it.

So on a Copilot seat the same full list serves both roles, and under Claude
Code the author is Anthropic-only while the verifier is anything the keys
reach. The two constraints are independent, and either engine may run over
either transport.

**The pane's authoring row becomes the orchestrator's model** — the one
`session start` declares and the one the session actually runs on — and
`roles.generator`, which nothing dispatches, is deleted rather than
re-pointed. The verifier's own list is then filtered against that same
identity, so the pane and the runtime stop having two different authors
(§4).

Two consequences worth stating because they look like regressions and are
not. Under Claude Code every Anthropic verifier now carries the **same
provider** label, which is exactly the encouragement working as intended and
not a refusal. And identity resolution at `session start` stops requiring a
model to be "registry-known" — it resolves against the catalog, which is what
`identity.resolveModelProvider` already falls back to.

### 10. The probe is deleted, and the archive holds a name and a date

**Settled by the operator on 2026-09-11, on both advisors' recommendation.**
Two cuts, and together they take the last billed call out of this path and the
last partly-filled row out of the pane.

**Fidelity as a stored field goes, and the prompting probe goes with it.**
`echoed_model` is the only thing a billed turn ever bought, nothing enforces
it, and §2's table above is the last place it will be described as an axis.
So the catalog carries no `fidelity`, and the seat's probing half is deleted
outright: `confirmed_at`, `confirmed_on_cli_version`, `probed_at`,
`premium_request_weight`, `probe_premium_requests`, `last_probe_at`,
`last_probe_error`, the `confirmed`/`listed` enablement split (everything
listed is listed), `echoObservations`, and the 720-hour clock that existed
only to date them. **After this, nothing in the catalog path can bill a
token** — which is the sentence that makes the whole "is a refresh expensive"
trap unaskable rather than merely answered.

**What is not lost is the question the probe was asked to answer.** Session
144's fidelity reading takes observations from two sources, and only one of
them is the probe: `fidelityOn` combines `echoObservations` with
`roundObservations` — every real verification round's `requested_model` and
`served_model` pair, recorded as a by-product of work that was happening
anyway, with the evidence kind its transport makes it. The direct-API half of
that is the provider's own statement (`served_model_id`, which 144 built and
which every call already records). The reading survives on free evidence; the
pre-emptive billed half is what goes.

**Retired models leave the active list.** A developer opening the catalog
should see what they can use, and 8 of the 34 seat entries were models nobody
can select. So each transport block carries two arrays: `models`, which is
only what is currently listed, and `retired`, which is **a name and a date
and nothing else**:

```json
"retired": [{"id": "claude-sonnet-4.6", "retired_at": "2026-09-10T13:31:05Z"}]
```

Nothing in there can go stale, because nothing in there is a claim about a
model still being served. It answers "where did that model go?" and refuses to
answer anything else.

**One file, two arrays — not a second file.** A separate
`ai-model-catalog-retired.json` was offered and is not worth its cost: it
would be a second path, a second writer, a second thing that can go missing,
and a second date for the pane to reconcile, to hold what is a few lines at
the bottom of a block that is already open. The active list is exactly as
streamlined either way.

**What this costs, stated plainly.** The rule it retires is "marked, never
deleted", which existed so that one bad enumeration could not remove a
verifier. The exposure is now a transient short read dropping models for the
rest of the day, and three things already answer it: the refresh is free and
one menu item away, a pinned model that vanishes **fails visibly** rather than
being silently substituted (§5), and the scope check refuses a block that was
read for a different seat. That is a smaller risk than a pane that shows
eight unusable rows every day to insure against it.

### Scope

Smaller than the note that preceded it, and smaller again after the review.
The catalog collapses two lock readers and a three-row freshness check into
one module. Deleted outright: the shipped and tracked catalog, the
project-local record, the baseline-and-overlay merge, the registry, the
capability floor, the untrusted-verifier deny list, the configuration-time
pair refusal, the runtime override of a human choice, the phantom
`generator` role, the prompting probe and every field that dated it, and the
720-hour clock. Ground rule 1 is satisfied several times over.

**One sentence is the test of whether this was built as designed:** the only
thing the framework refuses is a verifier that is the authoring model, and
nothing it does to find out which models exist can bill a token.
