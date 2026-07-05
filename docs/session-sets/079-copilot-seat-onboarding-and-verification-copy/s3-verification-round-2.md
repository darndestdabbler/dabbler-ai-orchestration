VERIFIED

- **S3-V-001** — `makeRealKillEffects(child, spawnFn)` is exported and used by the real spawner; new tests cover:
  - `taskkill /pid <pid> /T /F` argv
  - no plain `child.kill()` on successful spawn path
  - async `error` event fallback to `child.kill()`
  - `plainKill()` delegating to the child
- **S3-V-002** — honesty tests now cover both halves:
  - keyless case asserts `not functional` and rejects `api profile working`
  - keyed case asserts `api profile working` and rejects `not functional`

- **Regression check** — no regression introduced by these fixes is evident in the provided source/tests.