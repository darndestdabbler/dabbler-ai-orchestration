### 1. The goal, in two sentences

Dabbler is for stepwise work written as plain text in git, where a command can check each step and a second AI can review the diff against a written plan. If an artifact is not plain text with a readable diff and cannot be checked by a script—or if its value is pure human taste—it is outside Dabbler unless expressed as code that compiles to the final form (such as LilyPond for music, Mermaid for diagrams, or Marp for slides).

### 2. One Dabbler or two

One Dabbler. Do not resurrect a "light" version; removing enforcement turns Dabbler into a slow chat wrapper. The Python, JavaScript, and LilyPond repositories prove the engine is already general once its prompts stop assuming `.sln` or `pom.xml` files.

However, the operator's guess that "all that is needed is to tailor instructions" is wrong, and Round 26 was right to suspect the reviewer's context. Instructions alone cannot fix a blind reviewer. There is one place where the router's code must change (though not by branching on project type): **the verification payload**. Today, the Primary Reviewer sees only the diff, the session plan, and non-goals. Whether reviewing code or prose, it cannot verify accuracy against an external brief or source code it cannot see. The router needs one general mechanism—such as a `context` or `references` list in the session plan or `dabbler.yaml`—that passes named read-only files to the reviewer alongside the diff.

### 3. A person's review as the test

**Do not build this into the session loop yet.**

If you force a human checklist into the close of every session, one of two things will happen: the operator will get tired of switching to a browser to click `Passes: true` every twenty minutes and will rubber-stamp it, or the session loop will stall waiting for human data entry. Both break the standing rule that the framework must make things easier.

Furthermore, a JSON file saved by a human in an HTML editor violates "the router writes the record; no code path accepts a hand-written verdict." A human checking boxes in a file *is* a hand-written verdict.

If you want structured human UAT for prose or code, treat it as **a milestone session of its own**, using the mechanics you already have:
- **When:** After five or six drafting sessions, plan a UAT session.
- **What the person is asked:** Step 1 instructs the authoring AI to generate the JSON checklist from the requirements covered so far. The step's mechanical check runs a small script verifying the JSON schema.
- **How the review happens:** You open the HTML editor, judge the work, check the boxes, write feedback on failures, and save the JSON.
- **How the router checks it:** Step 2 has a mechanical check: a one-line script that parses the JSON and exits non-zero if any item has `Passes: false`. That keeps deterministic work in the framework.
- **What a failed item becomes:** If the check fails, the authoring AI reads your `Feedback` fields directly from the JSON file and remediates the documents in Step 3, or logs them as planned sessions if they are too big.

You need zero new router code for this. Try it as a pattern in a session plan before enshrining it in the tool.

### 4. The documentation repository for an existing .NET solution

Documenting an existing codebase is a much better test than a scratch SOP, because the claims are falsifiable.

- **How to refer to the code:** Do not use a git submodule; submodules create git state traps for AI agents. Put the .NET repository in a sibling folder (or a gitignored child folder) and record the exact target commit SHA in `dabbler.yaml` or `docs/planning/brief.md`. Add a mechanical check that runs `git -C <code-path> rev-parse HEAD` and confirms it matches the pinned SHA.
- **What the mechanical checks and suites can be:** This is not pure prose; it is technical reference with verifiable symbols. Write a 40-line PowerShell or Node script and declare it as the repository's test suite in `dabbler.yaml`. Have it check:
  1. Every relative markdown link resolves.
  2. Every file or folder path formatted in backticks (e.g., `` `src/Data/Db.cs` ``) exists in the target repo at the pinned SHA.
  3. Every C# class or interface name in a markdown table or heading exists in the `.cs` files (via `git grep` or `rg`).
  4. Prose is formatted one sentence per line.
- **What the reviewer must be given:** As noted in Question 2, if the reviewer only sees the markdown diff and the session plan, it is guessing. It will critique your grammar while missing that the AI hallucinated how your database transactions work. Until the router can pass reference files from the target repo to the reviewer, the authoring AI's work plan must either quote the relevant `.cs` signatures into a scratch file in the diff, or you must add a small router feature in 339 to include declared reference files in the review prompt.
- **What the first five or six sessions should produce:** Do not write 50 pages of human onboarding prose; AI agents do not read long prose well. Write high-density maps for AI-facilitated development:
  - *Session 1:* Solution map and build/test commands (every `.csproj`, its role, its dependency rules, and exact CLI commands to build and run a single test).
  - *Session 2:* Domain glossary and core invariants (what the business terms mean in code, and rules the compiler does not enforce).
  - *Session 3:* Data access and state slice (how connection strings, ORMs, migrations, and transactions are wired, traced through one real entity).
  - *Session 4:* UI / API boundary slice (how a request or user action enters the system, validates, and returns, traced end-to-end).
  - *Session 5:* Modification playbooks ("To add an endpoint, touch X, Y, Z; to add a table, touch A, B; never do C").
- **Keep the seeded-error test:** Yes. In Session 3, deliberately state the wrong transaction boundary or name a class that does not exist, and verify whether the suite and the Primary Reviewer catch it.

### 5. Sessions 339 and 340 rewritten

- **Session 339 (Walk the .NET documentation repo):** Replace the scratch SOP with the first two or three sessions of the .NET documentation repo. Pin the target commit, write the path-and-symbol verification script as the repo's suite, seed one factual error about the .NET code, and observe what the reviewer does when it cannot see the `.cs` files. Record findings in `docs/uat/uat-document-walk.md` and fix small blockers.
- **Session 340 (Add script extensions, drop the walk):** Keep Step 1 (add `.ps1`, `.psm1`, `.psd1`, `.r`, `.sh`, `.bash` to `SOURCE_FILE` in `detect.ts` with unit tests in `detect.test.ts`). **Drop the PowerShell walk.** You already have 131 closed sessions across Python, JS, and Scheme; you know non-.NET code works when suites are declared. Use the second half of 340 either to walk a *pure* prose piece (like your next blog post, which has no code symbols to grep) or to build the reviewer reference-file mechanism if 339 proved you need it.
- **Should 341 wait?** Wait until both the .NET documentation walk (verifiable technical prose) and one short pure-prose walk (blog post or onboarding doc) are done. Technical docs behave like code; a blog post behaves like creative writing. Walking both will take two hours and will keep you from rewriting the permanent session 1 and 2 templates twice.

### 6. What would make this fail

1. **The Blind Reviewer Illusion:** Using Dabbler for documents, poems, or reports where the mechanical check only verifies that a file exists, and the Primary Reviewer has neither the source material nor the taste to judge the work. The reviewer will spend seven remediation rounds arguing with the authoring AI over transition words and formatting, burning tokens and teaching the human to waive every stop.
2. **Turning a sharp developer tool into a clumsy CMS:** Trying to support non-developers or non-text media (music, slides, stories) by bolting on project-type modes and manual checklist ceremonies. Dabbler's strength is git diffs, CLI checks, and strict state records. Keep the engine strict, keep the inputs plain text, and let users bring novel work *to* that model rather than softening the model to chase every medium.