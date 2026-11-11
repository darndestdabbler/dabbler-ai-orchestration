# The simplified framework, walked and timed

**Session 175, 2026-09-15.** What sessions 170–174 left — one checkout,
project references, the build files as the solution, tests named after what
they test, and the release setting — driven through the VSIX this tree
builds, installed into a scratch VS Code the way a developer installs it,
against two new solutions: the CSV tutorial in .NET, from bootstrap through
its session 3, and a two-project Maven reactor through its session 1. Every
session is timed by phase from its own record.

## What was built

- **The router**, `npm run build -w dabbler-ai-router`, and **the VSIX**,
  `npm run package` in `tools/dabbler-ai-orchestration`:
  `dabbler-ai-orchestration-3.2.0.vsix`, 74 files, 3.54 MB, carrying
  `dabbler-ai-router 3.2.0` in its bundled router.

## How the editor was isolated

- **The harness's own Code binary**, VS Code 1.137.0 under `.vscode-test`,
  never the operator's editor.
- **A fresh extensions directory and a fresh user data directory** under
  `C:\temp\s175-walk`, with `APPDATA` and `LOCALAPPDATA` scoped beside them,
  so the model catalog and the preferences are those of a machine that has
  chosen nothing yet. `HOME` and `USERPROFILE` are the real ones, so the
  engine CLIs find their logins and git its identity.
- **The VSIX installed with `code --install-extension`** into that
  extensions directory — *"Extension 'dabbler-ai-orchestration-3.2.0.vsix'
  was successfully installed."* — and no `--extensionDevelopmentPath`
  anywhere: the extension that ran is the packaged one.
- **The window driven through Playwright's Electron launch** with the
  launch helper's isolation flags and environment allowlist, so the panes
  could be read and photographed without a person at the keyboard.

## The two solutions

| solution | repository | origin |
| --- | --- | --- |
| CSV tutorial, .NET | `C:\temp\s175-csv` | `C:\temp\s175-csv-origin.git` (bare) |
| Maven reactor | `C:\temp\s175-maven` | `C:\temp\s175-maven-origin.git` (bare) |

Each began as `git init -b master`, one commit carrying a one-line README,
pushed to its bare origin with upstream set.

## This machine

Windows 11 Pro 10.0.26200 · Node 25.8.1 · VS Code 1.137.0 (the harness's
install) · .NET SDK 10.0.201 (8.0.425 and 11.0.100-preview.2 beside it) ·
Apache Maven 3.9.2 on Amazon Corretto 21.0.3 · git 2.51.0.windows.2 ·
PowerShell 7.6.5 · Claude Code 2.1.271 and GitHub Copilot CLI 1.0.83 on
`PATH`.

## The readings

**1. The extension activates from the VSIX and writes its shim.** Opening
the Dabbler container activated the installed extension, and its global
storage gained a `bin` folder holding the `sh` launcher and its `.cmd`
twin. The `sh` launcher runs the editor's own `Code.exe` as Node
(`ELECTRON_RUN_AS_NODE=1`) over the installed extension's bundled router —
the VSIX's router, not this tree's. The sessions below were driven from a shell with that folder first
on `PATH`, which is what an integrated terminal of that window carries.

**2. Before bootstrap, the Solution Explorer calls a README a project.**
The repository held one README and no build file at all, and the Solution
Explorer read *s175-csv — one project*, with one row, *s175-csv —
application*. The Configuration section beside it read *Authoring AI · not
read*, *Vehicle · 2 installed, none chosen*, and *Reviewing AI ·
copilot-cli*; the Work Explorer was empty. This is the design, not a
defect: `packages/router/src/projectGraph.ts` reads a repository with no
build file as one project, itself.

## The .NET solution, sessions 1–3

The solution the tutorial builds: a console application tier (Csv.Importer)
that sends people to an API tier (People.Api) that alone writes them to
SQLite, both referencing a shared model (Csv.Model), each with an xUnit test
project under `tests`. The engine's work in every session was done by hand
in this conversation, as an engine would do it; the times below are read
from the driver's own timestamped lines, the job logs and the ledger row.

**3. Bootstrap on an empty repository takes 4.4 s and says what it cannot
declare.** It wrote the three instruction files, `.gitignore`, the commit
guard, `dabbler.yaml` and the two scaffolded sessions, committed all six,
and said that no suite and no packaging are declared because nothing at the
root says how tests run or what a package is built from. It does not push:
the branch sat one commit ahead of origin until session 1's start pulled
and its close pushed.

**4. `bootstrap --help` still describes the focused checkout.** The
`--remote` text says *"a focused checkout is cloned from the origin"*;
session 170 deleted the focused checkout. Defect, fixed in this session.

**5. `configuration explain` contradicts itself on a two-CLI machine.** It
printed *"engine: none installed — `claude` and `copilot` are on PATH, so
which one runs a session is a choice rather than a default"*. Session 162
fixed the same contradiction on the Configuration pane's Vehicle row, which
on this machine reads *2 installed, none chosen*; the CLI line kept the old
words. Defect, fixed in this session.

**6. Both reviewing roles resolve to the same model.** With nothing chosen,
the Primary and the Auxiliary Reviewer each read *gpt-5.6-terra (nobody chose
one, so the preference order decides)*. The Auxiliary is only asked on a
disputed impasse, and no round in this walk was disputed, so the walk did not
reach the place where that would matter; it is recorded as seen.

**7. Session 1, the plan, closes in one `next` after its last step.**
Registration took 8.1 s (it re-reads the seat's model list and the API's,
free), the plan was accepted 2.1 s after it was reported and was held by
the release setting on its own (*"this solution releases on request
(`dabbler.release`), and the plan names no `release`"*), and the report of
the last step was followed by one `next` of 35 s that ran verification (21
s, VERIFIED in round 1 by gpt-5.6-terra over the seat), found no suite to run
(*"no suite declared; nothing to run"*), landed (3 s), skipped the publish by
the plan's hold, and closed (5 s).

**8. The first build check of a solution refuses, and says only that it
changed the tree.** Session 2's `projects` step wrote six projects with no
solution file, as the plan ask tells an engine to (*"where there is none
yet, the framework writes the root build files once the work is done"*).
Its checks were `dotnet build` on two test projects; both built, and both
were refused: *"check failed: dotnet build … -> exit 0 (the check changed
the tree)"*. MSBuild wrote `bin/` and `obj/`, and nothing ignored them yet —
the framework adds those rules with the root files, in the pre-verify phase,
after every step's checks have already run. The forward exit was one named
command, `dabbler session plan amend --step projects --files …,.gitignore`,
and two lines in `.gitignore`; the report was then accepted. An engine has
to work that out from the refusal, which does not say it. Defect, fixed in
this session: the root files are written before a step's checks run.

**9. A check leaves a scratch directory the build server still holds.** The
same `next` printed *"scratch …\dabbler-check-eTdp3E is still held by a
program the check started and is left for the OS: EPERM"* — MSBuild's build
server outlives `dotnet build`. It is noise to a developer reading a
refusal, and it names what happened; recorded as seen.

**10. The root files arrive at pre-verify, and a second root build file
breaks the run of record.** Pre-verify wrote `s175-csv.slnx` listing the six
projects, `Directory.Build.props` and `Directory.Build.targets`. The session
verified in round 1, and the run of record — `dotnet test` at the root, the
first whole run on record — failed in 3 s with *MSB1011: Specify which
project or solution file to use because this folder contains more than one
project or solution file*: the pack's own `Handoff.proj` sat beside the
solution file. That is the engine's authoring, not the framework's, and the
framework gave the forward exit itself — a `fix-run-of-record` step. Moving
the file into a `build` folder cost a second verification round (34 s),
and the run of record then passed in 4 s. The tutorial now keeps only the
solution file at the root.

**11. The Solution Explorer shows the projects the build files declare.**
After session 2: *s175-csv — 6 projects*; *Csv.Model — library ·
src/Csv.Model/Csv.Model.csproj*, *Used by 5* (Csv.Importer, People.Api and
the three test projects); *Csv.Importer — application*, *Depends on 1*
(Csv.Model), *Used by 1*; *People.Api — service*, *Depends on 1*. Nothing
was declared: every row is read from the `.slnx` and the
`<ProjectReference>`s. The Work Explorer read *s175-csv — 2/6*, and *3/6*
after session 3.

**12. The tests named after a file run with the step that changed it.**
Session 3's `person` step changed `Person.cs` and `PersonTests.cs`; after its
own check the driver logged *named-tests-passed … `dotnet test --filter
PersonTests`* (4 s) and accepted the report.

**13. A one-class session releases in under two and a half minutes.**
Session 3 carried `release`, created `version.json` at 0.1.0 and ran, after
its last report, as one `next` of 52 s: verification (22 s, VERIFIED round
1), the run of record whole because the last whole run took 4 s (*"within
60s"*, 7 s), the land (3 s), the publish (7 s) and the close (6 s).

**14. The pack hands over both tiers and tags the release.** `dotnet msbuild
build/Handoff.proj -p:HandoffDir={output}` wrote `people-api` and
`csv-importer` under the run's package folder — each a runnable published
folder, the API with its `web.config` and SQLite's native libraries — and the
publish made `v0.1.0` and pushed it: origin carries the tag on the land
commit. The publish log's first line is *"packaging: dry run: the
declaration loads; 0 gate(s) would refuse a real publish now"* — above a
real pack and a real tag. Defect, fixed in this session.

### Timings

Local time, 2026-09-15. *Framework* is everything but the engine's
authoring and the review round.

| session | registered | plan accepted | steps judged | review | run of record | land | publish | close | wall | framework |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 plan | 8.1 s | 2.1 s | 3.4 s | 21 s | none | 3 s | held | 5 s | 2 m 22 s | ≈ 25 s |
| 2 projects | 3.0 s | 3 s | 5 + 13 (refused) + 6 + 7 + 5 s | 40 + 34 s | 3 s (failed) + 4 s | 3 s | held | 6 s | 9 m 04 s | ≈ 65 s |
| 3 Person | 2.8 s | 4 s | 10 + 4 s | 22 s | 7 s | 3 s | 7 s | 6 s | 2 m 24 s | ≈ 45 s |

Session 3 is the one-class session the plan's targets name: framework time
about 45 s against a two-minute target, and 2 m 24 s against six minutes.
Session 2's wall time carries one refused step (reading 8) and one broken run
of record (reading 10), each followed by a full re-verification.

## The Maven reactor, session 1

A developer's existing reactor, brought to Dabbler: a parent `pom.xml`
listing `greeting-lib` and `greeting-app` under `<modules>`, the application
depending on the library at `${project.version}`, JUnit 5 in both. It was
written, proved with `mvn test` (5.3 s), committed and pushed before
bootstrap, as a project that exists already would be. Its session plan was
the developer's own — one session adding `Shouter` to the library — so there
was no plan session to run first.

**15. Bootstrap declares the Maven suite by name, and not the ignore rule.**
Bootstrap (4.8 s) found the POM and declared `mvn -q test` with test root
`.`, `test_name` `{name}Test.java` and `select` `mvn -q test -Dtest={names}
-Dsurefire.failIfNoSpecifiedTests=false`. It added only `.dabbler/` to
`.gitignore`. Its packaging line says Maven publishes through its own
lifecycle and that `mvn deploy` stays the developer's to run, which is true
of a push and says nothing of the pack-only handoff session 174 added;
recorded as seen.

**16. The Solution Explorer reads the reactor.** *s175-maven — 2 projects*;
*greeting-lib — library · greeting-lib/pom.xml*, *Used by 1* (greeting-app);
*greeting-app — library*, *Depends on 1* (greeting-lib). A jar with a `main`
and neither a `war` packaging nor the Spring Boot plugin is a library by the
graph's rule. The Configuration section read *Reviewing AI · copilot-cli ·
gpt-5.6-terra* with the same model for both reviewing roles (reading 6), and
the Work Explorer *s175-maven — 0/1 · session 001 in flight*.

**17. The first Maven check refuses the same way, and nothing ever fixes
it.** The step's check, `mvn -q -pl greeting-lib test`, passed and was
refused: *"exit 0 (the check changed the tree)"* — `target/`. This is reading
8 in its worse form: the root `pom.xml` already exists, so the framework
writes no root files at pre-verify either, and `target/` would never have
been ignored by anything but the developer. The forward exit was the same
amend and one line. Defect, fixed with reading 8.

**18. The tests named after a Maven file never run.** After the re-report
the driver logged `check-passed` and `report-accepted` and no
`named-tests-passed` line, where the .NET session had one (reading 12).
Bootstrap writes the test root as a bare `- .`, and the configuration loader
reads that YAML item as null: the merged suite carries `test_roots: [null]`,
the selection declaration fails with *"test_roots must be a list of
strings"*, and `namedTestCommands` returns nothing without saying so. Given
the same suite with the root as the string `"."`, the selector picks
`ShouterTest` and builds `mvn -q test -Dtest=ShouterTest
-Dsurefire.failIfNoSpecifiedTests=false`. Every repository bootstrap has
declared a Maven suite for since session 173 runs no named tests. Defect,
fixed in this session: the root is written quoted. A repository bootstrapped
before the fix quotes it by hand.

**19. The Maven session closes in one `next`.** After the re-report, 47 s:
verification (22 s, VERIFIED round 1), the first whole run of record (`mvn
-q test`, 5 s, *"no earlier whole run of maven is on record"*), the land (4
s), the publish skipped by the release setting, and the close (6 s).

| session | registered | plan accepted | steps judged | review | run of record | land | publish | close | wall | framework |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Shouter | 3.0 s | 2.6 s | 6 (refused) + 5 s | 22 s | 5 s | 4 s | held | 6 s | 2 m 31 s | ≈ 35 s |

## The bill

**20. The walk's reviews cost 31.84 AI credits, and `dabbler seat-cost`
could not say so.** The engine's work was done in this conversation and is
not billed through Dabbler; the direct-API keys were read only by the free
model-list refresh; every review ran over the Copilot seat. The seat's local
store holds one conversation per round, five in all, each opened in a
scratch repository:

| round | conversation | turns | input tokens | output tokens | AI credits |
| --- | --- | --- | --- | --- | --- |
| CSV session 1 | `d4d1e92f` | 4 | 46,241 | 961 | 5.61 |
| CSV session 2, round 1 | `a2105bda` | 4 | 62,599 | 2,565 | 9.82 |
| CSV session 2, round 2 | `012de7e2` | 4 | 47,453 | 1,136 | 6.33 |
| CSV session 3 | `894f5fa5` | 3 | 38,247 | 994 | 5.40 |
| Maven session 1 | `9ff4bb71` | 3 | 32,659 | 1,106 | 4.67 |
| **walk** | | 18 | 227,199 | 6,762 | **31.84** (≈ $0.32) |

A round of this size costs about 5–10 credits, and its context is 32–63
thousand input tokens for a whole-repository review of a solution this
small; that is the measured number the module wall was built to shrink.

`dabbler seat-cost` given those five ids answered *"status: unmeasured
(store schema_version 7 is not one this reader has been verified against
(6,)…)"*: Copilot CLI 1.0.83 writes version 7, whose `assistant_usage_events`
still carries `session_id` and `total_nano_aiu`, so the numbers above were
read from the store directly with the verb's own formula (nano-AIU ÷ 10⁹).
Defect, fixed in this session. Separately, no round record names its
conversation: every `rounds.jsonl` row reads `input_tokens: null`,
`output_tokens: 0`, so the verb can only be pointed at a round by searching
the store. That is a larger change and is written up as session 176, *The round
names what it cost*.

## What the walk fixed

Six defects, each fixed here with one test named after the file it changed.

| reading | defect | fixed in | its test |
| --- | --- | --- | --- |
| 8, 17 | A step's build check refuses because nothing ignores the build's output until pre-verify, and never where the root solution file or POM already exists | `packages/router/src/ecosystem.ts` (`ignoreBuildOutput`), `packages/router/src/journal.ts` (`treeWithPaths`), `packages/router/src/drive.ts` (root files and ignore rules before a step's checks, the baseline moved past exactly them) | `packages/router/test/ecosystem.test.ts` |
| 18 | A Maven suite's bootstrapped test root `.` loads as null, so no named test ever runs | `packages/router/src/bootstrap/detect.ts` | `packages/router/test/bootstrap.test.ts` |
| 20 | `dabbler seat-cost` refuses the version 7 store Copilot CLI 1.0.83 writes | `packages/router/src/seatCost.ts` | `packages/router/test/seatCost.test.ts` |
| 14 | A real publish's log is headed *dry run* | `packages/router/src/cli/packaging.ts` | `packages/router/test/packaging.test.ts` |
| 5 | `configuration explain` says *none installed* on a machine with two engines | `packages/router/src/cli/configuration.ts` | `packages/router/test/configuration.test.ts` |
| 4 | `bootstrap` describes the retired focused checkout in its help and two messages | `packages/router/src/cli/bootstrap.ts` | `packages/router/test/bootstrap.test.ts` |

The plan ask and `README.md` said the root build files arrive once the work
is done, before it is verified; both now say they arrive, with the ignore
rules, before a step's checks run. A Maven repository bootstrapped before
this release carries the bare root in its `dabbler.yaml` and quotes it by
hand: `test_roots: ["."]`.

**21. The two that stopped a check were proved on a fresh copy.** The
reactor as it stood before bootstrap was cloned to a new scratch repository
with its own origin and taken through the same session with this tree's
rebuilt router. Bootstrap wrote the root quoted, and on the `shouter` step's
first report the driver logged *root-files wrote=[".gitignore"]* (the
`target/` rule), *check-passed*, *named-tests-passed … `mvn -q test
-Dtest=ShouterTest -Dsurefire.failIfNoSpecifiedTests=false`*, and accepted
the report naming only the two Java files: no amend, and no one touching
`.gitignore`.

**22. The managed body told the engine not to name the session plan.** This
session's own fixes step wrote session 176 into `session-plan.md`, and its
report left the file out because the managed body says *"The router commits
its own `docs/sessions/*` files at the land and the close; a step's report
never names them"*. The driver refused it — *files_changed omits
'docs/sessions/session-plan.md'* — correctly: the router writes the ledger,
the activity log and the work plan it renders, and not the session plan an
engine edits. Fixed in `packages/router/src/bootstrap/templates.ts` and this
repository's `AGENTS.md`, in the same two lines.
