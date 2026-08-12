# Change log — Set 125: routed calls cannot mutate the repo

**One session. Closed 2026-08-12. Verdict: VERIFIED (cross-provider, 0 findings).**

## What changed

`route()` is one contract, but its two transports did not honour it equally.
This set made them equal.

- **`ai_router/cli_transport.py`** — added `READ_ONLY_TOOLS`
  (`view`, `grep`, `glob`), `MUTATING_TOOLS`, and `_tool_grant_argv()`, and
  applied the grant to **both** argv builds: the inline dispatch path and the
  Set 104 large-prompt handoff path. One shared helper feeds both, so they
  cannot drift.
- **`ai_router/tests/test_routed_calls_cannot_mutate.py`** (new) — 12
  falsifiers, parametrized across both dispatch paths.
- **`ai_router/tests/test_cli_transport.py`** — two existing argv-identity
  tests updated to the new contract.
- **`ai_router/router-config.yaml`**, **`ai_router/CHANGELOG.md`** — the
  transport-parity guarantee recorded in its operative homes.

## Why

On the `api` profile a routed call is a plain HTTPS completion: `providers.py`
sends `model` / `max_tokens` / `system` / `messages` and **no `tools` key**, so
the provider returns text and the call cannot touch the filesystem **by
construction**.

On the `copilot-cli` profile the same call dispatches an **agentic** CLI, and
`--allow-all-tools` alone handed the model the entire tool universe against the
live working tree — arbitrary shell (`powershell`), file creation and editing
(`create`, `edit`), and sub-agent spawning (`task`, `write_agent`).

**Observed, not theorised.** On 2026-08-12 routed calls fired from the test
suite modified **23 files** in this repo with no human in the loop: two
production modules (`config.py`, `verification.py`), extension source, the
built `dist/extension.js` bundle, a JSON schema, six docs, and one 150-line
document the model invented outright. They also wrote two spurious rounds into
a live verification ledger. All 23 were reverted by operator decision.

The trigger was Set 124 S1's verify-type coupling (already fixed by its
conftest guard), but the hazard outlived the trigger: **a verifier that can
edit the code it is judging can fix a finding and then report VERIFIED on its
own edit**, which dissolves the cross-provider guarantee the workflow rests on.

## Shape of the fix, and why each part is the way it is

- **Allowlist, not denylist.** `--available-tools` removes a tool from the
  model's view; `--deny-tool` only withholds permission, and a denylist fails
  open on any tool a future CLI release adds.
- **`--allow-all-tools` retained.** It governs auto-approval without
  prompting, which headless dispatch requires. Once the universe is read-only,
  "allow all" allows only read-only tools. A test pins this against a
  plausible "simplification".
- **`view` is required.** The Set 104 handoff bootstrap tells the model to
  pull its payload from a temp file with a file-read tool; removing `view`
  would read as a security win and silently break every large dispatch.
  Temp-dir access is retained for the same reason.
- **Transport-wide, not verification-only.** The router owns model choice and
  prompt shaping; orchestrators own mechanics. No routed call needs to write,
  and one rule is the one a developer can explain.

## Evidence

Mutation-tested, not merely observed passing (`L-112-1`):

| mutation | result |
| :--- | :--- |
| `_tool_grant_argv()` returns `[]` | 5 failed |
| allowlist grows `edit` + `powershell` | 3 failed |
| restored | 12 passed |

Live matched pair through the raw CLI, identical prompt, only the grant
differing — `--allow-all-tools` alone rewrote the target
(`filesModified: ["sample.txt"]`); with the allowlist, `filesModified: []`.

Live end-to-end through `route()` after the fix: the model tried to comply,
reported *"I can't write files directly with my tools"*, fell back to shell,
was blocked there too, and left the file unchanged.

**Dogfood:** this set's own verification round dispatched under the new
constrained grant and mutated nothing.

> An earlier blunt "create breach.txt" prompt was *declined by the model*,
> while a benign "bring this file into line with the convention" framing wrote
> immediately. **Refusal is not a control; the grant is.**

## Process notes

- Run as an operator-requested **"Session 0"** ahead of Set 124 Session 2.
  Session numbers are forward-only and contiguous, so a literal session 0
  inside Set 124 is not expressible; a one-session set that runs first is the
  same thing the tooling can represent.
- The full suite's only failure was the `one-active-set` drift check (Sets 124
  and 125 both `in-progress`) — repo **state**, not code. Set 124 was paused
  via the sanctioned `cancel_session_set` writer under explicit operator
  authorization and **restored immediately after this close**. Recording a
  false `passed` was declined; the run of record carries the full provenance
  in its `--detail`.

## Not done here

- Set 078's seat-profile contract is untouched — its "explicitly degraded
  guarantees" cover provenance and billing, never write access.
- The orchestrator's own CLI session is not sandboxed; this governs only calls
  the *router* makes.
- The live probes are deliberately not shipped as tests: they cost real
  premium requests and would make the suite non-hermetic.
