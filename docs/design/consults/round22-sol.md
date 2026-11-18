## 1. Where today’s design would break or disrupt each of the five frameworks

**.NET Framework MVC:** A non-SDK `.csproj` with `TargetFrameworkVersion=v4.x` is not a `dotnet test` project. It commonly needs Windows, MSBuild, framework reference assemblies, NuGet restore and a separate test runner. Generated `Directory.Build.props` can introduce incompatible compiler settings; `.slnx` may be unreadable by its Visual Studio. “Alignment” must not mean conversion or rearrangement.

**Modern .NET MVC:** `dotnet test` is plausible, but must respect `global.json`, repository configuration, solution selection and integration-test requirements. Nested solutions escape root detection. Automatically adding nullable settings, implicit usings or a newer solution format changes the existing contract. Planning should discover that contract, not impose module-per-folder.

**Plain Maven Java:** Root-only detection misses nested builds. `test` omits Failsafe integration tests normally reached through `verify`; naming-based selection misses custom Surefire includes. A generated parent POM changes inheritance, dependency resolution and compiler settings. Planning must preserve existing reactor boundaries, profiles and lifecycle commands.

**Spring Framework:** A WAR may depend on a particular JDK, servlet container, compiler configuration, Spring version and external test services. Neither the graph nor `mvn test` establishes those requirements. A parent scaffold can change them. Planning must inspect XML, annotations and deployment configuration without proposing Boot migration or package rearrangement.

**Spring Boot:** Preserve its parent/BOM, Boot plugin, JDK, packaging and wrapper. Root detection does not establish the supported Boot/JDK combination or integration-test command. A generated parent can disrupt dependency management. Planning must preserve the application’s existing shape, including Maven or Gradle where actually used.

## 2. Recognising an existing repository

Use **detected-then-confirmed**, before any repository write.

Search tracked files beyond the root: solutions, projects, POMs, Gradle files, source, tests, wrappers, CI scripts and build instructions. Exclude generated/vendor directories. Read imported build configuration, package manifests, SDK/JDK selection and IDE metadata. Source without recognised build files still means “existing code,” not permission to scaffold.

Show the developer the discovered projects, selected build entry point, toolchain and proposed verification commands. Ask about ambiguities.

Store the confirmed maintenance posture, relative entry points, commands and target baseline in **`dabbler.yaml`**. Keep machine-specific executable paths local.

Maintenance means: understand first, preserve layout and defaults, disable scaffolding, and replace the planning prompt’s “alignment” emphasis with “fit Dabbler to this repository.”

## 3. What the framework must NEVER write or alter in a maintenance repository, and what it may

- **Never automatically:** generate solutions, parent POMs, `Directory.Build.*`, wrappers or project conversions.
- **Never silently:** upgrade targets, language levels, build tools, package managers, test frameworks or deployment requirements.
- **Never overwrite:** IDE metadata, existing hooks, unmanaged guidance or existing settings.
- **Never restructure** merely to satisfy Dabbler’s preferred layout.
- **May, after confirmation:** add its configuration, scoped guidance and session records; merge only its own VS Code settings.
- **May:** edit application code, tests and necessary build configuration within the frozen contract.
- Target changes require a separately approved change and baseline update—not an AI-generated exception.

## 4. Holding the target constant

**Both**, with deterministic checks authoritative. Reuse `dabbler facts`; compare against the committed baseline before editing and before commit. Prompts explain constraints but cannot waive failures.

**.NET:** Parse every participating `.csproj`/`.fsproj`, imports and `Directory.Build.*`. Compare:

- Project style: SDK declarations, legacy XML namespace and `ToolsVersion`.
- `TargetFrameworkVersion`, `TargetFrameworkProfile`, `TargetFramework`, `TargetFrameworks`, `LangVersion`, `Nullable`, `ImplicitUsings`.
- `global.json` SDK selection and roll-forward policy.
- Package-manager form; test framework/adapter IDs and versions in `packages.config`, `PackageReference` and central package files.
- Existing solution format and build entry point.

Compare both declared presence/value and evaluated properties, using the repository’s MSBuild for supported configurations. This catches an absent setting acquiring a new inherited default. For non-SDK Framework projects, preserve legacy targets/imports and the evaluated `.NETFramework` target.

**Maven:** Compare raw POM configuration and the effective POM for supported profiles, generated outside the checkout. Check `maven.compiler.source`, `target`, `release`; compiler-plugin equivalents; parent coordinates; compiler/test plugin versions; and test-library identities/versions.

Compare compiler `jdkToolchain` and toolchains-plugin JDK requirements. Inspect the selected machine toolchain without committing personal `toolchains.xml`. Verify the actual compiler JDK; `mvn -version` alone only identifies Maven’s JVM.

Freeze `.mvn/wrapper/maven-wrapper.properties` distribution URL/checksums and wrapper files. Compare reported Maven version with the approved version; without a wrapper, record the required installed version. Preserve `.mvn` options and relevant profiles.

For Gradle repositories, apply equivalent checks to wrapper, Java toolchains and test dependencies. Unresolved configuration must block confirmation, not become a guessed baseline.

## 5. Building and testing .NET Framework 4.x (non-SDK) from the framework

Detect a **non-SDK project whose evaluated target is `.NETFramework` v4.x**. `packages.config` is supporting evidence, not the deciding test.

On Windows, locate MSBuild with:

```bat
vswhere.exe -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe
```

Alternatively use the repository’s supported Visual Studio Developer Command Prompt. Do not choose “latest” if the repository requires an older toolset.

A typical confirmed recipe is:

```bat
nuget.exe restore Legacy.sln -NonInteractive
"<MSBuild.exe>" Legacy.sln /m /t:Build /p:Configuration=Debug /p:Platform="Any CPU"
"<vstest.console.exe>" Tests\bin\Debug\Tests.dll
```

Substitute actual solution, configuration, output and runner paths. Supply `/TestAdapterPath:<directory>` when required. Existing NUnit/xUnit console recipes may be the correct runner instead; do not assume VSTest supports every suite.

The machine needs compatible Visual Studio **or Build Tools**, required workloads/web targets, reference assemblies, NuGet and test adapters. Old targets may need an older build host. Modern MSBuild’s packages.config restore support is optional, not an excuse to change an established recipe.

Without those tools, use an approved Windows runner or report verification blocked. Never silently substitute `dotnet test` or claim success with zero discovered tests.

## 6. IDE round-trip

- **Visual Studio:** Preserve `.sln`/`.slnx`, project files, imports, package files, shared settings and launch configuration. Leave local `.vs`/`.suo` state alone.
- **IntelliJ:** Preserve POMs/Gradle files, wrappers, committed `.idea`, `.iml` and shared run configurations. Do not force regeneration or replace project SDK settings.
- **Eclipse:** Preserve `.project`, `.classpath`, `.settings`, WTP configuration and build files. Maven importability does not justify deleting committed Eclipse configuration.

Dabbler’s guidance and `docs/` normally do not affect these IDEs. `.vscode/settings.json` must preserve unrelated settings and avoid committed personal paths. `.gitignore` additions must be narrow and reviewed.

Hooks are the main shared-workflow hazard: installation must be opt-in, preserve existing hooks and never make ordinary contributors install Dabbler to commit.

## 7. The simplest plan

**Session 1 — Recognition and safe posture**
1. Extend existing detection beyond the root.
2. Reuse `dabbler.yaml` for confirmation and baseline.
3. Delete scaffold eligibility in maintenance mode; revise planning guidance.

**Session 2 — Frozen contract**
1. Reuse graph/build readers for target extraction.
2. Add comparisons to existing facts/check execution.
3. Test legacy, modern, inherited and conflicting configuration fixtures—not exact prompt strings.

**Session 3 — Real build recipes**
1. Reuse suite configuration for working directory, command and runner.
2. Add Windows tool discovery and explicit missing-tool failures.
3. Correct Maven lifecycle and test-selection handling; require evidence of actual test execution.

**Session 4 — Walk a real old repository**
1. Establish its untouched baseline on the supported Windows host.
2. Bootstrap, make one small maintenance fix, build and run the full configured suite.
3. Reopen/build/test in Visual Studio; inspect the diff with a non-Dabbler contributor.

This proves legacy compatibility and non-disruption. Repeat the round-trip on representative Maven/Spring repositories before general release.

## 8. The one thing you would push back on

“After every session, everything compiles and all tests run in every IDE” needs a supported-machine and baseline qualification. Missing targeting packs, external services or pre-existing failures cannot be repaired by prompting.

Promise instead: **preserve the supported build contract, verify on approved environments, and never close successfully without the required evidence.**