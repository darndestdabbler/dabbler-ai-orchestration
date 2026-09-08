# UAT — build the JSON solution with .NET

**What you are testing.** That a person can build a small multi-module .NET
solution using Dabbler, start to finish, following only what is written here.

**What you are building.** A program that reads a JSON file of items and
stores them in a SQLite database. Three modules: the item type, the store, and
the loader that puts them together.

**How long.** About an hour, most of it waiting for AI sessions.

**Before you start, read this once.** Every command below was run for real on
this machine on 7 September 2026, and the expected output is the actual output
that came back. Where a value legitimately changes run to run — a version
string, a timestamp, a commit hash — it is marked `(varies)` and the part that
must still be true is spelled out.

---

## Prerequisites

There are two ways to pay for the models this walkthrough runs, and they need
different setups. **Read part A or part B — whichever matches how your models
are paid for — and ignore the other.** Everybody reads the first part.

### What every run needs

Run these three. If any fails, stop and fix it before going on.

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
dabbler session start --sessions-dir docs/sessions --engine copilot --provider openai --model gpt-5.4
```

Dabbler resolves the model through its registry and refuses one it does not
know, because a seat's own label does not say which vendor answered. Substitute
this line wherever the steps below show `--engine claude-code`.

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
mkdir C:\temp\uat-json
cd C:\temp\uat-json
git init -b master
git init --bare C:\temp\uat-json.origin.git
git remote add origin C:\temp\uat-json.origin.git
```

**Expect:** `Initialized empty Git repository` twice.

**Why the second repository.** Dabbler makes a focused checkout of one module
by cloning from the origin, not by copying your folder. Without an origin,
step 5 refuses with: `module open: refused -- the repository has no 'origin'
remote`.

---

## Step 2 — Declare the three modules

Run these three commands. Each prints one line of JSON back.

```
dabbler modules create . --slug model --title "Item model" --kind shared-types --code-root modules/model --package JsonModel
dabbler modules create . --slug store --title "SQLite store" --kind library --code-root modules/store --package JsonStore --depends-on model
dabbler modules create . --slug app --title "JSON loader" --kind application --code-root modules/app --package JsonLoader --depends-on model --depends-on store
```

**Expect** the last one to print exactly:

```
{"slug": "app", "title": "JSON loader", "kind": "application", "codeRoots": ["modules/app"], "dependsOn": ["model", "store"], "package": "JsonLoader"}
note: no module holds a project file yet, so the root build files wait for the first one that does
```

That note is normal. Dabbler cannot tell whether this is a .NET or a Java
solution until a module contains a project file, so it waits.

Now check what it recorded:

```
dabbler modules show .
```

**Expect:** JSON where `"multi"` is `true`, three modules appear, and `model`
has `"usedBy": ["store", "app"]` — **which you never typed.** You wrote only
`--depends-on`; who depends on what is worked out from that.

---

## Step 2b — Set the repository up

```
dabbler bootstrap --no-transport-detect
```

**Expect** it to write, and to say so: `AGENTS.md`, `CLAUDE.md` and
`GEMINI.md` (the instructions an AI reads), `dabbler.yaml` (the file step 7
adds to, with a `dotnet` suite already in it), a `.gitignore` rule for
`.dabbler/`, a commit hook, and the git refspecs that carry verification
rounds with a push.

**Do this before the first session, and commit what it wrote.** A session's
declaration is refused while the working tree carries changes, so leaving
these uncommitted stops session 1 before it starts:

```
git add -A
git commit -m "Bootstrap: the framework's own files"
```

`--no-transport-detect` keeps it from changing your machine's
`DABBLER_TRANSPORT` preference; leave it off if you want a detected Copilot
seat to be remembered.

---

## Step 3 — Write the session plan

Create `docs\sessions\session-plan.md` with this exact content:

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

**This rule is not decoration.** A different AI model checks each session's
work, and it does not share your intentions. If the plan does not say the
simplicity is deliberate, the checker reports "no error handling" and "no
abstraction" as faults and the session argues with itself for several rounds.
With the rule stated, none of the four sessions in the reference run was asked
to add anything.

Also create an `items.json` at the top with three items having `sku`, `name`
and `quantity`. **Do not write `docs\sessions\sessions.json` yourself** —
`dabbler session start` writes the ledger, and every state file under
`docs\sessions\` is the router's to write. A hand-written one is the one
thing this framework refuses outright. Commit everything and push:

```
git add -A
git commit -m "The JSON solution, declared"
git push -u origin master
```

---

## Step 4 — Tell Dabbler which tests cover which code

Add this to `dabbler.yaml`, under `testing:`:

```yaml
  selection:
    rules:
      - when: modules/store/src/
        select:
          - modules/store/tests/JsonStore.Tests/ItemStoreTests.cs
```

**Do not skip this, and do not assume `covers:` does it.** In the reference
run two sessions closed green having run **no tests at all**, because a suite
was declared and the changed paths were listed under `covers:` and Dabbler
still selected nothing. `covers:` says which paths a suite may speak for. Only
a rule maps a source file to the tests that exercise it.

You will add the same three lines for each module as you write its tests. To
check a rule works:

```
dabbler affected --path modules/store/src/JsonStore/ItemStore.cs
```

**Expect** a line containing `configured-rule` naming your test file. If it
says `no tests affected by this change set`, the rule is wrong.

---

## Step 5 — Open the first module

```
dabbler module open model
```

**Expect** JSON containing `"path": "C:\\temp\\uat-json.model"` and a `"cone"`
listing `docs`, `modules/model`, `packages`, and the *contract* folders of the
other two modules — not their source.

A new folder now exists beside your solution. **Open it in VS Code** — this is
where you work, not the folder you started in.

**Check the point of it:**

```
dir C:\temp\uat-json.model\modules
```

**Expect:** only `model`. The other modules' source is not there, and cannot
be read by accident.

You may also see a note saying `the clone is not blob-filtered`. That is
normal for a local origin and does not affect anything here.

---

## Step 6 — Run the session

In the new window, press **Start Session** in the Dabbler view, or run these
two commands in a terminal at `C:\temp\uat-json.model`:

```
dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
dabbler session next --sessions-dir docs/sessions
```

**On a Copilot seat** (prerequisites, part A), the first line is
`dabbler session start --sessions-dir docs/sessions --engine copilot --provider openai --model gpt-5.4`
instead, and the first `next` of the session carries `--transport copilot-cli`
unless `DABBLER_TRANSPORT` already says so.

Then **keep running `dabbler session next`** and doing what each answer tells
you, until it answers `done`.

**The one thing that trips everybody.** When the answer's `"kind"` is
`"wait"`, that means *run `next` again yourself*. Nothing will notify you and
no timer is running. In the reference run an experienced operator lost forty
minutes to this four separate times.

**Expect along the way:** the Work Explorer showing session 001 under an
**In Progress** heading, with rows named Register, Plan, Work, Verify, Test
and Close filling in as it goes.

**When it finishes, expect** `docs/sessions/sessions.json` to show session 1
as `complete` with `"verificationVerdict": "VERIFIED"`.

---

## Step 7 — Publish the module so the others can use it

```
dabbler module pack model
```

**Expect** four lines, of which the version `(varies)`:

```
packed model 0.1.0-dev.20260907.1.g3854b06
  packages/JsonModel.0.1.0-dev.20260907.1.g3854b06.nupkg
pinned JsonModel in Directory.Packages.props
recorded packages/JsonModel.0.1.0-dev.20260907.1.g3854b06.json
```

**What must be true regardless of the version:** it begins `0.1.0-dev.`, then
today's date, then a number, then `g` and seven characters. Run the same
command twice with no changes and **you get the same version back**. Change a
file and pack again and the number after the date goes up by one.

---

## Step 8 — Go back and pick up the work

Return to `C:\temp\uat-json` and run:

```
git pull origin master
```

**Expect** the session's commits to arrive.

**This step surprises people, so do not skip it.** Until you pull, the folder
you started in still shows session 1 as **not started**, because the work was
done and committed in the focused checkout. If you had the original folder
open in VS Code, its Work Explorer was telling you nothing had happened.

---

## Step 9 — Repeat for the other two modules

Run steps 5 through 8 again with `store`, then with `app`. Two differences:

- The store and the app take their siblings as **packages**, not project
  references. In the project file that is `<PackageReference Include="JsonModel" />`
  with no version — the version comes from the pin that step 7 moved.
- Each module needs a short `modules\<slug>\contract\README.md`. Declaring
  `contract: package` does **not** skip this; without it the session refuses
  near the end with `module '<slug>' declares contract: package and has no
  notes page`.

---

## Step 10 — Run what you built

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
you saw instead. A screenshot of the Work Explorer during step 6 is worth
having, because that view is the one under test.

## Known issues — do not report these as new

- **The Chat panel** takes up the right-hand side of the window. Close it with
  **View: Close Secondary Side Bar**; it is not part of Dabbler.
- **Module names are cut short** in the Solution Explorer at narrow widths.
  Drag the sidebar wider.
