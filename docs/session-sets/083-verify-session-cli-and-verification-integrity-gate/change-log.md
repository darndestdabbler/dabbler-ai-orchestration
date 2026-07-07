# Change Log — Set 083 (Verify-Session CLI And Verification-Integrity Gate)

> **What this set delivered:** The two faces of the fix for the
> 2026-07-06 live verification bypass, plus the operator-ordered
> escalation the day's second incident forced. **Affordance:** Step 6
> became a first-class CLI — `python -m ai_router.verify_session`
> assembles the evidence bundle (spec excerpt, `git status --short`,
> complete unfiltered diff), fills the canonical adversarial template
> verbatim, routes cross-provider, writes `sN-verification*.md` /
> `sN-issues*.json` raw before display, classifies blockingness, and
> patches `disposition.json`. **Enforcement:** the verification-integrity
> close gate (sixth deterministic gate) — `verification_method` must be a
> legal token (the incident's bare `"manual"` and the retired `"queue"`
> are rejected with naming messages on every path, `--manual-verify` and
> `--force` included), and the evidence layer corroborates claims: `api`
> requires a cross-provider `session-verification` metrics row
> (registry-resolved; missing identity fails closed) plus the raw
> artifact. **The skip removal (spec Revision 1, operator decision):**
> per-session cross-provider verification is mandatory on every Full-tier
> session — a null-verdict close is refused, `skipped` /
> `manual-via-other-engine` are legal only under the operator-declared
> zero-budget `budget.yaml` tier, `routed_gate` is retired as a skip
> authority (always REQUIRED; predicate informational only), and every
> instruction surface teaches the mandatory two-command path with
> venv-qualified invocations. Hard-block in both interactive and headless
> modes; every refusal names the sanctioned command.
>
> **Non-goals (unchanged):** the verdict grammar and blocking predicate
> (L-071-1), the adversarial template's framing (L-069-2), the
> Lightweight Mode A/B machinery and its gates, the zero-budget
> exception's semantics, the Set 078 copilot-cli transport dispatch
> mechanics.
>
> **Superseded / deferred (spec Revision 2, operator decision):** the
> re-walked human UAT and both releases move to Set 084
> (`084-verification-identity-and-close-backstop`), authored this same
> day from the third live incident + a two-model design consensus
> (artifacts in this directory). The combined router release ships from
> 084 S3 as **0.29.0** with both sets' changelog sections; this set
> published nothing. The 083 checklist's two text assertions migrate
> verbatim into the 084 cold-start walk.
>
> **Sessions:** S1 the `verify_session` CLI (VERIFIED, 3 rounds, per its
> recorded close); S2 the verification-integrity gate, 47-test matrix
> incl. the incident as a regression fixture (VERIFIED, 4 rounds, $1.29,
> per its recorded close); S3 instruction surfaces + the skip removal +
> consensus + Set 084 authoring — S3's verdict is the machine record
> (`disposition.verification_verdict` as patched by the CLI, and the
> `verificationVerdict` the close writes to `session-state.json`), never
> asserted in this prose. Suites at set close: Layer-1 pytest **2575 passed / 5
> baseline skips**; Layer-2 mocha **1270 passing**. Every session's own
> Step 6 ran through the `verify_session` CLI the set built; S1's and
> S2's closes ran through the new gate live, and S3's close — the last
> act of the set, immediately after its final verification round — runs
> through the strictest form of that gate (mandatory verification, no
> null-verdict close). The recorded proof is `session-events.jsonl`.
