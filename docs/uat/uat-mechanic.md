# Walking the Mechanic: a stuck session, a fresh instance, a way on

For the operator, before session 232 releases this. It checks the Mechanic in a
locally built VSIX, by hand, with three sessions that each get stuck on purpose.
A Mechanic is what a developer does when stuck anyway -- open another AI chat
and tell it to get things going again -- made first-class: `dabbler consult
--mechanic` briefs it, it diagnoses and recommends, and it acts only when you
agree.

**How long.** About an hour and a half, most of it waiting for AI sessions.

**What is billed.** Each session's authoring and review, as any session is, and
one Mechanic conversation per litmus on the model you pick.

---

## What you need

- The local VSIX built from this checkout and `--force`-installed, and the
  window reloaded: `dabbler version` in a new terminal names this checkout's
  build.
- A Java sample repository set up as `docs/uat/uat-java-json-solution.md`
  sets it up, up to the point where its first session is planned. Its
  Configuration: engine Claude Code, authoring model `claude-sonnet-5`, and a
  Primary Reviewer that is not an Anthropic model.
- `DABBLER_ANTHROPIC_API_KEY` and the reviewer's key set in the environment.

Each litmus below is one session. Plan it, **Start Session**, and let it run
until it stops. The Mechanic is always opened the same way:

**You —** on the stopped session's row in the Work Explorer, run **Open a
Mechanic**. Pick an engine and a model -- the box offers the Primary
Reviewer's model -- that is not the author's live session.

**Underneath —** the CLI opens with the sentence
`Run \`dabbler consult --mechanic --sessions-dir docs/sessions\` and read what it
prints before anything else.`

Expect, in the Mechanic's first answer, every check below:

- it ran `dabbler consult --mechanic` and quotes the stop's kind and reason;
- it recommends one way on and changes nothing yet;
- it names any verb that is yours to type (`dabbler session hold-release`,
  `dabbler session cancel --force`) as yours, not its own.

---

## Step 1 — a plan that cannot be built as written

**Framework —** nothing yet: the session is planned, not started.

**You —** plan a session in the Java sample whose section reads, in its
*What.* paragraph: *persist a `Person` (id, name) to SQLite through Hibernate
JPA, with `hibernate-core` as the only Hibernate dependency and no community
dialect.* Then run **Start Session**, and let it run.

**Underneath —** `dabbler session start --sessions-dir docs/sessions --engine
claude-code --provider anthropic --model claude-sonnet-5`, then the author's
`dabbler session next`.

Expect:

- the author stops: a step reported `blocked`, or three refusals of one step,
  with a reason naming the missing SQLite dialect;
- the stop's ways on, in the Dabbler terminal, include
  `Open a Mechanic ...: dabbler consult --mechanic`, above
  `Cancel the session`.

Then open the Mechanic and expect:

- it diagnoses that `hibernate-core` carries no SQLite dialect and recommends
  H2, which it does;
- when you agree -- type `yes, switch to H2` -- it edits the session plan's
  section, the `pom.xml` dependency and the step's files, runs `dabbler
  session plan amend --step <id> ... --reason "<why>"` where a step's files or
  checks change, and adds an entry to `docs/sessions/mechanic-log.md` whose
  heading names the change;
- it writes nothing under `.dabbler/runs/` and does not touch
  `docs/sessions/sessions.json`:

  ```
  git status --short -- .dabbler docs/sessions/sessions.json
  ```

  prints nothing the Mechanic wrote.

Tell the author: `carry on`. Expect:

- the author runs `dabbler session next` and the step is answered with the
  Mechanic's files taken from what changed;
- the session runs to its close;
- the landed commit carries the log entry beside the fix:

  ```
  git show --stat HEAD -- docs/sessions/mechanic-log.md
  ```

  lists the file.

## Step 2 — a release with nowhere to go

**Framework —** nothing yet: the session is planned, not started.

**You —** add a `packaging:` block to the sample's `dabbler.yaml` that names a
Maven feed with no credential behind it, and plan a session that names
`release` in its plan. Run **Start Session**, and let it run.

**Underneath —** the same start; the publish phase runs `dabbler packaging`
between the land and the close.

Expect:

- the session stops at the publish, or at the close with
  `published_when_releasable` refused, and the words name `dabbler consult
  --mechanic` and `dabbler session hold-release` -- not "never here";
- the stop's ways on include `Open a Mechanic`.

Then open the Mechanic and expect:

- it diagnoses the feed with no credential and recommends holding the release;
- it tells you the hold is yours to type, and does not run it.

**You —** in a terminal, type the hold the Mechanic recommended.

**Underneath —** `dabbler session hold-release --reason "no feed credential on
this machine"`

Tell the author: `carry on`. Expect:

- the session closes as held: its close says the release was held, with your
  reason;
- `git status --short` is clean after the close.

## Step 3 — a spent verification cap

**Framework —** nothing yet: the session is planned, not started.

**You —** before starting, set the round cap to 1 for this session, then run
**Start Session** on a session whose work the reviewer is likely to find fault
with (a step that leaves one `TODO` in production code will do).

**Underneath —** `dabbler session plan amend --max-rounds 1 --reason "walk: a
spent cap"` before the first round.

Expect:

- the session stops at verification with the cap reached, and the ways on
  include `dabbler verify reopen --rounds 1 --reason "<why>"` and
  `Open a Mechanic`.

Then open the Mechanic and expect:

- it reads the rounds under `.dabbler/runs/s<N>/` and recommends buying two
  more rounds;
- when you agree -- type `yes, reopen with two rounds` -- it runs

  ```
  dabbler verify reopen --rounds 2 --reason "<its reason>"
  ```

  and nothing else.

Tell the author: `carry on`. Expect:

- the session continues from the stop: a new verification round opens;
- the session runs to its close.

## Step 4 — a fix after the land is an intervention

**Framework —** the session in step 2 or 3 has landed, and stopped after it.

**No UI register —** a person's judgement, and no gap: it is only met when the
Mechanic's fix must change a committed file after the land.

**Underneath —** `dabbler session next`, run by the author after the fix.

To see it on purpose: in step 2, before the hold, ask the Mechanic to correct
the `packaging:` block's feed URL instead, and agree. Expect:

- the Mechanic edits `dabbler.yaml` and adds a `docs/sessions/mechanic-log.md`
  entry;
- the author's `dabbler session next` prints
  `intervention phase=publish reason=<the entry's heading>` and
  `rewound to=verify`, and the fix is verified and landed like any change;
- the close prints `closed after 1 intervention(s):` with the entry's heading.

And the refusal: make a change after the land **without** a log entry, and run
`dabbler session next`. Expect a stop that names
`docs/sessions/mechanic-log.md` and says to record the entry or revert.
