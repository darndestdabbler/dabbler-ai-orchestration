**VERIFIED** — I checked the actual transport code, route/verify call sites, direct API request bodies, and falsifier tests. The `copilot-cli` routed dispatches now consistently pass the read-only tool allowlist on both inline and handoff paths, while the API path remains tool-free by construction.

**NITS**

- **Nit:** A few handoff comments/tests still say the agent “holds write tools,” which is stale after this change, but the behavior and asserted invariant are correct.