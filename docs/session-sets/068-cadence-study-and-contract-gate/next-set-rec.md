# Set 068 S6 -- routed NEXT-SESSION-SET recommendation

> Routed via route(task_type='analysis'). Model: ?.

### Recommended Next Session Set

*   **Set Title:** Set 069: Instrument the Gated Verification Surface
*   **Rationale:** The DEMOTE decision for per-session routed verification in Set 068 was explicitly conditional, pending data to support a future RETIRE decision. This set directly addresses that dependency by instrumenting the new, layered verification model. The primary goal is to close the loop on the verification-surface program by gathering quantitative evidence on its production performance. This involves instrumenting the defect escape rate, rework saved by the gating predicate, false-positive churn, and gating failures. This telemetry is the highest-leverage next step, as the resulting data is a crucial prerequisite for justifying any further investment in UI/Explorer surfaces (Candidate #2), consumer adoption (Candidate #4), or future strategic changes to the verification model itself.
*   **Rough Session Count:** 3-4 sessions.
*   **Ships Release:** Yes, a PyPI release of the `ai_router` package with the new telemetry hooks. No Marketplace release.
