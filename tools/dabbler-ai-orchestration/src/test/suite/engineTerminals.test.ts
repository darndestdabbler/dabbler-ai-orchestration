import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  closeFinishedTerminals,
  finishedEngineTerminals,
  rememberEngineTerminal,
} from "../../commands/engineTerminals";

/** A repository whose ledger says each session's status, as `{ number: status }`. */
function repoWith(statuses: Record<number, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engine-terminals-"));
  fs.mkdirSync(path.join(root, "docs", "sessions"), { recursive: true });
  writeLedger(root, statuses);
  return root;
}

function writeLedger(root: string, statuses: Record<number, string>): void {
  const sessions = Object.entries(statuses).map(([number, status]) => ({ number: Number(number), status }));
  fs.writeFileSync(path.join(root, "docs", "sessions", "sessions.json"), JSON.stringify({ sessions }));
}

function open(name: string): vscode.Terminal {
  return vscode.window.createTerminal({ name });
}

suite("engineTerminals", () => {
  const made: vscode.Terminal[] = [];
  const terminal = (name: string): vscode.Terminal => {
    const created = open(name);
    made.push(created);
    return created;
  };

  // Every terminal a test opened is closed after it, so the next test's
  // reading forgets it -- the same path a person closing a tab takes.
  teardown(() => {
    for (const created of made.splice(0)) created.dispose();
    finishedEngineTerminals();
  });

  suite("finishedEngineTerminals", () => {
    test("a terminal is finished only once its session is complete or cancelled", () => {
      const root = repoWith({ 1: "in-progress", 2: "in-progress", 3: "in-progress" });
      const [one, two, three] = [terminal("1"), terminal("2"), terminal("3")];
      rememberEngineTerminal(one, root, 1);
      rememberEngineTerminal(two, root, 2);
      rememberEngineTerminal(three, root, 3);
      assert.deepStrictEqual(finishedEngineTerminals(), []);

      writeLedger(root, { 1: "complete", 2: "in-progress", 3: "cancelled" });
      assert.deepStrictEqual(
        finishedEngineTerminals().map((entry) => entry.terminal),
        [one, three],
      );
    });

    test("a terminal the person closed is forgotten", () => {
      const root = repoWith({ 4: "complete" });
      const closed = terminal("4");
      rememberEngineTerminal(closed, root, 4);
      closed.dispose();
      assert.deepStrictEqual(finishedEngineTerminals(), []);
    });

    test("a terminal never remembered is never reported", () => {
      const root = repoWith({ 5: "complete" });
      const theirs = terminal("the person's own");
      const ours = terminal("5");
      rememberEngineTerminal(ours, root, 5);
      const reported = finishedEngineTerminals().map((entry) => entry.terminal);
      assert.deepStrictEqual(reported, [ours]);
      assert.ok(!reported.includes(theirs));
    });
  });

  suite("closeFinishedTerminals", () => {
    const settings = vscode.workspace as unknown as {
      __setConfig: (section: string, key: string, value: unknown) => void;
      __clearConfig: () => void;
    };
    const window = vscode.window as unknown as { showInformationMessage: (...args: unknown[]) => unknown };
    const shown = window.showInformationMessage;
    let toasts: unknown[][] = [];

    setup(() => {
      toasts = [];
      window.showInformationMessage = async (...args: unknown[]) => {
        toasts.push(args);
        return undefined;
      };
    });
    teardown(() => {
      window.showInformationMessage = shown;
      settings.__clearConfig();
    });

    const disposed = (t: vscode.Terminal) => (t as unknown as { disposed: number }).disposed > 0;

    test("with the default limit a fourth terminal closes the oldest, with an information toast naming it", () => {
      // The current session's terminal and two finished ones may be open.
      const root = repoWith({ 11: "complete", 12: "complete", 13: "complete", 14: "in-progress" });
      const [first, second, third, fourth] = [11, 12, 13, 14].map((n) => {
        const opened = terminal(String(n));
        rememberEngineTerminal(opened, root, n);
        return opened;
      });
      closeFinishedTerminals();
      assert.ok(disposed(first));
      assert.ok(![second, third, fourth].some(disposed));
      assert.deepStrictEqual(toasts, [
        ["Closed 1 earlier session terminal (session 11) to free memory.", "Change limit"],
      ]);
    });

    test("a limit of 0 closes a terminal when its session closes", () => {
      settings.__setConfig("dabbler", "keepFinishedSessionTerminals", 0);
      const root = repoWith({ 21: "in-progress" });
      const opened = terminal("21");
      rememberEngineTerminal(opened, root, 21);
      closeFinishedTerminals();
      assert.ok(!disposed(opened));

      writeLedger(root, { 21: "complete" });
      closeFinishedTerminals();
      assert.ok(disposed(opened));
      assert.strictEqual(toasts.length, 1);
    });

    test("nothing closes and no toast appears within the limit", () => {
      const root = repoWith({ 31: "complete", 32: "cancelled" });
      const both = [31, 32].map((n) => {
        const opened = terminal(String(n));
        rememberEngineTerminal(opened, root, n);
        return opened;
      });
      closeFinishedTerminals();
      assert.ok(!both.some(disposed));
      assert.deepStrictEqual(toasts, []);
    });

    test("in-progress terminals and the person's own are never disposed", () => {
      settings.__setConfig("dabbler", "keepFinishedSessionTerminals", 0);
      const root = repoWith({ 41: "in-progress", 42: "complete" });
      const theirs = terminal("the person's own");
      const running = terminal("41");
      const finished = terminal("42");
      rememberEngineTerminal(running, root, 41);
      rememberEngineTerminal(finished, root, 42);
      closeFinishedTerminals();
      assert.ok(disposed(finished));
      assert.ok(!disposed(running));
      assert.ok(!disposed(theirs));
    });

    test("a terminal closed before or during the check is no error, and the new terminal still opens", () => {
      settings.__setConfig("dabbler", "keepFinishedSessionTerminals", 0);
      const root = repoWith({ 51: "complete", 52: "complete" });
      const before = terminal("51");
      const during = terminal("52");
      rememberEngineTerminal(before, root, 51);
      rememberEngineTerminal(during, root, 52);
      before.dispose();
      // The person's close lands after the terminals were listed and before
      // Dabbler disposes them: the setting is read in between.
      const workspace = vscode.workspace as unknown as { getConfiguration: (section: string) => unknown };
      const read = workspace.getConfiguration;
      workspace.getConfiguration = (section: string) => {
        during.dispose();
        return read(section);
      };
      try {
        assert.doesNotThrow(() => closeFinishedTerminals());
      } finally {
        workspace.getConfiguration = read;
      }
      const next = terminal("53");
      assert.ok(vscode.window.terminals.includes(next));
      assert.deepStrictEqual(finishedEngineTerminals(), []);
    });
  });
});
