// Two bundles, not compiled file-by-file: one file with no runtime
// resolution is what survives being dropped into a VSIX. Source stays ES
// module syntax under `tsc --strict`; this is the only place the two
// spellings meet.
//
// `.cjs`, not `.js`: the package is `"type": "module"` so that Node can run
// the TypeScript sources directly, and under that a `.js` file is an ES
// module whatever is inside it. The extension is bundled as CommonJS.
//
// `dabbler.cjs` is the command; `index.cjs` is the library, and it exists
// because a CommonJS consumer cannot `require` this package's sources —
// `"type": "module"` makes every `.ts` in this scope an ES module. Types
// still come from `src/index.ts` (see `types` in package.json), so a
// consumer type-checks against the source and links against the bundle,
// and there is no generated declaration to go stale between them.

import { build } from "esbuild";

// `import.meta.url` does not exist in CommonJS, and esbuild would replace it
// with nothing -- so a module that locates itself by it (`src/paths.ts`, and
// through it every read of the bundled config and the schemas) resolves
// `undefined` and the command dies on its first line. The banner computes the
// same value from `__filename`, and the define points the source's spelling
// at it. One statement of it, in the only place the two module systems meet.
const MODULE_URL = "__routerModuleUrl";
const MODULE_URL_BANNER =
  `const ${MODULE_URL} = require("url").pathToFileURL(__filename).href;`;

// The three runtime dependencies stay external: they are installed
// beside the package, and bundling them would hide a fourth arriving.
const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  external: ["yaml", "ajv", "smol-toml"],
  define: { "import.meta.url": MODULE_URL },
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/cli/dabbler.ts"],
    outfile: "dist/dabbler.cjs",
    banner: { js: `#!/usr/bin/env node\n${MODULE_URL_BANNER}` },
  }),
  build({
    ...shared,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.cjs",
    banner: { js: MODULE_URL_BANNER },
  }),
]).catch(() => process.exit(1));
