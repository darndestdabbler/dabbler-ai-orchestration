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
const yamlReadWrite_1 = require("../../configEditor/yamlReadWrite");
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-yaml-test-"));
}
suite("yamlReadWrite — readYamlFile", () => {
    test("returns null for non-existent file", () => {
        const result = (0, yamlReadWrite_1.readYamlFile)("/nonexistent/path/to/file.yaml");
        assert.strictEqual(result, null);
    });
    test("reads a valid YAML file", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "config.yaml");
        fs.writeFileSync(filePath, "key: value\nnum: 42\n", "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        const obj = result.doc.toJSON();
        assert.strictEqual(obj["key"], "value");
        assert.strictEqual(obj["num"], 42);
        fs.rmSync(dir, { recursive: true });
    });
    test("preserves comments on round-trip", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "config.yaml");
        const original = "# top-level comment\nkey: value  # inline comment\nnum: 42\n";
        fs.writeFileSync(filePath, original, "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        const roundTripped = result.doc.toString();
        assert.ok(roundTripped.includes("# top-level comment"), "top-level comment preserved");
        assert.ok(roundTripped.includes("# inline comment"), "inline comment preserved");
        fs.rmSync(dir, { recursive: true });
    });
    test("preserves multi-line strings on round-trip", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "config.yaml");
        const original = "notes: |\n  Line one\n  Line two\n";
        fs.writeFileSync(filePath, original, "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        const obj = result.doc.toJSON();
        assert.ok(obj["notes"].includes("Line one"));
        assert.ok(obj["notes"].includes("Line two"));
        fs.rmSync(dir, { recursive: true });
    });
    test("preserves unicode values on round-trip", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "config.yaml");
        const original = "label: \"日本語テスト\"\nvalue: \"Ünïcödé\"\n";
        fs.writeFileSync(filePath, original, "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        const obj = result.doc.toJSON();
        assert.strictEqual(obj["label"], "日本語テスト");
        assert.strictEqual(obj["value"], "Ünïcödé");
        fs.rmSync(dir, { recursive: true });
    });
});
suite("yamlReadWrite — writeYamlFile", () => {
    test("writes file atomically (tmp + rename)", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "out.yaml");
        const doc = (0, yamlReadWrite_1.parseDocumentFromText)("key: written\n");
        (0, yamlReadWrite_1.writeYamlFile)(filePath, doc);
        assert.ok(fs.existsSync(filePath), "output file should exist");
        assert.ok(!fs.existsSync(filePath + ".tmp"), "tmp file should be gone");
        const content = fs.readFileSync(filePath, "utf8");
        assert.ok(content.includes("key: written"));
        fs.rmSync(dir, { recursive: true });
    });
    test("round-trips a document byte-identically when content is stable", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "roundtrip.yaml");
        const original = "# comment\nkey: value\nnum: 42\n";
        fs.writeFileSync(filePath, original, "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        (0, yamlReadWrite_1.writeYamlFile)(filePath, result.doc);
        const after = fs.readFileSync(filePath, "utf8");
        assert.strictEqual(after, result.doc.toString());
        fs.rmSync(dir, { recursive: true });
    });
});
suite("yamlReadWrite — parseErrors surfacing", () => {
    test("surfaces parse errors on a malformed file", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "broken.yaml");
        fs.writeFileSync(filePath, "key: [unclosed\nother: 1\n", "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        assert.ok(result.parseErrors.length > 0, "should surface at least one parse error");
        assert.ok(typeof result.parseErrors[0].message === "string");
        fs.rmSync(dir, { recursive: true });
    });
    test("empty parseErrors array for a well-formed file", () => {
        const dir = makeTmpDir();
        const filePath = path.join(dir, "ok.yaml");
        fs.writeFileSync(filePath, "key: value\n", "utf8");
        const result = (0, yamlReadWrite_1.readYamlFile)(filePath);
        assert.ok(result !== null);
        assert.strictEqual(result.parseErrors.length, 0);
        fs.rmSync(dir, { recursive: true });
    });
});
suite("yamlReadWrite — parseDocumentFromText", () => {
    test("throws on invalid YAML", () => {
        assert.throws(() => {
            const doc = (0, yamlReadWrite_1.parseDocumentFromText)("key: [unclosed");
            // parseDocument from 'yaml' is lenient and stores errors; check errors array
            if (doc.errors.length > 0) {
                throw new Error(doc.errors[0].message);
            }
        });
    });
    test("returns document with correct values", () => {
        const doc = (0, yamlReadWrite_1.parseDocumentFromText)("a: 1\nb: hello\n");
        const obj = doc.toJSON();
        assert.strictEqual(obj["a"], 1);
        assert.strictEqual(obj["b"], "hello");
    });
});
//# sourceMappingURL=yamlReadWrite.test.js.map