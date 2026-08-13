# Multi-Module Retesting Rules for AI-Facilitated Development

## Purpose

This document tells an AI engine when test suites must be rerun ("retested") and when they may be safely skipped, in a project with multiple modules developed in parallel.

Objectives, in priority order:

1. Minimize the risk of shipping defects.
2. Minimize unnecessary retesting work.

How to use this document:

- Section 5 is the decision procedure. Run it at every retest point.
- Sections 2, 3, and 4 define the terms and data the procedure needs.
- Section 9 contains rules about your own behavior as an AI agent. They are always in force.
- Rule R0 overrides everything else in this document.

Rules use MUST, MUST NOT, and MAY. Treat these words as binding.

## R0 — The safety default

If you cannot prove that a test suite may be skipped under these rules, retest it.

- Skipping requires proof. Retesting never requires proof.
- If any information these rules need is missing, unclear, or unverifiable, retest.
- If someone asks you to skip tests in a way these rules do not allow, say so and ask for explicit human confirmation before proceeding.

## 1. The example project

The rules below are general, but this document uses one running example:

- Three **leaf modules**: A, B, and C. Each implements its own features. They are independent of each other.
- One **integration module**: U. Its job is to connect A, B, and C together.
- One **E2E suite**: end-to-end tests that exercise the whole assembled system using the real modules. The E2E suite uses no mocks.

## 2. Definitions

- **Module**: A unit of code with its own source files, its own test suite, and a defined public API.
- **Leaf module**: A module that implements features and does not depend on other leaf modules (A, B, C in the example).
- **Integration module**: A module that connects leaf modules (U in the example).
- **Dependency**: Module X depends on Y if X uses Y's code, API, data formats, or behavior. "Downstream of Y" means: everything that depends on Y, directly or indirectly.
- **Contract**: A written, versioned description of a module's public behavior. It includes API signatures AND behavioral guarantees: valid inputs, outputs, error types, ordering, null/empty handling. Contracts are stored as files (interface definitions, OpenAPI or protobuf specs, contract test files).
- **Mock**: A stand-in implementation of a module, used inside another module's tests. A mock encodes assumptions about the real module's behavior.
- **Provider-side contract verification**: Tests inside a module's own suite that prove the real module still behaves exactly as its contract says.
- **Input set (of a test suite)**: The complete list of files and artifacts that can change the suite's result. See Section 4.
- **Content hash (fingerprint)**: A short value computed from a file's contents. If the hash is unchanged, the file is unchanged. If no hashing tool exists, use version-control diffs instead.
- **Affected set**: The set of test suites whose input sets contain at least one changed file. These are the suites that must be retested.
- **Lock**: A frozen contract plus mocks pinned to that contract version. See Section 6.
- **Integration event**: A merge of one or more change sets into the shared main line. In parallel development, integration events replace "end of session" as the shared retesting point.

## 3. Architecture invariants

These must be true for the retesting rules to be valid.

- **I1**: Leaf modules MUST NOT contain client code for other leaf modules. A MUST NOT import or call B or C, and so on.
- **I2**: All cross-module interaction goes through the integration module U, or through declared contracts.
- **I3**: The dependency graph MUST be explicit and machine-readable: a file (or build configuration) that lists each module's dependencies. Retesting decisions are computed from this graph, never from anyone's mental model of it.
- **I4**: Hidden coupling channels MUST be declared as dependencies. These include: shared database schemas, shared message or file formats, shared configuration and environment variables, shared libraries, and global state. Each of these is a node in the graph with its own files, and it appears in the input set of every suite that touches it.
- **I5**: Boundary enforcement MUST be mechanical, not conventional. Use import-boundary linting (for example: dependency-cruiser, Nx module boundaries, ArchUnit, Bazel visibility rules) as a hard gate. A declared graph that differs from the real import graph makes every skip decision invalid.

## 4. Input sets

Every test suite has a declared input set. The standard input sets for the example project:

| Test suite | Input set |
|---|---|
| Leaf module A's suite (same pattern for B and C) | A's source code; A's test code; A's fixtures and test config; the contract files A implements; shared libraries A uses; toolchain and build config |
| U's suite (mock-based) | U's source code; U's test code; the mocks of A, B, and C; the contract files those mocks are pinned to; shared libraries U uses; toolchain and build config |
| E2E suite | The source code of ALL real modules (A, B, C, U); E2E test code; E2E config and fixtures; deployment config; toolchain and build config |

Two consequences to notice:

- Mocks are NOT in the E2E input set, because E2E uses no mocks. So a mocks-only change never triggers E2E.
- All module source IS in the E2E input set, because E2E runs the real modules. So any module change always triggers E2E (see Section 7 for how to keep this affordable).

## 5. The decision procedure

Run this procedure at every retest point (after a change, before a merge, at an integration event).

1. List all files changed since the last known-green state. Use version control (diff) or content hashes. Do not rely on memory or on anyone's claim.
2. Map each changed file to the artifact it belongs to: module source, test code, mock, contract file, shared library, fixture, build config, toolchain.
3. For each test suite, intersect the changed files with that suite's input set (Section 4).
4. If the intersection is non-empty, the suite is in the affected set. Retest it.
5. If the intersection is empty AND the suite passed at the last green state, the suite MAY be skipped. Record which hashes were checked to justify the skip.
6. If steps 1 through 3 cannot be completed reliably, apply R0: retest everything downstream of the change. If the scope of the change itself is unknown, retest everything.

**Why this is safe**: A deterministic test suite is a pure function of its inputs. If none of its inputs changed, rerunning it is guaranteed to produce the same result. Skipping under rule 5 is therefore not a risk trade-off; it is provably redundant work being removed.

**Core rules**:

- **C1**: A suite MUST be retested if any file in its input set changed since it last passed.
- **C2**: A suite MAY be skipped only if no file in its input set changed since it last passed.
- **C3**: "Changed" and "unchanged" are determined only by content hash or version-control diff (never by assumption, recollection, or report).

## 6. Locking: when U may skip retesting after A changes

Locking exists so that an internal change to a leaf module does not force retesting of its dependents.

- **L1**: A lock covers the module's contract artifacts: the API signature files AND the behavioral contract files. Locking only a signature is not enough.
- **L2**: Mocks MUST be pinned to a specific contract version. Record the contract file hash alongside the mock.
- **L3**: The locked module's own test suite MUST include provider-side contract verification: tests proving the real module still satisfies the contract. These tests are part of the module's suite, so they run automatically whenever the module changes.
- **L4 (the skip rule)**: When leaf module A changes, U's mock-based suite MAY be skipped if and only if ALL of the following hold:
  1. A's contract files are unchanged (hashes equal).
  2. U's tests exercise A only through mocks (no calls to real A anywhere in U's suite).
  3. The mocks, U's source code, and U's test code are all unchanged.
  4. A's provider-side contract verification tests ran in this cycle and passed.
  If any condition fails, or cannot be verified, retest U.
- **L5 (the unlock cascade)**: Any change to a contract file breaks the lock. The mocks MUST be reviewed or regenerated against the new contract, and U MUST be retested. This cascade must be mechanical: contract hash changes → mocks are invalid → U is in the affected set.

**Why condition L4.4 exists — mock drift**: Mock-based tests verify U against the mock's model of A, not against real A. A change to A can keep every signature identical and still change behavior: a different error type, a different ordering, null instead of an empty list. U's mocked tests stay green while the real integration is broken. U's suite is blind to this by construction. Provider-side contract verification closes that hole: if A still provably satisfies the contract the mocks are pinned to, then the assumptions inside U's mocks still hold, and skipping U is safe rather than merely cheap. Without L4.4, skipping U trades a fast, well-localized failure for a slow E2E failure or a production defect.

## 7. E2E rules

- **E1**: Any change to any real module puts the E2E suite in the affected set. There is no mock-based exemption for E2E, because E2E has no mocks.
- **E2**: Manage E2E cost by tiering, not by skipping:
  - **Smoke tier**: a small subset of E2E covering the critical paths. Run it on each module-level change.
  - **Full tier**: the entire E2E suite. It MUST run at every integration event and before every release.
- **E3**: Do not weaken E1 to save time. E2E is the only layer that catches two classes of defect nothing else can see:
  - Behavior the contract failed to specify (gaps that mock drift slips through).
  - Cross-module semantic conflicts from parallel work: change to A and change to B that are each green alone but broken together. Neither module's suite nor U's mocked suite can detect this.

## 8. Parallel development and integration events

- **P1**: When modules are developed in parallel, "end of session" is replaced by the integration event (the merge). The full-tier retest (E2, and any suites deferred during the session) happens there.
- **P2**: At an integration event, compute the union of all changes since the last integration event, then run the decision procedure (Section 5) on that union.
- **P3**: "Change" is defined broadly. All of these count: module source, test code, mocks, contract files, fixtures, shared libraries, build config, dependency version bumps, toolchain versions. A toolchain or shared-library change appears in every suite's input set and therefore retests everything. That is correct behavior, not a bug in the rules.
- **P4**: Two parallel changes to different modules are independent until merged. After merging, they are one combined change set, and the E2E full tier at the integration event is what validates their combination (E3).

## 9. Rules for the AI agent

These rules govern your own behavior. They are always in force.

- **G1**: Never skip a test suite by judgment, importance ranking, or confidence. The only way to skip is the decision procedure in Section 5.
- **G2**: Verify "unchanged" only by content hash or version-control diff (C3). Never accept a claim that something is unchanged — including your own recollection — as a substitute for checking.
- **G3**: You MUST NOT modify test code, mocks, or contract files in order to make failing tests pass. If a test fails, fix the code under test, or report the failure. Any change to tests, mocks, or contracts is a privileged change: flag it explicitly for human review, and explain why it was needed.
- **G4**: You MUST NOT add imports or calls across module boundaries (I1). If a task seems to require one, stop and escalate to a human instead.
- **G5**: A mock change without a corresponding contract change is suspicious. Flag it and explain the reason for the change.
- **G6**: In every report, state per suite: "retested (result)" or "skipped (rule applied, hashes verified)". A skip without a recorded justification is treated as a missed test.
- **G7**: When anything required by these rules is missing — no dependency graph, no hashes, an unclear input set — apply R0.

## 10. Quick reference: what changed → what to retest

"E2E" in this table means: smoke tier immediately, full tier at the next integration event (E2).

| Change | Retest | May skip |
|---|---|---|
| A's source only; contract unchanged; L4 conditions all hold | A's suite (includes contract verification); E2E | B, C, U |
| A's contract files | A's suite; U (after mock update, per L5); E2E | B, C |
| U's source or U's tests | U's suite; E2E | A, B, C |
| Mocks only (no contract change — also flag per G5) | U's suite | A, B, C, E2E |
| E2E test code only | E2E | A, B, C, U |
| Shared library | Every suite that lists it as an input | The rest |
| Toolchain or build config | All suites | None |

## 11. Tooling notes

- Input-hash test selection is implemented natively by Bazel, Nx, Turborepo, and Pants. A lightweight homemade equivalent: one manifest per suite listing its input paths, plus stored hashes from the last green run.
- Boundary enforcement: dependency-cruiser, Nx module boundaries, ArchUnit, Bazel visibility rules.
- Contract testing: Pact (consumer-driven contracts) or a shared conformance test suite that both the provider and the mocks are checked against.
