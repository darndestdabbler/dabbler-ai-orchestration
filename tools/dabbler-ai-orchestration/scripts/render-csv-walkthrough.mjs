#!/usr/bin/env node
// Renders docs/tutorials/csv-solution/csv-multi-module-walkthrough.md.
//
// "Look at what you built" -- the one section that claims to show what the
// product does on screen -- is rendered from src/test/playwright/csvWalkSteps.ts's
// WALK_STEPS, the same list csv-module-walk.spec.ts drives against a real VS
// Code. Everything around it is prose written from session 175's walk, which
// built this solution through the packaged extension and timed each session
// (docs/uat/uat-simplified-walk.md).
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

const doc = `# Building the CSV solution: three tiers, one repository

You are going to build a .NET solution that imports CSV files of people into a
SQLite database. It runs as **three tiers**: a console application that reads
the files and sends the people over HTTP, an API that is the only thing allowed
to touch the database, and the database itself.

| Project | Kind | What it is | References |
| --- | --- | --- | --- |
| \`Csv.Model\` | library | The \`Person\` record both tiers agree on | nothing |
| \`Csv.Importer\` | application | Reads a CSV file into people and sends them to the API | \`Csv.Model\` |
| \`People.Api\` | service | Validates people and stores them in SQLite, by email | \`Csv.Model\` |

Each has an xUnit test project beside it under \`tests/\`, named
\`<Project>.Tests\`, whose test files are named after the source files they test.

**A sibling is a project reference.** Each project reaches the ones it uses
with a \`<ProjectReference>\`, and one solution file at the root lists all six,
so \`dotnet test\` there builds and tests the whole solution in one pass. The
two tiers never reference each other: they meet over HTTP, which is what keeps
the database behind the API.

Everything below is what you type or click, and how long it took when this
tutorial was walked. The framework does the rest.

---

## Before you start

You need the .NET 10 SDK, git, and VS Code with the Dabbler extension
installed. Check the SDK:

\`\`\`
dotnet --list-sdks
\`\`\`

The \`dabbler\` command is on \`PATH\` in any VS Code terminal once the extension
has activated and installed its shim. Everywhere else, run
\`node "<extension dir>/dist/dabbler.cjs" <verb>\`. If you see
"dabbler: command not found", that is a \`PATH\` problem, not a keys problem.

---

## 1. Set the repository up

Make an empty folder with a remote to push to, open it in VS Code, and click
**Set Up New Project** in the Solution Explorer. It runs \`git init\` and then
\`dabbler bootstrap\`, which writes the instruction files, \`dabbler.yaml\` and
the first two sessions, and commits them. It took 4 seconds.

\`\`\`
git init -b master
git remote add origin <your remote>
dabbler bootstrap
\`\`\`

**You should see** bootstrap say that it declares no test suite and no
packaging: an empty folder has nothing that says how its tests run or what a
package is built from. Session 2 declares both. Every session's close pushes,
so the repository needs its remote before session 1 can finish.

---

## 2. Session 1: the plan

Press **Start Session**, choose your engine, and tell it what you are building.
Session 1 asks for the brief and, before any project is proposed, **how
production is split**: what runs separately, and which part may talk to the
database. The default it offers is this solution's answer — an application tier
that calls an API tier, and only the API tier talks to the database.

The engine writes \`brief.md\` and \`solution-plan.md\` under \`docs/planning\`:
the objective, the *Production split*, the
*Handoff artifacts* each tier is handed over as with the command that makes
it, the projects with their contracts, and the phases later sessions build.

Then let the framework drive. In the CLI, run what the terminal tells you:

\`\`\`
dabbler session start --sessions-dir docs/sessions --engine <your engine> --provider <your provider>
dabbler session next --sessions-dir docs/sessions
\`\`\`

and keep calling \`next\`, doing what each instruction says, until it says
\`done\`. **One call, one move.** You never run the review, the tests, the
commit or the close yourself.

**You should see:** after the last step, one \`next\` that reviews the plan
with a model from another provider, finds no suite to run yet, lands the
commit, skips publishing — this solution releases on request, and a plan is
not a release — and closes. Walked: 2 minutes 22 seconds, the review 21 of them.

---

## 3. Session 2: the projects, the suite and the pack

Session 2 challenges the plan's cuts, then creates what the production split
names. Write the six projects, each \`.csproj\` referencing its siblings, and a
\`global.json\` pinning the SDK. **Do not write the solution file:** before the
step's checks run, the framework writes \`<folder>.slnx\` listing every project,
\`Directory.Build.props\` and \`Directory.Build.targets\`, and adds \`bin/\` and
\`obj/\` to \`.gitignore\`, and it never rewrites them. Add each project you
create later to the \`.slnx\` yourself.

Declare the suite in \`dabbler.yaml\`. A source file's tests are the test file
named after it, so the framework runs \`PersonTests\` whenever \`Person.cs\`
changes:

\`\`\`
testing:
  suites:
    - name: dotnet
      command: dotnet test
      expensive: true
      covers: ["."]
      test_roots: ["tests"]
      test_glob: "*Tests.cs"
      test_name: "{name}Tests.cs"
      select: dotnet test --filter {names}
      select_separator: "|"
\`\`\`

Declare how the tiers are handed over. The pack runs one MSBuild file that
publishes the API and the importer into the folder the framework gives it,
and pushes nothing: the release is the tag it makes.

\`\`\`
packaging:
  pack:
    argv: ["dotnet", "msbuild", "build/Handoff.proj", "-p:HandoffDir={output}"]
\`\`\`

**Keep that file under \`build/\`.** The root must hold one project or solution
file: with \`Handoff.proj\` beside the \`.slnx\`, \`dotnet test\` refuses with
*MSB1011* and the session's run of record fails. The walk met exactly that,
and the framework handed back a *fix-run-of-record* step to move it.

Add the architecture test — one test in \`People.Api.Tests\` that only
\`People.Api\` references \`Microsoft.Data.Sqlite\` — and append sessions 3 to 6
to \`docs/sessions/session-plan.md\`, one per phase.

**You should see:** each step's build accepted, the \`.slnx\` appear before the
review, and the run of record run \`dotnet test\` whole. Walked: 9 minutes,
including the run of record the misplaced pack file broke.

---

## 4. Look at what you built

${walkSection}
---

## 5. Session 3: the Person model, released

Session 3 adds \`Person\` to \`Csv.Model\` — a record that refuses a blank name or
email with an \`ArgumentException\` naming the field — with its tests in
\`PersonTests.cs\`, in the model's test project. It is the first functionality both
tiers build on, so its plan carries \`release\` with that reason, and the
session creates \`version.json\` at \`0.1.0\`.

**You should see:**

- After the step's own check, the framework runs the tests named after what
  changed: \`dotnet test --filter PersonTests\`.
- After the last step, one \`next\` that reviews, runs the whole suite as the
  run of record (it took under a minute last time, so it runs whole), lands,
  publishes and closes.
- The publish writes \`people-api/\` and \`csv-importer/\` — each a runnable
  published folder — under \`.dabbler/runs/s3/package/\`, and pushes the tag
  \`v0.1.0\`.

Walked: 2 minutes 24 seconds from registration to close, of which about 45
seconds was the framework's own work and 22 the review.

---

## 6. Sessions 4 to 6

Each is the same loop — start, \`next\` until \`done\` — over the phases session
2 planned: the CSV parser in \`Csv.Importer\`, the API's store in \`People.Api\`,
and the importer posting to the API and printing \`<file>: read N, stored M\`.
Name each new class's tests after it, and the framework runs exactly those
with the step that changes it.

---

## 7. Change the model, and see who breaks

Expand **Csv.Model** in the Solution Explorer and open **Used by**.

**You should see** every project that references it: \`Csv.Importer\`,
\`People.Api\` and the three test projects. Nobody typed that list. It is read
from the \`<ProjectReference>\` elements, and it is the list a change to
\`Person\` can break. The run of record's \`dotnet test\` at the root proves they
still build against the change, because the solution file lists every project.

---

## What to check when something looks wrong

- **A step whose check builds is refused with "the check changed the tree".**
  The build wrote output nothing ignores. The framework adds \`bin/\` and
  \`obj/\` to \`.gitignore\` before a step's checks from 3.2.1 on; on an earlier
  version, add them and name \`.gitignore\` in the step with
  \`dabbler session plan amend\`.
- **The run of record fails with MSB1011.** More than one project or solution
  file sits at the root. Keep the \`.slnx\` there alone.
- **The Solution Explorer says "It fills in once the repository is set up" but
  you have project files.** The projection under
  \`.dabbler/solution/solution.json\` has not been derived. Touch a \`.csproj\`
  or the \`.slnx\`, or run the explicit refresh, and it fills in.
- **The framework stopped.** Read its own account first —
  \`dabbler status\`, the \`stop\` in the session's \`run.json\` under
  \`.dabbler/runs\`, and the outstanding instruction's \`reasons\`. Never edit a record, a verdict or a gate
  to get past a stop.
`;

process.stdout.write(doc);
