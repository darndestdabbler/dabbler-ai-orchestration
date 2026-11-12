# Two models from different providers

The AI that writes a session's code never judges it. Before anything is
committed, a model from a different provider reviews the work, the author
answers each finding by fixing it or disputing it with evidence, and the
round repeats over the fix. The framework runs this loop. No person has to
be present, and no person or AI can type a verdict in place of a review.

This page says how. The full account is in
[Driving a session](../driving-a-session.md), under *What the Primary
Reviewer can see, and what it may ask for* and *The one stop with no
forward exit, and the verb that is one*.

## Who reviews

- The **Primary Reviewer** reviews every round. It is never the author's
  provider and never the author's model.
- The **Auxiliary Reviewer** settles a dispute the Primary Reviewer and the
  author could not. It is neither the author's provider nor any provider
  that has already reviewed the session.

The framework enforces this; neither model is trusted to. The author's
provider is worked out from the vehicle and model the session actually
runs under, never from a label, and it is excluded twice: once when the
candidates are chosen, and again just before the call goes out.

A person can choose the reviewer's model, with
`dabbler configure --reviewer-model <id>` and `--auxiliary-model <id>`.
A chosen model is used or refused, never silently replaced by another.

If no reviewer outside the author's provider can be reached, the session
does not start, and `session start` says so. If one becomes unreachable
later, no verdict is written and the close stays blocked until a person
makes a reviewer reachable.

*See it:* `dabbler configuration explain` names the reviewer each role
would use and the layer that chose it.

## What the reviewer is sent

Every round, the reviewer is sent the session's section of the plan word
for word, the work plan's task and its non-goals, the decisions recorded
during the session, and the list of changed source files that have no test
named after them. The prompt template is
`packages/router/prompt-templates/verification.md`.

- **Round 1** is shown the whole change: the complete diff of the working
  tree against the last commit, and the content of every new file.
- **Each later round** is shown only the fix: the diff from the tree the
  previous round saw. The previous findings come back with it, so the
  reviewer judges whether each one was fixed, and a new finding is allowed
  only inside the lines the fix changed.

Before a round is sent, the repository's compile, typecheck and lint
controls run, and a red one refuses the round without sending it.

The reviewer judges work against the plan, including its non-goals: work
the plan's non-goals rule out is a finding like any other.

## What the reviewer is asked about tests

The framework runs the automated tests before any code is committed: each
step's tests as the step is reported, and the declared suites once review
is done (see [The rules an AI works inside](discipline.md)). The reviewer
writes no tests and runs none.

It is shown every changed source file that has no test named after it and
asked to judge whether what changed is tested. A test the session's own
plan promised and did not deliver is a blocking finding. Any other missing
case is advice, which the reviewer is asked to write as the test somebody
would add.

## Findings, fixes and disputes

A finding is `critical`, `major` or `minor`. Critical and major findings
block; a round whose findings are all minor ends the loop, and the work
counts as verified.

For each blocking finding, the author either fixes it or disputes it. A
dispute must carry evidence: a reason and at least one file in the
repository, cited by path and, if it likes, by line range. A dispute made
of prose alone is refused. A fix is run through every check of the plan
before the next round is sent.

The next round is shown each dispute beside its finding and either upholds
or withdraws it. All of this happens round after round, without a person,
up to the cap: seven rounds, unless the repository's configuration sets
`verification.settings.max_rounds`.

## At the cap

When the last round still has blocking findings, the session ends one of
two ways:

- **Remediated at the cap.** The final fix touched the code every blocking
  finding pointed at, but no round reviewed it. The work may land, and the
  change log says in so many words that it lands unreviewed.
- **Unresolved.** It did not. The close stays blocked, and the findings are
  read when the next session is planned.

If every blocking finding at the cap is disputed, the decision goes to a
person, who can send the disputes to the **Auxiliary Reviewer** with
`dabbler verify adjudicate`. The auxiliary sees each finding, its dispute
and the evidence, raises nothing new, and either upholds or overrules each
one; anything it leaves unclear counts as upheld. If it overrules them all,
the session is verified. If it upholds any, the session is unresolved.
Adjudication runs once per session.

A cap is a spent budget, not a judgment, so more rounds can be bought:
`dabbler verify reopen --rounds N --reason "<why>"`. It buys rounds of
review and never a verdict, and it is refused after an adjudication.

## The record of a review

The reviewer's raw output is written to
`.dabbler/runs/s<N>/round-<n>-verifier-output.md` byte for byte, before
anything parses or displays it. Each round's verdict and findings are a row
in `.dabbler/runs/s<N>/rounds.jsonl`.

## No verdict a person can type

A verdict is one of three words, `VERIFIED`, `ISSUES_FOUND` and
`REMEDIATED_AT_CAP`, and only the framework's own writers stamp one. The
close gate `verdict_vocabulary` refuses any other word in the record, and
`dabbler verify waive` is refused by name: there is no waiver of a verdict.

What a person does have is `dabbler session waive --reason "<why>"`, which
takes a session past the one stop it stands at. It writes no verdict:
whatever was unmet stays written as unmet, and the close says it had an
authorised exception. [The record](the-record.md) says what it leaves
behind.
