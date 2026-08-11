# Verify-Type Resolution And Startup Simplification Spec

**The operator's framing, 2026-08-11:** replace the setup webview with a
file plus an environment variable, infer the verification type, and
confirm it only when inference is ambiguous. The full three-branch rule
was designed and recorded before this spec and is **not re-derived here**:
[`../../planning/verify-type-resolution.md`](../../planning/verify-type-resolution.md).

## Session Set Configuration

```yaml
requiresUAT: false        # The deliverable is a resolution rule judged by tests and a cold-start walk, not a rendering surface. Session 3 DELETES a UI surface rather than adding one; its evidence is that the 9 retired Layer 3 scenarios are gone and the remaining 31 still pass.
requiresE2E: false        # Set-wide default. Session 3 removes Playwright specs and edits package.json, so L-064-12 applies at THAT session's close and it runs the full suite there — declared in the session, not here.
uatStyle: ad-hoc
prerequisites:
  - slug: 115-work-explorer-session-node-ux
    condition: complete
```

---

## Decisions already made — do not reopen

1. **Three-branch resolution, file first.** Project file → environment
   default confirmed once → guided setup. Recorded in full in
   `verify-type-resolution.md`; this set implements it.
2. **`project-verify-type.txt` is the SINGLE SOURCE OF TRUTH, and
   `transport.profile` is DERIVED from it** (operator, 2026-08-11,
   settling that document's open question 4). Two mechanisms for one fact
   is a defect class this repo has hit three times; this set must end
   with one.
3. **Same-provider verification is allowed, and warns.** Operator ruling,
   verbatim: *"Verification with the same provider is better than no
   verification at all, but the results should be flagged with this
   limitation."*
4. **The limitation is a FIELD ON THE RECORD, not a gate.** Set 116's
   standing rule holds — this set adds no blocking check.
5. **The file wins silently over the environment.** A project's committed
   choice is not overridden by whichever machine it is checked out on.
   State it in the implementation rather than leaving it implicit.

## What already exists and must be reused, not rebuilt

Audited 2026-08-11. **The gap is not detection** — it is the resolution
order, the confirm-once-and-remember step, and the qualified-verdict
field.

| module | lines | what it already does |
| :--- | ---: | :--- |
| `ai_router/config.py` | 681 | resolves `transport.profile`, defaults to `api` (`:504`), validates the `copilot-cli` block (`:232`) |
| `ai_router/copilot_preflight.py` | 314 | Copilot seat readiness |
| `ai_router/transport_diagnostics.py` | 270 | transport-level diagnosis |
| `ai_router/orchestrator_identity.py` | 393 | resolves the orchestrator's **effective** provider — the value the cross-provider check compares against |

## What retiring the webview actually buys

Measured 2026-08-11. **The operator asked whether this eliminates the
Electron tests. It does not — it eliminates nine of them**, and the
honest accounting matters more than the headline:

| | scenarios |
| :--- | ---: |
| **Webview — retired by this set** (`getting-started-surface` 4, `system-status` 3, `vsix-first-run-walkthrough` 1, `overlay-click-swallow` 1) | **9** |
| Tree — unaffected | 28 |
| Harness baseline (`icon-render-mechanism`, `loading-state`, `real-host-baseline`) | 3 |
| **Layer 3 total** | **40** |

Plus **3,576 lines** of surface: `configEditor/` 2,671, `wizard/` 583,
`dashboard/` 322.

**Why the other 31 must stay.** The tree renders in a real VS Code host
and Layer 2 cannot prove that it does. Set 110 S4 shipped a staged VSIX
with an icon shape **VS Code rejected outright** — the worked example of
a defect only a real host catches. Retiring the harness would trade a
known-cheap suite for an unknown-expensive release.

This is the operator's stated sizing principle applied literally:
*eliminate on functionality that is not helpful*, rather than picking a
target number.

## Non-goals

- **Not deleting the tree, and not the extension carve.** Separate item,
  §4a preconditions, later.
- **Not a new gate.** Standing decision 4.
- **Not removing the Layer 3 harness.** See above — 31 scenarios still
  depend on it.
- **Not changing what verification MEANS.** Cross-provider stays the
  standard; this set records when it was not met, and never quietly
  redefines the bar.

---

## Sessions

### Session 1 of 3: One entry point that resolves the type

**Steps:**

1. Register.
2. **Ship the three-branch resolver** as one function with one entry
   point: `project-verify-type.txt` if present and valid → else the
   environment default confirmed once and written to the file → else
   guided setup. **The file wins silently over the environment**
   (standing decision 5), and an invalid value in either is reported,
   never guessed at.
3. **Derive `transport.profile` from the resolved type** (standing
   decision 2) so exactly one mechanism owns the fact. Where
   `config.py:504` currently defaults `transport.profile` to `api`
   independently, that default must become a consequence of resolution,
   not a parallel answer. **Ship a falsifier that sets the two to
   disagree and asserts the file wins** — `L-112-1`.
4. **Audit the four modules above before writing detection code.** The
   readiness and identity checks already exist; this session gives them
   an order, not a replacement. Report anything reimplemented, and why.
5. Full pytest at close after freeze; verify, close.

**Creates:** the resolver, the derivation, its falsifiers
**Touches:** `ai_router/config.py`, a new resolver module, `ai_router/tests/`
**Ends with:** one function answers "what verifies this project," and `transport.profile` cannot disagree with it.
**Progress keys:** `resolverShipped`, `profileDerived`, `disagreementFalsified`

---

### Session 2 of 3: The qualified verdict

The `DIRECT_API` precondition is that at least one provider has a key
**and differs from the current orchestrator**. When that cannot be met,
the session proceeds and the record says so.

**Steps:**

1. Register.
2. **Check the precondition and warn without blocking.** Compare against
   the *effective* provider from `orchestrator_identity.py`, not a
   configured name — they differ, and the cross-provider claim rests on
   the effective one.
3. **Carry the limitation on the verdict record.** A same-provider
   verification is a weaker claim than a cross-provider one and must be
   distinguishable **by a later reader**, which is the whole point. Same
   discipline as `verification_integrity`'s refusal to let an
   uncorroborated verdict pass as corroborated — here the verdict is real
   but *qualified*, and the qualification travels with it.
4. **Ship the falsifier both ways:** a same-provider run produces a
   verdict that is VALID and CARRIES the flag; a cross-provider run
   carries no flag. A field that is never set proves nothing.
5. Full pytest at close after freeze; verify, close.

**Creates:** the precondition check, the qualified-verdict field, falsifiers
**Touches:** `ai_router/verification*.py`, `ai_router/session_state.py`, `ai_router/tests/`
**Ends with:** same-provider verification is permitted, recorded as weaker, and never mistaken later for the real thing.
**Progress keys:** `preconditionChecked`, `verdictQualified`, `bothDirectionsFalsified`

---

### Session 3 of 3: Delete the webview

Last deliberately: build the replacement, prove it, **then** remove what
it replaces. Had Sessions 1–2 failed, the working setup path would still
be there.

**Steps:**

1. Register.
2. **Dogfood the true cold start first** (`L-079-3`). A fresh project with
   no file and no environment variable must reach a working, committed
   `project-verify-type.txt` through the resolver and one confirmation —
   in the terminal, where the agent already is. **If that walk needs the
   webview, stop and report**: the deletion is not earned yet.
3. **Delete `configEditor/` (2,671), `wizard/` (583) and `dashboard/`
   (322)**, plus the 9 Layer 3 scenarios that cover them. Remove their
   commands and menu entries from `package.json`. **Do not change a
   surviving command id** — renaming one breaks keybindings,
   `when`-clauses and Layer 3 fixtures.
4. **Update the three bootstrap files in lockstep** — `AGENTS.md`,
   `CLAUDE.md`, `GEMINI.md` are kept identical by policy and must all
   name where `project-verify-type.txt` lives. **Then grep for every
   sibling reference** to the retired surface: docs, README, the
   consumer-bootstrap template, the cold-start fixture (`L-069-1`: a bug
   is a bug CLASS).
5. `package.json` is the extension MANIFEST, so **`L-064-12` applies**:
   full `npm run test:playwright` after the last edit — expect **31
   scenarios, all passing**. Then full pytest, verify, close.

**Creates:** the deletion, the bootstrap updates
**Touches:** `tools/dabbler-ai-orchestration/src/`, `package.json`, Layer 3 specs, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/`
**Ends with:** 3,576 fewer lines of extension surface, 9 fewer Layer 3 scenarios, and a startup that infers rather than asks.
**Progress keys:** `coldStartWalked`, `surfaceDeleted`, `bootstrapUpdated`, `layer3At31`

> **Irony budget: 25 new test functions across all three sessions.**
> Session 3 should be net NEGATIVE — it deletes 9 scenarios and adds
> none. If Sessions 1–2 cannot cover the resolver and the qualified
> verdict in 25, the resolution rule has grown past what the operator
> described, which was a file, a variable, and one question.

---

## What this unblocks

Nothing depends on it, which is why it is last. Its value is subtraction:
one less surface to maintain, one less thing a new project must be walked
through, and one less place where the answer to *"what verifies this
project"* can be recorded twice and disagree with itself.
