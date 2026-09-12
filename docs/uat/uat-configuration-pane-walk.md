# What driving the Configuration section in a running editor found

*Session 158, 12 September 2026. Sessions 150 through 157 rebuilt what a
session is run with: one catalog read on the operator's own machine, two
participants instead of five mechanism-shaped rows, one resolution order for a
vehicle, and two verbs that answer "what could I choose" and "why is it this".
Every one of those sessions closed VERIFIED. Then the operator opened the pane
against the published 2.2.0 and three of its controls did nothing.*

*This page is the walk that should have happened before that release. Session
156 walked the same block — its own scope line says so — through the
projection, the verbs and the wire, and never opened the pane, so the entire
interaction layer shipped unwalked.*

*It is in the shape `docs/uat/uat-walk-findings.md` has: what was walked, what
was not and why, and what each finding is in the operator's terms —
**framework** (constant or parameterised, and lifecycle-timed), **UI**
(constant or parameterised, but optional or without a fixed moment), or
**person** (a judgement nobody should automate).*

## Who drove it

**A harness, not a hand, and the record says so** rather than claiming
something nobody can check. The readings marked *editor* were taken by
`tools/dabbler-ai-orchestration/src/test/playwright/configuration-pane.spec.ts`, which launches the same VS
Code binary an operator runs, loads this extension into it, and clicks: right-
clicks a row and reads the menu that opens, left-clicks a row and reads the
picker that opens, chooses an entry and reads the file it lands in. What a
harness cannot do is judge — it asserts what a menu *offers*, and a person
reading this page judges whether that is the right offer.

The readings marked *terminal* were taken by running the built router by hand
against scratch checkouts. They are the ones that are not interaction: a
refusal before a session exists, and what `configuration explain` prints.

## The machine this was walked on

| | |
| --- | --- |
| router | `dabbler-ai-router` 2.3.0, built from this tree |
| extension | loaded from this tree by `--extensionDevelopmentPath` |
| VS Code | 1.137.0, from `.vscode-test` |
| node | v25.8.1 |
| git | 2.51.0.windows.2 |
| Claude Code | 2.1.269 |
| catalog and preferences | files under each reading's own temp root, named through `DABBLER_CATALOG_PATH` and `DABBLER_PREFERENCES_PATH` |

**Nothing here read or wrote the operator's own catalog or preferences.** The
launched editor gets a scoped `LOCALAPPDATA`, `APPDATA` and `HOME`, and both
files are named explicitly on top of that, so a walk cannot pass by reading
the machine it happens to be running on.

## What was walked, and what was not

Walked: every Configuration row, right-clicked and left-clicked; what each
menu offers; what each picker offers; a model chosen and followed to disk and
back to the row; a committed vehicle this machine cannot reach, at the start
boundary; and what `configuration explain` says about the layers.

**Not walked, and why.** Three readings the plan named could not honestly be
taken here:

- **A session started on each engine, with the launch argv captured.**
  Starting one launches the real `claude` or `copilot` CLI, which bills. The
  argv is asserted instead at `engineTerminalFor`, which is the function VS
  Code is handed and the only thing between a chosen model and the process —
  `commandFlows.test.ts` holds it to carrying `--model` on both engines, to
  adding no flag when the model is empty, and to passing a dated id through
  unchanged. That is the whole of what the launch does with a model; what it
  does not prove is that the CLI then honours it, which is why an engine's
  refusal is read as a refusal (see step `refusal-is-a-refusal`) rather than
  assumed away.
- **The catalog refreshed with the pane watched, timing the repaint.** The
  refresh reaches three vendor endpoints and a seat. It costs nothing, but the
  reading is about *elapsed time in a pane*, and a harness measuring its own
  wait proves nothing a person would trust. What is proved instead is the
  mechanism: the command now waits for the verb to exit, invalidates the
  capability reading, repaints and says so once — including when the verb
  failed, because a half-finished refresh still moved the file.
- ***Set as my default* inherited by a fresh repository opened beside it.**
  Two editor windows over two workspaces, sharing one scoped user directory,
  is a harness arrangement this suite has never built. The inheritance is
  proved at the layer that decides it: `explainAuthoringModel` reports the
  checkout's committed setting as deciding and the personal default as
  shadowed, and with no committed setting the personal default decides.

## The readings

### 1 — the section draws two participants and five leaves *(editor)*

Configuration → *Authoring AI* (Vehicle, Model) and *Reviewing AI* (Vehicle,
Primary Model, Auxiliary Model). Every row rendered.

### 2 — right-clicking a participant row *(editor)*

**This is the defect the operator reported.** Against 2.2.0, right-clicking
*Authoring AI* or *Reviewing AI* did nothing at all: no `view/item/context`
entry matched `dabblerConfigParticipant;*`, and a context menu with no items
does not open.

It opens now, and carries the actions the leaves beneath it carry —
*Authoring AI* offers **Set the Authoring Vehicle** and **Set the Authoring
Model**; *Reviewing AI* offers **Set the Reviewing Vehicle**, **Set the
Primary Reviewer's Model** and **Set the Auxiliary Reviewer's Model**.

The reason it shipped green is worth more than the fix: the suite asserted
that every menu command was *declared*, and never that every row which should
be actionable *has* a menu. It asserts both directions now, over the tree
model's own row kinds against the manifest's `when` clauses.

### 3 — right-clicking each leaf *(editor)*

Both Vehicle rows offer their own setting and **Keep as My Default**. The
Configuration node offers **Update the Catalog**.

### 4 — left-clicking a Vehicle row *(editor)*

The picker opens and offers `claude-code` by name. A row whose whole purpose
is one action carries that action on the row: a control that has to be
discovered by right-clicking is a control most people never find.

### 5 — left-clicking the authoring Model row *(editor)*

The picker opens and offers the two Anthropic models the seeded catalog holds
and neither the OpenAI nor the Google one — because Claude Code runs Anthropic
models and nothing else. **This reading failed twice before it passed**, and
both failures were real: see findings 1 and 2.

### 6 — choosing a model *(editor)*

The chosen id lands in this checkout's own `.vscode/settings.json` as
`dabbler.authoringModel`, and the row repaints to show it without a reload.
Against 2.2.0 this control answered with a sentence telling the operator to go
and type a command, because `dabbler configure` had no `--authoring-model` and
never had.

### 7 — a committed vehicle this machine cannot reach *(terminal)*

A checkout whose `.vscode/settings.json` names `copilot-cli` on a machine with
no seat reading:

```
start: refused -- the vehicle 'copilot-cli' cannot be reached from this
machine: this machine's seat has not answered yet -- `dabbler discovery
refresh` asks it, free. Nothing was dispatched. It is in force because it was
chosen by .vscode\settings.json; `dabbler configure --transport <vehicle>`
writes this checkout's own choice, and `dabbler configuration explain` lists
every layer that named one.
```

Exit 2, and no `sessions.json` was written: the refusal is before the session
exists, which is the point of putting it at the start boundary.

### 8 — what decided each value *(terminal)*

`dabbler configuration explain` names the deciding layer and the ones it
shadows for every value. **This reading failed too**: see findings 3 and 4.

## What the walk found

Five findings, all five fixed in this session. Three of them were in code
this session had already written, which is the argument for walking before
releasing rather than after.

### Finding 1 — the authoring row said "nothing resolves" where four models did · **UI, constant** · FIXED

The Model row read `nothing resolves` on a machine holding four models it
could author with. The authoring role has no preference order — a model there
is chosen or it is not — so a null `chosen` means *nobody has picked*, and
reading that as a fault is the pane reporting a problem where there is a
choice waiting to be made. A reviewing role does resolve its own head, so a
null `chosen` there really is nothing resolving and the word stands.

**Fixed** in `solutionTreeModel.ts`: the authoring row says `not chosen` where
it has candidates and nobody picked, and keeps `nothing resolves` for an empty
list. Covered in `solutionTreeModel.test.ts`, both roles.

### Finding 2 — a finished session's engine narrowed the list for the next one · **framework, constant** · FIXED

`orchestratorOf` fell back to the LAST session's orchestrator when none was in
flight. A completed session's identity is a fact about *that* session, so
after a close the pane went on narrowing the authoring list by an engine that
had finished running — and where that engine was one this framework cannot map
to a vendor, every model in the catalog was offered to Claude Code while the
Vehicle leaf directly above it read `claude-code` from the operator's own
preference.

Two leaves of one node, read from two places, disagreeing: the exact shape
sessions 131 and 132 were about, back through another door.

**Fixed** in `projection.ts`: the in-flight session and no other; where none is
in flight, the operator's own choice decides, which is what the Vehicle leaf
was already doing. Covered in `projection.test.ts`.

### Finding 3 — a reading answered about the wrong repository · **framework, constant** · FIXED

`configurationNode` read the machine vehicle and the reviewing vehicle with no
root, so both fell back to whichever repository this process was standing in.
A reading taken for repository B therefore reported repository A's vehicle and
named A's layer as the one that decided — in the verb whose entire job is
answering *why is it this*.

On this walk it printed `machine vehicle: copilot-cli (decided by
transport.profile)` for a checkout whose committed settings said `api`.

Session 157's round 3 found this shape in the round's ladder and fixed it
there; it survived here, in the reading the pane and `configuration explain`
both render.

**Fixed** in `projection.ts`: both readings are scoped to the root they were
asked about. Covered in `configuration.test.ts`, by asking about a second
checkout from inside the first.

### Finding 4 — `explain` said nobody chose the model they had just chosen · **UI, constant** · FIXED

`Authoring AI model: claude-opus-5 (nobody chose one, so the preference order
decides)` — two false sentences on one line. The authoring role carries no
`selected` field and has no preference order at all; its choice is this
checkout's setting or this person's default, and `chosen` reports it.

**Fixed** in `packages/router/src/cli/configuration.ts`: the authoring line says either that the
operator chose it and it is what the CLI is launched on, or that nobody has
and the engine's own default runs with no `--model` passed. Covered in
`configuration.test.ts`.

### Finding 5 — a seat session's author had no provider, so no row could be labelled · **framework, constant** · FIXED

Caught by the suite rather than by the pane, as a consequence of reading the
authoring list for the ENGINE: under a Copilot seat that list is the seat's
own, and on a machine whose seat has not answered it is empty — so the
authoring model's provider could not be read off the catalog, the engine could
not supply one (a seat fronts many providers), and the cross-provider label
rendered on no row at all.

The ledger has carried the provider since `session start` registered the
session, and nothing was reading it.

**Fixed** in `packages/router/src/projection.ts`: the catalog's word for the
chosen model first, then the ledger's own, then the engine's — which is the
order of what each one actually knows.

## One thing the walk did NOT find, and it is worth saying

Reading 5 failed a third time, and that failure was **not** a product defect:
the first attempt selected the wrong row, because this fixture's one module is
also called `model` and `filter({hasText: "Model"})` matched the module row —
whose click correctly does nothing. A selector that can resolve to the wrong
row makes a passing assertion mean nothing and a failing one mean less, so the
spec names the authoring row by its own text and says why.

## What verification round 1 found that the walk did not

Two blocking findings, both correct, both fixed. They are recorded here
because they are about the same surface and a reader of this page should not
have to find them somewhere else.

- **The launch was the other door, and it was open.** `session start`
  revalidates a configured model before anything is billed; the Start box
  takes free text, and the terminal it opens belongs to the person, so
  nothing in that window can read what their CLI prints. A stale id, a seat
  id typed under Claude Code or a plain typo therefore produced a CLI that
  printed one warning line and carried on with a model nobody chose, while
  the ledger recorded the one they named. The launch now checks the model
  against the engine's own list first, by the same rule and against the same
  list the pane offers — refusing on knowledge, never on its absence. What it
  still cannot close, and this is the honest limit: Claude Code validates
  against its own BUNDLED catalog, so a model a vendor serves and this
  machine has read can still be one the installed CLI does not know. Only the
  launch finds that out, and only by spending a turn.

  **Round 2 was not satisfied by that, and it was right.** A list this
  machine read cannot stand in for the CLI's own catalog, and the finding
  asked for the marker itself. Measured on 2026-09-12: `claude -p --model
  <id>` with **no prompt** validates the id against its own bundled catalog,
  complains on stderr, and then stops because it was given nothing to do —
  so the known-model case sends nothing and costs nothing, and the unknown
  one is named by the CLI itself. That is now a pre-flight before both
  interactive launches, and it is the only thing that can answer the
  question: a model your machine has read about can still be one this build
  of Claude Code has never heard of.

  What it answers with when it cannot answer is null — no CLI installed, no
  reply, an engine with no pre-flight — and null means *it did not refuse*.
  None of those may stand between an operator and their work. The Copilot
  seat has no pre-flight and needs none: it refuses an unknown model with
  exit 1 before any billed call, which their own terminal shows them.
- **A `--model` typed at `session start` was not the author the reviewers
  were measured against.** The reviewing roles were resolved against whatever
  the checkout had configured, so the one rule a reviewer is held to — that it
  may not be the author — was applied against the wrong author, and naming a
  reviewer's own model on that call went through.

## Raised, not fixed here

**`resolveOrchestratorIdentity` still sends an operator to a registry that was
deleted.** A Copilot seat whose model this machine's catalog does not list is
refused with *"does not resolve in the model registry ... Re-run start_session
with a registry-known `--model`"*. The resolution itself is correct and reads
the catalog; the words are session 151's leftovers, and they send a reader
looking for a file that no longer exists. It is one sentence in
`identity.ts`, it is outside every step this session declared, and it is the
kind of thing a session that is already four findings deep should raise rather
than reach for. Met while driving reading 2 of the model-evidence step.
