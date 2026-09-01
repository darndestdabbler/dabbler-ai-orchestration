// The projection the Explorer reads: the manifest, joined to live state.
//
// TypeScript renders; Python decides -- and once there is one router, the
// projection is still the seam. The extension never folds the event log
// itself, because two implementations of one rule disagree eventually and the
// disagreement shows up as a wrong status nobody can explain.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { platformNewlines } from "../journal.ts";
import { dumps } from "../pythonJson.ts";
import {
  asDict,
  load as loadSolution,
  ManifestError,
  STEP_TITLES,
  STEPS,
} from "../solution.ts";
import {
  assembleSolution,
  locateProducer,
  type Edge,
  type SolutionMember,
} from "../solutionDeps.ts";
import {
  comparePins,
  configuredFeeds,
  publishedVersions,
  reconcileResolution,
} from "../resolution.ts";
import {
  fold,
  projectionPath,
  read,
  type TargetState,
  WorkflowError,
} from "./log.ts";
import {
  reviewCap,
  reviewTerminal,
  runCap,
  runTerminal,
  suiteTerminal,
  TERMINAL_HEADLINES,
} from "./terminal.ts";

type Node = Record<string, unknown>;

/**
 * Publish the loop's position, decided here.
 *
 * The extension is handed the round count, the bound and the terminal token
 * rather than the events, because a second implementation of "has this loop
 * finished" disagrees with the first eventually, and the disagreement shows
 * up as a status nobody can explain.
 */
function projectReviewLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = reviewTerminal(root, state, cap);
  node.reviewRounds = state?.reviewRounds ?? 0;
  node.reviewCap = cap;
  node.reviewTerminal = terminal;
  node.reviewTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/** The tests phase's position, on the same terms and for the same reason. */
function projectTestLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = runTerminal(root, state, cap);
  node.testsAuthored = [...(state?.testsAuthored ?? [])];
  node.testRounds = state?.testRounds ?? 0;
  node.testCap = cap;
  node.testTerminal = terminal;
  node.testTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/**
 * The complete suite's position, and how many fix rounds it cost.
 *
 * The fix count is published beside the round count because the two answer
 * different questions: how close the loop came to its bound, and how much
 * repair the step needed to get there.
 */
function projectSuiteLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = suiteTerminal(root, state, cap);
  node.suiteRounds = state?.suiteRounds ?? 0;
  node.suiteCap = cap;
  node.fixRounds = state?.fixRounds ?? 0;
  node.suiteTerminal = terminal;
  node.suiteTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/** What the Explorer reads: the manifest, joined to live state. */
export function project(root: string): Record<string, unknown> {
  let solution;
  try {
    solution = loadSolution(root);
  } catch (error) {
    if (error instanceof ManifestError) throw new WorkflowError(error.message);
    throw error;
  }

  const state = fold(read(root));
  const cap = reviewCap(root);
  const tcap = runCap(root);
  const doc = asDict(solution);
  const head = doc.solution as Node;
  const solState = state.get("solution");
  head.waitingOn = solState?.waitingOn ?? null;
  head.returns = solState?.returns ?? 0;
  head.reviewers = solState?.reviewers ?? [];
  head.findings = solState?.findings ?? [];
  projectReviewLoop(head, root, solState, cap);
  projectTestLoop(head, root, solState, tcap);
  projectSuiteLoop(head, root, solState, tcap);
  if (solState?.step) {
    head.step = solState.step;
    head.stepTitle = STEP_TITLES[solState.step];
    head.stepNumber = STEPS.indexOf(solState.step) + 1;
  }

  const components = doc.components as Node[];
  for (const c of components) {
    const cs = state.get(String(c.name));
    if (cs?.step) {
      c.step = cs.step;
      c.stepTitle = STEP_TITLES[cs.step];
      c.stepNumber = STEPS.indexOf(cs.step) + 1;
    }
    c.waitingOn = cs?.waitingOn ?? null;
    c.returns = cs?.returns ?? 0;
    c.reviewed = cs?.reviewed ?? false;
    c.approved = cs?.approved ?? false;
    c.reviewers = cs?.reviewers ?? [];
    c.findings = cs?.findings ?? [];
    projectReviewLoop(c, root, cs, cap);
    projectTestLoop(c, root, cs, tcap);
    projectSuiteLoop(c, root, cs, tcap);
  }

  const waiting = components
    .filter((c) => c.waitingOn === "developer")
    .map((c) => c.name);
  if (head.waitingOn === "developer") waiting.unshift(head.name);
  doc.needsYou = waiting;
  // One assembly for both halves of the graph. It reads sibling directories
  // and every member's build files, and the projection is written on every
  // recorded event -- doing it twice to answer two questions about the same
  // reading is a cost with nothing bought.
  const members = assembleSolution(root);
  doc.external = externalComponents(root, members);
  doc.members = solutionMembers(members);
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
 * `status` surfaces the manifest error plainly when someone asks for it.
 */
export function tryWriteProjection(root: string): void {
  try {
    writeProjection(root);
  } catch (error) {
    if (error instanceof WorkflowError || error instanceof ManifestError) return;
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
