```json
{"verdict":"VERIFIED","issues":[]}
```

Both round-1 issues are resolved.

- Full-tier `build-structure` now fails closed at the host boundary when the budget rider is missing/malformed, and valid narrowed budget choices are forwarded through to the scaffold path.
- Lightweight now omits the budget controls from the DOM entirely rather than rendering them hidden.

No regressions were evident in the fix scope: the local tier re-render preserves control state, the Full-path validation and host rejection are aligned, and Lightweight still builds without budget riders.