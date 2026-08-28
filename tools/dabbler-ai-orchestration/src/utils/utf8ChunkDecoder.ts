// Set 079 S5 (verification R3 finding on the UAT-walk-4 fix): streaming-
// safe UTF-8 decoding for child-process stdout/stderr chunks.
//
// A per-chunk `chunk.toString("utf8")` corrupts any multibyte UTF-8
// sequence that a pipe boundary happens to split — each call decodes its
// dangling partial sequence to U+FFFD instead of carrying the bytes over
// to the next chunk. Node's StringDecoder exists precisely for this; the
// wrapper below is the one shared way every spawner sink in the extension
// decodes chunked output (installAiRouterCommands, gitScaffold's refresh
// spawner, ConfigEditorPanel, setupVerification, upgradeOlderSets), so
// the fix is class-wide rather than site-local.

import { StringDecoder } from "string_decoder";

export interface Utf8ChunkDecoder {
  /** Decode the next chunk, carrying any trailing partial sequence over. */
  write(chunk: Buffer): string;
  /** Flush: returns the replacement for any dangling partial bytes (call
   * once, at stream end; usually the empty string). */
  end(): string;
}

export function makeUtf8ChunkDecoder(): Utf8ChunkDecoder {
  const sd = new StringDecoder("utf8");
  return {
    write: (chunk) => sd.write(chunk),
    end: () => sd.end(),
  };
}
