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
const annotationParser_1 = require("../../configEditor/annotationParser");
const FIXED_TS = "2026-05-16T00:00:00.000Z";
const now = () => FIXED_TS;
suite("annotationParser — findAnnotations: comment styles", () => {
    test("Python/shell/YAML # style is recognized", () => {
        const text = '# @dabbler:outsource-review("hash-style reason")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "hash-style reason");
        assert.strictEqual(anns[0].source, "annotation");
        assert.strictEqual(anns[0].file, "src/foo.py");
        assert.strictEqual(anns[0].line, 1);
        assert.strictEqual(anns[0].ts, FIXED_TS);
    });
    test("JS/TS/Java/C# // style is recognized", () => {
        const text = '// @dabbler:outsource-review("slash-style reason")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo.ts", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "slash-style reason");
    });
    test("whitespace between marker and @ is tolerated", () => {
        const text = '#   @dabbler:outsource-review("spaced")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "spaced");
    });
    test("no marker (bare @dabbler:outsource-review) is NOT recognized", () => {
        const text = '@dabbler:outsource-review("not in a comment")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo.py", now);
        assert.strictEqual(anns.length, 0);
    });
});
suite("annotationParser — findAnnotations: multi-match and line numbers", () => {
    test("multiple annotations in one file return entries in order", () => {
        const text = [
            'first line',
            '# @dabbler:outsource-review("a")',
            'middle',
            '// @dabbler:outsource-review("b")',
            '# @dabbler:outsource-review("c")',
            '',
        ].join("\n");
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo.ts", now);
        assert.strictEqual(anns.length, 3);
        assert.deepStrictEqual(anns.map((a) => [a.reason, a.line]), [["a", 2], ["b", 4], ["c", 5]]);
    });
    test("annotation on first line reports line=1", () => {
        const text = '# @dabbler:outsource-review("first")\nfoo\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns[0].line, 1);
    });
    test("annotation after CRLF newlines reports correct line", () => {
        const text = "foo\r\nbar\r\n# @dabbler:outsource-review(\"third line\")\r\n";
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].line, 3);
        assert.strictEqual(anns[0].reason, "third line");
    });
});
suite("annotationParser — findAnnotations: reason content", () => {
    test("escaped quote in reason is unescaped", () => {
        const text = '# @dabbler:outsource-review("quote \\" inside")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, 'quote " inside');
    });
    test("escaped backslash in reason is unescaped", () => {
        const text = '# @dabbler:outsource-review("path C:\\\\repo")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "path C:\\repo");
    });
    test("unicode in reason survives round-trip", () => {
        const text = '# @dabbler:outsource-review("résumé — café")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "résumé — café");
    });
    test("empty reason is rejected (no entry produced)", () => {
        const text = '# @dabbler:outsource-review("")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 0);
    });
    test("nested parentheses inside reason are tolerated", () => {
        const text = '# @dabbler:outsource-review("foo(bar)baz")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 1);
        assert.strictEqual(anns[0].reason, "foo(bar)baz");
    });
    test("raw newline inside reason does NOT match (annotations are line-comment syntax)", () => {
        // Unterminated `"` on one line must not stitch to a later line's `")`.
        // Verifier-flagged false-positive shape: a `") on line N+M would otherwise
        // close an unintentional `"foo` opened on line N.
        const text = '# @dabbler:outsource-review("foo\nbar")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 0);
    });
    test("CRLF inside reason also does NOT match (CR rejected alongside LF)", () => {
        const text = '# @dabbler:outsource-review("foo\r\nbar")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 0);
    });
    test("unterminated quote on one line does not stitch to a later line's closing quote", () => {
        const text = [
            '# @dabbler:outsource-review("never-closed',
            'something else here',
            'closer here")',
            '',
        ].join("\n");
        const anns = (0, annotationParser_1.findAnnotations)(text, "x.py", now);
        assert.strictEqual(anns.length, 0);
    });
});
suite("annotationParser — findAnnotations: path normalization", () => {
    test("Windows-style backslash separators normalize to POSIX forward slashes", () => {
        const text = '# @dabbler:outsource-review("x")\n';
        // Contract: this MUST hold regardless of host OS (verifier-flagged
        // host-dependent normalization). path.sep is `\` on Windows and `/`
        // on POSIX; we want both inputs to round-trip to forward slashes.
        const anns = (0, annotationParser_1.findAnnotations)(text, "src\\foo\\bar.py", now);
        assert.strictEqual(anns[0].file, "src/foo/bar.py");
    });
    test("already-POSIX paths pass through unchanged", () => {
        const text = '# @dabbler:outsource-review("x")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo/bar.py", now);
        assert.strictEqual(anns[0].file, "src/foo/bar.py");
    });
    test("mixed-separator path normalizes consistently", () => {
        const text = '# @dabbler:outsource-review("x")\n';
        const anns = (0, annotationParser_1.findAnnotations)(text, "src/foo\\bar/baz.py", now);
        assert.strictEqual(anns[0].file, "src/foo/bar/baz.py");
    });
});
suite("annotationParser — deduplicateAnnotations", () => {
    function ann(over = {}) {
        return {
            ts: FIXED_TS,
            reason: "r",
            source: "annotation",
            file: "f.py",
            line: 1,
            ...over,
        };
    }
    test("returns all entries when existing queue is empty", () => {
        const incoming = [ann({ reason: "a" }), ann({ reason: "b" })];
        const result = (0, annotationParser_1.deduplicateAnnotations)(incoming, []);
        assert.deepStrictEqual(result.map((r) => r.reason), ["a", "b"]);
    });
    test("drops an incoming entry that matches an existing queue line on file+line+reason", () => {
        const existing = [{ file: "f.py", line: 1, reason: "a" }];
        const incoming = [ann({ reason: "a" }), ann({ reason: "b" })];
        const result = (0, annotationParser_1.deduplicateAnnotations)(incoming, existing);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].reason, "b");
    });
    test("does NOT collide when only file matches but line differs", () => {
        const existing = [{ file: "f.py", line: 1, reason: "a" }];
        const incoming = [ann({ reason: "a", line: 2 })];
        const result = (0, annotationParser_1.deduplicateAnnotations)(incoming, existing);
        assert.strictEqual(result.length, 1);
    });
    test("dedupes incoming against itself (two identical entries -> one)", () => {
        const incoming = [ann({ reason: "a" }), ann({ reason: "a" })];
        const result = (0, annotationParser_1.deduplicateAnnotations)(incoming, []);
        assert.strictEqual(result.length, 1);
    });
    test("ignores ts and source when matching", () => {
        const existing = [{ file: "f.py", line: 1, reason: "a" }];
        const incoming = [
            {
                ts: "different-timestamp",
                reason: "a",
                source: "annotation",
                file: "f.py",
                line: 1,
            },
        ];
        const result = (0, annotationParser_1.deduplicateAnnotations)(incoming, existing);
        assert.strictEqual(result.length, 0);
    });
});
//# sourceMappingURL=annotationParser.test.js.map