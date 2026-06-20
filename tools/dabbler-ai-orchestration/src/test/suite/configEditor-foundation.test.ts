import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { readYamlFile, writeYamlFile, parseDocumentFromText } from "../../configEditor/yamlReadWrite";
import { validateBatch } from "../../configEditor/schemaValidator";
import { ConfigEditorPanel } from "../../configEditor/ConfigEditorPanel";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-foundation-test-"));
}

suite("configEditor-foundation — save-time atomicity", () => {
  test("writeYamlFile produces the target file, not a .tmp", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "test.yaml");
    const doc = parseDocumentFromText("key: value\n");
    writeYamlFile(filePath, doc);
    assert.ok(fs.existsSync(filePath), "target file should exist");
    assert.ok(!fs.existsSync(filePath + ".tmp"), ".tmp should be cleaned up");
    fs.rmSync(dir, { recursive: true });
  });

  test("writeYamlFile overwrites existing file atomically", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "test.yaml");
    fs.writeFileSync(filePath, "old: data\n", "utf8");
    const doc = parseDocumentFromText("new: data\n");
    writeYamlFile(filePath, doc);
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(content.includes("new: data"));
    assert.ok(!content.includes("old: data"));
    fs.rmSync(dir, { recursive: true });
  });

  test("writeYamlFile preserves comments", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "test.yaml");
    const yaml = "# my comment\nkey: value\n";
    const doc = parseDocumentFromText(yaml);
    writeYamlFile(filePath, doc);
    const written = fs.readFileSync(filePath, "utf8");
    assert.ok(written.includes("# my comment"), "comment should be preserved in written file");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("configEditor-foundation — load-time validation", () => {
  test("validateBatch returns valid for well-formed config files", () => {
    const dir = makeTmpDir();
    const rcPath = path.join(dir, "router-config.yaml");
    const budgetPath = path.join(dir, "budget.yaml");

    fs.writeFileSync(rcPath, [
      "providers:",
      "  anthropic:",
      "    api_key_env: DABBLER_ANTHROPIC_API_KEY",
    ].join("\n"), "utf8");

    fs.writeFileSync(budgetPath, "threshold_usd: 10\n", "utf8");

    const rc = readYamlFile(rcPath);
    const budget = readYamlFile(budgetPath);

    assert.ok(rc !== null);
    assert.ok(budget !== null);

    const result = validateBatch({
      routerConfig: rc.doc.toJSON() as Record<string, unknown>,
      budget: budget.doc.toJSON() as Record<string, unknown>,
      localOverrides: null,
    });

    assert.ok(result.valid, `Expected valid, got: ${JSON.stringify(result.errors)}`);
    fs.rmSync(dir, { recursive: true });
  });

  test("validateBatch surfaces drift in budget file (negative threshold)", () => {
    const budget = { threshold_usd: -1 };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.file === "budget.yaml"));
  });

  test("validateBatch surfaces dangling model provider reference", () => {
    const routerConfig = {
      providers: { anthropic: { api_key_env: "DABBLER_ANTHROPIC_API_KEY" } },
      models: { "bad-model": { provider: "nonexistent" } },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.message.includes("nonexistent")));
  });
});

suite("configEditor-foundation — panel lifecycle", () => {
  test("createOrShow registers currentPanel", async function () {
    this.timeout(5000);
    assert.strictEqual(ConfigEditorPanel.currentPanel, undefined);

    const context = {
      extensionUri: vscode.Uri.file(path.resolve(__dirname, "../../..")),
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    ConfigEditorPanel.createOrShow(context);
    assert.ok(ConfigEditorPanel.currentPanel !== undefined, "currentPanel should be set after createOrShow");

    // Clean up
    const panel = ConfigEditorPanel.currentPanel;
    (panel as unknown as { _panel: { dispose: () => void } })._panel.dispose();
    // Give the dispose event a tick to fire
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(ConfigEditorPanel.currentPanel, undefined, "currentPanel should be cleared after dispose");
  });
});
