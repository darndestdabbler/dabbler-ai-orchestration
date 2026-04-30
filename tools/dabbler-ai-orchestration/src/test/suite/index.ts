import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname);
  for (const f of fs.readdirSync(testsRoot).filter((n) => n.endsWith(".test.js"))) {
    mocha.addFile(path.resolve(testsRoot, f));
  }
  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) reject(new Error(`${failures} tests failed.`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
