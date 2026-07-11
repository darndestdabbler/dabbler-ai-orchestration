# AI Assignment Ledger — Set 091

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator / next-session choices are
produced via routed analysis (`route(task_type="analysis")`), never
self-opined (L-064-6). The routed analysis for S1 is saved raw at
`s1-next-orchestrator-analysis.json`; the S1 empty-manifest architecture
decision is saved raw at `s1-empty-manifest-architecture.json`.

## Session 1 of 2 — Empty-manifest validity, appender compat & canonical template

Orchestrator: **claude / anthropic / claude-fable-5**.

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Read the spec, proposal, verdict (amendment 3) + map the touched seams (moduleAuthoring.ts, fileSystem.ts, the four S3 authoring flows, three test suites) | Orchestrator (direct) | Read-only reconnaissance over files the spec names explicitly; no reasoning to route. |
| **Empty-manifest architecture decision** (where the empty-null acceptance lives — reader vs classifier; whether the classification union gains a `present-empty` member; textual-replacement vs YAML-CST appender mechanics) | **Routed — architecture (tier 2, gemini-pro; anthropic excluded after 400 ×3, the 087 S2/S3 precedent)** | The one oracle-free, solution-divergent decision cluster of the session (`delegation.always_route_task_types` includes architecture). Ruled: reader-level acceptance (`modules: null` → `[]`, one reader one rule, L-066-1 parity); NO new union member — valid-empty is `present` with zero entries, textual appendability stays the appender's concern; textual line replacement with the parse-after-append guard as correctness backstop. Plus three mandated tests (byte-stability pin, three-input round-trip, all-dropped refusal). Saved raw. |
| Reader / classifier / appender / template implementation | Orchestrator (direct) | Flows deterministically from the spec + the routed ruling; mirrors existing house patterns (tolerant reader, fail-loud writer, format-preserving append). |
| Test matrix (classification × append × authoring flows, template round-trip, byte-stability attribution pin, empty-parity flow tests) | Orchestrator (direct) | Written against the live modules; exercised by the full suite (unit 1368 / pytest 2922 / Playwright 20). |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (no-skip-verification-mandate). |
| Next-orchestrator AI assignment | **Routed — analysis (gemini-pro, tier 2)** | L-064-6: never self-opine on model choice. Saved raw at `s1-next-orchestrator-analysis.json`. |

**Delegation note.** The routed analysis sanity-checked this split and
recommended no changes: the one architectural ambiguity was routed; the
implementation downstream of the ruling was deterministic and correctly
kept orchestrator-direct.

## Next-session recommendation (routed analysis, made in S1)

For **Session 2 of 2 (pseudo-module semantics, visible-module computation
& compat matrix)** the routed analysis
(`s1-next-orchestrator-analysis.json`, gemini-pro, tier 2) recommends
**claude / anthropic / Opus-class / medium effort** (the analysis labels
the seat "Opus-class high" as the capability class and `Medium` as the
effort). Rationale (routed): the visible-module computation is
multi-conditional business logic, and the compat matrix + the armed
advisory path-aware critique are synthesis tasks above a Sonnet-class
seat; Opus-class is the cheapest-capable step-down from the Mythos-class
seat. Supervision points (routed): (1) review the visible-module
function's test cases and signature before implementation (the
`Default`/`Unassigned` interaction is subtle), (2) validate the
writer-path list behind the never-persist guard for completeness, (3)
review `work-explorer-compat-matrix.md` row-by-row — it is the contract
Sets 092–094 consume, (4) review the multi-provider path-aware critique
before the set-terminal close. The operator owns the final seat choice.

### Actuals (S1)
- Orchestrator used: claude / anthropic / claude-fable-5
- Routed cost (pre-verification): architecture (tier 2, gemini-pro,
  $0.010 + $0.035 auto-verify by gpt-5-4-mini, VERIFIED) + analysis
  (tier 2, gemini-pro, $0.008); both saved raw. Anthropic-as-provider
  failed 400 ×3 on the architecture call and was excluded-and-rerouted
  (087 S2/S3 precedent).
- Verification: 5 rounds, all gpt-5-6 (~$0.74 total): R1 ISSUES_FOUND
  (Major — root-indented empty forms not appendable) fixed in-flight;
  R2 ISSUES_FOUND (Major — nested `modules:` key could swallow the
  replacement) fixed in-flight (guard-validated candidate selection);
  R3 ISSUES_FOUND (Major — explicit null spellings `null`/`Null`/
  `NULL`/`~` accepted by the reader but not appendable) fixed in-flight;
  R4 ISSUES_FOUND (Major — quoted keys + multiline flow) DISPUTED as
  edge-case exhaustion → third-provider opinion (gemini-pro, $0.008,
  saved raw at `s1-third-opinion-empty-forms.json`): adjudicated-minor
  residual; quoted-key hardening applied, exotic serializations refuse
  loudly by design, residual deferred to Sets 092–094 guardrails.
  R5: **VERIFIED, zero findings**.
- Notes for next-session calibration: gpt-5-6 mined the unbounded YAML
  serialization space one edge per round (same class re-rated Major
  four times). S2's conventions block should pre-declare the settled
  empty-form domain (and the adjudicated residual) up front, and any
  dispute should go to the third-provider path after the second fresh
  same-class Major, not the fourth.
