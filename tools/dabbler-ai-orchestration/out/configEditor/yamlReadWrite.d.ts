import { Document } from "yaml";
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
export declare function readYamlFile(filePath: string): ParsedYaml | null;
export declare function writeYamlFile(filePath: string, doc: Document): void;
export declare function parseDocumentFromText(text: string): Document;
export declare function collectParseErrors(doc: Document): YamlParseError[];
