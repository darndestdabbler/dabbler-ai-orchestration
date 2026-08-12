**VERIFIED** — I checked `cli_transport.py`’s inline and handoff argv builders, the Copilot `route()`/verifier call path, direct-provider request bodies, and the falsifier tests/docs. The shared read-only allowlist is applied to both Copilot CLI dispatch paths, mutating tools are structurally excluded, `--allow-all-tools` remains, and the API transport remains tool-free by construction.

**NITS**

- **Nit:** A few handoff comments/tests still describe the agent as holding write tools, which is stale after this change but does not affect behavior.