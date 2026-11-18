# Consult: starting with Dabbler, and what the first two sessions ask

## What Dabbler is

Dabbler is an AI-led session framework: a VS Code extension with a Node
router inside it (`dabbler <verb>`). A person plans numbered sessions in
prose. The framework drives each session one instruction at a time; an
authoring AI (Claude Code or the GitHub Copilot CLI, in a terminal) makes
the edits; the framework runs each step's checks and the declared test
suites, has a model from a different provider review the diff, commits,
pushes and closes. It was built for .NET and Java teams, and every
sentence it scaffolds assumes code.

## What is proposed

Three sessions and a release, planned on 2026-11-14 and not yet started.
Their plan text follows this brief, whole, and after it the first two
sessions exactly as the framework scaffolds them into a new repository
today.

1. **Session 330.** With no folder open, the extension's Solution Explorer
   shows the Configuration (which AI authors, its model, who reviews) as
   this machine's defaults, and every row writes the machine's default.
   Today it shows only an "Open Folder" button. The set-up button is
   renamed from "Set Up New Project" to "Set Up New Solution", a second
   button "Open Existing Folder or Repository" is added, and a folder that
   is open and not set up gets "Set Up Dabbler in This Folder".
2. **Session 331.** The first two sessions of every new repository change.
   Session 1 asks what is being made (an application, a work document, a
   creative work, something else), then asks for detail, material to start
   from, what is fixed, and whether to work the idea through together. The
   plan it writes takes the shape of the work. Session 2 breaks any of
   them into sessions. The .NET and Java scaffolding applies only when the
   plan names a .NET or Java solution.
3. **Session 332.** PowerShell, R and shell scripts count as source when
   set-up reads a repository. A two-page procedure document and a script
   repository are each walked through set-up, sessions 1 and 2 and one
   numbered session to a close, and what stops is fixed or planned.

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

## Facts you may rely on (checked against the source today)

- A choice (engine, model, reviewer) is decided by four layers: a flag on
  the call, the checkout's `.vscode/settings.json`, the machine's
  `preferences.json`, the distribution's defaults. Choosing with a folder
  open writes the checkout, and the machine's default too where the
  machine has none.
- VS Code shows a view's welcome buttons only while that view's tree is
  empty. Once the Configuration always shows, the Solution Explorer has no
  empty state, which is why the buttons move to the Work Explorer.
- The kind of work is not known when set-up scaffolds sessions 1 and 2:
  it is what session 1 asks. Set-up does know whether build files exist
  and whether git tracks any source file.
- Sessions are numbered and nothing renumbers one. No command inserts a
  session between 1 and 2 while 1 is running. A session can stay open
  across sittings.
- A session's work is judged by: each step's own checks (commands with an
  exit code), declared test suites, required controls such as a compile,
  and a reviewer from another provider reading the diff against the plan.
  A repository may declare no suite. Nobody has yet run a session to its
  close in a repository with no code and no suite; session 332 does.
- A reviewer reads text diffs. A `.docx` or `.pptx` is binary.
- The people who use it today are developers in a government IT shop, on
  locked-down machines, most on a Copilot seat. A first project there
  failed on 2026-11-10 because no model had been chosen and nothing said
  where to choose one.
- You cannot see the source. Where you suspect the plan assumes something
  the product may not do, say so as a suspicion to be checked.

## House style for any wording you propose

Plain words, short sentences, no jargon a newcomer would not know, no
marketing adjectives, no em dashes.

## Answer in exactly this shape, under about 1400 words

1. **Configuration with no folder.** Sound, or a trap? Name the one
   misunderstanding a person is most likely to have (for example, about
   what a machine default does to a repository that already has its own
   choice), and the sentence that prevents it.
2. **The buttons.** Give the labels you would ship for the three cases.
   Say whether "Solution" is the right word now that the person may be
   writing a policy or a novel, and if not, the word you would use.
3. **Session 1's two questions.** Rewrite either if you would. Say what is
   missing, what is one question too many, and whether the four categories
   are the right cut.
4. **One text or four.** Session 1's scaffolded text must serve all four
   kinds, because the kind is asked inside it. The alternative is to ask
   the first question at set-up, in a pick list, and scaffold a text
   written for that kind alone. Which, and why? Weigh a person who starts
   from a terminal with no VS Code.
5. **Refinement.** The plan holds the "work it through together"
   conversation inside session 1 and adds no sessions for it. The operator
   spoke of "one or more interactive sessions". Is one long session 1
   right, or should refinement be sessions of its own, and how, given
   nothing renumbers session 2?
6. **Work that is not code.** The framework's evidence is checks, tests
   and a reviewer reading a diff. For a document or a creative work: what
   should a step's check be, what should the reviewer be told to judge,
   and where do you expect the framework to choke first? At most four
   points, ranked.
7. **Text, not binary.** The plan keeps documents as Markdown and produces
   `.docx` or `.pptx` at the end. Right for a policy office that lives in
   Word? If not, the smallest thing that would be.
8. **Size and order.** Is any of the three sessions too large for one
   sitting of three to six steps? Would you reorder or split them?
9. **What you would cut,** and the one thing the plan has not thought of.
