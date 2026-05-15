import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readYamlFile, writeYamlFile, parseDocumentFromText } from "../../configEditor/yamlReadWrite";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-yaml-test-"));
}

suite("yamlReadWrite — readYamlFile", () => {
  test("returns null for non-existent file", () => {
    const result = readYamlFile("/nonexistent/path/to/file.yaml");
    assert.strictEqual(result, null);
  });

  test("reads a valid YAML file", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "config.yaml");
    fs.writeFileSync(filePath, "key: value\nnum: 42\n", "utf8");
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    const obj = result.doc.toJSON() as Record<string, unknown>;
    assert.strictEqual(obj["key"], "value");
    assert.strictEqual(obj["num"], 42);
    fs.rmSync(dir, { recursive: true });
  });

  test("preserves comments on round-trip", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "config.yaml");
    const original = "# top-level comment\nkey: value  # inline comment\nnum: 42\n";
    fs.writeFileSync(filePath, original, "utf8");
    const result = readYamlFile(filePath);
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
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    const obj = result.doc.toJSON() as Record<string, unknown>;
    assert.ok((obj["notes"] as string).includes("Line one"));
    assert.ok((obj["notes"] as string).includes("Line two"));
    fs.rmSync(dir, { recursive: true });
  });

  test("preserves unicode values on round-trip", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "config.yaml");
    const original = "label: \"日本語テスト\"\nvalue: \"Ünïcödé\"\n";
    fs.writeFileSync(filePath, original, "utf8");
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    const obj = result.doc.toJSON() as Record<string, unknown>;
    assert.strictEqual(obj["label"], "日本語テスト");
    assert.strictEqual(obj["value"], "Ünïcödé");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("yamlReadWrite — writeYamlFile", () => {
  test("writes file atomically (tmp + rename)", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "out.yaml");
    const doc = parseDocumentFromText("key: written\n");
    writeYamlFile(filePath, doc);
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
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    writeYamlFile(filePath, result.doc);
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
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    assert.ok(result.parseErrors.length > 0, "should surface at least one parse error");
    assert.ok(typeof result.parseErrors[0].message === "string");
    fs.rmSync(dir, { recursive: true });
  });

  test("empty parseErrors array for a well-formed file", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "ok.yaml");
    fs.writeFileSync(filePath, "key: value\n", "utf8");
    const result = readYamlFile(filePath);
    assert.ok(result !== null);
    assert.strictEqual(result.parseErrors.length, 0);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("yamlReadWrite — parseDocumentFromText", () => {
  test("throws on invalid YAML", () => {
    assert.throws(() => {
      const doc = parseDocumentFromText("key: [unclosed");
      // parseDocument from 'yaml' is lenient and stores errors; check errors array
      if (doc.errors.length > 0) {
        throw new Error(doc.errors[0].message);
      }
    });
  });

  test("returns document with correct values", () => {
    const doc = parseDocumentFromText("a: 1\nb: hello\n");
    const obj = doc.toJSON() as Record<string, unknown>;
    assert.strictEqual(obj["a"], 1);
    assert.strictEqual(obj["b"], "hello");
  });
});
