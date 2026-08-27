# The middle ground — two surfaces, shipped soon

**Status:** proposal, for critique. **Operator-authored**; the framing,
priorities, and the compromise itself are the operator's decision. Reviewers
are asked to make it work, not to replace it.
**Date:** 2026-08-26

**The constraint that governs this document: a working product is needed
soon.** The architecture in `docs/architecture-and-experience.md` is where this
should end up. It is not where this can start. This proposal is an explicit,
deliberate compromise chosen to reach something usable quickly, with the
expectation that it is refactored toward the fuller design later.

**This is not a request for a better architecture.** Two rounds of that already
exist (`docs/reviews/architecture-*.md`). This is a request to pressure-test a
shortcut: will it work, what breaks first, and which of its decisions are hard
to undo.

---

## 1. The shape

The solution surface divides in two. Both live in the existing VS Code
extension, whose look and feel is preserved.

```text
┌─ SOLUTION ────────────────────────────────┐
│                                           │
│  ▸ Referenced Components      (collapsed) │
│      read-only · other repos · black boxes│
│                                           │
│  ▾ Editable Components                    │
│      the AI Work Explorer, as today       │
│      plus the fixes                       │
│                                           │
└───────────────────────────────────────────┘
```

---

## 2. Referenced Components

**What they are.** Libraries the solution depends on that live in *other
repositories*. The user adds a reference by pointing at the external repo.
Inside the current repository they are **read-only**.

**References are declared in a JSON file** — added and removed through the UI,
committed with the project.

**Clicking a referenced component shows its surface, and what that means
depends on the kind of work:**

- **Code:** the library's **public API**. Types, operations, signatures — the
  things a caller may depend on.
- **Documents:** a list of the documents in that repository with a summary of
  each, rendered as an expanded table of contents.

**The whole section collapses**, because most of the time it is context rather
than work.

**AI engines treat a referenced component as a black box that cannot be
opened.** Not merely discouraged — a boundary. It is opened only when there is
a real or suspected defect inside it, and then only with the human operator's
permission.

**Changes to a referenced component are proposed, never made.** The engine
opens a pull request against the owning repository. Merging happens there,
under that repository's own rules.

### 2.1 Why this is stronger than it looks

**A library's public API is a contract that already exists and was written by
someone with no stake in today's argument.** The fuller architecture spends
step 3 authoring contracts. For referenced components that step is free: the
API *is* the contract, it is already written down, and it can be extracted
mechanically rather than generated.

**It also gets the context budget right by accident.** The single largest cost
in AI-assisted work on a real codebase is context. A referenced component
contributes its API surface and nothing else — which is both cheaper and more
correct than pasting in a repository.

**And the black-box rule has real teeth here**, because the boundary is a
repository boundary. "You may not edit this" is enforced by the file system and
by git, not by an instruction in a prompt.

---

## 3. Editable Components

**Largely the existing AI Work Explorer**, with the defects fixed. The tree,
the icons, the row actions, the two-inline-actions rule, the projection-backed
model — all preserved. Staff who use it today should not have to relearn it.

**It works for any AI-facilitated development, not only code** — application
development and document development alike.

**It uses the files that already exist:** `spec.md`, `activity-log.json`,
`session-state.json`, `change-log.md`.

**Ceremony stays at a minimum.** This is a constraint on the fixes, not a
description of them: a fix that adds a required step, a new file, or a new
gate has to justify itself against the reason this proposal exists.

---

## 4. What this defers, knowingly

Named here so reviewers do not have to discover them, and so the operator's
acceptance of them is on the record rather than implied:

- **No sandbox.** AI-authored code still executes on the host, in the
  developer's own environment.
- **No separate control plane.** The extension still shells out to Python.
- **No browser surface.** The extension is the only UI.
- **No transactional promotion.** Changes land in the working tree as they are
  made.
- **The six-step model is not enforced** by this surface. It remains available
  underneath.

---

## 5. What the operator is *not* deferring

Two items are in scope for v1 regardless, because they are defects in running
code rather than features of a proposal:

- **Credentials must not reach AI-authored code.** `checks.py::_spawn` passes
  no `env=`, so check commands — which run AI-written tests — inherit all
  three vendor API keys.
- **The record must not accept invalid authority.** A verifier can exempt its
  own finding from blocking (`verdict.py::is_doc_only_issue`); a scripted
  review satisfies a real one (`workflow.py::fold` records `simulated` and
  never reads it); `fold` enforces no legal step order.

---

## 6. Open questions the reviewers should settle

1. **How is the public API extracted, per language?** .NET and Java are the
   mandated stacks. Is this reflection, a parser, an existing tool per
   ecosystem, or an AI-generated summary — and if the last, how is staleness
   detected?
2. **What pins a referenced component?** A commit, a tag, a released version,
   or nothing? What happens when the external repository moves ahead of the
   API surface shown here?
3. **Is the black-box rule mechanically enforced or prompt-enforced?** If an
   engine can read the file anyway, the boundary is advisory. What makes it
   real without adding ceremony?
4. **Cross-repo pull requests must work on both Azure DevOps and GitHub.**
   What is the smallest thing that does that, and what credentials does it
   need?
5. **Documents have no compiler.** What generates the per-document summary,
   when is it refreshed, and what stops it drifting from the documents?
6. **Which parts of this are one-way doors?** Specifically: does the JSON
   reference manifest, or the two-section tree, foreclose the fuller
   architecture — or is it a clean subset of it?
7. **`activity-log.json` is currently demoted** to optional diagnostics that
   are never gate evidence (`framework-reconception.md`). This proposal uses
   it as a display source. Is that consistent, or does it quietly promote it
   back?
