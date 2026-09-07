// What the Solution Explorer says, decided without vscode so the unit suite
// can drive it.
//
// This file renders; it never decides. The projection is written by the
// router (`projection.ts`) from the module manifest and the sibling
// repositories' declarations, and every derived fact -- dependency order,
// who uses whom, whether a contract folder exists -- is derived there. Two
// implementations of one rule disagree eventually, and the disagreement
// surfaces as a row nobody can explain.

export interface ProjectionSolution {
  name: string;
  title: string;
  /** More than one module declared: the shape in which the module machinery is on. */
  multi: boolean;
  /** No manifest at all: the repository is taken to be the one module. */
  implicit: boolean;
  moduleCount: number;
}

/**
 * One module, as the manifest declares it and the router derives the rest.
 *
 * `usedBy` is derived from every other module's `dependsOn` and written
 * nowhere; `contractDir` is reported only when the tree has the folder and
 * the module declares a seam, so the Contract row can say "open" without
 * guessing.
 */
export interface ProjectionModule {
  slug: string;
  title: string;
  kind: string;
  package?: string | null;
  contract?: string | null;
  codeRoots: string[];
  dependsOn: string[];
  usedBy: string[];
  contractDir?: string | null;
}

export interface ProjectionExternal {
  id: string;
  producedBy: string;
  /**
   * The repositories that consume it, derived and never declared.
   *
   * A→B declared in A and B→C declared in B are two owner-specific facts, and
   * the row is the union of them. `usedBy` has one implementation in this
   * codebase and it is a reading of who consumes what -- which is exactly why
   * no declaration is allowed to state it.
   */
  usedBy?: string[];
  /**
   * What each consuming repository pins it to, and whose upgrade it is.
   *
   * Pin and drift live on the CONSUMER that owns them. A sibling's pin shown
   * beside this repository's name is upgrade guidance pointing at the wrong
   * repository, which is worse than no row.
   */
  pins?: {
    repository: string;
    version: string | null;
    drift?: string | null;
    driftKind?: "behind" | null;
  }[];
  pinned?: string | null;
  published?: string | null;
  resolve: string;
  feed?: string | null;
  root?: string | null;
  /**
   * The two ways the declaration names the same repository, beside `root`.
   *
   * "Not on this machine" is not one state. A known remote is a clone away
   * and needs nobody; a producer nothing has said anything about needs a
   * person to answer where it lives. A row that says only "absent" asks the
   * person in both cases, and offers them nothing to do in either.
   */
  remote?: string | null;
  declaredPath?: string | null;
  reason?: string | null;
  drift?: string | null;
  driftKind?: "behind" | "ahead" | "feed" | "split" | null;
}

/**
 * One repository in this solution, whether or not anything depends on it.
 *
 * It is here because its own declaration names this solution -- one home for
 * one fact, owned by the repository the fact is about. That is what makes
 * the upstream direction renderable without a second declared one: `provides`
 * is read from THIS repository's edges and `consumes` from that member's,
 * and neither is stated anywhere (D254).
 */
export interface ProjectionMember {
  id: string;
  self: boolean;
  root?: string | null;
  remote?: string | null;
  /** What this repository takes from that one. */
  provides: string[];
  /** What that one takes from this repository. */
  consumes: string[];
  /** It declares its membership and nothing else yet. */
  shell: boolean;
  reason?: string | null;
}

export interface Projection {
  solution: ProjectionSolution;
  /** In dependency order, as the router projects them. */
  modules: ProjectionModule[];
  external?: ProjectionExternal[];
  members?: ProjectionMember[];
}

/**
 * Which file the Contract row opens: the notes page inside the module's
 * contract folder, when the router reported the folder. The router derives
 * the folder; this only names the page inside it.
 */
export function contractTarget(m: ProjectionModule | undefined): string | undefined {
  if (!m || !m.contractDir) return undefined;
  return `${m.contractDir}/README.md`;
}

export type IconSpec = { id: string; tone?: "attention" | "done" | "muted" };

export type SolutionNode =
  | { kind: "solution" }
  | { kind: "module"; slug: string }
  | { kind: "contract"; slug: string }
  | { kind: "dependsOn"; slug: string }
  | { kind: "dependency"; slug: string; dependency: string }
  | { kind: "usedBy"; slug: string }
  | { kind: "consumer"; slug: string; consumer: string }
  | { kind: "externalGroup" }
  | { kind: "external"; id: string }
  | { kind: "externalUsedBy"; id: string }
  | { kind: "externalConsumer"; id: string; repository: string }
  | { kind: "memberGroup" }
  | { kind: "member"; id: string };

export interface RowDescriptor {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: IconSpec;
  /** Collapsed, never Expanded: the tree stays lazy. */
  expandable: boolean;
  contextValue?: string;
}

function find(p: Projection, slug: string): ProjectionModule | undefined {
  return p.modules.find((m) => m.slug === slug);
}

export function rootNodes(): SolutionNode[] {
  return [{ kind: "solution" }];
}

function externals(p: Projection): ProjectionExternal[] {
  return p.external ?? [];
}

function members(p: Projection): ProjectionMember[] {
  return p.members ?? [];
}

/** What the solution row says under its title when it has no module rows to show. */
export const NO_MODULES_YET = "no modules yet — session 1 writes the solution plan";

/** The document the tree renders, relative to a repository root. */
export const PROJECTION_RELPATH = ".dabbler/solution/projection.json";

/**
 * Every file whose change can change what this tree shows.
 *
 * The projection is DERIVED, and it is written by the commands that move a
 * declaration: `modules create`, the `deps` verbs that place a repository,
 * `bootstrap`, and the driver when a plan asks for one. Nothing rewrites it
 * when the declarations underneath it move by hand -- a module added to the
 * manifest in an editor, a sibling cloned, a version bumped in a build file
 * -- so the view spent a whole session showing what was true when the last
 * event was recorded.
 *
 * Watching only the projection cannot fix that: an event on a file nothing
 * rewrote re-reads the same bytes. These are the inputs, and a change to one
 * of them is what the tree re-derives on.
 *
 * Repository-relative glob patterns, because that is what the watcher takes:
 *
 * - `docs/modules.yaml` -- what this repository builds: every module row,
 *   the dependency order and who uses whom.
 * - `solution-dependencies.json` -- who produces what it consumes, and the
 *   membership rows, which come from nowhere else.
 * - the build files -- the PIN is read from them on every projection rather
 *   than copied, so the drift rows change when they do.
 *
 * The projection itself is deliberately absent: it is this list's output,
 * and re-deriving on it would be a loop.
 */
export const PROJECTION_SOURCE_GLOBS: readonly string[] = [
  "docs/modules.yaml",
  "solution-dependencies.json",
  "**/*.csproj",
  "**/pom.xml",
];

/** Where a producing repository is, as three states rather than two. */
export type ExternalLocation = "here" | "remote" | "unknown";

/**
 * The one rule that decides it, and the one the context values follow.
 *
 * `root` is where the repository is on THIS machine. Without one, a declared
 * remote is the difference between a clone away and a question for a person
 * -- and only the second is something nobody can act on alone. A single
 * "absent" collapsed the two and offered an action for neither.
 *
 * It takes the two fields rather than one row type because both row kinds
 * carry them and both are asked the same question. The producer rows under
 * "Consumed from other repositories" and the membership rows under "Solution
 * repositories" are two readings of one set of repositories, and a second
 * rule for the second list is how the same repository ends up offering Clone
 * in one place and nothing in the other.
 */
export function externalLocation(
  e: Pick<ProjectionExternal, "root" | "remote">,
): ExternalLocation {
  if (e.root) return "here";
  return e.remote ? "remote" : "unknown";
}

const LOCATION_CONTEXT: Record<ExternalLocation, string> = {
  here: "dabblerExternalHere",
  remote: "dabblerExternalRemote",
  unknown: "dabblerExternalUnknown",
};

/**
 * What the row says about a state that is not `here`.
 *
 * `unknown` covers two shapes and must not claim more than it knows: a
 * producer nothing has said anything about, and one whose declared path is
 * not there. The second was DECLARED -- wrongly, or on another machine --
 * and telling the reader nobody said where it lives sends them looking for
 * a declaration that already exists.
 */
function locationNote(e: ProjectionExternal, at: ExternalLocation): string {
  if (at === "here") return "";
  if (at === "remote") return "not cloned here";
  return e.declaredPath
    ? `declared at ${e.declaredPath}, which is not there`
    : "nobody has said where this lives";
}

export function childrenOf(node: SolutionNode, p: Projection): SolutionNode[] {
  switch (node.kind) {
    case "solution": {
      // The router's order is dependency order: a module after everything
      // it depends on, the application that composes the others last.
      const own: SolutionNode[] = p.modules.map((m) => ({
        kind: "module" as const,
        slug: m.slug,
      }));
      // Only when there is something to say. An empty folder is a row the
      // reader has to open to learn nothing.
      if (externals(p).length > 0) own.push({ kind: "externalGroup" });
      // The repositories, which is not the same list: a member nothing
      // consumes has no external row at all, and it is the one the operator
      // most needs to see -- the next repository the plan will need.
      if (members(p).length > 1) own.push({ kind: "memberGroup" });
      return own;
    }
    case "externalGroup":
      return externals(p).map((e) => ({ kind: "external" as const, id: e.id }));
    case "memberGroup":
      return members(p).map((m) => ({ kind: "member" as const, id: m.id }));
    case "external": {
      const e = externals(p).find((row) => row.id === node.id);
      // Whenever there is a pin to show. A sibling-owned edge has one
      // consumer and a version that belongs to it, and hiding the row was
      // how that version stopped being rendered at all.
      return (e?.pins?.length ?? 0) > 0 || (e?.usedBy?.length ?? 0) > 1
        ? [{ kind: "externalUsedBy" as const, id: node.id }]
        : [];
    }
    case "externalUsedBy": {
      const e = externals(p).find((row) => row.id === node.id);
      return (e?.pins ?? []).map((pin) => ({
        kind: "externalConsumer" as const,
        id: node.id,
        repository: pin.repository,
      })).concat((e?.pins?.length ?? 0) > 0 ? [] : (e?.usedBy ?? []).map((repository) => ({
        kind: "externalConsumer" as const,
        id: node.id,
        repository,
      })));
    }
    case "module": {
      const m = find(p, node.slug);
      if (!m) return [];
      const out: SolutionNode[] = [];
      // Each child only when there is something to say. A single-module
      // solution -- the repository as the module, no seam declared -- shows
      // one row and nothing under it, which is the shape in which nothing
      // module-shaped has switched on.
      if (m.contract) out.push({ kind: "contract", slug: m.slug });
      if (m.dependsOn.length > 0) out.push({ kind: "dependsOn", slug: m.slug });
      if (m.usedBy.length > 0) out.push({ kind: "usedBy", slug: m.slug });
      return out;
    }
    case "dependsOn": {
      const m = find(p, node.slug);
      if (!m) return [];
      return m.dependsOn.map((dependency) => ({
        kind: "dependency" as const,
        slug: node.slug,
        dependency,
      }));
    }
    case "usedBy": {
      const m = find(p, node.slug);
      if (!m) return [];
      return m.usedBy.map((consumer) => ({
        kind: "consumer" as const,
        slug: node.slug,
        consumer,
      }));
    }
    default:
      return [];
  }
}

const KIND_ICONS: Record<string, string> = {
  application: "layers",
  "shared-types": "symbol-structure",
  library: "package",
};

export function descriptorFor(
  node: SolutionNode,
  p: Projection,
): RowDescriptor {
  switch (node.kind) {
    case "solution": {
      const s = p.solution;
      const count = p.modules.length;
      return {
        id: `solution:${s.name}`,
        label: s.title,
        description:
          count === 0 ? NO_MODULES_YET : s.multi ? `${count} modules` : "one module",
        tooltip:
          count === 0
            ? "Nothing is declared yet. Session 1 writes the solution plan, and the " +
              "modules appear here from docs/modules.yaml."
            : s.multi
              ? "What this solution is built from, in dependency order."
              : "The repository is the module. A second entry in docs/modules.yaml is " +
                "what switches the module machinery on.",
        icon: { id: "project" },
        expandable: true,
        contextValue: "dabblerSolution",
      };
    }
    case "module": {
      const m = find(p, node.slug);
      if (!m) {
        return { id: `module:${node.slug}`, label: node.slug, expandable: false };
      }
      const bits: string[] = [m.kind];
      bits.push(m.package ? `package: ${m.package}` : "no package");
      return {
        id: `module:${m.slug}`,
        label: m.slug,
        description: bits.join(" · "),
        tooltip: m.title,
        icon: { id: KIND_ICONS[m.kind] ?? "package" },
        expandable: childrenOf(node, p).length > 0,
        // `;focused` is what Open Module is gated on: only a module of a
        // multi-module solution has a focused checkout to open. A
        // single-module repository is its module, and this window is it.
        contextValue: `dabblerModule:${m.kind}${p.solution.multi ? ";focused" : ""}`,
      };
    }
    case "contract": {
      const m = find(p, node.slug);
      const has = Boolean(contractTarget(m));
      return {
        id: `contract:${node.slug}`,
        label: "Contract",
        description: has ? "open" : "not written yet",
        tooltip: has
          ? "What this module promises. Opens the notes page in an editor tab."
          : "No contract yet — what this module promises, once someone writes it " +
            "under modules/<slug>/contract/.",
        icon: { id: "file-text", tone: has ? undefined : "muted" },
        expandable: false,
        contextValue: has ? "dabblerContract" : "dabblerContractMissing",
      };
    }
    case "dependsOn": {
      const m = find(p, node.slug);
      const n = m ? m.dependsOn.length : 0;
      return {
        id: `dependsOn:${node.slug}`,
        label: "Depends on",
        description: `${n}`,
        tooltip: "What this module consumes, as its manifest entry declares.",
        icon: { id: "arrow-down" },
        expandable: n > 0,
      };
    }
    case "dependency":
      return {
        id: `dependency:${node.slug}:${node.dependency}`,
        label: node.dependency,
        icon: { id: "arrow-small-right", tone: "muted" },
        expandable: false,
      };
    case "usedBy": {
      const m = find(p, node.slug);
      const n = m ? m.usedBy.length : 0;
      return {
        id: `usedBy:${node.slug}`,
        label: "Used by",
        description: `${n}`,
        // The line nobody can get anywhere else, and the reason people are
        // willing to change a module instead of adding one beside it.
        // Derived from every other module's dependsOn, never declared.
        tooltip: "These break if this contract changes.",
        icon: { id: "references" },
        expandable: n > 0,
      };
    }
    case "consumer":
      return {
        id: `consumer:${node.slug}:${node.consumer}`,
        label: node.consumer,
        icon: { id: "arrow-small-right", tone: "muted" },
        expandable: false,
      };
    case "externalGroup": {
      const rows = externals(p);
      const drifting = rows.filter((e) => e.driftKind !== null && e.driftKind !== undefined);
      return {
        id: "external",
        label: "From other repositories",
        description: `${rows.length}`,
        tooltip:
          drifting.length > 0
            ? `${drifting.length} of them has something worth knowing about it.`
            : "What this repository takes from the rest of your solution.",
        icon: { id: "repo", tone: drifting.length > 0 ? "attention" : undefined },
        expandable: rows.length > 0,
      };
    }
    case "external": {
      const e = externals(p).find((row) => row.id === node.id);
      if (!e) return { id: `external:${node.id}`, label: node.id, expandable: false };
      const bits: string[] = [];
      // A pin only when every consumer agrees on it. Collapsing two pins into
      // one number tells a reader to upgrade a repository already there.
      if (e.pinned) bits.push(`v${e.pinned}`);
      else if (e.driftKind === "split") bits.push("split versions");
      bits.push(e.producedBy);
      if (e.resolve === "source") bits.push("from source");
      // The line the 2026-08-23 direction sketched and nothing has rendered.
      if (e.driftKind === "behind" && e.published) {
        bits.push(`⚠ ${e.published} is out`);
      } else if (e.driftKind === "split") {
        bits.push("⚠ two versions in this solution");
      } else if (e.driftKind === "feed") {
        bits.push("⚠ feed not configured");
      } else if (e.driftKind === "ahead") {
        bits.push("their checkout is ahead");
      }
      const consumers = e.usedBy ?? [];
      if (consumers.length > 1) bits.push(`${consumers.length} consumers`);
      const hasPins = (e.pins?.length ?? 0) > 0;
      const location = externalLocation(e);
      if (location !== "here") bits.push(locationNote(e, location));
      return {
        id: `external:${e.id}`,
        label: e.id,
        description: bits.join(" · "),
        tooltip:
          e.drift ||
          (location === "remote"
            ? `${e.producedBy} is at ${e.remote}, and no checkout of it is on this machine.`
            : location === "unknown"
              ? e.declaredPath
                ? `${e.producedBy} is declared at ${e.declaredPath}, and there is no ` +
                  "repository there — point at the folder you do have, give it a remote, " +
                  "or create it."
                : `${e.producedBy} builds this, and nothing says where it lives — ` +
                  "give it a remote, point at a folder, or create it."
              : "") ||
          e.reason ||
          `Built by ${e.producedBy}.`,
        icon: {
          id: "package",
          // Muted, not attention: a repository nobody has cloned is a state
          // of this laptop and not a defect in the declaration. Attention is
          // kept for the things somebody has to act on.
          tone: e.driftKind === "behind" || e.driftKind === "feed" || e.driftKind === "split"
            ? "attention"
            : location === "here"
              ? undefined
              : "muted",
        },
        expandable: hasPins || consumers.length > 1,
        // The context value gates the menu, and it is three-valued for the
        // same reason the state is: a repository nobody has cloned has
        // nowhere to open, and one nobody has placed cannot even be cloned.
        // A menu entry that fails when it is used costs more trust than one
        // that is not there.
        contextValue: LOCATION_CONTEXT[location],
      };
    }
    case "externalUsedBy": {
      const e = externals(p).find((row) => row.id === node.id);
      const versions = new Set(
        (e?.pins ?? []).map((pin) => pin.version).filter((v) => v !== null),
      );
      return {
        id: `externalUsedBy:${node.id}`,
        label: "Used by",
        description: `${(e?.pins ?? e?.usedBy ?? []).length}`,
        tooltip:
          versions.size > 1
            ? "Two repositories in this solution are on different versions of " +
              "it, which is the upgrade that becomes a negotiation."
            : "Derived from what each repository declares, not stated anywhere.",
        icon: { id: "references", tone: versions.size > 1 ? "attention" : undefined },
        expandable: (e?.pins ?? e?.usedBy ?? []).length > 0,
      };
    }
    case "externalConsumer": {
      const e = externals(p).find((row) => row.id === node.id);
      const pin = (e?.pins ?? []).find((entry) => entry.repository === node.repository);
      const behind = pin?.driftKind === "behind";
      return {
        id: `externalConsumer:${node.id}:${node.repository}`,
        label: node.repository,
        description: pin?.version
          ? `v${pin.version}${behind ? " ⚠" : ""}`
          : "no pin readable here",
        // The upgrade belongs to the repository that holds the pin, and the
        // tooltip says which one that is.
        tooltip: pin?.drift ?? undefined,
        icon: { id: "arrow-small-right", tone: behind ? "attention" : "muted" },
        expandable: false,
      };
    }
    case "memberGroup": {
      const rows = members(p);
      const away = rows.filter((m) => !m.root).length;
      return {
        id: "members",
        label: "Solution repositories",
        description: `${rows.length}`,
        tooltip:
          away > 0
            ? `${away} of them is not on this machine.`
            : "Every repository that declares itself part of this solution.",
        icon: { id: "repo" },
        expandable: rows.length > 0,
      };
    }
    case "member": {
      const m = members(p).find((row) => row.id === node.id);
      if (!m) return { id: `member:${node.id}`, label: node.id, expandable: false };
      const bits: string[] = [];
      if (m.self) bits.push("this repository");
      // Both directions, each read from the declaration that owns it. The
      // second is the one no single repository can state about itself.
      if (m.provides.length > 0) bits.push(`you take ${m.provides.length}`);
      if (m.consumes.length > 0) bits.push(`takes ${m.consumes.length} from here`);
      if (m.shell) bits.push("placemarker — no edges yet");
      if (!m.root && !m.self) bits.push(m.remote ? "not cloned here" : "location undeclared");
      return {
        id: `member:${m.id}`,
        label: m.id,
        description: bits.join(" · "),
        tooltip:
          m.reason ||
          (m.shell
            ? "It declares which solution it is in, and nothing else yet."
            : "It is in this solution because its own declaration says so."),
        icon: {
          id: m.self ? "root-folder" : "repo",
          tone: m.root ? undefined : "muted",
        },
        expandable: false,
        // The same three context values the producer rows carry, so the
        // Open, Reveal, Clone, Locate, Identify and Create entries already
        // in the manifest reach these rows without a second `when`. Without
        // one at all -- which is what these rows had -- "Solution
        // repositories" was a list nothing could be done to, and it is the
        // list holding the repositories no edge reaches yet.
        //
        // This repository's own row is included and reads `here`, because
        // it IS here: Reveal on it is the ordinary way to find the checkout
        // in a file manager, and carving out an exception would mean a
        // second rule saying where a row's repository is.
        contextValue: LOCATION_CONTEXT[externalLocation(m)],
      };
    }
  }
}

/**
 * Where a row's repository is on disk, for the navigation commands.
 *
 * One place decides it. A command that recomputed the path from its own
 * reading of the declaration would eventually disagree with the row the
 * operator clicked, and "Open Repository" opening a different repository than
 * the one named is worse than the command not existing.
 */
export function repositoryPathOf(
  node: SolutionNode,
  p: Projection,
): string | null {
  if (node.kind === "external") {
    return externals(p).find((e) => e.id === node.id)?.root ?? null;
  }
  // Both lists name repositories, so both answer. Answering for only one of
  // them is what made the membership rows unopenable: they carried the
  // right context value, the menu offered Open, and the command that read
  // the path got null and did nothing -- a menu item that looks live and
  // is not.
  if (node.kind === "member") {
    return members(p).find((m) => m.id === node.id)?.root ?? null;
  }
  return null;
}
