# Consult: is the public documentation missing anything a reader needs?

## What Dabbler is

Dabbler is an AI-led coding-session framework: a VS Code extension with a
Node router inside it (`dabbler <verb>`). A person plans sessions in prose.
The framework drives each session one instruction at a time; an authoring
AI (Claude Code or the GitHub Copilot CLI, in a terminal) makes the edits;
the framework runs the checks and the tests, has a model from a different
provider review the work, commits, pushes and closes.

## The documents you are given

Seven documents follow this brief, whole:

1. `README.md` -- the repository's front page on GitHub.
2. `tools/dabbler-ai-orchestration/README.md` -- the extension's listing on
   the Visual Studio Marketplace. It opens with the same risks table.
3. `docs/guide/README.md` and the five guide pages it indexes. The front
   pages link into these; each is meant to give the mechanism behind one
   claim.

**The reader** is a developer or a technical lead deciding whether to try
the extension. They have not used it. They are sceptical of AI coding
tools, and the risks table is the first thing they read after the picture.

## What prompted this

The operator read the first row of the risks table:

> | AI's work is a black box | The framework shows the work as it happens
> and leaves a plan, a log, the decisions and a transcript in the
> repository. |

and said it does not say that the framework lets a person both **monitor**
everything the AI does (on screen, as it happens) and **audit** it
afterwards (from durable transcripts). A rewording on the table:

> A person can watch what the AI does as it happens, in the Work Explorer
> and the Dabbler terminal, and audit it afterwards: every session leaves a
> plan, a log, the decisions and a transcript in the repository.

Before changing that one row, the operator wants the whole of the public
documentation read for other gaps of the same kind.

## Facts you may rely on (checked against the source today)

- On screen during a session: the **Work Explorer** (each session's phases
  and steps, read from the files the framework writes, with the full text
  of each instruction on hover); the **Dabbler terminal** (every line the
  framework prints: each instruction, check, test run, review round,
  commit and push, timed to the second); and the engine's own terminal,
  where the AI's work is visible as it types.
- The transcript is one self-contained HTML page per session under
  `docs/transcripts/`, committed and pushed by the framework after the
  close. The `dabbler.transcript` setting is `off`, `outline` or `full`,
  and **the default is `outline`**: the framework's own lines, the review
  rounds, the test runs, the steps accepted, the stop, and the output of
  jobs that FAILED. `full` adds every job's output.
- The transcript does not carry the engine's own conversation (what the AI
  typed in its terminal). It carries what the framework asked, what it
  measured, and what the reviewer said.
- You cannot see the source. Where you suspect a sentence claims more than
  the product does, say so as a suspicion to be checked, not as a fact.

## House style for any wording you propose

Plain words, short sentences, no jargon a newcomer would not know, no
marketing adjectives, no em dashes. A table cell is one to three sentences.
Do not promise what the facts above do not support ("everything", "full",
"cannot" need care).

## Answer in exactly this shape, under about 1300 words

1. **The black-box row.** Is the gap real? Give the wording you would
   publish for the right-hand cell, 45 words or fewer. Say whether "audit"
   is a fair word given the default transcript is an outline and the AI's
   own conversation is not in it.
2. **The other six rows.** One line each: keep, or change, and to what.
   Name any row whose right-hand cell leaves out the thing a sceptical
   reader most needs, as the black-box row left out monitor and audit.
   Name any row that overclaims.
3. **Missing risks.** Is there a risk a sceptical reader has about AI
   coding that the table does not name and that these documents show
   Dabbler answers? At most two, each with its row. Say so plainly if the
   table is complete; do not pad it.
4. **The two front pages against each other.** Anything one says that the
   other contradicts, or a claim on the listing that nothing below it
   supports.
5. **The front pages against the guide.** Any claim on a front page that
   its linked guide page does not back up, and any important thing a guide
   page says that the front pages never mention and should.
6. **What a reader still cannot tell** after reading all of it: the
   questions left open (cost, what a person must do by hand, what happens
   when a review is wrong, privacy of what is sent to a reviewer, and so
   on). Rank them; at most five.
7. **The smallest change set.** A ranked list of the edits you would make,
   most valuable first, each one file and one sentence or cell. Mark the
   ones you would NOT make even though they are true, because the page is
   better short.
