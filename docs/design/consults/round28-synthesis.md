# Round 28 synthesis: what Dabbler is for beyond code, and a person's review

Asked 2026-11-17 of `gpt-6.1-sol` and `gemini-4-argon`, direct API, the
same brief (`round28-brief.md`) with the plan text of sessions 339 to 342
and the syntheses of rounds 25 and 26 attached whole. Their answers are
`round28-sol.md` and `round28-gemini.md`.

The operator's question: the framework already runs Python, JavaScript and
LilyPond repositories; the next need is a documentation repository for an
existing .NET solution; should there be a general or "light" Dabbler whose
tests are a person's reviews, and is asking the project type and tailoring
the instructions all that is needed?

## Where they agree

- **One Dabbler. No light mode, no second product.** The three
  repositories (131 closed sessions between them) show the engine is
  already general. Less enforcement is not what non-code work lacks.
- **Asking the kind of work and tailoring the instructions is not
  enough.** Instructions cannot hand the reviewer source material it never
  receives. A reviewer shown only a Markdown diff and the plan judges the
  prose and guesses at the facts.
- **No code branches on the kind of work in the session engine.** What the
  reviewer is given is one general mechanism for code and prose alike.
- **The boundary is text.** Work whose authoritative copy is text in git
  is inside, including text that renders to something else (LilyPond,
  Mermaid, slide markup, SVG), provided a person looks at the render.
  Binary-only work and judgments of taste are outside.
- **A person's review belongs at a milestone, not at every close,** and
  the checklist editor is not wired into the router now.
- **The documentation repository is a better first walk than a scratch
  procedure,** because its claims can be shown false.
- **Pin the code by commit, in a sibling checkout. No submodule.**
- **A documentation repository can have a real suite:** links resolve,
  named paths exist at the pinned commit, the pin matches the checkout.
- **Keep the seeded error,** as a false claim about the code that the
  supplied source disproves.
- **Drop the PowerShell walk. Keep the source-list patch.**

## Where they split

- **How a person's acceptance is recorded.** Argon: no new router code; a
  session's steps have the author draft a checklist in the editor's JSON,
  the person fills it in, and a step's check fails while any item fails.
  Sol: a small person-facing action the router records, bound to a
  revision, because the authoring AI must not be able to establish
  acceptance by writing it.
- **How much 339 holds.** Sol: one bounded session to a close. Argon: the
  documentation repository's first two or three.
- **Whether 341 waits for a second kind of prose.** Sol: no, it waits only
  for the reviewer to be given sources. Argon: yes, walk one piece of pure
  prose (a blog post) too, since technical documentation behaves like code.
- **Symbol checks.** Argon: grep every class name a page uses. Sol: text
  search cannot promise that; check explicit references and add more only
  where it earns its cost.

## Their claims, checked

- "A JSON file saved by a person is a hand-written verdict" (Argon).
  **Half right.** The rule covers the router's record, and a file a check
  reads is evidence like any test output. The real weakness is Sol's: the
  authoring AI can tick the boxes itself, and nothing would show it.
  Argon's own pattern has that hole.
- "131 closed sessions" (Argon). **Right:** 12, 75 and 44.
- "`.rmd` and `.qmd` can hold executable code" (Sol, against rounds 25 and
  26). **Right, and it changes nothing now:** they stay out of the source
  list, and the plan stops giving "mostly prose" as the reason.
- Neither was shown the verification code. That the reviewer is given no
  source outside the diff was read in the source for round 26; whether a
  reviewer reached through a seat can read files itself is not known and
  is for the walk to record.

## Recommended, for the operator to approve

1. **One Dabbler.** Session 341 already carries the operator's idea: ask
   what is being made, shape the plan to it, branch no code on it.
2. **Session 339 becomes the documentation walk:** a separate repository
   for an existing .NET solution, the code pinned by commit in a sibling
   checkout, a small suite of its own, its first two documentation
   sessions run to a close, the second carrying one seeded false claim
   about the code. A person's acceptance is rehearsed by hand at the end,
   with the checklist editor, and what that cost is written down.
3. **Session 340 keeps the source-list patch and swaps the PowerShell walk
   for a short walk of pure prose,** where the risk is a review loop about
   taste and nothing can be grepped.
4. **Two things are designed only from what 339 finds,** each a session of
   its own before 341: naming the material the reviewer is given, and a
   record of a person's acceptance at a milestone, written by the router.
5. **Session 341 waits for both walks.**
