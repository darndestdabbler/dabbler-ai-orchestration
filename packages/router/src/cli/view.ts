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
import {
  hasSessionsRoot,
  sessionsDirOf,
  workExplorerRepository,
  workExplorerTree,
  type WorkExplorerEntry,
} from "../views/workExplorer.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const VIEWS = ["work-explorer", "configuration"] as const;

function usage(): string {
  return [
    "usage: dabbler view [-h] work-explorer --repo-root PATH [--repo-root PATH ...]",
    "       dabbler view [-h] configuration [--repo-root PATH]",
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
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

interface Parsed {
  readonly view: (typeof VIEWS)[number];
  readonly roots: readonly string[];
}

/** The arguments, or the one sentence saying why they are not arguments. */
export function parseViewArgs(argv: readonly string[]): Parsed | string {
  const [view, ...rest] = argv;
  if (view === undefined) return `name a view: ${VIEWS.join(", ")}`;
  if (!(VIEWS as readonly string[]).includes(view)) return `unknown view: ${view}`;
  const roots: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
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
  return { view: view as Parsed["view"], roots };
}

/**
 * One repository's entry: its progress reading, or -- where the reading
 * failed -- the repository with no sessions and the reason it has none.
 */
function entryFor(root: string): WorkExplorerEntry {
  try {
    const reading = buildProjection(sessionsDirOf(root)) as unknown as ProgressProjection;
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
  if (parsed.view === "configuration") {
    const root = parsed.roots[0] ?? null;
    writeOut(`${JSON.stringify(configurationView(root, readConfiguration(root)), null, 2)}\n`);
    return Promise.resolve(EXIT_OK);
  }
  const entries = parsed.roots.filter((root) => hasSessionsRoot(root)).map(entryFor);
  writeOut(`${JSON.stringify(workExplorerTree(entries), null, 2)}\n`);
  return Promise.resolve(EXIT_OK);
}
