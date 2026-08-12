# Set 125 Session 1 — conventions for the verifier

## Suite baseline

Full pytest: **3987 passed, 9 skipped, 1 failed** (494.7s). The sole failure
was `test_drift_guard.py::test_real_repo_passes_all_drift_checks` — the
`one-active-set` rule, because Sets 124 and 125 were both `in-progress`.
That is repo **state**, not code. Set 124 was paused via the sanctioned
`cancel_session_set` writer under explicit operator authorization (and is
restored immediately after this close), and the failing check plus this
session's suites re-ran green: **112 passed**. No `ai_router/` code changed
between the full run and now, so the full run exercised this exact tree.

There are no tracked failures.

## What this set is

A **single-session** set, run as an operator-requested "Session 0" ahead of
Set 124 Session 2. Set numbering is forward-only and contiguous, so a literal
session 0 inside Set 124 is not expressible; a one-session set that runs first
is the same thing the tooling can actually represent.

## The defect, and why it is a parity defect rather than a Copilot quirk

`route()` is one contract with two transports, and they did not honour it
equally:

- **`api`** — `providers.py` sends `model` / `max_tokens` / `system` /
  `messages` and **no `tools` key**. The provider returns text; the call
  cannot touch the filesystem **by construction**.
- **`copilot-cli`** — the same call dispatches an **agentic** CLI, and
  `--allow-all-tools` alone granted the model the entire tool universe
  against the live working tree: `powershell` (arbitrary shell), `create`,
  `edit`, and `task` / `write_agent` (sub-agent spawning).

**This is not hypothetical.** On 2026-08-12, routed calls fired from the test
suite modified **23 files** in this repo with no human in the loop — two
production modules, extension source, the built `dist` bundle, a JSON schema,
six docs, plus one 150-line document the model invented outright — and wrote
two spurious rounds into a live verification ledger. All 23 were reverted by
operator decision.

The standing hazard is independent of that trigger: **a verifier that can edit
the code it is judging can fix a finding and then report VERIFIED on its own
edit**, which dissolves the cross-provider guarantee.

## Scope delivered

- `READ_ONLY_TOOLS = ("view", "grep", "glob")`, `MUTATING_TOOLS`, and
  `_tool_grant_argv()` in `cli_transport.py`, applied to **both** argv builds
  — the inline path and the Set 104 large-prompt handoff — from one shared
  helper so they cannot drift (`L-069-1`).
- 12 falsifiers in `test_routed_calls_cannot_mutate.py`, parametrized across
  both dispatch paths.
- The parity guarantee recorded in `router-config.yaml`'s transport block and
  `ai_router/CHANGELOG.md` under **Security**.

## Design points a reviewer should check rather than assume

1. **Allowlist, not denylist.** `--available-tools` removes a tool from the
   model's view; `--deny-tool` only withholds permission, and a denylist fails
   open on any tool a future CLI release adds.
2. **`--allow-all-tools` is deliberately RETAINED.** It governs auto-approval
   without prompting, which headless dispatch requires. Removing it would make
   dispatch hang on a permission prompt. Once the universe is read-only,
   "allow all" allows only read-only tools. A test pins this against a
   plausible "simplification".
3. **`view` is required, not incidental.** The Set 104 handoff bootstrap
   instructs the model to pull its payload from a temp file with a file-read
   tool. Removing `view` would look like a security win and silently break
   every large-prompt dispatch. Temp-dir access is retained for the same
   reason.
4. **Transport-wide, not verification-only.** The router owns model choice and
   prompt shaping; orchestrators own mechanics. No routed call needs to write,
   and one rule is the one a developer can explain (SIMPLE is binding).

## Falsification evidence (L-112-1)

Mutation-tested rather than merely observed passing:

| mutation | result |
| :--- | :--- |
| `_tool_grant_argv()` returns `[]` | **5 failed** — both paths' universe checks, both read-tool checks, the helper check |
| allowlist grows `edit` + `powershell` | **3 failed** — disjointness plus both mutating-tool checks |
| restored | **12 passed** |

Live matched pair through the raw CLI, identical prompt, only the grant
differing:

| run | flags | result |
| :--- | :--- | :--- |
| D | `--allow-all-tools` (production before this set) | file rewritten; `filesModified: ["sample.txt"]` |
| E | `+ --available-tools='view,grep,glob'` | file untouched; `filesModified: []` |

Live **end-to-end through `route()`** after the fix: told to bring a scratch
file "into line with the convention", the model tried, reported *"I can't
write files directly with my tools"*, fell back to shell, was blocked there
too, and the file was unchanged.

> **Note for severity grading:** an earlier blunt "create breach.txt" prompt
> was *declined by the model*, while the benign "bring this file into line
> with the convention" framing wrote immediately. **Refusal is not a control;
> the grant is.** Please do not treat model reluctance as mitigation.

## Deliberately out of scope

- **Not** re-opening Set 078's seat-profile contract (asserted provenance, no
  billed-usage accounting). Those degraded guarantees cover provenance and
  billing, never write access.
- **Not** sandboxing the orchestrator's own CLI session — only calls the
  *router* makes.
- **Not** Set 124's remaining sessions, which resume after this closes.
- The live probes are **not** shipped as tests: they cost real premium
  requests and would make the suite non-hermetic, which is the exact property
  Set 124 S1 had to restore.

## Severity guidance

Grade by **consequence** (probability the stated failure reaches a real user ×
impact). Low probability **or** low impact is Minor; no nameable failure
scenario is a nit.
