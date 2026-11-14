# Round 26 synthesis: a second, harder reading

Asked 2026-11-14 of `gpt-6-astra` and `gemini-4-carbon`, direct API, the
same brief (`round26-brief.md`) with the amended plan of sessions 330 to
334, round 25's synthesis and today's scaffolded sessions 1 and 2 attached
whole. Their answers are `round26-astra.md` and `round26-carbon.md`. They
were asked to find what round 25 and the plan got wrong, not to repeat it.

## Where they agree, and it changes the plan

Both gave the same verdict: **do part of it now and the rest later.**

- **Ship session 330 alone, first.** Configuration with no folder answers a
  failure already seen in the field and depends on nothing else.
- **Keep "Set Up New Project".** With round 25, that is four advisors of
  four against "Solution". Keep the three buttons.
- **Walk a document to a close before rewriting session 1, not after.**
  Round 25 declined this on the strength of two gates read in the source.
  Both say that reading proved only that the close will not throw: it says
  nothing about what the reviewer does with prose.
- **The scaffolded text is the hardest thing to undo.** It is written into
  a repository once and stays. Keep it short and put what may change where
  a release can change it.
- **Do not tell the public this is for legislation and novels yet.** The
  evidence for prose is a structural check and a model's reading. Let
  session 1 accept anything; let the public pages claim what was walked.
- **The provider notice must wait for an answer.** A file read in the same
  turn as the warning has already left the machine.
- **Bound the reviewer on prose.** Errors are a requirement missed, a
  source contradicted, an earlier section contradicted, a stated rule
  broken. Wording and taste are suggestions, or the loop runs to its cap.
- **Leave `.rmd` and `.qmd` out of the source list.** They are mostly prose.

## What each added alone

- **Astra:** the reviewer may never be shown the brief or the source
  material. A closing session commits and pushes, so a "draft" is not
  private where there is a remote. Existing code routes a person to the
  maintenance sessions, which never ask what they are making. The record
  should say no person has approved a draft. Which copy is authoritative,
  text or Word, should be agreed and not imposed.
- **Carbon:** a paragraph written as one long line shows a three-word edit
  as the whole paragraph replaced, so prose needs one sentence per line.
  PowerShell as the prose check may be restricted on a locked-down
  machine; the router could provide the check itself. A long text with
  four branches is where an authoring model leaks one branch's rules into
  another.

## Their claims, checked against the source

- "The reviewer may not be given the brief or the sources" (Astra).
  **Consistent with the source.** The verification code names the session
  plan and the work plan's task and non-goals; nothing in it names a brief
  or source material. Whether a committed brief reaches the reviewer by
  another road is what the walk records.
- "PowerShell checks may be blocked by execution policy" (Carbon).
  **Partly wrong.** Execution policy governs script files, not
  `powershell -Command`. A constrained machine is still a fair worry, and
  the router has no verb today that checks a file for its sections. Left
  to the walk; a router-provided check is a design, and is planned only if
  the walk shows the need.
- "Maintenance onboarding never asks what is being made" (Astra).
  **True.** It asks what is to change and why. A person writing the
  operating procedure for an existing application is the case. Session 334
  turns the build-file case into a confirmation; whether maintenance needs
  the same is taken from the script walk.
- "The reviewer's severities are defined in code terms" (Carbon, as a
  suspicion). **Not confirmed by reading; left to the walk.**

## What changed in the plan

1. **Two releases.** Session 330 ships alone as 3.34.0 in session 331. It
   stamps its own version and keeps "Set Up New Project", which removes
   the rename across some twenty files.
2. **The document walk moves ahead of the template change** and becomes
   session 332. It runs on the framework as it is, with a hand-written
   plan, source material, one sentence per line, and a seeded
   contradiction for the reviewer to find. It writes its findings to
   `docs/uat/uat-document-walk.md`.
3. **The script walk is session 333,** with `.rmd` and `.qmd` left out.
4. **The first-two-sessions change is session 334,** written from the two
   walks. The scaffolded text is short; the guidance for one kind of work
   is printed by the router. The provider and push notice waits for an
   answer. The authoritative copy is agreed. The reviewer on prose is
   bounded to errors. The public pages claim only what was walked.
5. **Session 335 releases 3.35.0.**
6. Anything the document walk finds that needs a design -- handing the
   reviewer the sources, severity on prose, a check the router provides, a
   line in the record that no person has approved a draft -- becomes a
   session of its own before 334, and is not built inside a walk.

## What was not taken

- An open first question with no categories (Astra, and Sol in round 25).
  The operator asked for the four. They are kept as a prompt, "pick one or
  more, or say it in your own words", and the public pages do not repeat
  the list.
- A template version stamped into each repository's scaffolded sessions,
  with an offered update (Astra). Keeping the scaffold short answers the
  same worry without a new mechanism.
- A new router verb for prose checks, now (Carbon). After the walk, if at
  all.

## Left for the operator

One word reverses the button: the plan keeps **Set Up New Project**, and
the operator proposed "Set Up New Solution".
