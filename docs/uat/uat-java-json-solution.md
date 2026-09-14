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
`.gitignore`, the pin and the plan's `Module:` line. That walk did not re-run the AI's own work, and it found ten
product defects and eight document errors across both walkthroughs;
`docs/uat/uat-walk-findings.md` is its record. What you are reading is the
corrected version, with each surviving gap labelled in the register it
belongs to.

**Where your findings are worth most now:** step 9 — the second and third
modules, a module depending on a sibling in the same reactor, and running the
loader twice. The consumer side of a Maven solution has still never been driven by a
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

No API keys of your own: the seat pays, in **AI credits, per token**. Nothing
here reads `DABBLER_ANTHROPIC_API_KEY` or its siblings.

```
copilot --version
```

**Expect** a Copilot CLI version. Then tell this checkout to use the seat:

```
dabbler configure --transport copilot-cli
```

**Nothing sets `DABBLER_TRANSPORT` for you.** That variable outranks every
configuration layer on the machine, so one repository's set-up used to change
how every other one routed. If it is already set, `configure` says so and
says which value wins.

**Your session names its model, and that is not optional.** The Start Session
flow asks for it and refuses to launch a seat without one, because a seat's
own label does not say which vendor answered.

**What you may name is read from your seat, not from a list Dabbler ships.**
Step 0 reads it, free, and everything below assumes you have.

### B — you have direct API keys

Each vendor bills your own account, per token. Set the keys you have:

```
DABBLER_ANTHROPIC_API_KEY
DABBLER_OPENAI_API_KEY
DABBLER_GEMINI_API_KEY
```

Then tell this checkout to use them:

```
dabbler configure --transport api
```

**A reviewer on a different vendor from the engine is a label and no longer a
refusal.** Dabbler tells you whether the model you are choosing is on the same
provider as the one authoring, and lets you decide. Two keys are enough to
have the choice; three give you more of it. If `DABBLER_TRANSPORT` says
`copilot-cli` in your environment it outranks the line above and the seat is
billed — `configure` says so when it happens.

---

## Step 0 — Read what this machine can reach

**Nothing ships a model list.** Dabbler used to carry one inside the
extension — fourteen names, chosen by hand — and a list that travels in a
package is a list about somebody else's machine. What you may choose is read
from *your* seat and *your* keys, into one file on this machine, and reading
it is free on both transports: a vendor's models endpoint is a metadata
request, and a seat states its own models in the reply to opening a
conversation. No prompt is sent and no token is billed.

Do this once per machine, before the first session.

- **Framework —** nothing yet: this is a machine-level reading rather than a
  repository one, and there is no repository at this point for the framework
  to have acted in. From the first session onwards it re-reads a record that
  has gone stale at the start of a session, for nothing, and says when it did.
- **You —** run **Dabbler: Update the Catalog** from the Configuration
  section of the Dabbler pane. It asks once, says what it costs — nothing —
  and runs in a terminal you can watch. On your first time through there is no
  repository open yet, so take it from the command line; the button is what
  you use every time after this one.
- **Underneath —**
  ```
  dabbler discovery refresh
  ```

**Expect two lines and a summary, with your machine's numbers rather than
these:**

```
discovery: the seat block has been re-read -- 26 model(s) the seat lists, free, no prompt sent
discovery: the api block has been re-read -- 196 model(s) recorded, no tokens billed
refresh: the catalog has been re-read where this machine could be read ...
```

**A transport you do not have is skipped and says so**, and it never empties
the block for the one you do — a seat with no provider keys re-reads the seat
alone, and keys with no seat leave the seat's block exactly where it was.
*Unread* is not *empty*.

**The reading is yours alone.** The file records whose seat and which set of
keys it was taken with, and a block recorded for a different seat or key set
reads as unread rather than believed, whatever its age. Copying the file
between machines achieves nothing.

**Refresh between sessions, not during one:** a session that changed its own
reviewer pool while running would have edited the conditions of its own
review, so the refresh is refused while one is in flight and says why. And the
list you just read is exactly what **Dabbler: Set the Primary Reviewer's Model** offers and what
`dabbler configure --reviewer-model` accepts — one reading, so the pane cannot
offer a model the command would refuse.

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
  dabbler bootstrap
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
  set-up. The land runs a bare `git push` and the close reads
  `pushed_to_remote`, so the first session cannot close without one. The URL is the
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

**The CLI form carries two values the button does not ask for**: the **code
root**, which the button defaults to `modules/<slug>`, and the **package**,
which it defaults to the slug. If you used the button, open
`docs\modules.yaml` and set each `package` by hand. **Java package names are
`groupId:artifactId`, with a colon.**

**Expect the last create to print exactly:**

```
{"slug": "app", "title": "JSON loader", "kind": "application", "codeRoots": ["modules/app"], "dependsOn": ["model", "store"], "package": "com.example:json-loader"}
note: no module holds a project file yet, so the root build files wait for the first one that does
```

That note is the important part. Dabbler decides whether this is a .NET or a
Java solution by looking for a project file — a `.csproj` or a `pom.xml`.
Until one exists it writes no root files at all, and nothing comes back to
write them later: step 5 is where you write the parent POM.

**Check what it recorded** in the **Solution Explorer**: three module rows,
each with its kind, its *Depends on* and its *Used by*. The CLI form of the
same view is `dabbler modules show .`.

---

## Step 4 — Write the first module's POM

- **No framework register —** and no gap: the POM's three load-bearing lines
  are a person's judgement, and this walkthrough wants you to see them.
  Nothing scaffolds a module's own POM.
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
    <version>0.1.0-SNAPSHOT</version>
    <relativePath>../../pom.xml</relativePath>
  </parent>

  <artifactId>json-model</artifactId>
  <packaging>jar</packaging>
</project>
```

**Two things about this file are load-bearing. Copy it exactly.**

1. It has a `<parent>` reached by `relativePath`.
2. It has **no `<version>` of its own**. It takes the parent's, which is what
   lets a sibling depend on it at `${project.version}` in the same reactor.

**That is the whole step: the POM and nothing else.** A Maven module with no
Java source builds perfectly well, and the `Item` class is what session 1
writes — its plan says so. Writing it here instead means session 1's own diff
contains no `Item`, and the model that checks the session's work reads the
diff: on the reference run it reported the session's only deliverable
missing, as a blocking fault, and the round was spent disputing it.

---

## Step 5 — Write the parent POM

- **No framework register —** and this is a gap the **framework** should
  close. It writes the parent POM from `dabbler modules create` only when a
  module already holds a POM, and here the modules were declared first, so
  nothing wrote it and nothing comes back to.
- **No UI register —** nothing offers it; the **framework**'s to close, for
  the reason above.
- **No command underneath —** this is a file you author.

Create `pom.xml` at the root with exactly this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.example</groupId>
  <artifactId>solution-parent</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <packaging>pom</packaging>

  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>17</maven.compiler.release>
  </properties>

  <modules>
    <module>modules/model</module>
  </modules>
</project>
```

**Check two things.**

**One — the compiler release.** Set `maven.compiler.release` to your own
JDK's major release — what `java -version` printed in the prerequisites. A
release your compiler cannot produce fails every build afterwards.

**Two — Maven's output is ignored.** Add one line to `.gitignore`:

```
target/
```

Untracked build output is a change the declaration counts, so without it the
next `session start` is refused.

**The parent lists every module.** Add `<module>modules/store</module>` and
`<module>modules/app</module>` when their POMs exist. A module depends on a
sibling at `${project.version}`, and one `mvn -B test` at the root builds
all of them in one reactor run.

---

## Step 6 — Declare the suite, and which tests cover which code

- **Framework —** at bootstrap it read the folder for something that said how
  tests run, found nothing — there was no POM yet — and told you so rather
  than emitting a command that would fail on first use. It does not come back
  to ask, and the moment it could is when the first POM appears. That it does
  not is walk finding 10.
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
  create` wrote it after bootstrap ran, and the POMs and the `.gitignore`
  line you wrote. Walk finding 2.
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

**That `Module:` line names the module each session touches.** A section may
name every module its session touches, or none, and every session runs in the
repository you opened.

**The simplicity rule is not decoration either.** A different AI model checks
each session's work and does not share your intentions. Without the rule
written down it reports "no error handling" and "no abstraction" as faults
and the session argues with itself for rounds.

**If you skip the commit, the next step refuses:**

```
start: refused -- session 1 cannot declare its task list now: the working tree already
         carries N change(s) (...). The declaration comes before the work -- one made after
         it is a model deciding in hindsight what may be published. Commit or revert, then declare.
```

---

## Step 8 — Run session 1

- **Framework —** at registration it pulls your checkout forward from
  `origin/master` and registers session 001 in the repository's ledger.
- **You —** in the Work Explorer, **Dabbler: Start Session** on the
  repository row or on session 1's row. Two prompts:
  *`Start session — which engine runs it?`* — pick `Claude Code`
  (`anthropic`) or `GitHub Copilot` (`openai — a seat also needs a
  model`). Those two are what Start launches: an engine whose CLI has not
  been measured is not offered here, and is started by typing `dabbler
  session next` in a terminal of your own instead.
  *`Start session — model for <engine>`* — blank for the engine's default;
  on a seat, the model, e.g. `gpt-5.4`.
  The AI's terminal opens running, with the opening sentence typed.
  **Dabbler: Resume Session** brings the terminal back if you lose it.
- **Underneath —**
  ```
  dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  dabbler session next --sessions-dir docs/sessions
  ```

**Expect the start to say it registered the session:**

```
start: pulled from origin/master (git pull --ff-only) before registering.
start: session 001 of sessions registered (claude-code).
```

**Then the AI keeps running `dabbler session next` until it answers `done`.**
That loop is the engine's. When an answer's `"kind"` is `"wait"`, the engine
calls `next` again itself; nothing notifies it and no timer runs. What tells
**you** the call is not being made is the Dabbler terminal's silence watcher
and the Work Explorer's attention row.

---

## Step 9 — Repeat for the other two modules

- **Framework —** as step 8, once per module: the plan's `Module:` line for
  session 2 is `store` and for session 3 is `app`.
- **You —** **Dabbler: Start Session** on session 2's row, then on session
  3's row when session 2 has closed.
- **Underneath —** the same two commands as step 8, per module.

The store and the app reach their siblings in the same reactor: the store's
POM depends on `com.example:json-model` at `${project.version}`, and the
parent POM lists all three modules.

---

## Step 10 — Run what you built

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
underneath did not match what the button ran. Steps 9 and 10 are the ones
nobody has run against Maven yet, so detail there is worth most.

## Known issues — do not report these as new

Each was found by walking this document on 8 September 2026 and is written up
in `docs/uat/uat-walk-findings.md` with its reproduction.

- **New Module asks four of a module's six values** (step 3). Finding 1.
- **Bootstrap does not commit the modules manifest** (step 7). Finding 2.
- **Nothing in the UI sets the remote or the upstream** (steps 2 and 7).
  Finding 5.
- **Troubleshoot runs no toolchain checks** (prerequisites). Finding 6.
- **The node deprecation warning when Dabbler runs `mvn`**. Finding 9.
- **No test suite is ever declared for you** (step 6). Finding 10.
- **The Chat panel** takes the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.
