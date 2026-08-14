**VERIFIED** — I tried to break the changed parser/classifier against the implementation, new falsifier tests, and the real Set 131/132 spec fixtures. The work satisfies the requested D1/D2 fixes, mode-specific `--spec` exit behavior, and measurement/documentation deliverables; I found no Critical or Major issues.

**NITS**
- **Nit:** `s2-measurement.md` says the old instrument is reproduced with `git show HEAD:ai_router/spec_admission.py`; that is only true before this work is committed. After close-out, rerunners need the parent revision instead of `HEAD`.