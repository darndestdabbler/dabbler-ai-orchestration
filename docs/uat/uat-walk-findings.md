# What walking the UI path found

*Session 130, 8 September 2026. `docs/design/command-ownership.md` placed
every command in the two UAT walkthroughs against the operator's principle and
ended by naming four rows it could not settle from the code alone. This page
is the walk that settles them. It is the instrument's own record: what was
walked, what refused, and what each finding is in the operator's terms —
**framework** (constant or parameterised, and lifecycle-timed), **UI**
(constant or parameterised, but optional or without a fixed moment), or
**person** (a judgement nobody should automate).*

## What was walked, and what was not

Two scratch solutions outside this tree, both built from nothing by following
the walkthrough's own steps and taking each operation the way the operator
reaches it — the extension command that offers it, read for its exact title
and its exact prompts, and the router verb that command generates, run for
real.

| | |
| --- | --- |
| router | `dabbler-ai-router` 2.0.14, built from this tree |
| node | v25.8.1 |
| git | 2.51.0.windows.2 |
| .NET SDKs | 10.0.201, 8.0.424, 7.0.410 |
| Maven / JDK | Maven 3.9.2 (on JDK 21.0.3); `java -version` 17.0.9 |
| .NET walk | `C:\temp\uat130-dotnet`, bare origin `C:\temp\uat130-dotnet.origin.git`, focused checkout `C:\temp\uat130-dotnet.model` |
| Java walk | `C:\temp\uat130-java`, bare origin `C:\temp\uat130-java.origin.git`, focused checkout `C:\temp\uat130-java.model` |

**Two ecosystems was the right shape for this walk.** Six of the findings
below are the same on both, and the two that differ are the most useful thing
the walk produced: the Maven side already carries the fix the .NET side is
missing, with the reason written in its own comment. A one-ecosystem walk
would have reported finding 3 as a design question rather than as an
omission.

**What was not walked, and why.** Neither walk ran an AI session's own work
to completion. The path under test here is the operator's — the buttons, the
verbs they generate and the refusals they meet — and a model writing three
modules twice over exercises none of it while costing two sessions' worth of
calls. Everything the operator touches was run: the set-up, the declaration,
the manifest, bootstrap, the POM, the plan, the commit the declaration needs,
the registration of a real focused session in both ecosystems, the packs and
the pin they move, the impact plan, the Maven suite inside the focused
checkout, the re-open of a kept folder, and the cancel. The one lifecycle
moment reached by reading rather than running is the close's pull-forward,
and finding 3 below says what the walk proves about it anyway.

**A note on the cancel.** The scratch session could not be ended from here:
`session cancel --force` is refused to an engine, by name, with the person's
way named instead. That guard is session 127's and it works — the first thing
this walk confirmed rather than found.

---

## The count

**Nineteen findings: ten product defects and nine document errors**, plus the
four audit rows settled below and one claim of the audit's own that the walk
found to be false.

Three of the ten stop a first-time operator rather than slowing one down:
**1** (a module made with the button can neither pack nor host a session),
**3** (nothing ignores .NET build output, which breaks the pack's own
idempotence guarantee, the next declaration and the close's pull-forward),
and **10** (neither walkthrough ever declares a test suite, so the run of
record has no command and the reader's own check reads as a pass anyway).

The plan for this session said that a UAT rewrite reporting no defects on a
first walk of a new path has probably not been walked. This one is at the
other end: the two walkthroughs describe a product that has moved under them
in three places, and the UI path they now document has three holes in it that
the walk fell into in its first twenty minutes.

**Each product defect is owed on the session log**, so that follow-up
planning reads it from the structured record and not only from this page:

| finding | decision |
| --- | --- |
| 1 New Module asks four of six values | D258 |
| 2 bootstrap leaves the manifest uncommitted | D259 |
| 3 no `bin/`/`obj/` ignore on .NET | D260 |
| 4 the clone reset counts the ledger | D261 |
| 5 no remote and no upstream in the UI | D262 |
| 6 Troubleshoot runs no toolchain checks | D263 |
| 7 `bootstrap --project-dir` and the drift note | D264 |
| 8 New Module's `1/2` title | D265 |
| 9 the deprecated shell spawn in the Maven pack | D266 |
| 10 no test suite is ever declared | D267 |

The document errors are not owed: they were fixed in this session, in the
documents themselves.

---

## Product defects

### 1 — A module made with **New Module** can neither pack nor host a session

**Bucket: UI**, with a framework alternative.

`runNewModuleFlow` in
`tools/dabbler-ai-orchestration/src/commands/newModule.ts` prompts for four
values — slug, title, kind, depends-on — and `createModule` in
`packages/router/src/modules.ts` writes only what it is given, with no
default for the two it was not. The audit predicted this. What the walk adds
is what it costs: **both** of the operations a multi-module solution exists
for refuse.

Reproduction, in a repository with three button-made modules:

```
dabbler modules create . --slug model --title "Item model" --kind shared-types
dabbler module pack model
  -> module pack: refused -- module 'model' declares no package; give it one in docs\modules.yaml

dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  -> start: refused -- module 'model' declares the repository root as a code root;
     a focused checkout of everything is the full checkout, so open the repository itself
```

The second refusal is the interesting one: an absent `codeRoots` reads as the
repository root, so a button-made module in a multi-module solution is not
merely incomplete — it is indistinguishable from a module that claims the
whole repository, and the plan's `Module:` line cannot start a session on it.
Both refusals name the fix and neither is silent, which is why this is a gap
rather than a trap; but the button produces that state from four honest
answers and says nothing.

Either the button prompts for the code root and the package — two more boxes
on a flow that already has four — or `modules create` defaults them from the
slug (`modules/<slug>` and the slug in the repository's casing) and the
button stays as it is. The walk has no opinion between them; it has an
opinion that the present state is not one of the two.

### 2 — Bootstrap leaves the modules manifest uncommitted, and the declaration refuses it

**Bucket: framework.**

`commitOwnScaffold` in `packages/router/src/cli/bootstrap.ts` commits exactly
the files bootstrap wrote. In the walkthrough's own order the modules are
declared *first*, so `docs\modules.yaml` was written by `modules create` and
bootstrap does not commit it:

```
bootstrap: committed 6 file(s) it wrote; the declaration a session makes comes
           before its work, so session 1 would be refused while they sat uncommitted.
git status --porcelain
  -> ?? docs/modules.yaml
```

That sentence is then wrong about the tree it is standing in. The refusal it
predicts arrives at the first start:

```
start: refused -- the working tree carries 3 change(s)
       (docs/sessions/session-plan.md, docs/modules.yaml, items.json); the module's
       clone is made from the origin, so commit and push them before starting the session
```

Bootstrap knows it is about to claim the tree is clean for session 1, and it
has just been handed a manifest it did not write. Committing what it finds,
or saying plainly what it did not commit, is the lifecycle-timed act; the
walkthrough's manual commit is the workaround, and finding D5 below is what
that does to the audit's reading of it.

### 3 — Nothing ignores .NET build output, and the Maven side already has the fix

**Bucket: framework.** This is the walk's largest finding: one missing ignore
rule breaks three separate guarantees, and the repository already contains
the rule that fixes it — written for the other ecosystem, with the reason
stated in its own comment.

Bootstrap writes one `.gitignore` rule, `.dabbler/`. `ensureRootFiles` in
`packages/router/src/cli/module.ts` writes the root build files at the first
pack. On the **Maven** side that first pack prints a fourth line the .NET one
does not:

```
wrote pom.xml
wrote packages/.gitattributes
wrote packages/README.md
updated .gitignore
```

and what it appended is exactly this:

```
# Maven's own output, which lands inside the module it built. A module's source
# digest is taken over its code roots, so an unignored target/ makes the same
# source pack to a new dev version every time.
target/
.flattened-pom.xml
```

On the **.NET** side the first pack writes `nuget.config`,
`Directory.Packages.props`, `Directory.Build.props`,
`Directory.Build.targets` and the feed's files, and touches `.gitignore` not
at all. So `modules\<slug>\src\<Project>\bin\` and `obj\` sit in the tree,
untracked and unignored, and every consequence that comment predicts follows.

The two walks side by side are the proof. Three consecutive Maven packs, no
source touched:

```
packed model 0.1.0-dev.20260908.1.ga6aac5f
packed model 0.1.0-dev.20260908.1.ga6aac5f
packed model 0.1.0-dev.20260908.1.ga6aac5f
```

and, four .NET packs later in this section, four different versions. Same
code, same digest function; one ecosystem has the rule and the other does
not.

**(a) `module pack` is not idempotent, and its own comment says it should
be.** `devVersion` in `packages/router/src/packages.ts` returns the recorded
version for an unchanged `sourceDigest` — "packing an unchanged tree twice is
one version". The digest is `surfaceDigest` over the module's code roots, and
`enumerateSurface` in `packages/router/src/testEvidence.ts` reads *every
tracked or untracked non-ignored file* under them. `dotnet pack` writes `bin\`
and `obj\` under exactly those roots, so the pack's own output is inside its
next input. Four consecutive packs, no source touched between them:

```
packed model 0.1.0-dev.20260908.1.gc2a1199
packed model 0.1.0-dev.20260908.2.g90deeb9
packed model 0.1.0-dev.20260908.3.gc53e704
packed model 0.1.0-dev.20260908.4.gb27c782
```

Four packages, four records under `packages\`, four re-pins.

**(b) The next `session start` is refused.** The declaration counts untracked
paths (finding 2's refusal names one), so a repository in which anything has
been built refuses to register a session until a person cleans or ignores the
output.

**(c) The close hands step 8 back.** `pullRepositoryForward` in
`packages/router/src/session.ts` pulls the repository forward after a focused
session's push, but only over `materialPaths` — and build output is neither
editor noise nor bookkeeping, so it blocks: *"holds N change(s) …, so it was
not pulled forward; commit or stash them, then run: git -C … pull --ff-only"*.
The one command sessions 125–127 took off the operator comes straight back
for any solution that has been built.

**In the Java walk none of the three happens.** `mvn -B test` inside the
focused checkout left it clean but for the ledger (finding 4), the packs are
stable, and the close's pull-forward would have run. The fix for .NET is the
Maven rule with `bin/` and `obj/` in it, written from the same place.

### 4 — Re-opening a module refuses over the ledger the framework itself wrote

**Bucket: framework.**

`openModule` in `packages/router/src/checkout.ts` refuses a dirty clone with
raw `dirtyPaths`, which counts the session ledger. Register a focused session
and press **Start Focused Session** (or **Open Module**) again on that module:

```
module open: refused -- C:\temp\uat130-dotnet.model holds 1 change(s)
             (docs/sessions/sessions.json); commit, push or discard them there
             before it is reset to the trunk
```

`docs\sessions\sessions.json` is written by `session start` and by nothing
else, and this repository's hard rule is that a person never touches it. The
refusal therefore asks the operator to do the one thing they are told never
to do. `materialPaths` in `packages/router/src/gates.ts` exists for exactly
this distinction and every other caller uses it; the clone reset is the one
that does not.

Refusing to re-open a module whose session is in flight is right. Refusing it
in these words, over this file, is not.

### 5 — Nothing in the UI gives the repository a remote or an upstream

**Bucket: framework** (a prompt at set-up).

`runSetUpProjectFlow` in
`tools/dabbler-ai-orchestration/src/commands/bootstrapProject.ts` asks two
questions — where the project goes and what it is called — initialises the
repository through VS Code's own git, and runs bootstrap. It never asks for a
remote. The land runs a bare `git push` and the close reads
`pushed_to_remote`, and a focused checkout is cloned *from the origin*, so a
first session cannot close, and cannot even start focused, without one.

**Say Where This Repository Is (Remote)** looks like the answer and is not:
`identifyRemote` in
`tools/dabbler-ai-orchestration/src/commands/openRepository.ts` records a
*sibling repository's* URL through `deps.locate` for the solution graph, and
runs no `git remote` at all. A walkthrough that leaves the reader to find
that out has mis-sold a button.

The URL is the one parameter the framework cannot determine, which under the
principle is a prompt at set-up, not four lines of shell in a walkthrough.
The upstream `-u` goes with it.

### 6 — Troubleshoot runs none of the prerequisite checks

**Bucket: UI.**

`tools/dabbler-ai-orchestration/src/commands/troubleshoot.ts` offers six
items: extension not activating, session stuck in In Progress, worktrees not
showing, API key not found, cost seems high, file/folder layout wrong. The
prerequisites both walkthroughs open with — the SDK, git, node, `dabbler
version`, the Copilot CLI and `DABBLER_TRANSPORT` — are constant, optional,
and diagnostic, which is the definition of the UI's bucket, and they are the
first thing a first-time operator gets wrong. A seventh item running them and
reporting what it found is the whole of it.

### 7 — `bootstrap --project-dir` names the wrong `.dabbler` in one line

**Bucket: framework.** Minor.

```
cd C:\temp
dabbler bootstrap --project-dir C:\temp\uat130-dotnet --no-transport-detect
  -> discovery: api-enumeration: no record at C:\temp\.dabbler\api-models.lock
```

Every other line of that run names the project directory. The drift note
takes the working directory instead, so it reports on a folder the command
was told not to act on.

### 8 — New Module's first prompt is titled "1/2" among four

**Bucket: UI.** Cosmetic, and thirty seconds to fix.

`newModule.ts` titles the boxes "New module (1/2): slug", "New module (2/4):
display title", "New module (3/4): kind", "New module (4/4): depends on". A
person who reads the first title stops expecting the third box.

If finding 1 is answered by prompting for the code root and the package, the
denominator changes anyway — but it is wrong today either way.

### 9 — A node deprecation warning lands in the middle of the pack's output

**Bucket: framework.** Windows and Maven only.

```
packed model 0.1.0-dev.20260908.1.ga6aac5f
  packages/com/example/json-model/0.1.0-dev.20260908.1.ga6aac5f/json-model-...jar
pinned com.example:json-model in pom.xml
recorded packages/com.example+json-model.0.1.0-dev.20260908.1.ga6aac5f.json
(node:55824) [DEP0190] DeprecationWarning: Passing args to a child process with
shell option true can lead to security vulnerabilities, as the arguments are not
escaped, only concatenated.
```

`packages/router/src/packages.ts` spawns the ecosystem's build with
`shell: resolved.isBatch`, and on Windows `mvn` resolves to `mvn.cmd`, so the
shell path is taken. Node has deprecated exactly that combination. The .NET
pack does not show it, because `dotnet` is an executable.

Two costs, one now and one later: a walkthrough that promises four lines
delivers six, three of them about a security vulnerability, which a UAT
reader is right to report; and the deprecation is a real one, so the day node
turns it into an error the Maven pack stops working on Windows. The fix is
`cmd.exe /d /s /c` with a real argv rather than `shell: true`, which is what
the router's other spawners already say in their comments they refuse to do.

### 10 — Neither walkthrough ever declares a test suite, and nothing later asks

**Bucket: framework**, with a document half (D2).

Bootstrap runs before any project file exists — it must, because the
walkthroughs' first session is what writes the code — so it declares no
suite, and says so:

```
bootstrap: it declares no test suite, because nothing at the root of this repository
           says how its tests run; declare one before the first session that writes code
```

Nothing revisits it. The lifecycle moment when the ecosystem *does* become
known is the first pack, where `ensureRootFiles` already writes the root
build files for that ecosystem and knows exactly what a Maven or a .NET
suite's command would be. It writes no suite.

What makes this a defect rather than a nuance is what the operator sees when
they follow the walkthrough's own check. With the selection rule added and no
suite declared:

```
dabbler affected --path modules/model/src/main/java/com/example/model/Item.java
  configured-rule  modules/model/src/test/java/com/example/model/ItemTest.java  <- ...
  no suite is declared, so there is no command to run. Declare one under
  testing.suites in dabbler.yaml: a name, the command that runs it, and the paths it covers.
```

The line the walkthrough tells the reader to look for is there, and it is a
pass, and there is nothing to run. The router's own next line is the whole
diagnosis — and both walkthroughs stop reading one line early. This is the
same defect the .NET document reports as "two sessions closed green having
run no tests at all", diagnosed one level too shallow: the missing thing is
not the rule, it is the suite the rule selects into.

---

## Document errors, fixed in this session

### D1 — `dabbler.yaml` arrives with no suite in it, in both documents

`docs/uat/uat-dotnet-json-solution.md` step 2b promises "`dabbler.yaml` (the
file step 7 adds to, with a `dotnet` suite already in it)" and
`docs/uat/uat-java-json-solution.md` step 2b promises the same with `maven`.
In each walkthrough's own order no project file exists yet, and bootstrap
says so in both walks:

```
bootstrap: it declares no test suite, because nothing at the root of this
           repository says how its tests run; declare one before the first
           session that writes code
```

The scaffolded file has no `testing:` key at all — only a commented example,
and the example is a pytest one.

The Java document adds a second promise to the same paragraph: that bootstrap
"also says Maven publishes through its own lifecycle, which is true and is
not a problem". At step 2b there is no POM either, so what it says is *"no
packaging declared -- no .csproj or pom.xml at the repository root"*.

### D2 — Both documents add a rule under a key that is not there

The .NET step 4 says "Add this to `dabbler.yaml`, under `testing:`" and the
Java step 7 says "Add to `dabbler.yaml` under `testing:`". There is no
`testing:` block to add it under; the reader has to create the key, and
neither document says so. Finding 10 is the rest of it: even a well-formed
`selection.rules` selects tests that no declared suite runs, and the check
both documents offer prints a pass one line above the router saying exactly
that.

### D3 — The first pack prints ten lines, not four

Step 7 says "Expect four lines". The first pack in a repository writes the
root build files before it packs:

```
wrote nuget.config
wrote Directory.Packages.props
wrote Directory.Build.props
wrote Directory.Build.targets
wrote packages/.gitattributes
wrote packages/README.md
packed model 0.1.0-dev.20260908.1.gc2a1199
  packages/JsonModel.0.1.0-dev.20260908.1.gc2a1199.nupkg
pinned JsonModel in Directory.Packages.props
recorded packages/JsonModel.0.1.0-dev.20260908.1.gc2a1199.json
```

The Java walkthrough already teaches this moment and the .NET one does not.

### D4 — "Run the same command twice and you get the same version back" is false

Step 7's stated invariant is the one finding 3(a) breaks. It is what the code
intends and what the walkthrough should keep saying once the ignore rule
exists; today it is a claim the reader's own second pack refutes.

### D5 — The commit after bootstrap is not dead text, and the audit is wrong about it

`docs/design/command-ownership.md` rules the walkthrough's `git add -A` after
bootstrap dead, on the grounds that bootstrap has already committed its own
files and the commit "finds nothing to stage on the reference machine". The
walk falsifies that. The walkthrough runs `git add -A`, not a list of
bootstrap's files, and at that point in its own order `docs\modules.yaml` is
untracked (finding 2) — so the commit stages something, and deleting it as
instructed would leave the tree dirty for the declaration.

What is dead is the *explanation* beside it, which tells the reader that
bootstrap's own files need committing when bootstrap has just committed them
and said so. The explanation moves into the first register; the commit stays
until finding 2 is fixed, and the document says which of the two it is
committing.

### D6 — `module open` before `session start` is no longer a step

Steps 5 and 6 have the reader run `dabbler module open model`, open the new
folder, and start the session there. Since session 127 the registration does
it:

```
dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  -> start: session 001 of sessions registered (claude-code) in module 'model's focused
     checkout at C:\temp\uat130-dotnet.model; the exposure manifest is written there.
```

and the operator's one click is **Start Focused Session** on the module row,
which runs `module open` in-process, writes the engine and model into the
folder and opens its window with the AI's terminal already typed. Open Module
remains, for opening a module folder without starting anything.

The Java document's step 8 is the same error read from the other side: it
tells the reader to check the checkout "step 6 put you in", which step 6 no
longer does explicitly. What it checks is still worth checking, and the walk
confirms all three — `modules\` in the Java clone held only `model`,
`.mvn\maven.config` held exactly `-f` and `modules\model\pom.xml`, and
`mvn -B test` built and exited 0 from the clone root.

### D7 — The Java first pack writes four lines, not three

Step 4 says "Expect it to write three files first". It writes four:
`pom.xml`, `packages\.gitattributes`, `packages\README.md` and then `updated
.gitignore` — the line that is the whole of finding 3's fix, and the one line
of that output a reader should be told to look for.

### D8 — The pull after a module session is the framework's now

The .NET step 8 and the Java step 9 both have the operator return to the
original folder and run `git pull origin master`, and both explain that the
Work Explorer otherwise goes on saying nothing has happened.
`pullRepositoryForward` in `packages/router/src/session.ts` does it at the
close, after the push, and says so in one line.

It is not unconditional, and the documents should say what the condition is
rather than dropping the step: the pull runs only over a repository whose
working tree holds no material change. In the Java walk that holds. In the
.NET walk finding 3 guarantees it does not, so the operator gets the sentence
naming the command instead — which is the same step back again, and worth
saying plainly until the ignore rule exists.

### D9 — `docs/quick-start.md` names a run path with a `<set>` segment in it

Fixed here, twice. The run directory is `.dabbler\runs\s<N>\`, and quick-start
named `.dabbler\runs\<set>\s<N>\` for both the approved plan and
`rounds.jsonl` — the shape from before sessions were numbered directly in a
repository.
`packages/router/src/approvedPlan.ts` carries the same stale segment in its
opening comment; that is a source comment rather than a document and is left
for a session that is changing the file.

---

## The two companion documents: the audit's claim, checked

`docs/design/command-ownership.md` ends by saying that
`docs/quick-start.md` and
`docs/tutorials/csv-solution/csv-multi-module-walkthrough.md` "carry the same
manual commit after bootstrap and are reached in the same pass". They were
reached, and **they do not.** Neither instructs a commit after `dabbler
bootstrap`:

```
node packages/router/scripts/check-uat-registers.mjs docs/quick-start.md \
    docs/tutorials/csv-solution/csv-multi-module-walkthrough.md
  -> 2 document(s), ... no commit inside a bootstrap step
```

quick-start's only commit paragraph is about the pre-commit hook refusing a
commit while a step is open, which is a different fact and a correct one; the
csv walkthrough runs bootstrap through **Dabbler: Set Up New Project** and
never mentions committing at all. What both are now covered by is the check
itself, so the claim cannot become true later without failing a step.

The one command title either document names — the csv walkthrough's
**Dabbler: Show Framework Terminal** — is a real one.

---

## The four audit rows, settled

| audit row | what the walk saw | disposition |
| --- | --- | --- |
| New Module asks four of six | Both `module pack` and a focused `session start` refuse a button-made module | Finding 1 — product defect, UI |
| Nothing asks for the remote or sets the upstream | Confirmed, and **Say Where This Repository Is (Remote)** is a different command that does not touch `git remote` | Finding 5 — product defect, framework |
| A hand-written plan must be committed by hand | Confirmed: `start: refused -- the working tree carries 3 change(s)`. The commit is also what carries `docs\modules.yaml` | Finding 2 + D5 — product defect, framework; the walkthrough keeps the commit and labels it |
| Troubleshoot runs no toolchain checks | Confirmed, six items, none of them | Finding 6 — product defect, UI |
