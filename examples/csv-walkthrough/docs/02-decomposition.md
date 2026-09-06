# Decomposition: three candidates, one recommended

The plan is settled. This step asks what the pieces are, and it deliberately
puts up more than one answer — a single option presented as the only option is
not a decomposition, it is a preference.

The guidance behind all three is Parnas (1972): **split to hide decisions that
are likely to change, not to mirror the processing steps.** A pipeline diagram
is not a decomposition.

## Candidate A — one component

Everything in a single library: read the file, check the fields, hand back the
records.

- **For:** nothing to integrate. Smallest possible thing that works.
- **Against:** the record shape and the parsing rules change for different
  reasons and on different schedules. A caller who only wants to name the
  record type has to depend on the file reader too.

## Candidate B — split by processing step

Three pieces following the flow: read lines, split fields, convert types.

- **For:** each piece is easy to describe.
- **Against:** this is the split Parnas warns about. Every one of the plan's
  likely changes — a new column, a different `active` spelling, a stricter
  email rule — cuts across all three pieces at once. Three components that
  always change together are one component with extra paperwork.

## Candidate C — split by what changes *(recommended)*

- **`csv-model`** — the record and what makes one valid. Hides the decision
  "what is a person row".
- **`csv-parser`** — turning file text into records and rejections. Hides the
  decision "how is that written down as CSV", including the delimiter, the
  header rule, and blank lines.
- **`csv-app`** — reads a path, uses the parser, reports the counts. Hides the
  decision "what does a person at a terminal see".

### Why this one

Take the plan's three most likely changes and see where each lands:

| Likely change | A | B | C |
| --- | --- | --- | --- |
| Add a `department` column | whole thing | all three | `csv-model`, then `csv-parser` |
| Accept `Y`/`N` for `active` | whole thing | all three | `csv-parser` only |
| Report rejections as a table | whole thing | all three | `csv-app` only |

Only C keeps two of the three changes inside one component. That is the test
that matters, and it is why the recommendation is C.

### What it costs

`csv-model` is small enough that someone will ask why it is separate. The
answer is that it is the only thing `csv-app` needs in order to talk about
results, and folding it into `csv-parser` would make every consumer of the
record depend on the file format. That is the dependency this split exists to
prevent.

## The dependency direction

```
csv-app  ──uses──▶  csv-parser  ──uses──▶  csv-model
   └──────────────────uses─────────────────────▶
```

One direction only. `csv-model` knows nothing about CSV, which is what lets the
mocks at step 4 exist at all.
