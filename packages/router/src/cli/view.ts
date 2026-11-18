// `dabbler view <view>` -- what an interface shows, as data.
//
// The rows an interface renders and the rules that decide them -- the words,
// the icons, which actions a row offers and what each runs -- worked out once,
// here, and printed as JSON for an interface that is not this package's own.
// It reads records and prints; it dispatches nothing and bills nothing. Which
// folders are repositories is the interface's to say, since only it knows
// what is open, so each is named with --repo-root.

import * as path from "node:path";

import { buildProjection } from "../progress.ts";
import type { ProgressProjection } from "../generated/progress-projection.ts";
import { configurationView, readConfiguration } from "../views/configuration.ts";
import { follow, followedPaths } from "../views/follow.ts";
import {
  hasSessionsRoot,
  sessionsDirOf,
  workExplorerRepository,
  workExplorerTree,
  type WorkExplorerEntry,
} from "../views/workExplorer.ts";
import { writeErr, writeOut } from "./output.ts";
import { parseStalledAfterSeconds } from "./status.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const VIEWS = ["work-explorer", "configuration"] as const;

function usage(): string {
  return [
    "usage: dabbler view [-h] work-explorer --repo-root PATH [--repo-root PATH ...]",
    "                            [--stalled-after-seconds N] [--follow]",
    "       dabbler view [-h] configuration [--repo-root PATH] [--follow]",
    "",
    "  Print a view as JSON, as an interface renders it, and exit. Reads records;",
    "  spends nothing.",
    "",
    "views:",
    "  work-explorer            the Work Explorer's whole tree: each repository, its",
    "                           buckets, its sessions, and under a session its tasks,",
    "                           verification, findings and what needs attention; each",
    "                           row with its words, icon, the command a click runs and",
    "                           its actions (schemas/work-explorer.schema.json)",
    "  configuration            the Configuration section: Authoring AI, Reviewing AI",
    "                           and API Keys and their rows, each with its value, the",
    "                           layer that decided it and its actions; the catalog's",
    "                           age is on the root's tooltip. With no --repo-root,",
    "                           this machine's defaults alone",
    "                           (schemas/configuration-view.schema.json)",
    "",
    "options:",
    "  --repo-root PATH         a repository to show; work-explorer takes it more",
    "                           than once, and a folder with no sessions root shows",
    "                           nothing; configuration takes it at most once",
    "  --stalled-after-seconds N",
    "                           work-explorer: judge an outstanding instruction",
    "                           stalled after N seconds, rather than after each",
    "                           repository's own threshold",
    "  --follow                 print the view as one line of JSON, then print it",
    "                           again, whole, whenever a file it is read from",
    "                           changes, until interrupted; changes close together",
    "                           print once",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

interface Parsed {
  readonly view: (typeof VIEWS)[number];
  readonly roots: readonly string[];
  readonly follow: boolean;
  /** work-explorer only; undefined lets each repository's own threshold decide. */
  readonly stalledAfterSeconds?: number;
}

/** The arguments, or the one sentence saying why they are not arguments. */
export function parseViewArgs(argv: readonly string[]): Parsed | string {
  const [view, ...rest] = argv;
  if (view === undefined) return `name a view: ${VIEWS.join(", ")}`;
  if (!(VIEWS as readonly string[]).includes(view)) return `unknown view: ${view}`;
  const roots: string[] = [];
  let follow = false;
  let stalledAfterSeconds: number | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--follow") {
      follow = true;
      continue;
    }
    if (token === "--stalled-after-seconds") {
      if (view !== "work-explorer") return "--stalled-after-seconds is work-explorer's: the configuration has no stalled reading";
      const seconds = parseStalledAfterSeconds(rest[index + 1]);
      if (typeof seconds === "string") return seconds;
      stalledAfterSeconds = seconds;
      index += 1;
      continue;
    }
    if (token === "--repo-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) return "--repo-root takes a path";
      roots.push(path.resolve(value));
      index += 1;
      continue;
    }
    return `unrecognized arguments: ${token}`;
  }
  if (view === "work-explorer" && roots.length === 0) return "work-explorer needs at least one --repo-root";
  if (view === "configuration" && roots.length > 1) return "configuration takes at most one --repo-root";
  return {
    view: view as Parsed["view"],
    roots,
    follow,
    ...(stalledAfterSeconds === undefined ? {} : { stalledAfterSeconds }),
  };
}

/**
 * One repository's entry: its progress reading, or -- where the reading
 * failed -- the repository with no sessions and the reason it has none.
 */
function entryFor(root: string, stalledAfterSeconds: number | undefined): WorkExplorerEntry {
  try {
    const reading = buildProjection(sessionsDirOf(root), { stalledAfterSeconds }) as unknown as ProgressProjection;
    return { repository: workExplorerRepository(root, reading), error: null };
  } catch (error) {
    const said = (error instanceof Error ? error.message : String(error)).trim();
    return {
      repository: workExplorerRepository(root, null),
      error: `The session record could not be read: ${said || "no reason was given"}`,
    };
  }
}

export function viewVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return Promise.resolve(EXIT_OK);
  }
  const parsed = parseViewArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler view: ${parsed}\n`);
    return Promise.resolve(EXIT_USAGE);
  }
  const render = (): unknown => {
    if (parsed.view === "configuration") {
      const root = parsed.roots[0] ?? null;
      return configurationView(root, readConfiguration(root));
    }
    return workExplorerTree(
      parsed.roots.filter((root) => hasSessionsRoot(root)).map((root) => entryFor(root, parsed.stalledAfterSeconds)),
    );
  };
  if (!parsed.follow) {
    writeOut(`${JSON.stringify(render(), null, 2)}\n`);
    return Promise.resolve(EXIT_OK);
  }
  // One whole document to a line, so a reader takes each line as the view.
  const stop = follow(
    () => followedPaths(parsed.view, parsed.roots),
    () => writeOut(`${JSON.stringify(render())}\n`),
  );
  return new Promise((resolve) => {
    process.once("SIGINT", () => {
      stop();
      resolve(EXIT_OK);
    });
  });
}
