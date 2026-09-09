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

**Your session names its model, and that is not optional.** In the UI, the
Start Session flow asks for it and refuses to launch a seat without one.
Dabbler resolves the model through its registry and refuses one it does not
know, because a seat's own label does not say which vendor answered.

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
bootstrap: scaffolded docs\sessions\session-plan.md
bootstrap: committed 6 file(s) it wrote; the declaration a session makes comes before
           its work, so session 1 would be refused while they sat uncommitted.
```

**Do not commit anything here.** That last line is the whole reason: a
session's declaration is refused while the working tree carries changes, and
bootstrap has already dealt with its own files. Note the line above it too —
**no test suite was declared**, because at this moment nothing in the folder
says how tests run. Step 5 is where you fix that, and it is not optional.

`--no-transport-detect` is what the button passes, deliberately: setting up
one project is not a statement about how your machine routes every other one.

---

## Step 2 — Give the repository a remote

- **No framework register —** and this is a gap the **framework** should
  close. The land runs a bare `git push`, the close reads
  `pushed_to_remote`, and a focused checkout is cloned *from the origin*, so
  the very first session cannot start or close without one. That makes it
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

## Step 3 — Declare the three modules

- **Framework —** nothing at this moment; which modules a solution has is
  yours to say. What the framework does with the answer is derive the rest:
  you write only `depends on`, and *used by* is worked out from it.
- **You —** run **Dabbler: New Module** three times. Four prompts each:

  | prompt | model | store | app |
  | --- | --- | --- | --- |
  | `New module (1/2): slug` | `model` | `store` | `app` |
  | `New module (2/4): display title` | `Item model` | `SQLite store` | `JSON loader` |
  | `New module (3/4): kind` | `shared-types` | `library` | `application` |
  | `New module (4/4): depends on` | *(leave blank)* | `model` | `model, store` |

  Each ends with `Module "<slug>" added to docs/modules.yaml.` (The first
  prompt really is titled `1/2` while the rest count to four — walk finding
  8, cosmetic, and it means the flow is longer than the first box implies.)
- **Underneath —**
  ```
  dabbler modules create . --slug model --title "Item model" --kind shared-types
  dabbler modules create . --slug store --title "SQLite store" --kind library --depends-on model
  dabbler modules create . --slug app --title "JSON loader" --kind application --depends-on model --depends-on store
  ```

**Now the part the button cannot do.** New Module asks for four of a module's
six values. The two it does not ask for — the **code root** and the
**package** — are exactly the two that a focused session and a pack cannot do
without, and a module made from the four honest answers refuses both:

```
dabbler module pack model
  -> module pack: refused -- module 'model' declares no package; give it one in docs\modules.yaml

dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  -> start: refused -- module 'model' declares the repository root as a code root;
     a focused checkout of everything is the full checkout, so open the repository itself
```

That is walk finding 1, and it is the **UI**'s to close (two more prompts) or
the framework's (default them from the slug). Until it is, open
`docs\modules.yaml` and add the two lines per module yourself, so the file
reads:

```yaml
modules:
- slug: model
  title: Item model
  kind: shared-types
  codeRoots:
  - modules/model
  package: JsonModel
- slug: store
  title: SQLite store
  kind: library
  codeRoots:
  - modules/store
  package: JsonStore
  dependsOn:
  - model
- slug: app
  title: JSON loader
  kind: application
  codeRoots:
  - modules/app
  package: JsonLoader
  dependsOn:
  - model
  - store
```

**Check what it recorded** in the **Solution Explorer**: three module rows,
each with its kind, its *Depends on* and its *Used by*. `model` is used by
`store` and `app` — **which you never typed.** The CLI form of the same view
is `dabbler modules show .`, and `"multi"` in its answer must be `true`.

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

**The `**Module:**` line under each heading is load-bearing.** It is what
makes each session *focused* — run in that module's own folder, with the
other modules present as packages and contract folders rather than source.
Dabbler reads it, the Work Explorer's yet-to-run rows say `focused: model`,
and Start Session needs no further question. A session whose section says
`Scope: whole repository` instead is global, and runs in the repository.

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
  moment it *could* is the first pack, when the ecosystem becomes known.
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
its tests. **Dabbler: Show Impact** on a module row shows the same plan for
that module's roots.

---

## Step 6 — Commit and push what you wrote

- **No framework register —** and this is a gap the **framework** should
  close, at the declaration. `session start` refuses a working tree that
  carries changes, and steps 3 to 5 have just written three files that nobody
  has committed — including `docs\modules.yaml`, which bootstrap did not
  commit because `modules create` wrote it after bootstrap ran. Walk findings
  2 and 5.
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
start: refused -- the working tree carries 3 change(s)
       (docs/sessions/session-plan.md, docs/modules.yaml, items.json); the module's
       clone is made from the origin, so commit and push them before starting the session
```

The `-u` is not optional either: it sets the upstream that every later push
uses.

---

## Step 7 — Run session 1

- **Framework —** at registration it pulls your checkout forward from
  `origin/master`, reads the plan's `Module: model` line, decides the session
  is **focused**, makes the module's own folder by cloning the origin into
  it, writes the exposure manifest there, and registers session 001 in that
  folder's ledger. You do not run `module open` first — the registration is
  what makes the folder.
- **You —** in the Solution Explorer, **Dabbler: Start Focused Session** on
  the `model` row (the row the plan names for the next session). Two prompts:
  *`Start session — which engine runs it?`* — pick `Claude Code`
  (`anthropic`) or `GitHub Copilot` (`openai — a seat also needs a
  model`). Those two are what Start launches: an engine whose CLI has not
  been measured is not offered here, and is started by typing `dabbler
  session next` in a terminal of your own instead.
  *`Start session — model for <engine>`* — leave blank for the engine's own
  default; on a Copilot seat type the model, e.g. `gpt-5.4`.
  The module's window opens with the AI's terminal already running, and the
  opening sentence already typed into it.
  From the repository row, **Dabbler: Start Session** does the same thing
  when the next session is focused. **Dabbler: Resume Session** brings the
  AI's terminal back if you lose it.
- **Underneath —**
  ```
  dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
  dabbler session next --sessions-dir docs/sessions
  ```
  On a seat the first line takes `--engine copilot --provider openai --model
  gpt-5.4`, and the first `next` of the session carries `--transport
  copilot-cli` unless `DABBLER_TRANSPORT` already says so.

**Expect the start to say where it put the session:**

```
start: pulled from origin/master (git pull --ff-only) before registering.
start: session 001 of sessions registered (claude-code) in module 'model's focused
       checkout at C:\temp\uat-json.model; the exposure manifest is written there.
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

**Do not press Start Focused Session again while it runs.** It refuses over
`docs/sessions/sessions.json` — the ledger the framework itself just wrote —
and tells you to commit or discard it. Do neither: that file is the router's,
and never yours. Walk finding 4.

**When it finishes, expect** the session's ledger row to read `complete` with
`"verificationVerdict": "VERIFIED"`, and the repository window's Work
Explorer to agree — see step 8's first register for why it agrees without
your doing anything.

---

## Step 8 — Publish the module so the others can use it

- **Framework —** two things, at two moments. At the **candidate**, before
  the run of record, the session packed the module itself — that is where a
  package comes from in the normal course of things. At the **close**, after
  its push, it pulled your repository forward (`git pull --ff-only`) so the
  window you started in sees the session closed. You used to have to remember
  that pull; you no longer do — *unless* your repository has uncommitted
  changes, and step 9 explains why on .NET it will have.
- **You —** **Dabbler: Pack Module** on the `model` row, to pack out of band
  so the *next* session can consume the package. It reports one line:
  `model: packed model 0.1.0-dev.20260908.1.gc2a1199`.
- **Underneath —**
  ```
  dabbler module pack model
  ```

**Expect ten lines the first time, not four** — the root build files appear
at the first pack in a repository, because until a module holds a project file
Dabbler cannot tell a .NET solution from a Java one:

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

The button shows only the `packed` line; the CLI shows all ten.

**What must be true regardless of the version:** it begins `0.1.0-dev.`, then
today's date, then a number, then `g` and seven characters.

**What is meant to be true and is not yet.** Packing an unchanged module
twice is meant to give the same version back — that is what the version
record is for. On .NET it does not, and the reason is step 9's.

---

## Step 9 — Ignore the build output, by hand

- **Framework —** at the first pack it wrote the root build files for this
  ecosystem. On a **Maven** solution it also appends `target/` to
  `.gitignore`, with the reason in the file: *"a module's source digest is
  taken over its code roots, so an unignored target/ makes the same source
  pack to a new dev version every time."* On .NET it writes no such rule, and
  everything that comment predicts happens. Walk finding 3 — the
  **framework**'s to close, with the fix already written for the other
  ecosystem.
- **No UI register —** nothing offers it, and nothing should: this belongs
  to the framework at the same moment it writes the other root files.
- **No command underneath —** add two lines to `.gitignore`:
  ```
  bin/
  obj/
  ```

**Do this before anything else builds.** `dotnet pack` writes `bin\` and
`obj\` inside the module it built, the module's source digest is taken over
every non-ignored file under its code roots, and so the pack's own output
becomes its next input. Four packs with nothing changed between them:

```
packed model 0.1.0-dev.20260908.1.gc2a1199
packed model 0.1.0-dev.20260908.2.g90deeb9
packed model 0.1.0-dev.20260908.3.gc53e704
packed model 0.1.0-dev.20260908.4.gb27c782
```

Three things break together, and this one edit fixes all three: the pack
stops being repeatable; the next `session start` is refused, because
untracked build output is a change the declaration counts; and the close's
pull of your repository refuses too, handing you back
`git -C C:\temp\uat-json pull --ff-only` to run yourself.

Commit the `.gitignore` and push it.

---

## Step 10 — Repeat for the other two modules

- **Framework —** as step 7, once per module: the plan's `Module:` line for
  session 2 is `store` and for session 3 is `app`, so each start makes that
  module's folder and registers there.
- **You —** **Dabbler: Start Focused Session** on the `store` row, then on
  the `app` row when session 2 has closed. **Dabbler: Pack Module** on each
  when its session is done, as in step 8.
- **Underneath —** the same two commands as step 7, per module.

Two differences from the first module:

- The store and the app take their siblings as **packages**, not project
  references. In the project file that is `<PackageReference Include="JsonModel" />`
  with no version — the version comes from the pin that step 8 moved.
- Each module needs a short `modules\<slug>\contract\README.md`. Declaring
  `contract: package` does **not** skip this; without it the session refuses
  near the end with `module '<slug>' declares contract: package and has no
  notes page`.

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

- **New Module asks four of a module's six values** (step 3). Finding 1.
- **Bootstrap does not commit the modules manifest** (step 6). Finding 2.
- **No `bin/` or `obj/` ignore rule on .NET** (step 9). Finding 3.
- **Re-opening a module refuses over `sessions.json`** (step 7). Finding 4.
- **Nothing in the UI sets the remote or the upstream** (steps 2 and 6).
  Finding 5.
- **Troubleshoot runs no toolchain checks** (prerequisites). Finding 6.
- **No test suite is ever declared for you** (step 5). Finding 10.
- **The Chat panel** takes up the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.
- **Module names are cut short** in the Solution Explorer at narrow widths.
  Drag the sidebar wider.
