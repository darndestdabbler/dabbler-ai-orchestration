# What to build next: the framework, then the CSV walkthrough

> **Superseded, 2026-08-25.** This document assumes the reader is building.
> **The operator's staff supervise AI engines and do not write the code**, which
> changes where their attention goes and therefore what the framework is for.
> Read `docs/framework-reconception.md` instead. This is kept because the pilot's
> coverage requirements below are still what a walkthrough has to demonstrate.

**Set by the operator, 2026-08-24.** Two sessions. The first builds the
framework; the second builds the pilot on top of it.

---

## The point, so nobody drifts

The pilot is **not** there to prove the framework works, and **not** to show off
what AI can do. It exists so the operator can walk through a complete, tiny
project and see the machinery and every UI surface actually working, before his
staff touch it.

So the measure of success is coverage, not difficulty. Every step, every screen,
every state, on a problem so small that nothing distracts from the mechanism.

Two things follow, and both are easy to get wrong:

- **A hard problem would be a mistake.** If the reader is thinking about CSV
  edge cases, they are not looking at the framework.
- **A partial walkthrough is worse than none.** A step that has no UI, or a
  state the tree cannot show, is exactly what the operator is trying to find
  out about.

## The six steps

There is no seventh step. **Feedback loops exist all along the way** — every
step can send work back to an earlier one, and the framework has to represent
that as a normal event rather than an exception.

1. Plan and design — cross-reviewed, developer approves
2. Decompose into components — cross-reviewed, developer approves
3. Formalize the contracts — cross-reviewed, developer may object but is not a gate
4. Build the mocks — cross-reviewed
5. Build the integration against the mocks — cross-reviewed
6. Build the real components — parallel, one developer per component

---

# Session A — build the framework

## A1. The solution manifest

One file describing the whole solution. This is the spine; everything else
reads it.

Per component: name, kind (`library` | `integration`), where the source lives,
where the contract lives, what it depends on, published version, and which of
the six steps it has reached.

**Do not extend `docs/modules.yaml`.** `ai_router/modules.py` already declares a
module manifest with a TypeScript reader, but it groups *work* within one
repository — its fields are slug, code roots, touches, spec sections, context
assets. Components need identity, artifact coordinates, contracts and dependency
edges. Different model, different file. State the relationship between them
explicitly so two authorities do not quietly appear.

## A2. Work breakdown, attached to components

Steps 1–5 belong to the solution as a whole. Step 6 fans out: one work
breakdown per component. The tree has to show both without the reader having to
think about which is which.

## A3. The Solution & Work Explorer

The existing Work Explorer, reframed. Components at the top; the familiar
Not Started / In Progress / Complete breakdown underneath each one.

Per component row: name, version, status, who is working on it, and **used by** —
the list of components that break if this one changes. That last one is the
highest-value line in the tree and the only thing there that a developer cannot
work out for themselves today.

Also needs: a node for solution-wide work, non-empty status folders only, lazy
loading with completed rolled up to a count, and the contract opening in an
editor tab rather than a popup.

**This needs Node, which is not installed.** `sudo apt-get install -y nodejs npm`.
Without it the extension cannot be built or tested, and "show all the UI
components" cannot be met.

## A4. Contract documents

The operator asked for this specifically: contracts documented **systematically,
in tables and diagrams**, so a developer can digest them. A signature list is
not a contract. Each row states something a signature cannot carry, and each
becomes a test:

| Section | Holds |
| --- | --- |
| The call | Names, parameters, return types |
| Preconditions | What must be true going in |
| Postconditions | What is guaranteed coming out |
| Retained on purpose | What is deliberately *not* removed or changed |
| Side effects | What else changes, including in-place mutation |
| Errors | How it fails, and whether failure is normal |
| Not promised | What callers must not depend on |

That last row is what stops contracts becoming brittle. A contract that pins
what nobody depends on fails on every improvement, and a check that cries wolf
gets switched off.

Generate these from the contract definition, never hand-maintain them beside the
code — a black box with drifted documentation is worse than one with none,
because people trust it.

## A5. The step driver

A command that moves a solution through the steps: records where each thing is,
sends each step's output for cross-provider review, records the outcome, and
surfaces the two developer approval points.

**Reuse, do not rebuild:**

| Need | Already exists |
| --- | --- |
| Cross-provider review | `ai_router/verify.py` |
| Adjudication when author and reviewer disagree | `verify.py:1010-1303` — excludes the author's *and* every prior reviewer's provider, fails closed |
| Running with no API keys | `ai_router/transports/offline.py` |
| Contract enforcement, both halves | the contract kit in the eval repo |
| The machine record | `.dabbler/runs/` |

---

# Session B — the CSV walkthrough pilot

## What it is

The smallest solution that still has real structure. Three components:

| | Component | Kind | What it is |
| --- | --- | --- | --- |
| 1 | `csv-model` | library | A flat object model. Perhaps four fields. Nothing nested. |
| 2 | `csv-parser` | library | Reads a simple CSV and deserializes it into the model |
| 3 | `csv-app` | integration | Uses a client for the parser and does something visible with the result |

Deliberately trivial. The reader should never have to think about the problem.

## What the walkthrough must show

Run the whole thing start to finish, and make sure each of these is actually
visible somewhere:

- Step 1 producing a plan, being reviewed by two different vendors, and waiting
  for approval
- Step 2 producing more than one candidate decomposition, with a recommendation
- The three components appearing in the Explorer for the first time
- Contracts rendered as tables a person can read
- Mocks satisfying the contracts
- The integration running end to end on mocks alone
- Two components being built at the same time by different people
- **A feedback loop firing** — something sending work back to an earlier step,
  and the affected components being named. This is the one most likely to be
  skipped, and it is the one that proves the framework is not a straight line.
- A contract change naming its consumers before they are hit
- The finished state

## How to know it is done

The operator can follow it end to end without asking what something means, and
finishes knowing what his staff would do at each step and where they would look
to see progress.
