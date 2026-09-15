# UAT — build the JSON solution with .NET

**What you are testing.** That a person can build a small multi-module .NET
solution using Dabbler's own buttons, start to finish, following only what is
written here.

**What you are building.** A program that reads a JSON file of items and
stores them in a SQLite database. Three modules: the item type, the store, and
the loader that puts them together.

**How long.** About an hour, most of it waiting for AI sessions.

---

## How to read a step

Every numbered step below is written in three registers, and they are not
decoration — they are what this document is for.

- **Framework —** what Dabbler has *already* done for you by the time you get
  here, and at which moment of the lifecycle it did it. Work the framework
  does for itself is invisible, and a walkthrough that leaves it out reads as
  though every line is yours to type.
- **You —** what you do in the UI: the exact command title as it appears in
  the palette or on a tree row, and the exact answers to type into each
  prompt it raises.
- **Underneath —** the command that operation generates. It is your fallback
  if you are not in VS Code, and it is what to check when a button does
  something you did not expect.

**A step that cannot fill all three tells you something true**, and says so
in place of the register it is missing:

- **No framework register —** … means the operation is not something the
  framework does at a fixed moment.
- **No UI register —** … means no button offers it. Where the step is
  constant-or-parameterised *and* lifecycle-timed, that is a gap the
  **framework** should close; where it is constant but optional, it is one
  the **UI** should close; where the substance of it is a **person's**
  judgement, it is nobody's to automate and the step says so.
- **No command underneath —** … means there is no CLI equivalent, because
  what you did was not a Dabbler operation at all.

**Bold in the second register is a command title and nothing else** — prompt
titles are in *italics* and the answers you type are in `code`. That is not a
house style; it is what
`packages/router/scripts/check-uat-registers.mjs` reads to hold every button
this document names to one the extension actually contributes. The same
script refuses a step that drops a register without saying which, and a
manual commit inside the bootstrap step.

The gaps below are real, current, and each was met by walking this document
on 8 September 2026. `docs/uat/uat-walk-findings.md` is that walk's record:
every finding, its reproduction, and whose it is to fix.

---

## Prerequisites

There are two ways to pay for the models this walkthrough runs, and they need
different setups. **Read part A or part B — whichever matches how your models
are paid for — and ignore the other.** Everybody reads the first part.

### What every run needs

Run these four. If any fails, stop and fix it before going on.

```
dotnet --list-sdks
git --version
node --version
dabbler version
```

**Expect:** a line containing `10.` from the first (any 10.x will do), a git
version, node 22 or newer, and a `dabbler-ai-router` version. If `dabbler` is
not found, that is a PATH problem: open a terminal from VS Code with the
extension installed, or run `node "<extension dir>/dist/dabbler.cjs"` instead.

**These four are the one diagnostic Dabbler does not run for you.**
**Dabbler: Troubleshoot** exists and is the right place for them — it covers
activation, a stuck session, worktrees, a missing API key, cost and the
folder layout, and not the toolchain. That is a **UI** gap: the checks are
constant and optional, which is the definition of a button. Walk finding 6.

### A — you have a GitHub Copilot seat

This is the setup with no API keys of your own: the seat pays, in **AI
credits, per token**. Nothing here reads `DABBLER_ANTHROPIC_API_KEY` or its
siblings, and you do not need them set.

```
copilot --version
```

**Expect** a Copilot CLI version. Then tell this checkout to use the seat:

```
dabbler configure --transport copilot-cli
```

**Nothing sets `DABBLER_TRANSPORT` for you, and you probably should not set it
yourself.** That variable outranks every configuration layer on the machine,
so one repository's set-up used to change how every other one routed. If it is
already set in your environment, `configure` will tell you so and tell you
which value wins.

**Your session names its model, and that is not optional.** In the UI, the
Start Session flow asks for it and refuses to launch a seat without one,
because a seat's own label does not say which vendor answered.

**Which models you may name is read from your seat, not from a list Dabbler
ships.** Step 0 is where you read it, and everything below depends on having
done that.

### B — you have direct API keys

This is the setup with no seat: each vendor bills your own account, per token.
Set the keys you have:

```
DABBLER_ANTHROPIC_API_KEY
DABBLER_OPENAI_API_KEY
DABBLER_GEMINI_API_KEY
```

Then tell this checkout to use them:

```
dabbler configure --transport api
```

**A reviewer that is a different vendor from the engine is a label and no
longer a refusal.** Dabbler tells you whether a model you are choosing is on
the same provider as the one authoring, and lets you decide: a different
vendor *reduces* the chance the reviewer shares the author's blind spots and
does not eliminate it, and that is a judgement about your work rather than one
a tool can make for you. Two keys are enough to have the choice; three give
you more of it.

**If `DABBLER_TRANSPORT` is set to `copilot-cli` in your environment**, it
outranks the line above and the seat is billed. `configure` says so when it
happens.

---

## Step 0 — Read what this machine can reach

**Nothing ships a model list.** Dabbler used to carry one inside the
extension — fourteen names, chosen by hand, updated whenever somebody
remembered — and a list that travels in a package is a list about somebody
else's machine. What you may choose is now read from *your* seat and *your*
keys, on this machine, into one file, and reading it is free on both
transports: a vendor's models endpoint is a metadata request, and a seat
states its own models in the reply to opening a conversation. No prompt is
sent and no token is billed.

Do this once per machine, before the first session. A machine that has never
read its list is not broken — it reads *not read yet*, and the remedy is the
line below.

- **Framework —** nothing yet. This is a machine-level reading, not a
  repository one, and there is no repository at this point in the
  walkthrough for the framework to have acted in. From here on the framework
  refreshes a record that has gone stale at the start of a session, for
  nothing, and says when it did.
- **You —** run **Dabbler: Update the Catalog** from the Configuration
  section of the Dabbler pane. It asks once, says what it costs — nothing —
  and runs in a terminal where you can watch it. There is no repository open
  yet on your first time through, so this walkthrough takes the same
  operation from the command line instead; the button is what you will use
  every time after this one.
- **Underneath —**
  ```
  dabbler discovery refresh
  ```

**Expect two lines and a summary, and the numbers to be yours rather than
these:**

```
discovery: the seat block has been re-read -- 26 model(s) the seat lists, free, no prompt sent
discovery: the api block has been re-read -- 196 model(s) recorded, no tokens billed
refresh: the catalog has been re-read where this machine could be read ...
```

**A transport you do not have is skipped and says so**, and it never empties
the block for the one you do: a seat with no provider keys re-reads the seat
alone, and keys with no seat leave the seat's block exactly where it was.
That is what *unread* means here, and it is not the same as *empty*.

**The reading is yours and only yours.** The file records whose seat and
which set of keys it was taken with, and a block recorded for a different
seat or a different key set is treated as unread rather than believed — no
age makes it say more. Copying this file between machines therefore does
nothing useful.

Two things follow for the rest of this walkthrough:

- **Refresh between sessions, not during one.** A session that changed its
  own reviewer pool while running would have edited the conditions of its own
  review, so the refresh is refused while one is in flight and says so.
- **The list you can choose from is the list you just read.** Whatever your
  seat lists today is what **Dabbler: Set the Primary Reviewer's Model** offers and what
  `dabbler configure --reviewer-model` accepts — the same set, from the same
  reading, so the pane cannot offer a model the command would refuse.

---

## Step 1 — Make the project

- **Framework —** nothing yet; this is the first moment of the lifecycle and
  there is no repository for it to have acted in.
- **You —** with no folder open, run **Dabbler: Set Up New Project** from the
  command palette. Two prompts:
  *`New Dabbler project — where should it go?`* — pick `C:\temp`.
  *`New Dabbler project — what is it called?`* — type `uat-json`.
  It makes the folder, initialises the repository through VS Code's own git,
  runs bootstrap, commits what bootstrap wrote, and opens the new window.
  When that window offers `Start session 1`, choose `Later`: this
  walkthrough writes its own plan by hand instead of letting session 1 author
  one, which is a legitimate shortcut and step 4 says what it costs.
- **Underneath —**
  ```
  mkdir C:\temp\uat-json
  cd C:\temp\uat-json
  git init -b master
  dabbler bootstrap
  ```

**Expect bootstrap to say what it wrote, and that it committed it:**

```
bootstrap: wrote managed section in AGENTS.md
bootstrap: wrote managed section in CLAUDE.md
bootstrap: added .dabbler/ to .gitignore
bootstrap: installed the step-execution commit guard at .git\hooks\pre-commit
bootstrap: scaffolded dabbler.yaml
bootstrap: it declares no test suite, because nothing at the root of this repository
           says how its tests run; declare one before the first session that writes code
bootstrap: scaffolded docs\sessions\session-plan.md
bootstrap: committed 5 file(s) it wrote; the declaration a session makes comes before
           its work, so session 1 would be refused while they sat uncommitted.
```

**Do not commit anything here.** That last line is the whole reason: a
session's declaration is refused while the working tree carries changes, and
bootstrap has already dealt with its own files. Note the line above it too —
**no test suite was declared**, because at this moment nothing in the folder
says how tests run. Step 5 is where you fix that, and it is not optional.

Nothing here touches your machine outside the project. Bootstrap used to
detect a Copilot seat and persist `DABBLER_TRANSPORT` at user scope, and
that variable outranks every config layer -- so setting up one project
changed how every other one routed, and shadowed whatever a later `dabbler
configure` set. Name the vehicle for THIS checkout with `dabbler configure
--transport copilot-cli` when you want one.

---

## Step 2 — Give the repository a remote

- **No framework register —** and this is a gap the **framework** should
  close. The land runs a bare `git push` and the close reads
  `pushed_to_remote`, so the very first session cannot close without one. That makes it
  lifecycle-timed, at set-up; the URL is the one parameter Dabbler cannot
  determine, which under the principle is a prompt, not four lines of shell.
  Set Up New Project asks no such question today. Walk finding 5.
- **No UI register —** and it is the framework's rather than the UI's, for
  the reason above. **Dabbler: Say Where This Repository Is (Remote)** looks
  like the answer and is not: it records a *sibling repository's* URL for the
  solution graph and runs no `git remote` at all. Do not reach for it here.
- **Underneath —** for this walkthrough a bare repository on disk stands in
  for the remote a real project has:
  ```
  git init --bare C:\temp\uat-json.origin.git
  git remote add origin C:\temp\uat-json.origin.git
  ```

**Expect:** `Initialized empty Git repository`. Step 6 sets the upstream.

---

## Step 3 — Decide the three modules

- **No framework register —** there is nothing to declare: a solution is its
  build files, and the framework reads them as the sessions write them. Which
  modules a solution has is a **person's** judgement, and step 4 writes it
  into the plan.
- **No UI register —** for the same reason, a **person's** judgement and no
  gap: there is no button to declare a module, and none is missing.
- **No command underneath —** nothing is run here.

The solution will be three .NET projects, each written by the session that
builds it, each under its module's folder:

| module | project | references |
| --- | --- | --- |
| `modules\model` | `JsonModel` | — |
| `modules\store` | `JsonStore` | `JsonModel` |
| `modules\app` | `JsonLoader` | `JsonModel`, `JsonStore` |

A project reaches a sibling with a `<ProjectReference>`. Once the build files
hold more than one project and the root has no solution file, the framework
writes the `.slnx` that lists them, `Directory.Build.props` and
`Directory.Build.targets`, before that session's work is verified, and never
rewrites them.

**Check it after session 2** in the **Solution Explorer**: a row for each
project the sessions have written, with its kind, its *Depends on* and its
*Used by*. `JsonModel` is used by `JsonStore` — **which nobody typed**: it
is read from the `<ProjectReference>`.

---

## Step 4 — Write the session plan

- **No framework register —** the plan's substance is a **person's**
  judgement, and Dabbler does not guess it. (Bootstrap's own session 1 is
  where an AI would ask you what the solution is and write the plan inside a
  session. This walkthrough skips that session by writing the plan itself,
  which is why step 1 answered **Later**.)
- **No UI register —** a person's judgement is nobody's to automate, so this
  is not a gap. **Dabbler: Open Session Plan** opens the file for you to
  write in; nothing writes it for you.
- **No command underneath —** this is a file you author.

Replace `docs\sessions\session-plan.md` with this exact content:

```markdown
# Session plan — the JSON solution

## The rule for every session in this plan

**Write the least code that does the job, and stop.** This solution is
deliberately under-engineered, and that is a specification, not an oversight.

- No interface unless two implementations exist today.
- No dependency injection, options pattern, or logging abstraction.
- No custom exception types. Throw the built-in one that fits.
- No async unless an API forces it.
- One public type per module. Plain properties.
- Tests: one per behaviour, at most five per module.

### Session 1 of 3: The item model

**Module:** model

1. Write `Item` with Sku, Name, Quantity and an Id for the database.
2. Close out.

### Session 2 of 3: Storing items

**Module:** store

1. Store items in SQLite. SKU is the natural key, so loading a file twice
   stores each item once.
2. Close out.

### Session 3 of 3: Reading the file

**Module:** app

1. Read a JSON file and store what it contains. Report how many were read and
   how many were new.
2. Close out.
```

**The `**Module:**` line under each heading names the module that session
touches.** A section may name every module its session touches, or none, and
every session runs in the repository you opened.

**The simplicity rule is not decoration.** A different AI model checks each
session's work, and it does not share your intentions. If the plan does not
say the simplicity is deliberate, the checker reports "no error handling" and
"no abstraction" as faults and the session argues with itself for several
rounds.

Also create an `items.json` at the top with three items having `sku`, `name`
and `quantity`. **Do not write `docs\sessions\sessions.json` yourself** —
`dabbler session start` writes the ledger, and every state file under
`docs\sessions\` is the router's to write. A hand-written one is the one
thing this framework refuses outright.

---

## Step 5 — Declare the suite, and which tests cover which code

- **Framework —** at bootstrap, Dabbler read the folder for something that
  said how tests run, found nothing (there was no project file yet) and told
  you so rather than emitting a command that would fail on first use. It does
  not come back to ask later. That it does not is walk finding 10 — the
  moment it *could* is when the first project file appears.
- **No UI register —** nothing offers this. It is constant-with-parameters
  and it has a lifecycle moment, so it is the **framework**'s to close.
- **No command underneath —** you edit `dabbler.yaml`.

The scaffolded `dabbler.yaml` has **no `testing:` key at all** — only a
commented example. Add one, with both halves:

```yaml
testing:
  suites:
    - name: dotnet
      command: dotnet test
      expensive: true
      covers:
        - modules/
      test_roots:
        - modules/model/tests
        - modules/store/tests
        - modules/app/tests
      test_glob: "*Tests.cs"
  selection:
    rules:
      - when: modules/store/src/
        select:
          - modules/store/tests/JsonStore.Tests/ItemStoreTests.cs
```

**Both halves, and neither on its own.** The suite is the command the run of
record runs; the rule is what maps a changed source file to the tests that
exercise it. `covers:` does **not** select tests — in the reference run two
sessions closed green having run no tests at all with `covers:` set — and a
rule with no suite behind it selects tests that nothing runs.

**Check it:**

```
dabbler affected --path modules/store/src/JsonStore/ItemStore.cs
```

**Expect** a line containing `configured-rule` naming your test file — and
**read the line after it**. If it says `no suite is declared, so there is no
command to run`, you have the rule and not the suite, and the run of record
has nothing to do. If it says `no tests affected by this change set`, the
rule is wrong.

You add three more lines to `selection.rules` for each module as you write
its tests.

---

## Step 6 — Commit and push what you wrote

- **No framework register —** and this is a gap the **framework** should
  close, at the declaration. `session start` refuses a working tree that
  carries changes, and steps 4 and 5 have just written three files that nobody
  has committed. Walk finding 5.
- **No UI register —** Start Session does not offer the commit, and nothing
  sets the upstream that the land's bare `git push` needs. It is the
  framework's to close, at the same moment it refuses the tree.
- **Underneath —**
  ```
  git add -A
  git commit -m "The JSON solution, declared"
  git push -u origin master
  ```

**If you skip this, the next step refuses,** and says so plainly:

```
start: refused -- session 1 cannot declare its task list now: the working tree already
         carries 3 change(s) (dabbler.yaml, docs/sessions/session-plan.md, items.json).
         The declaration comes before the work -- one made after it is a model deciding in
         hindsight what may be published. Commit or revert, then declare.
```

The `-u` is not optional either: it sets the upstream that every later push
uses.

---

## Step 7 — Run session 1

- **Framework —** at registration it pulls your checkout forward from
  `origin/master` and registers session 001 in the repository's ledger.
- **You —** in the Work Explorer, **Dabbler: Start Session** on the
  repository row or on session 1's row. Two prompts:
  *`Start session — which engine runs it?`* — pick `Claude Code`
  (`anthropic`) or `GitHub Copilot` (`openai — a seat also needs a
  model`). Those two are what Start launches: an engine whose CLI has not
  been measured is not offered here, and is started by typing `dabbler
  session next` in a terminal of your own instead.
  *`Start session — model for <engine>`* — leave blank for the engine's own
  default; on a Copilot seat type the model, e.g. `gpt-5.4`.
  The AI's terminal opens already running, with the opening sentence already
  typed into it. **Dabbler: Resume Session** brings the AI's terminal back if
  you lose it.
- **Underneath —**
  ```
  dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  dabbler session next --sessions-dir docs/sessions
  ```
  On a seat the first line adds `--engine copilot --provider openai --model
  <one your seat listed in step 0>`; the vehicle is already set, because
  `dabbler configure --transport copilot-cli` in the prerequisites set it for
  this checkout. No `next` carries a transport: a `next` names nothing about
  identity, because the session is in flight and its identity is on the
  record.

**Expect the start to say it registered the session:**

```
start: pulled from origin/master (git pull --ff-only) before registering.
start: session 001 of sessions registered (claude-code).
```

**Then the AI keeps running `dabbler session next` and doing what each answer
says, until it answers `done`.** That loop is the engine's, not yours.

**The one thing that trips everybody.** When the answer's `"kind"` is
`"wait"`, that means *the engine runs `next` again itself*. Nothing notifies
it and no timer is running. What tells **you** the call is not being made is
the Dabbler terminal's silence watcher and the Work Explorer's attention row.

**Expect along the way:** the Work Explorer showing session 001 under an
**In Progress** heading, with rows named Register, Plan, Work, Verify, Test
and Close filling in as it goes; and the `model` row in the Solution Explorer
leading with `● session 1`.

**When it finishes, expect** the session's ledger row to read `complete` with
`"verificationVerdict": "VERIFIED"`, and the Work Explorer to agree — see step 8's first register for why it agrees without
your doing anything.

---

## Step 8 — Reference the model from the modules that use it

- **Framework —** at the **close**, after its push, the session pulled your
  repository forward (`git pull --ff-only`) so the window you started in sees
  the session closed. Nothing is packed or published between modules: a
  sibling is its project, and the next session builds against its source.
- **No UI register —** there is nothing to press, and no gap: which projects a
  module references is the session's **judgement**, written with its code.
- **No command underneath —** a reference is a line in a project file.

**Expect** session 1 to have written the model's project, and the framework to
have written the root build files beside it once the work was done and before
it was verified: `uat-json.slnx` listing the project, `Directory.Build.props`,
`Directory.Build.targets`, and `bin/` and `obj/` in `.gitignore`. Each later
session adds its module's projects to the solution file.

A consuming module references its sibling's project, and the solution file
lists both. In the store's project file:

```xml
<ProjectReference Include="..\..\..\model\src\JsonModel\JsonModel.csproj" />
```

`dotnet test` at the root then builds and tests the whole solution in one pass.

---

## Step 9 — Check that the build output is ignored

- **Framework —** before session 1's work was verified, it added `bin/` and
  `obj/` to `.gitignore` with the other root build files, and they landed with
  the session.
- **No UI register —** there is nothing to press: the **framework** did it at
  the moment the ecosystem became known.
- **No command underneath —** open `.gitignore` and read it. Expect:
  ```
  bin/
  obj/
  ```

**If they are missing, add them before anything else builds.** `dotnet build` and `dotnet test`
write `bin\` and `obj\` inside every project they build. Two things break
together, and this one edit fixes both: the next `session start` is refused,
because untracked build output is a change the declaration counts; and the
close's pull of your repository refuses too, handing you back
`git -C C:\temp\uat-json pull --ff-only` to run yourself.

Commit the `.gitignore` and push it.

---

## Step 10 — Repeat for the other two modules

- **Framework —** as step 7, once per module: the plan's `Module:` line for
  session 2 is `store` and for session 3 is `app`.
- **You —** **Dabbler: Start Session** on session 2's row, then on session
  3's row when session 2 has closed.
- **Underneath —** the same two commands as step 7, per module.

**One difference from the first module:** the store and the app reference
their siblings' **projects**, as step 8 showed, and each session adds its
module's projects to the solution file.

---

## Step 11 — Run what you built

- **No framework register —** running the program you built to see whether it
  works is a **person's** judgement, and the last thing that should be
  automated.
- **No UI register —** for the same reason: a person's judgement, not a gap.
- **No command underneath —** this is the .NET CLI, not Dabbler.

From `C:\temp\uat-json`:

```
dotnet run --project modules/app/src/JsonLoader/JsonLoader.csproj -- items.json people.db
dotnet run --project modules/app/src/JsonLoader/JsonLoader.csproj -- items.json people.db
```

**Expect exactly**, on the two runs in order:

```
Read 3, 3 new.
Read 3, 0 new.
```

The second run reads the same three items and stores none, because SKU is the
key. If the second run says `3 new` again, the store is inserting duplicates.

**Careful with the command.** Anything after `--` goes to the program. If you
write `--nologo` after `--` you will get
`System.IO.FileNotFoundException: Could not find file '...\--nologo'`, which
is the program behaving correctly on a bad path, not a fault.

---

## What to write down

For each step: whether the expected output matched, and if not, exactly what
you saw instead. **Say which register was wrong** — the framework did
something it was not said to do, a button was not where it was said to be, or
the command underneath did not match what the button ran. That is what this
document is for, and a report in those terms tells whoever fixes it whose
problem it is.

A screenshot of the Work Explorer during step 7 is worth having, because that
view is the one under test.

## Known issues — do not report these as new

Each of these was found by walking this document on 8 September 2026 and is
written up in `docs/uat/uat-walk-findings.md` with its reproduction.

- **Nothing in the UI sets the remote or the upstream** (steps 2 and 6).
  Finding 5.
- **Troubleshoot runs no toolchain checks** (prerequisites). Finding 6.
- **No test suite is ever declared for you** (step 5). Finding 10.
- **The Chat panel** takes up the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.
- **Module names are cut short** in the Solution Explorer at narrow widths.
  Drag the sidebar wider.
