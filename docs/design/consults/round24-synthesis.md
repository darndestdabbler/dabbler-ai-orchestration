# Round 24 synthesis: the public documentation, read for gaps

Asked 2026-11-12 of `gpt-6.1-sol` and `gemini-4-argon`, direct API, the same
brief (`round24-brief.md`) with both front pages and the six guide pages
attached whole. Their answers are `round24-sol.md` and `round24-gemini.md`.

## Where they agree

- **The black-box row's gap is real.** Both would name where a person
  watches and what they audit afterwards. Both call "audit" fair for the
  session (plan, diff, tests, review findings, decisions) and unfair for
  "everything the AI did": the transcript defaults to `outline` and never
  carries the engine's own conversation.
- **The evaluation row stops short of the cap.** It says "up to seven
  rounds" and not what happens after the seventh. The guide does: the final
  fix may land marked unreviewed, or the close stays blocked. Found only in
  the guide, that reads as a loophole; said on the front page, it reads as
  honesty. The introduction's "commits only what passed" has the same gap.
- **The scope row overclaims.** "Out-of-scope work ... is blocked by the
  framework" reads as a deterministic lock. What the guide describes is a
  reviewer's finding against the plan's non-goals.
- **The tests row** should say "no test named after it", which is the rule.
- **The stuck row** leaves out that the Mechanic is called in unattended by
  default, before the person is asked.
- **`the-record.md`** should say in one sentence what `outline` leaves out
  and that neither level carries the engine's conversation.
- **No eighth row.** Argon drafted one (destructive commands) and then
  recommended against adding it; Sol found the table complete.

## Where they split

- **The cheating row.** Argon keeps it. Sol would cut "cannot easily cheat"
  and the promise to close each way round. Kept: the operator chose those
  words in session 323, and "easily" already carries the hedge.
- **Requirements on the GitHub page.** Argon would repeat them there. Not
  taken: session 321 made the two pages link each other on purpose.
- **Sol's sentence-level qualifications on the listing** ("committed with
  the code", "change one file", "never reports"). Not taken: each is true
  in plain reading and the qualification costs more than it buys.

## Checked against the source and the guide

- The transcript renderer (`packages/router/src/transcript.ts`) reads the
  driver's events, the run, the work plan, the jobs, the rounds, the
  exceptions and the test records. It reads nothing of the engine's
  conversation. The default of `dabbler.transcript` is `outline`.
- Argon's proposed scope wording, "the framework rejects undeclared edits",
  is **not** supported by the guide, which says a report must match what
  the tree changed and that with no list given the framework takes the
  list from the diff. Not used.
- Sol's "every session, a cancelled one included, is too absolute" misses
  that the same paragraph of the listing names the off switch.

## Recommendation

One session, both front pages kept identical, plus one sentence in the
guide; then a patch release so the listing carries it.

1. Black-box row: say watch and audit, and where.
2. Evaluation row: say what happens after the last round.
3. Scope row: a finding to be fixed or disputed, not "blocked by the
   framework".
4. Tests row: "no test named after it".
5. Stuck row: the Mechanic tries first, unattended, by default.
6. `docs/guide/the-record.md`: what `outline` and `full` carry, and that
   neither carries the engine's own conversation.

Left open, for a later session if wanted: both advisers ranked the same two
unanswered questions highest, what leaves the machine for each reviewer
(privacy), and what a typical session costs.
