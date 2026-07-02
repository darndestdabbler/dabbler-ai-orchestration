import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  BootstrapContext,
  TemplateBundle,
  Tier,
  loadTemplateBundle,
  renderSessionState,
  renderSpec,
  resolveBundledTemplateDir,
} from "../utils/consumerBootstrap";

const PLAN_PATH = path.join("docs", "planning", "project-plan.md");

// Forward-slashed form for use inside the prompt text (the reading
// assistant resolves it against the workspace root on any platform).
const PLAN_REL_POSIX = "docs/planning/project-plan.md";

/**
 * Concrete sample context used to render the prompt's worked exemplars.
 * A 3-session set exercises the session-expansion path (so the AI is
 * shown three numbered blocks / objects, not the bundle's two-block
 * illustrative sample) and a fixed slug/date keeps the prompt
 * deterministic for the test suite. The tier defaults to FULL and is
 * overridden by {@link SessionGenPromptOptions.tier} (Set 060 S4) so a
 * Lightweight operator's exemplars steer the planner to Lightweight sets.
 */
function sampleContext(tier: Tier): BootstrapContext {
  return {
    repoName: "example-app",
    setTitle: "Example feature",
    purpose: "A worked example — replace with the real set's purpose.",
    slug: "001-example-feature",
    created: "2026-01-01",
    tier,
    verificationMode: "out-of-band-or-none",
    totalSessions: 3,
  };
}

/**
 * Build the session-set generation prompt from the canonical template
 * bundle (Set 058 S2). The prompt shows the AI fully WRITER-RENDERED
 * exemplars (via {@link renderSpec} / {@link renderSessionState}), not the
 * raw \`.template\` files — so it demonstrates the resolved, session-
 * expanded contract (schemaVersion 4, an ``NNN-`` prefixed slug, the
 * required ``tier`` + ``verificationMode`` fields, exactly N session
 * blocks / objects) rather than unresolved ``{{TOKEN}}`` placeholders and
 * the bundle's illustrative two-block sample. The shared writer is the
 * single source of truth, so the prompt cannot drift from what the wizard
 * / scaffolder emit.
 *
 * Exemplars are fenced with ``~~~~`` so the spec's own inner ``` ```yaml ```
 * fence does not collide with the outer fence.
 *
 * Pure so the test suite can assert the prompt carries the canonical,
 * expanded shape (and never the retired schemaVersion-2 / bare-slug form).
 */
export interface SessionGenPromptOptions {
  /**
   * Set 060 S2 (spec D4/D7): when the operator checks "Create parallel
   * session sets where possible", the copied prompt instructs the AI to
   * decompose for concurrency — independent sets, explicit ordering via
   * the existing ``prerequisites:`` spec field (no new schema), so any
   * set without prerequisites can run in parallel in its own git
   * worktree.
   */
  parallel?: boolean;
  /**
   * Set 060 S4 (operator UAT feedback): the tier the operator selected
   * in the Getting Started form's radio. When set, the worked exemplars
   * render with that tier and the prompt tells the planner to author new
   * sets on it unless the plan says otherwise. Absent (the bare
   * ``dabbler.generateSessionSetPrompt`` palette command, which has no
   * radio) the exemplars stay Full and the guidance stays generic.
   */
  tier?: Tier;
}

const PARALLEL_GUIDANCE = `- **Decompose for parallel execution.** The operator asked for parallel session sets
  where possible: the orchestration runs independent session sets concurrently in
  separate git worktrees, merged back to the main branch when the sets complete.
  Minimize cross-set dependencies; when one set genuinely must follow another,
  declare that explicitly with a \`prerequisites:\` entry in the dependent set's
  Session Set Configuration block (slug + \`condition: complete\`). Any set with no
  \`prerequisites:\` is treated as safe to start in parallel.
`;

export function buildSessionGenPrompt(
  bundle: TemplateBundle,
  options: SessionGenPromptOptions = {},
): string {
  const exemplarTier: Tier = options.tier ?? "full";
  const ctx = sampleContext(exemplarTier);
  const exampleSpec = renderSpec(bundle, ctx);
  const exampleState = renderSessionState(bundle, ctx);
  const parallelGuidance = options.parallel ? PARALLEL_GUIDANCE : "";
  const tierGuidance = options.tier
    ? `- **Tier.** The operator selected the **${options.tier}** tier in the Getting Started
  form — author each new set with \`tier: ${options.tier}\` unless the project plan
  explicitly calls for a different tier on a specific set.
`
    : "";

  return `You are a session-set architect for an AI-led software development workflow (the Dabbler session-set workflow).

Given a project plan, decompose it into a sequence of session sets. Each session set is a
focused, independently deployable unit of work that one AI coding session can complete.

For EACH session set, scaffold a folder \`docs/session-sets/<NNN-slug>/\` containing a
\`spec.md\` AND a \`session-state.json\`, matching the worked examples below EXACTLY in shape.

## Hard requirements (do not deviate)

- **Slug:** \`NNN-kebab-title\` — a three-digit, zero-padded, monotonically increasing
  prefix then a kebab-case title (e.g. \`001-user-authentication\`, \`002-product-catalog\`).
  Never emit a bare (un-prefixed) slug.
- **\`spec.md\` Session Set Configuration block** MUST declare \`tier\` (\`full\` |
  \`lightweight\`) and \`verificationMode\` (\`out-of-band-or-none\` default, or
  \`dedicated-sessions\`; inert on Full). The tier model is defined once, in the SSoT —
  do NOT restate it in the spec:
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.
- **One \`### Session K of N\` block per planned session** (progress keys keyed
  \`session-00K/\`), and **one object in the \`session-state.json\` \`sessions\` array per
  planned session** (\`"number": K\`, \`"title": "Session K"\`, all other fields at their
  not-started defaults).
- **\`session-state.json\`** MUST use \`"schemaVersion": 4\` and \`"status": "not-started"\`.
  Never emit the retired schemaVersion-2 state shape.

## Worked example — \`spec.md\` for a 3-session ${exemplarTier === "lightweight" ? "Lightweight" : "Full"} set (\`001-example-feature\`)

Match this shape; substitute your own title/purpose/slug/tier and emit exactly one session
block per planned session:

~~~~markdown
${exampleSpec}
~~~~

## Worked example — its \`session-state.json\` (schemaVersion 4, three not-started sessions)

~~~~json
${exampleState}
~~~~

## Authoring guidance

- Order sets so earlier ones unblock later ones.
- Keep scope tight: prefer 2–4 sessions per set.
- Set \`requiresUAT: true\` only for user-visible features that need manual verification;
  when true, set \`uatStyle: dsl\` for web/browser UI (Playwright via dabbler-uat-dsl) or
  \`uatStyle: ad-hoc\` for non-web surfaces (CLI, native, Access, COM apps). Default ad-hoc.
- Set \`requiresE2E: true\` only if automated browser tests are relevant.
- Both tiers run the same Python lifecycle (\`start_session\` / \`close_session\`), state
  handling, and close-out. Lightweight is router-off, not Python-off — pick \`tier:
  lightweight\` when the project opts out of metered API calls.
${tierGuidance}${parallelGuidance}
---

## The project plan (read it from the workspace)

The authoritative input for this decomposition is the project plan at
\`${PLAN_REL_POSIX}\` in this workspace. Read that file directly — it is
intentionally NOT inlined here. Decompose the plan it describes into session
sets per the rules above.`;
}

/**
 * Build the decomposition prompt and copy it to the clipboard. Shared by
 * the `dabbler.generateSessionSetPrompt` command (no options) and the
 * Getting Started form's "Build session sets" action (which forwards the
 * parallel checkbox + tier radio, Set 060 S2/S4). Returns true when a
 * prompt was copied.
 *
 * Set 060 S4 (operator UAT feedback): the prompt REFERENCES the plan at
 * docs/planning/project-plan.md instead of inlining its full text — the
 * audience is a path-aware assistant opened in the workspace (the same
 * contract as the Set 048 copyable review prompts), and inlining made the
 * prompt hard for operators to read. The existence check below stays, so
 * the copied reference is never dangling.
 */
export async function copySessionSetGenPrompt(
  context: vscode.ExtensionContext,
  options: SessionGenPromptOptions = {},
): Promise<boolean> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showErrorMessage("No workspace folder is open.");
    return false;
  }

  const planPath = path.join(root, PLAN_PATH);
  if (!fs.existsSync(planPath)) {
    const action = await vscode.window.showWarningMessage(
      `No project plan found at ${PLAN_PATH}. Import one first?`,
      "Import Plan"
    );
    if (action === "Import Plan") void vscode.commands.executeCommand("dabbler.importPlan");
    return false;
  }

  let bundle: TemplateBundle;
  try {
    bundle = loadTemplateBundle(resolveBundledTemplateDir(context.extensionPath));
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Could not load the consumer-bootstrap template bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  const prompt = buildSessionGenPrompt(bundle, options);

  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(
    "Session-set generation prompt copied to clipboard. " +
    "Paste it into your AI assistant. When you receive the specs, save each one to " +
    "docs/session-sets/<NNN-slug>/spec.md (alongside its session-state.json).\n\n" +
    "Cost reminder: each session set typically costs $0.10–$2.00 depending on model and effort. " +
    "Review the generated specs before running all sessions.",
    { modal: false }
  );
  return true;
}

export function registerSessionGenPromptCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.generateSessionSetPrompt", async () => {
      await copySessionSetGenPrompt(context);
    })
  );
}
