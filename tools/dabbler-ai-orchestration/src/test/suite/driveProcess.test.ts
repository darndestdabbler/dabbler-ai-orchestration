// The driver as a child process: the bundled command on the editor's own
// Node, its lines handed over as they arrive, its exit code kept.

import * as assert from "assert";
import * as path from "path";
import { driveCommand, launchDriver } from "../../router/driveProcess";
import { makeTempDir, rmrf, writeFileTree } from "./helpers";

suite("the driver process", () => {
  test("runs the bundled command as Node, streams both of its streams line by line, and keeps its exit code", async () => {
    const dir = makeTempDir("dabbler-drive-");
    try {
      // A stand-in for dabbler.cjs: prints across chunk boundaries, on both
      // streams, then exits with a code the caller must see.
      writeFileTree(dir, {
        "cli.cjs":
          "process.stdout.write('dabbler [t] engine-invoked seq=1\\n  \\u2502 thinking');\n" +
          "process.stdout.write(' about it\\n');\n" +
          "process.stderr.write('dabbler: STOPPED (interrupted)\\n');\n" +
          "process.stdout.write('tail without newline');\n" +
          "process.exit(3);\n",
      });
      const launch = {
        execPath: process.execPath,
        cli: path.join(dir, "cli.cjs"),
        cwd: dir,
        args: ["session", "drive", "--engine", "claude-code"],
      };
      // The same Node the shim uses, told to be Node.
      const command = driveCommand(launch);
      assert.deepStrictEqual(command.argv, [process.execPath, launch.cli, ...launch.args]);
      assert.strictEqual(command.env["ELECTRON_RUN_AS_NODE"], "1");

      const lines: string[] = [];
      const handle = launchDriver(launch, (line) => lines.push(line));
      assert.strictEqual(handle.root, dir);
      assert.strictEqual(await handle.exited, 3);
      // One stream's lines keep their order; the two streams are not
      // ordered against each other, and no reader should depend on it.
      assert.deepStrictEqual(
        lines.filter((line) => !line.startsWith("dabbler: ")),
        ["dabbler [t] engine-invoked seq=1", "  │ thinking about it", "tail without newline"],
      );
      assert.ok(lines.includes("dabbler: STOPPED (interrupted)"));
    } finally {
      rmrf(dir);
    }
  });
});
