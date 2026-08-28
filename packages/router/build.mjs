// The CLI is bundled, not compiled file-by-file: one file with no runtime
// resolution is what survives being dropped into a VSIX. Source stays ES
// module syntax under `tsc --strict`; this is the only place the two
// spellings meet.
//
// `.cjs`, not `.js`: the package is `"type": "module"` so that Node can run
// the TypeScript sources directly, and under that a `.js` file is an ES
// module whatever is inside it. The extension is bundled as CommonJS.

import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/dabbler.ts"],
  bundle: true,
  outfile: "dist/dabbler.cjs",
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  // The three runtime dependencies stay external: they are installed
  // beside the package, and bundling them would hide a fourth arriving.
  external: ["yaml", "ajv", "smol-toml"],
}).catch(() => process.exit(1));
