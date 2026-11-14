# Round 25 synthesis: starting with Dabbler, and what the first two sessions ask

Asked 2026-11-14 of `gpt-6.1-sol` and `gemini-4-argon`, direct API, the same
brief (`round25-brief.md`) with the plan text of sessions 330 to 333 and
today's scaffolded sessions 1 and 2 attached whole. Their answers are
`round25-sol.md` and `round25-gemini.md`.

## Where they agree

- **Configuration with no folder is sound.** The misunderstanding to
  prevent is that a machine default changes a repository that already has
  its own choice. One sentence, on the label and the toast.
- **"Solution" is the wrong word on the buttons** once the person may be
  writing a policy or a novel. Sol would say "workspace", Argon "Start New
  Work in a Folder". Both keep "Set Up Dabbler in This Folder".
- **One scaffolded text, asked inside session 1.** Not a pick list at
  set-up and four texts: a person at a terminal must be asked the same
  thing, and an early classification can be wrong.
- **Refinement stays inside session 1,** which can span sittings. Where
  more is wanted, session 2 plans refinement or research sessions as 3
  onward, with a planning session after them. Nothing is renumbered.
- **Do not ask "shall we refine?" before hearing the idea.** Hear it, say
  it back, then ask whether it is clear enough to plan.
- **Session 332 as first written was too large:** two walks, unknown
  fixes and the release stamp in one sitting.
- **Word needs more than "at the end".** An existing `.docx` cannot be
  read reliably, and a locked-down machine may have no converter.

## Where they split

- **The four categories.** Sol would drop them for an open question,
  because work is often mixed. Argon keeps them and widens the first to
  "Software: an application, a script, a library, or a data analysis".
- **Whether a build file answers the first question.** Sol: no, confirm it,
  the person may be writing the application's procedure. Argon did not
  raise it.
- **What the plan missed.** Sol: permission to send the material to the
  configured providers, with a required confirmation. Argon: a repository
  of scripts read as `maintenance` gets a session 1 that speaks of
  projects, JDKs and build tools.

## Their claims, checked against the source

- "A compile requirement or an empty suite may stop the close" (both, as a
  suspicion). **Not so for documents.** `judgeSuiteDeclaration` in
  `gates.ts` says a repository of documents "has nothing to run and is
  inapplicable, not passed"; code with no suite is what it refuses.
- "Does every step need a check?" (Argon, as a suspicion). **Yes.** The
  planning instruction in `drive.ts` says "Every step has at least one
  check" and "A step whose product is prose still has a mechanical check",
  and a check is argv spawned with no shell, so `test -s` is not a program
  on Windows. The scaffolded text has to say what a prose check is.
- "The maintenance sessions will ask about `.sln` and `pom.xml`" (Argon).
  **Overstated, and still worth a clause.** They tell the session to read
  the projects, frameworks and build tools as givens; they ask about none
  of them. A script repository has none, and the text should say so.
- "The reviewer's prompt may hard-code tests and bugs" (Argon, as a
  suspicion). **Not confirmed by reading; left to the walk.**

## What was taken into the plan

1. The machine-default sentence, on the section's label and the toast (330).
2. The four categories kept, as a prompt and not a boundary: "pick one or
   more, or say it in your own words", with the first widened to scripts,
   libraries and data analysis (331).
3. The second question asks who the work is for and what would make a
   first draft useful (331).
4. Refinement asked after the idea is heard, in session 1, across
   sittings; session 2 may plan refinement sessions as the first numbered
   ones (331).
5. A build file turns the first question into a confirmation (331).
6. What a prose step's check is, and that the reviewer judges the rest (331).
7. Word: the text is authoritative, a Word copy is made early and at
   review points by a converter or from the Markdown preview, and nothing
   claims a round trip. Binary starting material is saved as text first (331).
8. One sentence naming the two providers the material is sent to, before
   any is read. Not Sol's required confirmation: the framework cannot know
   an office's handling rules, and a gate it cannot judge is ceremony (331).
9. One clause in the maintenance session 1 for a repository of scripts (331).
10. "One AI coding session" loses "coding" in session 2 (331).
11. The walk split in two: a document, including one review that says no
    (332); a script repository, the source list, the words and the stamp
    (333). The release is 334.
12. The source list gains PowerShell, R and shell only (333).

## What was not taken

- An open first question with no categories (Sol). The operator asked for
  the four, and a newcomer answers a list faster than a blank.
- A closure experiment before session 331 (Sol). The two gates it would
  test were read in the source instead.
- A separate session for the words and the stamp (Argon). The split
  already leaves 333 with four steps.

## Left for the operator

**The word on the set-up button.** Both advisors would take "Solution" off
it. The recommendation is to keep **Set Up New Project**: "project" fits a
program, a policy and a novel alike, it is the word already in every
document, and keeping it removes the rename across some twenty files that
both advisors called the crowded part of session 330. "Workspace" is not
offered: VS Code already uses it for something else. The pane keeps the
name Solution Explorer.
