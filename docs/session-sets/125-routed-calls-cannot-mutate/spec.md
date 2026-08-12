# Routed Calls Cannot Mutate The Repo Spec

> **Purpose:** `route()` is one contract, but its two transports do not
> honour it equally. On `api` a routed call is a text completion and
> **cannot** touch the filesystem. On `copilot-cli` the same call dispatches
> an **agentic** CLI holding `--allow-all-tools` — shell, file creation, file
> editing, sub-agent spawning — against the live working tree. This set
> closes the gap by constraining `copilot-cli` down to the guarantee `api`
> already gives for free.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/125-routed-calls-cannot-mutate/`
> **Prerequisite:** None (runs ahead of `124-verify-type-is-machine-project-state` Session 2)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Operator direction, 2026-08-12:** run this as a "Session 0" ahead of Set
124 Session 2, and *"keep in mind that we have the Copilot CLI AND the
Direct API approach."* That second sentence is the spec's organising
principle: this is a **transport-parity defect**, not a Copilot-CLI quirk.

## Session Set Configuration

```yaml
requiresUAT: false        # The deliverable is a constrained subprocess argv judged by structural falsifiers plus a recorded matched-pair live probe. No rendering surface, no operator-visible flow change.
requiresE2E: false        # Nothing under the Playwright `covers` paths is touched: this is ai_router/cli_transport.py and its tests. The extension MANIFEST is untouched, so L-064-12 does not fire.
uatStyle: ad-hoc
sessionSizeException: none
```

---

## How this was found

Set 124 Session 1 wrote `project-verify-type.txt`, which made the project
file outrank any configured `transport.profile` — including inside the test
suite. Tests calling `route()` stopped using the mocked `api` path and began
dispatching through the **real Copilot CLI**. Each dispatch was an
autonomous agent with write access to this repo.

**Measured blast radius, 2026-08-12:** 23 files modified with no human in
the loop, during two pytest runs (04:53, 04:57, 05:07, 05:13). Among them
two production modules (`ai_router/config.py`, `ai_router/verification.py`),
extension source and two of its test files, the built `dist/extension.js`
bundle, a JSON schema, six docs — plus one file the agent **invented**
outright (`docs/concepts/routing-layer.md`, 150 lines). It also wrote two
spurious rounds into a live verification ledger. All 23 were reverted by
operator decision; the invented doc is preserved outside the repo.

The test coupling is already fixed (Set 124 S1's conftest guard). **This set
fixes the thing underneath it**, which the coupling merely exposed.

## The parity table this set exists to make true

| | `api` transport | `copilot-cli` transport |
| :--- | :--- | :--- |
| what the provider receives | `model` / `max_tokens` / `system` / `messages` — **no `tools` key** (`providers.py:110`) | a headless agentic CLI invocation |
| tools available to the model | none | **all of them**, via `--allow-all-tools` (`cli_transport.py:687`, `:729`) |
| can the call edit the repo? | **no, by construction** | **yes** — demonstrated below |
| can the call run shell? | no | yes (`powershell` tool) |
| can the call spawn sub-agents? | no | yes (`task`, `write_agent`) |

**The right-hand column is the defect.** A verifier that can edit the code
it is judging can, in principle, fix a finding and then report VERIFIED on
its own edit — which quietly dissolves the cross-provider guarantee the
whole workflow rests on.

## Evidence gathered at authoring (re-derive before trusting)

The Copilot CLI's real tool universe on this seat, probed 2026-08-12:

```
powershell, read_powershell, stop_powershell, list_powershell, view,
create, edit, web_fetch, fetch_copilot_cli_documentation, skill, sql,
session_store_sql, read_agent, list_agents, write_agent, grep, glob, task,
github-mcp-server-*
```

A **matched pair** — identical prompt, only the grant differs:

| run | flags | result |
| :--- | :--- | :--- |
| D | `--allow-all-tools` (production today) | file rewritten; `linesAdded: 1, linesRemoved: 1, filesModified: ["sample.txt"]` |
| E | `--allow-all-tools --available-tools='view,grep,glob'` | file untouched; `filesModified: []` |

Two things this pair settles, and a third it does not:

1. The capability is real and the constraint removes it.
2. **`--available-tools` still permits reading**, so path-aware review and
   the Set 104 large-prompt handoff (which requires a file-read tool to pull
   its payload from the temp dir) keep working.
3. It does **not** show that an adversarial prompt is needed. An earlier run
   with blunt "create breach.txt" phrasing was *declined by the model*,
   while the benign "bring this file into line with the convention" framing
   wrote immediately. **Refusal is not a control**; the grant is.

## Decisions already made — do not reopen

1. **A routed call is a TEXT COMPLETION on every transport.** The router
   owns model choice, prompt shaping and metrics; orchestrators own
   mechanics (reading, editing, running commands). No routed call needs to
   write, so the restriction is transport-wide rather than
   verification-only. Narrowing it to `session-verification` would leave
   every other task type holding the same loaded gun and would be harder to
   explain — SIMPLE is binding.
2. **Allowlist, not denylist.** `--available-tools` removes tools from the
   model's view; `--deny-tool` only withholds permission. A denylist also
   fails open on any tool a future CLI release adds.
3. **`--allow-all-tools` stays**, and is not a contradiction: it governs
   *auto-approval without prompting*, which headless dispatch requires. Once
   `--available-tools` shrinks the universe to read-only tools, "allow all"
   allows only those.
4. **Temp-dir access stays.** The Set 104 handoff pull reads its payload
   from the system temp dir; `--disallow-temp-dir` would break it.
5. **The `api` path is not touched.** It already satisfies the contract.

## Non-goals

- **Not re-opening Set 078's seat-profile contract** (asserted provenance,
  no billed-usage accounting). Only the tool grant changes.
- **Not sandboxing the orchestrator.** This is about calls the *router*
  makes on the orchestrator's behalf, not about the human's own CLI session.
- **Not Set 124's remaining sessions.** Those resume after this one.

---

## Sessions

### Session 1 of 1: A routed call cannot touch the repo

**Steps:**

1. Register.
2. **Constrain both dispatch paths.** `cli_transport.py` builds argv twice —
   the inline path (`:683`) and the Set 104 handoff path (`:725`). Add the
   read-only `--available-tools` allowlist to **both**, from one shared
   module-level constant so they cannot drift, with the tool universe and
   the parity rationale recorded beside it. A fix applied to one path only
   is the defect this repo has hit before (`L-069-1`).
3. **Falsify in both directions** (`L-112-1`). The rule fires: each dispatch
   path's argv carries the allowlist, and it names no mutating tool
   (`create`, `edit`, `powershell`, `task`, `write_agent`). The rule does not
   fire indiscriminately: the read tools the handoff depends on are still
   present, and `--allow-all-tools` is still passed so headless dispatch does
   not start prompting. Add a **structural** assertion that the allowlist and
   the known-mutating set are disjoint, so it holds however either is spelled.
4. **Record the transport-parity guarantee where it is owned**, not only in
   this spec: state in the transport documentation that a routed call cannot
   mutate the workspace on either profile, and why `--allow-all-tools` alone
   did not deliver that. Cite the matched pair as the evidence.
5. Full pytest at close after the last edit; verify; close; Step 9 review
   (this is the set's final session).

**Creates:** the shared allowlist constant and its falsifiers
**Touches:** `ai_router/cli_transport.py`, `ai_router/tests/test_cli_transport.py`, the transport doc
**Ends with:** a routed `copilot-cli` call is a text completion that cannot create, edit, or shell out — the same guarantee the `api` transport gives by construction — proven by a planted violation rather than by reading the flags.
**Progress keys:** `bothPathsConstrained`, `grantFalsified`, `parityDocumented`

> **Irony budget: 10 new test functions.** Small because the change is a few
> argv elements; the risk is concentrated in *both paths* and in *not*
> breaking the handoff's read tool. If it cannot be covered in 10, the
> design is wrong.

---

## End-of-set deliverables

- One shared read-only tool allowlist applied to both dispatch paths.
- Falsifiers proving the grant blocks mutation and still permits reading.
- The transport-parity guarantee stated in the doc that owns it.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
