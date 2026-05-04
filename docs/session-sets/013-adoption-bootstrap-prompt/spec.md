# Adoption bootstrap prompt + canonical instructions doc + budget-driven verification modes + extension entry point

> **Purpose:** Ship the user-facing entry point for adopting the Dabbler AI-led workflow. **One** entry point — `Dabbler: Copy adoption bootstrap prompt` from the command palette. The human pastes the copied prompt into a fresh Claude Code / Gemini / GPT chat; the prompt points at a canonical online doc; **the AI detects state from VS Code context and proceeds via interactive dialog with the human throughout.** No user-facing "pick branch A/B/C" — the AI does the routing internally based on (1) whether a workspace is open and (2) whether a project plan already exists. Mode selection is **budget-driven**: the AI asks the human for a concrete dollar outsourcing/API budget, saves it as a threshold file, and recommends a verification mode based on three tiers ($0 / low / high). Interaction style is **checklist-before-execute**: the AI gathers all decisions in dialog, then presents a numbered list of intended writes/configs/scaffolding for batch approval before executing — not per-write confirmations. Operator rationale: *"That should build confidence and reduce friction."*
> **Created:** 2026-05-04
> **Session Set:** `docs/session-sets/013-adoption-bootstrap-prompt/`
> **Prerequisite:** Set 012 Session 1 (workspace-relative auto-discovery + `dabbler-ai-router 0.1.1`) — the bootstrap doc's "setup mechanics" branch references `pip install dabbler-ai-router` and the no-env-var workspace discovery story. Set 012 Session 1's work is committed locally on master at this set's creation time but not yet pushed/released; the operator may push + tag-release at any point before Set 013's verification.
> **Reorder note:** This set is inserted ahead of Set 012 Sessions 2–3 (Marketplace publish + README shrink) at operator request — a near-term project needs the bootstrap path before its initial AI session. Set 012 Sessions 2 and 3 may be amended after this set closes to reference the bootstrap path; that's a Set 012 follow-up, not Set 013 scope.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: the deliverable is a static doc + a workflow-doc-section update + a clipboard-copy extension command + minor package.json / README edits. Split into 2 sessions because the canonical doc + workflow-doc section (Session 1) want a focused prose-quality verification round, distinct from the extension wiring + README cross-link verification (Session 2). Session 1's commit pushing to `origin/master` also makes the canonical URL live before Session 2 smoke-tests the clipboard-copy command against it — avoiding a "URL works locally but not yet on origin" footgun. No UI behavior to UAT. E2E coverage is not meaningful for a clipboard-copy. Cross-provider verification is the load-bearing check on each session — specifically, the verifier (different provider than the orchestrator) must confirm that *it* would understand and act on the canonical doc correctly. That's the principle from feedback memory `feedback_user_facing_ai_prompts_use_session_sets.md`: when the asset orients an arbitrary engine, the verifier doubles as a cross-engine orientation check.

---

## Project Overview

### What the set delivers

Two sessions, four work blocks (a)–(d). Session 1 lands work block (a) plus the workflow-doc update; Session 2 lands work blocks (b), (c), (d) and the build/smoke-test:

**(a) Canonical online instructions doc** — `docs/adoption-bootstrap.md` in this repo, reachable at `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md`. The doc orients an arbitrary AI assistant via **state detection + interactive dialog + checklist-before-execute**, not via user-facing branch labels. The AI gathers all decisions in dialog (Steps 1–6 below), then presents a single batch action list for confirmation (Step 7), then executes (Step 8). Internal logic:

1. **Step 1 — Detect VS Code context.** Two top-level states:
   - **No workspace open.** The AI offers three sub-paths in dialog: (i) design a project plan interactively here in this chat; (ii) work on an existing local project elsewhere — ask for the path; (iii) clone a remote repo — ask for the URL. Once the human chooses, load context and fall through to the workspace-open flow.
   - **Workspace/folder is open.** Canvas the workspace (file tree, language detection, key files), summarize understanding back to the human, ask for corrections.
2. **Step 2 — Fast-path detection.** Before deep dialog, check for signals that the human already has a plan: existence of `docs/planning/project-plan.md`, an explicit "I have a plan" statement, or a sufficiently complete project state. If detected: *"You appear to have a plan ready. Do you want to skip the discovery dialog and go straight to the action checklist?"* If yes → jump to Step 7 with a minimal-discovery checklist (build session sets from the existing plan + budget setup + outsource-mode config).
3. **Step 3 — Interactive education.** Brief, in-flow education about what session sets are, why they help for AI-led development, and the cost-tracking + cross-provider-verification benefits. Two paragraphs max — embedded in the dialog, not a wall of text.
4. **Step 4 — Budget-threshold dialog.** Ask the human directly: *"What outsourcing/API budget do you want to set for this project? This is the dollar amount you're comfortable spending on AI router calls (verification, code review, analysis) over the project's lifetime. We'll save it as a threshold and monitor against it."* Translate the answer into a tier and recommend a verification mode:
   - **$0 → zero-budget mode.** No API verification. Two options the AI explains and the human picks between:
     - **(a) Manual verification via a different code-assist AI engine.** After each session's work, the human opens a *different* AI assistant (e.g., Gemini Code Assist if Claude Code did the work, or vice versa), hands it the verification template (`ai_router/prompt-templates/verification.md`) plus the work, and copies the verdict back to the orchestrator chat.
     - **(b) Skip verification entirely.** Each session's `change-log.md` records the explicit decision to skip; the human accepts the audit-trail consequence.
     The choice is logged in `ai_router/budget.yaml`.
   - **Low budget (less than ~$20) → outsource-last with API verification.** Verifier daemon backed by a subscription CLI handles verification. Threshold monitored closely; AI warns the human as actual spend approaches it.
   - **Middle range ($20–$99) → outsource-last with API verification, watch for tier upgrade.** Same as low budget mechanically; the AI flags when monthly spend crosses 50% of the threshold so the human can decide whether to raise the budget.
   - **High budget ($100+) → outsource-first with full API work.** Synchronous per-call API providers; full automation. Threshold monitored periodically rather than per-call.
   The AI confirms the recommendation with the human and notes the choice; the actual `router-config.yaml` + `ai_router/budget.yaml` writes happen in Step 8 (after the checklist is approved).
5. **Step 5 — Plan alignment dialog.** Walk through what's done (workspace path) or what to build (greenfield path); propose a session-set decomposition. The human steers — the AI proposes, the human approves / edits / rejects each set in dialog. No commitment until Step 7's checklist.
6. **Step 6 — Build the action checklist.** Aggregate every concrete write / config update / scaffolding action the AI proposes to do, in order. Example:
   ```
   Recommended actions for your project:

   1. Write docs/planning/project-plan.md (40 lines, draft below)
   2. Save outsourcing budget ($25) to ai_router/budget.yaml
   3. Update ai_router/router-config.yaml outsource_mode = "last"
   4. Scaffold docs/session-sets/ folder structure
   5. Create session-set 001-user-auth (3 sessions, draft spec below)
   6. Create session-set 002-product-catalog (4 sessions, draft spec below)
   7. Create session-set 003-checkout-flow (3 sessions, draft spec below)
   8. Add CLAUDE.md (project root, copied from canonical repo with budget reference)

   Approve all? Or tell me which items to skip / edit / reorder.
   ```
   Show drafts inline for any non-trivial file (project-plan.md, the spec.md files). The human responds with "go" / "go but skip 4" / "edit 2: budget should be $50" / etc.
7. **Step 7 — Execute the approved checklist.** Run through the approved items in order. The human can interrupt at any time (this is just the AI working through the list; no per-action confirmation gate). The AI reports completion of each item briefly so progress is visible.
8. **Step 8 — Closing pointers.** Inform the human about:
   - **Budget monitoring.** Where the threshold lives (`ai_router/budget.yaml`); how to check actual spend (`python -m ai_router.report --since YYYY-MM-DD`); how to update the threshold later (edit the yaml — automated enforcement is a follow-up set, not Set 013).
   - **General cost monitoring.** `python -m ai_router.report` for governance summary; the cost dashboard via `Dabbler: Show cost dashboard`; per-session `print_cost_report()` at session close.
   - **More info.** Repo-root `README.md` (overview), `docs/ai-led-session-workflow.md` (canonical workflow incl. the new "Cost-budgeted verification modes" section landed in this set), command palette ("Dabbler" prefix), session-set explorer in the activity bar.
   - **How to start the next session.** The trigger phrase `Start the next session.` once session sets exist; the AI follows the workflow doc from there. For zero-budget mode, the AI reminds the human that verification is manual (option a) or skipped (option b) per the choice logged in `ai_router/budget.yaml`.

The doc is engine-agnostic — describes tools in capability terms ("fetch a URL," "list files matching a pattern," "read a file," "write a file"), not specific tool function names.

**Budget threshold file format.** New artifact at `ai_router/budget.yaml`:

```yaml
# Project outsourcing budget — set during adoption bootstrap.
# Used by ai_router for spend reporting and (in a future set)
# automated threshold monitoring / pre-call warnings.

threshold_usd: 25                  # 0, low (<20), middle (20-99), high (100+)
mode: "limited-budget"             # zero-budget | limited-budget | ample-budget
recommended_outsource_mode: "last" # first | last | none
verification_method: "api"         # api | manual-via-other-engine | skipped
set_at: "2026-05-04T15:30:00-04:00"
set_by: "adoption-bootstrap-flow"
notes: |
  Optional human-supplied notes on rationale or constraints.
```

For `verification_method: "manual-via-other-engine"` (zero-budget option a), the bootstrap doc instructs the human on the manual process: open a *different* code-assist AI assistant, hand it the verification template, paste back the verdict. For `verification_method: "skipped"` (zero-budget option b), each session's `change-log.md` is required to surface the skip explicitly so the audit trail is honest.

**(b) Extension command** — `dabbler.copyAdoptionBootstrapPrompt` registered in `tools/dabbler-ai-orchestration/package.json` and implemented in `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`. Title: **"Dabbler: Copy adoption bootstrap prompt"**. The implementation copies a short prompt to clipboard (single-string, no formatting variants) and shows a `vscode.window.showInformationMessage` confirming the copy. Sketch of the copied prompt:

```
Read https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md and follow it for this workspace.

Gather all decisions in dialog with me first. Don't write any files until you've shown me a numbered checklist of what you plan to do and I've approved it. I can interrupt at any time.
```

The prompt deliberately does NOT mention "session sets," "ai-router," "branches," "outsource modes," or any dabbler internals — the canonical doc covers those. The prompt is the smallest possible orientation hop; the doc is the substance. The "checklist before writes" instruction is load-bearing — it's the operator-explicit guardrail against AI assistants trying to autonomously canvas + plan + scaffold without human confirmation, and it specifies the *form* of the confirmation (a batch-approve checklist, not per-write prompts that would feel intrusive).

**(c) Marketplace listing surface updates** — `tools/dabbler-ai-orchestration/package.json`:
- Bump `version` 0.12.0 → 0.12.1 (patch — additive new command, no breaking changes). Set 012 Session 2's planned bump to 0.13.0 still works (0.12.1 → 0.13.0 is the Marketplace-launch bump).
- Add `"adoption", "bootstrap", "onboarding"` to `keywords` for Marketplace search.
- Update `description` to mention the bootstrap entry point: e.g., *"Project wizard, session-set explorer, cost dashboard, and adoption-bootstrap entry point for the Dabbler AI-led workflow."*

`tools/dabbler-ai-orchestration/CHANGELOG.md` — entry for v0.12.1 explaining the new command + linking to the canonical doc.

**(d) Repo-root README + extension README pointers** — repo-root `README.md` gets a short "**For new projects**" section near the top of the adoption flow, pointing at `Dabbler: Copy adoption bootstrap prompt` as the recommended start. `tools/dabbler-ai-orchestration/README.md` documents the new command in its commands table.

### Motivation

The current adoption flow assumes the human already knows what dabbler is, what session sets are, how the workflow operates, and what `project-plan.md` should look like before they ever open Claude Code. The wizard's existing "Get Started" panel handles the case where they have a plan; `generateSessionSetPrompt` handles the case where they have a plan and want it decomposed. **Neither handles the case where the human has zero context** — they just want their project organized and they expect the AI to figure out how.

Set 013 fills that gap. **One** entry point — `Dabbler: Copy adoption bootstrap prompt` — hands the AI everything it needs: a URL pointing at instructions, internal logic for state detection, an always-interactive dialog flow, and a deliverable target (`project-plan.md`) that the existing wizard already consumes downstream. Adoption friction drops to "click → paste → talk to the AI" — the human never has to read the workflow doc themselves.

**Why one entry point, not three labeled branches.** Operator guidance (2026-05-04): too many entry points create choice paralysis. The human shouldn't have to know whether their project is "existing" or "greenfield" or "midway" — that's the AI's job to detect from VS Code context. Single click → single paste → AI handles the routing.

**Why budget-driven mode selection.** Operator guidance (2026-05-04): cost containment is so important that subjective "how much do you care about cost vs. quality?" framing is too fuzzy. A concrete dollar threshold is auditable, becomes a shared monitoring contract between AI and human, and forces honest discussion of tradeoffs. The three-tier mapping ($0 / low / high) covers realistic budget shapes including the genuine $0 case, where the operator has explicitly authorized either manual-via-other-engine verification or logged skip — both with audit trails.

**Why checklist-before-execute, not per-write prompts.** Operator guidance (2026-05-04): per-write confirmation is intrusive and breaks the flow. The right shape is "AI gathers all decisions in dialog → presents a numbered list of intended writes → human batch-approves or edits → AI executes." The human can interrupt at any time. This respects time without giving up oversight. Fast-path detection in Step 2 lets power users skip the dialog and review just the checklist.

**Why cross-engine compatibility matters.** A human starting a new project is just as likely to be in a Gemini chat as a Claude chat. The bootstrap-prompt + canonical-doc shape is engine-agnostic by construction (URL fetch + file-write are ubiquitous capabilities; the doc describes tools in capability terms). The cross-provider verifier on this session is the test of that — it's a different-provider model evaluating whether *it* would orient correctly off the asset.

### Non-goals

- **No multiple entry points.** Operator-explicit: one command, one prompt, one URL. The temptation to add `Dabbler: Canvas this project` / `Dabbler: Plan a new project` / `Dabbler: Setup mechanics` separate commands is rejected — the AI does the routing.
- **No autonomous "fire-and-forget" mode.** The bootstrap prompt's "checklist before writes" instruction is load-bearing. Even if a future operator wants a `--yolo` flag for non-interactive setup, that's out of scope for Set 013.
- **No automated budget-threshold enforcement / pre-call warnings / spend monitoring code.** Set 013 lands the *file format* (`ai_router/budget.yaml`), the *dialog* that produces it, the *workflow-doc section* describing the three-tier modes, and the *closing pointers* that tell the human how to monitor manually (`python -m ai_router.report --since YYYY-MM-DD`). Automated pre-call threshold checks, warnings, and block-on-exceed enforcement are deferred to a follow-up set. The bootstrap doc tells the human "this is your responsibility for now; tooling lands later."
- **No new ai_router code in this set beyond the budget.yaml file.** The router doesn't yet read `budget.yaml`. That's the follow-up.
- **No update to Rule 2 of the workflow doc ("never skip verification") for the $0-budget option (b) "skipped" path.** Instead, the new "Cost-budgeted verification modes" section in `docs/ai-led-session-workflow.md` is added as a *complement* to Rule 2: Rule 2 is the default; the new section documents the explicit operator-authorized exception when `ai_router/budget.yaml:verification_method == "skipped"`. Rule text itself stays unchanged.
- **No GitHub Pages setup.** The canonical doc is served via `raw.githubusercontent.com` on the master branch — stable as long as master remains the default. GitHub Pages adds CI + deployment setup; defer until there's a reason.
- **No interactive web UI for the bootstrap.** The webview wizard already exists for the post-plan flow; clipboard + chat-paste is enough for the bootstrap.
- **No localization of the canonical doc.** English-only for v1.
- **No automated test that pastes the prompt into a real AI session.** Cross-provider verification (Step 12) is the substitute.
- **No deletion or restructure of the existing `Dabbler: Get started` wizard.** The bootstrap precedes it in the flow, not replaces it.
- **No Marketplace publish.** Set 012 Session 2 still owns the publish. Set 013's 0.12.1 bump produces an installable VSIX for local sideload.

---

## Naming decisions (recorded so future audits don't relitigate)

- **Set slug:** `013-adoption-bootstrap-prompt`. Inserted ahead of Set 011 (readme-polish) and Set 012 Sessions 2–3 (Marketplace publish + README shrink).
- **Doc path:** `docs/adoption-bootstrap.md` at the canonical repo root. Single file, preamble + 9 internal Steps (no user-facing branch labels).
- **Public URL:** `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md`. Pinned to `master` (not a tag) so the doc evolves without churning the bootstrap prompt's URL. If `master` is ever renamed (e.g., to `main`), the URL needs a one-line update in the bootstrap prompt — that's an acceptable maintenance cost given that's also when CLAUDE.md / AGENTS.md / GEMINI.md would all need updating anyway.
- **Extension command id:** `dabbler.copyAdoptionBootstrapPrompt`. Matches the existing `dabbler.*` namespace (alongside `dabbler.getStarted`, `dabbler.setupNewProject`, etc.) rather than `dabblerSessionSets.*` (which is for explorer-bound commands).
- **Command title:** `Dabbler: Copy adoption bootstrap prompt`.
- **Source file:** `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`. Matches the `commands/` subdirectory pattern (alongside `gitScaffold.ts`).
- **Extension version after this set:** `0.12.1`. Set 012 Session 2's planned bump to 0.13.0 still applies (Marketplace launch bumps 0.12.1 → 0.13.0).

---

## Session Plan

### Session 1 of 2: Canonical doc + workflow-doc "Cost-budgeted verification modes" section

**Goal:** Land work block (a) — the canonical instructions doc at `docs/adoption-bootstrap.md` — plus the new "Cost-budgeted verification modes" section in `docs/ai-led-session-workflow.md`. End state: the canonical doc is live at `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md` (fetchable by any AI), the workflow doc explains the three-tier cost-budgeted modes including the operator-authorized $0/skipped Rule 2 exception, and Session 2 can wire up the extension command pointing at the now-live URL.

**Steps:**

1. **Read prerequisites.** Spec for this set. Current `docs/ai-led-session-workflow.md` to confirm the right insertion point for the new section + the existing Rule 2 wording. Current `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts:PROMPT_SYSTEM` to confirm the downstream `project-plan.md` schema the canonical doc must produce. Current repo-root `README.md` (for cross-link target paths only — README updates land in Session 2).
2. **Register session start.** Standard `register_session_start()` call (currentSession=1, totalSessions=2).
3. **Author `ai-assignment.md`.** Direct authoring per standing operator constraint (router suspended mid-session). Single recommendation block for Session 1; Session 2 block authored on Session 2 start.
4. **Author `docs/adoption-bootstrap.md` — the canonical doc.** Structure (no user-facing branch labels; internal state-detection + dialog + checklist-before-execute):
   - **Preamble (~1 paragraph).** "If you're an AI reading this in a chat the human just started, you are now the bootstrap-orchestrator for this workspace. Gather all decisions in dialog with the human first; do not write any files until you've shown a numbered checklist of intended actions and the human has approved it. The human can interrupt at any time. Treat the human as new to dabbler unless they say otherwise. Tools you'll need (in capability terms): fetch a URL, list files matching a pattern, read a file, write a file, run a shell command. Use whatever your tool palette calls these."
   - **Step 1 — Detect VS Code context.** Two states: workspace open (canvas it) vs. no workspace open (offer three sub-paths in dialog: design here / existing local project elsewhere / clone a remote repo).
   - **Step 2 — Fast-path check.** If `docs/planning/project-plan.md` exists OR the human says they have a plan ready, jump to Step 7 with a minimal checklist (build session sets from the existing plan + budget setup + outsource-mode config).
   - **Step 3 — Confirm understanding (workspace-open path).** Summarize what was canvased back to the human; prompt for corrections.
   - **Step 4 — Brief education on session sets.** Two paragraphs in dialog. What a session set is, why it helps for AI-led work, what a session looks like end-to-end. Link out to `docs/ai-led-session-workflow.md` for the canonical workflow.
   - **Step 5 — Budget-threshold dialog.** Ask the human directly for an outsourcing/API budget in dollars. Map to a tier:
     - **$0** → zero-budget mode. Explain the two human options: **(a)** manual verification via a *different* AI assistant (process described — open second assistant, paste verification template + work, copy verdict back); **(b)** skip verification entirely with the decision logged in each session's `change-log.md`. The human picks (a) or (b); the choice is part of the budget.yaml record.
     - **Less than ~$20** → low-budget tier; recommend `outsource-last` with API verification. AI will warn human as spend approaches threshold.
     - **$20–$99** → middle tier; recommend `outsource-last` with active monitoring and a tier-upgrade prompt at 50% spend.
     - **$100+** → high-budget tier; recommend `outsource-first` with full API automation; threshold monitored periodically.
     Briefly explain `outsource-first` vs. `outsource-last` (per-call API vs. verifier-daemon-backed-by-subscription). Confirm with human; no config written yet.
   - **Step 6 — Plan alignment dialog.** Walk through what's done / what to build; propose a session-set decomposition; the human approves / edits / rejects each proposed set. No commitment until Step 7's checklist.
   - **Step 7 — Build the action checklist.** Aggregate all proposed writes / config updates / scaffolding into a numbered list. Show inline drafts for non-trivial files (project-plan.md, each spec.md). Ask for batch approval. Accept "go" / "go but skip N" / "edit M: ..." responses. Do not execute any item until approved.
   - **Step 8 — Execute the approved checklist.** Walk through items in order, writing files and updating configs. Report completion of each item briefly. The human can interrupt at any point.
   - **Step 9 — Closing pointers.** Inform the human about:
     - **Budget monitoring.** Threshold lives in `ai_router/budget.yaml`; check actual spend with `python -m ai_router.report --since YYYY-MM-DD`; update threshold by editing the yaml. Note that automated pre-call enforcement is a follow-up set, not yet shipped.
     - **General cost monitoring.** `python -m ai_router.report` (governance summary), `Dabbler: Show cost dashboard` extension command, automatic per-session cost report at session close.
     - **More info.** Repo-root `README.md`, `docs/ai-led-session-workflow.md` (canonical workflow incl. the new "Cost-budgeted verification modes" section), command palette "Dabbler" prefix, session-set explorer in activity bar.
     - **How to start the next session.** Trigger phrase `Start the next session.` once session sets exist. For zero-budget mode, the AI reminds the human that verification is manual (option a) or skipped (option b) per the choice logged in `ai_router/budget.yaml`.

   **Budget threshold file format** — the canonical doc embeds this schema for `ai_router/budget.yaml`:

   ```yaml
   threshold_usd: 25                  # 0 | low (<20) | middle (20-99) | high (100+)
   mode: "limited-budget"             # zero-budget | limited-budget | ample-budget
   recommended_outsource_mode: "last" # first | last | none
   verification_method: "api"         # api | manual-via-other-engine | skipped
   set_at: "2026-05-04T15:30:00-04:00"
   set_by: "adoption-bootstrap-flow"
   notes: |
     Optional human-supplied notes on rationale or constraints.
   ```

5. **Update `docs/ai-led-session-workflow.md` with a new "Cost-budgeted verification modes" section.** Describes the three tiers ($0 / low / high), how `ai_router/budget.yaml` declares the choice, what each tier means for verification (full API / API with monitoring / manual-via-other-engine / skipped), and how Rule 2 ("Never skip verification") interacts with the operator-authorized $0 + skipped path (Rule 2 stays the default; the new section documents the exception). The new section sits near the top of the workflow doc — likely after "Overview" and before "Key Concepts." Cross-link from the bootstrap doc's Step 5 + Step 9.
6. **End-of-session cross-provider verification.** Verifier reviews:
    - **The canonical doc end-to-end as a runtime instruction set.** Critical question: would the verifier-engine, on receiving a bootstrap prompt + fetching this doc, correctly execute the dialog flow with a hypothetical human? Walk through Steps 1–9 as if the verifier itself were the AI. Where would it get stuck, take a silent action when it should ask, or skip a step? Specifically probe Step 5 (budget-tier mapping → outsource-mode), Step 7 (the action-checklist before any writes), and Step 8 (executing the approved checklist without further per-write prompts).
    - **Checklist-before-execute enforcement.** Is the canonical doc's preamble + Step 7 wording strong enough that the verifier-engine would actually wait for batch approval rather than starting writes during the dialog phase?
    - **Budget-tier mapping correctness.** Are the four tiers ($0 / low / middle / high) clearly defined? Does the $0 path correctly enumerate options (a) and (b)? Is the manual-verification-via-other-engine workflow described concretely enough that a non-technical user could execute it?
    - **State-detection edge cases.** Workspaces that look half-canvased (partial code, partial plan); workspaces that contain a `docs/planning/project-plan.md` but no session sets yet; workspaces with multiple project-plan candidates. Does the doc handle these without the AI freezing or guessing?
    - **`ai_router/budget.yaml` schema.** Is the field set sufficient (threshold_usd, mode, recommended_outsource_mode, verification_method, set_at, set_by, notes)? Anything missing for a future automated-enforcement set to consume cleanly?
    - **Workflow-doc "Cost-budgeted verification modes" section.** Does it correctly document the Rule 2 exception without weakening Rule 2 in spirit? Does it cleanly cross-link with the bootstrap doc?
    - **Cross-engine compatibility.** Are tools described in capability terms throughout the doc? Anything Claude-specific that wouldn't translate to Gemini Code Assist / GPT-based tools / Cursor?
    - **Cost-monitoring + more-info pointers in Step 9.** Are the named commands and doc paths accurate at the moment of verification, given Set 012 Sessions 2–3 haven't shipped yet (no `docs/repository-reference.md`)? Should the doc gracefully degrade when a referenced artifact doesn't exist yet?
7. **Commit, push, run close-out.** The push lands the canonical doc on `origin/master`, making the URL live for Session 2's smoke test. Note: this push will also include Set 012 Session 1's commit (already on local master). The push does **not** trigger any release — release.yml triggers on `v*` tags only, and Set 012's `v0.1.1` tag is held separately at operator discretion. After push, run `python -m ai_router.close_session`. Session 1 is NOT the last session — `change-log.md` is written by Session 2's close-out, not this one.

**Creates (Session 1):** `docs/adoption-bootstrap.md`; `docs/session-sets/013-adoption-bootstrap-prompt/ai-assignment.md`. (`ai_router/budget.yaml` is *not* created at this set's commit time — created per-project at bootstrap-flow runtime when a downstream user runs the bootstrap.)

**Touches (Session 1):** `docs/ai-led-session-workflow.md` (new "Cost-budgeted verification modes" section).

**Ends with:** the canonical doc is live at the public URL; the workflow doc's new section is in place and cross-linked from the bootstrap doc; cross-provider verification returns `VERIFIED` (or clean after at most one fix round); Session 1 is closed via `close_session`.

**Progress keys (Session 1):** `docs/adoption-bootstrap.md` exists with the 9-step internal structure (state-detect → fast-path → confirm → educate → budget → plan → checklist → execute → close); the `ai_router/budget.yaml` schema is documented in the bootstrap doc and referenced from the workflow doc; the URL resolves via raw.githubusercontent.com after push.

---

### Session 2 of 2: Extension command + READMEs + 0.12.1 VSIX build + smoke test

**Goal:** Land work blocks (b), (c), (d) — the extension command + Marketplace surface updates + repo / extension READMEs — and produce/sideload-test the `dabbler-ai-orchestration-0.12.1.vsix`. End state: a human can run `Dabbler: Copy adoption bootstrap prompt` from a sideloaded 0.12.1 VSIX, paste into any AI chat, and the AI fetches the (now-live) canonical doc and takes over.

**Prerequisite check at session start:** the canonical URL must resolve. The session orchestrator confirms with `curl -sIL https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md` (HTTP 200) before the smoke test. If Session 1's push had not yet landed at Session 2 start, the operator is asked to confirm the push happened.

**Steps:**

1. **Read prerequisites.** Confirm canonical URL is live (curl). Read current `tools/dabbler-ai-orchestration/package.json` (commands list + description + keywords + version). Read current `tools/dabbler-ai-orchestration/src/extension.ts` command-registration pattern. Read current `tools/dabbler-ai-orchestration/README.md` and repo-root `README.md` to find the right insertion points for the "For new projects" / "Adoption bootstrap" pointers.
2. **Register session start.** Standard `register_session_start()` call (currentSession=2, totalSessions=2).
3. **Author Session 2 block in `ai-assignment.md`.** Append the Session 2 recommendation block; backfill Session 1 actuals from the close-out cost report. Direct authoring per standing operator constraint.
4. **Add the extension command.**
   - Author `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`. Implementation: ~25 lines. Imports `vscode`. Exports `registerCopyAdoptionBootstrapPromptCommand(context: vscode.ExtensionContext)`. Inside, registers `dabbler.copyAdoptionBootstrapPrompt`; the handler builds the prompt string (constant) and calls `vscode.env.clipboard.writeText(prompt)` then shows an info message: *"Copied. Paste into any AI chat (Claude Code / Gemini / GPT) and the AI will take over."*
   - Wire it up in `tools/dabbler-ai-orchestration/src/extension.ts` alongside the other command registrations.
   - Register in `tools/dabbler-ai-orchestration/package.json` under `contributes.commands` with command id and title.
5. **Update `tools/dabbler-ai-orchestration/package.json`.**
   - Bump `version` 0.12.0 → 0.12.1.
   - Append `"adoption", "bootstrap", "onboarding"` to `keywords`.
   - Update `description` to mention the bootstrap entry point.
6. **Update `tools/dabbler-ai-orchestration/CHANGELOG.md`.** Add a v0.12.1 entry covering the new command + the budget-driven mode philosophy + the canonical doc URL.
7. **Update `tools/dabbler-ai-orchestration/README.md`.** Document the new command in the commands table; add a one-paragraph "Adoption bootstrap" section near the top with the canonical URL.
8. **Update repo-root `README.md`.** Add a short "**For new projects**" subsection near the top of the adoption flow, pointing at `Dabbler: Copy adoption bootstrap prompt` as the recommended starting point. Cross-link to `docs/adoption-bootstrap.md` (relative) and to the public URL (absolute).
9. **Build the extension.** `cd tools/dabbler-ai-orchestration && npm install && npx vsce package` — produce `dabbler-ai-orchestration-0.12.1.vsix`. Confirm it builds without warnings on the new files. Run TypeScript compile / lint as part of the build chain.
10. **Smoke test.** Two parts:
    - **Build-level:** open the VSIX with `Extension Development Host` (or sideload via `code --install-extension`); confirm the new command id appears in the command palette and the title matches.
    - **Runtime:** run `Dabbler: Copy adoption bootstrap prompt`. Paste clipboard contents into a markdown buffer; confirm the URL matches the canonical URL exactly, and the prompt body matches the spec sketch verbatim. Curl the URL one more time to confirm `200 OK` and the doc body is what Session 1 published.
11. **End-of-session cross-provider verification.** Verifier reviews:
    - **The clipboard prompt vs. the spec sketch.** Are they identical, or did drift creep in during the implementation?
    - **Extension wiring correctness.** Is `copyAdoptionBootstrapPrompt.ts` registered correctly? Does the command id in `package.json` match the registration id in `extension.ts`? Is the command's title properly namespaced (`Dabbler: ...`)?
    - **The 0.12.1 version bump rationale.** Patch vs. minor — is patch the right call given a new top-level command was added?
    - **README cross-links.** Do all three READMEs (extension README, repo-root README, CHANGELOG) cross-link to consistent paths? Does the repo-root README's new "For new projects" subsection sit at a reasonable place in the document flow?
    - **VSIX completeness.** Did the build include the new TS file? Did the icon, commands list, and description appear correctly in the produced VSIX manifest?
12. **Commit, push, run close-out.** This **is** the last session — `change-log.md` is written by close-out and summarizes both sessions. The push lands the extension changes on origin/master. The 0.12.1 VSIX is committed alongside the source for sideload availability (matching the existing `dabbler-ai-orchestration-0.12.0.vsix` artifact pattern).

**Creates (Session 2):** `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`; `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` (build artifact, committed alongside source); `docs/session-sets/013-adoption-bootstrap-prompt/change-log.md` (close-out, summarizes both sessions).

**Touches (Session 2):** `tools/dabbler-ai-orchestration/package.json` (version + keywords + description + commands list); `tools/dabbler-ai-orchestration/src/extension.ts` (command registration); `tools/dabbler-ai-orchestration/CHANGELOG.md` (v0.12.1 entry); `tools/dabbler-ai-orchestration/README.md` (commands table + adoption section); repo-root `README.md` (For new projects subsection); `docs/session-sets/013-adoption-bootstrap-prompt/ai-assignment.md` (Session 2 block).

**Ends with:** `Dabbler: Copy adoption bootstrap prompt` works from a sideloaded 0.12.1 VSIX; the clipboard string is byte-identical to the spec sketch; the canonical URL resolves and curling it returns the doc body Session 1 published; every internal cross-link resolves; cross-provider verification returns `VERIFIED`; `change-log.md` summarizes both sessions; the set is closed.

**Progress keys (Session 2):** `tools/dabbler-ai-orchestration/package.json` version is 0.12.1 and includes the new command id; `dabbler-ai-orchestration-0.12.1.vsix` builds and registers the command in the Extension Development Host; the clipboard prompt matches the spec sketch verbatim; `curl -sIL <canonical-url>` returns 200 OK.

---

## Acceptance criteria for the set

- [ ] `docs/adoption-bootstrap.md` exists in the repo, reachable at the public URL after push.
- [ ] The doc orients an AI via internal state-detection logic (no user-facing branch labels) and runs the 9-step dialog → checklist → execute flow.
- [ ] The doc explicitly handles both top-level VS Code states (workspace open / no workspace open) and the three sub-paths under no-workspace (design here / existing local elsewhere / clone remote).
- [ ] The doc includes a fast-path detection (Step 2) for users who already have a plan ready.
- [ ] The doc's Step 5 implements the budget-threshold dialog with the four tiers ($0 / low / middle / high), maps each to an outsource mode, enumerates the $0 options (a) manual-via-other-engine and (b) skipped, and instructs the AI to record the choice in `ai_router/budget.yaml`.
- [ ] The doc embeds the `ai_router/budget.yaml` schema with all required fields (`threshold_usd`, `mode`, `recommended_outsource_mode`, `verification_method`, `set_at`, `set_by`, `notes`).
- [ ] The doc's Step 7 presents a numbered checklist of intended writes/configs/scaffolding before any execution; Step 8 executes the approved checklist without per-item gates.
- [ ] The doc closes (Step 9) with budget-monitoring pointers, general cost-monitoring pointers, more-info pointers, and next-session trigger guidance.
- [ ] `docs/ai-led-session-workflow.md` has a new "Cost-budgeted verification modes" section documenting the three tiers and Rule 2 exception, cross-linked from the bootstrap doc.
- [ ] `dabbler.copyAdoptionBootstrapPrompt` is registered in `package.json` and implemented in `commands/copyAdoptionBootstrapPrompt.ts`.
- [ ] The command copies a clipboard string that points the AI at the canonical URL and includes the load-bearing "no writes until checklist approved" instruction.
- [ ] Extension version is `0.12.1`; `dabbler-ai-orchestration-0.12.1.vsix` builds cleanly via `vsce package`.
- [ ] `CHANGELOG.md` has a v0.12.1 entry covering the new command, the budget-driven mode philosophy, and the canonical doc URL.
- [ ] Both READMEs (repo-root + extension) document the new command and the bootstrap path.
- [ ] Cross-provider verification returns `VERIFIED` on the bootstrap prompt + canonical doc + workflow-doc update + extension wiring; verifier explicitly confirms it would (a) understand the doc as a runtime instruction set, (b) wait for the action checklist's batch approval before any writes, (c) handle the budget-tier dialog correctly across all four tiers including the $0 sub-options, and (d) not take silent autonomous actions during the dialog phase.
- [ ] `change-log.md` summarizes the set in the standard close-out format.

---

## Risks

- **AI starts writing during the dialog phase despite the "no writes until checklist" instruction.** The biggest functional risk: the asset orients an AI engine that, mid-dialog (e.g., during Step 5's budget conversation), proceeds to write `ai_router/budget.yaml` or `router-config.yaml` without waiting for Step 7's batch approval. Modern AI engines have a strong "make progress visibly" bias. Mitigation: the bootstrap prompt's "no writes until checklist approved" wording is load-bearing; the canonical doc's preamble repeats it; Step 7 is positioned as a hard gate. Cross-provider verification specifically probes whether the verifier-engine would respect this gate.
- **State-detection edge cases.** A workspace with a partial `docs/planning/project-plan.md`, multiple project-plan candidates, or a half-canvased state can confuse the state-detection logic. Mitigation: the doc's Step 1 + Step 2 explicitly handle ambiguity by surfacing what they see and asking the human, rather than guessing. Verifier probes this.
- **Budget-tier mapping doesn't match operator's mental model.** The four-tier breakpoints ($0 / <$20 / $20–$99 / $100+) come from operator dialog and may not generalize to all users. A frugal user with a $5 budget and a high-value project may want `outsource-last` with strict caps, not the doc's recommendation. Mitigation: the doc's Step 5 frames the tier mapping as a *recommendation* and asks for human confirmation; the human can override.
- **$0 zero-budget option (b) "skipped" path conflicts with workflow Rule 2.** Rule 2 says "Never skip verification." Set 013 introduces an explicit operator-authorized exception. The risk is documentation drift between the bootstrap doc, the workflow doc's new section, and Rule 2 itself. Mitigation: Step 5 of the spec authors the new "Cost-budgeted verification modes" workflow-doc section as a *complement* to Rule 2, not a replacement. Rule 2 stays the default; the new section documents the audit-trailed exception. The bootstrap doc's Step 5 explains this to the human at the moment of choice.
- **Manual-via-other-engine verification (option a) workflow is brittle in practice.** Asking a non-technical user to open a *second* AI assistant, paste a verification template + work, and copy a verdict back is multi-step and error-prone. Mitigation: the canonical doc walks through the workflow concretely (which template, what to paste, what verdict shape to expect, how to log the result). Cross-provider verifier probes whether the description is concrete enough.
- **Cross-engine tool-name assumptions.** Claude Code's tool names are Claude-specific. Gemini Code Assist, GPT-based tools, and Cursor have different tool palettes. Mitigation: the canonical doc describes tools in capability terms ("fetch a URL," "list files matching a pattern"); verifier explicitly probes this.
- **`master` vs. `main` branch hardcoding in the URL.** If this repo ever renames its default branch, the URL in every previously-distributed bootstrap prompt becomes a 404. Mitigation: don't rename for now; if/when the rename happens, ship a redirect or update the canonical doc URL via a 0.12.x patch release. Acceptable risk.
- **Adoption-flow drift between the canonical doc and `docs/ai-led-session-workflow.md`.** The bootstrap doc explains the early-stage flow; the workflow doc explains the in-flight session-set flow. If they disagree on conventions, a human onboarding via the bootstrap hits confusion at handoff. Mitigation: the bootstrap doc's Step 9 explicitly defers to `ai-led-session-workflow.md`; the new workflow-doc section is the only place where the cost-budgeted-modes details live.
- **0.12.1 vs. 0.13.0 versioning collision with Set 012 Session 2.** Set 012 Session 2's planned 0.12.0 → 0.13.0 bump assumes 0.12.0 is current. After Set 013 lands, current is 0.12.1 and Set 012 Session 2 bumps 0.12.1 → 0.13.0. Mitigation: the orchestrator updates the Set 012 Session 2 spec in-flight as a housekeeping touch.
- **Marketplace-discoverability gap until Set 012 Session 2 ships.** The bootstrap path is most adoption-valuable when the extension is on the Marketplace. Until then, new users must sideload the VSIX. Mitigation: acceptable for the operator's immediate-need project (sideload locally); Set 012 Session 2 lands the publish later.
- **`ai_router/budget.yaml` schema may not match what the future automated-enforcement set needs.** Set 013 ships the schema; a follow-up set adds pre-call enforcement that reads it. If the schema is missing fields the enforcement code wants, the enforcement set has to either change the schema (painful — existing per-project budget files have to migrate) or layer a second file on top. Mitigation: the schema is reviewed by the verifier in Step 13 with explicit "anything missing for future automated enforcement?" probe.

---

## References

- Set 012 (`012-marketplace-publish-and-readme-shrink`) — Session 1 (auto-discovery + 0.1.1) is committed locally at this set's creation time. Sessions 2 (Marketplace publish) and 3 (README shrink) are downstream of Set 013 in the operator's current sequencing.
- Memory `feedback_user_facing_ai_prompts_use_session_sets.md` — the rationale for choosing session-set workflow over ad-hoc for this work.
- Memory `project_adoption_bootstrap_prompt.md` — the operator's vision recorded on 2026-05-04.
- Existing wizard scaffolding: `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts`, `WizardPanel.ts`, `planImport.ts`. The bootstrap is a prequel to these; it does not replace them.
- `docs/ai-led-session-workflow.md` — the in-flight workflow the bootstrap doc hands off to.

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route, no analysis routes per the standing operator cost-containment rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Canonical doc + workflow-doc section | $0.15–$0.40 | Doc-heavy verification: verifier walks the 9-step dialog flow as a runtime instruction set, probes the checklist-before-execute gate, checks budget-tier mapping (incl. the $0 sub-options), and reviews the workflow-doc section's interaction with Rule 2. Round 2 likely; Round 3 possible if the $0 manual-verification description needs tightening. |
| 2 — Extension command + READMEs + VSIX build + smoke test | $0.05–$0.15 | Light verification: clipboard-string fidelity, extension wiring, README cross-links, VSIX completeness. Mostly mechanical; Round 1 typically passes for this category of work. |
| **Set total** | **$0.20–$0.55** | Two sessions; about 2× Set 012 Session 1's actual cost ($0.12, two rounds) due to the broader Session 1 verification surface plus a small Session 2 round. |
