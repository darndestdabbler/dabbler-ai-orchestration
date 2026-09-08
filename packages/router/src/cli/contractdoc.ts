// `dabbler contractdoc` -- render a contract, to stdout or to a file.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { loadConfig } from "../config.ts";
import {
  type ContractGraph,
  ContractError,
  EXIT_OK,
  EXIT_REFUSED,
  load,
  render,
  renderModuleContract,
} from "../contractdoc.ts";
import { platformNewlines } from "../journal.ts";
import { consumersOf, moduleConfigs, solutionShape } from "../modules.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler contractdoc [-h] [--workspace-root WORKSPACE_ROOT] [-o OUT]",
    "                           (contract | --module SLUG)",
    "",
    "positional arguments:",
    "  contract              path to a contract.yaml",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --module SLUG         render the module's contract bundle instead: the notes",
    "                        page modules/<slug>/contract/README.md (with a",
    "                        contract.yaml beside it rendered in), and for a designed",
    "                        or generated contract the surface page",
    "                        modules/<slug>/contract/<Package>.api.md, written there",
    "  --workspace-root WORKSPACE_ROOT",
    "                        read docs/modules.yaml from here for the diagram",
    "  -o OUT, --out OUT     write here instead of stdout (or instead of the api page)",
    "",
  ].join("\n");
}

/** `--module`: the bundle, rendered and written where the Explorer reads it. */
function runModule(workspaceRoot: string, slug: string, out: string | null): number {
  let shape;
  try {
    shape = solutionShape(workspaceRoot);
  } catch (error) {
    writeErr(`refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_REFUSED;
  }
  let generate: readonly string[] | null = null;
  try {
    generate = moduleConfigs(loadConfig(undefined, workspaceRoot), shape.modules).get(slug)?.contractGenerate ?? null;
  } catch (error) {
    writeErr(`refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_REFUSED;
  }
  let bundle;
  try {
    bundle = renderModuleContract(workspaceRoot, shape, slug, { generate });
  } catch (error) {
    if (error instanceof ContractError) {
      writeErr(`refused: ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }
  // The bundle on disk: the notes page -- rendered into README.md from the
  // contract.yaml beside it when the module keeps one, left as the author
  // wrote it otherwise -- and the surface page for a designed or generated
  // contract. Each written file is named.
  if (bundle.notesRendered) {
    const notesTarget = join(workspaceRoot, bundle.notesPath);
    mkdirSync(dirname(notesTarget), { recursive: true });
    writeFileSync(notesTarget, platformNewlines(bundle.notes), { encoding: "utf8" });
    writeOut(`wrote ${bundle.notesPath} (from contract.yaml)\n`);
  } else {
    writeOut(`kept ${bundle.notesPath} (written by hand; no contract.yaml beside it)\n`);
  }
  if (bundle.api === null || bundle.apiPath === null) {
    // A package contract has no surface page: the notes page is the bundle.
    if (out !== null) {
      writeFileSync(out, platformNewlines(bundle.notes), { encoding: "utf8" });
      writeOut(`wrote ${out}\n`);
    }
    return EXIT_OK;
  }
  const target = out ?? join(workspaceRoot, bundle.apiPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, platformNewlines(bundle.api), { encoding: "utf8" });
  writeOut(`wrote ${out ?? bundle.apiPath} (${bundle.mode})\n`);
  return EXIT_OK;
}

/**
 * The contract's place in the module graph, from the manifest: the module
 * whose slug or package the contract names, its declared `dependsOn` and
 * its derived consumers. A single-module solution has no graph to draw,
 * and neither does a contract for something the manifest does not declare.
 */
function graphFor(workspaceRoot: string, component: string): ContractGraph | null {
  let shape;
  try {
    shape = solutionShape(workspaceRoot);
  } catch {
    return null;
  }
  if (!shape.multi) return null;
  const entry = shape.modules.find(
    (module) => module.slug === component || module.package === component,
  );
  if (entry === undefined) return null;
  return {
    dependsOn: [...entry.dependsOn],
    usedBy: consumersOf(shape.modules, entry.slug),
  };
}

export function contractdocVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  let contract: string | null = null;
  let workspaceRoot = ".";
  let out: string | null = null;
  let module: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--workspace-root" || token === "-o" || token === "--out" || token === "--module") {
      const value = argv[i + 1];
      if (value === undefined) {
        writeErr(
          `${usage()}dabbler contractdoc: error: argument ${token}: ` +
            "expected one argument\n",
        );
        return EXIT_USAGE;
      }
      if (token === "--workspace-root") workspaceRoot = value;
      else if (token === "--module") module = value;
      else out = value;
      i += 1;
    } else if (contract === null && !token.startsWith("-")) {
      contract = token;
    } else {
      writeErr(
        `${usage()}dabbler contractdoc: error: unrecognized arguments: ${token}\n`,
      );
      return EXIT_USAGE;
    }
  }

  if (module !== null) {
    if (contract !== null) {
      writeErr("dabbler contractdoc: error: --module takes no contract path\n");
      return EXIT_USAGE;
    }
    return runModule(workspaceRoot, module, out);
  }

  if (contract === null) {
    writeErr(
      `${usage()}dabbler contractdoc: error: the following arguments are ` +
        "required: contract or --module\n",
    );
    return EXIT_USAGE;
  }

  let document;
  try {
    document = load(contract);
  } catch (error) {
    if (error instanceof ContractError) {
      writeErr(`refused: ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }

  // The diagram is a bonus; a missing or single-module manifest draws none.
  const graph = graphFor(workspaceRoot, String(document.component));

  const text = render(document, graph);
  if (out !== null) {
    writeFileSync(out, platformNewlines(text), { encoding: "utf8" });
    writeOut(`wrote ${out}\n`);
  } else {
    // `sys.stdout.write`, not `print`: the rendered document ends with its own
    // newline and a second one would be a blank line the file does not have.
    writeOut(text);
  }
  return EXIT_OK;
}
