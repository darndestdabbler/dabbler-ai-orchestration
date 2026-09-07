# UAT — build the JSON solution with Java, Maven and Spring

**What you are testing.** That a person can build a small multi-module Java
solution using Dabbler, start to finish, following only what is written here.

**What you are building.** The same program as the .NET walkthrough: it reads
a JSON file of items and stores them in a SQLite database. Three modules: the
item type, the store, and the loader that puts them together.

**How long.** About an hour, most of it waiting for AI sessions.

---

## Read this first — how much of this has been proven

This matters for judging what you find.

**Proven by running it on this machine on 7 September 2026**, with the output
below copied from what actually came back: the prerequisites, declaring the
modules, ecosystem detection, the root build files, packing a module, and
opening a focused checkout. Those steps are steps 1, 2, 5, 7 and 9.

**Not yet proven for Java:** the AI session loop itself — steps 6 and 8. Those
steps are identical to the .NET walkthrough, where they were run four times
end to end, and nothing in them is ecosystem-specific. They are very likely
fine, but you are the first to run them against Maven.

**Two defects were found while preparing this, and both are now fixed** — the
pack message that named a .NET file whatever the ecosystem, and the root POM
that targeted Java 21 on every machine. Steps 4 and 5 below were re-run
against the fixed build on 7 September 2026 and the output shown is that
run's. If you see either of the old behaviours, you are on a router built
before session 113 — check `dabbler version` and say which one you have.

---

## Prerequisites

```
java -version
mvn -version
git --version
node --version
```

**Expect:** a JDK version, Maven 3.9 or newer, a git version, node 22+.

**Check your JDK version now, because it decides step 2.** On this machine:

```
openjdk version "17.0.9" 2023-10-17 LTS
Apache Maven 3.9.2
```

You also need `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` and
`DABBLER_GEMINI_API_KEY` set.

**And check this, it is easy to miss:**

```
echo %DABBLER_TRANSPORT%
```

If it says `copilot-cli`, add `--transport api` to **every** `dabbler session`
command. Otherwise verification runs on the Copilot seat, which bills per
request and cannot reach the GPT-5.6 verifier at all.

---

## Step 1 — Make the folder and put it under git

```
mkdir C:\temp\uat-java
cd C:\temp\uat-java
git init -b master
git init --bare C:\temp\uat-java.origin.git
git remote add origin C:\temp\uat-java.origin.git
```

**Expect:** `Initialized empty Git repository` twice.

The second repository is not optional. Dabbler builds a focused checkout by
cloning the origin, and step 5 refuses without one.

---

## Step 2 — Declare the three modules

Java package names are `groupId:artifactId`, with a colon.

```
dabbler modules create . --slug model --title "Item model" --kind shared-types --code-root modules/model --package com.example:json-model
dabbler modules create . --slug store --title "SQLite store" --kind library --code-root modules/store --package com.example:json-store --depends-on model
dabbler modules create . --slug app --title "JSON loader" --kind application --code-root modules/app --package com.example:json-loader --depends-on model --depends-on store
```

**Expect the last one to print exactly:**

```
{"slug": "app", "title": "JSON loader", "kind": "application", "codeRoots": ["modules/app"], "dependsOn": ["model", "store"], "package": "com.example:json-loader"}
note: no module holds a project file yet, so the root build files wait for the first one that does
```

That note is the important part. Dabbler decides whether this is a .NET or a
Java solution by looking for a project file — a `.csproj` for .NET, a
`pom.xml` for Maven. Until one exists it writes no root files at all. **This
is why the next step comes before anything else.**

---

## Step 3 — Write the first module's POM

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

Also write a small `Item` class under
`modules\model\src\main\java\com\example\model\Item.java` with `id`, `sku`,
`name` and `quantity` and their getters and setters.

---

## Step 4 — Let the root build files appear, and check the one line that matters

Run:

```
dabbler module pack model
```

**Expect it to write three files first:**

```
wrote pom.xml
wrote packages/.gitattributes
wrote packages/README.md
```

**Now open the root `pom.xml` it just wrote and find this line:**

```xml
<maven.compiler.release>17</maven.compiler.release>
```

**The number must be your own JDK's** — the one `java -version` printed in the
prerequisites, 17 on this machine — and above it a comment saying it came from
that JDK. Dabbler asks the JDK doing the scaffolding, because a release your
compiler cannot produce fails every build afterwards.

A number that is not your JDK's is worth reporting. If no JDK could be run at
all the comment says so instead, and the file takes a stated default of 17.
Either way this file is written once and never rewritten, so raising it later
is your edit to make.

The pack carries straight on from there — see the next step for what to expect.

---

## Step 5 — Pack the module

```
dabbler module pack model
```

**Expect four lines, of which the version `(varies)`:**

```
packed model 0.1.0-dev.20260907.1.g493fcc4
  packages/com/example/json-model/0.1.0-dev.20260907.1.g493fcc4/json-model-0.1.0-dev.20260907.1.g493fcc4.jar
pinned com.example:json-model in pom.xml
recorded packages/com.example+json-model.0.1.0-dev.20260907.1.g493fcc4.json
```

**What must be true regardless of the version:**

- The jar sits in a normal Maven repository layout under `packages/`, with the
  group id as folders.
- The record filename has a **plus sign** where the package name has a colon,
  because a colon is not allowed in a Windows filename.
- Running the same command twice unchanged gives the **same version back**.

**Line three names the file the pin really moved.** Check that it did:

```
findstr /C:"json-model" pom.xml
```

**Expect** to find it inside `<dependencyManagement>` in the root `pom.xml`,
at the version line two printed. A message naming any other file — the .NET
`Directory.Packages.props`, say — is worth reporting.

---

## Step 6 — Write the session plan and run the first session

Create `docs\sessions\session-plan.md` with the same simplicity rule as the
.NET walkthrough — copy that file's Step 3 block verbatim, changing only the
module descriptions if you wish.

**That rule is not decoration.** A different AI model checks each session's
work and does not share your intentions. Without the rule written down, it
reports "no error handling" and "no abstraction" as faults and the session
argues with itself for rounds. With it, none of the four sessions in the .NET
reference run was asked to add anything.

Then start the session and drive it:

```
dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
dabbler session next --sessions-dir docs/sessions
```

Keep running `dabbler session next` and doing what each answer says, until it
answers `done`.

**The one thing that trips everybody.** When the answer's `"kind"` is
`"wait"`, that means *run `next` again yourself*. Nothing notifies you and no
timer is running.

---

## Step 7 — Tell Dabbler which tests cover which code

Add to `dabbler.yaml` under `testing:`:

```yaml
  selection:
    rules:
      - when: modules/store/src/main/
        select:
          - modules/store/src/test/java/com/example/store/ItemStoreTest.java
```

**Do not skip this.** In the .NET reference run, two sessions closed green
having run **no tests at all**, because a suite was declared and its paths
listed under `covers:` and Dabbler still selected nothing. `covers:` says
which paths a suite may speak for; only a rule maps source to tests.

Check it:

```
dabbler affected --path modules/store/src/main/java/com/example/store/ItemStore.java
```

**Expect** a line containing `configured-rule` naming your test. If it says
`no tests affected by this change set`, the rule is wrong.

---

## Step 8 — Open a module and work in it

```
dabbler module open store
```

**Expect** JSON containing `"convenienceFile": ".mvn/maven.config"` and a
`"cone"` listing `docs`, `modules/store`, `packages` and the *contract*
folders of the siblings — not their source.

Open the new folder in VS Code. **This is where you work now.**

**Check the two things that make a focused checkout worth having:**

```
dir C:\temp\uat-java.store\modules
type C:\temp\uat-java.store\.mvn\maven.config
mvn -B test
```

**Expect:** only `store` in the first; the second to contain exactly

```
-f
modules/store/pom.xml
```

and the third to build and exit `0` — a plain `mvn` with no arguments builds
the right module, because that config file tells it which POM to use.

---

## Step 9 — Go back and pick up the work

Return to `C:\temp\uat-java` and run:

```
git pull origin master
```

**Do not skip this.** Until you pull, the folder you started in still shows
the session as **not started**, because the work happened in the focused
checkout. If you left the original folder open in VS Code, its Work Explorer
was telling you nothing had happened.

---

## Step 10 — Repeat, then run what you built

Do steps 6 to 9 again for `store`, then for `app`. Each module needs a short
`modules\<slug>\contract\README.md`; declaring `contract: package` does not
skip it, and without one the session refuses near the end.

Then run the loader twice against the same file.

**Expect** the first run to report three read and three stored, and the second
to report three read and **none** stored, because SKU is the key.

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
you saw. Steps 6 and 8 are the ones nobody has run against Maven yet, so
detail there is worth most.

## Known issues — do not report these as new

- **The Chat panel** takes the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.

The two defects this document used to list here — the pack message naming a
.NET file, and the root POM targeting Java 21 on every machine — were fixed in
session 113 and are checks in steps 4 and 5 now. Report them if you see them.
