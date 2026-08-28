// Programmatic mocha entry for the @vscode/test-electron harness. The
// same suites run under the vscode stub via `npm run test:unit`; this
// path exists for running them inside a real extension host.

import * as path from "path";
import * as fs from "fs";
import Mocha = require("mocha");

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", timeout: 120000, color: true });
  const suiteDir = __dirname;
  for (const file of fs.readdirSync(suiteDir)) {
    if (file.endsWith(".test.js")) mocha.addFile(path.join(suiteDir, file));
  }
  return new Promise((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} tests failed`)) : resolve(),
    );
  });
}
