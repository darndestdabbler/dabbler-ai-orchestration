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
- **If (2):** ask for the absolute path. Then check whether your tooling can read files at arbitrary paths (some assistants only operate within the current VS Code workspace). Two outcomes:
  - **Workspace-scoped tools:** tell the human *"My tools only operate within the active workspace. Please open `<path>` as a folder in VS Code (File → Open Folder), then say 'continue' here and I'll resume from Step 2 against that workspace."* **Wait for the workspace to actually be reopened before continuing — don't try to proceed with stale or guessed file content.** Once they've reopened, the rest of the bootstrap runs in normal workspace mode.
  - **Arbitrary-path-capable tools:** confirm in the chat: *"Your target path is `<absolute-path>`. I'll use that absolute path for every file operation through the rest of the bootstrap (read, list, write, run command). I won't touch anything outside it."* **The absolute-path discipline applies through Step 8** — every read, glob, command, and write must use the explicit absolute path, not relative paths or implicit working-directory assumptions. If at any point you find yourself uncertain whether your write tools will respect the target path, stop and ask the human to reopen the workspace at the target instead.

  In either case, do **not** silently retarget tools to a path the human didn't explicitly ask you to canvas.

- **If (3):** ask for the URL **and** for an **absolute** destination path where the clone should live (e.g., `C:\Users\<name>\projects\<repo-name>` on Windows, `/home/<name>/projects/<repo-name>` on Linux/macOS). Don't accept a relative or "sensibly-named" answer — the working directory of your tool environment is opaque, and a relative path can land in an unintended location. Resolve the absolute clone target fully before asking for approval. Then echo it back in the approval prompt:

  > **I'd like to run `git clone <url> <absolute-destination>` so I can canvas the project. The clone target is the fully-resolved absolute path `<echo-here>`. This is a discrete preparatory action — it doesn't write project files, just brings the repo onto your disk at that exact location. After cloning I'll go to Step 2 and proceed via the normal dialog → checklist → execute flow. Approve the clone?**

  Wait for explicit approval (`yes` / `clone it` / etc.). On approval, run the clone with the absolute destination. **Shell-safe execution:** if either the URL or the destination path contains spaces or shell-meta characters (`( ) & ; $ ' "` etc.), pass them as separate arguments rather than splicing into a single shell string — most tool palettes provide either argument-array invocation or shell-quoted strings; use whichever your tooling supports cleanly. Avoid building a single command string via naive interpolation. After the clone completes, follow the same workspace-open vs. arbitrary-path-tools logic as sub-path (2) above.

---

## Step 2 — Fast-path check

Before diving into deep dialog, look for signals that the human already has a plan ready:

- Does `docs/planning/project-plan.md` exist?
- Did the human say "I have a plan ready" or similar in their initial message?
- Is the project state otherwise advanced enough that planning is largely done?

If any of these, ask:

> **You appear to have a plan ready. Do you want to skip the discovery dialog and go straight to the action checklist? I'd build session sets directly from your plan and set up your budget.**

If the human says yes, skip Steps 3–6 and go directly to Step 7 with a minimal checklist. If they say no, or you didn't detect any plan signals, proceed to Step 3.

**Quick guard before fast-pathing:** if a `project-plan.md` exists but looks partial or stale (older than the most recent code changes, missing key sections, or referencing files that no longer exist), don't silently fast-path off it. Ask the human: *"I found a plan at `<path>` — is it current and complete, or should we treat it as a starting point and adjust before building session sets?"*

---

## Step 3 — Confirm understanding (workspace or explicit target path)

**Tooling note:** if you arrived here from State B sub-path (2) or (3), the rules from Step 1 about workspace reopening or absolute-path discipline still apply — they aren't just for canvas. If your tools are workspace-scoped and the human hasn't reopened VS Code at the target folder, **stop and ask them to** before proceeding. If your tools handle arbitrary paths, you must use the same absolute path throughout — for reads, globs, commands, and (later in Step 8) writes. Don't try to canvas via guesswork or stale snapshots, and don't switch implicit working directories mid-flow.

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

The human is about to make decisions about adoption tier, budget, and verification modes. They need to know what those decisions are *for*. Give a short, plain-language explanation. Two paragraphs max:

> **Quick context on how Dabbler organizes AI-led work.** Dabbler breaks a project into **session sets** — planned bodies of work with 1–6 sessions each. A session set is something like "user authentication" or "checkout flow" — focused enough that one human review pass at the end makes sense. Each session is one AI conversation with you (or a different orchestrator next time), ending in a commit and (optionally) a verification check.
>
> **Why this shape helps.** It gives every change a small, reviewable scope. The Session Set Explorer in VS Code shows the whole project's work-shape at a glance. On top of that organizational layer, the framework can *optionally* run **cross-provider verification** at the end of each session — the work goes to a *different* AI provider (Anthropic, Google, OpenAI) for review, catching the bias-induced misses each provider tends to have. Whether to use the verification layer is the **adoption-tier** decision in the next step. The full canonical workflow lives at `docs/ai-led-session-workflow.md` — you'll see it referenced throughout.

Don't overdo this. The human can read the canonical workflow doc when they want depth. Your job here is to give them enough context to make the next two decisions intelligently — adoption tier (Step 4.5) and (if applicable) budget (Step 5).

---

## Step 4.5 — Adoption tier

The tier changes **exactly one thing**: whether this project's AI router
makes external, metered LLM API calls. **Lightweight is router-off, not
Python-off** — both tiers install Python and `dabbler-ai-router`, run the
same `start_session` / `close_session` lifecycle, write the same
`session-state.json`, and pass the same close-out gate. The single source of
truth for this model is
[`docs/concepts/tier-model.md`](concepts/tier-model.md) — read it if any of
what follows surprises you, and never paraphrase the model elsewhere.

Ask the human:

> **Which adoption tier fits this project?**
>
> **(L) Lightweight — zero metered API calls.** Same full Python lifecycle as
> Full (a `.venv`, `pip install dabbler-ai-router`, `start_session` /
> `close_session`, the same state file and close-out gate, all three engine
> files, the Session Set Explorer). The **only** difference: no AI router
> calls, so no per-call API spend and no router config. Verification is
> handled **per set** — either by pasting a copyable review prompt into a
> *different* AI assistant and recording the verdict, or via a dedicated
> different-engine verification session, or opted out for explicit reasons.
> **Best for:** projects where you'd rather verify out-of-band (or not at all)
> than pay per call. You can move a set to Full later by flipping `tier:` and
> adding router config.
>
> **(F) Full — automatic cross-provider verification.** Everything in
> Lightweight, plus the AI router on: cost-minded routing of reasoning tasks,
> automatic cross-provider verification at the end of each session, metrics,
> and cost reports. **Best for:** projects where you want each session
> automatically verified by a metered call to a different provider.

Wait for a clear pick — `L` / `lightweight` or `F` / `full`. Branch from here:

- **If (L):** **Skip Step 5 entirely.** Lightweight makes no metered calls, so
  there is no verification budget to set and no router config to write. Go
  directly to Step 6. (Everything else in the scaffold — `.venv`, package,
  engine files, `start-here.md`, templated spec — is identical to Full.)
- **If (F):** Continue to Step 5 (budget-threshold dialog). The budget tiers
  ($0 / limited / middle / ample) only apply within Full adoption.

### Coexistence with existing session protocols

If the project already has its own session protocol — BATON files, a session ledger inside `CLAUDE.md`, per-session journals, or anything similar — **explicitly ask the human how the new session-set tree should relate to it**:

> I see you already have a session protocol (briefly describe what you found: BATON files, ledger in CLAUDE.md, etc.). Which of these fits how you want the new session-sets tree to coexist with it?
>
> 1. **Replace** — the session-sets tree becomes the new authoritative organization; the old protocol is archived or retired.
> 2. **Parallel** — both coexist. The old protocol stays authoritative for per-session records (one BATON per session, etc.); the session-sets tree adds a thematic grouping layer on top.
> 3. **Index** — the session-sets tree is purely a set of pointers back into the existing protocol's files (each `spec.md` references the relevant BATONs); the old protocol stays authoritative for everything.

Pick one with the human. The bootstrap doc names the three modes; the choice shapes Step 6's organization-design dialog and Step 7's checklist (e.g., a *parallel* or *index* setup writes far less than a *replace* setup).

### Confirm and note

Once the human picks a tier (and a coexistence mode if applicable), confirm the choice back to them. Note it for the action checklist (Step 7) so it's visible alongside everything else they're approving.

---

## Step 5 — Budget-threshold dialog

> **Skip this step entirely if the human picked Lightweight (L) in Step 4.5.** The budget threshold is a Full-tier-only concept — lightweight projects have nothing to budget because nothing in the router is making metered calls. Go straight to Step 6.



Ask the human:

> **Cross-provider verification calls typically cost $0.05–$0.80 each**, depending on session size and model routing. A 3-session set usually runs **$0.15–$2.50**; a 6-session set **$0.30–$5.00**. What's the most you'd want to spend on verification for this project? (Enter $0 if you want to use manual review or skip verification entirely.)

Then ask about scope:

> **Is that a project-lifetime cap or a monthly recurring cap?** Project-lifetime is the default and simplest — total cumulative spend over the project's life. Monthly is for projects you expect to keep running indefinitely; the threshold resets each month. Pick whichever matches how you think about budget.

Wait for their answers (a dollar amount or zero; plus `project-lifetime` or `monthly`). The scope answer is recorded in `ai_router/budget.yaml`'s `threshold_scope` field.

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

#### Non-zero budget

Tell the human:

> Got it — I'll use synchronous per-call API providers for verification and cap cumulative verification spend at **$[their amount]** (`verification_nte_usd`). At each session stop I'll report running spend against this ceiling. If the ceiling is reached mid-session, I'll switch to manual cross-provider review for that session rather than failing.

### Confirm and note

Once the human picks a tier (and a sub-option, for $0), confirm the recommendation back to them and tell them you'll write it into `ai_router/budget.yaml` as part of the action checklist (Step 7). **Do not write the file yet.** That happens in Step 8 after the checklist is approved.

---

## Step 6 — Plan alignment dialog

Walk the human through what's done and what's remaining, then propose a session-set decomposition. **Reminder for lightweight-tier projects:** the action checklist at Step 7 scaffolds the *same* uniform setup as Full — a `.venv`, `pip install dabbler-ai-router`, all three engine files, `docs/dabbler/start-here.md`, and a templated `spec.md` per chosen set — and differs from Full in only one way: **it omits the router config (`router-config.yaml` / `budget.yaml`)** and sets `tier: lightweight` in each spec. Draft the specs with `tier: lightweight` and `verificationMode: out-of-band-or-none` (the default); do **not** strip the Python lifecycle or omit the engine files — Lightweight uses them too.

### How to derive a decomposition

A naïve "propose 2–6 session sets" prompts gives shallow results. The human almost always benefits from seeing **multiple visibly different cuts** of their work, not slight variants on one cut. Use the abstract pattern catalog below as a thinking tool: which cuts genuinely fit the evidence you canvased, and which are forced? Then propose **2–4 candidate organizations** to the human, each cross-cut by a different pattern, each with a one-line tradeoff, and let them pick (or hybridize) before you draft any spec content.

### How to cut the work into session sets

Three common organizations that work well in practice:

- **By deliverable.** One session set per shippable piece (a UI form, an API
  endpoint group, a data pipeline stage). Natural when work flows in clear
  output units. Example: `001-user-auth`, `002-dashboard`, `003-export`.
- **By risk/dependency layer.** Foundational work first; dependent work after.
  Example: `001-schema-foundations`, `002-etl-pipeline`, `003-reporting-layer`.
- **By stated objective.** Mirror the project plan's goals. Example:
  `001-login-flow`, `002-admin-roles`, `003-audit-log`.

Pick the cut that matches how the team already thinks about the work. Then
propose 2–4 concrete candidates — each with a slug, a one-sentence purpose,
and a rough session count — and let the human pick before drafting specs.

> **Going deeper:** for projects with complex organizational trade-offs, an
> abstract pattern catalog (input artifacts, cross-cutting themes, stakeholder
> review boundaries, etc.) can surface non-obvious cuts. Ask the human if they
> want to explore those alternatives after seeing the initial candidates.

### Propose 2–4 candidates, ask the human to pick

Frame the proposal something like:

> Based on the canvas, I see a few different ways to cut this project into session sets. Here are the candidates I think genuinely fit — each cut by a different organizing pattern. Tell me which one fits how you actually think about this work, or if you want a hybrid.

Then list the candidates. For each, give:

- **One-line label** naming the pattern (e.g., "Cut by Access-feature coverage", "Cut by stated objectives in `project-plan.md`").
- **The session sets** it produces, each with slug, 1-sentence purpose, and rough session count (1–6).
- **The tradeoff** in one line — what this cut emphasizes, what it loses.

Watch out for these failure modes:

- **Over-decomposing.** A 16-session "set" violates the 1–6 guideline; a 14-set proposal for a small project is overkill. If a single pattern produces too many sets, either pick a coarser-grained version of the same pattern or explicitly note that the project may not need that much structure yet.
- **Forced cuts.** If a pattern doesn't really fit the project's evidence, don't propose it just to round out the candidate list. Two strong cuts beat four weak ones.
- **Slight variants of one cut.** "Cut by feature A vs. cut by feature A but split set 003" is one cut, not two. Each candidate must be visibly *different* — different boundaries, different size, different review rhythm.

### Greenfield projects (State B sub-path 1)

For a fully greenfield project (no existing code or canvas), run a planning conversation first: project goals → scope boundaries → technology choices → key user flows → constraints → known risks. Once you have enough material, the **stated objectives** and **risk/dependency layers** patterns above are usually the strongest fits; propose 2–4 candidates within those. The first session set in a greenfield project is usually `001-foundations` — repo scaffolding, choose stack, initial dependencies, basic CI.

### Existing projects with their own session protocol

If the human chose **Parallel** or **Index** in Step 4.5's coexistence dialog, your candidate organizations should respect what already exists. **Inferred organizational patterns** is usually the strongest starting cut — propose the decomposition that mirrors how the human already thinks about this work (per their existing ledger, BATON sequence, etc.) and offer one or two alternatives that re-cut by a different pattern (e.g., **Cross-cutting themes** or **Stated objectives**) for comparison.

The human steers throughout. You propose; they approve, edit, or reject. **Don't draft any spec content until they've picked a candidate (or hybrid).** And don't commit to writing files until Step 7's checklist is approved.

---

## Step 7 — Build the action checklist

This is the gate. Aggregate every concrete write / config update / scaffolding action you propose to do, in order, into a numbered list. For non-trivial files (`docs/planning/project-plan.md`, each session set's `spec.md`), show inline drafts so the human can read what you're about to write.

> **Lightweight-tier checklists differ from Full by exactly one omission.** If
> the human picked Lightweight (L) in Step 4.5, your checklist is the **same
> uniform scaffold** as Full — create the `.venv`, `pip install
> dabbler-ai-router`, write all three engine files (`CLAUDE.md` + `AGENTS.md`
> + `GEMINI.md`), write `docs/dabbler/start-here.md`, and write a templated
> `spec.md` (+ `session-state.json`) per chosen set — **minus** the router
> config: omit `ai_router/router-config.yaml` and `ai_router/budget.yaml`, and
> set `tier: lightweight` in each spec. **Do not** drop the pip-install, the
> `.venv`, or the engine files — those are not router config; they are the
> shared lifecycle both tiers use. **The example below is a Full-tier
> checklist;** the only lines a Lightweight checklist removes are the
> `budget.yaml` / `router-config.yaml` writes (items 2 and any router-tuning
> step). See [`docs/concepts/tier-model.md`](concepts/tier-model.md) and the
> canonical templates at
> [`docs/templates/consumer-bootstrap/`](templates/consumer-bootstrap/).

### Example

```
Recommended actions for your project (Full tier):

1. Write docs/planning/project-plan.md (~ 40 lines, draft below)
   <inline draft>

2. Create .venv and run: .venv/Scripts/pip install dabbler-ai-router
   (BOTH tiers — Lightweight needs the package too; it just runs --no-router)

3. [FULL ONLY] Save verification budget ($25) to ai_router/budget.yaml
   threshold_usd: 25
   threshold_scope: "project-lifetime"
   mode: "middle-tier"
   verification_method: "api"
   set_at: "2026-05-04T15:30:00-04:00"
   set_by: "adoption-bootstrap-flow"
   notes: |
     Mid-sized side project.
   (Lightweight checklists OMIT this item and any router-config.yaml write.)

4. Write all three engine files at the project root — CLAUDE.md, AGENTS.md,
   GEMINI.md — from the canonical template bundle (shared body + engine tail).
   (BOTH tiers — the next session's orchestrator may be a different engine.)

5. Write docs/dabbler/start-here.md (the generated cold-start operative doc)
   (BOTH tiers.)

6. Create session-set 001-user-auth (3 sessions) — templated spec.md
   (tier: full | lightweight) + session-state.json. Drafts below.
   <inline draft>

7. Create session-set 002-product-catalog (4 sessions) — same shape.
   <inline draft>

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

**Target-path reminder:** if you've been operating against an arbitrary path (State B sub-paths (2) or (3) with arbitrary-path-capable tools), every write in this step must use the absolute target path established in Step 1. If your write tools are workspace-scoped and the workspace was never reopened at the target, **stop here** — do not try to write outside the active workspace. Ask the human to reopen VS Code at the target folder and resume.

Once approved, walk through items in order. Write files. Update configs. Scaffold folders. Report completion of each item briefly so the human sees progress:

```
✓ 1. Wrote docs/planning/project-plan.md (42 lines)
✓ 2. Created .venv and installed dabbler-ai-router
✓ 3. Saved ai_router/budget.yaml ($25 threshold, middle-tier mode) [Full only]
✓ 4. Wrote CLAUDE.md, AGENTS.md, GEMINI.md
✓ 5. Wrote docs/dabbler/start-here.md
...
```

The human can interrupt at any point. If they do, stop, ask what they want to change, and replan from where you stopped.

---

## Step 9 — Closing pointers

Once execution completes, give the human these pointers. **Lightweight-tier projects skip the Budget monitoring and General cost monitoring sections** (no router → no metrics → no spend to report); jump straight to "More info" and "Starting the next session", and use the Lightweight closing note at the bottom in place of the zero-budget reminder.

### Budget monitoring

- **Where the threshold lives:** `ai_router/budget.yaml`. Edit the `threshold_usd` field to update.
- **Check actual spend:** `python -m ai_router.report --since YYYY-MM-DD` for a governance summary, or `python -m ai_router.cost_report` for per-session detail. Both read `ai_router/router-metrics.jsonl`.
- **Note:** automated pre-call enforcement (warnings, block-on-exceed) is a planned follow-up. For now, monitoring is the human's responsibility — `ai_router/budget.yaml` is the contract; the report tools are the measurement.

### General cost monitoring

- `python -m ai_router.report` — governance-oriented markdown summary; group by task type / model / verifier / session set.
- **`Dabbler: Show cost dashboard`** — VS Code extension command (if installed) showing live spend.
- **Per-session cost report** — automatic at session close; appears in your chat output.

### Configuring the AI router visually (Full tier)

- **`Dabbler: Open Dabbler Config Editor`** — VS Code extension command that opens a visual editor for `router-config.yaml`, `budget.yaml`, and `local-overrides.yaml`. Use it to tune routing mode, verification settings, provider API-key env-var names, and budget threshold without editing YAML directly. This bootstrap writes your initial config; the Config Editor is the recommended surface for ongoing tuning.
- **`local-overrides.yaml`** lives in `ai_router/` but is gitignored — use it for any per-machine settings (Pushover keys, personal API-key env-var names) you don't want committed.

### More info

- **Repo-root `README.md`** — project overview and quick start.
- **`docs/ai-led-session-workflow.md`** — the canonical workflow you're now operating under. The "Cost-budgeted verification modes" section explains the two-tier (zero vs. non-zero) budget model and the operator-authorized exception to Rule 2 for the $0 + skipped path.
- **Command palette** — type "Dabbler" to see all available extension commands.
- **Session Set Explorer** — activity-bar view in VS Code (if the extension is installed) showing all session sets and their states.

### Starting the next session

Once your session sets exist, the human starts their first session by typing into the AI chat:

> Start the next session.

The AI orchestrator (you, or a different one next time) reads the active session set, follows `docs/ai-led-session-workflow.md`, and runs Session 1.

If the human chose **zero-budget mode**, remind them how verification will happen:

- **Option (a) — manual via different engine:** they open a *different* AI assistant, hand it the verification template + the work, and copy the verdict back. They do this at the end of every session. Their `ai_router/budget.yaml` records `verification_method: "manual-via-other-engine"`.
- **Option (b) — skipped:** every session's `change-log.md` records that verification was explicitly skipped. Their `ai_router/budget.yaml` records `verification_method: "skipped"`.

If the human chose **lightweight tier (L)** in Step 4.5, give them this closing note instead. (The tier model: **router-off, not Python-off** — [`docs/concepts/tier-model.md`](concepts/tier-model.md).)

- **Same lifecycle as Full — the router is just off.** You installed `dabbler-ai-router` into a `.venv` like any Full project, so `start_session` / `close_session` maintain `session-state.json` and run the close-out gate for you. The only difference is that `tier: lightweight` in each spec flips `--no-router`: no metered API calls, no budget, no metrics, no automatic verification.
- **Start sessions from `docs/dabbler/start-here.md`.** That generated cold-start doc resolves the active set, registers the session, and walks any engine through to close. Typing **"start the next session"** points your orchestrator there.
- **Verification is per set, your choice (Set 057):**
  - **`out-of-band-or-none` (default)** — paste a copyable review prompt (`dabbler.copySpecReviewPrompt`, `dabbler.copySessionAccomplishmentsPrompt`, `dabbler.copySetAccomplishmentsPrompt`) into a *different* path-aware AI assistant (Claude Code, Codex, Cline, Cursor, or any agent with file-reading tools), then record the verdict in `docs/session-sets/<slug>/external-verification.md` (open or create via `dabbler.openExternalVerificationDoc`) — or opt out for explicit reasons.
  - **`dedicated-sessions`** — run a structured different-engine verification session (and optional remediation) with a content-aware close-out gate. See [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md) → Lightweight verification.
- **The Session Set Explorer is your dashboard.** Sets render from `docs/session-sets/<set>/spec.md` and graceful-degrade if optional artifacts are missing.
- **Repo-specific review criteria are optional.** If you want to teach reviewers what THIS repo cares about, create one or more of `docs/review-criteria/spec.md`, `docs/review-criteria/session.md`, or `docs/review-criteria/set.md`. Their content gets embedded into the matching copyable prompt's "Operator review criteria" slot. Missing files fall back to the extension's default English instructions. Templates ship in `dabbler-ai-orchestration/docs/review-criteria/`.
- **You can upgrade a set to Full later.** Flip `tier:` in its `spec.md` and add router config (re-running this bootstrap and picking `F` does this for you). Existing session sets keep working under their `tier:` field; nothing else has to change.

---

## Reference: canonical schemas

These docs apply to every session set you generate during this
bootstrap. Read them when drafting `spec.md` content (Step 7) and any
state files you write or update during sessions:

- **[`docs/concepts/tier-model.md`](concepts/tier-model.md)** — the single
  source of truth for the Full vs. Lightweight tier model. Read this before
  explaining the tiers to the human; do not paraphrase it.
- **[`docs/templates/consumer-bootstrap/`](templates/consumer-bootstrap/)** —
  the canonical template bundle every artifact you scaffold should match
  (spec, session-state, engine files, `start-here.md`).
- **[`docs/spec-md-schema.md`](spec-md-schema.md)** — the strict surface
  of every `docs/session-sets/<slug>/spec.md`: title, frontmatter
  blockquote, `## Session Set Configuration` yaml block, `## Sessions`
  parent, and per-session `### Session K of N: <title>` headings.
  Lightweight-tier specs follow the same shape as Full-tier; only the
  yaml block contents differ.
- **[`docs/session-state-schema.md`](session-state-schema.md)** — the
  canonical field set for `session-state.json`: `schemaVersion`,
  `status` (exactly one of `"not-started" | "in-progress" | "complete"
  | "cancelled"` — `"completed"` and `"done"` are read-time aliases,
  never written), `lifecycleState`, the optional `completedSessions`
  array (recommended on Lightweight tier), and tier-specific
  expectations. Drift causes silent display bugs in the Session Set
  Explorer.

If you write a hand-maintained `session-state.json` on a Lightweight
project — even one — include `completedSessions: [1, 2, ...]` so the
extension doesn't fall back to the `currentSession − 1` estimation.

## Reference: `ai_router/budget.yaml` schema

This is the file you'll write per-project in Step 7 / 8. Embed it in the action checklist with the human's chosen values:

```yaml
# Project verification budget — set during adoption bootstrap.
# Used by ai_router for spend reporting and (in a future set) automated
# threshold monitoring / pre-call warnings.

threshold_usd: 25                   # 0 (zero) | <20 (limited) | 20-99 (middle) | 100+ (ample)
threshold_scope: "project-lifetime" # project-lifetime | monthly
mode: "middle-tier"                 # zero-budget | limited-budget | middle-tier | ample-budget
verification_method: "api"          # api | manual-via-other-engine | skipped
verification_nte_usd: 25            # not-to-exceed ceiling for cumulative API verification spend;
                                    # defaults to threshold_usd if absent
set_at: "2026-05-04T15:30:00-04:00"
set_by: "adoption-bootstrap-flow"
notes: |
  Optional human-supplied notes on rationale or constraints.
```

### Field reference

- **`threshold_usd`** — the dollar threshold the human set. Used by report tools and (future) automated enforcement.
- **`threshold_scope`** — `project-lifetime` (cumulative spend over the life of the project) or `monthly` (recurring). Default is `project-lifetime` for first-time setups; the human can switch to `monthly` if they prefer recurring tracking. Future automated enforcement reads this to decide whether to compare cumulative or windowed spend against `threshold_usd`. **Compatibility rule:** if `threshold_scope` is absent from a `budget.yaml` file (older or hand-authored without it), readers must treat it as `project-lifetime` — that's the safe default and matches the original bootstrap-flow behavior.
- **`mode`** — one of `zero-budget`, `limited-budget`, `middle-tier`, `ample-budget`. Derived from `threshold_usd` using the mapping below (the mode values are stable for schema backward compatibility; all non-zero modes share the same `api` verification path):

  | `threshold_usd` | `mode` value |
  |---|---|
  | `0` | `zero-budget` |
  | `> 0` and `< 20` | `limited-budget` |
  | `20`–`99` | `middle-tier` |
  | `100+` | `ample-budget` |
- **`verification_method`** — `api` (normal API verification), `manual-via-other-engine` (zero-budget option a), or `skipped` (zero-budget option b). **Compatibility rule:** if absent from an older or hand-authored `budget.yaml`, readers must treat it as `api` — matches Rule 2's default behavior in `docs/ai-led-session-workflow.md`.
- **`verification_nte_usd`** — the operator's stated not-to-exceed ceiling for cumulative API verification spend on this project. Defaults to `threshold_usd` if absent. The orchestrator reports running spend against this ceiling at every session stop; if the ceiling is reached mid-session, the orchestrator switches to `manual-via-other-engine` for that session rather than failing.
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

Once Step 9 is delivered, your job as bootstrap-orchestrator is done. The human has a `project-plan.md`, a verification budget, scaffolded session sets, and the agent instruction file(s). They're ready to start running sessions under the canonical workflow.

Wish them well.
