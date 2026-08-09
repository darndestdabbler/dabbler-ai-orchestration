import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  BootstrapContext,
  TemplateBundle,
  loadTemplateBundle,
  renderSessionState,
  renderSpec,
  resolveBundledTemplateDir,
} from "../utils/consumerBootstrap";
import { modulePlanRelPath, pickModuleForAuthoring } from "../utils/moduleAuthoring";

const PLAN_PATH = path.join("docs", "planning", "project-plan.md");

// Forward-slashed form for use inside the prompt text (the reading
// assistant resolves it against the workspace root on any platform).
const PLAN_REL_POSIX = "docs/planning/project-plan.md";

/**
 * Concrete sample context used to render the prompt's worked exemplars.
 * A 3-session set exercises the session-expansion path (so the AI is
 * shown three numbered blocks / objects, not the bundle's two-block
 * illustrative sample) and a fixed slug/date keeps the prompt
 * deterministic for the test suite.
 */
function sampleContext(moduleSlug?: string): BootstrapContext {
  return {
    repoName: "example-app",
    setTitle: "Example feature",
    purpose: "A worked example — replace with the real set's purpose.",
    slug: "001-example-feature",
    created: "2026-01-01",
    totalSessions: 3,
    // Set 087 S3 (ruling Q2): a module-targeted decomposition renders the
    // module: line IN the exemplar (writer-rendered, so the prompt cannot
    // drift from what the shared writer emits); absent → no line at all.
    module: moduleSlug,
  };
}

/**
 * Build the session-set generation prompt from the canonical template
 * bundle (Set 058 S2). The prompt shows the AI fully WRITER-RENDERED
 * exemplars (via {@link renderSpec} / {@link renderSessionState}), not the
 * raw \`.template\` files — so it demonstrates the resolved, session-
 * expanded contract (schemaVersion 4, an ``NNN-`` prefixed slug, exactly
 * N session blocks / objects) rather than unresolved ``{{TOKEN}}`` placeholders and
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
   * When true, the copied prompt instructs the AI to decompose for
   * concurrency — independent sets, explicit ordering via the existing
   * ``prerequisites:`` spec field (no new schema), so any set without
   * prerequisites can run in parallel in its own git worktree.
   *
   * Set 094 S2 (verdict amendment 7): the "Create parallel session sets where
   * possible" form checkbox that used to set this (Set 060 S2 spec D4/D7) is
   * RETIRED. The sole live feeder is now the advanced
   * ``dabbler.generateParallelSessionSetPrompt`` Command-Palette command — the
   * escape hatch for the narrow multiple-branches-in-one-module case. The
   * primary decomposition paths (the palette ``generateSessionSetPrompt`` and
   * the Set 093 ``ai-sets`` row action) leave this unset, so ``PARALLEL_GUIDANCE``
   * never contaminates a normal prompt.
   */
  parallel?: boolean;
  /**
   * Set 087 S3 (ruling Q2): the module this decomposition targets, when
   * the workspace's ``docs/modules.yaml`` names one (auto-selected for a
   * single-module manifest; QuickPicked for two or more; absent for a
   * no-manifest repo — that prompt is byte-identical to pre-087).
   * ``slug`` is stamped as ``module: <slug>`` in the worked exemplar and
   * demanded by a hard-requirements line; ``planPath`` (repo-relative,
   * forward-slashed) replaces the repo-level plan reference.
   */
  module?: { slug: string; planPath: string };
}

// Set 094 S2 (verdict amendment 7): the parallel-session-sets UI is SHELVED —
// the "Create parallel session sets where possible" form checkbox is gone
// (Set 094 S1) and no primary path sets `parallel: true`. This block is now
// fed ONLY by the advanced escape hatch (the
// `dabbler.generateParallelSessionSetPrompt` Command-Palette command below,
// for the narrow multiple-branches-in-one-module case). The `prerequisites:`
// MACHINERY and the worktree tooling are untouched — shelving the UI is not
// removing the mechanism (routed ruling s2-parallel-and-d6-architecture.json
// Q1/Q2: 1a Command-Palette variant, not a sticky `parallelHint` setting that
// would silently contaminate the common decomposition path).
const PARALLEL_GUIDANCE = `- **Decompose for parallel execution.** You asked for parallel session sets
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
  const ctx = sampleContext(options.module?.slug);
  const exampleSpec = renderSpec(bundle, ctx);
  const exampleState = renderSessionState(bundle, ctx);
  const parallelGuidance = options.parallel ? PARALLEL_GUIDANCE : "";
  // Set 087 S3 (ruling Q2): a module-targeted decomposition adds a hard
  // requirement + a guidance line and reads the module's own plan; a
  // module-less render emits neither (byte-identical pre-087 prompt).
  const moduleRequirement = options.module
    ? `- **Module:** declare \`module: ${options.module.slug}\` in EVERY generated set's
  Session Set Configuration block, exactly as the worked example shows (the value is
  validated against \`docs/modules.yaml\`). \`module\` is a grouping attribute only —
  session-set names stay globally unique across ALL modules.
`
    : "";
  const moduleGuidance = options.module
    ? `- **Module.** This decomposition targets the **${options.module.slug}** module
  (declared in \`docs/modules.yaml\`). Stamp \`module: ${options.module.slug}\` in each
  generated set's configuration block. Recommended (not enforced): include the module
  slug in each set's name (e.g. \`00N-${options.module.slug}-<feature>\`) so names stay
  self-describing and collision-free across modules.
`
    : "";
  const planRefPosix = options.module?.planPath ?? PLAN_REL_POSIX;

  return `You are a session-set architect for an AI-led software development workflow (the Dabbler session-set workflow).

Given a project plan, decompose it into a sequence of session sets. Each session set is a
focused, independently deployable unit of work that one AI coding session can complete.

For EACH session set, scaffold a folder \`docs/session-sets/<NNN-slug>/\` containing a
\`spec.md\` AND a \`session-state.json\`, matching the worked examples below EXACTLY in shape.

## Hard requirements (do not deviate)

- **Slug:** \`NNN-kebab-title\` — a three-digit, zero-padded, monotonically increasing
  prefix then a kebab-case title (e.g. \`001-user-authentication\`, \`002-product-catalog\`).
  Never emit a bare (un-prefixed) slug.
- **One \`### Session K of N\` block per planned session** (progress keys keyed
  \`session-00K/\`), and **one object in the \`session-state.json\` \`sessions\` array per
  planned session** (\`"number": K\`, \`"title": "Session K"\`, all other fields at their
  not-started defaults).
- **\`session-state.json\`** MUST use \`"schemaVersion": 4\` and \`"status": "not-started"\`.
  Never emit the retired schemaVersion-2 state shape.
${moduleRequirement}

## Worked example — \`spec.md\` for a 3-session set (\`001-example-feature\`)

Match this shape; substitute your own title/purpose/slug and emit exactly one session
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
${moduleGuidance}${parallelGuidance}
---

## The project plan (read it from the workspace)

The authoritative input for this decomposition is the project plan at
\`${planRefPosix}\` in this workspace. Read that file directly — it is
intentionally NOT inlined here. Decompose the plan it describes into session
sets per the rules above.`;
}

/**
 * Build the decomposition prompt and copy it to the clipboard. Shared by
 * the `dabbler.generateSessionSetPrompt` command and the Set 093 `AI Sets`
 * row action. Returns true when a prompt was copied.
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
  pickOpts?: { preselectedSlug?: string },
): Promise<boolean> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showErrorMessage("No workspace folder is open.");
    return false;
  }

  // Set 087 S3 (ruling Q2): resolve the module target BEFORE the plan
  // check — a module-targeted decomposition reads the module's own plan
  // (manifest `planPath`, defaulting to docs/modules/<slug>/project-plan.md).
  // No-manifest repos resolve to "none" and keep today's flow unchanged;
  // an Esc on the picker cancels the whole copy (never a silent fallback
  // to the repo-level plan).
  //
  // Set 093 S2 (routed ruling D1): the `AI Sets` row/context action passes
  // `pickOpts.preselectedSlug` — the module is implied by the clicked row,
  // so NO QuickPick and NO auto-select notice fires (`""` → repo-level for a
  // pseudo row). The palette command passes nothing and keeps today's flow.
  const modulePick = await pickModuleForAuthoring(
    root,
    {
      showQuickPick: (items, opts) => vscode.window.showQuickPick(items, opts),
      showInformationMessage: (m) => vscode.window.showInformationMessage(m),
      showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    },
    pickOpts && pickOpts.preselectedSlug !== undefined
      ? { preselectedSlug: pickOpts.preselectedSlug }
      : undefined,
  );
  // S3 verification R1 + Set 093 S2 D1: a PRESENT-but-invalid manifest OR an
  // unresolvable preselected module aborts (the picker already showed the
  // error) — never the silent repo-level fallback.
  if (
    modulePick.kind === "cancelled" ||
    modulePick.kind === "invalid-manifest" ||
    modulePick.kind === "unknown-module"
  ) {
    return false;
  }
  const moduleOpt = modulePick.entry
    ? {
        slug: modulePick.entry.slug,
        planPath: modulePlanRelPath(modulePick.entry),
      }
    : undefined;

  const planRelPosix = moduleOpt?.planPath ?? PLAN_REL_POSIX;
  const planPath = path.join(root, ...planRelPosix.split("/"));
  if (!fs.existsSync(planPath)) {
    const action = await vscode.window.showWarningMessage(
      moduleOpt
        ? `No project plan found at ${planRelPosix} for module "${moduleOpt.slug}". ` +
            `Create it (the New Module command writes a stub) or import one first?`
        : `No project plan found at ${PLAN_PATH}. Import one first?`,
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

  const resolved: SessionGenPromptOptions = {
    parallel: options.parallel,
    module: moduleOpt,
  };

  const prompt = buildSessionGenPrompt(bundle, resolved);

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
    }),
    // Set 094 S2 (verdict amendment 7): the shelved parallel-sets UI's escape
    // hatch — the ONLY live feeder of `parallel: true`. A deliberate,
    // per-invocation Command-Palette variant for the narrow
    // multiple-branches-in-one-module case (routed ruling 1a, chosen over a
    // sticky `parallelHint` setting). The `prerequisites:` machinery + worktree
    // tooling it references are untouched — this is UI shelving, reversible.
    vscode.commands.registerCommand(
      "dabbler.generateParallelSessionSetPrompt",
      async () => {
        await copySessionSetGenPrompt(context, { parallel: true });
      },
    ),
  );
}
