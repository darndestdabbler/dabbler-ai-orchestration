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
// tests -- declaring modules, packing, contracts and grants are commands a
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
one module is one developer's unit of work, and a session runs in one module's
checkout.

| Module | Kind | What it is | Package |
| --- | --- | --- | --- |
| \`model\` | shared-types | The \`Person\` type every other module references | \`CsvModel\` |
| \`deserializer\` | library | CSV text into \`Person\` objects | \`CsvDeserializer\` |
| \`persister\` | library | \`Person\` objects into a database | \`CsvPersister\` |
| \`app\` | application | Watches the folder and composes the other three | \`CsvWatcher\` |

**Siblings are consumed as packages, never as project references.** That is the
point of the decomposition: a module's package is a committed artifact its
siblings restore, so a change to one module cannot silently recompile the
others. There is deliberately **no solution file spanning all four** — one
would re-couple exactly what the manifest just separated.

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
dabbler modules create . --slug deserializer  --title "CSV deserializer"    --kind library      --code-root modules/deserializer  --package CsvDeserializer --depends-on model --contract designed
dabbler modules create . --slug persister     --title "Person persistence"  --kind library      --code-root modules/persister     --package CsvPersister    --depends-on model --contract designed
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
> \`contextAssets\`, \`kind\`, \`dependsOn\`, \`package\`, \`contract\`.

When the manifest first becomes multi-module, the framework writes the root
build files where they are absent and **never rewrites them**: \`nuget.config\`
with the packages source by relative path, \`Directory.Packages.props\` with
central package management on, \`Directory.Build.props\`,
\`Directory.Build.targets\`, \`packages/.gitattributes\` and \`packages/README.md\`.

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

\`model\` is first because every other module restores its package.

**First, the repository needs an \`origin\`.** A focused clone is made from the
origin, not from your working tree. Without one you get:

> \`module open: refused -- the repository has no 'origin' remote: a focused
> clone is made from the origin, not from this working tree, so add one first\`

Then open the module's own checkout:

\`\`\`
dabbler module open model
\`\`\`

**You should see** JSON naming the clone, the branch, and the **cone** — the
only paths that exist on disk:

\`\`\`json
{
  "slug": "model",
  "path": "C:\\\\temp\\\\csv-solution.model",
  "branch": "master",
  "cone": ["docs", "modules/app/contract", "modules/deserializer/contract",
           "modules/model", "modules/persister/contract", "packages"],
  "convenienceFile": "model.slnx",
  "filtered": false
}
\`\`\`

and a new VS Code window on it. Look in \`modules/\` and you will find **only
\`model\`** — \`modules/deserializer/\` does not exist. That is the point: the
session cannot read what it was not given. The siblings are present only as
their **contracts** and their **packages**.

> **Check \`filtered\`.** If it says \`false\`, the clone carries every sibling's
> bytes in its local object store even though none are on disk, because the
> origin did not honour \`--filter\` (\`uploadpack.allowFilter\` is off). The
> framework says so in \`notes\` rather than letting you assume otherwise. Turn
> the setting on at the origin if the repository is large enough for it to
> matter.

In the new window, press **Start Session**. Choose your engine, and the
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

## 6. Pack the model, so its siblings have something to restore

\`\`\`
dabbler module pack model
\`\`\`

**You should see:**

\`\`\`
wrote Directory.Build.targets
wrote packages/.gitattributes
packed model 0.1.0-dev.20260907.1.g1015ba9
  packages/CsvModel.0.1.0-dev.20260907.1.g1015ba9.nupkg
pinned CsvModel in Directory.Packages.props
recorded packages/CsvModel.0.1.0-dev.20260907.1.g1015ba9.json
\`\`\`

The version has the form
\`0.1.0-dev.<yyyymmdd>.<n>.g<digest>\` — the digest is the first seven hex
characters of the module's source tree, so two packs of one tree produce **one**
version and a changed tree produces the next. It writes the package into
\`packages/\`, moves the single unconditioned \`PackageVersion\` pin in
\`Directory.Packages.props\`, and records
\`packages/<Package>.<version>.json\` holding the source digest, the contract
digest, the session number and the base commit — so source, contract and
package correspond exactly.

> A package larger than \`modules.packages.ceilingBytes\` (5 MB by default) is
> refused unless \`packages/.gitattributes\` tracks \`*.nupkg\` with LFS. The
> refusal names both ways out.

---

## 7. Design the contract for a module its siblings depend on

\`deserializer\` and \`persister\` were declared \`contract: designed\`, which means
their promise is written down rather than inferred:

\`\`\`
dabbler module contract deserializer
\`\`\`

**You should see:** \`<Package>.Abstractions\` and \`<Package>.ContractTests\`
created where absent, the test project wired up, and a notes page under
\`modules/deserializer/contract/\`. In the Solution Explorer the module's
**Contract** row stops saying *not written yet*.

---

## 8. When a session needs to read a sibling's source

It will happen: you are in the persister's checkout and you need to see how the
model actually behaves. The clone does not contain it, and that is deliberate.
Ask for it:

\`\`\`
dabbler module grant model --reason "reading Person's date handling to match it"
\`\`\`

Or right-click the module in the Solution Explorer and choose **Widen for
Debugging**.

**You should see:** an **owed decision** appear at the top of the Work
Explorer, phrased as a question, with **grant** and **deny** — and *deny*
recommended. Answer it:

\`\`\`
dabbler owed answer --id module-grant:model --choice grant --note "just this session"
\`\`\`

When you are finished with it:

\`\`\`
dabbler module revoke model
\`\`\`

Or **End Grant** on the row. A revoke is refused while the sibling's roots hold
changes — you cannot quietly edit a module you only asked to read.

**Why this exists:** the metric the decomposition optimises is **exposure** —
how much of the solution any one session could have changed. A grant widens it
deliberately and on the record, which is the opposite of a checkout that was
always wide.

---

## 9. Change the model, and see who breaks

Once all four modules exist, change something in \`modules/model\` and ask:

\`\`\`
dabbler affected
\`\`\`

Or right-click the module and choose **Show Impact**.

**You should see** the plan for that change, and it is narrower than you might
expect:

\`\`\`
scope: a hypothetical change of modules/model/src/CsvModel/Person.cs
modules: model
candidates: model (packed before the run of record)
no tests affected by this change set
\`\`\`

**It names \`model\` alone, not all four.** That is the decomposition working
rather than failing: the siblings consume the model as a **package**, so
editing the model's source does not rebuild them. They are reached when the new
package is produced and the pin moves — which is why \`model\` is listed as a
**candidate**, packed before the run of record.

The run of record for a session is **only the suites its change reaches**, not
every suite in the repository. A module with no declared test root contributes
no tests, and the plan says so plainly rather than quietly running everything.

A session that must change two modules has to say so before it starts, and give
a reason:

\`\`\`
dabbler session declare --module model --module persister --reason contract-change
\`\`\`

**You should see:** a session declaring one module runs in that module's
focused clone; a session declaring two runs in the **full checkout**, because
there is no one clone that holds both.

---

## 10. Build and run the whole thing

Pack the three libraries in dependency order, then build the application, which
restores all three from \`packages/\`:

\`\`\`
dotnet pack modules/model/src/CsvModel/CsvModel.csproj                   -c Release -o packages
dotnet pack modules/deserializer/src/CsvDeserializer/CsvDeserializer.csproj -c Release -o packages
dotnet pack modules/persister/src/CsvPersister/CsvPersister.csproj       -c Release -o packages
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
- **The module context menu items are missing.** \`Open Module\`, \`Widen for
  Debugging\`, \`End Grant\` and \`Show Impact\` are right-click only, and they are
  invisible on a **single-module** solution. Declare a second module and they
  appear.
- **\`dabbler module open\` is refused.** Same reason: a single-module solution
  has nothing to focus on, and that is a declaration rather than a gap.
- **The framework stopped.** Read its own account first —
  \`dabbler status\`, the \`stop\` on \`.dabbler/runs/s<N>/driver/run.json\`, and the
  outstanding instruction's \`reasons\`. Never edit a record, a verdict or a gate
  to get past a stop.
`;

process.stdout.write(doc);
