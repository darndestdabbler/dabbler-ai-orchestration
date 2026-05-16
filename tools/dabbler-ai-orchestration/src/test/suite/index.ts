import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

function findTestFiles(dir: string): string[] {
  // Set 027 Session 3: e2e tree-provider tests live under
  // suite/e2e/, so the discovery walk has to recurse one level. Kept
  // depth-unbounded so future test groupings (e.g. suite/integration/)
  // are picked up without another runner change.
  //
  // Verifier (Round A): sort directory entries for deterministic test
  // ordering. readdir() order is filesystem-dependent and would
  // otherwise yield non-reproducible failure orderings across platforms.
  const out: string[] = [];
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const abs = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(abs));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      out.push(abs);
    }
  }
  return out;
}

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname);
  for (const f of findTestFiles(testsRoot).sort()) {
    mocha.addFile(f);
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
