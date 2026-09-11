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
  /** A grant of this module's source is in force in the in-flight session's checkout. */
  granted?: boolean;
  /** The session working in this module right now, or null. */
  inSession?: number | null;
  /** The latest run of record of the module's suites: green, red, or none recorded. */
  runOfRecord?: "green" | "red" | "none";
  /** Consumers whose contract suite against this module is red. */
  blocking?: string[];
  /** The bundles that pin this module's package, or are its own. */
  shippedIn?: string[];
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

/** One bundle record under release/: what a deployable ships, at which pins. */
export interface ProjectionBundle {
  bundle: string;
  /**
   * The application modules the deployable was built from. A record written
   * before deployables existed names none, and the row reads as it always
   * did: the bundle IS the application module it is named after.
   */
  from?: string[];
  version: string;
  /** The commit the bundle was built on; the landed one is the gate receipt's. */
  baseCommit?: string | null;
  date: string;
  session?: number | null;
  dependencies: { module: string; package: string; version: string; digest?: string | null }[];
}

/** Which transport is effective, and which layer decided it. */
export interface ConfigurationTransport {
  effective: string;
  decidedBy: string | null;
  /** Every layer that named one, in precedence order; the first decided. */
  layers: { source: string; value: string }[];
}

/** The engine CLIs this machine has, and what that decides on its own. */
export interface ConfigurationEngines {
  chosen: string | null;
  reason: string;
  installed: { engine: string; program: string; path: string | null }[];
}

/**
 * What the record says about whether a model answers as itself.
 *
 * THREE answers and never two, which is the whole reason this field exists.
 * A model nobody has ever asked for and a model that once answered as
 * something else are different facts, and a surface that rendered them alike
 * would be claiming a confidence nothing earned. `not-known` is the common
 * case: only a provider's own statement of what answered can make a model
 * read `honoured`, and a seat's echo can never.
 */
export type ModelFidelity = "honoured" | "substituted" | "not-known";

/** One model, as the registry declares it and the record reads it. */
export interface ConfigurationModel {
  alias: string;
  model: string;
  provider: string;
  /** Absent in a projection written before the record was read. */
  fidelity?: ModelFidelity;
  /**
   * Present only on a model the dated record says stopped being served,
   * with when it went and when it was last seen. Such a model is in
   * `withheld` and never in `candidates`.
   */
  retired?: { since: string; lastSeenAt: string | null } | null;
  /**
   * The price category the model's own source stated, verbatim, or null
   * where it stated none. A PRICE and never a capability: this framework
   * cannot grade a model, and a tag that implied it could would be teaching
   * a developer to distrust the pane.
   */
  priceCategory?: string | null;
  /** How this model's provider stands to the authoring model's. */
  providerRelation?: string | null;
}

/** How a role resolves: what it would pick, and what it was resolved against. */
export interface ConfigurationRole {
  role: string;
  chosen: ConfigurationModel | null;
  candidates: ConfigurationModel[];
  /** Models the record says are no longer served: offered to nobody. */
  withheld?: ConfigurationModel[];
  /** The providers the role was resolved AGAINST -- the invariant, made visible. */
  excludes: string[];
  fellThrough: boolean;
  /**
   * Which record the list came from -- the direct-API registry, or the seat's
   * own catalog. The transport owns the enumeration, and a pane that showed a
   * list without saying which record it read is how a seat came to read
   * "nothing resolves" while its catalog held eighteen models.
   */
  enumeration?: string;
  /** Why this transport can offer nothing, when it cannot. */
  unavailable?: string | null;
}

/** One dated record, in the words the router's own freshness reading uses. */
export interface ConfigurationRecord {
  record: string;
  path: string;
  present: boolean;
  datedAt: string | null;
  ageHours: number | null;
  thresholdHours: number;
  command: string;
  /** What asking for a refresh buys, in the router's own words. */
  cost?: string;
  stale: boolean;
  notes: string[];
}

/**
 * What a session is run with, as the router read it.
 *
 * Every field is READ from a file by the router and rendered here. Nothing in
 * this module decides any of it, and nothing in this module may go and find
 * out: the registry is a dated record, and a pane that enumerated a vendor
 * when it opened would charge a window for being open.
 */
export interface ProjectionConfiguration {
  transport?: ConfigurationTransport;
  /** Which transport every `fidelity` below was read for. */
  fidelityTransport?: string;
  engines?: ConfigurationEngines;
  authoring?: ConfigurationRole;
  verifying?: ConfigurationRole;
  records?: ConfigurationRecord[];
  /** Why there is nothing to show: a config this router could not load. */
  unavailable?: string;
}

export interface Projection {
  solution: ProjectionSolution;
  /** In dependency order, as the router projects them. */
  modules: ProjectionModule[];
  external?: ProjectionExternal[];
  members?: ProjectionMember[];
  /** The bundle records, as the router read them; recorded, never executed. */
  bundles?: ProjectionBundle[];
  /** What a session is run with; absent in a projection written before it existed. */
  configuration?: ProjectionConfiguration;
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

export type IconSpec = { id: string; tone?: "attention" | "done" | "muted" | "milestone" };

export type SolutionNode =
  | { kind: "solution" }
  | { kind: "module"; slug: string }
  | { kind: "contract"; slug: string }
  | { kind: "dependsOn"; slug: string }
  | { kind: "dependency"; slug: string; dependency: string }
  | { kind: "usedBy"; slug: string }
  | { kind: "consumer"; slug: string; consumer: string }
  | { kind: "externalGroup" }
  | { kind: "bundleGroup" }
  | { kind: "bundle"; bundle: string }
  | { kind: "bundleDependency"; bundle: string; pkg: string }
  | { kind: "external"; id: string }
  | { kind: "externalUsedBy"; id: string }
  | { kind: "externalConsumer"; id: string; repository: string }
  | { kind: "memberGroup" }
  | { kind: "member"; id: string }
  | { kind: "configuration" }
  | { kind: "configEngine" }
  | { kind: "configTransport" }
  | { kind: "configRole"; role: "authoring" | "verifying" }
  | { kind: "configRecord"; record: string };

export interface RowDescriptor {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: IconSpec;
  /** Collapsed, never Expanded: the tree stays lazy. */
  expandable: boolean;
  contextValue?: string;
  /**
   * What a CLICK on the row does, by command id.
   *
   * Only a row whose whole purpose is one action has one, and the
   * Configuration rows are that: a setting is a thing you click to change.
   * It is deliberately not an inline icon -- the menu registry holds this
   * pane to two of those, and a control that has to be discovered by
   * right-clicking is a control most people never find.
   */
  command?: string;
}

function find(p: Projection, slug: string): ProjectionModule | undefined {
  return p.modules.find((m) => m.slug === slug);
}

export function rootNodes(): SolutionNode[] {
  // Two roots, and the second is collapsed like everything else here: what a
  // session is run with is a thing an operator looks at when they are
  // deciding, not a thing that should be in the way while they are working.
  return [{ kind: "solution" }, { kind: "configuration" }];
}

function configuration(p: Projection): ProjectionConfiguration {
  return p.configuration ?? {};
}

function configRole(
  p: Projection,
  which: "authoring" | "verifying",
): ConfigurationRole | undefined {
  return which === "authoring" ? configuration(p).authoring : configuration(p).verifying;
}

/** How old a record is, in the units a person reads it in. */
function agePhrase(hours: number | null): string {
  if (hours === null) return "no readable date";
  if (hours < 1) return "under an hour old";
  if (hours < 48) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)} days old`;
}

/**
 * What each answer READS as, and the three are three.
 *
 * `not known` is not an absence of a problem and it is not approval: it is
 * the common case, and the day it renders like `honoured` is the day this
 * pane starts making a promise the record cannot keep.
 */
/**
 * Which record a role's list was read from, in words.
 *
 * The router names the enumeration; this only spells it. A name it does not
 * know is printed as it came, because an unknown record is still worth
 * saying and a pane that swallowed it would be back to a list from nowhere.
 */
export const ENUMERATION_WORDS: Record<string, string> = {
  "api-catalog": "vendors' own model lists",
  "seat-catalog": "seat's own catalog",
};

/**
 * How a candidate's provider stands to the authoring model's, in words.
 *
 * This is the whole of what cross-provider review is now: a LABEL the person
 * choosing can weigh, where there used to be a refusal. A different provider
 * reduces the chance the reviewer shares the author's blind spots -- it does
 * not eliminate it, and the same provider does not guarantee it, which is
 * why the framework states the fact and leaves the judgement where the data
 * to make it actually is.
 *
 * One vocabulary, read by the row AND by the pick. Two copies of a
 * vocabulary drift, and sessions 143 and 147 each paid for finding that out.
 */
export const PROVIDER_RELATION_WORDS: Record<string, string> = {
  "different-provider": "different provider",
  "same-provider": "same provider",
  "provider-unknown": "provider unknown",
};

/** The one line of help under a list of possible reviewers. */
export const VERIFIER_HELP =
  "A different provider reduces the chance the reviewer shares the author's blind spots.";

export const FIDELITY_WORDS: Record<ModelFidelity, string> = {
  honoured: "answers as itself",
  substituted: "has answered as another model",
  "not-known": "not known",
};

const FIDELITY_TOLD: Record<ModelFidelity, string> = {
  honoured:
    "The provider's own statement of what answered, from a round on this transport, names this model.",
  substituted:
    "A record of this model answering as a DIFFERENT one. One substitution outweighs any number of matches: a model that has once answered as another is a model that can.",
  "not-known":
    "Nothing on this transport establishes it either way, which is the ordinary case. A seat's echo can never establish fidelity — a CLI that ignored the flag and echoed the request back would print exactly what an honoured one prints — so only a provider's own served id can.",
};

/** One model as a row reads it: the id that is dispatched, and whose it is. */
function modelText(model: ConfigurationModel | null | undefined): string {
  if (!model) return "nothing resolves";
  const fidelity = model.fidelity;
  const said = fidelity === undefined ? "" : ` · ${FIDELITY_WORDS[fidelity]}`;
  return `${model.model} (${model.provider})${said}`;
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
  // The modules in play: the in-flight row of this root's ledger, and the
  // marker a focused session leaves in the repository. Both move the
  // module rows' mark, and neither touches the projection file itself.
  "docs/sessions/sessions.json",
  ".dabbler/module-session.json",
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
      // What ships, when something has: the bundle records under release/.
      if ((p.bundles ?? []).length > 0) own.push({ kind: "bundleGroup" });
      return own;
    }
    case "configuration": {
      const config = configuration(p);
      // A row per thing a person chooses, then a row per dated record. Only
      // what the projection carries: a section that invented a row for an
      // absent field would be saying something the router never read.
      const own: SolutionNode[] = [];
      if (config.engines) own.push({ kind: "configEngine" });
      if (config.transport) own.push({ kind: "configTransport" });
      if (config.authoring) own.push({ kind: "configRole", role: "authoring" });
      if (config.verifying) own.push({ kind: "configRole", role: "verifying" });
      for (const row of config.records ?? []) {
        own.push({ kind: "configRecord", record: row.record });
      }
      return own;
    }
    case "externalGroup":
      return externals(p).map((e) => ({ kind: "external" as const, id: e.id }));
    case "bundleGroup":
      return (p.bundles ?? []).map((b) => ({ kind: "bundle" as const, bundle: b.bundle }));
    case "bundle":
      return ((p.bundles ?? []).find((b) => b.bundle === node.bundle)?.dependencies ?? []).map((d) => ({
        kind: "bundleDependency" as const,
        bundle: node.bundle,
        pkg: d.package,
      }));
    case "bundleDependency":
      return [];
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

/**
 * What the Work Explorer knows that the solution projection does not: the
 * module the next session's plan names, when that session is focused and
 * this window is the repository's. The module's row is where one click
 * starts it, so the row carries `;next-session` and nothing else does.
 */
export interface SolutionContext {
  readonly nextSessionModule?: string | null;
  /**
   * The engine the operator chose for the next session, which is a setting
   * of this extension rather than of the router: `session start` takes the
   * engine as an argument, so the default belongs to whoever offers to start
   * one. Null when nobody has chosen and the machine's own reading stands.
   */
  readonly chosenEngine?: string | null;
}

export function descriptorFor(
  node: SolutionNode,
  p: Projection,
  context: SolutionContext = {},
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
      const bits: string[] = [];
      // The session working here right now leads the row: it is the thing
      // a person scanning the tree is looking for, in either window.
      const active = typeof m.inSession === "number";
      if (active) bits.push(`● session ${m.inSession}`);
      bits.push(m.kind);
      bits.push(m.package ? `package: ${m.package}` : "no package");
      // The run of record reads on the row, from the records and never from
      // a claim: green, red, or none where nothing has been recorded.
      if (m.runOfRecord !== undefined && p.solution.multi) bits.push(`run of record: ${m.runOfRecord}`);
      // A grant in force reads on the row: this checkout holds the module's
      // source, which the wall says it should not, and somebody signed for it.
      if (m.granted === true) bits.push("widened");
      // Where it shipped, from the bundle records and never from a claim.
      if ((m.shippedIn ?? []).length > 0) bits.push(`shipped in: ${(m.shippedIn ?? []).join(", ")}`);
      const tone = active
        ? ("milestone" as const)
        : m.granted === true || m.runOfRecord === "red"
          ? ("attention" as const)
          : m.runOfRecord === "green"
            ? ("done" as const)
            : undefined;
      return {
        id: `module:${m.slug}`,
        label: m.slug,
        description: bits.join(" · "),
        tooltip: active
          ? `${m.title} — session ${m.inSession} is working here.`
          : m.granted === true
            ? `${m.title} — a grant widened this checkout to its source; End grant narrows it again.`
            : m.runOfRecord === "red"
              ? `${m.title} — its latest run of record is red.`
              : m.title,
        icon: { id: KIND_ICONS[m.kind] ?? "package", ...(tone === undefined ? {} : { tone }) },
        expandable: childrenOf(node, p).length > 0,
        // `;focused` is what Open Module and Widen for debugging are gated
        // on: only a module of a multi-module solution has a focused
        // checkout. `;granted` is what End grant is gated on. A
        // single-module repository is its module, and this window is it.
        contextValue:
          `dabblerModule:${m.kind}` +
          (p.solution.multi ? ";focused" : "") +
          (m.granted === true ? ";granted" : "") +
          (active ? ";active" : "") +
          // `;next-session` is what Start Focused Session is gated on: the
          // one module the next session's plan names, in the repository's
          // own window.
          (p.solution.multi && context.nextSessionModule === m.slug ? ";next-session" : ""),
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
    case "consumer": {
      // A consumer whose contract suite against this producer is red is
      // blocked by the producer's candidate, and says so on the row.
      const blocked = (find(p, node.slug)?.blocking ?? []).includes(node.consumer);
      return {
        id: `consumer:${node.slug}:${node.consumer}`,
        label: node.consumer,
        ...(blocked ? { description: "blocking", tooltip: `${node.consumer}'s contract suite against ${node.slug} is red.` } : {}),
        icon: { id: blocked ? "warning" : "arrow-small-right", tone: blocked ? "attention" : "muted" },
        expandable: false,
      };
    }
    case "bundleGroup": {
      const rows = p.bundles ?? [];
      return {
        id: "bundles",
        label: "Bundles",
        description: `${rows.length}`,
        tooltip: "What the applications ship, at the versions their pins name. Recorded by a releasable session, never executed.",
        icon: { id: "package" },
        expandable: rows.length > 0,
        contextValue: "dabblerBundles",
      };
    }
    case "bundle": {
      const b = (p.bundles ?? []).find((row) => row.bundle === node.bundle);
      if (!b) return { id: `bundle:${node.bundle}`, label: node.bundle, expandable: false };
      // What a bundle is made of, not only what it pins: a deployable can
      // ship several application modules, and the row says which.
      const ships = (b.from ?? []).join(", ");
      return {
        id: `bundle:${b.bundle}`,
        label: b.bundle,
        description: ships ? `${b.version} · ${ships}` : `${b.version} · ${b.date}`,
        tooltip:
          `${b.bundle} ${b.version}, recorded ${b.date}` +
          (b.baseCommit ? ` on ${b.baseCommit.slice(0, 12)}` : "") +
          (ships ? `. Ships ${ships}.` : ""),
        icon: { id: "archive" },
        expandable: b.dependencies.length > 0,
        contextValue: "dabblerBundle",
      };
    }
    case "bundleDependency": {
      const d = (p.bundles ?? []).find((row) => row.bundle === node.bundle)?.dependencies.find((dep) => dep.package === node.pkg);
      return {
        id: `bundleDependency:${node.bundle}:${node.pkg}`,
        label: node.pkg,
        description: d ? `${d.version} (${d.module})` : undefined,
        tooltip: d?.digest ? `source digest ${d.digest}` : undefined,
        icon: { id: "arrow-small-right", tone: "muted" },
        expandable: false,
      };
    }
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
    case "configuration": {
      const config = configuration(p);
      const bits: string[] = [];
      if (config.engines?.chosen) bits.push(config.engines.chosen);
      if (config.transport) bits.push(config.transport.effective);
      const stale = (config.records ?? []).filter((row) => row.stale).length;
      return {
        id: "configuration",
        label: "Configuration",
        description: config.unavailable
          ? "cannot be read"
          : bits.length > 0
            ? bits.join(" · ")
            : "what the next session runs with",
        tooltip:
          config.unavailable ??
          "What a session is run with, read from files. Nothing here is " +
            "probed: the model registry is a dated record, and refreshing it " +
            "is something you ask for.",
        icon: {
          id: "settings-gear",
          ...(config.unavailable || stale > 0 ? { tone: "attention" as const } : {}),
        },
        expandable: childrenOf(node, p).length > 0,
        contextValue: "dabblerConfiguration",
      };
    }
    case "configEngine": {
      const engines = configuration(p).engines;
      const installed = (engines?.installed ?? []).filter((entry) => entry.path !== null);
      // What the OPERATOR chose outranks what the machine leaves to choose:
      // one installed CLI is a default, and a person picking one is a
      // decision, and a row that showed the first while the second stood
      // would be reporting something that is not what happens.
      const chosen = context.chosenEngine ?? engines?.chosen ?? null;
      const theirs = (context.chosenEngine ?? null) !== null;
      return {
        id: "config:engine",
        label: "Engine",
        // What is set, and what is only a candidate, are different facts: a
        // chosen engine reads as one, and an unchosen one says how many
        // there are to choose from rather than naming one of them.
        description: chosen ?? (installed.length === 0 ? "none installed" : "not chosen"),
        tooltip: [
          theirs
            ? `You chose ${chosen}. Start Session offers it first.`
            : (engines?.reason ?? "Nothing was read."),
          "What this sets is the default for the NEXT session: the engine is recorded per session at `session start` and never changes one in flight.",
        ].join("\n\n"),
        icon: { id: "person", ...(chosen ? {} : { tone: "muted" as const }) },
        expandable: false,
        contextValue: "dabblerConfigEngine",
        command: "dabblerSolution.setEngine",
      };
    }
    case "configTransport": {
      const transport = configuration(p).transport;
      const shadowed = (transport?.layers ?? []).slice(1);
      return {
        id: "config:transport",
        label: "Transport",
        description: transport
          ? `${transport.effective}${shadowed.length > 0 ? " ⚠" : ""}`
          : "not read",
        // The shadowing is the whole point of the row. A setting that is
        // being overridden by one above it looks exactly like one that is
        // in force, which is how a persisted environment variable came to
        // decide what every session here cost.
        tooltip: [
          transport?.decidedBy
            ? `Decided by ${transport.decidedBy}.`
            : "Nothing sets one, so the default `api` stands.",
          ...shadowed.map(
            (layer) => `${layer.source} says '${layer.value}' and is overridden.`,
          ),
        ].join("\n"),
        icon: {
          id: "plug",
          ...(shadowed.length > 0 ? { tone: "attention" as const } : {}),
        },
        expandable: false,
        contextValue: "dabblerConfigTransport",
        command: "dabblerSolution.setTransport",
      };
    }
    case "configRole": {
      const role = configRole(p, node.role);
      const authoring = node.role === "authoring";
      const chosenFidelity = role?.chosen?.fidelity;
      return {
        id: `config:role:${node.role}`,
        label: authoring ? "Authoring model" : "Verifying model",
        description: `${modelText(role?.chosen)}${role?.fellThrough ? " ⚠" : ""}`,
        tooltip: [
          authoring
            ? "The engine's own model, declared when the session was registered. It is reported here and set there: changing it in this pane would not reach the run."
            : `The model that reviews the work. The only model refused is the authoring model itself; every other is offered and labelled. ${VERIFIER_HELP}`,
          // The label, in the row, in the same words the pick uses.
          !authoring && role?.chosen?.providerRelation
            ? `This one is on a ${PROVIDER_RELATION_WORDS[role.chosen.providerRelation] ?? role.chosen.providerRelation}.`
            : "",
          role?.chosen?.priceCategory
            ? `Its source states a '${role.chosen.priceCategory}' price category. That is a PRICE and not a capability: this framework does not grade models.`
            : "",
          role?.fellThrough
            ? "It fell past its own preference order, so what answers is a model nobody named. That is what billed one session 364 premium requests."
            : "",
          // What the record says about this model answering as itself, on
          // the transport it was read for. Said in full, because "not
          // known" is the answer that needs the sentence.
          chosenFidelity === undefined
            ? ""
            : `Is it the model that answers? ${FIDELITY_WORDS[chosenFidelity]}${
                configuration(p).fidelityTransport
                  ? ` on \`${configuration(p).fidelityTransport}\``
                  : ""
              }. ${FIDELITY_TOLD[chosenFidelity]}`,
          // Which record was read, said plainly: the seat's catalog is the
          // enumeration on a seat, and the registry is on the API path.
          `${role?.candidates.length ?? 0} model(s) qualify${
            role?.enumeration ? `, from the ${ENUMERATION_WORDS[role.enumeration] ?? role.enumeration}` : ""
          }.`,
          (role?.withheld ?? []).length > 0
            ? `Withheld, because the record says the vendor stopped serving them: ${(role?.withheld ?? [])
                .map(
                  (model) =>
                    `${model.model} (last seen ${model.retired?.lastSeenAt ?? "unknown"}, gone since ${model.retired?.since ?? "unknown"})`,
                )
                .join(", ")}. The entry is kept, so a model that comes back is offered again.`
            : "",
          role?.unavailable ? `Nothing can be offered here: ${role.unavailable}.` : "",
        ]
          .filter((line) => line !== "")
          .join("\n\n"),
        icon: {
          id: authoring ? "edit" : "verified",
          // A model that has answered as another is the one thing here worth
          // a colour. Not-known is not a fault -- it is most of the list.
          ...(role?.fellThrough || chosenFidelity === "substituted"
            ? { tone: "attention" as const }
            : {}),
        },
        expandable: false,
        contextValue: `dabblerConfigRole;${node.role}`,
        command: "dabblerSolution.setRoleModel",
      };
    }
    case "configRecord": {
      const row = (configuration(p).records ?? []).find(
        (record) => record.record === node.record,
      );
      return {
        id: `config:record:${node.record}`,
        label: node.record,
        // *Not read yet* and not "no record": a machine that has never
        // refreshed is the ordinary first-run case, and the reading that
        // fixes it is free and one menu item away.
        description: row?.present ? agePhrase(row.ageHours) : "not read yet",
        tooltip: [
          row?.present
            ? `Last updated ${row.datedAt}; read as stale past ${Math.round(row.thresholdHours)}h.`
            : "This machine has not read its model catalog yet.",
          `It lives at ${row?.path ?? "this machine's own data directory"}.`,
          ...(row?.notes ?? []),
          // What it costs, before the click. The answer is nothing, and it
          // is said here because the question has been answered wrongly
          // often enough to be worth pre-empting.
          `Update the catalog runs \`${row?.command ?? ""}\`. ${row?.cost ?? ""}`.trim(),
        ].join("\n"),
        icon: {
          id: "database",
          ...(row?.stale ? { tone: "attention" as const } : { tone: "done" as const }),
        },
        expandable: false,
        contextValue: "dabblerConfigRecord",
        command: "dabblerSolution.refreshRecord",
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
