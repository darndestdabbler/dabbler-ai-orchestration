# The CSV walkthrough

A complete, tiny project run through all six steps, so you can see the
machinery working before anyone on your team touches it.

The problem is deliberately trivial: read a CSV of people into objects. If you
find yourself thinking about CSV edge cases, something has gone wrong with this
document — the point is to watch the process, not the problem.

**Everything here actually ran.** The event log under `.dabbler/solution/` was
written by the tool, not by hand, and every review reply is on disk verbatim.

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

Open the **Solution Explorer** in the VS Code extension. Components at the top;
each carries its version, its step out of six, its owner, and how many times it
has been sent back. The **Used by** row is the one nobody can work out for
themselves — it is who breaks if a contract changes.

The tree reads `.dabbler/solution/projection.json`, which the tool republishes
on every command. It never folds the event log itself.

## Running it yourself

```bash
python -m ai_router.solution check --workspace-root .
python -m ai_router.workflow status --workspace-root .
python components/csv_app/src/real_run.py fixtures/leading-blank.csv
```

## Two honest caveats

**Steps 2 through 6 were reviewed by a script, not by vendors.** Step 1 was
real — six rounds against Gemini and GPT, and the disagreement at the end is
genuine. The rest were served from `scripted-reviews/` to keep the cost down.
Every scripted round is marked as such in the log and prints a warning when it
runs; none of them is cross-vendor evidence and none of them can be mistaken
for it.

**`.dabbler/` is per-repository and git-ignored.** Your team cannot see each
other's progress yet. Status is local until a shared event source exists.
