# Consult: maintaining EXISTING .NET and Java repositories with Dabbler

## What Dabbler is (facts, verified against the source today)

Dabbler is an AI-led coding-session framework: a VS Code extension plus a
Node router (`dabbler <verb>`). A person plans sessions in prose; the
framework drives each session one instruction at a time; an AI engine
(Claude Code, GitHub Copilot CLI or Codex, opened in a terminal) makes the
edits; the framework runs each step's checks and the tests named after the
changed files, runs cross-provider verification (a reviewer from a different
vendor), commits, pushes and closes. Tests are evidence; nothing is
hand-edited into the record.

Today it is GREENFIELD-FIRST. What exists for a repository that already
holds code:

- **Detection** (`bootstrap/detect.ts`) reads only the repository ROOT. Any
  `*.sln`, `*.slnx`, `*.csproj`, `*.fsproj` at the root declares the
  ecosystem `dotnet` with the suite command `dotnet test` (narrowing:
  `dotnet test --filter A|B`, test files `*Tests.cs`). A root `pom.xml`
  declares `maven` with `./mvnw -q test` where a wrapper exists, else
  `mvn -q test` (narrowing `-Dtest=A,B -Dsurefire.failIfNoSpecifiedTests=false`,
  test files `*Test.java`). `build.gradle` declares `gradle` (whole suite
  only). The project STYLE is not read: an old-style non-SDK `.csproj`
  with `packages.config` is detected exactly like an SDK-style one.
- **The project graph** (`projectGraph.ts`) is read from the build files
  and from nothing else: the root `.slnx`/`.sln` (or every `.csproj` below
  the root where there is none) and each project's `<ProjectReference>`;
  the root `pom.xml`'s `<modules>` recursively and each module's sibling
  `<dependency>`. The Solution Explorer in VS Code is drawn from it.
- **Root-file scaffold** (`ecosystem.ts`) runs before a step's checks and
  only when the graph has MORE THAN ONE project AND the root holds no
  solution file / parent POM. For .NET it writes `<Name>.slnx` (readable by
  SDK 9.0.200+ and VS 2022 17.13+ only), `Directory.Build.props` with
  `<Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings>`,
  an empty `Directory.Build.targets`, and `bin/`/`obj/` ignore rules. For
  Maven it writes a parent POM with `<maven.compiler.release>` and
  `target/` ignore rules. Existing files are never rewritten.
- **What bootstrap writes into a repository**: `dabbler.yaml` (suites,
  checks), `.vscode/settings.json` (the committed choices: engine, models,
  transport, release mode), `AGENTS.md` + `CLAUDE.md` (managed guidance),
  `docs/sessions/` (plan, ledger), `docs/planning/`, a few `.gitignore`
  lines, and a git pre-commit guard.
- **Planning**: session 1's prompt asks the developer how production is
  split across tiers (app -> API -> database, or app -> database), what
  the modules are and their contracts, and the phases. It carries one
  paragraph for an existing solution: read its structure before planning,
  say whether it suits the module-per-folder layout, plan the first
  sessions as "alignment" (Dabbler's documents, suites and boundaries
  fitted to the projects that exist) before any feature work, and
  restructuring is the operator's to approve. Session 2 challenges the
  plan and decomposes it into numbered sessions.
- **Checks**: each session step can declare checks (`dabbler.yaml`);
  `dabbler facts` runs deterministic controls; the verifier (another
  vendor's model) reads the diff and the evidence and returns findings
  that the author must dispose of. A deterministic check is preferred to a
  prompt rule wherever one can be written.
- Ground rules that stand: no new module without deleting one; one
  implementation of any rule; no tests of exact markdown strings; comments
  state constraints, not history; try removing before adding.

## The people and the repositories

A state IT shop. Staff are starting to use Copilot (through Dabbler) to
MAINTAIN existing repositories, mostly old: **.NET Framework 4.5+ MVC**
(non-SDK `.csproj`, `packages.config`, built by Visual Studio / MSBuild),
**.NET Core / modern .NET MVC**, **plain Maven Java**, **Spring Framework
(XML/annotation, WAR)**, and **Spring Boot**. A developer moves between VS
Code (where Dabbler runs) and Visual Studio, IntelliJ or Eclipse on the
same checkout, sometimes in the same day. Other staff on the same
repositories may never use Dabbler at all.

## The goal

1. Dabbler recognises that an existing repository holds code and lets the
   developer do maintenance or enhancement work in it.
2. Every session KEEPS the existing target: the same target framework or
   JDK, the same project format, the same package manager and build tool,
   the same test framework. No silent upgrades, no `.slnx` beside a `.sln`,
   no SDK-style conversion, no `ImplicitUsings` on a C# 7.3 project.
3. After any session, the solution compiles and all tests run in VS Code
   AND in Visual Studio / IntelliJ / Eclipse, with nothing the other IDE's
   users must learn or undo.
4. The Solution Explorer need not understand every framework. The AI must
   be HELPED to make its fixes within the existing shape.

## Answer in exactly this shape, under about 1500 words, plain language

1. **Where today's design would break or disrupt each of the five
   frameworks.** Be concrete: file formats, commands, toolchain
   requirements, the scaffold, the planning prompt. One short paragraph per
   framework.
2. **Recognising an existing repository.** What should be READ to decide
   "this is maintenance, not greenfield", what posture follows, and whether
   it is detected, asked, or detected-then-confirmed. Where does the answer
   live (a file? which one?).
3. **What the framework must NEVER write or alter in a maintenance
   repository, and what it may.** A list.
4. **Holding the target constant.** Is this a deterministic check, a prompt
   rule, or both? Give the exact check(s) you would write (what file, what
   element, what comparison), per ecosystem, including the non-SDK .NET
   Framework case and the Maven JDK case (`maven.compiler.source/target/
   release`, toolchains, the wrapper's Maven version).
5. **Building and testing .NET Framework 4.x (non-SDK) from the framework.**
   The exact command(s), what must be on the machine, how to find it
   (vswhere? Developer Command Prompt?), how to detect that this is the
   case rather than `dotnet test`, and what to do on a machine without
   Visual Studio.
6. **IDE round-trip.** Per IDE (Visual Studio, IntelliJ, Eclipse): which
   files in the repository that IDE relies on, which Dabbler must leave
   alone, and whether anything Dabbler writes (`.vscode/settings.json`,
   `AGENTS.md`, hooks, `.gitignore` lines, `docs/`) interferes.
7. **The simplest plan.** Three to six sessions, each three to six steps,
   to deliver this. Name what to DELETE or REUSE rather than add. Say which
   session is a walk against a real old repository and what it proves.
8. **The one thing you would push back on** in the goal as stated.
