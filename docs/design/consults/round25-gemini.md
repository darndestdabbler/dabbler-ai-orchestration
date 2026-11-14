1. **Configuration with no folder.**
Sound. It solves the 2026-11-10 Copilot failure before a folder is opened. The most likely misunderstanding is believing that changing a machine default updates existing repositories that already have their own `.vscode/settings.json`. The toast in Step 2 of Session 330 should say: "Saved as this machine's default. New folders will start with this choice. Existing folders with their own settings will keep them."

2. **The buttons.**
"Solution" is the wrong word for a policy or a novel; it is a .NET term. Because the tree view is named Solution Explorer, you can leave the tree's name alone for now, or rename it to Project Explorer later, but take "Solution" off the buttons. Use these labels:
- No folder open: **Start New Work in a Folder** and **Open Existing Folder or Repository**.
- Folder open, not set up: **Set Up Dabbler in This Folder**.

3. **Session 1's two questions.**
The four categories are the right cut. However, the second prompt asks four questions at once (tell me about it, starting material, what is fixed, and whether to refine together). An AI in a terminal will either dump a wall of text or the user will only answer the last bullet. 

What is missing in the first question: scripts and data analysis do not sound like "an application".
What is one question too many: asking "Would you like to work the idea through together?" as a yes/no meta-question before hearing the idea. Instead, ask for the idea and the constraints, then reflect the idea back and ask if they are ready to write the plan or want to refine it first.

Rewrite of Question 1:
> What are you making?
> 1. Software: an application, a script, a library, or a data analysis.
> 2. A work document: a policy, legislation, a specification, a procedure, a presentation, or a paper.
> 3. A creative work: a story, a novel, a poem, a screenplay, a blog post, a script, or a lecture.
> 4. Something else. Say what.

Rewrite of Question 2:
> Tell me what you can about it now. Include two things if you have them:
> - Material to start from: existing files, drafts, or notes in this folder.
> - What is already fixed: a deadline, a length, a house style, or for software, a language or architecture.
>
> Once you answer, we will work the idea through together until you say it is ready to plan.

4. **One text or four.**
One text, asked inside Session 1. A terminal user running `dabbler bootstrap` should not have to pass a `--kind` flag or navigate a CLI prompt before the AI even starts, and keeping `dabbler.yaml` free of a `kind` key keeps the router simple. Moving the branch into `bootstrap` would require four template sets in TypeScript and a new CLI flag. The only cost of one text is that `session-plan.md` is ~40 lines longer so the AI can see the four branches of Step 2. That is a small price.

5. **Refinement.**
Keep refinement inside Session 1, unless the operator requires cross-provider review after each round of conversation. Because a session can stay open across sittings, holding the back-and-forth in Session 1 works and avoids the trap that nothing can renumber Session 2 while Session 1 is open. 

However, if the user wants multiple *reviewed* interactive sessions, you do not need to renumber Session 2. Remember that Session 2's job is to append Sessions 3..N to `session-plan.md`. If Session 1 finds that major design questions or prototypes are still open, Session 2 can plan Session 3 (or 3 and 4) as interactive refinement or spike sessions, and Session 5 as another planning session that breaks down the rest of the work once those settle. Tell Session 2 in the template that it may plan interactive refinement sessions before the drafting sessions when the brief leaves open questions.

6. **Work that is not code.**
Ranked by where the framework will choke first during Session 332's walk:
1. **The step check.** (Suspicion to check in source: does the step runner require every step to have a shell command check, or does it reject an empty check?) For a document, a step check should be `test -s <path>` (or the Node/PowerShell equivalent on Windows, since this is a government shop on locked-down Windows machines where `test` may not exist in `cmd.exe`) to prove the file exists and is non-empty.
2. **The reviewer prompt.** (Suspicion to check: does the cross-provider verification prompt hardcode words like "code", "bugs", "compile", or "test coverage"?) If it does, a strict reviewer model may fail a prose diff because there are no tests. The reviewer prompt must tell the model to judge the diff against the step's prose instructions, `solution-plan.md`, and `brief.md` (checking completeness, tone, internal consistency, and adherence to constraints).
3. **The empty test suite gate.** (Suspicion to check: when `testing.suites` is empty or omitted in `dabbler.yaml`, does the "run of record" step at session close pass as a no-op, or fail claiming no suite ran?)
4. **Session 2's step language.** In Attachment 2, Session 2 says: "Each session is a focused unit of work one AI coding session can complete". Remove the word "coding" in Session 331 so the authoring AI does not invent fake scripts to test a policy document.

7. **Text, not binary.**
A policy office that lives in Word will accept drafting in Markdown *only* if two things are true: they do not have to install Pandoc on a locked-down government machine to get their `.docx`, and they are starting from a blank page. 
- If they must produce a `.docx` at the end on a locked-down machine without Pandoc, the AI will choke on the conversion step unless it has a tool. (VS Code can preview Markdown, and a user can copy-paste rendered Markdown from VS Code's preview into Word with headings and tables intact; tell the AI to offer that when no converter is installed.)
- If they are starting from an existing `.docx` (which Question 2 invites via "material to start from"), the AI cannot read it reliably without a tool. The smallest fix: tell Session 1 that if the starting material is a `.docx` or `.pptx`, ask the user to save it as plain text or Markdown into the folder first.

8. **Size and order.**
- **Session 330** touches 23+ files across the extension, router, tests, walkthroughs, and docs. That is heavy for one sitting, though Step 4 is mostly mechanical text replacement. It is doable in 4 steps, but watch for context limits.
- **Session 331** is well-sized (4 steps, focused on `templates.ts` and docs).
- **Session 332** is risky. It mixes a known code change (`detect.ts`), two full manual/live walks (Steps 2 and 3, each running 3 sessions to close), open-ended bug fixing (Step 4), and release stamping (Step 5). Running six live AI sessions with cross-provider review inside a single session will blow past the time of one sitting.
- **How to split:** Make 332 just `detect.ts` and the two live walks + fixes. Move the doc updates, `version.json` stamp, and `CHANGELOG.md` (Step 5) into its own short session before the release session, or split the two walks into two sessions if Step 4 uncovers more than a trivial fix.

9. **What to cut, and what the plan has not thought of.**
- **What to cut:** Cut `.c`, `.h`, `.cpp`, `.hpp`, `.swift`, and `.dart` from Session 332 Step 1 unless someone in the shop actually uses them, or keep them as a one-line regex change; more importantly, in Session 330 Step 4, do not spend time updating `docs/onboarding/build-deck.mjs` or `render-csv-walkthrough.mjs` in the same session as the provider logic if the diff gets too large for the reviewer.
- **The one thing the plan has not thought of:** A repository that already has tracked `.ps1` or `.R` files (now classified as `maintenance` by Session 332 Step 1) will get the *maintenance* posture's Sessions 1 and 2. Look at Session 331's non-goals: *"The maintenance posture's two sessions: a repository that already holds code is asked what is to change, as now."* And Session 332 Step 1 notes: *"the maintenance sessions speak of projects and build tools it does not have."* When Session 332 Step 3 walks a PowerShell repository with no build tool and no tests under the `maintenance` posture, the existing maintenance Session 1 and 2 templates will ask about `.sln`/`pom.xml` build tools, projects, and test suites that a folder of PowerShell scripts does not have. You will hit that wall immediately in Step 3 of Session 332. Check the maintenance templates in Session 331 too.
