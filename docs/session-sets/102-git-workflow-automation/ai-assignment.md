# AI Assignment — 102-git-workflow-automation

## Session 1 — PR + finalize-merge automation (dual-host)

- Orchestrator: claude / anthropic / claude-fable-5 (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (excl. anthropic,
  $0.0055). Verdict: items (a)–(e) are orchestrator-direct — deterministic
  URL parsing, fixed preflight sequences, template-based command construction,
  and tests whose fidelity depends on the repo's existing injected-seam
  harness patterns ("routing risks pattern deviation for low benefit") —
  while the mandatory cross-provider session verification routes to a
  different provider, per the no-skip mandate.
- Operator directives in force this session: dual-host support (Azure DevOps
  today, enterprise GitHub later; spec amended pre-start 2026-07-14) and
  time pressure ("session sets done early this morning") — the live Azure
  DevOps dogfood walk is **deferred to an armed operator UAT walk**; the
  spec already frames ADO dogfood as operator-assisted, so this is a
  scheduling call, not a scope cut. Everything else (unit tests, suite,
  verification) runs in-session.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec + consensus artifacts + worktree CLI + command patterns. | Orchestrator direct — read-only reconnaissance. |
| 2 | Host detection module (`gitHost.ts`). | Orchestrator direct — deterministic parsing logic (routed rec (a)). |
| 3 | Host-CLI preflight (`hostCli.ts`). | Orchestrator direct — fixed probe sequence mirroring `copilotCli.ts` (routed rec (b)). |
| 4–5 | Open-PR + Finalize commands. | Orchestrator direct — thin auditable wrappers over explicit git/gh/az invocations (routed rec (c)/(d)). |
| 6 | Unit tests + command-surface pins. | Orchestrator direct — integration fidelity with the injected-seam harness (routed rec (e); deviation from the nominal always-route `test-generation` recorded here). |
| 7 | Dogfood. | Local git mechanics in-session; live ADO walk armed for the operator (time-pressure directive). |
| Verify | Cross-provider phased verification. | Routed — `session-verification`, orchestrator provider auto-excluded. |

### Next-orchestrator recommendation (Session 2)

Routed (raw in `s1-ai-assignment-analysis.json`): **claude / anthropic /
claude-sonnet-5 / low** — Session 2 (tag/hotfix/rollback commands) is
smaller and mechanical; frontier-tier is wasteful. Runner-up: gpt / openai /
gpt-5-4-mini (adds provider diversity at similar cost/performance).

### Actuals (filled at close)

- (pending)
