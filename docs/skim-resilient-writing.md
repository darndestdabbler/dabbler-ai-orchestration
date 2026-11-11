# Writing things people will actually skim

**Set by the operator, 2026-08-25.** This is how he writes for executive
leadership, and it is the standard for every walkthrough, UAT, tutorial and
briefing in this project.

## The rules

1. **Put the most important thing first and last, redundantly.** Say it at the
   top. Say it again at the bottom. The repetition is deliberate.
2. **Bold and underline the other important things.**
3. **Group related items into a list.** Number them when order matters — a
   sequence of steps. Bullet them when it does not — a set of considerations
   or constraints.
4. **If a list item runs longer than one sentence, bold and underline the one
   sentence that carries its point.**

## Why this and not something cleverer

**A reader takes in about a quarter of the words on a page, and which quarter
is decided by where the eye lands rather than by what matters.** That is the
consistent finding across eyetracking studies: headings and bold get fixated,
body prose does not.

**So the structure has to carry the meaning, because the prose will not be
read.** That is the whole of it.

**This is a writing constraint, not a model of reading.** An earlier attempt
here simulated skimming with a word budget, a salience table and a decay curve
down the page — and every one of those numbers was an unvalidated claim about
human behaviour. The rules above make the simulation unnecessary: if each
paragraph carries one bold point sentence, "what does a skimmer see" has an
exact answer with nothing left to tune.

## Checking a document before you ship it

```bash
python scripts/skimcheck.py path/to/doc.md
```

It blanks everything except headings, code blocks, tables and bold spans, and
reports which paragraphs have no point sentence. A paragraph with no point
sentence is a claim by its author that the paragraph is deletable — **if it
turns out not to be deletable, it needed a point sentence.**

**Then read the extracted bold sentences as a column, and ask whether they
instruct.** This is the check that matters and it needs no tooling at all:

```bash
grep -o '\*\*[^*]*\*\*' path/to/doc.md
```

**A walkthrough whose bold sentences are all past tense narrates; it does not
instruct.** That defect survived three rewrites of the CSV walkthrough, a
review, and a passing AI follow-through run — and became obvious the moment the
points stood in a column. See `examples/csv-walkthrough/docs/uat-luna.md`.

## Two failure modes to watch

- **Bold dilution.** If every paragraph is heavily bolded, bold stops drawing
  the eye and you are back where you started. `skimcheck.py` flags paragraphs
  carrying more than two bold spans.
- **Bolding the interesting sentence instead of the load-bearing one.** The
  point sentence is the one a reader needs in order to act, which is often the
  dullest sentence in the paragraph.
