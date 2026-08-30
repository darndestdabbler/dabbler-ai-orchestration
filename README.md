# dabbler-ai-router

A framework for AI-led coding sessions. Work is numbered directly in the
repository: one session at a time, each with a plan that lists its steps. A
router dispatches model calls across providers by **role**, with escalation
and token accounting. Every session must pass **cross-provider
verification** before it can close, and the verification record is
machine-written: no code path accepts a hand-written verdict.

There is one implementation, in TypeScript, and it runs two ways:

- **`dabbler` — the command** an orchestrating engine runs from a terminal:
  the session lifecycle, the verification loop, the record, the six-step
  workflow. `npm i -g dabbler-ai-router`, or nothing at all inside VS Code
  (below).
- **VS Code extension "Dabbler AI Orchestration"** — the Work Explorer
  tree: one row per repository, its numbered sessions beneath it, and the
  in-flight session's steps beneath that. It bundles the router and calls
  it in-process, so a project installs nothing and the tree and the
  terminal cannot disagree about what the record says.

## How a session runs

1. `dabbler session start` registers the session in `sessions.json` and
   seeds the plan's step list into `activity-log.json`, once.
2. The orchestrating AI (Claude Code, Codex, Copilot, Gemini — any engine
   that reads `AGENTS.md` or the `CLAUDE.md`/`GEMINI.md` that import it)
   does the work.
3. `dabbler verify` runs the verification loop **before commit**: round 1
   reviews the full working-tree diff; rounds ≥ 2 review only the fix
   delta. The verifier is always a different provider than the
   orchestrator. Rounds append to a machine-only ledger under
   `.dabbler/runs/`. A contested blocking finding has a sanctioned exit
   ladder instead of an impasse: `verify dispute` records an
   evidence-backed rebuttal the next round must engage, and `verify
   adjudicate` routes recorded disputes to a third provider that neither
   orchestrated nor verified. At the round cap the loop ends itself:
   **remediated at the cap** when every blocking finding was fixed and the
   cap left the fix unreviewed (the work lands, labelled unreviewed),
   **unresolved** when findings still stand (nothing lands but the
   record). There is no waiver and no verdict a person can type.
4. `dabbler session close` runs five gates — verification clean, working
   tree clean, pushed to remote, test run fresh, verdict vocabulary — then
   flips the state. The verification gate reads the ledger; there is no
   stamp, no override, no hand-writable record.

See [docs/quick-start.md](docs/quick-start.md) for the full walkthrough.

## Install

Install the VS Code extension and a project needs nothing else:

```
code --install-extension dabbler-ai-orchestration-2.0.0.vsix
```

The extension puts `dabbler` on the integrated terminal's PATH, run on the
editor's own Node — no runtime to install, no virtual environment, no
global package. Outside VS Code, or for a commit made from the Source
Control panel (whose git does not inherit the terminal's environment):

```
npm i -g dabbler-ai-router
```

Node 22.18 or newer. The extension requires VS Code 1.135 or newer, which
is the earliest release measured to carry an extension host with an
unflagged `node:sqlite` — the seat-cost reader needs it.

## The repository's artifacts

A repository's sessions live under `docs/sessions/`, and it carries
exactly four artifacts:

| Artifact | Written by | Purpose |
|---|---|---|
| `session-plan.md` | decomposition session (human-reviewed) | the plan: sessions and their steps |
| `sessions.json` | the router only | the numbered session ledger, schema v5 |
| `activity-log.json` | the router only | per-step progress log |
| `change-log.md` | the router (appends) | human-readable summary blocks per session |

Verification round records live **outside the working tree** at
`.dabbler/runs/s<N>/rounds.jsonl` (gitignored, machine-written only), and
routed-call metrics append to `router-metrics.jsonl`. Field by field
detail: [docs/schema-reference.md](docs/schema-reference.md).

## Transports

Both transports are first-class for every call type:

- **GitHub Copilot CLI** — dispatches through a Copilot seat; models come
  from a probed catalog lockfile. Calls are real spend and are not
  attributable per session, so metrics rows carry
  `billed_usage_unavailable: true` and seat spend is measured afterwards
  by `dabbler seat-cost` from the CLI's local usage store.
- **Direct API** — Anthropic, OpenAI, and Google, over their HTTP APIs.

**Dollars are not computed on either path.** Tokens are recorded per call,
per model and per session; reconciliation happens out of band against the
vendor's own console, joined by the API key a repository names as its own.

Verification may cross transports: an orchestrator on the direct API can be
verified through the Copilot CLI on another provider's model, and vice
versa. The provider-independence rule (verifier provider ≠ orchestrator
provider) holds on both paths, and is asserted at the call site rather than
only filtered during selection.

### Selection is by role

A role declares the provider set it may draw from — a hard filter — and a
preference order, which is **ordering only**. A model the preference order
does not name still qualifies and simply sorts after the named ones, so a
list that has gone stale costs a slightly older model and never costs a
candidate. Roles are declared once under `roles:` in `router-config.yaml`
and applied identically on both transports.

### Model discovery

A role says what a verifier may be; a discovery record says what currently
exists. There are two records because there are two mechanisms:

- **Direct API — enumeration.** `dabbler discovery enumerate` reads each
  vendor's models endpoint and writes `.dabbler/api-models.lock`. A models
  endpoint is a metadata request and **bills no tokens on any of the three
  vendors**, so the default 24-hour cadence is a freshness preference
  rather than a budget control. The record is derived from whichever key
  set is present, so it lives outside the package and is neither committed
  nor shipped — unlike the seat catalog, which belongs to the
  distribution.
- **Copilot seat — empirical probe.** The CLI has no list-models command,
  so its catalog is a maintained candidate universe confirmed by
  `dabbler copilot refresh`. That does cost premium requests, which is why
  its staleness threshold is far longer.

`dabbler discovery status` reports both records' ages — **the API record is
aged against its stalest enabled vendor**, so one vendor answering never
dates the whole file while another's key is expired. `dabbler discovery
drift` reports the gap between the records and the roles — models in a
record that no role ranks, and models a role ranks that no record carries.
**The gap is reported, never closed silently:** ranking one model above
another is a judgment metadata cannot make, so a model may propose an
ordering, enumeration or a probe confirms it, and the writer records it.
Nothing is enabled by a name.

**What a vendor stops reporting becomes unknown, never unsupported.**
Vendors report unequally, and a hard capability filter would disqualify
every model from the quietest vendor and end cross-vendor verification by
accident. Capability metadata ranks; it never filters.

**Enumeration refuses to run while a session is in flight**, and a stale
record only ever warns — `session start` prints the warning and names the
invocation. A session that changed its own verifier pool mid-run would have
edited the conditions of its own review, and a maintenance signal that can
cause an outage is a maintenance signal that gets suppressed.

### Transport preference

Resolved in this precedence (first set wins):

1. an explicit `--transport api|copilot-cli` flag
   (`dabbler verify --transport …`)
2. the `DABBLER_TRANSPORT` env var (`api` | `copilot-cli`) — the
   operator's standing preference
3. `transport.profile` in the loaded config — the packaged
   `router-config.yaml`, with the repository's tracked `dabbler.yaml`
   and then a machine-local `local-overrides.yaml` deep-merged over it
4. default: `api`

Both layers are config *sources*, not precedence tiers: they change what
tier 3 says and nothing above it.

`dabbler.yaml` is the repository's own, and it is **tracked**. It carries
`testing` (suites, controls, selection rules), `packaging` and `paths` —
the facts CI and the next machine have to read, behind a `schema_version`.
Providers, models and roles stay in the packaged config: those are
distribution facts, and a repository declaring how to run `mvn -q test`
must not have to fork the model registry to do it.

`local-overrides.yaml` is machine facts only. It lives at the project
root, carries only the keys it changes, and is never committed and never
packaged — `.gitignore` reserves the name and it is not package data. A key
the schema does not declare is **refused at load**, not dropped, because an
override the router silently ignores is the failure the file exists to
prevent; and a key the repository owns is refused by name, because a suite
command from a gitignored file would be attributed by the run of record to
a repository that never declared it.

This is how a machine disagrees with the published default. The packaged
`router-config.yaml` ships `transport: profile: copilot-cli`, because the
seat is the surface staff receive; a machine with provider API keys and no
seat says so once, in a file it does not publish:

```yaml
# local-overrides.yaml — this machine has API keys and no Copilot seat
transport:
  profile: api
```

Config is the only layer that is client-, model- and transport-
independent. The env var reaches only processes started after it was
written; `--transport` has to be repeated on every command; and instruction
files are read by some clients and not others.

This selects the transport for routine dispatch; verifier selection may
still use the other transport when provider independence requires it.

## Credentials

API keys are resolved from environment variables only — never from config
files, never logged:

| Provider | Env var |
|---|---|
| Anthropic | `DABBLER_ANTHROPIC_API_KEY` |
| OpenAI | `DABBLER_OPENAI_API_KEY` |
| Google | `DABBLER_GEMINI_API_KEY` |

A provider whose key does not resolve is simply not a candidate — the
router selects among the providers that have keys (or the Copilot seat, on
that transport). An empty-string value counts as absent.

## Library use

The package exports the router's contract and one implementation of it, and
nothing behind it. A caller asks a `Router` for an answer:

```ts
import { createInProcessRouter } from "dabbler-ai-router";

const router = createInProcessRouter();
const projection = await router.progress({ repoRoot: process.cwd() });
if (projection.ok) console.log(projection.value.sessions.length);
```

`dabbler metrics` prints the token report (per model, per task type, per
session). Seat rows name the conversation id that prices them; no row is
presented as a dollar figure.

## Layout

```
packages/router/          the router: the dabbler command and the library
packages/router/schemas/  JSON Schemas: the session ledger, the round record
packages/router/prompt-templates/  system/task/verification prompts
tools/dabbler-ai-orchestration/    the VS Code extension
docs/                     quick-start and schema reference
```

Migrating a project from v1? See
[MIGRATION-FROM-V1.md](MIGRATION-FROM-V1.md) — the short version is:
nothing to migrate.
