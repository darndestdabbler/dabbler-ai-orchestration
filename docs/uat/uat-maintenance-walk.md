# The maintenance posture, walked through six borrowed repositories

**Session 310, 2026-11-10.** What sessions 305–308 shipped as 3.31.0 — the
`maintenance` posture in `dabbler.yaml`, detection below the root, the
`contract` control held against the session's start commit, and the
`dotnet-framework` suite through vswhere, MSBuild and vstest — driven
through six public repositories nobody here wrote. Each is a fork under the
operator's account, cloned under `C:\temp`, bootstrapped by the released
3.31.0 router, and driven through the same two sessions: session 1 adds an
online calculator page that adds and subtracts two numbers, with its tests;
session 2 adds documentation comments to what session 1 touched and
changes nothing else. Nothing of the six enters this repository.

**Session 315, 2026-11-11.** The walk was first run as session 310 on
2026-11-10, and everything below the router section was found in that
run. It drove all six forks through four sessions each and stopped at the
round trip in the owners' IDEs, which needs a person. That session was
rolled back on 2026-11-11. Its work was kept outside the tree, in
`C:\temp\s310-rollback-save` and on the local branch
`dabbler/rolled-back/s310-2026-11-11T06-26-45-847Z`. Session 315 brings
back this record and the run's fixes, re-reads the six checkouts under
3.32.0, and drives no fork's session a second time.

## The six repositories

Stars as read on 2026-11-10. Paths inside a fork are written with
backslashes, because they are paths in that fork and not in this tree.

| repository | stars | licence | framework | layout | tests | clone |
| --- | --- | --- | --- | --- | --- | --- |
| jbogard/ContosoUniversity | 386 | Apache-2.0 | ASP.NET MVC 5, .NET Framework 4.8.1 (DBDeployment 4.8) | non-SDK `.csproj` (ToolsVersion 15.0 and 12.0), `packages.config`, solution at src\ContosoUniversity.sln, psake build at the root | Fixie 1.0.1 by HintPath, SQL Server Express `.\sqlexpress` deployed by RoundhousE | `C:\temp\s310-contosouniversity` |
| chsakell/mvcarchitecture | 496 | MIT | ASP.NET MVC 5, .NET Framework 4.5.1 | four non-SDK projects (Store.Data, Store.Model, Store.Service, Store.Web), Store.sln at the root, `packages\` committed | none | `C:\temp\s310-mvcarchitecture` |
| jbogard/ContosoUniversityDotNetCore | 450 | MIT | ASP.NET Core MVC, `netcoreapp2.0` | SDK-style, ContosoUniversity.sln at the root, Build.ps1, appveyor.yml | xunit 2.3.1 with the `dotnet-xunit` CLI tool, LocalDB | `C:\temp\s310-contosouniversitydotnetcore` |
| in28minutes/JavaWebApplicationStepByStep | 573 | Apache-2.0 | servlet and JSP WAR, plain Maven, source and target 1.7 | one pom.xml at the root, twenty Step*.md lessons | none | `C:\temp\s310-javawebapp` |
| spring-petclinic/spring-framework-petclinic | 498 | Apache-2.0 | Spring Framework 7.0.10 WAR, Java 17 | Maven wrapper, `.devcontainer`, `.github` | JUnit Jupiter 6.1.3, `*Tests.java`, HSQLDB/H2 in memory | `C:\temp\s310-spring-framework-petclinic` |
| spring-projects/spring-petclinic | 9,635 | Apache-2.0 | Spring Boot 4.1.0, Java 17 | Maven wrapper AND Gradle wrapper side by side, `k8s`, docker-compose | JUnit via Boot, `*Tests.java`, Testcontainers for MySQL/Postgres | `C:\temp\s310-spring-petclinic` |

The forks are `darndestdabbler/<same name>`, made with `gh repo fork
--clone=false`. Heads as cloned: ContosoUniversity `5c4e4ec` (2023-06-17),
mvcarchitecture `5f48163` (2019-02-26), ContosoUniversityDotNetCore
`209b576` (2018-03-06), JavaWebApplicationStepByStep `306df77`
(2019-12-09), spring-framework-petclinic `d980667` (2026-11-01),
spring-petclinic `500158f` (2026-09-29).

## The router the walk runs

- **3.31.0 as session 309 released it.** The Marketplace still served
  3.30.0 an hour after the publish run (`42920196575`, tag `vsix-v3.31.0`,
  success at 23:04Z), so `--install-extension
  DarndestDabbler.dabbler-ai-orchestration@3.31.0` answered *"not found"*.
  The walk installs the publish run's own artifact instead —
  `dabbler-ai-orchestration-3.31.0.vsix`, SHA-256
  `91B5CA26E8A341903F2B63DB124853A58A9D829D0E8BF52F190BDC6FB975ECA8`, the
  bytes the Marketplace job pushed — downloaded with `gh run download`.
- **A scratch profile**: `code --extensions-dir
  C:\temp\s310-vscode\extensions --user-data-dir
  C:\temp\s310-vscode\user-data --install-extension <the vsix>` —
  *"Extension 'dabbler-ai-orchestration-3.31.0.vsix' was successfully
  installed."* The operator's own editor still carries 3.29.1 and is not
  used.
- **The router is the extension's bundled one**, run as `node
  C:\temp\s310-vscode\extensions\darndestdabbler.dabbler-ai-orchestration-3.31.0\dist\dabbler.cjs`
  — *"dabbler-ai-router 3.31.0 / dabbler-ai-orchestration 3.31.0
  (extension)"*. Below, `dabbler` in a fork means that command.

### 3.32.0, for session 315

Session 314 released 3.32.0 (publish run `42996259360`, tag
`vsix-v3.32.0`). On 2026-11-11 the Marketplace again answered *"not found"*
for `@3.32.0`, so the run's own artifact was installed into the same
scratch profile: `dabbler-ai-orchestration-3.32.0.vsix`, SHA-256
`986510E4AB7369475944B2FD9C6D0C9AF5A307752C721BC4ABA359FD039B828C`. Its
router answers *"dabbler-ai-router 3.32.0 / dabbler-ai-orchestration
3.32.0 (extension)"*.

3.32.0 adds `session waive`, the exception card and the defect report,
and it fixes the loop on a resumed blocked step. None of those touches
detection, the posture, the `contract` control or the .NET Framework
suite. So 3.32.0 brings nothing new for the walk to meet, and
the defects below are all still in it. Each checkout was re-read with
3.32.0's `dabbler facts`, clean and level with its fork:

| checkout | head (`Transcript for session 004`) | `dabbler facts` under 3.32.0 |
| --- | --- | --- |
| ContosoUniversity | `6ff9403` | compile pass, contract pass, 3.3 s; still prints *"DECLARATION ERROR testing.controls[0] has unknown key(s) ['name']"*, because the fork was bootstrapped before D3's fix |
| mvcarchitecture | `80b7a31` | **compile fail**: MSB3644 for v4.5.1, because 3.32.0 does not carry D2 and D5 and no pack is installed. With `TargetFrameworkRootPath` pointed at the reference-assembly package the walk downloaded, compile passes and its detail names `C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe`; contract pass |
| ContosoUniversityDotNetCore | `b0cdb5f` | contract pass; no compile control (SDK-style, the suite builds) |
| JavaWebApplicationStepByStep | `0893c39` | contract pass |
| spring-framework-petclinic | `3e10c3a` | contract pass |
| spring-petclinic | `3dffd48` | contract pass |

Every fork reads `0` commits ahead of its `origin`, so the sessions the
first run drove are on the forks under the operator's account.

## The machine

Windows 11 Pro 10.0.26200, Node 25.8.1, VS Code 1.145.3, git as
installed. What the walk needs, and what was there when it started:

| need | state at the start | source |
| --- | --- | --- |
| Visual Studio with MSBuild and vstest | Visual Studio Community 2026, 18.12.12405.243; MSBuild at `C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe`; vstest.console.exe under Common7\IDE\CommonExtensions\Microsoft\TestWindow | vswhere |
| .NET Framework targeting packs | v4.0 through v4.8.1 under Reference Assemblies, so 4.5.1, 4.8 and 4.8.1 are all present | 4.8.1 Developer Pack installed before the session |
| nuget.exe for `packages.config` restore | `C:\Program Files\NuGet\nuget.exe` | |
| SQL Server Express as `.\sqlexpress` | service `MSSQL$SQLEXPRESS` running; `select @@version` answers SQL Server 2025 (RTM) 17.0.1000.7 | installed by the operator before the session |
| LocalDB | `MSSQLLocalDB`, 15.0.4382.1 | |
| .NET Core 2.x runtime for `netcoreapp2.0` | **missing**: `Microsoft.NETCore.App` has 6.0.36, 8.0.33, 10.0.14, 10.0.15, 11.0.0 and an 11 preview; only the ASP.NET Core 2.1.30 shared framework of the 2.x line is present, which cannot run without its NETCore.App | the earlier note that a 2.1 runtime was installed was the ASP.NET Core half only |
| .NET SDKs | 8.0.427, 11.0.100, 11.0.100-preview.2 | |
| JDK and Maven | OpenJDK 17.0.9; Apache Maven 3.9.2; both Spring repositories carry their own wrapper | |
| IntelliJ IDEA | Community Edition 2025.2.6.4 and IDEA 2022.3.3 | |
| Eclipse | Eclipse IDE for Enterprise Java and Web Developers 2026-09 at `D:\eclipse-jee-2026-09-R-win32-x86_64\eclipse\eclipse.exe` | installed by the operator; nothing reads its path |

### Installs, and what the stops said before them

- **The .NET Core runtime.** winget carries no 2.1 runtime package;
  `Microsoft.DotNet.Runtime.2_2` (2.2.8) is installed instead, because the
  default roll-forward takes `netcoreapp2.0` to the lowest higher minor
  present. **What 307's stops said before it: nothing, and correctly so.**
  307's stops (`vsToolsRefusal` at `session start` under maintenance)
  speak only for non-SDK .NET Framework projects — Build Tools, MSBuild,
  vstest, a Developer Pack — and an SDK-style `netcoreapp2.0` repository
  meets none of them. What a missing runtime looks like on this machine is
  recorded under the .NET Core walk, where the test run meets it.
  The install was started at 18:09 with `winget install --id
  Microsoft.DotNet.Runtime.2_2 --silent`, and its UAC prompt was still
  unanswered at 19:29, so the walk installed the runtime without it: SDK
  8.0.428 and runtime 2.2.8 by Microsoft's signed `dotnet-install.ps1`
  into `C:\temp\s310-vscode\dotnet`, used by that one fork alone (see the
  .NET Core walk). Nothing machine-wide changed.
- **The Developer Pack** was already installed for every
  `TargetFrameworkVersion` the two .NET Framework repositories name (v4.5.1,
  v4.8, v4.8.1), so 307's stop had nothing to name on this machine. That it
  names the pack when one is absent is the fixture-tested behaviour of
  `checks.test.ts` ("stops a machine with no targeting pack for a project's
  TargetFrameworkVersion, naming its Developer Pack"); the walk does not
  uninstall a pack to watch it.
- **What changed on the machine by session 315.** The winget install of
  runtime 2.2 that waited on UAC did finish: `dotnet --list-runtimes` now
  reads `Microsoft.NETCore.App 2.2.8 [C:\Program Files\dotnet\shared\…]`,
  so a `netcoreapp2.0` repository needs the user-local copy no longer. The
  v4.5.1 targeting pack is **still not installed**: the v4.5.1 folder under
  Reference Assemblies still has no `RedistList\FrameworkList.xml`, which
  the folders for v4.7.2, v4.8 and v4.8.1 all have. 3.32.0's stop says
  nothing here, as 3.31.0's did, because it carries no fix for D2. With
  D2 in the tree it names the 4.5.1 Developer Pack, and with D5 it also
  names the `TargetFrameworkRootPath` way. That install is owed to a
  person with elevation before Visual Studio can load mvcarchitecture (see
  the round trip).
- **SQL Server Express** was already installed too, and it has no Dabbler
  stop at all: nothing in the framework knows a repository's database. A
  missing instance would be met by the repository's own tests, as a
  pre-existing failure the walk records and goes around.

## How each fork is driven

The engine is this conversation's own (Claude Code, `claude-opus-5-5`), the
author each fork's `session start --provider anthropic --engine
claude-code` registers; the reviewers are the machine's defaults as
`dabbler configuration explain` names them in a fork — Primary
`gpt-5.6-terra` and Auxiliary `gemini-3.8-flash`, both over the API. Each
fork's commands run in a child process whose working directory is the fork
and whose PATH starts with a `dabbler.cmd` naming the walk's router, so a
check or an instruction that names `dabbler` bare reaches the same router.
Each fork is planned the way staff would meet it: session 1 authors
docs\planning\solution-plan.md from a brief, session 2 breaks it into
sessions, and the two changes are the sessions that follow.

**The router changes once, mid-walk.** After defect D1 below was fixed in
this tree, the walk runs `node
D:\Projects\dabbler-ai-orchestration\packages\router\dist\dabbler.cjs` —
3.31.0 plus the fix — rather than the installed release, because the
release cannot finish a maintenance session without a reviewer blocking
the framework's own write.

## The .NET Framework pair

### ContosoUniversity

**Bootstrap, 1.3 s.** Five files committed as *Set up Dabbler*:
`AGENTS.md`, `CLAUDE.md`, `dabbler.yaml`, docs\sessions\session-plan.md and
one line in `.gitignore` (`.dabbler/`). The posture line read *"maintenance
-- 167 tracked source or build file(s) when bootstrap ran
(src/ContosoUniversity.sln)"*; the three projects were named as carrying no
`Sdk` attribute; no packaging was declared because the projects sit below
the root. No root build file was written — no `.slnx`, no
`Directory.Build.props`. The suite was Fixie's own console from
src\packages\Fixie.1.0.1\lib\net45, run whole, beside a `compile` control of
`{msbuild} "src\ContosoUniversity.sln" /restore /t:Build
/p:RestorePackagesConfig=true`. That build ran by hand in 4.3 s with
MSBuild 18 and only the repository's own warnings.

**The repository's own failing test.** Before any change, the Fixie suite
reads *"1 passed, 1 failed"*: `CreateTests.Should_create` fails with an FK
violation (`FK_dbo.Course_dbo.Department_DepartmentID`) on a fresh
temporary LocalDB instance. Rebuilding the dev and test databases with the
repository's own `psake rdb` (RoundhousE, 5.7 s, nothing tracked changed)
does not help: the test then fails with *"Cannot create file
'…\ContosoUniversity.mdf' because it already exists"*, the orphan its own
temporary instance left in the user profile. It fails on every run, so it
is recorded as the repository's own and gone around: the person's line in
the fork's `dabbler.yaml` is `required_for_close: false` on the suite, the
documented way a known-red suite is run and recorded without holding a
close, committed with the brief before session 1.

**Session 1 (the plan).** Started 18:25:53; plan accepted 18:26:13; the one
step accepted 18:26:39; round 1 returned at 18:27:12 with one blocking
finding — *"Unrelated `.gitignore` policy changes violate the plan-only
session scope"* — which was right, and which was the framework's write,
not the engine's (`root-files wrote=[".gitignore"]` at 18:26:38). That is
D1. After the fix the fix round reverted the five lines and named the
Fixie suite for change 2 (the round's one minor); round 2 passed at
18:31:16, the run of record ran Fixie whole and red in 20 s and was logged
`run-of-record-red-not-required`, landed `49a4e0e`, closed and pushed its
transcript at 18:31:45. **5 min 52 s.**

**Session 2 (the session list).** 18:32:00 → 18:33:44, **1 min 44 s**,
VERIFIED in round 1. It appended sessions 3 and 4 to the fork's
session plan and nothing else. The Fixie run of record runs whole even for
a prose-only session, 19 s here, because the suite covers `.` and declares
no select; that is the declared cost, not a defect.

**Session 3 (the calculator page).** 18:34:00 → 18:39:51, **5 min 51 s**,
two rounds. Three steps, each checked by the compile control's own
`{msbuild}` command as a step check (2 s each, packages already restored),
the last also running the Fixie console and accepting only the
pre-existing failure: *"3 passed, 1 failed"*. Round 1 found a real bug in
the engine's work: the layout submits every `form[method=post]` by AJAX
and reloads the page, so the POST result never showed; the repository's
own opt-out is the `no-ajax` class, which the fix round added. Round 2
passed. The diff against the brief's commit is three `Compile` and one
`Content` item in ContosoUniversity.csproj, one `Compile` item in
IntegrationTests.csproj, four new files and one navigation line; no file
at the root. The `contract` control's record for every round reads
*"8 build file(s) held to the session's start …; none moved"*, and the
compile control's detail names
`C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe`.

*An engine-side flaw the walk records and does not fix:* the engine's
editing tool normalised the mixed line endings of `_Layout.cshtml`, so its
diff shows eleven whitespace-only line changes beside the one link
(`git diff --ignore-cr-at-eol` shows the one line). No control and no
reviewer flagged it; it is noise a colleague reading the diff will see.

**Session 4 (documentation comments).** 18:40:49 → 18:44:46, **3 min
57 s**, VERIFIED in round 1. Two steps, each checked by MSBuild and by a
step check that the diff of its files against HEAD only adds comment lines
(20 `///` lines; a two-line Razor comment).

**The hand-bumped target.** `TargetFrameworkVersion` v4.8.1 → v4.8 in
ContosoUniversity.csproj, then `dabbler facts`: under 3.31.0 the human
output read only *"contract fail"*, and the element was in `--json`
alone; after W2 it reads, under the row, *"src/ContosoUniversity/
ContosoUniversity.csproj: TargetFrameworkVersion at HEAD v4.8.1, in the
tree v4.8"*. The same run printed *"DECLARATION ERROR testing.controls[0]
has unknown key(s) ['name']"* — D3. The tree was restored with `git
checkout`.

### mvcarchitecture

**Bootstrap, 1.7 s.** No suite, because there is no test project — bootstrap
says *"declare one before the first session that writes code"* — and the
compile control over Store.sln. Building it by hand: MSB3644, *"The
reference assemblies for .NETFramework,Version=v4.5.1 were not found"*, on
a machine where 3.31.0's stop had said nothing. The v4.5.1 folder under
Reference Assemblies holds 124 IntelliSense `.xml` files and no
assemblies; that is D2. After the fix, `session start` reads: *"refused --
this repository targets v4.5.1, and this machine has no targeting pack for
it under C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework.
Install the .NET Framework 4.5.1 Developer Pack. Nothing was started."*

**The install that stops the walk here.** winget carries no 4.5.1
Developer Pack. Microsoft's own reference-assembly package
(`Microsoft.NETFramework.ReferenceAssemblies.net451` 1.0.3, signed by
Microsoft, 255 files with `mscorlib.dll` and the RedistList) supplies the
same folder; copying it into Reference Assemblies needs elevation, and
the UAC prompt was declined (*"The operation was canceled by the user"*).
It was not retried.

**The way around without an install, and D5.** MSBuild reads reference
assemblies under `$(TargetFrameworkRootPath)` when it is set, which is how
Microsoft's ReferenceAssemblies packages work: with the environment
variable pointed at the downloaded package's `build` folder, Store.sln
built in 1.9 s with nothing installed. But the stop still refused, because
it read Program Files only, and the check environment did not carry the
variable. That is D5; after it, the stop reads where MSBuild reads, and
its refusal names this way for a machine where nothing can be installed.

**The restored packages, and W5.** The same build restored twelve package
folders into `packages\`, which this repository does not ignore: its
`.gitignore` is Visual Studio's template, with `#packages/` commented out
under *"TODO: If you have NuGet Package Restore enabled, uncomment the next
line"*. `session start` then refused 126 untracked files with *"commit
them, or undo the changes … likely the project's starting point"* — advice
that is wrong for restore output (W5). Under the fixed posture the
framework writes no ignore rule; the person did what the template's own
line says, and in the same commit deleted the `name: compile` line the
3.31.0 bootstrap had written (D3).

| session | start → done | rounds | notes |
| --- | --- | --- | --- |
| 1 plan | 19:19:07 → 19:21:07 (2 min) | 1 | *"run-of-record-none reason=no suite declared; nothing to run"* |
| 2 session list | 19:21:28 → 19:22:25 (57 s) | 1 | |
| 3 calculator page and first tests | 19:23:02 → 19:26:14 (3 min 12 s) | 1 | four steps: `CalculatorService` beside the repository's services (registered by its `*Service` convention), the controller and view, the non-SDK MSTest 2.2.10 project Store.Service.Tests at v4.5.1 in the siblings' ToolsVersion 12.0 format with the adapter's props and targets imported from `packages\`, listed in Store.sln, and its vstest suite in `dabbler.yaml`; the step check ran `{vstest}` as argv, *"Passed: 2"*; the new suite was the run of record, green in 2 s |
| 4 documentation | 19:26:38 → 19:28:02 (1 min 24 s) | 1 | the code step was refused once by its own comment-only check — the engine had added a blank line between two interface members — and accepted on the second answer, with `named-tests-passed … /TestCaseFilter:FullyQualifiedName~CalculatorServiceTests` |

The contract record through session 3 holds the four existing projects and
lists the new `.csproj` and `packages.config` as added; a new project in
Store.sln is not a moved target. Across the four sessions the existing
`.csproj` files gained exactly one `Compile` item in Store.Service and one
`Compile` and one `Content` item in Store.Web, and no file appeared at the
root but `AGENTS.md`, `CLAUDE.md` and `dabbler.yaml`.

### Session 315: the fixes brought back, and the pair as it stands

**The fixes.** `work.patch` from the save applied to this tree without a
conflict. That includes `drive.ts`, which sessions 310–313 had moved by
128 lines without touching `rootFilesFor` or the step's write of the root
files. The one file left out is the framework-rendered
`docs/sessions/project-work-plan.md`. D1–D5 and W2 are back as the first
run wrote them, each test with them. Typecheck and lint are clean, and
`node --test` over `checks.test.ts`, `detect.test.ts`, `drive.test.ts` and
`facts.test.ts` reads *"tests 179 … pass 179, fail 0"* in 2.4 s. The
router was rebuilt, and everything below in this section ran this tree's
`packages\router\dist\dabbler.cjs`, which is 3.32.0 plus the fixes.

**ContosoUniversity at `6ff9403`**, against its last commit before *Set
up Dabbler* (`c8fe184~1`):

- At the root, `AGENTS.md`, `CLAUDE.md`, `dabbler.yaml` and the `docs`
  folder that holds the plan and the sessions are new, and nothing else is.
- The `.csproj` diff is four added lines and no removed one:
  `<Compile Include="Features\Calculator\Calculator.cs" />`,
  `…\UiController.cs`, `<Content Include="Features\Calculator\Index.cshtml" />`
  in ContosoUniversity.csproj, and `…\CalculatorTests.cs` in
  IntegrationTests.csproj.
- `dabbler facts`: compile pass with its detail naming
  `C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe`,
  contract pass. The `name` declaration error is still printed, because
  this fork's `dabbler.yaml` was written by 3.31.0's bootstrap. D3 stops a
  new bootstrap writing the line, and it does not rewrite a file a person
  already has.
- The Fixie console reads *"3 passed, 1 failed, took 10.94 seconds (Fixie
  1.0.1)"*. That is the one pre-existing `CreateTests.Should_create`
  failure the first run recorded, and nothing new.
- With `TargetFrameworkVersion` hand-bumped from v4.8.1 to v4.8, `dabbler
  facts` reads, under its row:

  ```
  contract   fail
      the build contract does not hold against HEAD -- keep each element as it declares it, and list each new file in its project:
      src/ContosoUniversity/ContosoUniversity.csproj: TargetFrameworkVersion at HEAD v4.8.1, in the tree v4.8
  ```

  The tree was then restored with `git checkout`, and `git status` was
  clean again.

**mvcarchitecture at `80b7a31`**, against `aaf5576~1`:

- At the root, `AGENTS.md`, `CLAUDE.md`, `dabbler.yaml`, `docs` and the new
  test project's `Store.Service.Tests` folder are new.
- The existing `.csproj` files gained only `<Compile
  Include="CalculatorService.cs" />` in Store.Service, and `<Compile
  Include="Controllers\CalculatorController.cs" />` and `<Content
  Include="Views\Calculator\Index.cshtml" />` in Store.Web. Store.sln
  gained the new project's six lines.
- With no pack installed and no `TargetFrameworkRootPath`, `dabbler facts`
  now prints the compile failure's reason under its row, MSB3644 for
  v4.5.1 with the MSBuild that answered it. 3.32.0 printed `compile fail`
  alone (W2).
- The targeting-pack stop, called as `session start` calls it with
  `{msbuild} "Store.sln"` and v4.5.1, reads: *"this repository targets
  v4.5.1, and this machine has no targeting pack for it under C:\Program
  Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework.
  Install the .NET Framework 4.5.1 Developer Pack, or, where nothing can be
  installed, set TargetFrameworkRootPath to a folder holding
  `.NETFramework\<version>`, such as the `build` folder of Microsoft's
  Microsoft.NETFramework.ReferenceAssemblies package for it."* 3.32.0
  says nothing here and the build fails later (D2). With the variable
  pointed at `C:\temp\s310-vscode\refasm\net451\build`, it says nothing,
  because there is nothing to say (D5).
- With the variable set, `dabbler facts` reads compile pass and contract
  pass. The suite's runner, vstest.console from Visual Studio 2026's
  `TestWindow`, reads *"Passed! - Failed: 0, Passed: 2 … Store.Service.Tests.dll
  (net451)"*.

**What differed from the first run:** nothing in either fork. The machine
is the same here too: the 4.5.1 pack is still not installed.

## The Java three

All three bootstrapped by the walk's router (after D1–D3) in about 1.5 s
each, each committing the same five files, naming `pom.xml` as the
posture's evidence, and declaring a `maven` suite with the plural globs
(`*Test.java`, `*Tests.java`) and a `-Dtest={names}` select. None of the
three tracks an Eclipse `.project`, `.classpath` or `.settings`, so there
was nothing of Eclipse's to keep untouched; across all three, the only
build-file change is the servlet WAR's six-line JUnit dependency, and the
only files at any root that were not there before are `AGENTS.md`,
`CLAUDE.md` and `dabbler.yaml`. Each fork's last `contract` record, at its
session 4: JavaWebApplicationStepByStep *"1 build file(s) held …; none
moved"* (`pom.xml`), spring-framework-petclinic *"2 build file(s)"*
(`pom.xml` and the wrapper's properties), spring-petclinic *"4 build
file(s)"* (`pom.xml`, `build.gradle` and both wrappers' properties). Every
session's tests ran under the repository's own Maven — `mvn` for the
servlet WAR, which has no wrapper, and `.\mvnw.cmd` for the two Spring
repositories — and the named tests each step ran were selected by the
plural glob (`CalculatorTest` by `*Test.java`, `CalculatorControllerTests`
by `*Tests.java`).

### JavaWebApplicationStepByStep (the servlet WAR)

**The JDK.** `mvn -q test` on the machine's JDK 17 fails before a test:
*"Source option 7 is no longer supported. Use 8 or later."* Nothing in
3.31.0 meets that earlier — there is no JDK stop for a maintenance
repository — but Maven's own line names the cause and the way, so it is
recorded and not built: the fork is driven with `JAVA_HOME` set to the
machine's Microsoft JDK 11.0.16, as its owners' IDE would set a project
SDK. The check environment carries `JAVA_HOME`, and the run of record
inherits it, so every step check and every suite ran on JDK 11 at Java 7.

| session | start → done | rounds | notes |
| --- | --- | --- | --- |
| 1 plan | 18:51:44 → 18:52:55 (1 min 11 s) | 1 | the maven run of record took 2 s |
| 2 session list | 18:53:09 → 18:54:05 (56 s) | 1 | |
| 3 calculator page | 18:54:19 → 18:56:22 (2 min 3 s) | 1 | the repository's first test: JUnit 4.13.2 `test`-scoped, `CalculatorTest`; `named-tests-passed … -Dtest=CalculatorTest` after its step |
| 4 documentation | 18:56:44 → 18:58:05 (1 min 21 s) | 1 | Javadoc and a JSP comment, comment lines only |

The contract held through the new dependency: *"1 build file(s) held to
the session's start …; none moved"* — a `test`-scoped dependency is not a
target, exactly as 306 drew the line.

### spring-framework-petclinic (Spring Framework 7 WAR)

Baseline `.\mvnw -q test` green in 26 s on JDK 17. Before D4 the declared
`./mvnw -q test` could not start under cmd; after it, the wrapper ran as
the run of record in every session, and step checks named `.\mvnw.cmd`
as argv.

| session | start → done | rounds | notes |
| --- | --- | --- | --- |
| 1 plan | 18:56:03 → 18:57:08 (1 min 5 s) | 1 | wrapper run of record 13 s |
| 2 session list | 18:57:40 → 18:58:39 (59 s) | 1 | |
| 3 calculator page | 18:58:50 → 19:02:56 (4 min 6 s) | 2 | round 1 held the engine to its own non-goal: the test carried the class Javadoc the repository's tests carry, and documentation was session 4's; removed |
| 4 documentation | 19:03:11 → 19:04:43 (1 min 32 s) | 1 | `named-tests-passed … -Dtest=CalculatorControllerTests` for a change to `Calculator.java`, by the plural name |

### spring-petclinic (Spring Boot 4.1)

**Two builds, two suites.** The repository carries both a Maven wrapper
and a Gradle wrapper over the same sources, and bootstrap declared both as
expensive suites covering `.`, so every run of record would run the test
suite twice and download a Gradle distribution to do it. The person's
narrowing — bootstrap's own advice, *"check the command and narrow what
each suite covers"* — kept the Maven suite and dropped the Gradle one
(W3).

**The repository's own Docker test.** Baseline `.\mvnw -q test`: *"Tests
run: 81, Failures: 0, Errors: 2"*, both in `PostgresIntegrationTests`,
which starts PostgreSQL through Docker Compose with
`spring.docker.compose.skip.in-tests=false`; the Docker CLI is installed
and its daemon is not running. Recorded and gone around more narrowly
than ContosoUniversity's: the suite command became
`./mvnw -q test -Dtest=!PostgresIntegrationTests
-Dsurefire.failIfNoSpecifiedTests=false`, green in 46 s, so every other
test still holds the close. `MySqlIntegrationTests` skips itself without
Docker.

**The repository's own i18n guard.** `I18nPropertiesSyncTest` fails on any
literal text in a template and on any key missing from a translated
messages file. The calculator's template uses only message keys, and its
six keys went into `messages.properties` and the nine translated files
(`messages_hi.properties` in its own `\u` escapes; `messages_en.properties`
left empty, as the repository keeps it); the page step's check is that
test.

| session | start → done | rounds | notes |
| --- | --- | --- | --- |
| 1 plan | 19:02:23 → 19:04:13 (1 min 50 s) | 1 | narrowed maven run of record 47 s |
| 2 session list | 19:04:32 → 19:06:11 (1 min 39 s) | 1 | |
| 3 calculator page | 19:06:21 → 19:10:30 (4 min 9 s) | 1 | a new `calculator` package in the repository's licence header and spring-javaformat tabs; six keys in ten messages files; the page step checked by `I18nPropertiesSyncTest` |
| 4 documentation | 19:11:17 → 19:14:17 (3 min) | 1 | spring-javaformat validates the Javadoc at `test-compile` |

### Session 315: the three as they stand

Each fork was compared with its last commit before *Set up Dabbler*, and
its suite run as its `dabbler.yaml` declares it, with this tree's router
for `dabbler facts`:

| fork | at the root | build-file diff | contract (`dabbler facts`) | suite as declared |
| --- | --- | --- | --- | --- |
| JavaWebApplicationStepByStep (`0893c39` against `883bab9~1`) | `AGENTS.md`, `CLAUDE.md`, `dabbler.yaml`, `docs` | the six-line `junit` 4.13.2 `test`-scoped `<dependency>` and nothing else; `<source>1.7</source>` and `<target>1.7</target>` unchanged | pass, *"1 build file(s) held to HEAD; none moved"* | `mvn -q test` on JDK 11.0.16, exit 0 in 3 s: *"Tests run: 2, Failures: 0 … CalculatorTest"*, the repository's only tests |
| spring-framework-petclinic (`3e10c3a` against `7d1ba07~1`) | the same four | none | pass, *"2 build file(s)"* | `.\mvnw.cmd -q test` (the declared `./mvnw` as D4 gives it to cmd), exit 0 in 14 s: 77 tests in 14 classes, `CalculatorControllerTests` 2 of them, selected by `*Tests.java` |
| spring-petclinic (`3dffd48` against `3965abc~1`) | the same four | none | pass, *"4 build file(s)"* | `.\mvnw.cmd -q test -Dtest=!PostgresIntegrationTests …`, exit 0 in 51 s: 60 tests in 18 classes green, `calculator.CalculatorControllerTests` 2 of them |

None of the three tracks an Eclipse `.project`, `.classpath` or
`.settings`, and `git diff` over those paths since bootstrap is empty in
each.

**One thing learned at the shell, not a defect.** The two Spring wrappers
read the JDK differently. spring-petclinic's is Maven Wrapper 3.3.4
`only-script`, which runs with `java` on PATH. spring-framework-petclinic's
is 3.1.1, and with `JAVA_HOME` unset it answers *"Error: JAVA_HOME not
found in your environment"* before Maven starts. The machine sets
`JAVA_HOME` (Corretto 21), so a session's check environment, which carries
`JAVA_HOME`, meets the first case only. The second appeared here only
because the walk's own shell had cleared the variable after the servlet
WAR's JDK 11 run. It is recorded because a machine without `JAVA_HOME`
would meet it at the run of record, and the wrapper's own line names the
cause.

**What differed from the first run:** nothing in any of the three forks.
spring-framework-petclinic ran on Corretto 21 through `JAVA_HOME` here.
The first run wrote *"on JDK 17"*, which is the `java` first on PATH. But
its 3.1.1 wrapper cannot have run without `JAVA_HOME`, so it most likely
ran on Corretto 21 then too. Its Java 17 target compiles the same on
either.

## The .NET Core one

### ContosoUniversityDotNetCore

**Bootstrap, 2.0 s.** One `dotnet` suite, `dotnet test` with a `--filter`
select, and the posture line naming the test project's `.csproj`.

**The runtime, without an install.** `netcoreapp2.0` needs a 2.x
`Microsoft.NETCore.App`, which the machine lacked; the winget install of
2.2 waited on a UAC prompt for over an hour. Microsoft's signed
`dotnet-install.ps1` installed SDK 8.0.428 and runtime 2.2.8 into
`C:\temp\s310-vscode\dotnet` with no elevation, and the fork's commands put
it first on PATH with `DOTNET_ROOT` beside it, both of which the check
environment carries. `netcoreapp2.0` rolled forward to 2.2.8.

**The repository's own database.** The first `dotnet test` failed all 28
tests: *"Cannot open database 'ContosoUniversity-Test'"*. The repository's
Build.ps1 deploys it with its own RoundhousE (`tools\rh.exe`, drop then
`/simple`) into `(LocalDb)\mssqllocaldb`; run by hand, outside any
session, it took a second and touched no tracked file. Then: *"Passed! -
Failed: 0, Passed: 28 … (netcoreapp2.0)"* in 6 s.

| session | start → done | rounds | notes |
| --- | --- | --- | --- |
| 1 plan | 19:13:36 → 19:14:40 (1 min 4 s) | 1 | `dotnet test` run of record 7 s |
| 2 session list | 19:15:02 → 19:16:10 (1 min 8 s) | 1 | |
| 3 calculator page | 19:16:46 → 19:18:59 (2 min 13 s) | 1 | the same global AJAX submit as ContosoUniversity, met this time from the start with `no-ajax`; `named-tests-passed … --filter CalculatorTests` |
| 4 documentation | 19:19:31 → 19:20:43 (1 min 12 s) | 1 | |

After the four sessions the `.csproj` files show no changed line — the
SDK-style projects take the new files by glob — `TargetFramework` is still
`netcoreapp2.0`, and the contract record reads *"2 build file(s) held to
the session's start …; none moved"*.

### Session 315: as it stands

At `b0cdb5f`, against its last commit before *Set up Dabbler*
(`e851eb9~1`), and with this tree's router:

- At the root, `AGENTS.md`, `CLAUDE.md`, `dabbler.yaml` and `docs` are
  new, and nothing else is.
- `git diff --stat` over `*.csproj` and `*.sln` is empty, and both
  projects still read `<TargetFramework>netcoreapp2.0</TargetFramework>`.
- `dabbler facts` reads contract pass, *"2 build file(s) held to HEAD;
  none moved"*.
- This time the suite's declared `dotnet test` ran on the machine's own
  `C:\Program Files\dotnet\dotnet.exe`, with no user-local copy first on
  PATH, because the 2.2.8 runtime the first run waited on is now installed
  machine-wide. It reads *"Passed! - Failed: 0, Passed: 30 …
  ContosoUniversity.IntegrationTests.dll (netcoreapp2.0)"* in 9 s against
  LocalDB. That is the repository's 28 tests and session 3's two. The
  `ContosoUniversity-Test` database the first run deployed with the
  repository's own RoundhousE is still in place.

**What differed from the first run:** only the runtime's location. The
user-local `C:\temp\s310-vscode\dotnet` is no longer needed by anything.

## The round trip in the owners' IDEs

**What the engine could check without a person at the IDE.** Visual
Studio 2026's own command-line build, `devenv.com <solution> /Build Debug`,
loads a solution through the IDE's project system rather than MSBuild
alone:

| repository | Visual Studio 2026 (`devenv /Build`) |
| --- | --- |
| ContosoUniversity | *"Build: 3 succeeded, 0 failed"*, 7 s; tree unchanged |
| ContosoUniversityDotNetCore | *"Build: 2 succeeded, 0 failed"*, 9 s; tree unchanged |
| mvcarchitecture | *"Rebuild All: 0 succeeded, 0 failed"* — **not loaded**: *"The project 'Store.Model' is targeting '.NETFramework,Version=v4.5.1'; however, the target framework is not installed on the machine"*, the same for all five projects |

**The limit of D5's way around.** `TargetFrameworkRootPath` lets MSBuild,
and so every Dabbler control, check and suite, build v4.5.1 with nothing
installed; Visual Studio's project system asks the machine instead, and
in the IDE it answers a missing pack with the offer to retarget the
project — the very change the maintenance posture exists to prevent. A
team that opens mvcarchitecture in Visual Studio needs the 4.5.1 targeting
pack installed with elevation; the walk's UAC prompt for that install was
declined, and the record says so rather than calling the round trip done.

**What the first run left owed to a person.** The parts of this step no
engine can do:

1. Open each .NET checkout in Visual Studio 2026 — after installing the
   v4.5.1 targeting pack for mvcarchitecture (Microsoft's
   Microsoft.NETFramework.ReferenceAssemblies.net451 package, copied into
   `Reference Assemblies\Microsoft\Framework\.NETFramework\v4.5.1` with
   elevation) — build it, run its tests from Test Explorer (Fixie 1 for
   ContosoUniversity needs its own Visual Studio adapter; the others run
   through MSTest and xunit adapters), and make one commit from the Git
   Changes window.
2. Open each Java checkout in IntelliJ IDEA (2025.2 Community or 2022.3)
   as a Maven project — JDK 11 for JavaWebApplicationStepByStep, JDK 17
   for the two Spring repositories — run its tests from the test runner,
   and make one commit from the Commit tool window. Eclipse
   (`D:\eclipse-jee-2026-09-R-win32-x86_64`) is installed and optional;
   none of the three forks tracks Eclipse's project files, so importing
   one writes `.project`, `.classpath` and `.settings` untracked.
3. A colleague who does not use Dabbler reads one diff per ecosystem —
   ContosoUniversity's session 3 (.NET Framework), ContosoUniversityDotNetCore's
   session 3 (.NET Core), spring-petclinic's session 3 (Java) — and says
   whether anything in it looks like a tool's work rather than a
   colleague's.

### Session 315: the round trip, by the operator

**The pack first.** Before Visual Studio was opened, the operator approved
the elevated install that was declined in the first run. The walk copied
Microsoft's `Microsoft.NETFramework.ReferenceAssemblies.net451` package
into `Reference Assemblies\…\.NETFramework\v4.5.1`; its `mscorlib.dll`
signature is *Valid, CN=Microsoft Corporation*. Copying with `robocopy
/XC /XN /XO` added the assemblies and the RedistList and kept the
IntelliSense files already there. After that, `devenv.com Store.sln
/Build Debug` read *"Build: 0 succeeded, 0 failed, 5 up-to-date"*, with no
"target framework is not installed" line, and the fixed targeting-pack
stop said nothing without `TargetFrameworkRootPath`. The first run's
`devenv /Build` results for the other two .NET checkouts held unchanged
(3 and 2 succeeded).

The operator then opened each checkout in its IDE, built it, ran its tests
from the IDE's own test window, and made one change and committed and
pushed it from the IDE's own Git view. Their report, with a screenshot of
each test window, was `D:\VisualStudioAndIntelliJTesting.docx`, and it is
transcribed here:

| repository | IDE | build | tests in the IDE's own window | the commit from the IDE |
| --- | --- | --- | --- | --- |
| ContosoUniversity | Visual Studio 2026 | *"Build: 3 succeeded, 0 failed"*, 1.8 s | Test Explorer found Fixie's tests with no adapter to install: *"4 Tests (3 Passed, 1 Failed)"*, the failure being `CreateTests.Should_create`, the repository's own; `Features.Calculator (2)` green | `e968946`, see below |
| mvcarchitecture | Visual Studio 2026, after the pack | *"0 succeeded, 0 failed, 5 up-to-date"* | *"2 Tests (2 Passed)"*, `CalculatorServiceTests` `Add` and `Subtract` | `0948ea7` *"Add README to web project."*: `Store.Web\README.md`, `.gitignore`, `Store.Web\Store.Web.csproj` |
| ContosoUniversityDotNetCore | Visual Studio 2026 | *"Build: 2 succeeded, 0 failed"*, 1.8 s | *"30 Tests (30 Passed)"*, `Features.Calculator (2)` among them | `8ba2cf8`, one line in `ContosoUniversity\readme.md` |
| JavaWebApplicationStepByStep | IntelliJ IDEA, JDK 11.0.16 | built by the run | *"2 tests passed"*, `CalculatorTest` `add` and `subtract` | `a58166d`, `README.md` |
| spring-framework-petclinic | IntelliJ IDEA, Maven sync 16 s, OpenJDK 22.0.1 | built by the run | *"77 tests passed"*, `CalculatorControllerTests` among them, the same 77 as the wrapper's run | `d4fb590`, `readme.md` |
| spring-petclinic | IntelliJ IDEA as a Maven project, sync 5.7 s, OpenJDK 22.0.1 | built by the run | *"2 tests failed, 81 passed"* of 83: the two failures are `PostgresIntegrationTests`, the repository's own Docker-backed test recorded at its baseline, which the IDE's *All Tests* does not exclude; `CalculatorControllerTests` green | `e46f18a`, `README.md` |

Each fork reads `0` commits ahead of its `origin` afterwards, so all six
commits were pushed from the IDEs.

**What had to be learned or undone.**

- **mvcarchitecture: Commit All failed** because the repository's
  `.gitignore` predates Visual Studio 2015. It does not ignore the `.vs\`
  folders Visual Studio 2026 writes at the root and beside each project,
  and Git Changes tried to stage the IDE's own open files: *"error: open(
  ".vs/Store/FileContentIndex/….vsidx"): Permission denied … fatal: adding
  files failed"*. The operator added `.vs/` to the `.gitignore`, which is
  the person's choice under `maintenance` and not the framework's (D1).
  The same commit carries two properties Visual Studio's web project system
  wrote into `Store.Web.csproj` on loading it, `<Use64BitIISExpress />` and
  `<UseGlobalApplicationHostFile />`, beside the `Content` item for the new
  README. Those are the IDE's edits to a build file, made outside any
  session. Neither one names a target, a language version or a package.
- **JavaWebApplicationStepByStep: `.idea/` is left untracked.** The
  repository's `.gitignore` does not ignore IntelliJ's folder. The operator
  committed only `README.md`, so nothing of the IDE's entered the history,
  but the folder now shows as untracked. The two Spring repositories ignore
  `.idea`, and ContosoUniversity and ContosoUniversityDotNetCore ignore
  `.vs`. A Dabbler session in this fork would meet it at `session start` as
  an untracked starting point, which is W5's wrong advice met from a second
  side. The rule that answers it is the person's to add.
- **ContosoUniversity: the IDE's assistant read `AGENTS.md`.** The operator
  asked GitHub Copilot in Visual Studio (GPT-5.6 Luna) about the failing
  test. It diagnosed the orphaned `C:\Users\…\ContosoUniversity.mdf` that
  the first run found, plus a double `CloseTransaction` in the fixture that
  hides the first failure. It then changed no code and instead appended
  session 5 to the fork's session plan, *"Plan reliable integration-test
  database setup"*, committed and pushed as `e968946` with Copilot as
  co-author. That is the managed body's rule (*"A fix no session covers is
  a session's own work"*) followed by an engine that is not Dabbler's,
  inside the owners' IDE.
- **Nothing else.** In IntelliJ, the servlet WAR needed its project SDK set
  to JDK 11, as the walk had needed `JAVA_HOME`. That is the repository's
  own Java 7 source level and not a Dabbler matter. Neither IDE refused,
  reformatted or retargeted anything Dabbler had written. Fixie 1's tests
  appeared in Test Explorer although the first run's record expected them
  to need their own adapter.

**The colleague's reading: waived by the operator.** The session plan
asked a colleague who does not use Dabbler to read one diff per ecosystem.
On 2026-11-11 the operator waived that requirement for this walk. They
judged that a person reading a diff proves nothing the six repositories'
own builds, the IDEs and the tests have not already shown. No colleague's
reading was taken, and none is recorded. The one tell a reader would
have seen is the line-ending noise in ContosoUniversity's
`_Layout.cshtml`, recorded under its session 3.

## Summary

Session timings are taken from the driver's own lines in the first run
(start, then done or the close). Every fork's four sessions closed
VERIFIED, and none of them was driven a second time in session 315.

| repository | 1 plan | 2 session list | 3 calculator page | 4 documentation | installed for it | stopped, and why | the owners' IDE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ContosoUniversity | 5 min 52 s, 2 rounds | 1 min 44 s | 5 min 51 s, 2 rounds | 3 min 57 s | nothing (4.8.1 pack and SQL Express were there) | round 1 of session 1, on the framework's own `.gitignore` write (D1); its own red `CreateTests.Should_create` is gone around with `required_for_close: false` | VS 2026: 3 built, Test Explorer 3 of 4 (the repository's failure), commit and push from Git Changes |
| mvcarchitecture | 2 min | 57 s | 3 min 12 s | 1 min 24 s | the 4.5.1 targeting pack, from Microsoft's reference-assembly package, with elevation in session 315 | before D2, MSB3644 at the first build with no stop; after it, `session start` names the pack; `packages\` restore output refused as a starting point (W5) | VS 2026: loads only with the pack; 5 up to date, 2 of 2; Commit All failed on the unignored `.vs\` until the operator ignored it |
| ContosoUniversityDotNetCore | 1 min 4 s | 1 min 8 s | 2 min 13 s | 1 min 12 s | the .NET Core 2.2.8 runtime, user-local in the first run, machine-wide by session 315 | its tests' database was missing until the repository's own RoundhousE deployed it | VS 2026: 2 built, 30 of 30, commit and push |
| JavaWebApplicationStepByStep | 1 min 11 s | 56 s | 2 min 3 s | 1 min 21 s | nothing; driven on the machine's JDK 11 | Java 7 does not compile on JDK 17 (Maven's own line; W4) | IntelliJ, JDK 11: 2 of 2, commit and push; `.idea\` left untracked |
| spring-framework-petclinic | 1 min 5 s | 59 s | 4 min 6 s, 2 rounds | 1 min 32 s | nothing | `./mvnw` under cmd before D4 | IntelliJ: 77 of 77, commit and push |
| spring-petclinic | 1 min 50 s | 1 min 39 s | 4 min 9 s | 3 min | nothing | two build tools declared as two suites (W3); its Docker-backed `PostgresIntegrationTests` excluded from the suite | IntelliJ as Maven: 81 of 83 (the two Postgres tests), commit and push |

**Fixed in this tree, stamped 3.32.1 for session 316 to release:** D1
(`packages/router/src/drive.ts`), D2, D4 and D5
(`packages/router/src/checks.ts`), D3
(`packages/router/src/bootstrap/detect.ts`) and W2
(`packages/router/src/cli/facts.ts`). Each has its test in the test file
of the same name, under `packages/router/test/`.

**Recorded and not changed:**

- W1, the plan ask's "at its root" for a solution under `src\`.
- W3, a suite per build tool.
- W4, no JDK stop.
- W5, build output and IDE folders read as a starting point, now met
  from two sides: `packages\` restore output, and the `.vs\` and `.idea\`
  folders an old `.gitignore` does not name.
- The engine's line-ending normalisation in ContosoUniversity's
  `_Layout.cshtml`.

Each is either the person's to decide under `maintenance`, or a rule of its
own for a later session.

## Defects

**D1 — under `maintenance`, the framework appended ignore rules to the
borrowed repository's `.gitignore`.** Before each step's checks,
`ignoreBuildOutput` ensured `bin/`, `obj/`, `TestResults/`, `coverage*.json`
and `coverage*.xml` as literal lines, and ContosoUniversity ignores its
output as Visual Studio's template writes it, `[Bb]in/` and `[Oo]bj/`, so
all five were appended — and any tracked file those rules matched would
have been untracked. Probed with `git check-ignore` on all six forks before
fixing: every one already ignores its build output (`[Bb]in/`, a bare
`target`, `target/`), and five of the six would have had their
`.gitignore` changed by 3.31.0. **Fixed** in `rootFilesFor`
(`packages/router/src/drive.ts`), which now holds the posture rule for
both the root files and the ignore rules — under `maintenance` it returns
before either is written — with its test in
`packages/router/test/drive.test.ts`, and `docs/driving-a-session.md`
corrected: it said what a build writes is ignored *"in every posture"*.

**D2 — 307's stop read a folder of IntelliSense files as a targeting
pack.** `vsToolsRefusal` asked only whether
`Reference Assemblies\…\.NETFramework\v4.5.1` existed. A language pack or
an older SDK leaves that folder holding nothing but `.xml` documentation,
and MSBuild answers it with MSB3644 at the first build — after the session
has started, so the stop that names the Developer Pack never fired. MSBuild
accepts a folder by its `RedistList\FrameworkList.xml`, and the stop now
asks for that. **Fixed** in `packages/router/src/checks.ts`, with the test
in `packages/router/test/checks.test.ts` seeding a version folder of
documentation files.

**D3 — bootstrap's compile control carried a key the control loader
refuses.** `compileBlock` wrote `- name: compile`, and the one loader of
`testing.controls` that runs (`loadControlsChecked`) knows `kind`,
`command` and `required` only, so every round recorded *"testing.controls[0]
has unknown key(s) ['name']"* beside a control that nonetheless ran. (The
loader that does require a name, `loadChecks`, is called by nothing but its
tests.) **Fixed** in `packages/router/src/bootstrap/detect.ts`; its test in
`packages/router/test/detect.test.ts` now loads what bootstrap writes
through the live loader and asserts no error. A fork bootstrapped before
the fix keeps the line until a person deletes it.

**D4 — the Maven and Gradle wrappers were declared in a form `cmd.exe`
cannot run.** Bootstrap writes `./mvnw -q test` (and `./gradlew test`),
the portable spelling every POSIX shell runs; declared commands go
through the platform shell, and on Windows that is cmd, which answers
*"'.' is not recognized as an internal or external command"*. Every
wrapper suite and its `select` failed before a test ran.
`forThisShell` in `packages/router/src/checks.ts` gives cmd `.\mvnw`, which
it resolves to `mvnw.cmd`, and leaves the committed declaration as it is;
its test is in `packages/router/test/checks.test.ts`.

**D5 — the targeting-pack stop disagreed with MSBuild about where a pack
may be.** `vsToolsRefusal` looked only under Program Files, and
`TargetFrameworkRootPath` was not among the variables a check inherits, so
a machine building from Microsoft's ReferenceAssemblies package — the one
way to build v4.5.1 where nothing can be installed — was refused at
`session start`, and its checks could not have found the pack had it
started. The stop now reads `$(TargetFrameworkRootPath)\.NETFramework`
when the variable is set, the check environment carries it, and the
refusal names that way beside the Developer Pack. **Fixed** in
`packages/router/src/checks.ts`; its test in
`packages/router/test/checks.test.ts` seeds such a folder.

## Wording

**W1 — the plan ask says the solution is "at its root" when it is under
src\\.** Under `maintenance` the session-1 plan ask carries *"This repository
already holds a solution or build at its root: src/ContosoUniversity.sln,
…"*, and its general paragraph still says *"where there is none yet, the
framework writes the root build files"* — which no longer happens in this
posture. Neither stopped the session; both tell an engine something false.

**W2 — `dabbler facts` printed a red control without its reason.** A
`contract fail` row said that a target moved and not which; the element
was in `--json` only. `renderFacts` in `packages/router/src/cli/facts.ts`
now prints a failing or unknown control's detail under its row; its test
is in `packages/router/test/facts.test.ts`.

**W3 — bootstrap declares a suite per build tool, so a repository with two
builds runs its tests twice.** spring-petclinic keeps a Maven and a Gradle
build over one source tree, and bootstrap declared both as expensive
suites covering `.`. Neither is wrong, and which one a team uses is theirs
to say; bootstrap's line *"it declares maven, gradle — check the command
and narrow what each suite covers"* is the way out, and a person took it.
Not changed here: choosing for them would be the guess the posture exists
to avoid.

**W5 — `session start` reads restore output as a starting point.** A
`packages.config` repository that does not ignore `packages\` gets 126
untracked package files from its first build, and the start's refusal
offers *"commit them, or undo the changes"* and calls them *"likely the
project's starting point"*. The right answer is an ignore rule, which is
the person's under `maintenance`; the refusal does not say so. Recorded
for a later session rather than changed here: telling build output from a
starting point by its path is a rule of its own.

**W4 — no JDK stop for a maintenance repository.** A Java 7 WAR on a JDK
17 machine fails at its first compile with Maven's own clear message; the
.NET Framework half has a stop that names the pack to install, and the
Java half has none. Recorded rather than built: Maven's line already names
the cause and the way, and a stop that guessed which JDK to install would
be the over-engineering this session forbids.
