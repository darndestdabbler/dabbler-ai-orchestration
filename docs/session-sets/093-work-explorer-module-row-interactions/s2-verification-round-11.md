ISSUES FOUND

- **Issue 1: Concurrent assignments can replace a verified staging file and silently stamp the wrong module**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** D4 requires that “the on-disk file re-read equals the intended spliced content byte-for-byte,” while the implementation claims the atomic primitive is “provably correct” and that R10 closes the staging TOCTOU. It does not serialize assignments or protect the deterministic staging path from concurrent replacement.
    - **Impact:** Two VS Code instances assigning the same initially-unassigned set to different modules can make one operation report success for module A while actually installing module B’s staged content. This is a wrong-destination mutation of an operator-owned `spec.md` and should block merge.
    - **Evidence:** Every operation uses the same predictable path:
      ```ts
      const tmp = `${item.specAbs}.dabbler-assign-tmp`;
      io.writeFileSync(tmp, item.next);
      if (io.readFileSync(tmp) !== item.next) throw ...;
      if (io.readFileSync(item.specAbs) !== item.original) return fail(...);
      io.renameSync(tmp, item.specAbs);
      ```
      A valid interleaving is:
      1. Assignment A writes and verifies `tmp` containing `module: A`.
      2. Assignment B overwrites that same `tmp` with `module: B`.
      3. A’s final target check still sees the unchanged original.
      4. A renames B’s bytes over `spec.md` and records A as successfully stamped.

      There is no final source verification, post-rename target verification, unique staging path, or lock/conditional replacement. The final target reread added in R10 therefore does not close this race.
    - **Fix:** Use an exclusively created unique staging file per operation and serialize assignments per target across extension instances, or use a conditional/versioned replacement mechanism. After acquiring ownership, compare the target with the validated original immediately before replacement and verify the resulting target bytes before reporting success. Add a deterministic two-writer regression covering the interleaving above.