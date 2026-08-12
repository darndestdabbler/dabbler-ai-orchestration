**VERIFIED** — I checked the plan obligations against `verify_type.py`, the 12 added resolver tests, the source/generated consumer templates, README surfaces, changelogs, and planning docs. The shipped helper derives from the project file, preserves the Windows/POSIX split, avoids Machine scope, keeps unresolved `--set-env --json` stdout parseable, and the generated template matches the source.

**NITS**
- `docs/quick-start.md` still has a stale Copilot setup line about `transport.profile: copilot-cli` in `local-overrides.yaml`; confusing, but not blocking this env-helper change.
- The consumer bootstrap says “These are two commands” while the block also includes the optional no-flags inspection command; harmless but slightly imprecise.