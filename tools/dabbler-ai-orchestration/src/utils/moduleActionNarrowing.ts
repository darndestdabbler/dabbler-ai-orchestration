// Set 093 Session 2 (routed ruling D3): PURE narrowing of the untrusted
// `moduleAction` / `showModuleContextMenu` webview messages before the host
// dispatches them. The ruling is explicit: "Host narrows all three fields
// (action ∈ enum, kind ∈ {declared,pseudo,fallback}, slug: string); unknown
// ⇒ drop + log", with `moduleKind` an untrusted cross-check and stale /
// malformed targeting failing LOUD — never coerced to a repository-level
// default (the wrong-destination hazard this seam exists to prevent).
//
// A `fallback` row renders no strip, so a fallback message is a protocol
// error and is DROPPED here (returns null) rather than dispatched. Only
// `declared` (non-empty slug) and `pseudo` (empty slug) are actionable, and
// the (kind ⟺ slug-shape) invariant is enforced so a malformed pairing can
// never slip a repo-level default in behind a "declared" claim. No vscode
// import, so the contract is Layer-2 unit-testable.

export type ModuleActionId =
  | "ai-plan"
  | "import-plan"
  | "open-plan"
  | "ai-sets"
  | "assign-legacy";

/** The actionable module kinds (a `fallback` row exposes no actions). */
export type ActionableModuleKind = "declared" | "pseudo";

export interface NarrowedModuleIdentity {
  slug: string;
  kind: ActionableModuleKind;
}

export interface NarrowedModuleAction extends NarrowedModuleIdentity {
  action: ModuleActionId;
}

const MODULE_ACTIONS: ReadonlySet<string> = new Set([
  "ai-plan",
  "import-plan",
  "open-plan",
  "ai-sets",
  "assign-legacy",
]);

/**
 * Validate the module identity (kind + slug) an untrusted message carries.
 * Returns the narrowed identity, or null when the message must be dropped:
 * a non-string slug, a kind that is not exactly `declared`/`pseudo`
 * (`fallback` and unknown kinds drop), a `pseudo` whose slug is not `""`, or
 * a `declared` whose slug IS `""`. Never coerces — a malformed pairing is a
 * drop, not a repo-level fallback.
 */
export function narrowModuleIdentity(
  moduleSlug: unknown,
  moduleKind: unknown,
): NarrowedModuleIdentity | null {
  if (typeof moduleSlug !== "string") return null;
  if (moduleKind !== "declared" && moduleKind !== "pseudo") return null;
  if (moduleKind === "pseudo" && moduleSlug !== "") return null;
  if (moduleKind === "declared" && moduleSlug === "") return null;
  return { slug: moduleSlug, kind: moduleKind };
}

/**
 * Validate a full `moduleAction` message (action + identity). Returns the
 * narrowed action, or null when it must be dropped: an action outside the
 * closed enum, an identity that fails {@link narrowModuleIdentity}, or
 * `assign-legacy` on anything but the pseudo (empty-slug) module — the
 * `Assign legacy sets…` affordance rides `Unassigned` alone.
 */
export function narrowModuleAction(
  action: unknown,
  moduleSlug: unknown,
  moduleKind: unknown,
): NarrowedModuleAction | null {
  if (typeof action !== "string" || !MODULE_ACTIONS.has(action)) return null;
  const identity = narrowModuleIdentity(moduleSlug, moduleKind);
  if (!identity) return null;
  if (action === "assign-legacy" && identity.kind !== "pseudo") return null;
  return { action: action as ModuleActionId, slug: identity.slug, kind: identity.kind };
}

/**
 * The side-effectful surface a narrowed module action dispatches into — the
 * four authoring flows (each carrying the module's `preselectedSlug` so no
 * QuickPick / notice fires) plus the assign-legacy flow and a view refresh.
 * Injectable so the strip→handler WIRING is Layer-2 testable (Set 093 S2
 * verification R3): the host binds these to the real handlers.
 * `importPlan` / `assignLegacy` return whether they mutated the workspace so
 * the dispatcher can refresh only on a real change.
 */
export interface ModuleActionExec {
  aiPlan(preselectedSlug: string): Promise<void>;
  importPlan(preselectedSlug: string): Promise<boolean>;
  openPlan(preselectedSlug: string): Promise<void>;
  aiSets(preselectedSlug: string): Promise<void>;
  assignLegacy(): Promise<boolean>;
  refresh(): void;
}

/**
 * Execute a NARROWED module action against the injected handlers — the one
 * dispatch mapping shared by the row strip and the context menu. Each of the
 * four authoring actions threads the narrowed slug as its `preselectedSlug`
 * (`""` → repo-level for a pseudo row); `assign-legacy` and a successful
 * `import-plan` refresh the view. Kept pure of vscode so the mapping is
 * unit-tested without a webview (routed ruling D3; verification R3).
 */
export async function dispatchModuleAction(
  narrowed: NarrowedModuleAction,
  exec: ModuleActionExec,
): Promise<void> {
  switch (narrowed.action) {
    case "assign-legacy": {
      if (await exec.assignLegacy()) exec.refresh();
      return;
    }
    case "ai-plan":
      await exec.aiPlan(narrowed.slug);
      return;
    case "import-plan": {
      if (await exec.importPlan(narrowed.slug)) exec.refresh();
      return;
    }
    case "open-plan":
      await exec.openPlan(narrowed.slug);
      return;
    case "ai-sets":
      await exec.aiSets(narrowed.slug);
      return;
  }
}
