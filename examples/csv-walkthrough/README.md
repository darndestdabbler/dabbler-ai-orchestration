# The CSV walkthrough

A complete, tiny project run through all six steps, so you can see the
machinery working before anyone on your team touches it.

The problem is deliberately trivial: read a CSV of people into objects. If you
find yourself thinking about CSV edge cases, something has gone wrong with this
document — the point is to watch the process, not the problem.

**Everything here already ran.** You are not building anything. You are looking
at a finished project and checking that you can tell what happened and where
your staff would look. Reading this end to end takes about fifteen minutes.

---

## Before you start: get the commands working

Every command in this document needs the project's Python environment. Set it
up once, in the terminal you are going to use:

```bash
cd /home/dennis-mitchell/dabbler-ai-orchestration
source .venv/bin/activate
cd examples/csv-walkthrough
```

Check it worked:

```bash
python -m ai_router.workflow status --workspace-root .
```

You should see three components, each at 6/6. If instead you see
`python: command not found` or `No module named ai_router`, the environment is
not active — go back and run the `source` line again. Nothing else in this
document will work until that command does.

**Stay in `examples/csv-walkthrough` for everything below.** Every command
assumes you are there.

---

## What you are looking at

| | Component | What it hides |
| --- | --- | --- |
| 1 | `csv-model` | What a person row *is* — the fields and the rules |
| 2 | `csv-parser` | How that is written down as CSV — delimiter, header, blank lines |
| 3 | `csv-app` | What a person at a terminal sees |

Three components, one direction of dependency: `csv-app` → `csv-parser` →
`csv-model`.

---

## Step 1 — Plan and design

**What happened:** a plan was written, two AI reviewers from two different
vendors read it, and it came back blocked. Five times.

This is the part you most need to know about, so it is not buried.

| Round | Findings | Majors | Result |
| ---: | ---: | ---: | --- |
| 1 | 2 | — | blocked |
| 2 | 4 | 4 | blocked |
| 3 | 9 | 4 | blocked |
| 4 | 5 | 4 | blocked |
| 5 | 8 | 4 | blocked |
| 6 | 4 | 4 | **one vendor cleared it, one did not** |

Every finding was real and every one was fixed — case-sensitive headers, byte
order marks, what counts as a blank line, what happens when a file has no
header at all. The reviewers simply found four more each time.

**A prose plan has no bottom.** You can always be more specific, so "no Major
findings" is not a finish line anyone reaches. This is why step 1 ends with a
person, not with a clean review.

**How it ended:** the developer approved it over four open findings. The
findings stay on the record — the approval is recorded as having overridden
them, and the count is in the log. Nothing was erased to make the step pass.

> If you take one thing from this walkthrough: **you are the tie-breaker on
> steps 1 and 2, and you will need to be.** The reviewers will not stop on
> their own.

## Step 2 — Decompose into components

Three candidates, not one: everything in a single library, a split by
processing step, and a split by what changes. The third was recommended, and
the argument is a table — take the three changes the plan says are likely, and
see which split keeps each change inside one component.

Only the recommended split does. That is the whole reasoning, and it is
checkable rather than a matter of taste.

Both reviewers cleared it. The developer approved. **Approving over two open
nits** — recorded, as before.

## Step 3 — Formalize the contracts

Contracts are rendered as tables with a generated dependency diagram. Open
[`components/csv_model/contract.md`](components/csv_model/contract.md) and look
at the right-hand column: every clause names the test that proves it, or says
**not proved**.

There is no approval gate here. You see the contracts and may object, but the
work does not wait for you.

**A reviewer caught a real conflict:** `csv-app` promised to print the parser's
rejection wording verbatim, while `csv-parser` explicitly refused to promise
that wording. Left alone, the parser team reword a message they were told was
safe to reword, and the app team's tests break.

It was fixed at the right end — the app gave up a promise it could not keep.

## Step 4 — Build the mocks

Stand-ins that satisfy the contracts and nothing more. `mock_parser` **cannot
parse**: it returns a fixed answer per fixture name and raises on anything it
was not scripted for.

That is deliberate. A mock that really parses would let the next step pass
because two implementations happen to agree, which proves nothing about whether
the contracts fit together.

## Step 5 — Build the integration against the mocks

The whole solution running on stand-ins alone:

```
ok   clean.csv: exit 0
ok   mixed.csv: exit 1
ok   wrong-header.csv: exit 2
ok   not-utf8.csv: exit 2

4/4 cases pass on mocks alone
```

Nothing real is behind this. What it proves is that the promises compose.

## Step 6 — Build the real components

`csv-model` and `csv-parser` were built at the same time by different people.
The Explorer shows both at 6/6 with their owners.

### The feedback loop firing

Building the parser proved the contract wrong.

The contract said blank lines *after the header* are skipped and counted, and
declared this invariant:

> records + rejections + blank lines + 1 header == total lines

A file that **begins** with a blank line breaks it. The implementation only
agreed by accident, because it happened to count leading blanks too. Two people
reading that contract build two different parsers.

So the work went backwards:

```
csv-parser sent back to Write down the promises: The line-accounting invariant
is wrong as written... Two implementers reading this build different parsers;
ours only agrees by accident.
  affected: csv-app
```

Three things to notice:

1. **`csv-parser` dropped from 6/6 to 3/6** and carries a send-back count. The
   Explorer shows it.
2. **`csv-model` stayed at 6/6.** A return is scoped to what it affects, not a
   reset of the project.
3. **`csv-app` was named as affected before its team was hit** — and it is the
   consumer who decides whether it cares, not the producer.

The contract was fixed, the version went 1.0.0 → 1.1.0, and the change was
recorded against its consumers.

### The finished state

Real parser, real files, and the same `run()` the mocks used:

```
$ python components/csv_app/src/real_run.py fixtures/leading-blank.csv
2 record(s) read, 1 row(s) rejected
  line 4: 'two hundred' is not an age from 0 to 150
exit 1
```

**No code in `app.run` changed between step 5 and step 6.** Swapping the real
component in was a change of argument. That is the claim the six steps make,
and this is the evidence for it.

---

## Where your team looks to see progress

**At a terminal**, this is the command, and it is the one that answers "where
has this got to":

```bash
python -m ai_router.workflow status --workspace-root .
```

```
Read a people CSV into objects — step 6/6: Replace the stand-ins for real
  csv-model            6/6 Replace the stand-ins for real
  csv-parser           6/6 Replace the stand-ins for real      (1 sent back)
  csv-app              6/6 Replace the stand-ins for real
```

**In the editor**, the same information is a tree: the Solution Explorer in the
VS Code extension under `tools/`. Components at the top, each with its version,
its step out of six, its owner, and its send-back count. The **Used by** row is
the one nobody can work out for themselves — it is who breaks if a contract
changes.

> **The extension is not installed for you.** It lives in
> `tools/dabbler-ai-orchestration` and has to be built and loaded into VS Code
> before you can see any of this. If you only want to check the walkthrough,
> the `status` command above tells you the same thing and needs no setup.

The tree reads `.dabbler/solution/projection.json`, which the tool rewrites on
every command. It never works the state out for itself.

---

## Three things that look wrong and are not

You will notice these if you poke around. Each one confused a reader before
you, so they are written down rather than left to be discovered.

**1. `solution check` does not tell you where the project has got to.**

```bash
python -m ai_router.solution check --workspace-root .
```

This validates the manifest — are the components declared properly, do the
dependencies point at things that exist, is there a cycle. It also prints the
*declared starting step*, which is "Plan and design" and always will be. That
is where the manifest says work begins, not where it is now.

**`workflow status` is the only thing that answers "where has this got to".**
One command checks the map, the other reports the journey.

**2. Every component says `approved: false`, and that is correct.**

If you open `.dabbler/solution/projection.json` you will see `approved: false`
on all three components. Nothing is missing.

Approval happens at two moments only — the end of step 1 and the end of step 2
— and both are approvals of **the solution as a whole**, not of any individual
component. Those two approvals are in the event log. No component is ever
approved on its own, so `false` here is the permanent and expected value.

Steps 3 through 6 have no approval gate at all. Work moves when the reviewers
clear it.

**3. The reviewers say `offline` and `simulated`, on purpose.**

Steps 2 through 6 were reviewed by a script rather than by real vendors, to
keep the cost down. Every one of those rounds is stamped `simulated` in the
log and prints a warning when it runs, precisely so it can never be mistaken
for real cross-vendor evidence.

Step 1 was real — six rounds against Gemini and GPT, and the disagreement at
the end is genuine.

---

## Run the finished thing

```bash
python components/csv_app/src/real_run.py fixtures/leading-blank.csv
```

```
2 record(s) read, 1 row(s) rejected
  line 4: 'two hundred' is not an age from 0 to 150
```

Try `fixtures/clean.csv` (nothing rejected) and `fixtures/wrong-header.csv`
(the file is refused outright) to see the other two outcomes.

## One honest caveat

**`.dabbler/` is per-repository and git-ignored.** Everything the status
command and the Explorer show lives only on the machine that did the work. Your
team cannot see each other's progress yet, and a fresh clone of this repository
starts with no history at all. That needs a shared event source before anyone
relies on it.

---

## When you are done

You should be able to answer these. If you cannot, the document failed and I
want to know which one:

1. What does a developer actually do at step 1, and who decides when it ends?
2. What happens when someone finds a contract wrong while building?
3. Where would you look, tomorrow morning, to see what your team got done?
