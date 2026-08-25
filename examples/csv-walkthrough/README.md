# The CSV walkthrough

**This is a finished project you look at, not one you build.** It ran a tiny
piece of work through all six steps so you can see the machinery before your
staff touch it. Reading it takes about fifteen minutes.

**The problem is trivial on purpose: read a CSV of people into objects.** If
you catch yourself thinking about CSV edge cases, something has gone wrong —
the point is to watch the process, not the problem.

> **Every paragraph below has one bold sentence, and that sentence is the
> point.** If you read only the bold, the headings and the commands, you should
> still be able to do everything here.

> **Do not hand this to staff yet.** It walks a reader through a *developer's*
> day — running commands at a terminal, opening contracts, reading mocks. Your
> staff supervise AI engines and do not write the code, so their walkthrough is
> two decisions, a handoff and an inbox. That rebuild has not happened.
> **What is below is still true**, and the framework underneath it works; the
> shape is wrong for the audience. See `docs/framework-reconception.md`.

---

## Before you start

**Run these three lines, in this order, in the terminal you are going to use:**

```bash
cd /home/dennis-mitchell/dabbler-ai-orchestration
source .venv/bin/activate
cd examples/csv-walkthrough
```

Check it worked:

```bash
python -m ai_router.workflow status --workspace-root .
```

**You should see three components, each at 6/6, one of them marked
`(1 sent back)`.** That marker is not a problem — it is step 6's feedback loop,
and it is explained there.

**If you get `python: command not found` or `No module named ai_router`, the
environment is not active** — run the `source` line again. Nothing below works
until this does.

**Stay in `examples/csv-walkthrough` for every command in this document.**

---

## What you are looking at

| | Component | What it hides |
| --- | --- | --- |
| 1 | `csv-model` | What a person row *is* — the fields and the rules |
| 2 | `csv-parser` | How that is written down as CSV — delimiter, header, blank lines |
| 3 | `csv-app` | What a person at a terminal sees |

**Dependencies run one way: `csv-app` → `csv-parser` → `csv-model`.**

---

## Step 1 — Plan and design

**What your staff does: a developer works with AI until the objective is
genuinely clear, then two AI reviewers from different vendors attack the plan.**

**Who ends it: you do.** The reviewers do not stop on their own, so the step
finishes when you approve the plan — not when the reviews come back clean.

*What happened here.* The plan went round six times against Gemini and GPT:

| Round | Findings | Majors | Result |
| ---: | ---: | ---: | --- |
| 1 | 2 | — | blocked |
| 2 | 4 | 4 | blocked |
| 3 | 9 | 4 | blocked |
| 4 | 5 | 4 | blocked |
| 5 | 8 | 4 | blocked |
| 6 | 4 | 4 | one vendor cleared it, one did not |

*Every finding was real and every one was fixed* — case-sensitive headers, byte
order marks, what counts as a blank line, what a file with no header does. The
reviewers found four more each time.

**Expect this, and plan for it: a prose document has no bottom, so "no Major
findings" is not a finish line anyone reaches.** The developer approved over
four open findings, and the record says so — the override is counted, and the
findings are kept rather than erased.

## Step 2 — Decompose into components

**What your staff does: AI proposes more than one way to split the work, in
plain language, and recommends one with its reasoning.**

**Who ends it: you do**, the same way as step 1.

**Judge the recommendation by where change lands, not by how tidy it looks.**
Take the changes the plan says are likely, and check which split keeps each one
inside a single component.

*What happened here.* Three candidates were put up — one component, a split by
processing step, and a split by what changes. Only the third keeps two of the
three likely changes inside one component, which is what made the argument
checkable rather than a matter of taste.

## Step 3 — Formalize the contracts

**What your staff does: a developer writes a contract per component, AI
reviews them, and you read them.**

**This step has no approval gate: you may object, but the work does not wait
for you.**

**Read the right-hand column of a contract first** — open
[`components/csv_model/contract.md`](components/csv_model/contract.md), where
every clause names the test that proves it or says **not proved**.

*What happened here.* A reviewer caught two contracts contradicting each other.
`csv-app` promised to print the parser's rejection wording verbatim, while
`csv-parser` explicitly refused to promise that wording — so rewording a message
the parser team were told was safe would have broken the app team's tests. It
was fixed at the weaker end: the app gave up a promise it could not keep.

## Step 4 — Build the mocks

**What your staff does: a developer builds a stand-in for each component that
satisfies its contract and promises nothing more.**

**Keep the stand-ins stupid on purpose.** A mock that does real work lets the
next step pass because two implementations happened to agree, which proves
nothing about whether the contracts fit together.

*What happened here.* `mock_parser` cannot parse at all. It returns a fixed
answer per fixture name and raises on anything it was not scripted for.

## Step 5 — Build the integration against the mocks

**What your staff does: a developer wires the whole solution together and
runs it end to end on stand-ins alone, before any real component exists.**

**What this proves is that the promises compose** — nothing real is behind it.

*What happened here.* Four cases pass on mocks alone:

```
ok   clean.csv: exit 0
ok   mixed.csv: exit 1
ok   wrong-header.csv: exit 2
ok   not-utf8.csv: exit 2

4/4 cases pass on mocks alone
```

## Step 6 — Build the real components

**What your staff does: developers build the real components in parallel, one
each, replacing the stand-ins one at a time.**

**Expect a contract to turn out wrong here, and treat it as normal.** Building
the real thing is what proves a contract; when it does, the work goes back to
step 3 and everyone affected is named.

*What happened here.* `csv-model` and `csv-parser` were built at the same time
by different people. Building the parser proved the contract wrong: it said
blank lines *after the header* are skipped and counted, and declared

> records + rejections + blank lines + 1 header == total lines

*which a file beginning with a blank line breaks. The implementation only
agreed by accident, and two people reading that contract build two different
parsers.*

So the work went backwards:

```
csv-parser sent back to Write down the promises: The line-accounting invariant
is wrong as written... Two implementers reading this build different parsers;
ours only agrees by accident.
  affected: csv-app
```

**Three things to notice about what a send-back does, because this is where
most processes get it wrong:**

1. **`csv-parser` dropped from 6/6 to 3/6** and carries a send-back count.
2. **`csv-model` stayed at 6/6** — a return is scoped to what it affects, not a
   reset of the whole project.
3. **`csv-app` was named as affected before its team was hit**, and the
   consumer decides whether it cares, not the producer.

**A contract change carries its version and names its consumers**: this one
went 1.0.0 → 1.1.0 and was recorded against `csv-app`.

### The finished state

**Swapping a real component in should be a change of argument, and here it
was:** no code in `app.run` differs between step 5 on mocks and step 6 on the
real parser. That is the claim the six steps make, and this is the evidence.

---

## Where your team looks to see progress

**At a terminal, this is the command that answers "where has this got to":**

```bash
python -m ai_router.workflow status --workspace-root .
```

```
Read a people CSV into objects — step 6/6: Replace the stand-ins for real
  csv-model            6/6 Replace the stand-ins for real
  csv-parser           6/6 Replace the stand-ins for real      (1 sent back)
  csv-app              6/6 Replace the stand-ins for real
```

**In the editor, the same information is the Solution Explorer tree** —
components with their version, step, owner and send-back count, plus a
**Used by** row naming who breaks if a contract changes.

> **The extension is not installed for you**, and has to be built from
> `tools/dabbler-ai-orchestration` first. The `status` command above tells you
> the same thing and needs no setup.

---

## Three things that look wrong and are not

**Each of these confused a reader before you, so they are written down rather
than left to be discovered.**

**`solution check` does not tell you where the project has got to.** It
validates the manifest and prints the *declared starting step*, which is always
"Plan and design".

```bash
python -m ai_router.solution check --workspace-root .
```

**`workflow status` is the only thing that answers "where has this got to".**
One command checks the map, the other reports the journey.

**Every component says `approved: false`, and that is permanent and correct.**
Approval happens only at the end of steps 1 and 2, and both approve *the
solution as a whole* — no component is ever approved on its own.

**Steps 3 through 6 have no approval gate at all**, so work moves there when
the reviewers clear it.

**The reviewers say `offline` and `simulated` on purpose.** Steps 2 through 6
were reviewed by a script to keep the cost down, and every such round is stamped
in the log so it can never be mistaken for real cross-vendor evidence.

**Step 1 was real** — six rounds against Gemini and GPT, and the disagreement
at the end is genuine.

---

## Run the finished thing

```bash
python components/csv_app/src/real_run.py fixtures/leading-blank.csv
```

```
2 record(s) read, 1 row(s) rejected
  line 4: 'two hundred' is not an age from 0 to 150
```

**Try `fixtures/clean.csv` for the nothing-rejected case and
`fixtures/wrong-header.csv` for the file-refused case.**

---

## One honest caveat

**Everything the status command and the Explorer show lives only on the machine
that did the work**, because `.dabbler/` is git-ignored. Your team cannot see
each other's progress, and a fresh clone starts with no history at all.

---

## When you are done

**You should be able to answer these three questions. If you cannot, the
document failed and I want to know which one.**

1. **What does a developer do at step 1, and who decides when it ends?**
2. **What happens when someone finds a contract wrong while building?**
3. **Where would you look tomorrow morning to see what your team got done?**
