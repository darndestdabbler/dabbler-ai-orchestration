# Cross-provider verification — Set 13 Session 2: Extension command + READMEs + 0.12.1 VSIX build + smoke test

You are reviewing a session that wired up a single new top-level VS Code
extension command (`Dabbler: Copy adoption bootstrap prompt`) and updated
the surrounding Marketplace surfaces (extension `package.json`,
`CHANGELOG.md`, both READMEs) to advertise it as the recommended adoption
entry point. Session 1 already shipped the canonical doc the command
points at; the URL is live (HTTP 200, 28879 bytes).

The deliverable is mechanical: a ~25-line TypeScript command file, a
package.json version bump (0.12.0 → 0.12.1) + keywords/description
updates + commands-list entry, an extension.ts registration, a CHANGELOG
entry, and two README pointer updates. The verification surface is
narrow — clipboard-string byte-fidelity vs. the spec sketch, command-id
consistency between `package.json` and `extension.ts`, README cross-link
correctness, and VSIX manifest completeness.

**Goal of the verification:** would the produced 0.12.1 VSIX, when
sideloaded into VS Code, expose the new command in the palette with the
correct title, copy the byte-for-byte spec-sketch prompt to the
clipboard, and show the expected info message? And do the surrounding
README/CHANGELOG/package.json edits give a reader an accurate, internally
consistent picture of what the new command does and how 0.12.1 differs
from 0.12.0?

---

## Spec excerpt for Session 2

```markdown
### Session 2 of 2: Extension command + READMEs + 0.12.1 VSIX build + smoke test

**Goal:** Land work blocks (b), (c), (d) — the extension command +
Marketplace surface updates + repo / extension READMEs — and produce/
sideload-test the dabbler-ai-orchestration-0.12.1.vsix. End state: a
human can run "Dabbler: Copy adoption bootstrap prompt" from a
sideloaded 0.12.1 VSIX, paste into any AI chat, and the AI fetches
the (now-live) canonical doc and takes over.

Prerequisite check at session start: the canonical URL must resolve
(HTTP 200) before the smoke test.

**Steps (paraphrased):**
1. Read prerequisites (curl URL, package.json, extension.ts, READMEs).
2. Register session start (currentSession=2, totalSessions=2).
3. Author Session 2 block in ai-assignment.md; backfill Session 1
   actuals from close-out.
4. Add the extension command:
   - Author tools/dabbler-ai-orchestration/src/commands/
     copyAdoptionBootstrapPrompt.ts (~25 lines). Imports vscode.
     Exports registerCopyAdoptionBootstrapPromptCommand(context).
     Registers dabbler.copyAdoptionBootstrapPrompt; handler builds
     prompt string (constant), calls
     vscode.env.clipboard.writeText(prompt), shows info message
     "Copied. Paste into any AI chat (Claude Code / Gemini / GPT)
     and the AI will take over."
   - Wire it up in tools/dabbler-ai-orchestration/src/extension.ts
     alongside the other command registrations.
   - Register in tools/dabbler-ai-orchestration/package.json under
     contributes.commands with command id and title.
5. Update package.json:
   - Bump version 0.12.0 → 0.12.1.
   - Append "adoption", "bootstrap", "onboarding" to keywords.
   - Update description to mention the bootstrap entry point.
6. Update CHANGELOG.md: v0.12.1 entry covering the new command +
   the budget-driven mode philosophy + the canonical doc URL.
7. Update tools/dabbler-ai-orchestration/README.md: document the
   new command in the commands table; add a one-paragraph
   "Adoption bootstrap" section near the top with the canonical URL.
8. Update repo-root README.md: short "For new projects" subsection
   near the top of the adoption flow, pointing at "Dabbler: Copy
   adoption bootstrap prompt" as the recommended starting point.
   Cross-link to docs/adoption-bootstrap.md (relative) and to the
   public URL (absolute).
9. Build the extension: cd tools/dabbler-ai-orchestration && npm
   install && npx vsce package — produce dabbler-ai-orchestration-
   0.12.1.vsix. Confirm it builds without warnings on the new files.
10. Smoke test: build-level (sideload, command appears in palette
    with correct title) + runtime (run command, paste clipboard
    contents into a markdown buffer, confirm URL matches canonical
    URL exactly + prompt body matches spec sketch verbatim, curl
    URL once more for 200 OK).
11. End-of-session cross-provider verification (THIS IS THAT).
12. Commit, push, run close_session.py (writes change-log.md for set).

**Configuration:** requiresUAT: false, requiresE2E: false,
outsourceMode: first.

**Spec sketch of the clipboard prompt:**

    Read https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md and follow it for this workspace.

    Gather all decisions in dialog with me first. Don't write any files until you've shown me a numbered checklist of what you plan to do and I've approved it. I can interrupt at any time.

The prompt deliberately does NOT mention "session sets," "ai-router,"
"branches," "outsource modes," or any dabbler internals — the
canonical doc covers those. The prompt is the smallest possible
orientation hop. The "checklist before writes" instruction is
load-bearing.
```

---

## Full content of the new command file `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`

```typescript
import * as vscode from "vscode";

const ADOPTION_BOOTSTRAP_PROMPT = `Read https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md and follow it for this workspace.

Gather all decisions in dialog with me first. Don't write any files until you've shown me a numbered checklist of what you plan to do and I've approved it. I can interrupt at any time.`;

export function registerCopyAdoptionBootstrapPromptCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copyAdoptionBootstrapPrompt",
      async () => {
        await vscode.env.clipboard.writeText(ADOPTION_BOOTSTRAP_PROMPT);
        vscode.window.showInformationMessage(
          "Copied. Paste into any AI chat (Claude Code / Gemini / GPT) and the AI will take over.",
        );
      },
    ),
  );
}
```

---

## Diff: `tools/dabbler-ai-orchestration/src/extension.ts`

```diff
 import { registerGitScaffoldCommand } from "./commands/gitScaffold";
+import { registerCopyAdoptionBootstrapPromptCommand } from "./commands/copyAdoptionBootstrapPrompt";
 import { registerTroubleshootCommand } from "./commands/troubleshoot";
 ...
   registerGitScaffoldCommand(context);
+  registerCopyAdoptionBootstrapPromptCommand(context);
   registerTroubleshootCommand(context);
```

---

## Diff: `tools/dabbler-ai-orchestration/package.json`

```diff
   "displayName": "Dabbler AI Orchestration",
-  "description": "Project wizard, session-set explorer, and cost dashboard for the Dabbler AI-led workflow.",
-  "version": "0.12.0",
+  "description": "Project wizard, session-set explorer, cost dashboard, and adoption-bootstrap entry point for the Dabbler AI-led workflow.",
+  "version": "0.12.1",
   "publisher": "DarndestDabbler",
   ...
   "categories": ["Other", "AI", "SCM Providers"],
-  "keywords": ["ai", "workflow", "session", "claude", "orchestration", "dabbler"],
+  "keywords": ["ai", "workflow", "session", "claude", "orchestration", "dabbler", "adoption", "bootstrap", "onboarding"],
   ...
       {
         "command": "dabbler.getStarted",
         "title": "Get Started",
         "category": "Dabbler",
         "icon": "$(star)"
       },
+      {
+        "command": "dabbler.copyAdoptionBootstrapPrompt",
+        "title": "Copy adoption bootstrap prompt",
+        "category": "Dabbler"
+      },
       {
         "command": "dabbler.setupNewProject",
```

---

## Diff: `tools/dabbler-ai-orchestration/CHANGELOG.md`

```diff
 ## [Unreleased]

+## [0.12.1] — 2026-05-04
+
+### Added
+- `Dabbler: Copy adoption bootstrap prompt` command. Copies a short
+  prompt to the clipboard that points an arbitrary AI assistant
+  (Claude Code, Gemini Code Assist, GPT-based tools) at the canonical
+  online instructions at
+  [docs/adoption-bootstrap.md](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md).
+  The pasted prompt instructs the AI to gather all decisions in dialog
+  with the human, then present a numbered checklist of intended writes
+  and configs for batch approval before executing — no per-write
+  confirmation prompts. The canonical doc is engine-agnostic
+  (capabilities-term tools, no Claude-specific tool names) and runs a
+  9-step interactive flow: detect VS Code state, fast-path detection,
+  in-flow education, **budget-threshold dialog with four tiers**
+  (zero / less than ~$20 / $20–$99 / $100+, mapping to verification
+  modes from manual-via-other-engine through outsource-first with full
+  API automation), plan alignment, action checklist, execute, and
+  closing pointers (budget monitoring, cost dashboard, more-info
+  links, next-session trigger phrase).
+- `adoption`, `bootstrap`, `onboarding` keywords for Marketplace
+  search.
+- Extension description now mentions the bootstrap entry point.
+
+### Notes
+- This is a single new top-level command with no logic changes to any
+  existing command — version bump is a patch (0.12.0 → 0.12.1). The
+  next release (Set 012 Session 2's planned Marketplace publish) will
+  bump 0.12.1 → 0.13.0.
+- This release ships the file format for `ai_router/budget.yaml`
+  (documented in the canonical doc) but does not yet enforce
+  thresholds or warn on approaching spend — automated enforcement is
+  a follow-up set. The bootstrap flow tells the human that monitoring
+  is currently manual via `python -m ai_router.report --since
+  YYYY-MM-DD` and the cost dashboard.
+
 ## [0.11.0] — 2026-04-30
```

---

## Diff: `tools/dabbler-ai-orchestration/README.md` (extension README)

```diff
 ## Features

+### Adoption bootstrap (`Dabbler: Copy adoption bootstrap prompt`)
+
+The single recommended starting point for any new project. Copies a short prompt to the clipboard that you paste into a fresh AI chat — Claude Code, Gemini Code Assist, GPT-based tools, all work. The pasted prompt points the AI at the canonical online instructions at [docs/adoption-bootstrap.md](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md), which orient the AI to detect your workspace state, run a budget-threshold dialog (zero / less than $20 / $20–$99 / $100+ tiers), propose a session-set decomposition, and then present a numbered checklist of every intended write/config/scaffolding action for batch approval before executing. No per-write prompts; you can interrupt at any time. The doc is engine-agnostic by construction — it describes tools in capability terms ("fetch a URL," "list files matching a pattern") rather than Claude-specific function names. After the AI completes its checklist, the rest of the workflow uses the existing wizard, session-set explorer, and cost dashboard documented below.
+
 ### Session Set Explorer
```

---

## Diff: repo-root `README.md`

```diff
 - [Installing the VS Code extension (the reliable way)](#installing-the-vs-code-extension-the-reliable-way)
+- [For new projects: adoption bootstrap](#for-new-projects-adoption-bootstrap)
 - [Adopting `ai_router` in a project](#adopting-ai_router-in-a-project)
 ...
+## For new projects: adoption bootstrap
+
+If you're starting a new project — greenfield, an existing local
+project that hasn't yet adopted the workflow, or a remote repo you
+want to clone in — the recommended starting point is **`Dabbler: Copy
+adoption bootstrap prompt`** from the command palette. The command
+copies a short prompt to your clipboard that you paste into a fresh
+AI chat (Claude Code, Gemini Code Assist, or any GPT-based tool —
+the prompt is engine-agnostic). The AI then fetches the canonical
+online instructions at
+[docs/adoption-bootstrap.md](docs/adoption-bootstrap.md)
+([raw URL](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md))
+and runs a 9-step interactive flow: detect your workspace state, run
+a budget-threshold dialog (zero / less than $20 / $20–$99 / $100+
+tiers, mapping to verification modes from manual-via-other-engine
+through outsource-first with full API automation), propose a
+session-set decomposition, and present a numbered checklist of every
+intended write / config / scaffolding action for batch approval
+before executing. No per-write prompts; you can interrupt at any
+time. The four-tier budget mapping is documented in
+[docs/ai-led-session-workflow.md → Cost-budgeted verification modes](docs/ai-led-session-workflow.md#cost-budgeted-verification-modes).
+
+This entry point sits *before* the **Adopting `ai_router`** section
+below — the bootstrap flow installs the router, scaffolds the
+folders, authors `docs/planning/project-plan.md` and your first
+session-set specs, and saves your budget threshold to
+`ai_router/budget.yaml` as part of its action checklist. If you
+already have a plan in hand, the bootstrap flow detects it (Step 2
+fast-path) and offers to skip the discovery dialog.
+
+---
+
 ## Adopting `ai_router` in a project
```

---

## VSIX manifest summary (extracted from the produced 0.12.1.vsix)

```
version: 0.12.1
description: Project wizard, session-set explorer, cost dashboard, and adoption-bootstrap entry point for the Dabbler AI-led workflow.
keywords: ['ai', 'workflow', 'session', 'claude', 'orchestration', 'dabbler', 'adoption', 'bootstrap', 'onboarding']

new command entry in contributes.commands:
[
  {
    "command": "dabbler.copyAdoptionBootstrapPrompt",
    "title": "Copy adoption bootstrap prompt",
    "category": "Dabbler"
  }
]

bundled extension/dist/extension.js (285,149 bytes):
  - 7888: // src/commands/copyAdoptionBootstrapPrompt.ts
  - 7890: var ADOPTION_BOOTSTRAP_PROMPT = `Read https://raw.githubusercontent.com/...`
  - 7896: "dabbler.copyAdoptionBootstrapPrompt",
```

## Smoke-test results (already executed by the orchestrator)

- `npm run compile && npx vsce package` produced
  `dabbler-ai-orchestration-0.12.1.vsix` (18 files, 331 KB) with no
  warnings on the new files.
- VSIX manifest `version`, `description`, `keywords`, and the new
  `dabbler.copyAdoptionBootstrapPrompt` command entry are all present
  with the values listed above.
- The bundled extension.js includes the
  `copyAdoptionBootstrapPrompt.ts` source (esbuild does not minify
  per the project's esbuild.js config).
- Round-trip equality test: extracted the `ADOPTION_BOOTSTRAP_PROMPT`
  template literal from the source TS and compared byte-by-byte to
  the spec sketch — `MATCH`.
- `curl -sIL https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md` returns `HTTP/1.1 200 OK`, Content-Length 28879 bytes (matches what Session 1 published).

---

## What to verify

Please act as the cross-provider verifier. Apply the standard
session-verification template (return JSON
`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}` with each
issue carrying severity Critical/Major/Minor).

Specifically probe:

1. **Clipboard-string byte fidelity vs. the spec sketch.** Compare the
   `ADOPTION_BOOTSTRAP_PROMPT` template literal (in
   `copyAdoptionBootstrapPrompt.ts`, shown in full above) against the
   spec sketch (also shown above). Any drift — extra whitespace, a
   different smart quote, a different URL, a missing sentence — is a
   Critical issue. The spec calls this string "load-bearing."

2. **Command-id / title consistency across the three places it's
   referenced.** `package.json` `contributes.commands[].command`,
   `extension.ts` import + registration call, and the source file's
   `vscode.commands.registerCommand` argument. They must all agree
   on `dabbler.copyAdoptionBootstrapPrompt` as the id and
   `Copy adoption bootstrap prompt` as the title. Any mismatch is at
   least Major.

3. **Version bump rationale.** Adding a new top-level command — is
   patch (0.12.0 → 0.12.1) defensible, or should it be minor (0.12.0
   → 0.13.0)? The spec is explicit that 0.12.1 is the call. Flag if
   you disagree, but treat as Minor unless the bump shape will mislead
   downstream consumers.

4. **README cross-link correctness.** The repo-root README adds a
   "For new projects: adoption bootstrap" section that cross-links to
   `docs/adoption-bootstrap.md` (relative), the raw URL (absolute),
   and `docs/ai-led-session-workflow.md#cost-budgeted-verification-modes`
   (anchor). Are these all targets that exist? (Session 1 landed
   adoption-bootstrap.md and the workflow-doc section. The anchor slug
   should match the section heading "Cost-budgeted verification modes"
   per common Markdown anchor rules.)

5. **Internal consistency of the four-tier framing.** The repo-root
   README says "zero / less than $20 / $20–$99 / $100+", as does the
   CHANGELOG. The extension README compresses the framing to "zero /
   less than $20 / $20–$99 / $100+" too. The Session 1 canonical doc
   uses the same four tiers. Any tier-name drift between these
   surfaces and the canonical doc is at least Minor.

6. **The "no per-write prompts" framing.** The clipboard prompt says
   "Don't write any files until you've shown me a numbered checklist
   of what you plan to do and I've approved it." Both READMEs and
   the CHANGELOG explain this in their own words. Are those
   explanations faithful to the actual wording, or does any of them
   suggest a stronger / weaker guarantee than the prompt itself?

7. **README placement & ordering.** Repo-root README puts the new
   "For new projects" section *after* "Installing the VS Code
   extension" and *before* "Adopting ai_router in a project". The
   logic is: install the extension first (since the bootstrap command
   ships with it), then run the bootstrap (which itself installs
   ai-router as one of its checklist items). Does this ordering hold
   up, or does it surprise a new reader?

8. **CHANGELOG accuracy.** The v0.12.1 entry mentions "budget-driven
   mode philosophy" and a "9-step interactive flow." Are these
   accurate descriptions of what shipped in Session 1's canonical
   doc, or do they over-promise? Note that no enforcement code
   shipped in this set — the CHANGELOG's `### Notes` block says so
   explicitly. Verify that.

9. **VSIX completeness.** The build summary lists 18 files. The
   bundled `dist/extension.js` is 285 KB and contains the new
   command's source (esbuild bundles, doesn't minify). The
   `package.json` inside the VSIX matches the source `package.json`
   on the new keys. Does the produced VSIX appear complete for the
   purpose of the smoke test?

10. **Anything else the spec called out.** The spec's Session 2
    cross-provider-verification step lists five probes (clipboard
    fidelity, extension wiring, version bump rationale, README
    cross-links, VSIX completeness). Confirm each is covered above
    and flag anything specific to those probes that you'd want to
    see addressed.

Return your verdict in the standard JSON shape.
