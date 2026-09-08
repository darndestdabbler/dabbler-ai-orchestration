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

**Walked end to end on this machine on 7 September 2026**, steps 1 to 9,
with the output below copied from what actually came back — including the AI
session loop, which had never been run against Maven before that walk. It
found six defects in the framework and three in this document; all nine were
fixed in sessions 113, 115 and 116, and what you are reading is the
corrected version.

**Where your findings are worth most now:** step 10 — the second and third
modules, a module consuming a sibling as a package, and running the loader
twice. The walk of 7 September proved one module end to end; the consumer
side of a Maven solution has still never been driven by a session.

**Two defects were found while preparing this, and both are now fixed** — the
pack message that named a .NET file whatever the ecosystem, and the root POM
that targeted Java 21 on every machine. Steps 4 and 5 below were re-run
against the fixed build on 7 September 2026 and the output shown is that
run's. If you see either of the old behaviours, you are on a router built
before session 113 — check `dabbler version` and say which one you have.

---

## Prerequisites

There are two ways to pay for the models this walkthrough runs, and they need
different setups. **Read part A or part B — whichever matches how your models
are paid for — and ignore the other.** Everybody reads the first part.

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

**Note your JDK version, because step 4 checks it.** On this machine:

```
openjdk version "17.0.9" 2023-10-17 LTS
Apache Maven 3.9.2
```

### A — you have a GitHub Copilot seat

This is the setup with no API keys of your own: the seat pays, in premium
requests. Nothing here reads `DABBLER_ANTHROPIC_API_KEY` or its siblings, and
you do not need them set.

```
copilot --version
echo %DABBLER_TRANSPORT%
```

**Expect** a Copilot CLI version from the first, and `copilot-cli` from the
second. If the second is empty, either set it, or add `--transport
copilot-cli` to the **first** `dabbler session next` of each session — the
transport is kept on the run from there, so once is enough.

**Your session names its model, and that is not optional:**

```
dabbler session start --sessions-dir docs/sessions --engine copilot --provider openai --model gpt-5.4 --module model
```

Dabbler resolves the model through its registry and refuses one it does not
know, because a seat's own label does not say which vendor answered.
Substitute this line wherever the steps below show `--engine claude-code`.

**What it costs, and how to keep it low.** Every call is a premium request,
weighted by model. What the shipped catalog records:

| weight | models |
| --- | --- |
| 0 | `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, `gpt-5-mini` |
| 1 | `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-fable-5` |
| 3 | `claude-opus-4.5`, `claude-opus-4.6` |
| 7.5 | `gpt-5.5` |
| 14 | `gemini-3.5-flash` |
| 15 | `claude-opus-4.8` |

**Think in pairs, not in single models.** A different provider always checks
the session's work — that rule does not bend on a seat — so Dabbler picks the
verifier from the seat's models *excluding your engine's vendor*. An engine on
`claude-sonnet-4.6` (weight 1) leaves the verifier free to be one of the
zero-weight GPT models. An engine on a zero-weight GPT does the opposite: it
forces the verifier onto Anthropic or Google, where the cheapest confirmed
model is 1 and the dearest is 15.

### B — you have direct API keys

This is the setup with no seat: each vendor bills your own account, per token.
You need all three keys, because the verifier is always a different vendor
from the engine:

```
DABBLER_ANTHROPIC_API_KEY
DABBLER_OPENAI_API_KEY
DABBLER_GEMINI_API_KEY
```

```
echo %DABBLER_TRANSPORT%
```

**Expect** empty. If it says `copilot-cli`, that machine is set up for part A,
and you tell each session to use your keys instead by adding `--transport api`
to the **first** `dabbler session next` of the session — once, not to every
command. Without it the session runs on the seat, and the seat is billed.

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

## Step 2b — Set the repository up

```
dabbler bootstrap --no-transport-detect
```

**Expect** it to write, and to say so: `AGENTS.md`, `CLAUDE.md` and
`GEMINI.md` (the instructions an AI reads), `dabbler.yaml` (the file step 7
adds to, with a `maven` suite already in it), a `.gitignore` rule for
`.dabbler/`, a commit hook, and the git refspecs that carry verification
rounds with a push. It also says Maven publishes through its own lifecycle,
which is true and is not a problem.

**Do this before the first session, and commit what it wrote.** A session's
declaration is refused while the working tree carries changes, so leaving
these uncommitted stops session 1 before it starts:

```
git add -A
git commit -m "Bootstrap: the framework's own files"
```

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

**That is the whole step: the POM and nothing else.** A Maven module with no
Java source packs perfectly well, and the `Item` class is what session 1
writes — its plan says so. Writing it here instead means session 1's own diff
contains no `Item`, and the model that checks the session's work reads the
diff: on the reference run it reported the session's only deliverable
missing, as a blocking fault, and the round was spent disputing it.

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

Then start the session. **A session that works on a module names it**, and
the framework makes that module's own checkout and registers the session
inside it:

```
dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic --module model
```

**On a Copilot seat** (prerequisites, part A), that line is
`dabbler session start --sessions-dir docs/sessions --engine copilot --provider openai --model gpt-5.4 --module model`
instead, and the first `next` of the session carries `--transport copilot-cli`
unless `DABBLER_TRANSPORT` already says so.

**Expect** it to say the session is registered *in module 'model's focused
checkout at `C:\temp\uat-java.model`*. **That folder is where you work from
now on** — open it, and run every `next` there:

```
cd C:\temp\uat-java.model
dabbler session next --sessions-dir docs/sessions
```

Keep running `dabbler session next` and doing what each answer says, until it
answers `done`.

**Do not run a module session in the full checkout.** It will work right up
to the close, and then refuse: the exposure gate finds the other modules'
source sitting beside the one you are working on, and no grant can help you
— a grant widens a focused checkout, and the full one is not a focused
checkout. The clone is not a nicety; it is what makes the close possible.

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

## Step 8 — Check the checkout you are already working in

Step 6 put you in it. **Check the two things that make it worth having**, from
inside `C:\temp\uat-java.store`:

```
dir C:\temp\uat-java.store\modules\model
type C:\temp\uat-java.store\.mvn\maven.config
mvn -B test
```

**Expect:** the first to show `contract` and `pom.xml` and **no `src`** — the
sibling is here as its contract and its package, never as source; the second
to contain exactly

```
-f
modules/store/pom.xml
```

and the third to build and exit `0` — a plain `mvn` with no arguments builds
the right module, because that config file tells it which POM to use, and it
resolves `com.example:json-model` out of `packages\` rather than compiling it.

`dabbler module open <slug>` is the same checkout without a session, for
when you want to look at a module rather than work in one.

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
