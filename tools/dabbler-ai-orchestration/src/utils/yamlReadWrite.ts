import { parseDocument as yamlParseDocument, Document } from "yaml";
import * as fs from "fs";

export { Document };

export interface YamlParseError {
  message: string;
  line?: number;
  col?: number;
}

export interface ParsedYaml {
  doc: Document;
  text: string;
  parseErrors: YamlParseError[];
}

export function readYamlFile(filePath: string): ParsedYaml | null {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8");
  const doc = parseDocumentFromText(text);
  return { doc, text, parseErrors: collectParseErrors(doc) };
}

export function writeYamlFile(filePath: string, doc: Document): void {
  const content = doc.toString();
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch { /* ignore cleanup error */ }
    throw err;
  }
}

export function parseDocumentFromText(text: string): Document {
  return yamlParseDocument(text);
}

export function collectParseErrors(doc: Document): YamlParseError[] {
  const out: YamlParseError[] = [];
  for (const err of doc.errors ?? []) {
    const lc = err.linePos?.[0];
    out.push({
      message: err.message,
      line: lc?.line,
      col: lc?.col,
    });
  }
  return out;
}
