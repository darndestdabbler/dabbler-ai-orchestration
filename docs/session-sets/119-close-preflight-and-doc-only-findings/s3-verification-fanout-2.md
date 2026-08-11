VERIFIED — I tried to break the changed close-mandated freshness logic, remediation-baseline path, exception hierarchy, and deleted-module surface. Runtime references to the deleted modules are gone, targeted product/entry-point tests pass, and the main behavior changes are covered.

NITS:
- `close_backstop.py` still has a stale comment saying `EvidenceTooLargeError` is “deliberately NOT a VerifySessionError” even though this session intentionally made it a subclass.
- If `snapshot_worktree_tree()` returns `None`, a blocking backstop round omits `discoveryBaselineTree` but still says the remediation-review phase is reachable because “this round recorded the baseline.” That is recoverable and unlikely, but the message overstates the guarantee.