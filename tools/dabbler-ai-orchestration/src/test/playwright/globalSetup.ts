// Ensure the VS Code test binary exists under .vscode-test before any
// spec launches Electron. Downloads once; subsequent runs hit the cache.

import * as path from "path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

export default async function globalSetup(): Promise<void> {
  const cachePath = path.resolve(__dirname, "..", "..", "..", ".vscode-test");
  await downloadAndUnzipVSCode({ cachePath });
}
