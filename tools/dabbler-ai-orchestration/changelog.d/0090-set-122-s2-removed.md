### Removed

- **(Set 122 S2) The TypeScript writer of `session-state.json` is gone.**
  `utils/cancelLifecycle.ts` cancelled and restored session sets in
  TypeScript, which meant it opened `session-state.json` and wrote it —
  the line the Set 122 spec names as *"the concrete violation that
  justified this whole set"*. Only the router's sanctioned writers may
  touch that file. **Cancel Session Set** and **Restore Session Set** now
  run `python -m ai_router.session_lifecycle`, with the same confirm →
  optional reason → refresh flow as before; the module-delete path reaches
  the same writer through `ai_router.modules`. The module trimmed from 549
  lines to 142, all readers (`isCancelled`, `wasRestored`,
  `readCancellationState`), and `sessionStateV4Writers.test.ts` lost its
  cancel/restore suites — they existed to police shape drift between two
  writers of one file, and there is now only one.

  Operator decision, 2026-08-13, journalled in the set's `decisions.jsonl`:
  severing only the module-delete path (the narrow reading of the spec
  step) was considered and rejected, because it leaves a second writer
  shipping.

