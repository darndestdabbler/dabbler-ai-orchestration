VERIFIED

- Fix verdict: L1 independence provider exclusion for code-review/security-review -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 DIRECT_API degradation scoped to session-verification -- fix-accepted

I checked the changed `route()` derivation, Copilot generator filtering, `pick_model()` exclusion semantics, direct-API degradation handling, and the updated policy text. The fixes enforce the independence floor across the three required task types when session context is present, and the DIRECT_API same-provider carve-out is now limited to `session-verification`.

NITS

- **Nit:** The new no-candidate diagnostic in `ai_router/__init__.py` can say an ordinary non-verification task “is in the independence floor” if a caller-supplied exclusion exhausts all candidates. It still fails closed, so this is misleading messaging only.