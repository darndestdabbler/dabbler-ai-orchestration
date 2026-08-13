### Removed

- **The parallel-session prompt builders** in
  `commands/copyPromptCommands.ts` (366 → 114 lines). The multi-module
  work rules on worktrees rather than parallel sessions in one tree, so
  the parallel-only infrastructure had no remaining consumer. **No
  command id that survives was renamed** — only titles changed, so
  keybindings, `when`-clauses, and Layer 3 fixtures that reference ids
  are unaffected.

