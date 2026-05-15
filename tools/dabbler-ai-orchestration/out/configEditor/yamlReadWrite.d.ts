import { Document } from "yaml";
export { Document };
export interface ParsedYaml {
    doc: Document;
    text: string;
}
export declare function readYamlFile(filePath: string): ParsedYaml | null;
export declare function writeYamlFile(filePath: string, doc: Document): void;
export declare function parseDocumentFromText(text: string): Document;
