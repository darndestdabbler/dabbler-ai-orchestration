"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const yamlReadWrite_1 = require("../../configEditor/yamlReadWrite");
const schemaValidator_1 = require("../../configEditor/schemaValidator");
const ConfigEditorPanel_1 = require("../../configEditor/ConfigEditorPanel");
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-foundation-test-"));
}
suite("configEditor-foundation — save-time atomicity", () => {
    test("writeYamlFile produces the target file, not a .tmp", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "test.yaml");
        const doc = (0, yamlReadWrite_1.parseDocumentFromText)("key: value\n");
        (0, yamlReadWrite_1.writeYamlFile)(filePath, doc);
        assert.ok(fs.existsSync(filePath), "target file should exist");
        assert.ok(!fs.existsSync(filePath + ".tmp"), ".tmp should be cleaned up");
        fs.rmSync(dir, { recursive: true });
    });
    test("writeYamlFile overwrites existing file atomically", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "test.yaml");
        fs.writeFileSync(filePath, "old: data\n", "utf8");
        const doc = (0, yamlReadWrite_1.parseDocumentFromText)("new: data\n");
        (0, yamlReadWrite_1.writeYamlFile)(filePath, doc);
        const content = fs.readFileSync(filePath, "utf8");
        assert.ok(content.includes("new: data"));
        assert.ok(!content.includes("old: data"));
        fs.rmSync(dir, { recursive: true });
    });
    test("writeYamlFile preserves comments", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "test.yaml");
        const yaml = "# my comment\nkey: value\n";
        const doc = (0, yamlReadWrite_1.parseDocumentFromText)(yaml);
        (0, yamlReadWrite_1.writeYamlFile)(filePath, doc);
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
            "    api_key_env: ANTHROPIC_API_KEY",
        ].join("\n"), "utf8");
        fs.writeFileSync(budgetPath, "threshold_usd: 10\n", "utf8");
        const rc = (0, yamlReadWrite_1.readYamlFile)(rcPath);
        const budget = (0, yamlReadWrite_1.readYamlFile)(budgetPath);
        assert.ok(rc !== null);
        assert.ok(budget !== null);
        const result = (0, schemaValidator_1.validateBatch)({
            routerConfig: rc.doc.toJSON(),
            budget: budget.doc.toJSON(),
            localOverrides: null,
        });
        assert.ok(result.valid, `Expected valid, got: ${JSON.stringify(result.errors)}`);
        fs.rmSync(dir, { recursive: true });
    });
    test("validateBatch surfaces drift in budget file (negative threshold)", () => {
        const budget = { threshold_usd: -1 };
        const result = (0, schemaValidator_1.validateBatch)({
            routerConfig: null,
            budget: budget,
            localOverrides: null,
        });
        assert.ok(!result.valid);
        assert.ok(result.errors.some((e) => e.file === "budget.yaml"));
    });
    test("validateBatch surfaces dangling model provider reference", () => {
        const routerConfig = {
            providers: { anthropic: { api_key_env: "ANTHROPIC_API_KEY" } },
            models: { "bad-model": { provider: "nonexistent" } },
        };
        const result = (0, schemaValidator_1.validateBatch)({
            routerConfig: routerConfig,
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
        assert.strictEqual(ConfigEditorPanel_1.ConfigEditorPanel.currentPanel, undefined);
        const context = {
            extensionUri: vscode.Uri.file(path.resolve(__dirname, "../../..")),
            subscriptions: [],
        };
        ConfigEditorPanel_1.ConfigEditorPanel.createOrShow(context);
        assert.ok(ConfigEditorPanel_1.ConfigEditorPanel.currentPanel !== undefined, "currentPanel should be set after createOrShow");
        // Clean up
        const panel = ConfigEditorPanel_1.ConfigEditorPanel.currentPanel;
        panel._panel.dispose();
        // Give the dispose event a tick to fire
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(ConfigEditorPanel_1.ConfigEditorPanel.currentPanel, undefined, "currentPanel should be cleared after dispose");
    });
});
//# sourceMappingURL=configEditor-foundation.test.js.map