import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  scanFilesForAnnotations,
  loadHonorAnnotationsToggle,
  loadExistingQueueEntries,
  toPosixPath,
  SCAN_GLOB,
  SCAN_EXCLUDE_GLOB,
} from "../../commands/annotationScanner";
import {
  appendQueueEntry,
  QueueEntry,
  QUEUE_FILENAME,
} from "../../commands/decisionReviewQueue";

const FIXED_TS = "2026-05-16T00:00:00.000Z";
const now = (): string => FIXED_TS;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-scan-test-"));
}

suite("scanAnnotationsForActiveSet — scanFilesForAnnotations", () => {
  test("returns empty list when no annotations are present", () => {
    const root = "/ws";
    const reader = (_p: string): string => "console.log('hello');\n";
    const result = scanFilesForAnnotations(["/ws/a.ts", "/ws/b.py"], root, now, reader);
    assert.strictEqual(result.length, 0);
  });

  test("finds one annotation across multiple files", () => {
    const root = "/ws";
    const files: Record<string, string> = {
      "/ws/a.ts": "// no annotation here\n",
      "/ws/b.py": '# @dabbler:outsource-review("python flag")\n',
      "/ws/c.ts": '// @dabbler:outsource-review("ts flag")\n',
    };
    const reader = (p: string): string => files[p];
    const result = scanFilesForAnnotations(Object.keys(files), root, now, reader);
    assert.strictEqual(result.length, 2);
    const reasons = result.map((a) => a.reason).sort();
    assert.deepStrictEqual(reasons, ["python flag", "ts flag"]);
  });

  test("relative paths are computed against workspace root", () => {
    const root = path.sep === "\\" ? "C:\\ws" : "/ws";
    const file = path.join(root, "src", "deep", "f.py");
    const reader = (_p: string): string => '# @dabbler:outsource-review("x")\n';
    const result = scanFilesForAnnotations([file], root, now, reader);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file, "src/deep/f.py");
  });

  test("emitted Annotation.file is always POSIX, regardless of host or input separator style", () => {
    // Host-independent: this test uses a string-literal Windows-style
    // input that path.relative would treat differently per host, but
    // toPosixPath inside scanFilesForAnnotations forces the rewrite.
    // (We deliberately bypass `path.join` here so the input is the
    // literal Windows shape — what a queue entry hand-edited or
    // written on Windows might carry.)
    const root = "C:\\ws";
    const file = "C:\\ws\\src\\deep\\f.py";
    const reader = (_p: string): string => '# @dabbler:outsource-review("x")\n';
    const result = scanFilesForAnnotations([file], root, now, reader);
    assert.strictEqual(result.length, 1);
    assert.ok(
      !result[0].file.includes("\\"),
      `expected POSIX path, got ${JSON.stringify(result[0].file)}`,
    );
  });

  test("file that throws on read is skipped silently", () => {
    const root = "/ws";
    const reader = (p: string): string => {
      if (p === "/ws/bad.py") throw new Error("permission denied");
      return '# @dabbler:outsource-review("good")\n';
    };
    const result = scanFilesForAnnotations(
      ["/ws/bad.py", "/ws/good.py"], root, now, reader,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].reason, "good");
  });

  test("multiple annotations in one file are returned in order", () => {
    const root = "/ws";
    const reader = (_p: string): string => [
      'line 1',
      '# @dabbler:outsource-review("first")',
      'line 3',
      '# @dabbler:outsource-review("second")',
      '',
    ].join("\n");
    const result = scanFilesForAnnotations(["/ws/a.py"], root, now, reader);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(
      result.map((a) => [a.reason, a.line]),
      [["first", 2], ["second", 4]],
    );
  });
});

suite("scanAnnotationsForActiveSet — loadHonorAnnotationsToggle", () => {
  test("defaults to true when local-overrides.yaml is missing", () => {
    const readYaml = (_p: string): Record<string, unknown> | null => null;
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), true);
  });

  test("defaults to true when decision_review key is absent", () => {
    const readYaml = (_p: string) => ({ other_section: { foo: "bar" } });
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), true);
  });

  test("defaults to true when honor_annotations is absent under decision_review", () => {
    const readYaml = (_p: string) => ({ decision_review: { other: "thing" } });
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), true);
  });

  test("returns false when explicitly set to false", () => {
    const readYaml = (_p: string) => ({ decision_review: { honor_annotations: false } });
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), false);
  });

  test("returns true when explicitly set to true", () => {
    const readYaml = (_p: string) => ({ decision_review: { honor_annotations: true } });
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), true);
  });

  test("non-boolean value falls back to default true", () => {
    const readYaml = (_p: string) => ({ decision_review: { honor_annotations: "yes" } });
    assert.strictEqual(loadHonorAnnotationsToggle("/ws", readYaml), true);
  });

  test("reads from ai_router/local-overrides.yaml under the workspace root", () => {
    let observedPath = "";
    const readYaml = (p: string): Record<string, unknown> | null => {
      observedPath = p;
      return null;
    };
    loadHonorAnnotationsToggle("/ws", readYaml);
    assert.ok(observedPath.endsWith(path.join("ai_router", "local-overrides.yaml")));
    assert.ok(observedPath.startsWith("/ws") || observedPath.startsWith("\\ws"));
  });
});

suite("scanAnnotationsForActiveSet — loadExistingQueueEntries", () => {
  test("returns empty when queue file is absent", () => {
    const dir = makeTmpDir();
    try {
      const result = loadExistingQueueEntries(dir);
      assert.deepStrictEqual(result, []);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns dedup keys for annotation entries; skips command entries (file=null)", () => {
    const dir = makeTmpDir();
    try {
      appendQueueEntry(dir, {
        ts: "t1", reason: "from command", source: "command", file: null, line: null,
      });
      appendQueueEntry(dir, {
        ts: "t2", reason: "from annotation", source: "annotation",
        file: "src/foo.py", line: 5,
      });
      const result = loadExistingQueueEntries(dir);
      assert.strictEqual(result.length, 1);
      assert.deepStrictEqual(result[0], { file: "src/foo.py", line: 5, reason: "from annotation" });
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("skips malformed lines without aborting the read", () => {
    const dir = makeTmpDir();
    try {
      const queuePath = path.join(dir, QUEUE_FILENAME);
      const text = [
        JSON.stringify({ ts: "t1", reason: "good", source: "annotation", file: "a.py", line: 1 }),
        "not json at all",
        JSON.stringify({ ts: "t2", reason: "also-good", source: "annotation", file: "b.py", line: 2 }),
        "",
      ].join("\n");
      fs.writeFileSync(queuePath, text, "utf8");
      const result = loadExistingQueueEntries(dir);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].reason, "good");
      assert.strictEqual(result[1].reason, "also-good");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("normalizes backslash file paths to POSIX in dedup keys (cross-host queue replay)", () => {
    // A queue entry written on Windows could carry `src\foo.py`. Reading
    // that on a POSIX host (or scanning the same file via path.relative
    // on Linux that produces `src/foo.py`) must collide for dedup to
    // work. Verifier-flagged: without normalization here, the same
    // annotation gets double-appended on a re-scan after a host change.
    const dir = makeTmpDir();
    try {
      const queuePath = path.join(dir, QUEUE_FILENAME);
      const text = [
        JSON.stringify({
          ts: "t1", reason: "win-style", source: "annotation",
          file: "src\\foo.py", line: 5,
        }),
      ].join("\n");
      fs.writeFileSync(queuePath, text, "utf8");
      const result = loadExistingQueueEntries(dir);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].file, "src/foo.py",
        "Windows-style file path must normalize to POSIX in the dedup seed");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("uses the injected reader (test seam)", () => {
    let calls = 0;
    const reader = (_p: string): string => {
      calls++;
      return JSON.stringify({
        ts: "t", reason: "r", source: "annotation", file: "x.py", line: 1,
      }) + "\n";
    };
    // Create a real (empty) queue file so existsSync returns true
    // — the reader then supplies the content the parser sees.
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, QUEUE_FILENAME), "");
      const result = loadExistingQueueEntries(dir, reader);
      assert.strictEqual(calls, 1);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].reason, "r");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("scanAnnotationsForActiveSet — toPosixPath", () => {
  test("rewrites all backslashes to forward slashes", () => {
    assert.strictEqual(toPosixPath("src\\foo\\bar.py"), "src/foo/bar.py");
  });

  test("leaves already-POSIX paths unchanged", () => {
    assert.strictEqual(toPosixPath("src/foo/bar.py"), "src/foo/bar.py");
  });

  test("handles mixed separators", () => {
    assert.strictEqual(toPosixPath("src\\foo/bar\\baz.py"), "src/foo/bar/baz.py");
  });

  test("empty string round-trips", () => {
    assert.strictEqual(toPosixPath(""), "");
  });
});

suite("scanAnnotationsForActiveSet — scan globs", () => {
  test("SCAN_GLOB includes common source extensions", () => {
    for (const ext of ["ts", "py", "go", "rs", "java", "cs", "sh"]) {
      assert.ok(SCAN_GLOB.includes(ext), `${ext} missing from SCAN_GLOB`);
    }
  });

  test("SCAN_EXCLUDE_GLOB filters obvious noise dirs", () => {
    for (const seg of ["node_modules", "dist", ".venv", ".git", "__pycache__"]) {
      assert.ok(SCAN_EXCLUDE_GLOB.includes(seg), `${seg} missing from SCAN_EXCLUDE_GLOB`);
    }
  });
});

suite("scanAnnotationsForActiveSet — end-to-end dedup flow", () => {
  test("re-scanning an unchanged file produces no new appends", () => {
    // Simulate: first scan finds one annotation and appends it; second
    // scan finds the same annotation and deduplicateAnnotations + the
    // queue read together filter it out.
    const dir = makeTmpDir();
    try {
      const root = "/ws";
      const reader = (_p: string): string =>
        '# @dabbler:outsource-review("test")\n';
      const round1 = scanFilesForAnnotations(["/ws/x.py"], root, now, reader);
      assert.strictEqual(round1.length, 1);
      // Append the entry as the scanner would
      appendQueueEntry(dir, {
        ...round1[0],
      } as QueueEntry);

      // Round 2: same scan, but existing queue should swallow the dup.
      const round2 = scanFilesForAnnotations(["/ws/x.py"], root, now, reader);
      const existing = loadExistingQueueEntries(dir);
      // existing has the file+line+reason key from round 1
      assert.strictEqual(existing.length, 1);
      // dedup
      const { deduplicateAnnotations } =
        // late require to avoid top-level vscode pulls in other tests
        require("../../configEditor/annotationParser");
      const fresh = deduplicateAnnotations(round2, existing);
      assert.strictEqual(fresh.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("a newly-added annotation in an unchanged file IS appended on next scan", () => {
    const dir = makeTmpDir();
    try {
      const root = "/ws";
      let text = '# @dabbler:outsource-review("first")\n';
      const reader = (_p: string): string => text;
      const round1 = scanFilesForAnnotations(["/ws/x.py"], root, now, reader);
      for (const ann of round1) appendQueueEntry(dir, ann as QueueEntry);
      assert.strictEqual(loadExistingQueueEntries(dir).length, 1);

      // Operator adds a second annotation on a new line.
      text =
        '# @dabbler:outsource-review("first")\n' +
        '# @dabbler:outsource-review("second")\n';
      const round2 = scanFilesForAnnotations(["/ws/x.py"], root, now, reader);
      const { deduplicateAnnotations } = require("../../configEditor/annotationParser");
      const fresh = deduplicateAnnotations(round2, loadExistingQueueEntries(dir));
      assert.strictEqual(fresh.length, 1);
      assert.strictEqual(fresh[0].reason, "second");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
