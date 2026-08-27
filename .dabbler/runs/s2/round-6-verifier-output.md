**VERIFIED** — I checked the remediated session-3/session-10 sequencing, the named current cap/waiver code paths, and the surrounding plan/spec mapping. The Round 5 defect is resolved: session 3 now owns the existing cap-terminal paths before sessions 4–9, and session 10 is reduced to integrating already-usable states.

**NITS**

- **Nit:** `docs/session-sets/148-the-session-framework/spec.md:418-419` still says Session 10 “Creates” the terminal state, even though Session 10’s steps now correctly say Session 3 built/wired it and Session 10 adds nothing new. This is a stale summary line, not a blocking sequencing defect.