# What walking the model catalog on both transports found

*Session 156, 11 September 2026. Sessions 150, 151, 152 and 155 replaced a
model registry that shipped inside the extension with one catalog read on the
operator's own machine, deleted three of the four rules that stood in front of
it, gave each reviewing role its own vehicle, and reorganised the pane's
Configuration section around the two participants. Every defect those sessions
repaired was found on a Copilot seat. Every line they rewrote is also on the
direct-API path. This page is the walk that proves the block on both, before
it is published as 2.2.0 — which is the whole reason the walk comes before the
release and not after it.*

*It is the instrument's own record, in the shape `docs/uat/uat-walk-findings.md`
has: what was walked, what refused, and what each finding is in the operator's
terms — **framework** (constant or parameterised, and lifecycle-timed), **UI**
(constant or parameterised, but optional or without a fixed moment), or
**person** (a judgement nobody should automate).*

## The machine this was walked on

| | |
| --- | --- |
| router | `dabbler-ai-router` 2.1.3, built from this tree |
| node | v25.8.1 |
| git | 2.51.0.windows.2 |
| Copilot CLI | GitHub Copilot CLI 1.0.83 |
| seat | `https://github.com`, login `darndestdabbler` |
| provider keys | all three present: Anthropic, OpenAI, Google |
| catalog | `C:\Users\denmi\AppData\Local\dabbler\ai-model-catalog.json` |
| scratch repository | `D:\tmp\uat156-seat`, a bare `git init` with one empty commit |

**This machine is the one the walk needs**, because it has a seat *and*
provider keys. The two single-transport machines are the ones almost every
reader will actually have, and they are walked by taking each half away in
turn — which is its own reading, with its own limits, stated where it is made.

## What was walked, and what was not

Everything the operator touches on the model path: the refresh, what the
record says and under whose scope, what each surface offers, what `configure`
accepts and refuses, what the projection the pane renders says afterwards, and
what actually goes on the wire. The wire was reached twice, on the seat, with
two real turns on two different pinned models — the cheapest the seat lists
(`gpt-5-mini`, 0x) and a second one pinned differently on purpose, because one
turn cannot tell a pin that held from a field that never moves.

**What was not walked: a complete AI session on the seat under this block.**
One session runs at a time and this session is it, so the seat could not host a
second. That is not a gap that can be papered over, and finding 9 says exactly
what the record does and does not establish because of it, and what would
establish the rest.

**Nothing was written into the operator's own machine and left there.** The
model catalog was refreshed, which is the operation under test and is free and
idempotent. `preferences.json` was written by `configure` during the walk and
restored to its pre-walk content afterwards — by hand, because finding 6 is
that the framework offers no way to undo it.

---

## The count

**Twenty-one numbered entries: eleven product defects, two readings that are
not defects but change what a later session may believe, one document error,
and seven confirmations — things the walk proved rather than found.** A walk
that records only its failures cannot be used to argue that anything works, so
what held is numbered beside what did not. Every entry carries its
disposition: **eleven fixed here and four raised as owed** — findings 9, 10
and 17 in full as **D274**, **D275** and **D276**, and half of finding 7,
whose refusal is repaired here while the question underneath it is a decision
about what a reviewer may be. The seven confirmations need neither.

Five of the eleven defects stop an operator rather than slowing one down, and
**every one of them is in the block this session was about to publish** —
which is the entire argument for walking before releasing rather than after:

- **Finding 6** — a model selection is a **one-way door**. After one
  `configure --reviewer-model`, every later selection is refused, including
  perfectly valid ones, and an empty value does not clear it. The pane's own
  pick list is built to *change* a choice and the router refuses the change.
  Reproduced identically on both transports (finding 13).
- **Finding 7** — five of the seat's twenty-six models are silently
  unavailable, and the refusal told the operator their seat does not list a
  model their seat lists.
- **Finding 14** — under Claude Code no authoring *model* is declared, so the
  provider label that replaced three deleted rules appears on no row at all,
  on either transport.
- **Finding 17** — the pane re-derives the projection at activation using its
  own bundled router, so an installed extension older than the CLI silently
  strips what the newer one wrote.
- **Finding 20** — the rule that a session may not refresh its own verifier
  pool guards `dabbler discovery refresh` and not `dabbler copilot refresh`,
  which writes the same block.

---

## Reading 1 — the Copilot seat

### 1 — A refresh is refused while a session is in flight, and the pane's own question does not say so

`dabbler discovery refresh`, run from this repository during session 156:

```
refresh: refused -- a session is in flight (session 156). Discovery runs between
sessions: a session that changes its own verifier pool while running has edited
the conditions of its own review.
```

The refusal is right, and the reason is the good one. What it collides with is
session 155's own change: *Refresh* is now an action on the Configuration node,
and the question it asks first reads

> Refresh ai-model-catalog?
>
> Nothing. One metadata request per enabled vendor, and the seat states its own
> models in the reply to opening a conversation …
>
> It runs `dabbler discovery refresh` in a terminal, where you can watch it.

An operator clicking it mid-session is asked to confirm an operation that
cannot happen, and finds out in the terminal. The terminal *is* where the
refusal lands and it is legible there, so nothing is hidden — but the question
promises a refresh it is in no position to offer.

**Minor. Framework** — the condition is lifecycle-timed and constant, which is
the framework's bucket, and the pane already reads the row that would carry it.

**Disposition: fixed here** (the confirm says when it will be refused).

### 2 — The refresh itself does what it says, on both transports, for nothing

From a directory with no session in flight:

```
discovery: the seat block has been re-read -- 26 model(s) the seat lists, free, no prompt sent
discovery: the api block has been re-read -- 196 model(s) recorded, no tokens billed
refresh: the catalog at C:\Users\denmi\AppData\Local\dabbler\ai-model-catalog.json
has been re-read for every transport this machine has. No tokens were billed: a
models endpoint is a metadata request, and a seat states its own list in a protocol
reply.
```

5.9 seconds, both transports, no prompt sent on either. The seat block records
its scope — `seat_host` and `seat_login` — and the api block records the
provider set its keys cover. **Not a finding; the first thing the walk
confirmed rather than found.** It is written down because three engines have
now got the cost of a model list wrong, and a measurement is the only thing
that settles it.

### 3 — A wrong-scope block is unread everywhere except in how old it is

`catalog.ts` states the rule in its own header, and names the readers it binds:

> A block read for another scope is unread, not stale, and it is unread to
> EVERY reader: what routes, what a pane offers, what drift knows about, **and
> how old this machine's reading is.**

The first three hold. A catalog whose seat block names `somebody-else` comes
back `null` from `seatBlock`, so nothing routes to it and no surface offers it.
The fourth does not. Against that same doctored catalog:

```
fresh  ai-model-catalog: 0h old (threshold 24h), oldest entry dated 2026-09-11T22:04:39Z
```

`checkFreshness` reads `catalog.transports` directly rather than through
`blockFor`, so a reading taken on somebody else's seat ages as this machine's
own — and reports **fresh**, which is the one word that stops an operator
refreshing. The machine that most needs a refresh is told it does not need one.

There is a second copy of the same unscoped read, `lastRefreshedAt` in
`packages/router/src/catalog.ts`, which has **no caller at all**: one reading
stated twice, both wrong in the same way, and the spare one is dead.

**Major. Framework.**

**Disposition: fixed here** (scoped, and the dead copy deleted).

### 4 — A selection the deleted registry never declared is accepted, and the projection says so

The deleted registry declared fourteen aliases. `gpt-6-astra` was not one of
them; the seat lists it today.

```
configure: the Primary Reviewer is 'gpt-6-astra'; it is used and never silently substituted
configure: written to this machine's preferences; it is the default for the NEXT session.
```

and `configuration.primaryReviewer.chosen` in the projection the pane renders
reads `gpt-6-astra` afterwards. **Not a finding.** This is the block's whole
point working: a model that exists today is selectable today, with nothing to
add to a list first.

One wrinkle worth writing down rather than filing: the model went to
`preferences.json` at the **user** level while `--transport` goes to the
repository's own overlay, so a reviewer chosen in one repository is chosen in
all of them. That is the intended design. The header of
`packages/router/src/cli/configure.ts` does not say so — it says "Each is
written to the machine-local overlay", which is now true of one of the two.

**Document error.** **Disposition: fixed here** (the header states both layers).

### 5 — The transport an environment variable decides says that it decided it

```
configure: transport.profile is now 'copilot-cli'
configure: written to D:\tmp\uat156-seat\local-overrides.yaml; it is the default for the NEXT session.
configure: DABBLER_TRANSPORT is set to 'api' in this environment and outranks the
file, so it is what a session started from here will use.
```

**Not a finding.** This is session 145's repair working on the exact trap that
produced it: the variable outranks the file, and the answer says which layer
won rather than letting the operator believe the file did.

### 6 — A model selection is a one-way door: after the first, every other model is refused

**This is the walk's headline, and it is in the block this session was about to
publish.**

With `gpt-6-astra` selected, every subsequent selection is refused — including
models the seat plainly lists:

```
$ dabbler configure --reviewer-model gpt-5.4
dabbler configure: 'gpt-5.4' is not a model the copilot-cli transport lists. It lists: gpt-6-astra.

$ dabbler configure --reviewer-model ""
dabbler configure: '' is not a model the copilot-cli transport lists. It lists: gpt-6-astra.
```

Both exit 1. The seat lists twenty-six models, twenty-one of them selectable.
The refusal names one: the one already chosen.

**The cause is one argument.** `offered()` in `packages/router/src/cli/configure.ts`
calls `reading.resolve(role, null)` and takes the default, which is
`applySelection: true` — so the list it checks a new name against has already
been collapsed to the existing pin. `roleNode` in
`packages/router/src/projection.ts` passes `{ applySelection: false }` for
precisely this reason, with the reason written beside it:

> a pane narrowed to the one model already chosen would offer the choice they
> already made and no way back out of it

The pane does the right thing and the verb undoes it. `modelItems` in
`tools/dabbler-ai-orchestration/src/commands/configurationCommands.ts` builds
its list from the projection's twenty-one candidates and marks the current one
`what you chose`, in a comment that states the intent exactly:

> Which one they already chose, so the list is a place to CHANGE a choice
> rather than a place to make one over again.

The operator picks a different model from that list and the router refuses it.
There is no way out from any surface the framework offers: `--engine ""` clears
the engine and is documented to, and `--reviewer-model ""` is refused by the
same collapsed list. The walk restored this machine's `preferences.json` by
hand, which is the thing session 155 deleted *View the file* to stop people
doing.

It reaches both reviewing roles, because both go through `checkedModel`, and
both transports, because `offered()` is transport-agnostic.

**Major. Framework** — a constant rule, applied at a fixed moment.

**Disposition: fixed here**, with the test that holds a second selection open.

### 7 — Five of the seat's twenty-six models are unreachable, and the label written for that case can never appear

The seat lists twenty-six models. Every surface offers twenty-one. The missing
five are the ones whose provider the name-prefix heuristic cannot name:
`mai-code-1.1-flash`, `grok-4.5`, `grok-4.6`, `kimi-k3`, `kimi-k2.7-code`.
`configure` refuses them by the same route as finding 6's valid models:

```
dabbler configure: 'grok-4.6' is not a model the copilot-cli transport lists.
```

Two filters drop them, and each states its reason: `selectable` in
`packages/router/src/transports/copilot.ts` requires a provider "so
cross-provider selection cannot land on a name it could not place", and
`explainRole` in `packages/router/src/selection.ts` drops a candidate with no
provider before anything else.

Both reasons were written while cross-provider was a **refusal**. Session 151
made it a **label** — `different provider`, `same provider`, `provider
unknown`, one vocabulary, read by the row and by the pick — and a label needs
no provider to be placeable. The filters were not revisited, so:

- an operator cannot select five models their seat will dispatch, and the
  refusal tells them the transport does not list them, which is false; and
- `PROVIDER_UNKNOWN` is emitted by **no path at all**. A candidate with an
  unknown provider never survives to be labelled, and the only other way in —
  an unknown *authoring* provider — is unreachable because `candidateNode`
  returns `null` rather than calling `providerRelation` when there is no
  author. The constant is exported, the extension carries the words
  `provider unknown`, and nothing can produce it.

The two halves are one finding because they have one cause: a filter that
outlived the rule it served.

**Major. Framework.**

**Disposition: SPLIT — the lie is fixed here, the design question is owed.**
Looking at what it would take to offer these five settled it. The provider is
load-bearing further down than the filter: every round records
`reviewer_provider`, and an adjudication excludes *every provider that has
already reviewed* by reading those back. A model whose vendor cannot be named
cannot be excluded that way, so offering it would put a model into the one
role whose definition is an exclusion it is exempt from. That is a decision
about what a reviewer may be, not a filter to relax in passing.

What is fixed here is the half that is simply untrue. `'grok-4.6' is not a
model the copilot-cli transport lists` said the transport does not list a model
the transport lists; the refusal now separates three cases — the transport has
read nothing, the transport lists this model and no role may draw on it, and
the name is not in the record — and the middle one names the reason and says
it is a limit of this framework and not of the reader's seat.

`PROVIDER_UNKNOWN` stays unreachable and stays in the code, because it becomes
reachable the moment the owed half is decided either way. Recorded here so it
is not mistaken for dead weight and deleted.

### 8 — The authoring list is filtered by the engine only once a session has run

`authoringNode` reads the engine from the ledger — the in-flight session, or
the last one — and filters the candidates to that engine's providers. In a
repository that has never run a session the ledger names no engine, so
`vendor` is `undefined` and **no filter applies**: the Authoring AI node offers
every model the transport lists, Gemini and GPT included, as models Claude Code
could author with.

The leaf immediately above it does not have this problem. `engineVehicleNode`
reads `inFlight ?? preferred ?? reading.chosen`, so Vehicle says `claude-code`
from `preferences.json`. The two leaves of one node, read from two different
places, disagree — on exactly the machine sessions 131 and 132 cared about,
a repository on its first day.

**Minor. Framework.**

**Disposition: fixed here** — the authoring filter falls back to the same
preference the vehicle beside it already reads.

### 9 — There is no seat evidence in this repository's record under this block

The claim "the model that was pinned is the model that answered" is read off
`requested_model` and `served_model` in each round of `rounds.jsonl`. The
record holds 57 rounds taken over the seat, every one of them with
`requested_model == served_model` — and every one of them from **sessions 93
to 99**, before the catalog existed.

Sessions 100 to 155 all read `transport: "api"`, because `DABBLER_TRANSPORT` is
set to `api` in this machine's environment and outranks every config layer.
So the seat's dispatch path has not verified a session under the code this
release carries, in this repository, at all.

**Not a defect — a limit on what the record proves**, and it is written here so
that no later session reads 57 clean seat rounds as evidence about this block.
Finding 10 is the part of it that *could* be measured without a session, and
was. What would close the rest is one real session started with
`DABBLER_TRANSPORT` cleared and the vehicle set to the seat; that costs AI
credits and belongs to an operator's decision, not to this walk.

**Disposition: raised as owed, as D274.**

### 10 — The pin holds at the wire, and the one field that looks like it contradicts that does not

Two real turns on the seat over its own protocol, pinned to two different
models:

| pinned | `open` → `currentModelId` | `open` → config option `model` | later `config_option_update` → `model` |
| --- | --- | --- | --- |
| `gpt-5-mini` | `gpt-5-mini` | `gpt-5-mini` | `gpt-5.6-sol` |
| `claude-haiku-4.5` | `claude-haiku-4.5` | `claude-haiku-4.5` | `gpt-5.6-sol` |

**The pin is honoured**: the seat opens the conversation on the model it was
asked for, both times, and both turns returned.

**And the seat then sends a `config_option_update` whose `model.currentValue`
is neither pinned model.** One turn would have read as the seat silently
switching models mid-turn — a 0x model replaced by a 1x one — which is exactly
the failure session 144 built its apparatus to catch. Two turns settle it: the
value is `gpt-5.6-sol` in both, regardless of what was pinned, so it is the
seat's own configured default being re-broadcast and **not** the live session's
model.

Nothing in the router reads `config_option_update` today, so nothing is wrong
today. It is recorded because it is the only field on the seat's wire that
*looks* like served-model evidence and is not, and the next session that goes
looking for served-model evidence over the protocol will find it first.

**Not a defect — a reading, and a warning with a measurement behind it.**

**Disposition: raised as owed, as D275** (a note in the protocol walkthrough).

### 11 — `discovery drift` reports against a registry that no longer exists

```
drift: record against roles
  named in a role, in no record (0) -- these roles fall through to whatever else survives:
    (none)
  in a record, named in no role (202) -- these still qualify and simply sort last:
    …
    text-embedding-3-small  [api]
    tts-1-hd  [api]
    veo-3.1-generate-preview  [api]
    whisper-1  [api]
```

Two things are wrong and both follow from the registry's deletion. The first
half can now only ever be `(none)`, because roles no longer name models. And
the second half's sentence — *these still qualify and simply sort last* — is
false for most of the 202: `isChatModelId` exists precisely so that
embeddings, speech, image and video models are never offered, and drift lists
them as qualifying candidates.

**Minor. Framework.**

**Disposition: fixed here** — drift reports what the catalog can actually
offer, and stops claiming a diff against roles that name nothing.

---

## Reading 2 — the direct API, with Claude Code as the engine

The engine is walked as well as the transport because they constrain
different roles, and this is the pair the framework has never been walked on:
Claude Code authors, and the keys reach everything.

### 12 — The api block is scoped, complete, and honest about what it does not know

196 models under scope `{"providers": ["anthropic", "google", "openai"]}` —
11 Anthropic, 55 Google, 130 OpenAI. Every one of them carries `cost: null`
and `price_category: null`, because no vendor's models endpoint states a
price: *unknown is null and stays null*, and a number nobody stated is not
invented so that a column can be filled.

125 of the 196 survive into a reviewing role. The 71 that do not are the
embeddings, speech, image, video and moderation models, removed by the rule
over the id rather than by a curated list — which is the second inventory this
whole block of work deleted.

**And the engine does constrain the authoring list.** In this repository, with
a Claude Code session in flight, `configuration.authoring` reads engine
`claude-code` with **11 candidates, all Anthropic**, while
`configuration.primaryReviewer` reads **125 candidates across all three
providers**. That is precisely the shape the plan predicted and it holds.

**Not a finding.** Written down because it is half of what this session exists
to prove, and finding 8 is the other half: the filter is right and it only
applies once the ledger names an engine.

### 13 — The one-way door is not the seat's; it is the verb's

Finding 6, reproduced on the direct-API transport with a fresh preferences
file, transport `api`:

```
$ dabbler configure --reviewer-model claude-opus-4-7
configure: the Primary Reviewer is 'claude-opus-4-7'; it is used and never silently substituted

$ dabbler configure --reviewer-model claude-sonnet-4-6
dabbler configure: 'claude-sonnet-4-6' is not a model the api transport lists. It lists: claude-opus-4-7.
```

125 selectable models; the refusal names one. Identical text, identical cause,
identical exit code. **Finding 6 is transport-independent** — which is the
whole argument for this walk, made by the walk itself: the defect was found on
the seat and belongs to neither transport.

**Not a separate finding.** Recorded as the evidence that finding 6's fix must
be proved on both.

### 14 — Under Claude Code there is no authoring model, so the one surviving rule and the label that replaced the deleted ones are both inert

A Claude Code session records its orchestrator as

```
{"engine":"claude-code","provider":"anthropic","identityProvenance":"direct"}
```

— engine and provider, and **no model**, because Claude Code's `session start`
does not take one and the seat's does. Three things follow, and all three are
visible on this machine right now:

1. `orchestratorOf` returns `model: null`, so `configuration.authoring.chosen`
   is `null`. The pane's **Authoring AI → Model** leaf — session 155's new
   surface — is empty for the entire life of a Claude Code session.
2. `checkedModel` in `packages/router/src/cli/configure.ts` applies
   `reviewerRefusal` only when `author !== null`. With no authoring model,
   **the one rule this framework kept cannot fire at selection time.** A
   reviewer identical to the author is accepted here; what stops it is the
   assertion at the wire, which is where session 151 deliberately put it.
3. `candidateNode` computes `providerRelation` only when `authorProvider` is
   non-null, so every one of the 125 candidates carries
   `providerRelation: null`. The vocabulary session 151 introduced —
   `different provider`, `same provider`, `provider unknown` — **appears on no
   row on this machine, on either transport.** The pair the framework used to
   refuse, same provider and a different model, is accepted (`claude-opus-4-7`
   was selected against an Anthropic author without a word) but it is not
   *labelled*, and the label was the entire replacement for the refusal.

Item 3 is the same wound as finding 7 from the other side: there, no candidate
can ever *be* provider-unknown; here, no candidate can be labelled at all.

The author's **provider** is on the record and is enough to label every row,
which is what makes this fixable without asking Claude Code for a model
identifier it does not report.

**Major. Framework.**

**Disposition: fixed here** — the label is read from the author's provider,
which the ledger has, rather than from an author model that on this engine
never exists. What *cannot* be fixed here is item 2: the same-model refusal
genuinely needs a model identifier, and Claude Code does not declare one, so
the wire assertion remains the only place it can be made. Said plainly in the
pane rather than left to look like a check that happened.

### 15 — The same model may be chosen for both reviewing roles, and that guarantees a stopped adjudication

```
$ dabbler configure --reviewer-model claude-opus-4-7        → accepted
$ dabbler configure --auxiliary-model claude-opus-4-7       → accepted
configure: the Auxiliary Reviewer is 'claude-opus-4-7'; an adjudication still
excludes every provider that has already reviewed a round, and a selection it
excludes stops the round rather than being substituted
```

The message is true and it describes the trap it has just set. The Auxiliary
Reviewer is the third voice at an impasse — not the author and not the primary
— and at the adjudication every provider that has already reviewed is
excluded. The primary reviews round 1. So an auxiliary pinned to the primary's
own model is excluded at every adjudication that ever happens, and the
operator is told this in the abstract while being allowed to do it.

`configure`'s own header explains why the auxiliary's definition cannot be
checked between sessions: what separates it is *read at the round*. That is
right about the provider set and wrong about this one case — the primary's
selection is in the same preferences file, being written by the same command,
and "not the primary" is the one part of the role's definition that **is**
knowable between sessions.

**Minor. Framework.**

**Disposition: fixed here** — the auxiliary refuses the model the primary is
pinned to, by name, and says so where the operator is choosing rather than at
the round they will never reach.

### 16 — On this transport, the pin is honoured, and the record proves it

Every verification round writes `requested_model` and `served_model`. Across
sessions 120 to 155, **67 rounds on the api transport carry the pair and all
67 match.** Session 155's own two rounds read `gpt-5.6-terra` requested,
`gpt-5.6-terra` served, `orchestrator_provider: anthropic`,
`reviewer_provider: openai`.

**Not a finding.** This is the claim the block rests on, read off evidence
rather than off the selection, and on the direct-API path it holds. Finding 9
is the same question on the seat, where this repository's record cannot answer
it.

### 17 — The projection is re-derived by whichever router activated last, and the installed extension's is older than the tree's

This repository's `.dabbler/solution/projection.json`, as it stood when
session 156 started, carried six configuration keys:

```
transport, fidelityTransport, engines, authoring, primaryReviewer, records
```

Re-deriving it from this tree's own source produces seven — the seventh being
`auxiliaryReviewer`, session 155's new surface. The node is unconditional in
`packages/router/src/projection.ts`; nothing about this repository suppresses
it. What differs is **which build wrote the file**:

| build | knows `auxiliaryReviewer` |
| --- | --- |
| this tree's router, `packages/router/dist/dabbler.cjs` | yes |
| this tree's bundled extension router, `tools/dabbler-ai-orchestration/dist/dabbler.cjs` | no |
| the installed extension, `darndestdabbler.dabbler-ai-orchestration-2.1.3` | no |

Session 155 made `SolutionTreeProvider` derive the projection **at activation,
whatever is on disk**, and the reason it gives is exactly right in one
direction:

> It is a disk read the router already does, and it is what makes an extension
> upgrade show its own work.

The other direction is the one nobody wrote down. The deriver at activation is
the **extension's own bundled router**, and on any machine where the CLI is
newer than the installed extension — every machine building from this tree,
and every machine in the window between a tag and a Marketplace install — the
pane silently **downgrades** the projection the newer router wrote. A node the
CLI emits disappears from the file, and the pane then renders the absence
correctly, which is what makes it invisible.

*The one inference:* VS Code was not watched doing it. What is measured is
that the file on disk was last written by a build that cannot emit the node,
that the only other writer on this machine is the extension, and that session
155 made that writer run unconditionally at activation.

**Major. Framework** — lifecycle-timed, constant, and nobody's judgement.

**Disposition: raised as owed, as D276.** The repair is not small and is not this
session's: a projection carries no version, so a reader cannot tell an older
writer's output from a newer writer's, and deciding whether the extension
should derive at all — or derive only through a router at least as new as the
one that last wrote — is a design question, not a patch. Publishing 2.2.0 does
not make it worse: after the release the installed extension and the tree
agree again, which is precisely why it must be written down now rather than
after it stops being visible.

---

## Reading 3 — the two machines almost every reader actually has

This machine has both halves, which is what made readings 1 and 2 possible and
is also what makes it unrepresentative. So each half was taken away in turn.

**How each was simulated, and what the simulation does not prove.**

- **A seat with no provider keys.** `DABBLER_ANTHROPIC_API_KEY` and its two
  siblings removed from the environment, a catalog holding the seat block and
  no `api` block, and `DABBLER_TRANSPORT=copilot-cli`. *What it does not
  prove:* the seat itself is this machine's real seat, so nothing here tests a
  machine whose seat is unreachable or unauthenticated — only one whose keys
  are absent.
- **Provider keys with no seat.** A catalog holding *both* blocks, refreshed
  with `copilot` off `PATH` so the seat genuinely could not be read. *What it
  does not prove:* the keys are this machine's real keys, so a machine with
  one key rather than three is untested, and `copilot` being absent from
  `PATH` is not the same as an account with no Copilot entitlement — the
  framework cannot tell those apart and neither can this reading.

Neither simulation writes to the operator's own catalog or preferences: both
run against copies under a scratch path through `DABBLER_CATALOG_PATH` and
`DABBLER_PREFERENCES_PATH`.

### 18 — A seat with no provider keys resolves, and says nothing about keys it does not need

Every role on the seat transport: **21 candidates, `unavailable: null`**, the
enumeration named as `seat-catalog`, and the catalog row reading fresh.
`configure --reviewer-model claude-haiku-4.5` is accepted.

**Not a finding, and it is the one this reading existed to check.** Session 145
shipped a projection that read as though nothing resolved while the seat's
catalog was full, and 146 fixed it. It stays fixed, and it stays fixed with the
registry deleted underneath it — which is the part 146 could not have proved.

### 19 — Asked about the API path, the framework offers the seat's refresh command

On the machine with a seat and no keys, naming any model on the `api`
transport:

```
dabbler configure: 'claude-opus-5' cannot be checked: this machine has not read
its providers' model lists yet, or it holds a reading taken for a different set
of keys (`dabbler copilot refresh` reads them, free).
```

`dabbler copilot refresh` is a real verb and it does exactly one thing: re-read
**the seat's** model list. It does not read a single provider endpoint. So the
sentence's subject is the provider lists and its remedy is the seat's, and on
the machine that most needs the right answer — one with no api reading at all —
the operator is sent to the wrong transport.

The cause is one constant used for two branches: `roleReading` in
`packages/router/src/projection.ts` builds both the seat's message and the
api's from `REFRESH_COMMAND` in `packages/router/src/transports/copilot.ts`.
The seat branch is correct; `packages/router/src/discovery.ts` already exports
`CATALOG_REFRESH_COMMAND` for the other one, and the api branch does not use
it.

**Minor. Framework** — but on the first-run path, where a wrong remedy costs a
session rather than a minute.

**Disposition: fixed here.**

### 20 — One rule, two verbs, and only one of them is guarded

Side by side, in this session, on this machine:

```
$ dabbler discovery refresh
refresh: refused -- a session is in flight (session 156). Discovery runs between
sessions: a session that changes its own verifier pool while running has edited
the conditions of its own review.                                      (exit 2)

$ dabbler copilot refresh
the seat's list was recorded: 26 model(s) listed, 0 retired. Nothing was spent.
                                                                       (exit 0)
```

Both write the seat block of the same catalog. One is refused with a reason
about editing the conditions of your own review; the other does it and reports
success. The guard lives in `commandRefresh` in
`packages/router/src/cli/discovery.ts` and nowhere else, so the older verb
walks straight past it.

This is the repository's own ground rule — *one implementation of any rule* —
failing in the direction that matters: not a rule stated twice, but a rule
stated once and applied to one of its two doors. It is the same shape as
session 154's finding one layer over, where a suite with two doors had the gate
behind only one of them.

**Major. Framework.**

**Disposition: fixed here** — the refusal moves to where both verbs reach it.

### 21 — A machine with no seat leaves the seat's block exactly where it was

A catalog holding both blocks, refreshed with `copilot` off `PATH`:

```
discovery: the seat could not be read ('copilot' is not on PATH or failed --version);
the catalog stands as it was, and nothing was spent
discovery: the api block has been re-read -- 196 model(s) recorded, no tokens billed
```

Afterwards the seat block still holds its 26 models, its original
`refreshed_at` and its original scope, while the api block and the file's
`written_at` moved. **An unread transport is not an empty one**, which is the
property `writeBlock` was written for, holding under a real failure rather than
under a test double.

**Not a finding** — with one wrinkle worth a sentence rather than a number. The
closing line still reads *"has been re-read for every transport this machine
has"* when one of them demonstrably was not. The line above it says so plainly,
so nothing is concealed; the summary is simply claiming a little more than the
detail supports.

**Disposition: fixed here**, in the same pass as finding 19, since both are one
sentence each.
