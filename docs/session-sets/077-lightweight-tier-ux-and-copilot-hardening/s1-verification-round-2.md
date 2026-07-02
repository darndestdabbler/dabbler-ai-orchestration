# VERIFIED

- `S077-S1-V1-001` is resolved. `discoverRoots()` no longer uses `process.platform` as a proxy for path case-sensitivity; it now keys deduplication off `fs.realpathSync.native(canonical)`, which removes the incorrect darwin-wide case-folding behavior that could collapse distinct roots on case-sensitive macOS volumes.
- No regression found in the requested checks:
  - **realpath failure path:** safe; on failure it falls back to `canonical`, and the immediately following `!fs.existsSync(canonical)` guard still rejects nonexistent paths.
  - **symlink behavior:** improved; symlinked aliases now dedupe to the same filesystem-resolved key.
  - **Windows drive-letter case:** safe; native realpath normalization avoids the prior need for manual case-folding and handles drive-letter/path casing consistently.