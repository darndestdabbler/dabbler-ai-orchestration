# The sample driven through 2.5.0, walked

**Session 162, 2026-09-13.** The four-module .NET sample at
`D:\Projects\csv-parser` — the one whose issues log produced sessions
160–162 — driven through the 2.5.0 VSIX this tree built, installed into a
scratch VS Code the way a developer installs it, with the sample's own
sessions 3 and 4 run to their end and beyond: the first releasable module
session packed, published and closed, and the first focused session started
from the retitled launcher, built against its sibling's package, verified,
and left waiting on the operator's answer to a grant request it had every
reason to make.

It is the walk sessions 160 and 161 did not take: both read the mechanism
and fixed what they read, and neither started a session in the sample. This
one did, and the first releasable module session stopped four times on
rules that hold for a single-module repository and not for this one. Each
was a line; each is fixed here with its test.

## What was walked

- **The VSIX this tree packaged**, `dabbler-ai-orchestration-2.5.0.vsix`,
  installed with the harness's Code binary into a fresh extensions
  directory and a fresh user data directory, with `APPDATA` and
  `LOCALAPPDATA` scoped to a temporary root so the model catalog and the
  preferences were a machine's that has chosen nothing yet. `HOME` and
  `USERPROFILE` were the real ones, so the engine CLI found its own login
  and git its identity; the three provider keys were passed so the pane's
  terminal could read the api block. Nothing here touched the operator's
  editor, shim, catalog or preferences.
- **The Configuration section's authoring rows** on this machine, which has
  `claude` and `copilot` both on `PATH`.
- **Update the Catalog** from the Configuration row: the dialog, the
  terminal it opens, and that terminal's tab name.
- **Session 3 of the sample, started from the Work Explorer with no flag.**
  Its plan section carries `Module: person` and `Scope: whole repository`;
  the row's title, the registration, the declaration and the first step's
  shape were read, and then the session was driven from a shell to its
  close — declaration, three steps, three verification rounds, the run of
  record, the land, the publish to a folder feed, and the close.
- **Session 4 of the sample, started from the Solution Explorer's retitled
  launcher.** The new window, the clone's contents, the notes file reached
  through `sharedFiles`, the sibling resolved as a package, a verification
  round with a disputed finding, and the run of record that a focused
  checkout cannot run.
- **A stop toast**, from an unattended session on a scratch repository
  whose only change was the extension's own settings file.

## What was NOT walked, and why

- **Session 4 to its close.** Its run of record is `dotnet test
  CsvParser.sln`, and the solution file lists the sibling's projects, which
  the focused checkout does not hold; the declaration that would fix it is
  outside the session's scope. The session asked for the sibling's source
  through the framework's own verb and waits on the operator's answer,
  which is the reading, and not something to answer for them.
- **The Copilot seat as the engine.** Both launches picked Claude Code; the
  seat's own list was read by the refresh and is in reading 3.
- **The nit about characters after a closing quote.** Left undisposed in
  session 4 as a minor beyond the contract; the eager-read nit was fixed.
- **macOS and Linux.** One machine, and it runs Windows.

## This machine

Windows 11 Pro 10.0.26200 · Node 25.8.1 · VS Code 1.137.0 (the harness's
own install under `.vscode-test`) · router 2.5.0 as built from this tree,
linked on `PATH` as `dabbler` for the shell that drove the sessions · .NET
SDK 10.0.201 (8.0.425 and an 11.0 preview beside it) · PowerShell 7.6.5 ·
GitHub Copilot CLI 1.0.83 and the Claude CLI both on `PATH`.

## The readings

**1. The authoring Vehicle row says what is true on a two-CLI machine.**
Before anything else was clicked: *Authoring AI · Vehicle · 2 installed,
none chosen*, and the tooltip's last paragraph is the router's own sentence
— *`claude` and `copilot` are on PATH, so which one runs a session is a
choice rather than a default, and nothing is chosen for you.* Session 160's
walk read "none installed" on the same row of the same machine.

**2. Update the Catalog: the dialog, the terminal, the tab.** The
Configuration row's context menu has one entry. The dialog says what the
refresh costs — *Nothing.* — and that it runs in a terminal, where you can
watch it, and refuses while a session is in flight. Its buttons are
*Refresh* and *Cancel*. Refresh opened a terminal whose tab reads **Code**
during and after the run: the shell is the editor's own binary running as
Node, and the tab shows the process name. The extension names the terminal
after the record; the tab's title template is the editor's setting, not a
line of the extension's, so this is recorded and not fixed. After the run
the tree repainted: *Reviewing AI · api · gpt-5.6-terra*, the authoring
Model row offering 21 models from the seat's own catalog.

**3. The Work Explorer files the global session under its module, and
offers it as Start Session.** With `Scope: whole repository` under the
heading and `Module: person` beside it, the Not Started bucket held
*person 1* and under it *003 · The build skeleton and the Person type ·
planned · global*. The row's menu: **Start Session**, **Cancel Session** —
the plain title, because this session opens no window. The repository
row's menu: **Open File**, **Start Session**, **Start Unattended Session**.

**4. Start Session registers the global session and the first step carries
no wall.** The engine pick offered *Claude Code · anthropic* and *GitHub
Copilot · openai — a seat also needs a model*; the model box carried
`claude-fable-5-1` from the checkout's committed settings. The ledger row
went to in-progress with `kind: global`, `module: person`, engine
`claude-code`. The plan step accepted `modules: ["person"]` with no reason
asked; `declare` wrote no policy under `.dabbler\runs\s3\`; the first work
step's instruction had no `scope` member and no focused-session sentence.
Entries 7, 9, 10 and 12 of the sample's log, closed.

**5. `dabbler packaging --dry-run` as a plan check, refused mid-session.**
Session 3's first step named the rehearsal as its second check, as the help
says a plan may. It printed the gate rows and exited 1: *step (f) runs
after (e), and the evidence for the earlier steps is not there*. A
releasable session mid-work cannot have that evidence, so the help's
promise held only for a session that may not publish. **Fixed here** in
`packages/router/src/packaging.ts`: a rehearsal whose gates fail still
answers that the block loads, and the real run still refuses.

**6. The dash, three times.** The same rehearsal's rows: `- pins_current
(N/A)` and `- exposure_within_ceiling (N/A)` open with a dash, `✓
owed_decisions` with a tick. The publish's rows and the close's rows read
the same way, `    - exposure_within_ceiling   (N/A)` among eight ticks at
the close, through the one renderer.

**7. The run of record stopped for a contract notes page.** After
verification round 1 (VERIFIED, gpt-5.6-terra), the module candidate of all
four modules refused: *module 'person' declares contract: package and has
no notes page at modules/person/contract/README.md; write it, or scaffold
it with `dabbler module contract person`* — and that scaffold refuses for
`contract: package`. Four pages were written by hand from the solution
plan. Recorded in the sample's log as entry 17 and not fixed here: the
sentence that says the page is required belongs in the README's module
section, and it is there now.

**8. The candidate and the publish demanded opposite things of one
declaration.** The next attempt refused: *the declared pack for module
'person' does not name {version}*. Following that remedy would have made
the publish refuse instead — `dabbler packaging` supplies no version and
refuses a pack that names it. **Fixed here** in
`packages/router/src/packages.ts`: a declared pack that does not name the
version is the publish's, and the candidate takes the framework's own
default pack. Decision D279.

**9. Code-less modules were candidates.** Every module names the notes file
under `sharedFiles`, so appending to it reaches every module, and the
candidate refused on `csv-deserializer`: *no project file the framework
knows under modules/csv-deserializer*. Three of the four modules have no
code yet by plan. **Fixed here**: `hasProjectFile` in
`packages/router/src/ecosystem.ts`, the candidate loop in
`packages/router/src/cli/module.ts` skips such a module with a line saying
so, and the land in `packages/router/src/drive.ts` expects no candidate of
it — the same rule, read by both. The first cut of the guard sat below the
application branch and `console-app` refused the same way; it sits above
it now.

**10. The candidate put the solution under central package management.**
The `person` candidate packed `CsvParser.Person.0.1.0-dev.20260913.2.g129cdaf`
into `packages\` and wrote a root `Directory.Packages.props` with
`ManagePackageVersionsCentrally` on. The test project's `<PackageReference
Version="...">` attributes were then restore errors. The sample moved its
versions into a second item group of that file, which the framework's pin
writer preserves. The README's module section now says this before a
developer's first candidate.

**11. The publish refused, rewound, and refused again.** The first publish
attempt was refused by its own gates — *verification_clean: the working
tree changed after verification round 1* — because the pages and notes
written to get past readings 7–9 moved the tree; the driver rewound to
verification, round 2 returned VERIFIED, the land committed again, and the
publish packed `CsvParser.Person.0.1.0.nupkg` and failed its push: *error:
The specified source '../csv-parser-feed' is invalid.* The router reads
`../csv-parser-feed` as a folder feed that takes no credential, correctly,
and handed the relative text to `dotnet nuget push`, which does not take
one. **Fixed here** in `packages/router/src/packaging.ts`: a folder feed
spelled relative to the repository reaches the push tool absolute. The
declaration did not change. A third round (the notes moved again),
a third land, and the publish went through: `push: exit 0 — ... --source
D:\Projects\csv-parser-feed --skip-duplicate`, `published to
../csv-parser-feed`; the folder holds `CsvParser.Person.0.1.0.nupkg`. The
close: eight ticks, one dash, *closed (VERIFIED)*.

**12. The retitled launcher opens the clone in a new window.** The
`csv-deserializer` module row's menu: **Start Focused Session in a New
Window**, **Open Module**, **Show Impact**, **Pack Module**. The same engine
pick and model box; a new window titled *csv-parser.csv-deserializer -
Visual Studio Code*. The clone holds the root files, `docs\` whole (the
notes file, through `sharedFiles`), `packages\`, the module's own folder,
and `modules\person\contract` and `modules\console-app\contract` — and not
`modules\person\src`. Session 4's policy lists the notes file among its
allowed paths; the first work step's `scope` member names it. Entries 5 and
13 of the sample's log, closed.

**13. The sibling resolved as a package, at the framework's pin.** The
reader project's unversioned `PackageReference` to `CsvParser.Person` took
`0.1.0-dev.20260913.2.g129cdaf` from `Directory.Packages.props` and restored
it from the committed `packages\` feed — once `nuget.config` named that
folder as a source, which nothing had said it must. The `0.1.0` that
session 3 pushed to the folder feed is reachable and unused: the pin wins.
Round 1's verifier found exactly this against the plan's sentence
("referencing `CsvParser.Person` 0.1.0 from the folder feed"), as a major
blocking finding; the dispute cited the pin, the source and the log's entry
21, and round 2 returned VERIFIED.

**14. A dispute that cites a large file is refused until it cites a
range.** The first dispute named the notes file whole: *refused --
docs/notes/dabbler-issues.md is 39062 bytes, over the inline cap (16384);
cite the relevant passage as ...:START-END*. The stop's own words said what
to do; the answer was replaced for the same seq and filed.

**15. The run of record cannot run in a focused checkout.** After round 2,
`dotnet test CsvParser.sln` in the clone: *MSB3202: The project file
"...\modules\person\src\CsvParser.Person\CsvParser.Person.csproj" was not
found.* The solution file lists every module's projects; the clone holds
one module's. The declaration that would fix it — one suite per module —
lives in `dabbler.yaml`, which the focused session's policy does not list,
and the shared notes file makes `person` a changed module of this session
anyway. The session asked: `dabbler session next --request-grant person
--reason ...`, and the framework raised `module-grant:person` as an owed
decision for the operator, *deny* recommended, and answered `wait`. That
is where the sample stands. Entry 23 of its log says what to change.

**16. The stop toast carries the stop's own words — the wrong ones.** An
unattended session on a scratch repository whose only change was
`.vscode\settings.json` planned (the engine ran 196 s), and the
declaration refused. The toast: *Session 001 paused (engine) in phase
'plan'. Run it again, or cancel it? The engine could not be run, or what it
gave back could not be used.* — with *Run it again from 'plan'*, *Other…*
and *Later*. The body carries a first sentence now, as session 161 made it,
and the first sentence of `determined` is the kind's generic line; the
stop's reason was the second sentence, and it said *the declaration was
refused (its reason is above)*, which names nothing. **Fixed here**:
`renderStop` in `packages/router/src/driver.ts` puts the stop's own words
first, and `declare` in `packages/router/src/session.ts` hands every
refusal's words to a caller that asks, so the driver's stop reads *the
declaration was refused: session 1 cannot declare its task list now: the
working tree carries .vscode/settings.json, which holds the extension's
solution settings ... Two ways on: commit it ... or keep the choice as your
own default instead with `dabbler configure --mine ...`*. Entries 2 and 8
of the sample's log, closed.

**17. The engine a launcher opens outlives the window.** The Claude CLI
that Start Session opened for session 3 kept running after its window was
closed — VS Code's persistent terminal sessions keep it under a detached
pty host — and the next window on the same workspace reattached to it. At
09:10, after session 3 had closed, it ran `dabbler session start` for
session 4 on its own, which made the clone and registered the session
before the launcher was pressed; the module row then read "session 4 is
working here", which was true. Pressing the launcher a minute later opened
the clone's window and launched a second CLI there, which found the session
registered. No two callers held either session's lease at once, and both
CLIs were gone once their windows were quit. Entry 22 of the sample's log;
a hazard of driving an interactive launch from a script as much as of the
product, and recorded rather than fixed.

## Found

**Fixed in this session, in the walk step, with their tests:** readings 5,
8, 9, 11 and 16 — the rehearsal in a releasable session, the pack that does
not name the version, the code-less candidate, the relative folder feed,
and the stop's own words first with the declaration's refusal in them. The
changelog's 2.5.0 section names the first four.

**Documented here:** reading 10 (central pinning) and reading 7 (the notes
page a `package` contract needs) in the README's module section.

**Recorded and left open:**

- **A solution-wide suite cannot be the run of record in a focused
  checkout** (reading 15). The shape that works is one suite per module,
  declared from the first session; a focused session cannot declare it,
  because `dabbler.yaml` is outside its scope; and a shared notes file
  reaching every module makes every module's suite and candidate run.
  Three rules, each defensible alone, meeting in the one repository shape
  the framework exists for. Owed to the next plan.
- **The refresh terminal's tab reads "Code"** (reading 2). The editor's
  title template; not the extension's line.
- **The engine outlives its window** (reading 17).
- **A `package` contract has no scaffold** (reading 7): the stop offers
  `dabbler module contract <slug>`, which refuses for that mode.

## What is left on disk

Under this tree: `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.5.0.vsix`,
gitignored, and the rebuilt `dist/`. Under `D:\tmp\walk-162`: the driver
script, the scratch user data, extensions and state directories, the
readings as JSON and screenshots, and the scratch repository with its bare
origin and its stopped session — none of it holds a key. In the sample:
sessions 3 and 4's records, session 3 closed VERIFIED and published, session
4 in flight in `D:\Projects\csv-parser.csv-deserializer` waiting on
`module-grant:person`; `D:\Projects\csv-parser-feed` holds the published
package. The operator's editor, open on the sample since the morning, was
not touched.

## The second walk: session 165, and the sample's session 4 to its close

**Session 165, 2026-09-13, later the same day.** The VSIX this tree built
after session 164 — versioned 2.5.0 at the time of the walk, shipping as
2.6.0 in the release step that follows it — installed into a fresh
extensions directory and a fresh user data directory of the harness's own
VS Code, with `APPDATA` and `LOCALAPPDATA` scoped to `D:\tmp\walk-165` and
the real `HOME`. The sample's session 4, focused on `csv-deserializer`,
driven from registration to `done` through the shim that activation wrote,
from a PowerShell whose `PATH` had the shim's folder first — the way a
developer's integrated terminal has it. Nothing here touched the operator's
editor, shim, catalog or preferences; the sample's own checkout was touched
once, by the operator's hand, before the session began.

### The readings

**18. Activation writes both launchers into the installed extension.** The
Dabbler icon clicked in a window on the sample; within seconds
`bin\dabbler.cmd` and `bin\dabbler` existed under the scratch global
storage, the `.cmd` naming the harness's `Code.exe` and the VSIX's own
`dist\dabbler.cjs`. `dabbler version` through it: *dabbler-ai-router 2.5.0 /
dabbler-ai-orchestration 2.5.0 (extension)*. The Solution Explorer's rows on
a machine that has chosen nothing: *csv-parser · 4 modules*, *Configuration
· copilot-cli*, *csv-parser · 3/9*. The vehicle a fresh machine reads is the
distribution's `transport.profile`, and it is the seat; recorded, as
reading 3 of the first walk recorded the same row.

**19. What the operator changed before the session, and why.** The first
walk left session 4 waiting on a grant it should not need, because the
run of record was `dotnet test CsvParser.sln` and a focused checkout holds
one module's projects (reading 15). The shape that works is one suite per
module, so the operator re-declared `testing.suites` in the sample's root
`dabbler.yaml` — `person` and `csv-deserializer`, each covering its module's
roots — and declared the issues log, docs
otesdabbler-issues.md, as
`csv-deserializer`'s shared file, committed both and pushed, because the focused clone is made
from `origin`. A suite whose covers and tests sit under one module's roots
is that module's without a `module:` line, as the parser infers it. The
framework's own answer to the collision is still owed to the next plan;
this is the operator's, and it is the one the README teaches.

**20. `session start --focused --module csv-deserializer` through the
shim.** From the sample's root: *start: pulled from origin/master (git pull
--ff-only) before registering.* then *session 004 of sessions registered
(claude-code) in module 'csv-deserializer's focused checkout at
D:\Projects\csv-parser.csv-deserializer; the exposure manifest is written
there.* The clone's cone, from the checkout record the start wrote under
its `.dabbler` folder: `docs`,
`docs/notes`, `modules/console-app/contract`, `modules/csv-deserializer`,
`modules/person/contract`, `packages`. On disk under `modules/`: only
person's contract folder with its notes page and not a line of
its source — and the shared issues log under `docs/notes`. The policy's
`allowed` list: the solution file, the three root build files,
`global.json`, `nuget.config`, `packages`, `docs/sessions`, the module's
own roots and contract folder, the sibling's contract folder, and the
shared file. No stale model was reported at the start: the scratch machine
had chosen nothing, and this machine's own preferences name a model the
catalog lists.

**21. The plan ask says a check may name `dabbler` bare, and asks for the
`modules` member.** The first `next` carried the session's own section
between the markers and the sentence session 165 added — *A check may name
`dabbler` bare: the folder the shim lives in is first on PATH wherever a
session runs, in a terminal the extension opened and under a driver it
started* — beside the multi-module paragraph and the `plan amend` line. The
plan answered with three steps and `"modules": ["csv-deserializer"]`, and
the same call accepted it and declared: *declare: session 004 declared;
releasable=no; modules=csv-deserializer.*

**22. The library step, and the nuget.config the sample wrote by hand.**
`Directory.Packages.props` pins `CsvParser.Person` to the build the
candidate job packed in session 3, `1.0.0-dev.20260913.2.g21df11f`, which
exists only in the committed `packages/` folder — and the sample's
`nuget.config`, written by hand in session 3 before any package module
existed, listed nuget.org and the folder feed and not `packages/`. The
router's own template lists it (`<add key="modules" value="packages" />`)
and is written only where the file is absent. The step added the source;
`dotnet build modules/csv-deserializer/CsvParser.Csv` restored the sibling
from the committed folder and passed as the step's check. Entry 24 of the
sample's log; **documented here**, in the README's central-pinning
paragraph, because a job that rewrote a hand-written `nuget.config` would
be a job editing the operator's file.

**23. The tests step.** Eight xUnit tests — header order, header case, an
extra column, a missing column on line 1 before any row, embedded
delimiters and doubled quotes, blank lines skipped and still counted, and a
name the shared type would refuse reported as a format error — and both
projects added to `CsvParser.sln` under a `modules/csv-deserializer`
solution folder with `dotnet sln add`. The step's check, `dotnet test` on
the module's test project, passed: *Passed! - Failed: 0, Passed: 8*.

**24. A check that names `dabbler` bare passes under the driven session.**
The third step's check was `["dabbler", "modules", "show", "."]`. The
driver's log: *check-passed step=issues-log argv=["dabbler","modules",
"show","."]*. Entry 4 of the sample's log, closed: the shim's folder was on
the calling shell's `PATH`, the check's built environment carries `PATH`
through, and the router's spawn resolves the `.cmd` by `PATHEXT` and hands
it to `cmd.exe`. Under a driver the extension spawns the same now holds,
because session 165 put the shim's folder first on that child's `PATH` —
it reached terminals only before, through the environment variable
collection, and the extension host's own environment never had it.

**25. The dry run in a session that may not publish.** `dabbler packaging
--dry-run` mid-session: *No credential: the feed is a folder, and a folder
takes none.* … *packaging: dry run: the declaration loads; nothing past it
was asked*, then the releasability refusal, exit 0. Neither `refused` nor
an empty credential name. Entry 19, closed. `modules create --help` offers
`--package none` (entry 6).

**26. Verification, the impact plan, the candidate, the run of record.**
The report of the third step ran its check and started the verification
job in the same call, and answered `wait` with `retry_after_seconds: 60`.
Driven from a bounded loop that polled the job's status file and called
`next` only once the job had exited: round 1 **VERIFIED** (gpt-5.6-terra,
openai), 35 seconds. Then, on one line: *impact-plan
modules=["csv-deserializer"] suites=["csv-deserializer"]
candidates=["csv-deserializer"] unowned=["CsvParser.sln","nuget.config"]
unownedSelects=only the suites bound to no module* — entry 18, closed: the
two root build files this session changed belong to no module, and the
line now says what that selects. The candidate job packed
`CsvParser.Csv 1.0.0-dev.20260913.1.gdde2ed1` into `packages/`, kept the
notes page (*a package contract has no surface page*), and pinned it in
`Directory.Packages.props`. `person`'s suite: *run-of-record-skipped
suite=person reason=not reached by the impact plan*. The module's own
suite ran as the run of record and recorded green in 5 seconds. **A
walker's own defect, recorded:** the first driving loop watched the job's
status file for a `state` member it never has — the runner writes
`{exit, ended_at}` — and so never called `next` in nine minutes while the
verdict sat on disk; the loop was fixed and the next call collected it.
The framework's `wait` was right; the caller was not.

**27. The land, the close, and what the report never named.** The landed
commit, `1290434`: subject *Session 4: `PersonCsvReader` and
`CsvFormatException`* — the title from `sessions.json`, 51 characters —
and the task paragraph as the body after a blank line. Entry 9, closed.
Its files: the session's own eleven, and beside them what the framework
wrote — `docs/sessions/sessions.json`, `activity-log.json`,
`project-work-plan.md`, `change-log.md`, the `Directory.Packages.props`
pin, the `.nupkg` and its `.json` under `packages/` — none of which any
report named, and no report was refused for them (entries 7 and 23). The
close's log: nine gates ticked, *closed (VERIFIED)*, one round ref pushed,
*pulled D:\Projects\csv-parser forward (git pull --ff-only), so its window
sees this session closed*, and *next is session 005 — 5 of 9 left to run*.
It printed no line for a rebaseline or an amend, because there was none.
`next` then answered `done`; the completion line reads `invocations=0`,
which is what a pulled session has (entry 11, not a defect). The sample's
root checkout was at the closing commit when the loop ended; no window was
open on it.

**28. What this walk did not exercise, and where each is proved.** No
change was made outside a step, so no `rebaseline` ran: that it records
and asks nobody is the walk suite's own test since session 163, and this
session's close output stands as the other half — nothing printed for a
session with none. No step of the sample's session was amended: session
165's own two amendments are folded into this repository's
`activity-log.json` with their reasons and `by: claude-code (anthropic,
claude-fable-5-1)`, and travel with its land. The run of record was green,
so no fix step followed the candidate: that a step's report is measured
without the candidate's files is session 164's provenance test. The
Copilot seat as the engine, and the remaining seven modules' sessions,
were not driven.

### Found

**Fixed in this session:** the driver the extension spawns hands its child
a `PATH` with the shim's folder first (reading 24), found by verifying the
sentence before writing it.

**Documented here:** a hand-written `nuget.config` must list `packages/`
as a source (reading 22), in the README's central-pinning paragraph.

**Recorded and left open:** a fresh machine's vehicle reads as the seat
(reading 18), which is the distribution's declaration; the framework's own
answer to a solution-wide suite in a focused checkout (reading 19), still
owed, with the operator's per-module declaration as the shape that works
today.

**The sample's log, checked off:** entries 4, 6, 9, 18 and 19 read as
fixed in this walk; 1, 2, 7, 10, 12, 17, 20, 21, 22 and 23 fixed on the
framework's record in sessions 163–165; 8, 11 and 14 judged not defects; 3,
5, 13, 15 and 16 open as their status lines say; 24 and 25 appended by this
session.

### What is left on disk, after the second walk

Under this tree: `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.5.0.vsix`
as rebuilt at 17:51, gitignored. Under `D:\tmp\walk-165`: `activate.js`,
`drive-waits.js`, the scratch user data, extensions and state directories,
and `out/` with each call's instruction and log — none of it holds a key.
In the sample: session 4 closed VERIFIED at `14cad26` on `origin/master`,
the root checkout pulled forward to it, `packages/` holding the
`CsvParser.Csv` dev build, and the focused checkout at
`D:\Projects\csv-parser.csv-deserializer` left in place at the same commit.
