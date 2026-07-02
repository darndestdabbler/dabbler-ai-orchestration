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
import {
  readVerificationModeMarker,
  resolveDurableTier,
} from "../utils/tierMarkerStore";
import { VerificationMode } from "../types";

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
function sampleContext(
  tier: Tier,
  verificationMode: VerificationMode = "out-of-band-or-none",
): BootstrapContext {
  return {
    repoName: "example-app",
    setTitle: "Example feature",
    purpose: "A worked example — replace with the real set's purpose.",
    slug: "001-example-feature",
    created: "2026-01-01",
    tier,
    verificationMode,
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
/**
 * Set 077 S2 (Feature 1, A1): where the resolved tier came from, so the
 * prompt's guidance line can only claim what is actually true — a
 * marker/form tier is "the operator selected"; an inferred tier is
 * hedged; an unknown tier never masquerades as a selection.
 */
export type SessionGenTierSource = "form" | "marker" | "inference";

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
   * The tier the exemplars and guidance render with. Set 077 S2
   * (Feature 1): the form's rider, when present, wins — the radio is
   * itself durable-seeded from the ``.dabbler/tier`` marker on every
   * webview load, so the rider already embodies the marker-first
   * precedence plus any explicit later flip. When no rider reached the
   * caller (the bare palette command), {@link copySessionSetGenPrompt}
   * resolves the durable chain (marker → router-config inference).
   * Absent only when neither yields a value (an unscaffolded repo via
   * the palette) — in that case the exemplars render Full FOR
   * ILLUSTRATION and the guidance says so explicitly instead of
   * silently steering the planner to Full (the pre-077 ``?? "full"``
   * leak, A1).
   */
  tier?: Tier;
  /** How {@link tier} was resolved; ignored when ``tier`` is absent. */
  tierSource?: SessionGenTierSource;
  /**
   * Set 077 S3 (Feature 2): the operator's Lightweight verification-mode
   * pick — the three-way choice's second dimension. When the tier is
   * Lightweight, the worked exemplar's ``verificationMode:`` renders
   * this value and a guidance line steers the planner to declare it on
   * each generated set. Ignored on Full (the field is inert there; the
   * exemplar keeps the documented default). Resolution mirrors ``tier``:
   * the form rider wins; the riderless palette path falls back to the
   * durable ``.dabbler/verification-mode`` marker.
   */
  verificationMode?: VerificationMode;
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
  // Set 077 S2 (A1): a worked exemplar needs SOME concrete tier, but the
  // tier-less render is no longer a silent Full steer — the guidance
  // below names the exemplar's tier as illustrative-only in that case.
  const exemplarTier: Tier = options.tier ?? "full";
  // Set 077 S3 (Feature 2): the exemplar's verificationMode renders the
  // operator's pick on Lightweight only — the field is inert on Full,
  // so a Full exemplar always shows the documented default.
  const exemplarMode: VerificationMode =
    exemplarTier === "lightweight" && options.verificationMode
      ? options.verificationMode
      : "out-of-band-or-none";
  const ctx = sampleContext(exemplarTier, exemplarMode);
  const exampleSpec = renderSpec(bundle, ctx);
  const exampleState = renderSessionState(bundle, ctx);
  const parallelGuidance = options.parallel ? PARALLEL_GUIDANCE : "";
  // Set 077 S3 (Feature 2): when the operator chose dedicated
  // verification sessions, say so — otherwise the planner has no reason
  // to deviate from the schema default the hard-requirements block
  // names. The default pick emits no extra line (the exemplar already
  // shows it).
  const modeGuidance =
    exemplarTier === "lightweight" && exemplarMode === "dedicated-sessions"
      ? `- **Verification mode.** The operator selected **dedicated verification sessions**
  for this project — author each Lightweight set with \`verificationMode:
  dedicated-sessions\` unless the project plan explicitly calls for a different mode
  on a specific set.
`
      : "";
  // Set 077 S2 (A1): the guidance line claims only what the resolution
  // source supports. "The operator selected" is emitted ONLY for a
  // recorded choice (form radio or durable marker); an inferred tier is
  // hedged; no recorded choice at all is stated outright so the planner
  // never fabricates a selection rationale.
  let tierGuidance: string;
  if (options.tier && options.tierSource !== "inference") {
    tierGuidance = `- **Tier.** The operator selected the **${options.tier}** tier for this
  project — author each new set with \`tier: ${options.tier}\` unless the project plan
  explicitly calls for a different tier on a specific set.
`;
  } else if (options.tier) {
    tierGuidance = `- **Tier.** This workspace is set up for the **${options.tier}** tier
  (inferred from the workspace's router configuration) — author each new set with
  \`tier: ${options.tier}\` unless the project plan explicitly calls for a different
  tier on a specific set.
`;
  } else {
    tierGuidance = `- **Tier.** No tier choice is recorded in this workspace. The worked
  example above uses \`tier: full\` for illustration only — do NOT treat it as the
  operator's selection. Choose each set's tier (\`full\` | \`lightweight\`) from the
  project plan, per the tier-model SSoT linked above.
`;
  }

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
${tierGuidance}${modeGuidance}${parallelGuidance}
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

  // Set 077 S2 (Feature 1, A1): the pre-077 code trusted the volatile
  // radio alone, so a webview reload silently rendered Full exemplars
  // over a scaffolded Lightweight choice (the Set 076 incident). The
  // radio itself is now durable-seeded on every webview load (client.js
  // applies the `.dabbler/tier` marker before the first paint), so a
  // PRESENT rider already embodies the marker-first precedence plus any
  // explicit later flip — contradicting it here would silently discard
  // fresh operator intent (S2 review, Major 1) or let a weaker
  // inference outrank an explicit pick (S2 review, Minor 3). The
  // durable resolution therefore fills only the riderless path (the
  // bare palette command), which pre-077 always rendered Full.
  const durable = options.tier === undefined ? resolveDurableTier(root) : null;
  // Set 077 S3 (Feature 2): the verification mode resolves the same way
  // — a present form rider wins (the radios are themselves seeded from
  // the durable marker on every webview load); the riderless palette
  // path reads the `.dabbler/verification-mode` marker directly. Only
  // meaningful when the resolved tier is Lightweight; buildSessionGen-
  // Prompt ignores it otherwise.
  const resolvedTier = options.tier ?? durable?.tier;
  const durableMode =
    options.verificationMode === undefined && resolvedTier === "lightweight"
      ? readVerificationModeMarker(root)
      : null;
  const resolved: SessionGenPromptOptions = {
    parallel: options.parallel,
    tier: resolvedTier,
    tierSource: options.tier ? "form" : durable?.source,
    verificationMode: options.verificationMode ?? durableMode ?? undefined,
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
    })
  );
}
