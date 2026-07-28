# S1 remediation sidecar — after discovery rounds 1 + 2

Covers the **11 discovery (round 1)** and **2 supplementary (round 2)** blocking
findings. Every one was **accepted and fixed** — none disputed, none deferred.
All changes are in `docs/tutorials/hello-world.md`.

## Round 1 (discovery, gpt-5.6 ×2, merged)

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Sam never gets the generated `app` lifecycle sets — step 5's PR named only the manifest + CODEOWNERS, omitting the plan stub and the sets `New Module` scaffolds | Step 2 now says `New Module` writes the plan stub **and** both lifecycle sets, "you commit all of it in step 5"; step 5's commit is `git add -A` on an authoring branch |
| 2 | The direct-provider-API variant tells the reader to skip Copilot, but Part 4 then requires a Copilot chat — no execution path | Variant callout now says an AI agent inside VS Code is still required (Claude Code / Codex / Gemini Code Assist) and to paste starter lines into that agent's chat |
| 3 | `python services/app/app.py` sets `sys.path[0]` to `services/app`, so `import services.greeter` raises `ModuleNotFoundError` | Both run commands are now `python -m services.greeter.greeter` / `python -m services.app.app` from the repo root; both plan scopes state the `-m` invocation as a requirement; the five-item check updated. (CI was already safe: `python -m pytest` puts CWD on `sys.path`.) |
| 4 | ADO's **Require a minimum number of reviewers** cannot be set to 0, so the documented stage-1 solo equivalent is unconfigurable | Stage 1 now sets the minimum to 1 **with "Allow requestors to approve their own changes" ticked** — the real ADO equivalent of 0 approvals — and Part 5 unticks it |
| 5 | Installing `@github/copilot` does not create a VS Code Copilot Chat surface; "paste into a Copilot chat in VS Code" was never actionable | Part 1 now states plainly that the CLI *is* the session surface: **Terminal > New Terminal**, run `copilot`, paste at its prompt — and that the Copilot Chat extension is not needed. Both Part 4 paste steps updated to match |
| 6 | `npm install -g @github/copilot` assumes Node/npm, which is not implied by VS Code, Python, or Git | **Node.js 18+** added as prerequisite 4, with `node --version` |
| 7 | The AI-generated implementation-set name was used as a literal in the worktree command and the `prerequisites:` YAML, though the tutorial admits it may differ | Step 2 now says **"Write down the name it actually gave you**: everywhere below that says `005-greeter-hello`, type your set's real name" |
| 8 | Part 5's "land the edits as their own small pull request" gave no branch/commit/PR sequence, and `main` is protected by then | Step 5 now shows `git switch -c authoring/app-module`, `git add -A`, the commit, **`Dabbler: Open PR for this set`** (noting it works from any non-trunk branch), and the branch cleanup |
| 9 | Sam's clone predates `app`; step 6 had him run sets that do not exist locally | Step 6 now opens with **"Sam pulls first (`git pull --ff-only`)"**, stating why |
| 10 | Sam's per-machine Copilot setup was omitted — only `Install ai-router` was named | Step 1 now sends Sam through **all of Part 1**, including signing in to the Copilot CLI |
| 11 | `@priya-gh` / `@sam-gh` are fictional; copied verbatim, CODEOWNERS routes to nobody | Step 3 now instructs replacing them with **real GitHub usernames**, and says GitHub silently declines to route to handles that do not exist |

## Round 2 (supplementary completeness pass)

| # | Finding | Fix |
| --- | --- | --- |
| S1 | The ADO path never gets a runnable CI gate before the PR requires it — ADO ignores GitHub Actions, and the pipeline was only mentioned *after* the merge | A new ADO callout in Part 4 step 5 says, **before opening the PR**, to create a pipeline running the same test command and register it under **Build validation** as **Required**; step 8's ADO note now says there is nothing further to do. The callout explicitly leaves the pipeline YAML to the reader's org standards — shipping one would rebuild the parallel ADO walkthrough this set exists to delete |
| S2 | The ADO teammate path had no permission grant — GitHub's collaborator UI does not exist in ADO | Part 5 step 1 now carries the inline ADO equivalent: add Sam to the project's **Contributors** group under **Project Settings** > **Permissions** |

## Line-count consequence — disclosed, not hidden

The tutorial was **269** lines before this remediation and is **306** after. The
spec's target is "~240 source lines" with an Ends-with of "≤ ~260".

The +37 is entirely the thirteen fixes above; nothing decorative was added, and a
compensating trim pass ran afterward (nine passages tightened). The overage was
**not** closed by reversing fixes, because every one of them closes a step a
reader could not perform — and the tutorial's governing principle (Set 086) is
that an unrunnable step is a defect, not a style issue.

Two honest framings for the residual, offered to the operator rather than
decided unilaterally:

1. The ~240 target was set against a document that had **not yet been
   reader-tested**. Thirteen blocking gaps at first contact suggests the target
   was optimistic for a tutorial that must also carry an ADO variant and a
   direct-API variant.
2. The set's actual objective is met regardless: the teaching surface goes from
   **1,968 lines across three documents** to **461 across two** (306 tutorial +
   154 release/recovery + 1 redirect stub) — a **77% reduction**, with the
   hand-maintained drift discipline retired outright.

S4's live operator walk is the right place to find further cuts, because it will
show which lines nobody needed.
