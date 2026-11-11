# The Configuration

Which AI writes the code, which models review it, and how each one is
reached are choices a person makes, in one place: the **Configuration**
section of the Solution Explorer. Every choice is the repository's own and
travels with it to the next clone. The machine keeps only a default for a
repository that has made none.

This page goes through the section row by row, says where each choice is
kept and which layer wins, and says what each way of reaching a model
needs. *See it:* `dabbler configuration explain` names, for every value,
the layer that decided it and the ones it shadows; `dabbler configuration
options` lists what could be chosen and whether this machine can reach it.

![The Configuration section of the Solution Explorer with every row open.
Authoring AI: claude-code and claude-sonnet-5-5, with its Vehicle
(claude-code, machine default), Authoring Model (this repository), Mechanic
Model and Mechanic (unattended). Reviewing AI: api and gpt-5.6-terra, with
its Vehicle (api, this repository), Primary Model (openai) and Auxiliary
Model (google). API Keys: 3 of 3 available, one row per
provider.](media/configuration.png)

## The rows

The Configuration row itself sums up the engine and the reviewing vehicle.
Each row below it says its value and, after it, which layer decided it:
*this repository* or *machine default*. Every row that holds a choice has
an edit button that sets it for this repository.

**Authoring AI** is the AI that does the session's work.

- **Vehicle** is the engine: the CLI the session opens in a terminal for
  you, `claude-code` (Claude Code) or `copilot` (GitHub Copilot CLI). It
  is the AI you talk to while the session runs.
- **Authoring Model** is the model that engine is launched on. The list is
  the engine's own models. Once a session is in flight the row reports
  that session's model and refuses a change.
- **Mechanic Model** is the model a [Mechanic](consult-and-mechanic.md)
  is opened on, on the same engine. Unset, it is the Authoring Model. It
  is never the Primary Reviewer's model.
- **Mechanic** is the delegation: `unattended` (the default) lets the
  framework call the Mechanic in on a stop without you; `attended` only
  names it among a stop's ways on, for you to open; `off` names it
  nowhere.

**Reviewing AI** is the pair of models that judge the work.

- **Vehicle** is how both reviewers are reached, `api` or `copilot-cli`.
  The two reviewing roles share one vehicle because they differ in which
  providers they may not be, not in how they are reached.
- **Primary Model** reviews every round. It may not be the Authoring
  Model. A model from the author's own provider is labelled as such and
  accepted, but a session with that author will not start, because review
  is always from a different provider.
- **Auxiliary Model** settles a disputed finding. A round excludes every
  provider that has already reviewed it, and a choice the round excludes is
  a stop, never a quiet substitute.

**API Keys** has one row per provider and says whether a key is available
for it. Clicking a key's row stores one (*Credentials*, below).

The catalog the model lists come from is refreshed from the Configuration
row's **Update the Catalog** action. See *Where the model lists come from*,
below.

## Where each choice is kept, and which wins

The same layers are read for every choice, in this order, and the first
that names a value decides:

1. a flag typed on the command, for that one call;
2. this checkout's `.vscode/settings.json`, which is committed;
3. this machine's `preferences.json`, in the platform's per-user data
   directory (on Windows, `%LOCALAPPDATA%\dabbler`);
4. the configuration the distribution ships;
5. for a vehicle, `api`.

The reviewing vehicle is read the same way from its own setting first, and
falls back to the machine's vehicle where nothing names one.

The edit buttons, and `dabbler configure`, write layer 2. Because the file
is committed, a choice travels to everyone who clones the repository, and
one window's choice does not change another repository's. Where the
machine has no default yet, the first choice also becomes the machine's.
`dabbler configure --mine` writes the machine's default and nothing else.

A choice is used, or it is refused; it is never silently replaced. A model
this machine's seat or keys cannot reach is a stop at `session start` that
names the file that chose it and the command that changes it.

`DABBLER_TRANSPORT` and a `transport.profile` line in
`local-overrides.yaml` are both retired, and nothing reads either. If the
variable is still set in your environment, unset it. The override file's
line refuses, and names the one command that moves it: `dabbler configure
--transport <vehicle>`.

## Keep as Machine Default, and a different model for one session

**Keep as Machine Default** is on every row that holds a choice: both
Vehicle rows, the Authoring Model and both reviewers' models. It makes the
row's current value this machine's default, for every repository here that
names none of its own. The repository's own choice is left as it was, and
nobody else's machine is touched.

**Start Session with Different Models** is on a planned session's menu
beside Start Session. It asks for an engine and a model for that one
session and writes neither down, so the Configuration is as it was
afterwards.

## The two vehicles

A vehicle is how a role reaches its model.

- **A Copilot seat** (`copilot-cli` for the reviewers, `copilot` as the
  engine) needs the GitHub Copilot CLI installed and signed in to a seat.
  It is billed in AI credits, per token. `dabbler seat-cost` reads what a
  session actually spent. On Windows, install the CLI with
  `winget install GitHub.Copilot`: the npm install's `.cmd` shim cuts a
  prompt off at its first line break.
- **Direct API keys** (`api`) reach each provider's own endpoint and are
  billed by that provider in tokens. A role reached this way needs a key
  for its provider; see *Credentials*, below.

A vehicle nothing on this machine can reach is listed by `dabbler
configuration options` with the reason, and is not offered in the pane.

## Where the model lists come from, and what they cost

Nothing. Every list is read from a vendor's own metadata, and no prompt is
sent:

- the direct-API list is read from each provider's model-list endpoint;
- the Copilot seat's list is the one the seat returns when a conversation
  is opened, with each model's cost;
- the Claude Code CLI has no list command, so the Anthropic key's model
  list stands in for it. Claude Code itself is the authority, and refuses a
  model its own catalog does not describe. With no Anthropic key, `opus`,
  `sonnet` and `haiku` are always offered.

What was read is kept in one file per machine, `ai-model-catalog.json`, in
the same per-user data directory as `preferences.json`. It describes this
machine's seat and keys, so a block recorded for another account or key set
is treated as unread. **Update the Catalog**, or `dabbler discovery
refresh` in a terminal, reads it again. Neither runs while a session is in
flight, because changing the reviewer pool partway through a session would
change the conditions of its own review.

## Credentials

A key is never written to a file in the repository, never put in a
setting, and never printed. There are two places one can be:

- **An environment variable**: `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY` or `DABBLER_GEMINI_API_KEY`.
- **This machine's credential store.** Clicking a key's row (**Store a Key
  on This Machine**) runs
  `dabbler auth set <provider>` in a terminal, which asks for the key with
  the echo off and hands it to the platform's own store. `dabbler auth
  set <provider> --from-env` takes it from the variable instead. `dabbler
  auth list` names what is stored and never shows a value. A stored key is
  used where configuration names it, which `dabbler configure --credential
  <provider>=<name>` does with a name and never a key. A key named this way
  is used ahead of the environment variable.

`dabbler configuration explain` says where each provider's key was found,
by name.
