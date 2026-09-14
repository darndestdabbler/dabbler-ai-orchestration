#!/usr/bin/env node
// Renders docs/tutorials/csv-solution/csv-multi-module-walkthrough.md.
//
// "Look at what you built" -- the one section that claims to show what the
// product actually does on screen -- is rendered from
// src/test/playwright/csvWalkSteps.ts's WALK_STEPS: the same list
// csv-module-walk.spec.ts drives against a real VS Code, asserting the same
// `expect` sentences this script prints. Everything around it is prose,
// each command verified by hand against the staged corpus (see the session
// record); it is not automated because it is not what csv-module-walk.spec.ts
// tests -- declaring modules and asking what a change reaches are commands a
// person runs in their own terminal, not surfaces a screenshot proves.
//
// Run with no arguments; it prints the whole document to stdout. Nothing
// here is random or timestamped, so running it twice produces identical
// bytes -- which is what lets a mechanical check catch the document
// drifting from this script instead of trusting that nobody hand-edited it
// afterward.

import { WALK_STEPS } from "../src/test/playwright/csvWalkSteps.ts";

const SHOT = (name) => `media/${name}.png`;

// One screenshot per WALK_STEPS entry, in the same order -- the names
// csv-module-walk.spec.ts's ctx.shoot() calls write, so this is not a
// second place that names them.
const SHOTS = ["01-solution-opened", "02-decomposition", "03-work-planned", "04-two-terminals"];

function renderWalkStep(step, shotName) {
  const lines = [`### ${step.title}`, ""];
  lines.push(...step.operator, "");
  lines.push("**You should see:**", "");
  lines.push(...step.expect.map((line) => `- ${line}`), "");
  lines.push(`![${step.title}](${SHOT(shotName)})`, "");
  return lines.join("\n");
}

const walkSection = WALK_STEPS.map((step, i) => renderWalkStep(step, SHOTS[i])).join("\n");

const doc = `# Building the CSV solution: four modules, one repository

You are going to build a .NET solution that watches a folder for CSV files,
reads each one into \`Person\` objects, and stores them in a database. You will
build it as **four modules**, because that is the unit this framework works in:
one module is one developer's unit of work, and a session names the modules it
touches.

| Module | Kind | What it is | Package |
| --- | --- | --- | --- |
| \`model\` | shared-types | The \`Person\` type every other module references | \`CsvModel\` |
| \`deserializer\` | library | CSV text into \`Person\` objects | \`CsvDeserializer\` |
| \`persister\` | library | \`Person\` objects into a database | \`CsvPersister\` |
| \`app\` | application | Watches the folder and composes the other three | \`CsvWatcher\` |

**A sibling is a project reference.** Each module's project references the
projects of the modules it depends on, and one solution file at the root lists
all four, so \`dotnet test\` there builds and tests the whole solution in one
pass.

**\`examples/csv-walkthrough/\` is not this tutorial.** It is Python, built on
the six-step component workflow session 100 deleted, and this document
supersedes it.

Everything below is what you type or click. The framework does the rest.

---

## Before you start

You need .NET 10 or newer, git, and VS Code with the Dabbler extension
installed. Check the SDK:

\`\`\`
dotnet --list-sdks
\`\`\`

The \`dabbler\` command is on \`PATH\` in any VS Code terminal once the extension
has installed its shim. Everywhere else, run
\`node "<extension dir>/dist/dabbler.cjs" <verb>\`. If you see
"dabbler: command not found", that is a \`PATH\` problem, not a keys problem.

---

## 1. Set the repository up

Make an empty folder, open it in VS Code, and click **Set Up New Project** in
the Solution Explorer. It runs \`git init\` and then \`dabbler bootstrap\`.

**You should see:** the Solution Explorer changes from its welcome text to a
repository row, and \`docs/sessions/session-plan.md\` appears.

---

## 2. Declare the four modules

Use **New Module** on the Work Explorer's title bar, once per module. It asks
four questions: the slug, the display title, the kind, and what it depends on.

Or declare them from a terminal, which is faster for four:

\`\`\`
dabbler modules create . --slug model         --title "Person model"        --kind shared-types --code-root modules/model         --package CsvModel
dabbler modules create . --slug deserializer  --title "CSV deserializer"    --kind library      --code-root modules/deserializer  --package CsvDeserializer --depends-on model
dabbler modules create . --slug persister     --title "Person persistence"  --kind library      --code-root modules/persister     --package CsvPersister    --depends-on model
dabbler modules create . --slug app           --title "CSV watcher"         --kind application  --code-root modules/app           --package CsvWatcher      --depends-on model --depends-on deserializer --depends-on persister
\`\`\`

Check what was declared:

\`\`\`
dabbler modules show .
\`\`\`

**You should see:** \`"multi": true\`, four modules, and \`usedBy\` filled in for
\`model\` even though you never typed it. \`dependsOn\` is the only direction
anyone writes; who depends on a module is **derived**, because two directions
kept by hand disagree eventually and the disagreement is silent.

> **The manifest rejects an unknown key rather than ignoring it.** The keys are
> \`slug\`, \`title\`, \`planPath\`, \`codeRoots\`, \`touches\`, \`specSections\`,
> \`contextAssets\`, \`kind\`, \`dependsOn\`, \`package\`.

When the manifest becomes multi-module and a module already holds a project
file, the framework writes the root build files where they are absent and
**never rewrites them**: a solution file listing the modules' projects,
\`Directory.Build.props\` and \`Directory.Build.targets\`, with \`bin/\` and
\`obj/\` added to \`.gitignore\`. Declared before any code, as here, the modules
get none yet: the framework writes them once the first session's work is done,
before it is verified.

**A shortcut for a quick look, rather than typing all four \`modules create\`
calls:** \`node tools/dabbler-ai-orchestration/scripts/stage-csv-solution.mjs
--root <a folder under C:/temp> --reset\` writes exactly this manifest, the
sources for all four modules, and a planned four-session
\`docs/sessions/session-plan.md\`, in one call. It is what stages the corpus
Section 4 below is a tour of.

---

## 3. Plan one session per module

Append one entry per module to \`docs/sessions/session-plan.md\`, each naming the
module it works in. The heading form is load-bearing — a session's title is
healed from it, and clicking a row in the Work Explorer lands on it:

\`\`\`
### Session 1 of 4: The Person model
\`\`\`

**You should see:** the Work Explorer showing the repository at **0/4**, with
the sessions grouped **by module** under a **Not Started** bucket.

---

## 4. Look at what you built

${walkSection}
---

## 5. Work the model module first

\`model\` is first because every other module references its project.

Press **Start Session**. Choose your engine, and the
extension opens two editor tabs side by side — your **AI CLI on the left** and
the **Dabbler terminal on the right**, exactly the layout Section 4 showed —
that is the default; set \`dabbler.terminalLocation\` to \`panel\` if you would
rather they were panel terminals.

Then let the framework drive. In the CLI, run what the sentence in the terminal
tells you, once:

\`\`\`
dabbler session start --sessions-dir docs/sessions --engine <your engine> --provider <your provider>
dabbler session next --sessions-dir docs/sessions
\`\`\`

and keep calling \`next\`, doing what each instruction says, until it says
\`done\`. **One call, one move.** You never run the tests, the verification, the
commit or the close yourself — the framework does each of those between your
calls, and the Dabbler terminal narrates them.

**You should see:** in the Work Explorer, session 001 moving into an **In
Progress** bucket with six lifecycle rows underneath it — Register, Plan,
Work, Verify, Test, Close — and the Dabbler terminal printing each phase as it
starts. The engine's own plan for the session nests under **Work**, as its own
steps.

---

## 6. Change the model, and see who breaks

Once all four modules exist, change something in \`modules/model\` and ask:

\`\`\`
dabbler affected
\`\`\`

Or right-click the module and choose **Show Impact**.

**You should see** the plan for that change:

\`\`\`
scope: a hypothetical change of modules/model/src/CsvModel/Person.cs
modules: model
  repository-wide        suite dotnet ()  <-

dotnet test --nologo
\`\`\`

**The change reaches \`model\`, and the one suite this solution declares.** That
suite names no module, so it answers for the whole repository and any change
reaches it — and because every module references the model's project, one
\`dotnet test\` at the root is what proves the siblings still build against the
change.

The run of record for a session is **only the suites its change reaches**, not
every suite in the repository. A solution that declares a suite per module sees
a change to \`model\` reach each consumer's suites as well, because \`model\` is
shared types.

A session that changes two modules names both:

\`\`\`
dabbler session declare --module model --module persister
\`\`\`

---

## 7. Build and run the whole thing

Run the application. Its project references build the other three with it:

\`\`\`
dotnet run --project modules/app/src/CsvWatcher -- ./inbox ./people.db
\`\`\`

Drop a CSV into \`./inbox\`:

\`\`\`
FirstName,LastName,Email,HiredOn
Ada,Lovelace,ada@example.com,1843-01-05
Grace,Hopper,grace@example.com,1944-07-02
\`\`\`

**You should see:** \`people-clean.csv: read 2, stored 2, total 2\`. Copy the same
file in again and you should see \`read 2, stored 0, total 2\` — email is the
natural key, so re-reading one file does not duplicate anyone. A file with a
header the reader does not recognise is **refused by name and left alone**,
never half-stored.

---

## What to check when something looks wrong

- **The Solution Explorer says "It fills in once the repository is set up" but
  you have a \`docs/modules.yaml\`.** The projection under
  \`.dabbler/solution/solution.json\` has not been derived. Touch the manifest
  or a \`.csproj\`, or run the explicit refresh, and it fills in.
- **The module context menu item is missing.** \`Show Impact\` is right-click
  only, on every module row.
- **The framework stopped.** Read its own account first —
  \`dabbler status\`, the \`stop\` on \`.dabbler/runs/s<N>/driver/run.json\`, and the
  outstanding instruction's \`reasons\`. Never edit a record, a verdict or a gate
  to get past a stop.
`;

process.stdout.write(doc);
