# Cross-provider verification — Set 13 Session 1: Canonical adoption-bootstrap doc + workflow-doc Cost-budgeted-modes section

You are reviewing a session that produced two prose deliverables:

1. **`docs/adoption-bootstrap.md`** (new, 350 lines) — a runtime instruction
   set the AI assistant reads when a human pastes a bootstrap prompt into
   a fresh chat. The doc orients the AI through state detection (Step 1),
   fast-path check (Step 2), workspace canvas + confirmation (Step 3),
   brief education (Step 4), budget-threshold dialog with three tiers +
   $0 sub-options a/b (Step 5), plan-alignment dialog (Step 6), an
   action-checklist gate (Step 7), execution (Step 8), and closing pointers
   (Step 9). Plus a `ai_router/budget.yaml` schema reference.

2. **A new section in `docs/ai-led-session-workflow.md`** (~80 lines added,
   inserted after Overview / before Key Concepts) titled "Cost-budgeted
   verification modes." Documents the three-tier budget mapping and the
   operator-authorized exception to Rule 2 ("Never skip verification") for
   the zero-budget + skipped path. Cross-references back to
   `adoption-bootstrap.md`.

**Goal of the verification:** would *you*, as a different-provider AI
engine receiving these documents at runtime, orient correctly off them?
This is not a prose-aesthetics review. It's a "would this actually work
if you got pasted into a chat" review.

---

## Spec excerpt for Session 1

```markdown
### Session 1 of 2: Canonical doc + workflow-doc "Cost-budgeted verification modes" section

**Goal:** Land work block (a) — the canonical instructions doc at
docs/adoption-bootstrap.md — plus the new "Cost-budgeted verification
modes" section in docs/ai-led-session-workflow.md. End state: the
canonical doc is live at the public URL, the workflow doc explains
the three-tier cost-budgeted modes including the operator-authorized
$0/skipped Rule 2 exception, and Session 2 can wire up the extension
command pointing at the now-live URL.

**Steps (paraphrased):**
1. Read prerequisites (workflow doc structure, sessionGenPrompt schema)
2. Register session start
3. Author ai-assignment.md
4. Author docs/adoption-bootstrap.md — 9-step canonical doc with
   state-detect → fast-path → confirm → educate → budget → plan →
   checklist → execute → close. Internal logic; no user-facing branch
   labels. Engine-agnostic (capability-term tools). Embeds budget.yaml
   schema. "No writes until checklist approved" is load-bearing.
5. Update docs/ai-led-session-workflow.md — new "Cost-budgeted
   verification modes" section. Three tiers ($0 / low / high), Rule 2
   exception for the zero-budget + skipped path, cross-link to
   bootstrap doc.
6. End-of-session cross-provider verification (THIS IS THAT)
7. Commit, push, run close-out

**Configuration:** requiresUAT: false, requiresE2E: false,
outsourceMode: first.
```

---

## Full content of `docs/adoption-bootstrap.md`

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
- **If (2):** ask for the path. Once you have it, tell the human you'll need to read the files there and proceed as if a workspace were open at that path. Go to Step 2.
- **If (3):** ask for the URL. Run `git clone <url>` into a sensibly-named local folder. Once the clone completes, proceed as if a workspace were open at that path. Go to Step 2.

---

## Step 2 — Fast-path check

Before diving into deep dialog, look for signals that the human already has a plan ready:

- Does `docs/planning/project-plan.md` exist?
- Did the human say "I have a plan ready" or similar in their initial message?
- Is the project state otherwise advanced enough that planning is largely done?

If any of these, ask:

> **You appear to have a plan ready. Do you want to skip the discovery dialog and go straight to the action checklist? I'd build session sets directly from your plan, set up your budget, and configure the outsource mode.**

If the human says yes, skip Steps 3–6 and go directly to Step 7 with a minimal checklist. If they say no, or you didn't detect any plan signals, proceed to Step 3.

---

## Step 3 — Confirm understanding (workspace path only)

If you reached this step from State A (workspace open) or State B sub-path (2)/(3), do a quick canvas:

- List top-level files and folders.
- Identify the primary language(s) and framework(s).
- Find key files: `README.md`, `package.json`, `pyproject.toml`, `requirements.txt`, build config, etc.
- Look for existing planning artifacts: `docs/planning/`, `TODO.md`, design docs.
- Look for existing session-set artifacts: `docs/session-sets/`. If they exist, this project has been touched by Dabbler before — note that and ask the human about it.

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

Ask the human:

> **What outsourcing/API budget do you want to set for this project?** This is the dollar amount you're comfortable spending on AI router calls (verification, code review, analysis) over the project's lifetime. We'll save it as a threshold and monitor against it.

Wait for their answer (a dollar number, or zero). Map it to a tier and explain what each tier means.

### Tier mapping

#### $0 — zero-budget mode

Tell the human:

> A $0 budget means no API verification calls. That's a real choice and we can support it, but you have to decide between two paths — both have honest tradeoffs. Tell me which you want:
>
> **(a) Manual verification using a different AI assistant.** After each session's work, you open a *different* coding-assistant chat (if I'm Claude Code, you'd open Gemini Code Assist or a GPT-based tool, or vice versa). You hand it the verification template (`ai_router/prompt-templates/verification.md` from the canonical Dabbler repo) plus the work you just completed, and ask for a `VERIFIED` or `ISSUES_FOUND` verdict. You copy the result back into our chat for the next session's start. This preserves cross-provider verification at a cost of your time, not your money. Multi-step but reliable if you do it consistently.
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

> A budget in this range is comfortable for a project of moderate scope. I'd recommend **outsource-last** with active monitoring — same mode as the lower-budget tier, but I'll prompt you when monthly spend crosses 50% of your threshold so you can decide whether to raise the budget or change pace.

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
   mode: "limited-budget"
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

threshold_usd: 25                  # 0 (zero-budget) | <20 (limited) | 20-99 (middle) | 100+ (ample)
mode: "limited-budget"             # zero-budget | limited-budget | ample-budget
recommended_outsource_mode: "last" # first | last | none
verification_method: "api"         # api | manual-via-other-engine | skipped
set_at: "2026-05-04T15:30:00-04:00"
set_by: "adoption-bootstrap-flow"
notes: |
  Optional human-supplied notes on rationale or constraints.
```

### Field reference

- **`threshold_usd`** — the dollar threshold the human set. Used by report tools and (future) automated enforcement.
- **`mode`** — one of `zero-budget`, `limited-budget`, `ample-budget`. Derived from threshold.
- **`recommended_outsource_mode`** — `first` | `last` | `none`. Recommended for the project; the human can override in `ai_router/router-config.yaml`'s `outsource_mode` if they want to deviate.
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

## Diff for `docs/ai-led-session-workflow.md` (the new section)

```markdown
## Cost-budgeted verification modes

Every project that adopts this workflow declares an outsourcing/API
**budget threshold** during the adoption-bootstrap flow (see
`docs/adoption-bootstrap.md`). The threshold is recorded in
`ai_router/budget.yaml` and governs which verification path the
project uses. Three tiers, with two sub-options under the zero tier:

| Tier | Threshold | Recommended outsource mode | Verification method |
|---|---|---|---|
| **Zero-budget** | `$0` | `none` | (a) **manual-via-other-engine** OR (b) **skipped** — operator picks |
| **Limited-budget** | `<$20` | `outsource-last` | API (verifier daemon backed by subscription CLI) |
| **Middle-tier** | `$20–$99` | `outsource-last` | API + 50%-spend tier-upgrade prompt |
| **Ample-budget** | `$100+` | `outsource-first` | API (synchronous per-call providers) |

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
  assistant + the verification template
  (`ai_router/prompt-templates/verification.md`), then copying the
  verdict back. The session orchestrator records this method in the
  session's `change-log.md`.
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

## Verification request

Respond with structured JSON matching `ai_router/prompt-templates/verification.md`:

```json
{
  "verdict": "VERIFIED" | "ISSUES_FOUND",
  "issues": [
    { "severity": "Critical|Major|Minor|non-blocking",
      "title": "...", "detail": "...",
      "follow_up": "..." }
  ]
}
```

### Specific things to probe

The session is doc-only — no code, no schemas to compile, no tests to
run. The verification is whether these documents would correctly
orient an AI assistant if pasted into a fresh chat. Probe these
specifically:

1. **Runtime simulation: would *you* execute this correctly?**
   Walk through the doc as if a human just sent you a prompt
   pointing here. At Step 1 (state detection), Step 2 (fast-path),
   Step 3 (canvas), Step 4 (education), Step 5 (budget dialog),
   Step 6 (plan alignment), Step 7 (action checklist), Step 8
   (execute), Step 9 (closing pointers) — where do you stumble,
   skip, take a silent action you shouldn't, or fail to ask the
   human something you should? Be specific about the line / Step
   where each issue lies.

2. **Checklist-before-execute gate enforcement.** The bootstrap
   prompt the human pastes (sketched in the spec, will be the
   clipboard string from Session 2's extension command) explicitly
   tells the AI not to write any files until the checklist is
   approved. Is the canonical doc's preamble + Step 7 wording
   strong enough that you would actually wait for batch approval
   rather than starting writes during Step 5 (budget dialog) or
   Step 6 (plan alignment)? Modern AI engines have a strong bias
   toward "make progress visibly"; would this doc resist that bias?

3. **Budget-tier mapping coherence.** The doc has four tier rows
   (zero / limited / middle / ample) — is the boundary logic
   clear? Specifically:
   - $0 → zero-budget. Are options (a) manual-via-other-engine and
     (b) skipped clearly distinguished? Is option (a)'s workflow
     concrete enough that a non-technical user could execute it?
   - Less than ~$20 → limited. Why this boundary? Is it defensible?
   - $20–$99 → middle. The "tier-upgrade prompt at 50% spend"
     mechanic — is it clear what triggers it and what it asks?
   - $100+ → ample. Is "outsource-first with periodic monitoring"
     well-defined enough?

4. **State-detection edge cases.** Step 1 distinguishes
   workspace-open vs. no-workspace. Step 2 fast-paths on
   plan-already-exists. Edge cases:
   - A workspace with a partial `docs/planning/project-plan.md`.
   - A workspace with a `docs/session-sets/` folder (suggesting
     prior Dabbler use) but no `change-log.md` files.
   - A workspace with multiple `project-plan.md` candidates in
     different directories.
   - A workspace open but with zero files (newly opened folder).
   - State B sub-path 2 (existing local elsewhere) — does the
     doc handle "the path has files but isn't a project per se,
     it's the user's whole home directory"?

5. **Workflow-doc "Cost-budgeted verification modes" section
   correctness.** Read the new section in context (after Overview,
   before Key Concepts). Does it correctly document the Rule 2
   exception without weakening Rule 2 in spirit? Is the
   distinction between "Rule 2 is the default for non-zero-budget
   projects" vs. "Rule 2 has an operator-authorized exception for
   zero-budget projects only" clearly drawn? Are the two zero-
   budget paths (manual-via-other-engine, skipped) clearly
   different at session-execution time?

6. **`ai_router/budget.yaml` schema sufficiency.** The schema has
   `threshold_usd`, `mode`, `recommended_outsource_mode`,
   `verification_method`, `set_at`, `set_by`, `notes`. A future
   set will add automated pre-call enforcement that reads this
   file. Is anything missing the future enforcement code would
   want? E.g., currency code (assumed USD)? Time zone handling?
   Per-task-type caps? Project-vs-monthly threshold distinction?

7. **Cross-engine compatibility.** The doc avoids Claude-specific
   tool names (no `WebFetch`, no `Glob`, etc.) and instead uses
   capability terms ("fetch a URL," "list files matching a
   pattern"). Are there any places where capability-term language
   accidentally drifts back to Claude-specific terminology? Are
   the five required capabilities (fetch URL, list files, read
   file, write file, run shell command) actually a complete set
   for the doc's flow, or is something assumed implicitly?

8. **Cross-link integrity.** The bootstrap doc references
   `docs/ai-led-session-workflow.md` (and its new section),
   `ai_router/prompt-templates/verification.md`, `ai_router/budget.yaml`,
   `ai_router/router-config.yaml`, and `ai_router/router-metrics.jsonl`.
   The workflow-doc section references `docs/adoption-bootstrap.md`
   and `ai_router/budget.yaml`. Are the cross-references coherent?
   Is anything referenced that doesn't exist or is misnamed?

9. **Tone and onboarding-friendliness.** The doc treats the human
   as new to Dabbler. Does the prose match that? Are there places
   where the doc lapses into insider language (e.g., assuming the
   reader knows what "outsource-first" means without explanation)?

10. **Bootstrap-prompt-to-doc handoff.** The Session 2 extension
    command (not yet implemented) will copy a clipboard prompt
    sketched as:

    > Read https://raw.githubusercontent.com/.../master/docs/adoption-bootstrap.md and follow it for this workspace.
    >
    > Gather all decisions in dialog with me first. Don't write any files until you've shown me a numbered checklist of what you plan to do and I've approved it. I can interrupt at any time.

    Given that prompt + this doc, would *you* (the verifier engine)
    fetch the URL, read the doc, and execute correctly? Or would
    something in the prompt-doc handoff fail in your hands?

### Notes

- This is a **doc-only verification**. No code to compile, no tests
  to run. The cross-provider verifier in this session is doing
  literally what session-verification was designed for: would a
  different-provider engine handle the artifact correctly?
- Be paranoid about Step 7's "no writes until approved" gate. That
  is the operator-explicit guardrail; if it's not strong enough,
  the entire bootstrap shape fails because AI engines start
  scaffolding files mid-dialog.
- Be specific about line numbers / Step numbers when raising
  issues. "The doc could be clearer in Step 5" is unhelpful;
  "Step 5's middle-tier description doesn't say what triggers the
  50%-spend prompt" is actionable.
