VERIFIED

I checked all five ledger findings against the fix delta. The platform commands and Git prerequisite are corrected, and the reported gate escapes now have coverage; remaining gate limitations are non-blocking hardening concerns because the current tutorial satisfies the contract.

Fix verdict: L1 POSIX completion commands were missing -- fix-accepted

Fix verdict: L2 tutorial gate did not enforce claimed constraints -- accepted-with-modification

Fix verdict: L3 -- duplicate-of L1

Fix verdict: L4 -- duplicate-of L2

Fix verdict: L5 Git was omitted from the prerequisites -- fix-accepted

## NITS

- **Nit:** `ai_router/scripts/tutorial_gate.py` → `_untagged_yaml_blocks` still misses common unlabelled YAML such as a single `tier: lightweight` entry or a scalar list like `providers:\n  - codex`, because it requires at least two nonblank lines and requires every line to match `_YAML_CONTENT_RE`. The current tutorial is YAML-free, so this is future gate hardening rather than a blocking reader-facing defect.
- **Nit:** `docs/tutorials/hello-world.md` requires an AI agent the reader is “already signed in to” and then says, “You do not need an account anywhere.” “You do not need an additional account” would avoid the literal contradiction.