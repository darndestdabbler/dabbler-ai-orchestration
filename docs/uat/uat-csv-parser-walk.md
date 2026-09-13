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
