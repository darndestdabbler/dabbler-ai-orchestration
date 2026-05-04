# Cross-provider verification — Set 13 Session 1, ROUND 2

## Round 1 verdict

`ISSUES_FOUND` — see `session-001.md` (round 1, saved verbatim). Six issues:
1 Critical, 4 Major, 1 Minor. All addressed in round 2.

## Round 2 fixes

### Critical fix — State B sub-path (3) clone gate

**Issue:** Step 1 State B sub-path (3) said to run `git clone <url>`
immediately after the human gives a URL — a write action contradicting
the doc's "no writes until checklist approved" rule. A different-provider
engine following the doc literally would either violate the gate or
stall.

**Fix:** Cloning is now explicitly a discrete preparatory action with
its own one-shot approval, separate from Step 7's main checklist.
Added language to the preamble's "Critical" block carving out the
narrow exception. Sub-path (3) now requires explicit human approval
("Approve the clone?") before the clone runs.

```
[preamble — new "One narrow exception" paragraph after Critical]

**One narrow exception:** if the human chose State B sub-path (3)
(clone a remote repo) at Step 1, you'll need to clone the repo
locally *before* Step 3's canvas can run — there's nothing to canvas
otherwise. That clone is a discrete preparatory action with its own
one-shot approval (covered explicitly in Step 1's State B sub-path
(3) below). It is **not** part of the main action checklist; it
happens earlier so discovery has something to look at.

[Step 1 State B sub-path (3) — replaced]

- **If (3):** ask for the URL **and** for a sensibly-named local folder
  where the clone should live. Then explicitly request a one-shot
  approval for the clone:

  > **I'd like to run `git clone <url> <local-folder>` so I can canvas
  > the project. This is a discrete preparatory action — it doesn't
  > write project files, just brings the repo onto your disk. After
  > cloning I'll go to Step 2 and proceed via the normal dialog →
  > checklist → execute flow. Approve the clone?**

  Wait for explicit approval. On approval, run the clone. After the
  clone completes, follow the same workspace-open vs. retarget-tools
  logic as sub-path (2) above.
```

### Major 1 fix — enum consistency across docs and schema

**Issue:** The doc had 4 tiers (zero / limited / middle / ample) but
the schema's `mode` enum only listed 3 (zero-budget / limited-budget /
ample-budget) — `middle-tier` was missing. Schema example showed
`mode: "limited-budget"` with `threshold_usd: 25` — wrong per the
4-tier mapping ($25 is middle-tier). Outsource-mode tokens were
mixed (`outsource-first` in workflow doc table, `first` in schema).

**Fix:** Added `middle-tier` as a fourth `mode` enum value. Updated
the schema example to use `mode: "middle-tier"` with `threshold_usd: 25`.
Standardized outsource-mode values to short form (`first | last | none`)
matching `ai_router/router-config.yaml`'s actual `outsource_mode`
field; prose can still say "outsource-first" / "outsource-last" but
the schema and workflow-doc table now use the short tokens.
Updated workflow-doc table headers to show the actual enum field
names + values: column 1 is `mode`, column 3 is `outsource_mode`,
column 4 is `verification_method`.

```yaml
# Updated schema
threshold_usd: 25                   # 0 (zero) | <20 (limited) | 20-99 (middle) | 100+ (ample)
threshold_scope: "project-lifetime" # project-lifetime | monthly      [NEW FIELD]
mode: "middle-tier"                 # zero-budget | limited-budget | middle-tier | ample-budget
recommended_outsource_mode: "last"  # first | last | none  (matches router-config.yaml)
verification_method: "api"          # api | manual-via-other-engine | skipped
...
```

### Major 2 fix — arbitrary-path canvas fallback

**Issue:** Step 1 State B sub-paths (2)/(3) said "proceed as if a
workspace were open at that path." But many AI assistants can only
canvas the current workspace, not arbitrary filesystem paths.

**Fix:** Added explicit retargeting check + fallback. Sub-path (2)
now tells the AI to first check whether its tools can read at
arbitrary paths; if not, instruct the human to open the folder in
VS Code and continue. Step 3 also has a tooling-note paragraph at
the top requiring this confirmation before canvas begins.

```
[Step 1 State B sub-path (2) — updated]

- **If (2):** ask for the absolute path. Then check whether your
  tooling can read files at arbitrary paths (some assistants only
  operate within the current VS Code workspace). If yes, use absolute
  paths for every read/glob/command in Step 3. If no, tell the human:
  *"My tools only operate within the active workspace. Please open
  `<path>` as a folder in VS Code (File → Open Folder), then say
  'continue' here and I'll resume from Step 2 against that workspace."*
  Either way, do **not** silently retarget tools to a path the human
  didn't explicitly ask you to canvas.

[Step 3 — new tooling note at top]

**Tooling note:** if you arrived here from State B sub-path (2) or (3),
confirm you can actually read files at the target path. If your tools
only operate within the active VS Code workspace and the human hasn't
yet reopened VS Code at the target folder, **stop and ask them to do
that** before proceeding. Don't try to canvas via guesswork or stale
snapshots.
```

### Major 3 fix — threshold scope ambiguity

**Issue:** Step 5 dialog said "over the project's lifetime" but the
middle-tier mechanic referenced "monthly spend" — without the schema
recording which scope the threshold uses. Future automated enforcement
wouldn't know whether to compare cumulative or monthly spend.

**Fix:** Added `threshold_scope: "project-lifetime" | "monthly"` to
the schema. Step 5 now asks two questions (budget amount + scope),
and middle-tier prompt language clarifies that the 50% prompt fires
against whichever scope was chosen. Workflow doc's monitoring section
inherits the field via the schema reference.

```
[Step 5 dialog — replaced single question with two]

> 1. **What outsourcing/API budget do you want to set for this project?**
>    This is the dollar amount you're comfortable spending on AI
>    router calls (verification, code review, analysis).
> 2. **Is that a project-lifetime cap or a monthly recurring cap?**
>    Project-lifetime is the default — total cumulative spend. Monthly
>    is for projects you expect to keep running indefinitely; the
>    threshold resets each month. Pick whichever matches how you think
>    about budget.
```

### Major 4 fix — manual-verification template URL

**Issue:** Step 5 zero-budget option (a) referenced
`ai_router/prompt-templates/verification.md` "from the canonical
Dabbler repo." For a freshly bootstrapped project, that file isn't
local. Non-technical users had no concrete template to hand the
secondary AI assistant.

**Fix:** Added a stable public URL for the template:
`https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/ai_router/prompt-templates/verification.md`.
The bootstrap doc now points at the URL directly + offers (in the
Step 7 checklist) to write a small `docs/manual-verification.md`
into the consumer project that includes the URL + a step-by-step
recipe — giving the human a permanent local pointer. The workflow-doc
section also references the URL.

### Minor fix — state-detection edge case guards

**Issue:** Step 1/2/3 didn't spell out behavior for empty folders,
multiple `project-plan.md` candidates, partial Dabbler artifacts,
home-directory paths, or stale plans.

**Fix:** Added explicit guard cases:

- **Step 2** — pre-fast-path guard for partial/stale `project-plan.md`.
- **Step 3** — new "Guard cases" subsection covering empty folder,
  too-broad path, multiple plan candidates, existing
  `docs/session-sets/` (with three sub-cases: continuing /
  re-bootstrapping / starting over), and partial/stale plan.

## Final state of the two deliverables

The full updated content of both docs follows. The diffs above are
the changes from round 1; the documents below are the canonical
round-2 versions for verification.

---

## Full content of `docs/adoption-bootstrap.md` (round 2)

```markdown
# Dabbler Adoption Bootstrap

**This doc is for an AI assistant.** A human just pasted a prompt into a chat with you and that prompt sent you here. The human wants to organize their software project under the Dabbler AI-led-workflow approach, and they've asked you to help. This doc tells you how.

Read this whole document first. Then follow it.

---

## Your job

You are now the **bootstrap-orchestrator** for the human's workspace. You will:

1. Figure out what state their VS Code session is in.
2. Have a conversation with them — confirming what you see, educating them briefly, asking the questions you need answers to.
3. Once you understand what to do, **build a numbered checklist** of every file you'd write, every config you'd update, and every folder you'd scaffold. Show it to the human and wait for their approval.
4. After they approve (and only after), execute the checklist.
5. Tell them what you did and where to go next.

**Critical:** Do not write any files, scaffold any folders, or modify any configuration until the human has reviewed your checklist and approved. Per-write confirmations are intrusive and slow; the right shape is "all decisions in dialog → batch-approve a checklist → execute." The human can interrupt at any time during execution.

**One narrow exception:** if the human chose State B sub-path (3) (clone a remote repo) at Step 1, you'll need to clone the repo locally *before* Step 3's canvas can run — there's nothing to canvas otherwise. That clone is a discrete preparatory action with its own one-shot approval (covered explicitly in Step 1's State B sub-path (3) below). It is **not** part of the main action checklist; it happens earlier so discovery has something to look at.

The human is most likely new to Dabbler. Use plain language, explain terms before using them, and treat them as someone deciding whether this approach fits their project — not as someone who already knows it does.

## Tools you'll need

You'll use these capabilities; the names will differ across AI assistants but every modern coding assistant has them:

- **Fetch a URL** (read web content) — to read this doc and any others it links to.
- **List files matching a pattern** (glob / find).
- **Read a file** (open and view contents).
- **Write a file** (create or overwrite).
- **Run a shell command** (for `git clone`, `pip install`, etc.).

If your tool palette is missing one of these, tell the human and stop — the bootstrap relies on all five.

---

## Step 1 — Detect the VS Code state

Look at what the human's VS Code session shows. There are two top-level states:

### State A — A workspace or folder is open

You can see file-tree contents, language indicators, and existing files. The human is working *on* something — either an existing project they want to organize under Dabbler, or a project they've started planning.

→ **Proceed to Step 2.**

### State B — No workspace open, just a chat window

The human launched VS Code without opening any folder. You see no project context.

In this case, ask the human which of these three sub-paths fits:

> **You don't have a workspace open. Which of these matches what you want to do?**
>
> 1. **Design a project plan with you, here, in this conversation** — we'll talk through goals and scope, then turn that into a plan I can scaffold into folders. (Choose this if you have an idea but no code or folder yet.)
> 2. **Work on an existing project I have somewhere on this computer** — tell me the path, and we'll go look at it together. (Choose this if you have a project folder elsewhere.)
> 3. **Clone a project from a remote repo** — give me the URL, and we'll clone it locally and look at it. (Choose this if your project lives on GitHub / GitLab / etc.)

Wait for their answer. Then:

- **If (1):** stay in this chat; you'll handle a greenfield project plan. Skip Step 3 (no canvas needed); go to Step 4 (education).
- **If (2):** ask for the absolute path. Then check whether your tooling can read files at arbitrary paths (some assistants only operate within the current VS Code workspace). If yes, use absolute paths for every read/glob/command in Step 3. If no, tell the human: *"My tools only operate within the active workspace. Please open `<path>` as a folder in VS Code (File → Open Folder), then say 'continue' here and I'll resume from Step 2 against that workspace."* Either way, do **not** silently retarget tools to a path the human didn't explicitly ask you to canvas.
- **If (3):** ask for the URL **and** for a sensibly-named local folder where the clone should live (default suggestion: a sibling of the current folder, named after the repo). Then explicitly request a one-shot approval for the clone:

  > **I'd like to run `git clone <url> <local-folder>` so I can canvas the project. This is a discrete preparatory action — it doesn't write project files, just brings the repo onto your disk. After cloning I'll go to Step 2 and proceed via the normal dialog → checklist → execute flow. Approve the clone?**

  Wait for explicit approval (`yes` / `clone it` / etc.). On approval, run the clone. After the clone completes, follow the same workspace-open vs. retarget-tools logic as sub-path (2) above.

---

## Step 2 — Fast-path check

Before diving into deep dialog, look for signals that the human already has a plan ready:

- Does `docs/planning/project-plan.md` exist?
- Did the human say "I have a plan ready" or similar in their initial message?
- Is the project state otherwise advanced enough that planning is largely done?

If any of these, ask:

> **You appear to have a plan ready. Do you want to skip the discovery dialog and go straight to the action checklist? I'd build session sets directly from your plan, set up your budget, and configure the outsource mode.**

If the human says yes, skip Steps 3–6 and go directly to Step 7 with a minimal checklist. If they say no, or you didn't detect any plan signals, proceed to Step 3.

**Quick guard before fast-pathing:** if a `project-plan.md` exists but looks partial or stale (older than the most recent code changes, missing key sections, or referencing files that no longer exist), don't silently fast-path off it. Ask the human: *"I found a plan at `<path>` — is it current and complete, or should we treat it as a starting point and adjust before building session sets?"*

---

## Step 3 — Confirm understanding (workspace path only)

**Tooling note:** if you arrived here from State B sub-path (2) or (3), confirm you can actually read files at the target path. If your tools only operate within the active VS Code workspace and the human hasn't yet reopened VS Code at the target folder, **stop and ask them to do that** before proceeding. Don't try to canvas via guesswork or stale snapshots.

If you reached this step from State A (workspace open) or you've confirmed your tools can read the target path, do a quick canvas:

- List top-level files and folders.
- Identify the primary language(s) and framework(s).
- Find key files: `README.md`, `package.json`, `pyproject.toml`, `requirements.txt`, build config, etc.
- Look for existing planning artifacts: `docs/planning/`, `TODO.md`, design docs.
- Look for existing session-set artifacts: `docs/session-sets/`. If they exist, this project has been touched by Dabbler before — note that and ask the human about it (see Guard cases below).

### Guard cases

Before summarizing, watch for these states and ask the human directly rather than assuming:

- **Empty folder.** No code, no docs, no config files. Treat this as effectively greenfield — confirm with the human, then route to State B sub-path (1)'s greenfield design flow rather than continuing the canvas-existing path.
- **The path is too broad.** If the canvas reveals a home directory, a workspace root with many unrelated repos, or a parent of multiple projects, ask the human to identify the *specific* project folder before continuing. Don't try to canvas everything.
- **Multiple `project-plan.md` candidates.** If you find more than one candidate (e.g., `docs/planning/project-plan.md` AND `planning/project-plan.md` AND `project-plan.md`), ask the human which is canonical. Don't pick.
- **Existing `docs/session-sets/` artifacts.** Tells you the project has been through Dabbler before. Ask: *"Are you re-bootstrapping after a pause / wanting to continue the existing setup / or starting over?"* Each branch has different next steps:
  - *Continuing*: skip the bootstrap entirely; tell the human to use `Start the next session.` directly.
  - *Re-bootstrapping*: proceed but flag that any new session sets you propose should integrate with (not duplicate) existing ones.
  - *Starting over*: ask the human to confirm they want to overwrite/move the existing session sets first; do NOT silently overwrite.
- **Partial / stale `project-plan.md`.** If a plan exists but feels incomplete or doesn't match the current code state, ask whether it's the current canonical plan or whether you should propose updates. Don't silently treat a stale plan as the truth.

Then summarize back to the human what you see. Be specific. Example:

> Here's what I see in your workspace:
>
> - **Primary language:** Python (a `pyproject.toml` and ~40 `.py` files in `src/`).
> - **Framework:** Looks like FastAPI — there's a `main.py` with `FastAPI()` and a `routers/` folder.
> - **State of completion:** You have models, three working route modules, and a basic test suite (12 tests, mostly passing). No CI configuration yet. No deployment story I can see.
> - **No existing Dabbler artifacts** — `docs/session-sets/` doesn't exist, and there's no `ai_router/router-config.yaml`.
>
> Does this match your understanding? Anything I missed or got wrong? What's the current state of the project from your perspective — what's done, what's in progress, what's blocked?

Wait for the human's response. Adjust your understanding based on what they say. **Do not move on until they've confirmed the canvas is roughly accurate.**

If you came from State B sub-path (1) (greenfield design), skip this step — there's nothing to canvas yet.

---

## Step 4 — Brief education on session sets

The human is about to make decisions about budgets and verification modes. They need to know what those decisions are *for*. Give a short, plain-language explanation. Two paragraphs max:

> **Quick context on how Dabbler organizes AI-led work.** Dabbler breaks a project into **session sets** — planned bodies of work with 1–6 sessions each. A session set is something like "user authentication" or "checkout flow" — focused enough that one human review pass at the end makes sense. Each session is one AI conversation with you (or a different orchestrator next time), ending in a commit and a verification check.
>
> **Why this shape helps.** It gives every change a small, reviewable scope. It keeps cost trackable per-set so you can see what you're spending. And it builds in **cross-provider verification** — at the end of each session, the work goes to a *different* AI provider (Anthropic, Google, OpenAI) for review. That catches the bias-induced misses each provider tends to have. The full canonical workflow lives at `docs/ai-led-session-workflow.md` — you'll see it referenced throughout.

Don't overdo this. The human can read the canonical workflow doc when they want depth. Your job here is to give them enough context to decide on a budget intelligently.

---

## Step 5 — Budget-threshold dialog

Ask the human two questions:

> 1. **What outsourcing/API budget do you want to set for this project?** This is the dollar amount you're comfortable spending on AI router calls (verification, code review, analysis).
> 2. **Is that a project-lifetime cap or a monthly recurring cap?** Project-lifetime is the default and simplest — total cumulative spend over the project's life. Monthly is for projects you expect to keep running indefinitely; the threshold resets each month. Pick whichever matches how you think about budget.

Wait for their answers (a dollar number, or zero; plus `project-lifetime` or `monthly`). Map the dollar amount to a tier and explain what each tier means. The scope answer is recorded in `ai_router/budget.yaml`'s `threshold_scope` field; it doesn't change the tier.

### Tier mapping

#### $0 — zero-budget mode

Tell the human:

> A $0 budget means no API verification calls. That's a real choice and we can support it, but you have to decide between two paths — both have honest tradeoffs. Tell me which you want:
>
> **(a) Manual verification using a different AI assistant.** After each session's work, you open a *different* coding-assistant chat (if I'm Claude Code, you'd open Gemini Code Assist or a GPT-based tool, or vice versa). You hand it the verification template plus the work you just completed, and ask for a `VERIFIED` or `ISSUES_FOUND` verdict. You copy the result back into our chat for the next session's start. This preserves cross-provider verification at a cost of your time, not your money. Multi-step but reliable if you do it consistently.
>
> **The verification template lives at this stable URL:** `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/ai_router/prompt-templates/verification.md`. You can fetch it whenever you need it; you don't need to copy it into your project. (As part of Step 7's checklist I'll offer to write a small `docs/manual-verification.md` to your project that includes the URL + a step-by-step recipe — that way you've got a permanent local pointer when it's time to run a verification.)
>
> **(b) Skip verification entirely.** Each session's `change-log.md` records that verification was explicitly skipped per your $0-budget choice. The audit trail is honest about it. Lower friction; weaker safety net. The canonical workflow's Rule 2 ("never skip verification") has an explicit operator-authorized exception for this case — it's documented in the workflow doc's "Cost-budgeted verification modes" section.
>
> Which one — (a) or (b)?

Wait for their choice. Note it for the budget.yaml record.

#### Less than ~$20 — limited-budget mode

Tell the human:

> A budget under \$20 is real but tight. I'd recommend the **outsource-last** outsource mode — verification work goes to a long-running daemon backed by a subscription CLI rather than per-call API providers. The setup overhead is a one-time thing; per-verification cost is essentially zero once the daemon is running. I'll watch your spend and warn you as you approach your threshold. Sound good?

#### $20–$99 — middle-tier mode

Tell the human:

> A budget in this range is comfortable for a project of moderate scope. I'd recommend **outsource-last** with active monitoring — same mode as the lower-budget tier, but I'll prompt you when spend crosses 50% of your threshold so you can decide whether to raise the budget or change pace. (The 50% prompt fires against whichever scope you picked — cumulative if `project-lifetime`, current-month if `monthly`.)

#### $100+ — ample-budget mode

Tell the human:

> A budget at this level supports **outsource-first** — synchronous per-call API providers, full automation, no daemon to maintain. I'll monitor spend periodically rather than per-call (the threshold is far enough away that per-call alarming would be noise).

### What outsource-first vs. outsource-last actually means

If the human asks (or seems uncertain), explain briefly:

> **Outsource-first** sends each verification call to an API provider (Anthropic / Google / OpenAI) synchronously. You pay per call. Setup is "set your API keys and go." Best when budgets are comfortable and verification volume is moderate.
>
> **Outsource-last** queues verification work to a verifier daemon backed by a subscription CLI (e.g., a Claude Code Max plan running locally as the verifier). Setup is heavier — you have to keep the daemon running — but the marginal cost per verification is essentially zero once you're paying the subscription. Best for tight budgets or high verification volume.

### Confirm and note

Once the human picks a tier (and a sub-option, for $0), confirm the recommendation back to them and tell them you'll write it into `ai_router/budget.yaml` as part of the action checklist (Step 7). **Do not write the file yet.** That happens in Step 8 after the checklist is approved.

---

## Step 6 — Plan alignment dialog

Walk the human through what's done and what's remaining, then propose a session-set decomposition.

For an **existing project** (workspace path):

- "Based on what I canvased and what you told me, here's what I'd organize as remaining work, broken into session sets. We'll tune these together before I commit to anything."
- Propose 2–6 session sets, each with a short name (slug-style: `user-auth`, `checkout-flow`), a 1-sentence purpose, and a rough session count (1–6).
- Show the human the list. Ask which sets they agree with, which need editing, and which they'd skip or rename.

For a **greenfield project** (State B sub-path 1):

- Run a planning conversation: project goals → scope boundaries → technology choices → key user flows → constraints → known risks.
- Once you have enough material, propose a session-set decomposition the same way as for existing projects.
- The first session set in a greenfield project is usually **`001-foundations`** — repo scaffolding, choose stack, initial dependencies, basic CI.

The human steers throughout. You propose; they approve, edit, or reject. **Don't commit to a decomposition until Step 7's checklist is approved.**

---

## Step 7 — Build the action checklist

This is the gate. Aggregate every concrete write / config update / scaffolding action you propose to do, in order, into a numbered list. For non-trivial files (`docs/planning/project-plan.md`, each session set's `spec.md`), show inline drafts so the human can read what you're about to write.

### Example

```
Recommended actions for your project:

1. Write docs/planning/project-plan.md (~ 40 lines, draft below)
   <inline draft>

2. Save outsourcing budget ($25) to ai_router/budget.yaml (full content below)
   threshold_usd: 25
   threshold_scope: "project-lifetime"
   mode: "middle-tier"
   recommended_outsource_mode: "last"
   verification_method: "api"
   set_at: "2026-05-04T15:30:00-04:00"
   set_by: "adoption-bootstrap-flow"
   notes: |
     Mid-sized side project; outsource-last to keep verification cost flat.

3. Update ai_router/router-config.yaml outsource_mode = "last"

4. Scaffold docs/session-sets/ folder structure (empty, ready for sets below)

5. Create session-set 001-user-auth (3 sessions, spec.md draft below)
   <inline draft>

6. Create session-set 002-product-catalog (4 sessions, spec.md draft below)
   <inline draft>

7. Create session-set 003-checkout-flow (3 sessions, spec.md draft below)
   <inline draft>

8. Add CLAUDE.md (project root, copied from canonical Dabbler repo with
   project-specific tweaks; full content below)
   <inline content>

Approve all? Or tell me which items to skip / edit / reorder.
```

### Acceptable responses

- **"go"** or **"approve all"** — execute the full list.
- **"go but skip 4"** — execute everything except the named item.
- **"edit 2: budget should be $50"** — make the edit; do NOT execute yet; show the updated checklist; ask again.
- **"reorder 5 before 4"** — apply the reorder; do NOT execute yet; show the updated checklist; ask again.
- **Anything else** — clarify with the human; do NOT execute.

**Do not execute any item until the human has explicitly approved.** "Looks good" means yes; silence means no; ambiguity means ask.

---

## Step 8 — Execute the approved checklist

Once approved, walk through items in order. Write files. Update configs. Scaffold folders. Report completion of each item briefly so the human sees progress:

```
✓ 1. Wrote docs/planning/project-plan.md (42 lines)
✓ 2. Saved ai_router/budget.yaml ($25 threshold, limited-budget mode)
✓ 3. Updated ai_router/router-config.yaml (outsource_mode = "last")
...
```

The human can interrupt at any point. If they do, stop, ask what they want to change, and replan from where you stopped.

---

## Step 9 — Closing pointers

Once execution completes, give the human these pointers:

### Budget monitoring

- **Where the threshold lives:** `ai_router/budget.yaml`. Edit the `threshold_usd` field to update.
- **Check actual spend:** `python -m ai_router.report --since YYYY-MM-DD` for a governance summary, or `python -m ai_router.cost_report` for per-session detail. Both read `ai_router/router-metrics.jsonl`.
- **Note:** automated pre-call enforcement (warnings, block-on-exceed) is a planned follow-up. For now, monitoring is the human's responsibility — `ai_router/budget.yaml` is the contract; the report tools are the measurement.

### General cost monitoring

- `python -m ai_router.report` — governance-oriented markdown summary; group by task type / model / verifier / session set.
- **`Dabbler: Show cost dashboard`** — VS Code extension command (if installed) showing live spend.
- **Per-session cost report** — automatic at session close; appears in your chat output.

### More info

- **Repo-root `README.md`** — project overview and quick start.
- **`docs/ai-led-session-workflow.md`** — the canonical workflow you're now operating under. The new "Cost-budgeted verification modes" section explains the three-tier mapping you just used and the operator-authorized exception to Rule 2 for the $0 + skipped path.
- **Command palette** — type "Dabbler" to see all available extension commands.
- **Session Set Explorer** — activity-bar view in VS Code (if the extension is installed) showing all session sets and their states.

### Starting the next session

Once your session sets exist, the human starts their first session by typing into the AI chat:

> Start the next session.

The AI orchestrator (you, or a different one next time) reads the active session set, follows `docs/ai-led-session-workflow.md`, and runs Session 1.

If the human chose **zero-budget mode**, remind them how verification will happen:

- **Option (a) — manual via different engine:** they open a *different* AI assistant, hand it the verification template + the work, and copy the verdict back. They do this at the end of every session. Their `ai_router/budget.yaml` records `verification_method: "manual-via-other-engine"`.
- **Option (b) — skipped:** every session's `change-log.md` records that verification was explicitly skipped. Their `ai_router/budget.yaml` records `verification_method: "skipped"`.

---

## Reference: `ai_router/budget.yaml` schema

This is the file you'll write per-project in Step 7 / 8. Embed it in the action checklist with the human's chosen values:

```yaml
# Project outsourcing budget — set during adoption bootstrap.
# Used by ai_router for spend reporting and (in a future set) automated
# threshold monitoring / pre-call warnings.

threshold_usd: 25                   # 0 (zero) | <20 (limited) | 20-99 (middle) | 100+ (ample)
threshold_scope: "project-lifetime" # project-lifetime | monthly
mode: "middle-tier"                 # zero-budget | limited-budget | middle-tier | ample-budget
recommended_outsource_mode: "last"  # first | last | none  (matches ai_router/router-config.yaml)
verification_method: "api"          # api | manual-via-other-engine | skipped
set_at: "2026-05-04T15:30:00-04:00"
set_by: "adoption-bootstrap-flow"
notes: |
  Optional human-supplied notes on rationale or constraints.
```

### Field reference

- **`threshold_usd`** — the dollar threshold the human set. Used by report tools and (future) automated enforcement.
- **`threshold_scope`** — `project-lifetime` (cumulative spend over the life of the project) or `monthly` (recurring). Default is `project-lifetime` for first-time setups; the human can switch to `monthly` if they prefer recurring tracking. Future automated enforcement reads this to decide whether to compare cumulative or windowed spend against `threshold_usd`.
- **`mode`** — one of `zero-budget`, `limited-budget`, `middle-tier`, `ample-budget`. Derived from `threshold_usd` (see Step 5 boundaries).
- **`recommended_outsource_mode`** — `first` | `last` | `none`. Recommended for the project; the human can override in `ai_router/router-config.yaml`'s `outsource_mode` field if they want to deviate. Short-form values match the `outsource_mode` field in `router-config.yaml` exactly. (Prose elsewhere may say "outsource-first" / "outsource-last" — same thing as `first` / `last`.)
- **`verification_method`** — `api` (normal API verification), `manual-via-other-engine` (zero-budget option a), or `skipped` (zero-budget option b).
- **`set_at`** — ISO-8601 timestamp of when the budget was set.
- **`set_by`** — who/what set it; `"adoption-bootstrap-flow"` if set during bootstrap.
- **`notes`** — free-form text, optional. The human can edit this anytime.

---

## If something feels off

If during the dialog the human says something that doesn't fit any branch above (e.g., "I want to do something completely different and skip the session-set part entirely"), don't try to force-fit. Tell them:

> What you're describing isn't quite what this bootstrap doc was built for. I'd suggest one of two things: (1) tell me more about what you're trying to do and I'll adjust within reason, or (2) skip this bootstrap and just use the workflow doc directly — it's at `docs/ai-led-session-workflow.md`.

The bootstrap is opinionated about session sets + budget-driven verification. If the human has a fundamentally different shape in mind, surfacing that early is better than trying to retrofit.

---

## End of bootstrap

Once Step 9 is delivered, your job as bootstrap-orchestrator is done. The human has a `project-plan.md`, a budget, an outsource mode, scaffolded session sets, and the agent instruction file(s). They're ready to start running sessions under the canonical workflow.

Wish them well.

```

---

## Updated `docs/ai-led-session-workflow.md` "Cost-budgeted verification modes" section (round 2)

```markdown
## Cost-budgeted verification modes

Every project that adopts this workflow declares an outsourcing/API
**budget threshold** during the adoption-bootstrap flow (see
`docs/adoption-bootstrap.md`). The threshold is recorded in
`ai_router/budget.yaml` and governs which verification path the
project uses. Three tiers, with two sub-options under the zero tier:

| Tier (`mode` value) | Threshold (`threshold_usd`) | Recommended `outsource_mode` | `verification_method` |
|---|---|---|---|
| **`zero-budget`** | `0` | `none` | (a) **`manual-via-other-engine`** OR (b) **`skipped`** — operator picks |
| **`limited-budget`** | `< 20` | `last` (outsource-last) | `api` (verifier daemon backed by subscription CLI) |
| **`middle-tier`** | `20–99` | `last` (outsource-last) | `api` + 50%-of-threshold tier-upgrade prompt |
| **`ample-budget`** | `100+` | `first` (outsource-first) | `api` (synchronous per-call providers) |

The threshold and the chosen verification method are persisted in
`ai_router/budget.yaml` (see schema in `docs/adoption-bootstrap.md`).
The bootstrap flow writes this file once at adoption time; the
operator can edit it anytime to change tier or method.

### Interaction with Rule 2

Rule 2 in the [Rules section](#rules-apply-to-all-orchestrators)
below — **"Never skip verification"** — is the default for every
session and remains the default for every project that operates with
a non-zero budget (limited / middle / ample tiers).

The zero-budget tier introduces an **operator-authorized exception**
to Rule 2 via two paths, neither of which weakens the rule itself:

- **`verification_method: "manual-via-other-engine"`** — Rule 2 is
  satisfied by manual cross-provider review. The operator (human)
  performs the verification by handing the work to a different AI
  assistant + the verification template, then copying the verdict
  back. The template's stable public URL is
  `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/ai_router/prompt-templates/verification.md`
  (also reachable locally at `ai_router/prompt-templates/verification.md`
  in this canonical repo). For freshly-bootstrapped consumer projects
  that don't yet have `ai_router/` checked in, the URL is the
  authoritative source. The session orchestrator records this method
  in the session's `change-log.md`.
- **`verification_method: "skipped"`** — Rule 2 is explicitly
  bypassed. Every session's `change-log.md` records the skip with a
  reference to the project's `ai_router/budget.yaml`. This is the
  honest audit trail of "verification was opted out at the project
  level for explicit budget reasons." Sessions running under this
  setting do **not** route a `session-verification` task and do
  **not** invoke the cross-provider verifier.

Both paths are valid only when `ai_router/budget.yaml` declares the
zero-budget tier. A session running on a non-zero-budget project
that tries to skip verification or substitute manual review without
a corresponding `budget.yaml` declaration violates Rule 2.

### What this means at session execution time

The orchestrator at Step 6 (end-of-session verification) reads
`ai_router/budget.yaml` if present:

- **`verification_method: "api"`** — Step 6 runs as documented
  (`route(task_type="session-verification")` against a different
  provider, save raw output, handle issues).
- **`verification_method: "manual-via-other-engine"`** — Step 6
  pauses and prompts the human to perform the manual review. The
  orchestrator hands the human a copy of the work + the
  verification template; the human runs the review elsewhere; the
  human pastes the verdict back; the orchestrator continues.
- **`verification_method: "skipped"`** — Step 6 is explicitly
  bypassed. The session's `change-log.md` records the skip with a
  pointer to `ai_router/budget.yaml`.

If `ai_router/budget.yaml` is absent (project has not yet run the
adoption bootstrap), the orchestrator treats the project as if
`verification_method: "api"` were set — Rule 2's default behavior.

### Spend monitoring

Set 013 ships the file format and the dialog that produces it. It
does **not** ship automated pre-call enforcement (warnings,
block-on-exceed). Operators monitor spend manually with:

- `python -m ai_router.report --since YYYY-MM-DD` — governance summary.
- `python -m ai_router.cost_report` — per-session detail.
- The `Dabbler: Show cost dashboard` extension command — live spend
  view.

Automated threshold-aware pre-call warnings + block-on-exceed
enforcement are planned for a follow-up set.
```

---

## Verification request (round 2)

Re-evaluate against the round 1 issues:

1. **Critical (clone gate).** Does the round-2 fix cleanly carve the
   clone out as a separate one-shot-approved action, distinct from
   the main checklist? Is the preamble's exception language strong
   enough that a different-provider engine wouldn't conflate the
   clone with the main checklist or accidentally clone without
   approval?
2. **Major (enum consistency).** Are all four tier names now
   coherent across Step 5 dialog, the schema, the schema example,
   and the workflow-doc table? Is there any remaining drift between
   prose tokens (`outsource-first`, `outsource-last`) and field
   tokens (`first`, `last`)? Is `middle-tier` a defensible enum
   value name, or should it follow the `*-budget` suffix pattern?
3. **Major (arbitrary-path fallback).** Is the retargeting check
   strong enough? Are there assistants that would still try to
   canvas an arbitrary path despite the instructions?
4. **Major (threshold scope).** Is `threshold_scope` a sufficient
   field for the future enforcement set? Should the default be
   spelled out more explicitly (e.g., "if absent, treat as
   project-lifetime")?
5. **Major (template URL).** Is the URL reachable as written? Is the
   doc's offer to write a local `docs/manual-verification.md` clear
   enough?
6. **Minor (edge case guards).** Are the new Step 2 and Step 3 guards
   complete? Anything else that should be guarded?

7. **Anything new.** Any regressions or new issues introduced by the
   round-2 changes?

Respond with the structured JSON from
`ai_router/prompt-templates/verification.md`.
