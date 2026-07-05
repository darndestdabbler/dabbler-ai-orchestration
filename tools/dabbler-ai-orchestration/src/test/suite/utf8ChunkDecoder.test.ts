// Set 079 S5 (verification R3 on the UAT-walk-4 fix): pins the
// streaming-safe UTF-8 chunk decoding every spawner sink now shares.
// The regression this guards: per-chunk `chunk.toString("utf8")`
// replaces a multibyte sequence that a pipe boundary splits with U+FFFD
// — for the router-config.yaml seed read that means silently corrupted
// config content.

import * as assert from "assert";
import { makeUtf8ChunkDecoder } from "../../utils/utf8ChunkDecoder";

suite("utf8ChunkDecoder (Set 079 S5)", () => {
  test("reassembles a multibyte sequence split across chunk boundaries", () => {
    // U+2192 (→) — the exact character the bundled router-config.yaml
    // carries — is 3 UTF-8 bytes: E2 86 92. Split it 1+2 across chunks.
    const bytes = Buffer.from("a→b", "utf8"); // 61 E2 86 92 62
    const dec = makeUtf8ChunkDecoder();
    const out =
      dec.write(bytes.subarray(0, 2)) + // "a" + first byte of →
      dec.write(bytes.subarray(2)) + // remaining 2 bytes + "b"
      dec.end();
    assert.strictEqual(out, "a→b");
    assert.ok(!out.includes("�"), "no replacement character");
  });

  test("the naive per-chunk toString REALLY corrupts the same split (regression premise)", () => {
    // Documents why the decoder exists: the pre-fix behavior on the
    // identical chunking produces U+FFFD, never the original character.
    const bytes = Buffer.from("a→b", "utf8");
    const naive =
      bytes.subarray(0, 2).toString("utf8") + bytes.subarray(2).toString("utf8");
    assert.notStrictEqual(naive, "a→b");
    assert.ok(naive.includes("�"));
  });

  test("end() surfaces a dangling partial sequence instead of dropping it", () => {
    const dec = makeUtf8ChunkDecoder();
    const partial = dec.write(Buffer.from([0xe2])); // lone lead byte
    assert.strictEqual(partial, "");
    const tail = dec.end();
    assert.strictEqual(tail, "�", "truncated output is visible, not vanished");
  });

  test("plain ASCII passes through unchanged chunk by chunk", () => {
    const dec = makeUtf8ChunkDecoder();
    assert.strictEqual(dec.write(Buffer.from("hello ")), "hello ");
    assert.strictEqual(dec.write(Buffer.from("world")), "world");
    assert.strictEqual(dec.end(), "");
  });
});
