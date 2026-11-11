# Dabbler AI Orchestration

## AI writes the code. The framework holds it to the rules.

Install the VS Code extension from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DarndestDabbler.dabbler-ai-orchestration).

![One VS Code window with a session in flight on csv-parser-dotnet. On the left, the Dabbler panel: the Solution Explorer with the repository's five projects and its Configuration (claude-code, api), and under it the Work Explorer at 4 of 7 sessions, session 005 "CSV deserialization" in progress with Register and Plan ticked, Work open on its three steps, and Verify, Test and Close still to come; sessions 006 and 007 not started. In the middle, Claude Code's own terminal writing the code. On the right, the Dabbler terminal: session 004 closed, then session 005's plan and each step the framework handed the engine, timed to the second.](tools/dabbler-ai-orchestration/media/overview.png)

Dabbler lets an AI write the code and keeps everything else out of its
hands. The framework, which is ordinary code that does the same thing every
time, hands the AI one instruction at a time, runs the checks and the tests itself, has a
model from another provider review the work, and commits only what passed.
And it does every session the same way, whichever model writes it, so that
the plan, the record and the reasons stay in the repository after the
conversation that produced them is gone.

| Risk | What Dabbler does |
|---|---|
| AI's work is a black box | The framework shows the work as it happens and leaves a plan, a log, the decisions and a transcript in the repository. ([The record](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/the-record.md#under-the-sessions-root-committed-with-the-code)) |
| AI's work is not adequately evaluated | A model from a different provider reviews every session. The two work through findings and fixes, up to seven rounds, without a person. ([Two models](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#findings-fixes-and-disputes)) |
| AI cheats in its work | The framework, not the AI, runs the checks, the tests, the reviews and the commits, and records a SHA-256 hash of the code it checked, so a passing result cannot be claimed for code that changed afterwards. An AI cannot easily cheat, and each way around the rules that turns up is closed with a new automatic check. ([The rules](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/discipline.md#the-framework-measures-the-work-not-the-report)) |
| AI does more than it is asked | Reviewers judge the work against what the plan says the session will and will not do. Out-of-scope work that AI does anyway is blocked by the framework. ([What the reviewer is sent](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#what-the-reviewer-is-sent)) |
| Untested code gets committed | The framework runs the automated tests before any code is committed, and the reviewer is shown every changed file that has no test. ([Tests](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#what-the-reviewer-is-asked-about-tests)) |
| A session gets stuck | A person can ask another AI what went wrong (**Consult with AI**), let a fresh AI make the smallest fix (the **Mechanic**), or decide for themselves, and the decision is recorded. ([When it gets stuck](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/consult-and-mechanic.md)) |
| Only the AI that did the work can continue it | Every session is planned, run and recorded the same way, whichever model writes it. A person or a different model starts the next session from the plan and the record in the repository, the next day or the next year. ([Picking the work up](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/the-record.md#picking-the-work-up)) |

---

## Install

Install **Dabbler AI Orchestration** from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=DarndestDabbler.dabbler-ai-orchestration),
or search for it in VS Code's Extensions view. It needs VS Code 1.135 or
newer and nothing else: the framework ships inside the extension and runs
on the editor's own Node, and a VS Code terminal has the `dabbler` command
on its PATH. The listing says what else a session needs: an AI coding tool
you run from the command line to write the code, and access to models from
two different AI companies to review it.

## The guide

Each page takes one claim made above and shows the mechanism behind it.
The index is [docs/guide/](docs/guide/README.md).

- [The rules an AI works inside](docs/guide/discipline.md)
- [Two models from different providers](docs/guide/verification.md)
- [What is written down, and where](docs/guide/the-record.md)
- [Consult with AI, and the Mechanic](docs/guide/consult-and-mechanic.md)
- [The Configuration](docs/guide/configuration.md)

The reference is [Driving a session](docs/driving-a-session.md): how a
session runs, what comes back, an existing repository, when the framework
stops, and the Work Explorer. The [quick start](docs/quick-start.md) is the
workflow command by command, the
[schema reference](docs/schema-reference.md) is the files on disk, and two
walkthroughs build a small solution end to end, in
[.NET](docs/uat/uat-dotnet-json-solution.md) and
[Java](docs/uat/uat-java-json-solution.md).

## This repository

There is one implementation, in TypeScript: the router under
`packages/router`, published as the npm package `dabbler-ai-router` with a
`dabbler` command, and the VS Code extension under `tools/`, which bundles
the router and calls it in-process.

### Layout

```
packages/router/          the router: the dabbler command and the library
packages/router/schemas/  JSON Schemas: the session ledger, the round record
packages/router/prompt-templates/  system/task/verification prompts
tools/dabbler-ai-orchestration/    the VS Code extension
docs/guide/               the guide the front pages link to
docs/sessions/            this repository's own session plan and record
docs/                     driving a session, quick start, schema reference
```

### Building from source

Node 22.18 or newer.

- Install and build: `npm install`, then `npm run build`
- Unit tests, every workspace: `npm test`
- Package the extension: `npm run package -w dabbler-ai-orchestration`
- Run the router by hand: `node packages/router/dist/dabbler.cjs <verb>`

### Library use

The package exports the router's contract and one implementation of it, and
nothing behind it. A caller asks a `Router` for an answer:

```ts
import { createInProcessRouter } from "dabbler-ai-router";

const router = createInProcessRouter();
const projection = await router.progress({ repoRoot: process.cwd() });
if (projection.ok) console.log(projection.value.sessions.length);
```

Migrating a project from v1? See
[MIGRATION-FROM-V1.md](MIGRATION-FROM-V1.md); the short version is that
there is nothing to migrate.

MIT licensed.
