# Consult: what Dabbler is for, beyond code, and what a person's review should be

## What Dabbler is

Dabbler is an AI-led session framework: a VS Code extension with a Node
router inside it (`dabbler <verb>`). A person plans numbered sessions in
prose, in `docs/sessions/session-plan.md`. The framework drives each
session one instruction at a time. An authoring AI (Claude Code or the
GitHub Copilot CLI, in a terminal) answers each instruction: first with a
work plan of three to six steps, each with at least one mechanical check,
then with one report per step. The framework runs each step's checks and
the declared test suites, has a model from a different provider (the
Primary Reviewer) review the diff against the session's section of the
plan, runs remediation rounds on its findings, commits, pushes and closes.
A third model adjudicates a disputed finding. The record is written by the
router only; no code path accepts a hand-written verdict.

Standing rules from the operator that bear on this question:

- No over-engineering. Try removing before adding. Adoption outranks rigour.
- The framework must make things easier. Sessions are three to six steps.
- Every stop has a way on for a person, and a person may waive a stop
  (`dabbler session waive --reason`): the record keeps the real result and
  says a person authorised going on. Waive, never falsify.
- Deterministic work belongs to the framework; the AI owns only the
  non-deterministic kinds.
- Text scaffolded into a repository (sessions 1 and 2, `AGENTS.md`) stays
  there for good, so it is kept short and general.

## What is known, checked today

- Three of the operator's own repositories that are neither .NET nor Java
  have run on the framework without special support: an Inkscape extension
  in Python (12 sessions closed, pytest suites), an HTML and JavaScript
  configurator (75 closed, a Node unit suite and a Playwright suite), and a
  LilyPond engine in Scheme (44 closed, suites that render scores and
  compare harvested output). The framework's own repository is TypeScript.
  In each, a person declared the suites in `dabbler.yaml`; the framework
  had no detector for the language.
- A repository of documents already passes the suite gate: the source says
  it "has nothing to run and is inapplicable, not passed". Code with no
  suite is refused.
- Every step must declare a check, prose steps included.
- The reviewer is given the diff, the session's section of the plan and
  the declared non-goals. Nothing in the verification code hands it a
  brief or source material from outside the diff.
- Nobody has yet run a session to its close in a repository with no code.
- The router has no notion of a person approving a piece of work. A person
  approves plans, and may waive a stop; nothing records "a person read this
  and accepts it".

## What is planned now (attached whole)

Sessions 339 to 342, planned after two earlier consults (rounds 25 and 26,
syntheses attached):

- 339: walk a two-page standard operating procedure to a close in a scratch
  folder, on the framework as it is, with one seeded contradiction for the
  reviewer to find. Write down what was found.
- 340: add PowerShell, R and shell to the list of source extensions, and
  walk a PowerShell repository to a close.
- 341: the scaffolded sessions 1 and 2 ask "What are you making?" (software,
  a work document, a creative work, something else) and shape the plan to
  the answer. The kind is a line in the brief; no code branches on it.
- 342: release.

## What the operator now says (2026-11-17), in their words

> I have been using Dabbler for things other than .NET and Java solutions.
> [...] All those projects seem to work well. Instead of the current 339,
> I have a need to document an existing .NET solution. So, rather than
> building code, we would build documentation. The repo would be a
> separate documentation repo that references the .NET code repo. The idea
> would be to build enough documentation on the code to transition it to
> AI-facilitated development. There should be both high-level
> documentation and some lower-level documentation (e.g., how database
> access is done, what UI tools are used ... etc.). I could also try
> Dabbler on revised Dabbler onboarding documentation, my next blog post
> ... etc -- but all of this empirical work makes me wonder just what the
> goal is. In a previous version of Dabbler, we had a light version of
> Dabbler that didn't really do much enforcement. Perhaps we could
> resurrect the idea of a more general version of Dabbler -- one that does
> not expect code or a coding structure; one where "tests" are systematic
> human reviews and approvals of the AI components/products (written
> documentation, research reports, composition of story scenes/sections,
> music, lyrics, poetry, presentations, diagrams ... etc.), that perhaps
> are guided by AI (perhaps via a UAT process [a checklist editor the
> operator wrote, described below]) and where verification still involves
> diffs. I wonder whether all that is needed is for the framework to
> verify with the human operator what type of project it is and then
> instructions to the AI models would be tailored to suit the project
> type.

The checklist editor is a single HTML file that opens a JSON checklist: a
list of review items grouped by area and subarea, each with a
`HumanAction`, an `Expectation`, a `Passes` checkbox and a `Feedback`
field, optional numbered steps, and a flag for items that need human
judgment. A person works through it and saves the JSON. It was written for
user acceptance testing of applications.

## What is wanted from you

Disagreement is worth a paragraph and agreement one line. Do not repeat
rounds 25 and 26; say where they are now wrong. Say when you are inferring
what the framework does without having been shown it. Answer in this
shape:

1. **The goal, in two sentences.** What should Dabbler say it is for, so
   that the operator can tell which trials are worth running and which
   kinds of work are outside it? Name the boundary (for example: what
   about music, slides, diagrams, images).

2. **One Dabbler or two.** Is "a general or light Dabbler" a separate
   mode, a separate product, or nothing at all, because the framework as
   it stands is already general once its words stop assuming code? Is
   "ask the project type, then tailor the instructions" all that is
   needed? If code should branch on the kind of work anywhere, name the
   one place.

3. **A person's review as the test.** For work no program can judge, should
   the framework record a person's review and approval, and if so:
   - what exactly a person is asked (a checklist the AI drafts from the
     session's requirements, in the editor's JSON format, or something
     smaller);
   - when (every session's close, a session of its own, a milestone);
   - what a failed item becomes;
   - how this stays inside "the router writes the record, a person may
     waive but nothing falsifies", and how it avoids becoming a ceremony a
     person clicks through.
   Say plainly if the answer is "do not build this yet".

4. **The documentation repository for an existing .NET solution.** This
   replaces the scratch procedure as the first document walk. Say:
   - how the documentation repository should refer to the code (a pinned
     commit, a submodule, a sibling folder) so that a claim can be checked;
   - what the mechanical checks and suites of such a repository can
     honestly be (for example: every file, type and member a page names
     exists in the code at the pinned commit);
   - what the reviewer must be given to judge accuracy and not just prose,
     given that today it sees only the diff and the plan;
   - what the first five or six sessions should produce, high level and
     low level, for the stated purpose: making the solution ready for
     AI-facilitated development;
   - whether the seeded-error test from the planned 339 should be kept.

5. **Sessions 339 and 340 rewritten.** In a few lines each: what 339 and
   340 should now be, whether the PowerShell walk in 340 is still worth a
   session given the three repositories above, and whether 341 should
   wait for more than one kind of non-code work to have been walked.

6. **What would make this fail.** The one or two ways this direction goes
   wrong for the operator or for staff who adopt it.
