### Recommended Next Session Set

**set-072-consolidate-apparatus**

This set focuses on hardening and instrumenting the canonical repository's verification apparatus in preparation for the consumer-repo field pilots. The work has two components: 1) Close the deferred residual from Set 070 by hardening the non-list `entries` iteration pattern in `ai_router/path_aware_critique.py` and `ai_router/dedicated_verification.py`, eliminating a latent bug class. 2) Close the deferred residual from Set 071 by instrumenting the verification workflow to measure the quantitative effect of the new materiality gate on the re-verify loop count and false-positive rate, using the existing Set 069 benchmark as the testbed. This set belongs in the **canonical repo** and is the highest-value next step because it improves the robustness and measurability of the core tooling before it is subjected to the stress and data influx of the field pilots, ensuring that pilot telemetry is built on a solid foundation.

---

### Alternative Session Sets

**set-072-harden-readers**

This set is a minimal-scope action to resolve the highest-priority latent issue in the codebase. It addresses only the deferred residual from Set 070: hardening the non-list `entries` iteration pattern in sibling verification readers to prevent a known class of crash. This set belongs in the **canonical repo**. It is a defensible alternative if the immediate priority is to ship a stability fix with the smallest possible surface area while the field pilots begin their work in parallel.

**set-072-field-pilot-enablement**

This set prioritizes direct support for the consumer-repo field pilots. The scope is to package and document a stable `ai_router==0.25.0` release and create initial documentation/tooling for consumer repos to populate the replacement-gate benchmark from their own workloads. This set belongs in the **canonical repo**. It is worth doing now if the primary bottleneck to generating telemetry is determined to be the onboarding friction for the pilot teams, making direct enablement work in the canonical repo the critical path.