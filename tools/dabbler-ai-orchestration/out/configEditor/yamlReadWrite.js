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
exports.Document = void 0;
exports.readYamlFile = readYamlFile;
exports.writeYamlFile = writeYamlFile;
exports.parseDocumentFromText = parseDocumentFromText;
const yaml_1 = require("yaml");
Object.defineProperty(exports, "Document", { enumerable: true, get: function () { return yaml_1.Document; } });
const fs = __importStar(require("fs"));
function readYamlFile(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    const text = fs.readFileSync(filePath, "utf8");
    const doc = parseDocumentFromText(text);
    return { doc, text };
}
function writeYamlFile(filePath, doc) {
    const content = doc.toString();
    const tmpPath = filePath + ".tmp";
    try {
        fs.writeFileSync(tmpPath, content, "utf8");
        fs.renameSync(tmpPath, filePath);
    }
    catch (err) {
        try {
            if (fs.existsSync(tmpPath))
                fs.unlinkSync(tmpPath);
        }
        catch { /* ignore cleanup error */ }
        throw err;
    }
}
function parseDocumentFromText(text) {
    return (0, yaml_1.parseDocument)(text);
}
//# sourceMappingURL=yamlReadWrite.js.map