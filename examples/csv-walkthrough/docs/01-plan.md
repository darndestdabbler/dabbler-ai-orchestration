# Plan: read a people CSV into objects

## What this is for

A team keeps a list of people in a spreadsheet and exports it as CSV. They want
that file turned into objects a program can work with, and they want to be told
plainly when a row is wrong rather than getting silence or a crash.

That is the whole objective. It is deliberately small.

## Who uses it

- **A developer** calling the parser from their own code. They care about the
  shape of what comes back and about how failure is reported.
- **The person running the app** at a terminal, who has a file and wants to know
  whether it is usable.

## What it must do

1. Read a CSV file, decoded as UTF-8. A leading byte-order mark is removed
   before anything else looks at the text. The first line that is not empty is
   the header; any empty lines before it are skipped. The header must be
   exactly `name`, `email`, `age`, `active` — those four names, in that order,
   with no extra columns, compared exactly as written after surrounding spaces
   are removed. Case must match: `Name` is not `name`. Anything else is
   rejected; see rule 3.
2. Turn each data row into one record with those four fields.
   - `name` is the text as written, with surrounding spaces removed. An empty
     `name` makes the row bad.
   - `email` is the text as written, with surrounding spaces removed. It must
     be non-empty and contain exactly one `@` that is neither first nor last.
     Nothing beyond that is checked — this is not an address validator.
   - `age` must be one or more digits, optionally surrounded by spaces, giving
     a whole number where `0 <= age <= 150`. A leading `+` or `-`, a decimal point, or
     anything non-numeric makes the row bad.
   - `active` must be one of `true`, `false`, `yes`, `no`, `1`, `0`, compared
     without regard to case and ignoring surrounding spaces. `true`, `yes` and
     `1` mean true; the rest mean false. Any other value makes the row bad.
3. Reject the whole file, before reading any data row, if the header is not
   exactly the four names in order. This is the one fatal outcome: it is
   reported as an error, not as a result with zero records, because a caller
   who gets an empty result cannot tell a wrong file from an empty one. The
   error names the columns that were found instead.
4. Report a bad row by its line number in the file. Line numbers count
   every physical line from the start of the file, including blank ones, so a
   number always points at what an editor shows. Keep going — one bad row must not discard the rows that are
   fine. A row with the wrong number of fields is bad, not fatal.
5. Skip any line after the header that is empty or contains only spaces. It
   is neither a record nor a rejection, and it is not counted as either.
6. At the end, report the number of records read and the number of rows
   rejected. Those two numbers, plus the skipped blank lines, plus the header,
   account for every physical line in the file.

## What is deliberately out of scope

- Quoted fields containing commas or newlines. The exports this serves do not
  produce them, and supporting them is the single biggest source of CSV
  complexity.
- Any encoding other than UTF-8. A file that is not valid UTF-8 is an error
  in the same way a wrong header is.
- Writing CSV. This reads only.
- Streaming very large files. The whole file is read into memory.
- Configurable column names, delimiters, or a schema language.

## The shape of the result

Stated here because two reviewers independently found it missing, and a result
shape left to the implementer is the defect this step exists to catch.

Reading a file returns two things together:

- **The records.** Each has `name` (text), `email` (text), `age` (whole
  number), `active` (true/false). Every record is complete — there is no
  "missing" or null field, because a row that could not fill all four is a
  rejection instead.
- **The rejections.** Each has the line number (whole number, header is 1), the
  raw text of the line as it appeared, and one sentence saying what was wrong
  with it. A row can be wrong in more than one way; checking stops at the first
  problem, in field order — `name`, then `email`, then `age`, then `active` —
  and that is the one reported. Rejections come back in file order.

## What "done" looks like

A developer can call one function with a path and get back the records plus the
list of rejected rows. The app prints the counts. A file with a wrong header
fails immediately and names the problem.

## Partial failure: settled

Rule 4 says a bad row is reported and skipped rather than failing the file.
Both reviewers raised the same objection: a caller who ignores the rejected
list silently loses data, and leaving the choice open lets two implementers
build incompatible parsers.

**The decision is skip-and-report.** Reading returns the records and the
rejections together, as one result carrying both.

An earlier draft of this plan claimed that shape *prevents* a caller from
ignoring the rejections. That was wrong, and a reviewer said so: nothing stops
a caller reading the records and discarding the rest. The honest statement is
that this design makes ignoring rejections **visible in the calling code**
rather than impossible — the caller has to actively drop something.

Callers who need all-or-nothing check that the rejection list is empty and fail
themselves. The app in this solution does exactly that, and it is written down
in the app's contract at step 3 so it is a promise rather than a habit.

This is settled, not open.
