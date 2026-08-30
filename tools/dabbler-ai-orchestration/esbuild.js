// What ships in the VSIX: the extension, the `dabbler` command, and the
// router's bundled data.
//
// The router is a workspace dependency, and `.vscodeignore` excludes
// `node_modules` — a VSIX carries `dist/` and the manifest and nothing
// else. So everything the extension needs at run time is produced here,
// beside `extension.js`:
//
//   extension.js   the extension, with the router bundled into it
//   dabbler.cjs    the same router as a command, for the terminal shim
//   package.json   what that bundle IS, so it can find its own data
//   schemas/ …     the data both of them read
//
// **`vsce package` is run with `--no-dependencies`, and that is not a
// convenience.** vsce otherwise collects the manifest's runtime
// dependencies into the VSIX, and under npm workspaces
// `node_modules/dabbler-ai-router` is a SYMLINK to `packages/router`. vsce
// follows it out of the extension root and emits entries like
// `extension/../../STATUS.md`, which it then refuses as an invalid relative
// path — so the package step fails outright rather than shipping something
// wrong. Nothing is lost by skipping the collection: esbuild has already
// bundled every dependency into the two files below, and `.vscodeignore`
// excludes `node_modules` anyway.
//
// **The stamped `package.json` is the load-bearing part.** `paths.ts`
// locates the router's data by walking up for a `package.json` NAMING the
// router. In a checkout that finds `packages/router`; inside a VSIX the
// nearest one above `dist/extension.js` is the extension's, and the walk
// would run off the top. Writing a two-line manifest that says what the
// bundle is makes `dist/` the package root, which is exactly where the
// copied data sits. It is also where `version.ts` reads the stamp every
// record carries, so the copy cannot claim a version the source did not.

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");

const routerRoot = path.dirname(require.resolve("dabbler-ai-router/package.json"));
const routerManifest = JSON.parse(
  fs.readFileSync(path.join(routerRoot, "package.json"), "utf8"),
);
const outDir = path.join(__dirname, "dist");

/**
 * The router's runtime data, as its own manifest declares it. Taken from
 * `files` rather than listed again here: a fifth asset added there and not
 * copied here would be a file the VSIX silently lacks, and the failure
 * would be a schema that cannot be loaded on someone else's machine.
 */
const ASSETS = routerManifest.files.filter(
  (entry) => entry !== "dist" && entry !== "src",
);

// `import.meta.url` does not exist in CommonJS, and esbuild would replace it
// with nothing -- so a module that locates itself by it (`paths.ts`, and
// through it every read of the bundled config and the schemas) resolves
// `undefined` and dies on its first call. The banner computes the same value
// from `__filename`; the define points the source's spelling at it.
const MODULE_URL = "__routerModuleUrl";
const MODULE_URL_BANNER =
  `const ${MODULE_URL} = require("url").pathToFileURL(__filename).href;`;

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  // The floor the extension host was measured at (D131) and the router's
  // own `engines.node`. They are one number: the router runs in the host.
  target: "node22",
  sourcemap: true,
  minify: false,
  define: { "import.meta.url": MODULE_URL },
  banner: { js: MODULE_URL_BANNER },
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    external: ["vscode"],
  },
  {
    ...shared,
    entryPoints: [path.join(routerRoot, "src", "cli", "dabbler.ts")],
    outfile: "dist/dabbler.cjs",
    banner: { js: `#!/usr/bin/env node\n${MODULE_URL_BANNER}` },
  },
];

function copyRouterRuntime() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const asset of ASSETS) {
    const from = path.join(routerRoot, asset);
    if (!fs.existsSync(from)) {
      throw new Error(`the router declares '${asset}' and it is not there`);
    }
    fs.cpSync(from, path.join(outDir, asset), { recursive: true });
  }
  fs.writeFileSync(
    path.join(outDir, "package.json"),
    `${JSON.stringify({ name: routerManifest.name, version: routerManifest.version }, null, 2)}\n`,
    "utf8",
  );
}

if (watch) {
  copyRouterRuntime();
  Promise.all(builds.map((options) => esbuild.context(options)))
    .then((contexts) => Promise.all(contexts.map((ctx) => ctx.watch())))
    .then(() => console.log("Watching for changes..."));
} else {
  Promise.all(builds.map((options) => esbuild.build(options)))
    .then(copyRouterRuntime)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
