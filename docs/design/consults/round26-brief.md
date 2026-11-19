# Consult: a second, harder reading before this is committed to

## What Dabbler is

Dabbler is an AI-led session framework: a VS Code extension with a Node
router inside it (`dabbler <verb>`). A person plans numbered sessions in
prose. The framework drives each session one instruction at a time; an
authoring AI (Claude Code or the GitHub Copilot CLI, in a terminal) makes
the edits; the framework runs each step's checks and the declared test
suites, has a model from a different provider review the diff, commits,
pushes and closes. It was built for .NET and Java teams, and every
sentence it scaffolds assumes code.

## Why you are being asked

Five sessions are planned and none has started. They change how every
person starts with the product, and they widen what it says it is for:
from code to documents and creative work. The operator calls it "a highly
significant change" and wants a harder reading before it is committed to.

Round 25 put the first version of this plan to two other models. Their
agreed points were folded in. You are given, whole:

1. The plan text of sessions 330 to 334 as amended.
2. The synthesis of round 25: what was taken, what was not, and which of
   the advisors' suspicions were checked against the source.
3. Sessions 1 and 2 exactly as the framework scaffolds them today.

**Your job is not to repeat round 25.** It is to find what that round and
this plan got wrong, and to say what cannot easily be undone once shipped.
Agreement is worth one line. Disagreement is worth a paragraph.

## What the operator asked for, in their words

- "I don't understand why a user can't see and set the machine default
  configurations IMMEDIATELY prior to a folder opened or project being
  started."
- The work "could be a .NET solution or a Java solution or some other kind
  of programming solution, or it could be a blog post, or novel, or policy
  document or legislation". The framework "doesn't need built in special
  support for each of these use cases, but it shouldn't choke if a user
  elects to pursue a novel use case."
- Session 1 should ask whether the person "would like one or more
  interactive sessions to refine the idea/concept or discuss constraints
  like timeline or desired/required solution architecture (typically
  recommended)".
- "Ultimately, AI's goal is to create a series of sessions that will
  produce a draft of either the full work/solution or a component of the
  work/solution with planning for anything deferred to a later session."
- On the set-up button, the operator proposed "Set Up New Solution". Round
  25's two advisors both rejected "Solution". The current recommendation
  is to keep today's "Set Up New Project". The operator has not ruled.

## Facts you may rely on (checked against the source)

- The people who use it today are developers in a government IT shop, on
  locked-down Windows machines, most on a GitHub Copilot seat. The same
  operator wants policy and legislative drafters, and people writing for
  themselves, to be able to use it.
- A choice (engine, model, reviewer) is decided by four layers: a flag on
  the call, the checkout's `.vscode/settings.json`, the machine's
  `preferences.json`, the distribution's defaults.
- Sessions 1 and 2 are written into a new repository's `session-plan.md`
  once, at set-up, and stay there. A repository set up before a release
  keeps the text it was given.
- The kind of work is not known at set-up. Set-up does know whether build
  files exist and whether git tracks any source file.
- Every step must declare at least one check: a program and its arguments,
  spawned with no shell, where exit 0 proves the step. The framework's own
  planning instruction says "A step whose product is prose still has a
  mechanical check."
- A repository that declares no test suite and builds no code passes the
  suite gate as "inapplicable": nothing was measured, and the record says
  so. Code with no suite is refused.
- The reviewer is a model from a different provider. It reads the diff
  against the session's section of the plan and the session's declared
  non-goals. Its findings carry a severity; findings that are all Minor
  end the review loop, and the loop has a round cap (seven by default).
  The reviewer writes and runs nothing.
- A session can stay open across sittings. Sessions are numbered and
  never renumbered.
- Nobody has yet run a session to its close in a repository with no code.
- The framework releases as one versioned VS Code extension. Sessions 330
  to 333 are planned to ship together as 3.34.0.
- You cannot see the source. Where you suspect the plan assumes something
  the product may not do, say so as a suspicion to be checked.

## House style for any wording you propose

Plain words, short sentences, no jargon a newcomer would not know, no
marketing adjectives, no em dashes.

## Answer in exactly this shape, under about 1600 words

1. **Verdict, first.** One of: go as planned; go with changes; do part of
   it now and the rest later; do not do this. Then the three changes that
   matter most, ranked.
2. **The widening itself.** Make the strongest case against telling
   people this framework is for policies, legislation and novels in this
   release. Then say whether that case wins. If it half wins, name the
   smallest version that keeps "it should not choke" without promising
   more than has been walked.
3. **Is the evidence honest for prose?** A check that a file exists and
   has its sections, and a model from another provider reading the diff.
   Is that verification, or the look of it? What must the reviewer be
   told so that its findings on prose are about errors and not taste, and
   so the loop ends? What would you put in the record so a reader is not
   misled about what was checked?
4. **What round 25 got wrong.** Name any item under "What was taken into
   the plan" you would reverse, and any under "What was not taken" you
   would take, each with its reason. Say so plainly if there is none.
5. **Session 1's text, read two ways.** First as a person at a terminal
   who has never used the product: quote the sentence that would lose
   them, and rewrite it. Then as the authoring model that must follow one
   text with four branches: where will a model go wrong, and what would
   you change in how the text is built so it does not?
6. **The button.** "Set Up New Project", "Set Up New Solution", or
   another. One answer and one sentence of reason. Then say whether the
   three-button arrangement is right, or whether one of them should go.
7. **What is hard to undo.** List the decisions here that are expensive
   to change after release (for example, text that stays in every
   repository set up under it), ranked, and for each the cheapest way to
   keep it changeable.
8. **Order and release.** Should session 330 ship alone first, as its own
   release, since it answers a failure already seen in the field and
   depends on none of the rest? Should a document be walked to a close
   BEFORE the session 1 text is rewritten, rather than after? Give the
   order you would run.
9. **The thing nobody has thought of.** One, and only if you have one.
