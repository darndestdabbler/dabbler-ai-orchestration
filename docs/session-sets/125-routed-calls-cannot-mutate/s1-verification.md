VERIFIED — I checked the implemented transport argv construction, both inline and handoff paths, the new falsifier tests, and the parity documentation. The shared read-only allowlist is applied to both dispatch paths, `--allow-all-tools` is retained, the mutating tools are structurally excluded, and the transport guarantee is recorded where the plan required.

NITS

- **Nit:** A few pre-existing handoff comments still say the agent “holds/has write tools” (`ai_router/cli_transport.py` around `_best_effort_remove`, `_HandoffContext`, and `_run_handoff`). The behavior is now read-only, so those comments are stale, but this does not affect runtime behavior or the merge decision.