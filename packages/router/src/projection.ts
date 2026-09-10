// The projection the Solution Explorer reads: the module manifest, joined
// to what the tree and the sibling repositories say.
//
// The extension renders; the router decides. The extension never reads the
// manifest or the sibling repositories itself, because two implementations
// of one rule disagree eventually and the disagreement shows up as a wrong
// row nobody can explain. Everything here is DERIVED: dependency order and
// `usedBy` from `dependsOn`, the contract folder from the disk, the drift
// rows from build files read on every projection.
//
// A single-module solution -- an absent manifest, or one entry -- projects
// one module row and nothing module-shaped beyond it, which is the shape of
// every repository that predates the manifest.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { readModuleSessionMarker } from "./checkout.ts";
import {
  TRANSPORT_COPILOT_CLI,
  explainTransport,
  loadConfig,
  type RouterConfig,
} from "./config.ts";
import {
  REFRESH_COST,
  checkFreshness,
  isStale,
  type FreshnessRow,
} from "./discovery.ts";
import { installedEngines } from "./engines.ts";
import { sessionsDirFor } from "./evidence.ts";
import { readExposure } from "./exposure.ts";
import { platformNewlines } from "./journal.ts";
import { dumps } from "./pythonJson.ts";
import { readBundleRecords } from "./land.ts";
import { type ModuleEntry, type SolutionShape, consumersOf, ManifestError, solutionShape } from "./modules.ts";
import { readRawSessionState } from "./sessionState.ts";
import {
  OUTCOME_PASSED,
  STAGE_FINAL_FULL,
  type SuiteSpec,
  type TestRunRecord,
  loadSuitesChecked,
  readRecords,
} from "./testEvidence.ts";
import {
  assembleSolution,
  locateProducer,
  type Edge,
  type SolutionMember,
} from "./solutionDeps.ts";
import {
  comparePins,
  configuredFeeds,
  publishedVersions,
  reconcileResolution,
} from "./resolution.ts";
import {
  ROLE_GENERATOR,
  ROLE_VERIFIER,
  echoObservations,
  explainRegistryCandidates,
  modelFidelity,
  roundObservations,
  type Fidelity,
  type ModelObservation,
} from "./selection.ts";
import { archivedRounds } from "./ledger.ts";
import { loadCatalog, resolveLockfilePath } from "./transports/copilot.ts";

type Node = Record<string, unknown>;

export const PROJECTION_RELPATH = join(".dabbler", "solution", "projection.json");

export function projectionPath(root: string): string {
  return join(root, PROJECTION_RELPATH);
}

/** Where a module's contract bundle lives, relative to the root. */
export function contractDirFor(slug: string): string {
  return `modules/${slug}/contract`;
}

/** What the Explorer reads: the manifest, joined to the tree. */
/**
 * The siblings a grant has widened the in-flight session's checkout to, from
 * that session's exposure manifest in this root. Empty where nothing is in
 * flight, or the session is not a module session, or this is not a clone.
 */
function grantedSiblings(root: string): Set<string> {
  try {
    const raw = readRawSessionState(sessionsDirFor(root));
    const sessions = Array.isArray(raw?.["sessions"]) ? (raw?.["sessions"] as Record<string, unknown>[]) : [];
    const current = sessions.find((row) => row["status"] === "in-progress");
    if (current === undefined || typeof current["number"] !== "number") return new Set();
    return new Set((readExposure(root, current["number"])?.grants ?? []).map((grant) => grant.sibling));
  } catch {
    return new Set();
  }
}

/**
 * The modules the in-flight session names, and which session: from this
 * root's ledger row (`checkout.module` in a module's folder, the declared
 * `modules` in a global session), or -- in the repository while a focused
 * session runs in its module's folder -- from the module-session marker,
 * which is the only record the repository holds of it. Null when nothing
 * is in flight here.
 */
function modulesInSession(root: string): { readonly session: number; readonly modules: ReadonlySet<string> } | null {
  try {
    const raw = readRawSessionState(sessionsDirFor(root));
    const sessions = Array.isArray(raw?.["sessions"]) ? (raw?.["sessions"] as Record<string, unknown>[]) : [];
    const current = sessions.find((row) => row["status"] === "in-progress");
    if (current !== undefined && typeof current["number"] === "number") {
      const checkout = current["checkout"];
      const checkoutModule =
        typeof checkout === "object" && checkout !== null && !Array.isArray(checkout)
          ? (checkout as Record<string, unknown>)["module"]
          : null;
      const named =
        typeof checkoutModule === "string" && checkoutModule.trim() !== ""
          ? [checkoutModule.trim()]
          : Array.isArray(current["modules"])
            ? (current["modules"] as unknown[]).map(String)
            : [];
      return { session: current["number"], modules: new Set(named) };
    }
  } catch {
    // An unreadable ledger marks nothing; the marker below may still.
  }
  const marker = readModuleSessionMarker(root);
  return marker === null ? null : { session: marker.session, modules: new Set([marker.module]) };
}

export type RunOfRecordState = "green" | "red" | "none";

/**
 * Each module's run of record and who it blocks, from the latest final-full
 * record of every suite the module declares. Green when every expensive
 * suite of the module has a passed latest record; red when any latest is
 * not passed; none where a suite has no record, or the module declares no
 * suite. A consumer is blocked by a producer when its consumer-contract
 * suite against that producer is red. Nothing here is declared: it is a
 * reading of the records beside the run.
 */
function runsOfRecord(
  root: string,
  shape: SolutionShape,
): Map<string, { readonly state: RunOfRecordState; readonly blocking: string[] }> {
  const out = new Map<string, { state: RunOfRecordState; blocking: string[] }>();
  for (const entry of shape.modules) out.set(entry.slug, { state: "none", blocking: [] });
  if (!shape.multi) return out;
  let suites: readonly SuiteSpec[];
  let records: readonly TestRunRecord[];
  try {
    suites = loadSuitesChecked(loadConfig(undefined, root), { shape }).suites;
    records = readRecords(root);
  } catch {
    return out;
  }
  const latest = (suite: string): TestRunRecord | null =>
    records.filter((row) => row.suite === suite && row.stage === STAGE_FINAL_FULL).at(-1) ?? null;
  for (const entry of shape.modules) {
    const own = suites.filter((suite) => suite.expensive && suite.module === entry.slug);
    if (own.length === 0) continue;
    const latests = own.map((suite) => latest(suite.name));
    const state: RunOfRecordState = latests.some((row) => row !== null && row.outcome !== OUTCOME_PASSED)
      ? "red"
      : latests.every((row) => row !== null && row.outcome === OUTCOME_PASSED)
        ? "green"
        : "none";
    out.get(entry.slug)!.state = state;
  }
  for (const suite of suites) {
    if (suite.role !== "consumer-contract" || !suite.against || !suite.module) continue;
    const row = latest(suite.name);
    if (row !== null && row.outcome !== OUTCOME_PASSED) out.get(suite.against)?.blocking.push(suite.module);
  }
  for (const value of out.values()) value.blocking.sort();
  return out;
}

// --- What a session is run with ---------------------------------------------
//
// Every decision below is already made somewhere in this router; not one of
// them is reachable from the window an operator has open all day. So the
// reading is assembled here and rendered there, exactly as the module rows
// are: the extension re-derives none of it, because two implementations of
// one rule disagree eventually and the disagreement arrives as a row nobody
// can explain.
//
// **Nothing here reaches a network or spawns a process.** The registry is a
// dated record; freshness is read from it and refreshing it is something the
// operator asks for. A pane that enumerated a vendor when it opened would
// charge a window for being open, and would do it on a sparse clone that
// only wants to draw a tree.

/**
 * What the record says about each model on ONE transport: honoured,
 * substituted, or not known.
 *
 * Per transport, because the two kinds of evidence are not interchangeable
 * and neither are the paths that produce them. A round on the direct-API
 * path carries the provider's own statement of what answered; the seat's
 * catalog carries the CLI's echo of what it was asked for, which is a label,
 * and this framework has never trusted a seat label. `modelFidelity` weighs
 * them; this only hands it the observations that belong to the transport the
 * operator is actually on, so evidence about the seat never reads as
 * evidence about the API.
 *
 * Nothing is gathered that was not already recorded. `docs/model-fidelity.md`
 * is the measurement and states its own bounds.
 */
function fidelityOn(root: string, config: RouterConfig, transport: string): (model: string) => Fidelity {
  const observations: ModelObservation[] = [];
  try {
    observations.push(
      ...roundObservations(
        archivedRounds(root).filter((row) => row["transport"] === transport),
      ),
    );
  } catch {
    // No run record here yet, which is most repositories. Not knowing is an
    // answer this reading is built to give.
  }
  if (transport === TRANSPORT_COPILOT_CLI) {
    try {
      observations.push(...echoObservations(loadCatalog(resolveLockfilePath(config)).models));
    } catch {
      // No seat configured, or no catalog probed. Again: not known.
    }
  }
  return (model) => modelFidelity(model, observations);
}

/** One model a role could resolve to, as the registry declares it. */
function candidateNode(
  candidate: readonly [string, string, string],
  fidelity: (model: string) => Fidelity,
): Node {
  const [modelId, provider, alias] = candidate;
  // Three answers and never two. A model nobody has asked for and one that
  // answered as something else are different facts, and a surface that
  // rendered them alike would be making the promise session 144 exists to
  // stop it making.
  return { alias, model: modelId, provider, fidelity: fidelity(modelId) };
}

/**
 * A role's resolution: what it would pick, and what else it could.
 *
 * `excludes` carries the providers the role was resolved AGAINST, which is
 * where the cross-provider invariant becomes visible rather than restated --
 * the verifying role is resolved with the authoring model's provider
 * excluded, by the same rule that excludes it immediately before the wire.
 */
function roleNode(
  config: RouterConfig,
  role: string,
  exclude: readonly string[] | null,
  fidelity: (model: string) => Fidelity,
): Node {
  const resolution = explainRegistryCandidates(config, role, exclude);
  const chosen = resolution.candidates[0];
  return {
    role,
    chosen: chosen === undefined ? null : candidateNode(chosen, fidelity),
    candidates: resolution.candidates.map((candidate) => candidateNode(candidate, fidelity)),
    excludes: [...(exclude ?? [])],
    // A role that fell past its own preference order picked a model nobody
    // named. The 364-request session is why that is worth a row.
    fellThrough: resolution.fellThrough,
  };
}

/** One dated record, in the words the freshness reading already uses. */
function recordNode(row: FreshnessRow): Node {
  return {
    record: row.record,
    path: row.path,
    present: row.present,
    datedAt: row.dated_at,
    ageHours: row.age_hours,
    thresholdHours: row.threshold_hours,
    command: row.command,
    // What asking for a refresh buys, from where the thresholds are decided.
    cost: REFRESH_COST[row.record] ?? "",
    stale: isStale(row),
    notes: [...row.notes],
  };
}

/**
 * What this session would be run with, and what decided each part of it.
 *
 * Never throws. A configuration this router cannot load is a real state --
 * an unknown key in an overlay, a transport spelled wrong -- and a pane that
 * went blank over it would hide the one sentence that says how to fix it.
 */
export function configurationNode(root: string): Node {
  let config: RouterConfig;
  try {
    config = loadConfig(undefined, root);
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
  const engines = installedEngines();
  try {
    const transport = explainTransport(config);
    // Read for the transport in force. A model's fidelity is not one fact:
    // the same model on the seat and on the direct-API path is two different
    // questions with two different kinds of answer.
    const fidelity = fidelityOn(root, config, transport.transport);
    const authoring = roleNode(config, ROLE_GENERATOR, null, fidelity);
    const author = authoring["chosen"] as Node | null;
    return {
      transport: {
        effective: transport.transport,
        decidedBy: transport.decidedBy,
        layers: transport.layers.map((layer) => ({ ...layer })),
      },
      // Which transport the fidelity below was read for, said rather than
      // implied: a row that carried an answer without saying what it was an
      // answer about is how the seat's evidence would come to be read as the
      // API's.
      fidelityTransport: transport.transport,
      engines: {
        chosen: engines.chosen,
        reason: engines.reason,
        installed: engines.engines.map((entry) => ({ ...entry })),
      },
      authoring,
      verifying: roleNode(
        config,
        ROLE_VERIFIER,
        author === null ? null : [String(author["provider"])],
        fidelity,
      ),
      records: checkFreshness(config, Date.now(), root).map(recordNode),
    };
  } catch (error) {
    return {
      engines: {
        chosen: engines.chosen,
        reason: engines.reason,
        installed: engines.engines.map((entry) => ({ ...entry })),
      },
      unavailable: error instanceof Error ? error.message : String(error),
    };
  }
}

export function project(root: string): Record<string, unknown> {
  const shape = solutionShape(root);
  const name = basename(resolve(root)) || "solution";
  const granted = grantedSiblings(root);
  const inPlay = modulesInSession(root);
  const runs = runsOfRecord(root, shape);
  // What ships: every bundle record under release/, and per module the
  // bundles that pin its package or are its own.
  const bundles = readBundleRecords(root);
  const shippedIn = (entry: ModuleEntry): string[] =>
    bundles
      .filter(
        (bundle) =>
          bundle.bundle === entry.slug ||
          bundle.from.includes(entry.slug) ||
          (entry.package !== null && bundle.dependencies.some((dependency) => dependency.package === entry.package)),
      )
      .map((bundle) => bundle.bundle);
  const modules: Node[] = shape.modules.map((entry) => {
    const contractDir = contractDirFor(entry.slug);
    return {
      slug: entry.slug,
      title: entry.title,
      kind: entry.kind,
      package: entry.package,
      contract: entry.contract,
      codeRoots: [...entry.codeRoots],
      dependsOn: [...entry.dependsOn],
      // Derived on every projection, declared nowhere.
      usedBy: consumersOf(shape.modules, entry.slug),
      // The folder, when the tree has it; the Explorer opens it and says
      // "not written yet" otherwise. Never claimed for a module that has
      // not declared a seam.
      contractDir:
        entry.contract !== null && existsSync(join(root, contractDir)) ? contractDir : null,
      // A grant in force for this module in the in-flight session: the
      // Explorer badges the row, and offers to end it.
      granted: granted.has(entry.slug),
      // The session working in this module right now, or null: the Explorer
      // marks the row in both windows, the module's and the repository's.
      inSession: inPlay !== null && inPlay.modules.has(entry.slug) ? inPlay.session : null,
      // The latest run of record of the module's suites, and the consumers
      // whose contract suite against it is red.
      runOfRecord: runs.get(entry.slug)?.state ?? "none",
      blocking: [...(runs.get(entry.slug)?.blocking ?? [])],
      shippedIn: shippedIn(entry),
    } satisfies Node;
  });
  const doc: Node = {
    solution: {
      name,
      title: name,
      multi: shape.multi,
      implicit: shape.implicit,
      moduleCount: modules.length,
    },
    modules,
    // What the solution says it ships, from the manifest: a declared
    // deployable no module feeds yet is here with an empty `from`, because
    // that is a true statement about the shape of the solution during
    // decomposition and not a gap in it.
    deployables: shape.deployables.map((deployable) => ({
      slug: deployable.slug,
      title: deployable.title,
      kind: deployable.kind,
      from: [...deployable.from],
      runtime: deployable.runtime,
      publish: deployable.publish,
      declared: deployable.declared,
    })),
    // What ships, as the bundle records under release/ say it; recorded,
    // never executed, and read here rather than restated.
    bundles: bundles.map((bundle) => ({
      bundle: bundle.bundle,
      from: [...bundle.from],
      version: bundle.version,
      baseCommit: bundle.baseCommit,
      date: bundle.date,
      session: bundle.session,
      dependencies: bundle.dependencies.map((dependency) => ({ ...dependency })),
    })),
  };
  // One assembly for both halves of the cross-repository graph. It reads
  // sibling directories and every member's build files, and the projection
  // is written on every recorded event -- doing it twice to answer two
  // questions about the same reading is a cost with nothing bought.
  const members = assembleSolution(root);
  doc.external = externalComponents(root, members);
  doc.members = solutionMembers(members);
  // What a session is run with: read from files, never probed.
  doc.configuration = configurationNode(root);
  return doc;
}

/** Publish the projection the extension renders. */
export function writeProjection(root: string): string {
  const path = projectionPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    platformNewlines(`${dumps(project(root), { indent: 2 })}\n`),
    { encoding: "utf8" },
  );
  return path;
}

/**
 * Write the projection, or leave the event that was just recorded standing.
 *
 * A manifest problem must not swallow an event that is already on the log;
 * `dabbler modules show` surfaces the manifest error plainly when someone
 * asks for it.
 */
export function tryWriteProjection(root: string): void {
  try {
    writeProjection(root);
  } catch (error) {
    if (error instanceof ManifestError) return;
    throw error;
  }
}

/**
 * The components this solution consumes from OTHER repositories.
 *
 * Derived from `solution-dependencies.json` and from nowhere else. The draft
 * had `solution.yaml` gaining vocabulary for external components too, and two
 * tracked homes for one edge is the drift this codebase already refuses for
 * `usedBy`: the manifest says what this repository builds, the dependency
 * file says what it takes, and neither restates the other.
 *
 * The union spans every repository the declarations reach, each owning only
 * its own edges. A→B declared in A and B→C declared in B are two facts in two
 * files, and both are projected -- reading only this repository's edges would
 * show A→B and lose C, which is the cross-repository half of the point.
 *
 * The graph is the UNION of the dependency files across the repositories they
 * name, so a row can say things one repository cannot know alone -- that the
 * pin is behind a release, or that the producer is not on this machine.
 * Nothing here is authored; every field is read.
 */
export function externalComponents(
  root: string,
  members: SolutionMember[] = assembleSolution(root),
): Node[] {
  const self = members[0];
  // Every member's OWN edges, and only its own. A→B declared in A and B→C
  // declared in B are two owner-specific facts, and the graph is the union of
  // them: projecting only this repository's edges shows A→B and discards C,
  // which is the cross-repository half of the feature missing entirely.
  // Nothing is copied between declarations to make this work -- the union is
  // computed on every projection, so there is still one home per edge.
  const owned: Array<{ owner: string; edge: Edge; from: SolutionMember }> = [];
  for (const member of members) {
    if (member.duplicateOf !== null) continue;
    const owner =
      member === self ? (self.deps?.repositoryId ?? "(this repository)") : member.id;
    for (const edge of member.deps?.consumes ?? []) {
      owned.push({ owner, edge, from: member });
    }
  }
  if (owned.length === 0) return [];

  const feeds = configuredFeeds(root);
  const findings = reconcileResolution(members, feeds);
  const consumed = [...new Set(owned.map((entry) => entry.edge.id))];

  // Pins per repository, read from build files on every projection rather
  // than copied into any declaration.
  const pins = new Map<string, Map<string, string>>();
  for (const member of members) {
    if (member.duplicateOf !== null) continue;
    const owner =
      member === self ? (self.deps?.repositoryId ?? "(this repository)") : member.id;
    for (const ref of member.refs) {
      const byRepo = pins.get(ref.id) ?? new Map<string, string>();
      if (ref.version !== null && !byRepo.has(owner)) byRepo.set(owner, ref.version);
      pins.set(ref.id, byRepo);
    }
  }

  const published = new Map<string, string>();
  for (const member of members.slice(1)) {
    if (member.root === null || member.duplicateOf !== null) continue;
    for (const artifact of publishedVersions(member.root, consumed)) {
      const seen = published.get(artifact.packageId);
      if (seen === undefined || (comparePins(seen, artifact.version) ?? 0) < 0) {
        published.set(artifact.packageId, artifact.version);
      }
    }
  }

  const rows: Node[] = [];
  const me = self.deps?.repositoryId ?? "(this repository)";
  for (const id of consumed) {
    const entries = owned.filter((entry) => entry.edge.id === id);
    const edge = entries[0].edge;
    const where = locateProducer(root, edge.producedBy, self.deps?.solution ?? null);
    const release = published.get(id) ?? null;
    const byRepo = pins.get(id) ?? new Map<string, string>();

    // Pin AND drift live on the consumer that owns them. A sibling's pin
    // rendered beside this repository's name, or a sibling's upgrade shown
    // as this repository's, is worse than no row: it is upgrade guidance
    // pointing at the wrong repository.
    const consumers = entries.map((entry) => {
      const version = byRepo.get(entry.owner) ?? null;
      const behind =
        version !== null && release !== null && (comparePins(version, release) ?? 0) < 0;
      return {
        repository: entry.owner,
        version,
        drift: behind
          ? `${entry.owner} pins ${id} at ${version}, and ${release} is published.`
          : null,
        driftKind: behind ? "behind" : null,
      };
    });

    // Only this repository's declaration can be checked against this
    // machine's feeds, so a feed finding is attributed to it and to nothing
    // else.
    const mine = findings.filter((finding) => finding.id === id);
    const feed = entries.some((entry) => entry.owner === me)
      ? mine.find((finding) => finding.kind === "feed-not-configured")
      : undefined;
    const ahead = mine.find((finding) => finding.kind === "producer-source-ahead");

    // The row states a pin only when every consumer agrees on it. Where they
    // disagree, the row says so and the consumer rows carry the versions --
    // collapsing two pins into one number is how a reader is told to upgrade
    // a repository that is already there.
    const versions = new Set(consumers.map((c) => c.version).filter((v) => v !== null));
    const agreed = versions.size === 1 ? [...versions][0] : null;
    const shared = agreed !== null && consumers.every((c) => c.driftKind === "behind");

    rows.push({
      id,
      producedBy: edge.producedBy.id,
      // DERIVED, never declared. `usedBy` has one implementation in this
      // codebase and it is a reading of who consumes what, which is exactly
      // why no declaration is allowed to state it.
      usedBy: entries.map((entry) => entry.owner),
      pins: consumers,
      pinned: agreed,
      published: release,
      resolve: edge.resolve,
      feed: edge.feed ?? null,
      // Where it is on THIS machine, which is what makes the row navigable.
      // Null is a reported state and not a defect in the declaration.
      root: where.path,
      // The two ways the declaration names the same repository, published
      // beside `root` because "not here" is not one state. A known remote
      // nobody has cloned is a command away; a producer nobody has said
      // anything about needs a person to answer where it lives. Collapsing
      // them into one word asks the person in both cases.
      remote: edge.producedBy.remote ?? null,
      declaredPath: edge.producedBy.path ?? null,
      reason: where.path === null ? where.reason : where.warning,
      // At most one, ordered by what it costs the reader: a pin behind a
      // release is an upgrade to do, a producer ahead of its releases is not
      // one yet, and a feed nobody registered is why a restore is about to
      // fail. Stated at row level only when it is true of every consumer.
      drift: shared
        ? (consumers[0].drift ?? null)
        : versions.size > 1
          ? `${id} is pinned ${[...versions].sort().join(" and ")} across ` +
            `${consumers.length} repositories in this solution.`
          : (ahead?.detail ?? feed?.detail ?? null),
      driftKind: shared
        ? "behind"
        : versions.size > 1
          ? "split"
          : ahead
            ? "ahead"
            : feed
              ? "feed"
              : null,
    } satisfies Node);
  }
  return rows;
}

/**
 * Every repository in this solution, including the ones nothing depends on.
 *
 * This is the upstream direction, and it arrives without a second declared
 * one. The operator asked for placemarkers both ways -- "this depends on
 * these" and "these depend on this" -- and the obvious way to get the second
 * is a `usedBy` somebody writes down, which is exactly what this codebase
 * refuses: two hand-kept directions disagree eventually and the disagreement
 * is silent.
 *
 * So a repository appears here because it declares ITSELF a member: its own
 * `solution-dependencies.json` names this solution. That is one home for one
 * fact, owned by the repository the fact is about, and it needs no
 * permission from anybody -- which is why a repository nothing consumes can
 * appear at all, and why `dabbler deps scaffold` can put the next one in
 * front of the operator before it has any content.
 *
 * Both dependency directions stay DERIVED from the same declarations:
 * `provides` is what this repository's own edges take from that member, and
 * `consumes` is what that member's own edges take from this one. Neither is
 * stated anywhere; each is read from the repository that owns it.
 */
export function solutionMembers(members: SolutionMember[]): Node[] {
  const self = members[0];
  const me = self.deps?.repositoryId ?? null;
  // A remote is declared by whoever names the repository as a producer, so
  // it is read across every member's edges rather than off the member
  // itself: a repository does not declare its own remote anywhere.
  const remotes = new Map<string, string>();
  for (const member of members) {
    for (const edge of member.deps?.consumes ?? []) {
      const remote = edge.producedBy.remote;
      if (remote && !remotes.has(edge.producedBy.id)) remotes.set(edge.producedBy.id, remote);
    }
  }

  const rows: Node[] = [];
  for (const member of members) {
    // A second checkout is one member on two branches, and counting it twice
    // is how a stale clone invents a disagreement nobody has.
    if (member.duplicateOf !== null) continue;
    const id = member === self ? (me ?? "(this repository)") : member.id;
    const theirs = member.deps?.consumes ?? [];
    rows.push({
      id,
      self: member === self,
      root: member.root,
      remote: remotes.get(id) ?? null,
      // What this repository takes from that member, off this repository's
      // own declaration.
      provides:
        member === self
          ? []
          : (self.deps?.consumes ?? [])
              .filter((edge) => edge.producedBy.id === id)
              .map((edge) => edge.id),
      // What that member takes from this repository, off ITS declaration.
      // Empty when this repository states no `repositoryId`: nothing can
      // name a repository that has not said what it is called.
      consumes:
        me === null || member === self
          ? []
          : theirs.filter((edge) => edge.producedBy.id === me).map((edge) => edge.id),
      // A placemarker: it says which solution it is in and nothing else yet.
      // The state `deps scaffold` leaves behind, and the state a repository
      // is in for as long as the plan has not reached it.
      shell: member.deps !== null && theirs.length === 0 && member.refs.length === 0,
      reason: member.reason,
    } satisfies Node);
  }
  return rows;
}
