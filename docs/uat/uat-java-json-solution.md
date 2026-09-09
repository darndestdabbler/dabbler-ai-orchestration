# UAT — build the JSON solution with Java, Maven and Spring

**What you are testing.** That a person can build a small multi-module Maven
solution using Dabbler's own buttons, start to finish, following only what is
written here.

**What you are building.** A program that reads a JSON file of items and
stores them in SQLite. Three modules: the item type, the store, and the loader.

**How long.** About an hour, most of it waiting for AI sessions.

---

## How to read a step

Every numbered step is written in three registers, and they are what this
document is for.

- **Framework —** what Dabbler has *already* done by the time you get here,
  and at which moment of the lifecycle it did it.
- **You —** what you do in the UI: the exact command title as it appears in
  the palette or on a tree row, and the exact answers to type.
- **Underneath —** the command that operation generates: your fallback
  outside VS Code, and what to check when a button surprises you.

A step that cannot fill all three says so in place of the register it is
missing — **No framework register —**, **No UI register —** or **No command
underneath —** — and names whose gap it is: lifecycle-timed and constant
means the **framework** should run it, constant but optional means the **UI**
should offer it, and a **person's** judgement means neither and there is no
gap at all.

**Bold in the second register is a command title and nothing else** — prompt
titles are in *italics*, the answers you type are in `code`. That convention
is read by `packages/router/scripts/check-uat-registers.mjs`, which holds
every button named here to one the extension contributes.

`docs/uat/uat-dotnet-json-solution.md` is the same walk in .NET; the two
share every register that is not about Maven.

---

## Read this first — how much of this has been proven

This matters for judging what you find.

**Walked end to end on 7 September 2026** for one module, including the AI
session loop, which had never been run against Maven before. That walk found
six defects in the framework and three in this document; all nine were fixed
in sessions 113, 115 and 116.

**Re-walked on 8 September 2026** for everything an operator touches —
set-up, the manifest, bootstrap, the POM, the first pack and its
`.gitignore`, the pin, the plan's `Module:` line, a real focused
registration, `mvn -B test` inside the focused checkout, and the re-open of a
kept folder. That walk did not re-run the AI's own work, and it found ten
product defects and eight document errors across both walkthroughs;
`docs/uat/uat-walk-findings.md` is its record. What you are reading is the
corrected version, with each surviving gap labelled in the register it
belongs to.

**Where your findings are worth most now:** step 10 — the second and third
modules, a module consuming a sibling as a package, and running the loader
twice. The consumer side of a Maven solution has still never been driven by a
session.

---

## Prerequisites

There are two ways to pay for the models this walkthrough runs. **Read part A
or part B — whichever matches how your models are paid for.** Everybody reads
the first part.

### What every run needs

```
java -version
mvn -version
git --version
node --version
dabbler version
```

**Expect:** a JDK version, Maven 3.9 or newer, a git version, node 22+, and a
`dabbler-ai-router` version. If `dabbler` is not found, that is a PATH
problem: open a terminal from VS Code with the extension installed, or run
`node "<extension dir>/dist/dabbler.cjs"` instead.

**Note your JDK version, because step 5 checks it.** On the reference machine:

```
openjdk version "17.0.9" 2023-10-17 LTS
Apache Maven 3.9.2
```

Maven may run on a different JDK from the one `java -version` reports, and
that is fine — step 5 checks against `java -version`, which is what Dabbler
asks.

**These five are the one diagnostic Dabbler does not run for you.**
**Dabbler: Troubleshoot** is the diagnostic command and covers activation, a
stuck session, worktrees, a missing API key, cost and the folder layout — not
the toolchain. A **UI** gap: constant and optional is the definition of a
button. Walk finding 6.

### A — you have a GitHub Copilot seat

No API keys of your own: the seat pays, in premium requests. Nothing here
reads `DABBLER_ANTHROPIC_API_KEY` or its siblings.

```
copilot --version
echo %DABBLER_TRANSPORT%
```

**Expect** a Copilot CLI version, and `copilot-cli`. If the second is empty,
either set it, or add `--transport copilot-cli` to the **first** `dabbler
session next` of each session — the transport is kept from there.

**Your session names its model, and that is not optional.** The Start Session
flow asks for it and refuses to launch a seat without one; Dabbler resolves
it through its registry and refuses a model it does not know, because a
seat's own label does not say which vendor answered.

**Think in pairs, not in single models.** A different provider always checks
the session's work, so the verifier comes from the seat's models *excluding
your engine's vendor*. An engine on a weight-1 Anthropic model leaves the
verifier free to be a zero-weight GPT; an engine on a zero-weight GPT forces
the verifier onto Anthropic or Google, where the cheapest confirmed model is
1 and the dearest 15. The full weight table is in
`docs/uat/uat-dotnet-json-solution.md`.

### B — you have direct API keys

Each vendor bills your own account, per token. You need all three, because
the verifier is always a different vendor from the engine:

```
DABBLER_ANTHROPIC_API_KEY
DABBLER_OPENAI_API_KEY
DABBLER_GEMINI_API_KEY
```

```
echo %DABBLER_TRANSPORT%
```

**Expect** empty. If it says `copilot-cli`, that machine is set up for part A
and the seat will be billed; add `--transport api` to the **first** `dabbler
session next` of the session.

---

## Step 1 — Make the project

- **Framework —** nothing yet; there is no repository for it to have acted in.
- **You —** with no folder open, run **Dabbler: Set Up New Project**. Two
  prompts:
  *`New Dabbler project — where should it go?`* — pick `C:\temp`.
  *`New Dabbler project — what is it called?`* — type `uat-java`.
  It makes the folder, initialises the repository through VS Code's own git,
  runs bootstrap, commits what bootstrap wrote, and opens the new window.
  When that window offers `Start session 1`, choose `Later`: this walkthrough
  writes its own plan.
- **Underneath —**
  ```
  mkdir C:\temp\uat-java
  cd C:\temp\uat-java
  git init -b master
  dabbler bootstrap --no-transport-detect
  ```

**Expect bootstrap to say what it wrote, and that it committed it:**

```
bootstrap: wrote managed section in AGENTS.md
bootstrap: wrote managed section in CLAUDE.md
bootstrap: wrote managed section in GEMINI.md
bootstrap: added .dabbler/ to .gitignore
bootstrap: installed the step-execution commit guard at .git\hooks\pre-commit
bootstrap: scaffolded dabbler.yaml
bootstrap: it declares no test suite, because nothing at the root of this repository
           says how its tests run; declare one before the first session that writes code
bootstrap: no packaging declared -- no .csproj or pom.xml at the repository root, so
           there is nothing here that says what a package would be built from.
bootstrap: scaffolded docs\sessions\session-plan.md
bootstrap: committed 6 file(s) it wrote; the declaration a session makes comes before
           its work, so session 1 would be refused while they sat uncommitted.
```

**Do not commit anything here** — bootstrap has committed its own files and
said so. Both of the other two lines matter: **no test suite** and **no
packaging**, because at this moment there is no POM anywhere. Step 6 declares
the suite; the packaging line stays true and is not a problem, because a
Maven module publishes through its own lifecycle.

---

## Step 2 — Give the repository a remote

- **No framework register —** a gap the **framework** should close, at
  set-up. The land runs a bare `git push`, the close reads
  `pushed_to_remote`, and a focused checkout is cloned *from the origin*, so
  the first session can neither start nor close without one. The URL is the
  one parameter Dabbler cannot determine, which is a prompt rather than four
  lines of shell. Walk finding 5.
- **No UI register —** and it is the framework's rather than the UI's, for
  the reason above. **Dabbler: Say Where This Repository Is (Remote)** looks
  like the answer and is not: it records a *sibling repository's* URL for the
  solution graph and runs no `git remote` at all.
- **Underneath —**
  ```
  git init --bare C:\temp\uat-java.origin.git
  git remote add origin C:\temp\uat-java.origin.git
  ```

**Expect:** `Initialized empty Git repository`. Step 7 sets the upstream.

---

## Step 3 — Declare the three modules

- **Framework —** nothing here; which modules a solution has is yours. What
  it derives from your answers is the other direction: you write only
  `depends on`, and *used by* is worked out from it.
- **You —** run **Dabbler: New Module** three times:

  | prompt | model | store | app |
  | --- | --- | --- | --- |
  | `New module (1/2): slug` | `model` | `store` | `app` |
  | `New module (2/4): display title` | `Item model` | `SQLite store` | `JSON loader` |
  | `New module (3/4): kind` | `shared-types` | `library` | `application` |
  | `New module (4/4): depends on` | *(leave blank)* | `model` | `model, store` |

  (The first prompt really is titled `1/2` while the rest count to four —
  walk finding 8.)
- **Underneath —**
  ```
  dabbler modules create . --slug model --title "Item model" --kind shared-types --code-root modules/model --package com.example:json-model
  dabbler modules create . --slug store --title "SQLite store" --kind library --code-root modules/store --package com.example:json-store --depends-on model
  dabbler modules create . --slug app --title "JSON loader" --kind application --code-root modules/app --package com.example:json-loader --depends-on model --depends-on store
  ```

**The CLI form carries two values the button does not ask for**, and they are
the two a module cannot work without: the **code root** and the **package**.
A module made from New Module's four answers refuses both of the operations
that make it a module:

```
dabbler module pack model
  -> module pack: refused -- module 'model' declares no package; give it one in docs\modules.yaml

dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  -> start: refused -- module 'model' declares the repository root as a code root;
     a focused checkout of everything is the full checkout, so open the repository itself
```

That is walk finding 1 — the **UI**'s to close with two more prompts, or the
framework's to default from the slug. Until then, if you used the button,
open `docs\modules.yaml` and add `codeRoots` and `package` per module by
hand. **Java package names are `groupId:artifactId`, with a colon.**

**Expect the last create to print exactly:**

```
{"slug": "app", "title": "JSON loader", "kind": "application", "codeRoots": ["modules/app"], "dependsOn": ["model", "store"], "package": "com.example:json-loader"}
note: no module holds a project file yet, so the root build files wait for the first one that does
```

That note is the important part. Dabbler decides whether this is a .NET or a
Java solution by looking for a project file — a `.csproj` or a `pom.xml`.
Until one exists it writes no root files at all, which is why the next step
comes before anything else.

**Check what it recorded** in the **Solution Explorer**: three module rows,
each with its kind, its *Depends on* and its *Used by*. The CLI form of the
same view is `dabbler modules show .`.

---

## Step 4 — Write the first module's POM

- **No framework register —** and no gap: the POM's three load-bearing lines
  are a person's judgement, and this walkthrough wants you to see them.
  (`dabbler module contract` scaffolds the `-api` and `-contract-tests` POMs
  for a *designed* contract; nothing scaffolds a module's own POM.)
- **No UI register —** for the same reason. Writing a POM is a **person's**
  judgement.
- **No command underneath —** this is a file you author.

Create `modules\model\pom.xml` with exactly this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>com.example</groupId>
    <artifactId>solution-parent</artifactId>
    <version>${revision}</version>
    <relativePath>../../pom.xml</relativePath>
  </parent>

  <artifactId>json-model</artifactId>
  <packaging>jar</packaging>
</project>
```

**Three things about this file are load-bearing. Copy it exactly.**

1. It has a `<parent>` reached by `relativePath`. That is how a focused
   checkout holding only this module still builds.
2. It has **no `<version>` of its own**. The version comes from the parent's
   `${revision}`.
3. `${revision}` is what `dabbler module pack` replaces with the dev version.

**If you give the module a literal version instead**, packing fails with:

```
module pack: refused -- the pack of modules/model/pom.xml left no
com/example/json-model/0.1.0-dev.../json-model-0.1.0-dev....jar in packages/
```

which is Maven building the version you wrote rather than the one asked for.

**That is the whole step: the POM and nothing else.** A Maven module with no
Java source packs perfectly well, and the `Item` class is what session 1
writes — its plan says so. Writing it here instead means session 1's own diff
contains no `Item`, and the model that checks the session's work reads the
diff: on the reference run it reported the session's only deliverable
missing, as a blocking fault, and the round was spent disputing it.

---

## Step 5 — Pack the module, and check the three lines it writes

- **Framework —** this is a moment the framework already owns. At the
  **candidate** of every session, before the run of record, it packs the
  module itself; **Dabbler: Pack Module** is the same operation out of band,
  so the *next* session can consume the package. The first pack in a
  repository is also where the ecosystem becomes known, so it writes the root
  build files then — the root `pom.xml`, the feed's files, and the
  `.gitignore` rule for Maven's own output.
- **You —** **Dabbler: Pack Module** on the `model` row in the Solution
  Explorer. It reports one line: `model: packed model 0.1.0-dev.…`.
- **Underneath —**
  ```
  dabbler module pack model
  ```

**Expect it to write four things first, then pack:**

```
wrote pom.xml
wrote packages/.gitattributes
wrote packages/README.md
updated .gitignore
packed model 0.1.0-dev.20260908.1.ga6aac5f
  packages/com/example/json-model/0.1.0-dev.20260908.1.ga6aac5f/json-model-0.1.0-dev.20260908.1.ga6aac5f.jar
pinned com.example:json-model in pom.xml
recorded packages/com.example+json-model.0.1.0-dev.20260908.1.ga6aac5f.json
```

The button shows only the `packed` line; the CLI shows all eight.

**Check three things, in this order.**

**One — the compiler release in the root `pom.xml` it just wrote:**

```xml
<maven.compiler.release>17</maven.compiler.release>
```

**The number must be your own JDK's** — what `java -version` printed in the
prerequisites — and above it a comment saying it came from that JDK. Dabbler
asks the JDK doing the scaffolding, because a release your compiler cannot
produce fails every build afterwards. If no JDK could be run at all the
comment says so and the file takes a stated default of 17. This file is
written once and never rewritten, so raising it later is your edit to make.

**Two — what `updated .gitignore` appended:**

```
# Maven's own output, which lands inside the module it built. A module's source
# digest is taken over its code roots, so an unignored target/ makes the same
# source pack to a new dev version every time.
target/
.flattened-pom.xml
```

That rule is why the next check passes. (The .NET walkthrough has no
equivalent line, and its step 9 is the whole cost of not having it — walk
finding 3.)

**Three — the pack is repeatable.** Run `dabbler module pack model` twice
more with nothing changed and expect the **same version** all three times.
Then check the pin really moved, in the file line three named:

```
findstr /C:"json-model" pom.xml
```

**Expect** it inside `<dependencyManagement>` in the root `pom.xml`, at that
version. A message naming any other file — the .NET
`Directory.Packages.props`, say — is worth reporting.

**Also expect,** on Windows and node 22 or newer, a line of noise after the
pack:

```
(node:55824) [DEP0190] DeprecationWarning: Passing args to a child process with
shell option true can lead to security vulnerabilities...
```

`mvn` is a batch file, so the router takes a shell path node has deprecated.
It is walk finding 9 and it is harmless today; **do not report it as new.**

**The jar's layout is worth a glance too:** a normal Maven repository layout
under `packages\`, with the group id as folders, and the record filename
carrying a **plus sign** where the package name has a colon, because a colon
is not allowed in a Windows filename.

---

## Step 6 — Declare the suite, and which tests cover which code

- **Framework —** at bootstrap it read the folder for something that said how
  tests run, found nothing — there was no POM yet — and told you so rather
  than emitting a command that would fail on first use. It does not come back
  to ask, and the moment it could is the pack you just ran, when the
  ecosystem became known. That it does not is walk finding 10.
- **No UI register —** nothing offers this. It is constant-with-parameters
  and lifecycle-timed, so it is the **framework**'s to close.
- **No command underneath —** you edit `dabbler.yaml`.

The scaffolded `dabbler.yaml` has **no `testing:` key at all** — only a
commented example. Add one, with both halves:

```yaml
testing:
  suites:
    - name: maven
      command: mvn -B test
      expensive: true
      covers:
        - modules/
      test_roots:
        - modules/model/src/test
        - modules/store/src/test
        - modules/app/src/test
      test_glob: "*Test.java"
  selection:
    rules:
      - when: modules/store/src/main/
        select:
          - modules/store/src/test/java/com/example/store/ItemStoreTest.java
```

**Both halves, and neither on its own.** The suite is the command the run of
record runs; the rule maps a changed source file to the tests that exercise
it. `covers:` does **not** select tests — in the .NET reference run two
sessions closed green having run no tests at all with `covers:` set — and a
rule with no suite behind it selects tests that nothing runs.

**Check it:**

```
dabbler affected --path modules/store/src/main/java/com/example/store/ItemStore.java
```

**Expect** a line containing `configured-rule` naming your test — and **read
the line after it.** With the rule and no suite you get the pass *and* this:

```
no suite is declared, so there is no command to run. Declare one under
testing.suites in dabbler.yaml: a name, the command that runs it, and the paths it covers.
```

which is the walkthrough's own check reading as green over an empty run of
record. If instead it says `no tests affected by this change set`, the rule
is wrong.

**Dabbler: Show Impact** on a module row shows the same plan for that
module's roots.

---

## Step 7 — Commit and push what you wrote

- **No framework register —** a gap the **framework** should close, at the
  declaration. `session start` refuses a working tree that carries changes,
  and steps 3 to 6 have written files nobody has committed — including
  `docs\modules.yaml`, which bootstrap did not commit because `modules
  create` wrote it after bootstrap ran, and the root `pom.xml` and
  `packages\` the pack wrote. Walk finding 2.
- **No UI register —** Start Session does not offer the commit, and nothing
  sets the upstream that the land's bare `git push` needs. It is the
  framework's to close, at the same moment it refuses the tree.
- **Underneath —**
  ```
  git add -A
  git commit -m "The JSON solution, declared"
  git push -u origin master
  ```

Write the session plan first — copy the whole `docs\sessions\session-plan.md`
block from `docs/uat/uat-dotnet-json-solution.md` step 4, which includes the
simplicity rule and the `**Module:**` line under each session heading.

**That `Module:` line is load-bearing.** It is what makes each session
*focused* — run in that module's own folder, with the other modules present
as packages and contract folders rather than source. Dabbler reads it, the
Work Explorer's yet-to-run rows say `focused: model`, and Start Session needs
no further question.

**The simplicity rule is not decoration either.** A different AI model checks
each session's work and does not share your intentions. Without the rule
written down it reports "no error handling" and "no abstraction" as faults
and the session argues with itself for rounds.

**If you skip the commit, the next step refuses:**

```
start: refused -- the working tree carries N change(s) (...); the module's clone is
       made from the origin, so commit and push them before starting the session
```

---

## Step 8 — Run session 1

- **Framework —** at registration it pulls your checkout forward from
  `origin/master`, reads the plan's `Module: model` line, decides the session
  is **focused**, makes the module's own folder by cloning the origin into
  it, writes the exposure manifest there, and registers session 001 in that
  folder's ledger. You do not run `module open` first — the registration is
  what makes the folder.
- **You —** in the Solution Explorer, **Dabbler: Start Focused Session** on
  the `model` row. Two prompts:
  *`Start session — which engine runs it?`* — pick `Claude Code`
  (`anthropic`) or `GitHub Copilot` (`openai — a seat also needs a
  model`). `Codex` (`openai — untested`) is offered and accepted, and is
  marked because no session has been driven through it.
  *`Start session — model for <engine>`* — blank for the engine's default;
  on a seat, the model, e.g. `gpt-5.4`.
  The module's window opens with the AI's terminal running and the opening
  sentence typed. From the repository row, **Dabbler: Start Session** does
  the same when the next session is focused, and **Dabbler: Resume Session**
  brings the terminal back if you lose it.
- **Underneath —**
  ```
  dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  dabbler session next --sessions-dir docs/sessions
  ```

**Expect the start to say where it put the session:**

```
start: pulled from origin/master (git pull --ff-only) before registering.
start: session 001 of sessions registered (claude-code) in module 'model's focused
       checkout at C:\temp\uat-java.model; the exposure manifest is written there.
```

**Then the AI keeps running `dabbler session next` until it answers `done`.**
That loop is the engine's. When an answer's `"kind"` is `"wait"`, the engine
calls `next` again itself; nothing notifies it and no timer runs. What tells
**you** the call is not being made is the Dabbler terminal's silence watcher
and the Work Explorer's attention row.

**Do not press Start Focused Session again while it runs.** It refuses over
`docs/sessions/sessions.json` — the ledger the framework itself just wrote —
and tells you to commit or discard it. Do neither: that file is the router's
and never yours. Walk finding 4.

---

## Step 9 — Check the checkout the session is working in

- **Framework —** it made this folder at the registration and wrote the
  exposure manifest into it, and at the **close** it will push from here and
  pull your repository forward (`git pull --ff-only`) so the window you
  started in sees the session closed. You no longer run that pull yourself —
  unless your repository holds uncommitted changes, in which case the close
  prints the command for you to run instead.
- **You —** **Dabbler: Open Module** on a module row opens the same folder
  without starting anything, for when you want to look at a module rather
  than work in one.
- **Underneath —**
  ```
  dir C:\temp\uat-java.model\modules
  type C:\temp\uat-java.model\.mvn\maven.config
  mvn -B test
  ```

**Expect** the first to show only `model` — the siblings are here as their
contracts and their packages, never as source; the second to contain exactly

```
-f
modules/model/pom.xml
```

and the third to build and exit `0` from the folder's root, because that
config file tells Maven which POM to use and it resolves
`com.example:json-model` out of `packages\` rather than compiling it.

**Expect the folder to stay clean after the build**, because step 5's
`.gitignore` rule keeps `target/` out of it. The one thing `git status` shows
is `docs/sessions/sessions.json`, the ledger — see step 8's last paragraph.

---

## Step 10 — Repeat for the other two modules

- **Framework —** as step 8, once per module: the plan's `Module:` line for
  session 2 is `store` and for session 3 is `app`, so each start makes that
  module's folder and registers there. The folder is kept between sessions —
  a clean one is fetched and reset, a dirty one is refused by name, and
  nothing is ever deleted.
- **You —** **Dabbler: Start Focused Session** on the `store` row, then on
  the `app` row when session 2 has closed; **Dabbler: Pack Module** on each
  when its session is done.
- **Underneath —** the same two commands as step 8, per module.

Each module needs a short `modules\<slug>\contract\README.md`; declaring
`contract: package` does not skip it, and without one the session refuses
near the end.

---

## Step 11 — Run what you built

- **No framework register —** running the program you built to see whether it
  works is a **person's** judgement, and the last thing that should be
  automated.
- **No UI register —** for the same reason: a person's judgement, not a gap.
- **No command underneath —** this is Maven and the JVM, not Dabbler.

Run the loader twice against the same file.

**Expect** the first run to report three read and three stored, and the
second to report three read and **none** stored, because SKU is the key.

---

## Where Spring fits

Keep Spring out of the model and the store — they are a data class and a small
piece of JDBC, and adding a framework to them is exactly the over-engineering
the simplicity rule forbids.

Use Spring Boot for the **app** module only, as a `CommandLineRunner` that
reads the file and calls the store. That gives you one Spring module and two
plain ones, which is also the honest shape for a solution this size.

---

## What to write down

For each step: whether the expected output matched, and if not, exactly what
you saw. **Say which register was wrong** — the framework did something it
was not said to do, a button was not where it was said to be, or the command
underneath did not match what the button ran. Steps 10 and 11 are the ones
nobody has run against Maven yet, so detail there is worth most.

## Known issues — do not report these as new

Each was found by walking this document on 8 September 2026 and is written up
in `docs/uat/uat-walk-findings.md` with its reproduction.

- **New Module asks four of a module's six values** (step 3). Finding 1.
- **Bootstrap does not commit the modules manifest** (step 7). Finding 2.
- **Re-opening a module refuses over `sessions.json`** (step 8). Finding 4.
- **Nothing in the UI sets the remote or the upstream** (steps 2 and 7).
  Finding 5.
- **Troubleshoot runs no toolchain checks** (prerequisites). Finding 6.
- **The node deprecation warning after a Maven pack** (step 5). Finding 9.
- **No test suite is ever declared for you** (step 6). Finding 10.
- **The Chat panel** takes the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.

The two defects this document used to list here — the pack message naming a
.NET file, and the root POM targeting Java 21 on every machine — were fixed in
session 113 and are checks in step 5 now. Report them if you see them.
