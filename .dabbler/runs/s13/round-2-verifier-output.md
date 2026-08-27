VERIFIED

I checked the delta in `ai_router/packaging.py` against the existing tree-snapshot semantics in `ai_router/checks.py` / `ai_router/evidence.py`, the config loader in `ai_router/config.py`, the packaging schema, and the new regression in `tests/test_packaging.py`. The original blocking path is closed: a successful `pack` that dirties the tracked/non-ignored tree now fails before any push, the mutation is recorded on failed attempts, and `package()` no longer resolves overlays from the ambient working directory.

**NITS**
- `ai_router/packaging.py`’s `_moved_the_tree()` is not quite the same fail-closed rule that `ai_router/checks.py` uses: if the post-command snapshot returns `None`, `_moved_the_tree()` also returns `None`, so a snapshot failure is indistinguishable from “tree unchanged”.
- The human-facing message in `ai_router/packaging.py` / `docs/schema-reference.md` says that on tree mutation “nothing was pushed”, but mutation is only checked *after* each `push` command returns; a push implementation that uploads first and dirties the repo second would still end `failed` after an artifact had already been published.