### 1. Where today's design would break or disrupt each of the five frameworks

**.NET Framework 4.5+ MVC:** `dotnet test` cannot build non-SDK `.csproj` files that import `Microsoft.WebApplication.targets` or use `packages.config`. If the `.sln` lives in a subfolder like `src/`, root detection misses it and `ecosystem.ts` writes a root `.slnx` (unreadable before VS 2022 17.13) plus a `Directory.Build.props` enabling `Nullable` and `ImplicitUsings`. Modern MSBuild automatically imports `Directory.Build.props` even into non-SDK projects, which immediately breaks C# 5–7.3 compilation. Finally, if the AI creates a `.cs` file without adding `<Compile Include="..." />` to the `.csproj`, MSBuild and Visual Studio ignore the file.

**.NET Core / modern .NET MVC:** Many existing repositories keep their `.sln` under `src/` or have multiple projects without a root `.sln`. That triggers `ecosystem.ts` to generate a `.slnx` and force `Nullable` and `ImplicitUsings` onto existing `.NET Core 2.1/3.1` or `.NET 6` projects that never opted into them, breaking the build. Narrowing only to `*Tests.cs` also misses projects that follow the singular `*Test.cs` convention.

**Plain Maven Java:** If a multi-module repo has no root `pom.xml` (for example, the parent lives in a sibling directory), `ecosystem.ts` writes a new parent POM with `<maven.compiler.release>`. The `<release>` flag does not exist on JDK 8's `javac` and conflicts with existing `<source>`/`<target>` tags. Also, `-Dsurefire.failIfNoSpecifiedTests=false` is ignored by older `maven-surefire-plugin` versions (< 2.19), causing narrowed runs on multi-module builds to fail immediately.

**Spring Framework (XML/annotation, WAR):** Legacy Spring WARs rarely fit the Session 1 prompt's "app -> API -> database" module-per-folder layout; they rely on `src/main/webapp/WEB-INF/web.xml` and XML contexts inside a single WAR module. Session 1's instructions to plan "alignment" sessions will tempt the AI to split directories that Maven's `maven-war-plugin` expects in fixed locations.

**Spring Boot:** Spring Initializr and standard Spring Boot projects name tests `*ApplicationTests.java` and `*Tests.java` (plural). Because Dabbler only looks for `*Test.java` (singular) AND passes `-Dsurefire.failIfNoSpecifiedTests=false`, editing `FooService.java` will filter for `FooServiceTest`, run **zero** tests (`FooServiceTests` is skipped), and report a green pass—silently defeating "tests are evidence." Spring Boot repos using `build.gradle.kts` are also undetected.

---

### 2. Recognising an existing repository

- **What to read:** Scan up to two directory levels below the root (excluding `bin`, `obj`, `target`, `node_modules`, `.git`) for any `*.sln`, `*.slnx`, `*.csproj`, `*.fsproj`, `pom.xml`, `build.gradle`, or `build.gradle.kts`, plus `git ls-files "*.cs" "*.java"`.
- **Detected-then-confirmed:** If any build file or tracked source file exists, `bootstrap` detects **maintenance** posture and prompts the user once to confirm the mode, the primary solution/POM path, and the detected test command.
- **Where the answer lives:** In `dabbler.yaml` as `mode: maintenance` and `rootBuildFile: <relative-path>`. Do not add a new config file.
- **What posture follows:**
  1. `ecosystem.ts` root scaffolding is completely disabled.
  2. Session 1's "alignment" prompt is replaced with a maintenance prompt (work strictly inside existing projects and folders).
  3. Test discovery accepts both singular and plural (`*Test.cs`/`*Tests.cs`, `*Test.java`/`*Tests.java`).
  4. `dabbler facts` enforces target-lock checks against `HEAD`.

---

### 3. What the framework must NEVER write or alter in a maintenance repository, and what it may

**NEVER write or alter:**
- Root build scaffolds: `.slnx`, `.sln`, `Directory.Build.props`, `Directory.Build.targets`, `global.json`, `nuget.config`, parent `pom.xml`, `.mvn/`, `mvnw`.
- Framework, language, or toolchain versions in `.csproj`, `packages.config`, `Web.config`, `pom.xml`, or `build.gradle`.
- Project format (never convert `<Project ToolsVersion=...>` to `<Project Sdk=...>` or `packages.config` to `<PackageReference>`).
- IDE metadata: `.vs/`, `*.suo`, `*.user`, `.idea/`, `*.iml`, `.project`, `.classpath`, `.settings/`.

**MAY write or alter:**
- Application and test source/config files within the session's planned scope.
- `<Compile Include="..." />` and `<Content Include="..." />` items inside a non-SDK `.csproj` when adding or deleting a file.
- Dabbler's own control files (`dabbler.yaml`, `.vscode/settings.json`, `AGENTS.md`, `CLAUDE.md`, `docs/`).

---

### 4. Holding the target constant

Use **both**: a brief rule in `AGENTS.md`/`CLAUDE.md` so the AI does not waste turns attempting upgrades, backed by a deterministic check in `dabbler facts` that diffs build files against `git HEAD` (requiring zero extra baseline state).

**Exact deterministic checks in `dabbler facts` (compare working tree to `HEAD`):**

- **SDK-style .NET:**
  - `*.csproj`, `Directory.Build.props`: `<Project Sdk="...">` attribute, `<TargetFramework>`, `<TargetFrameworks>`, `<LangVersion>`, `<Nullable>`, `<ImplicitUsings>`, and existing `<PackageReference>` `Version` attributes must equal `HEAD`.
  - `global.json`: `sdk.version` must equal `HEAD`.
- **Non-SDK .NET Framework:**
  - `*.csproj`: Root `<Project>` must still carry `xmlns="http://schemas.microsoft.com/developer/msbuild/2003"` and no `Sdk` attribute. `<TargetFrameworkVersion>` (e.g., `v4.5.2`), `<ToolsVersion>`, and `<LangVersion>` must equal `HEAD`. Every new tracked `.cs` file under the project directory must have a matching `<Compile Include="..." />`.
  - `packages.config`: File must still exist; existing `<package id="..." version="..." targetFramework="..." />` entries must equal `HEAD`.
  - `Web.config` / `App.config`: `<compilation targetFramework="...">` and `<httpRuntime targetFramework="...">` must equal `HEAD`.
- **Maven:**
  - `pom.xml`: `<packaging>`, `<parent>` (`groupId`, `artifactId`, `version`), properties `<java.version>`, `<maven.compiler.source>`, `<maven.compiler.target>`, `<maven.compiler.release>`, `<maven-compiler-plugin>` `<configuration>`, and `<maven-toolchains-plugin>` `<jdk>` block must equal `HEAD`.
  - `.mvn/wrapper/maven-wrapper.properties`: `distributionUrl` (the Maven version) must equal `HEAD`.

---

### 5. Building and testing .NET Framework 4.x (non-SDK) from the framework

- **How to detect:** Parse the `.csproj` root tag. If it has no `Sdk` attribute (or has `<TargetFrameworkVersion>v4...` / a sibling `packages.config`), classify the ecosystem as `dotnet-framework` instead of `dotnet`.
- **What must be on the machine:** Windows, Visual Studio (or VS Build Tools) with the .NET Framework 4.x targeting packs and Web targets (`Microsoft.WebApplication.targets`), `MSBuild.exe`, `vstest.console.exe`, and `nuget.exe`.
- **How to find it:** Do not spawn a Developer Command Prompt; locate the binaries deterministically via `vswhere.exe` (always at `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe`):
  - MSBuild: `vswhere.exe -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe`
  - VSTest: `vswhere.exe -latest -products * -find Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe`
- **Exact commands:**
  - Restore (if `packages/` is missing): `nuget.exe restore <Solution.sln>`
  - Build: `"<MSBuild.exe>" <Solution.sln> /t:Build /p:Configuration=Debug /v:minimal /nologo`
  - Test (all): `"<vstest.console.exe>" <test-project-OutputPath>\<AssemblyName>.dll /logger:console;verbosity=minimal`
  - Test (narrowed): `"<vstest.console.exe>" <test-dlls> /TestCaseFilter:"FullyQualifiedName~ClassA|FullyQualifiedName~ClassB"`
- **Without Visual Studio (or on macOS/Linux):** Fail fast in `detect.ts` with a clear message: *"Non-SDK .NET Framework requires Windows and Visual Studio Build Tools (`MSBuild.exe` not found via `vswhere`)."* Do not fall back to `dotnet test`.

---

### 6. IDE round-trip

- **Visual Studio:** Relies on `.sln`, `.csproj`, `packages.config`, `Web.config`, and local `.vs/` + `*.user`. Leave all of them alone except adding `<Compile Include="..." />` to non-SDK `.csproj` files when creating classes. Never write a `.slnx` beside a `.sln`.
- **IntelliJ:** Relies on `pom.xml` / `build.gradle` and local `.idea/` + `*.iml`. Leave `.idea/` and `*.iml` untouched; keeping `pom.xml` targets constant ensures IntelliJ never prompts to re-import or change the project SDK.
- **Eclipse:** Relies on `pom.xml` (M2Eclipse) and often tracked `.project`, `.classpath`, and `.settings/`. Never touch `.project`, `.classpath`, or `.settings/`.
- **What Dabbler writes that interferes:**
  1. **The git pre-commit hook** will run when a developer commits from Visual Studio, IntelliJ, or Eclipse's Git UI, or when a non-Dabbler colleague runs hooks. Make the hook a no-op unless an active Dabbler session lock is present.
  2. **`AGENTS.md`, `CLAUDE.md`, `dabbler.yaml`, `docs/`:** Strict Maven builds running `apache-rat-plugin` (license header checks) at the root may fail on new root markdown/yaml files; I am unsure if your shop uses `rat`, so verify on your Maven repos.

---

### 7. The simplest plan

**Session 1: Maintenance detection and stopping the scaffold**
- **Delete** the pre-step auto-scaffolding trigger; **reuse** `ecosystem.ts` only during explicit greenfield bootstrap.
- **Reuse** `bootstrap/detect.ts` and `projectGraph.ts`.
- *Step 1:* Scan up to depth 2 in `detect.ts` for build files (`+.gradle.kts`), detect `mode: maintenance`, and confirm with the operator.
- *Step 2:* Root `projectGraph.ts` at `rootBuildFile` instead of assuming the repo root.
- *Step 3:* Gate `ecosystem.ts` so `maintenance` mode never writes `.slnx`, `Directory.Build.*`, or parent POMs.
- *Step 4:* Broaden test matching in `detect.ts` to `*Test*.cs` and `*Test*.java`, and remove `-Dsurefire.failIfNoSpecifiedTests=false` on single-module Maven projects so missing tests fail loudly.

**Session 2: Target-lock checks and IDE-safe hooks**
- **Reuse** `dabbler facts`, the `AGENTS.md` template, and the Session 1 planning prompt.
- *Step 1:* Add the `HEAD` diff target-lock check in `dabbler facts` for `.csproj`, `Directory.Build.props`, `packages.config`, `Web.config`, `pom.xml`, and `maven-wrapper.properties`.
- *Step 2:* Add a `dabbler facts` check ensuring new `.cs` files in non-SDK projects appear in `<Compile Include="..." />`.
- *Step 3:* Replace the "alignment" paragraph in Session 1's prompt when `mode: maintenance` with instructions to keep existing folders and targets.
- *Step 4:* Make the pre-commit hook exit `0` when invoked outside an active Dabbler step.

**Session 3: Non-SDK .NET Framework runner**
- **Reuse** `bootstrap/detect.ts` and the existing suite runner.
- *Step 1:* Inspect `.csproj` XML in `detect.ts` to distinguish `dotnet-framework` (non-SDK) from `dotnet` (SDK).
- *Step 2:* Resolve `MSBuild.exe` and `vstest.console.exe` via `vswhere.exe`, failing fast with a clear message if missing.
- *Step 3:* Wire `MSBuild.exe` + `vstest.console.exe /TestCaseFilter` into the suite runner.

**Session 4: Live walk against two real shop repositories**
- **Proves:** End-to-end maintenance without target drift or IDE breakage.
- *Step 1:* Run a one-step bugfix session on a real .NET Framework 4.x MVC (`packages.config`) repo; verify `dabbler facts` passes and `git diff` contains only the fix, test, and `<Compile Include>`.
- *Step 2:* Open that checkout in Visual Studio, build, run Test Explorer, and commit from Visual Studio's Git window.
- *Step 3:* Run a one-step fix on a real Spring Boot / Spring WAR repo (`*Tests.java`), then open and run tests in IntelliJ and Eclipse.

---

### 8. The one thing you would push back on

I would push back on **committing Dabbler's workspace files (`dabbler.yaml`, `.vscode/settings.json`, `AGENTS.md`, `CLAUDE.md`, `docs/sessions/`, `docs/planning/`) into shared legacy repositories where other staff do not use Dabbler.**

Goal 3 states that other IDE users must have *"nothing to learn or undo."* In a state IT shop, if a developer uses Dabbler for a 10-line bugfix in a .NET Framework 4.5 repo and opens a pull request containing six Dabbler config and session-ledger files, colleagues working in Visual Studio or Eclipse will push back on the repository noise—and two sessions of upfront prose planning is too heavy for routine maintenance. Give `maintenance` mode an option to keep Dabbler's state local (listed in `.git/info/exclude` rather than committed to `.gitignore` and the branch) so the git history contains only the code and test changes.