// What the Solution Explorer says, decided without vscode so the unit suite
// can drive it.
//
// This file renders; it never decides. The projection is written by the
// router (`workflow/project.ts`), and folding the event log stays there —
// two implementations of one rule disagree eventually, and the disagreement
// surfaces as a status nobody can explain.

export interface ProjectionSolution {
  name: string;
  title: string;
  step: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  waitingOn?: string | null;
  returns?: number;
}

export interface ProjectionComponent {
  name: string;
  kind: string;
  title: string;
  version?: string | null;
  step: string;
  stepTitle: string;
  stepNumber: number;
  owner?: string | null;
  contract?: string | null;
  contractDoc?: string | null;
  dependsOn: string[];
  usedBy: string[];
  waitingOn?: string | null;
  returns?: number;
}

/**
 * A component this solution consumes from another repository.
 *
 * Derived by the router from `solution-dependencies.json`, and the manifest
 * gains no vocabulary for it: the manifest says what this repository builds,
 * the dependency file says what it takes, and two tracked homes for one edge
 * is the drift `usedBy` is derived to avoid.
 *
 * `root` is where the producing repository is on THIS machine, or null. That
 * is what makes the row navigable, and its absence is a reported state rather
 * than a defect in the declaration.
 */
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
  components: ProjectionComponent[];
  needsYou: string[];
  external?: ProjectionExternal[];
  members?: ProjectionMember[];
}

/**
 * Which file the Contract row opens. The readable rendering when there is
 * one, the source otherwise. A consumer reading a contract wants the tables,
 * not the YAML that generates them; Python derives both paths, so this only
 * picks between them.
 */
export function contractTarget(
  c: ProjectionComponent | undefined,
): string | undefined {
  if (!c) return undefined;
  return c.contractDoc || c.contract || undefined;
}

export type IconSpec = { id: string; tone?: "attention" | "done" | "muted" };

export type SolutionNode =
  | { kind: "solution" }
  | { kind: "component"; name: string }
  | { kind: "contract"; name: string }
  | { kind: "usedBy"; name: string }
  | { kind: "consumer"; name: string; consumer: string }
  | { kind: "progress"; name: string }
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

function find(p: Projection, name: string): ProjectionComponent | undefined {
  return p.components.find((c) => c.name === name);
}

/** Components first, integration last — it is what the others compose into. */
export function orderedComponents(p: Projection): ProjectionComponent[] {
  const libs = p.components.filter((c) => c.kind !== "integration");
  const integrations = p.components.filter((c) => c.kind === "integration");
  return [...libs, ...integrations];
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

/** The document the tree renders, relative to a repository root. */
export const PROJECTION_RELPATH = ".dabbler/solution/projection.json";

/**
 * Every file whose change can change what this tree shows.
 *
 * The projection is DERIVED, and it is written by four commands: the
 * `workflow` verbs that record an event, the `deps` verbs that place a
 * repository, `bootstrap`, and the driver when a plan asks for one. Nothing
 * rewrites it when the declarations underneath it move -- a component added
 * to the manifest by hand, a sibling cloned, a version bumped in a build
 * file -- so the view spent a whole session showing what was true when the
 * last event was recorded.
 *
 * Watching only the projection cannot fix that: an event on a file nothing
 * rewrote re-reads the same bytes. These are the inputs, and a change to one
 * of them is what the tree re-derives on.
 *
 * Repository-relative glob patterns, because that is what the watcher takes:
 *
 * - `solution.yaml` -- what this repository builds, and every component row.
 * - `solution-dependencies.json` -- who produces what it consumes, and the
 *   membership rows, which come from nowhere else.
 * - the workflow event log -- the step, the loop counters and who each
 *   component is waiting on are a fold of it.
 * - the build files -- the PIN is read from them on every projection rather
 *   than copied, so the drift rows change when they do.
 *
 * The projection itself is deliberately absent: it is this list's output,
 * and re-deriving on it would be a loop.
 */
export const PROJECTION_SOURCE_GLOBS: readonly string[] = [
  "solution.yaml",
  "solution-dependencies.json",
  ".dabbler/solution/events.jsonl",
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
      const own: SolutionNode[] = orderedComponents(p).map((c) => ({
        kind: "component" as const,
        name: c.name,
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
    case "component": {
      const c = find(p, node.name);
      if (!c) return [];
      const out: SolutionNode[] = [{ kind: "contract", name: c.name }];
      // Only rendered when there is something to say. An empty folder is a
      // row the reader has to open to learn nothing.
      if (c.usedBy.length > 0) out.push({ kind: "usedBy", name: c.name });
      out.push({ kind: "progress", name: c.name });
      return out;
    }
    case "usedBy": {
      const c = find(p, node.name);
      if (!c) return [];
      return c.usedBy.map((consumer) => ({
        kind: "consumer" as const,
        name: node.name,
        consumer,
      }));
    }
    default:
      return [];
  }
}

export function descriptorFor(
  node: SolutionNode,
  p: Projection,
): RowDescriptor {
  switch (node.kind) {
    case "solution": {
      const s = p.solution;
      const waiting = p.needsYou.length > 0;
      return {
        id: `solution:${s.name}`,
        label: s.title,
        description: `step ${s.stepNumber}/${s.stepCount} · ${s.stepTitle}`,
        tooltip: waiting
          ? `Waiting on you: ${p.needsYou.join(", ")}`
          : `${s.stepTitle} — nothing is waiting on you`,
        icon: { id: "project", tone: waiting ? "attention" : undefined },
        expandable: true,
        contextValue: "dabblerSolution",
      };
    }
    case "component": {
      const c = find(p, node.name);
      if (!c) {
        return { id: `component:${node.name}`, label: node.name, expandable: false };
      }
      const bits: string[] = [];
      if (c.version) bits.push(`v${c.version}`);
      bits.push(`${c.stepNumber}/6 ${c.stepTitle}`);
      if (c.owner) bits.push(c.owner);
      if (c.returns && c.returns > 0) {
        bits.push(`${c.returns}× sent back`);
      }
      const attention = c.waitingOn === "developer";
      return {
        id: `component:${c.name}`,
        label: c.name,
        description: bits.join(" · "),
        tooltip: attention
          ? "Waiting on you"
          : c.waitingOn === "author"
            ? "Back with the author"
            : c.title,
        icon: {
          id: c.kind === "integration" ? "layers" : "package",
          tone: attention ? "attention" : c.stepNumber === 6 ? "done" : undefined,
        },
        expandable: true,
        contextValue: `dabblerComponent:${c.kind}`,
      };
    }
    case "contract": {
      const c = find(p, node.name);
      const has = Boolean(contractTarget(c));
      return {
        id: `contract:${node.name}`,
        label: "Contract",
        description: has ? "open" : "not written yet",
        tooltip: has
          ? "What this component promises. Opens in an editor tab."
          : "No contract yet — it is written at step 3.",
        icon: { id: "file-text", tone: has ? undefined : "muted" },
        expandable: false,
        contextValue: has ? "dabblerContract" : "dabblerContractMissing",
      };
    }
    case "usedBy": {
      const c = find(p, node.name);
      const n = c ? c.usedBy.length : 0;
      return {
        id: `usedBy:${node.name}`,
        label: "Used by",
        description: `${n}`,
        // The line nobody can get anywhere else, and the reason people are
        // willing to change a component instead of adding one beside it.
        tooltip: "These break if this contract changes.",
        icon: { id: "references" },
        expandable: n > 0,
      };
    }
    case "consumer":
      return {
        id: `consumer:${node.name}:${node.consumer}`,
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
    case "progress": {
      const c = find(p, node.name);
      const step = c ? c.stepNumber : 1;
      return {
        id: `progress:${node.name}`,
        label: "Progress",
        description: `${"■".repeat(step)}${"□".repeat(6 - step)}`,
        tooltip: c ? `Step ${step} of 6 — ${c.stepTitle}` : undefined,
        icon: { id: "graph" },
        expandable: false,
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
