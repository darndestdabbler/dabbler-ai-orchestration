# S2 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects rather than burning
findings — and re-verify rounds — on an agreed baseline.

## What this session is

Set 108 Session **2 of 4**. The set writes a tutorial for the shape the product was
designed around: **several modules, built independently, composed over agreed
contracts.**

This session's **entire deliverable is one document**:

| File | What it is |
| --- | --- |
| `docs/tutorials/three-module-pipeline.md` | The four-part tutorial (**new file**, ~1,230 lines) |

Everything else in the diff is session bookkeeping (`activity-log.json`,
`ai-assignment.md`, `session-state.json`, `session-events.jsonl`) and the three raw
routed-output artifacts this session produced.

**Session 1 settled the design; this session writes prose against it.** S1 closed
VERIFIED after eight rounds and twelve accepted Majors. Its two deliverables —
`s1-service-contracts.md` and `s1-walk-outline.md` (rulings R1–R9) — are **settled
inputs, not open questions.**

## The severity rubric (L-095-1) — apply it

Grade by **CONSEQUENCE**: probability the stated failure scenario materialises for a
real reader × impact on the deliverable's objectives. **Low-probability OR low-impact
is Minor even when technically correct. No plausible failure scenario ⇒ Minor by
definition.** A finding must name a specific reader, at a specific step, who stalls
or is misled.

The deliverable is a document a human will follow start to finish. **A stall is a
defect in the tutorial, never in the reader** — that is the bar. But "this could be
phrased more crisply" is not a Major, and neither is a preference about ordering.

## Scope — what this session deliberately did NOT do

1. **No estate edits.** `adopt-dabbler.md`, `README.md`, `docs/quick-start.md`,
   `hello-world.md`, `module-reorganization.md`, `module-team-hello-world.md`,
   `release-and-recovery.md` and `docs/tutorials/adopt-dabbler-video/` are **Session
   3's Touches**, and the spec separates them deliberately so the wide-blast-radius
   edit gets its own verification. **A finding that this session should have trimmed
   `adopt-dabbler.md`, retired the video, or added this tutorial to the README /
   quick-start ladder is out of scope** — that is S3's plan, verbatim.
2. **No walk, no UAT checklist, no timings.** `requiresUAT: true` points at
   **Session 4**, which walks the tutorial *before* authoring the checklist. **A
   finding that per-part timings are missing is out of scope**; S4 measures them.
3. **No `change-log.md` and no Step 9 review.** Both are set-terminal, in S4.
4. **No redesign of the reference solution** (`D:\Projects\dabbler-csv-pipeline`,
   published as the answer key). Explicit spec non-goal.
5. **No product or router code.** `requiresE2E: false` — this set ships documents,
   so L-064-12 does not arm.
6. **No release.** Nothing is bumped and nothing is published.

## Rulings this session was REQUIRED to hold — settled, not open

These come from `s1-walk-outline.md` and closed VERIFIED. **A finding that
re-litigates one of them is out of scope.** A finding that the tutorial *violates*
one is exactly on target.

| | Ruling |
| --- | --- |
| R1 | slug `{owner}-{service}`, title `{Service} ({Owner})`. Owner-in-slug, **not** version-in-slug — version-in-slug needs central allocation and contradicts "nobody waits". |
| R2 | code roots `modules/{owner}/{service}`; collision is structurally impossible. |
| R3 | manifest order is member-major and is the **only** ordering mechanism; module grouping is exactly one level deep and **no per-member sub-tree exists**. |
| R4 | ownership routing (CODEOWNERS **and** the Azure DevOps equivalent) is written **in full here**, deliberately **not** linked to `adopt-dabbler.md` Part 5 — S3 deletes Part 5, so a link would be dead by the set's own end. |
| R5 | port bands `51xx` / `52xx`, **and one database name per member**. |
| R6 | Part D is one machine, `localhost`, two settings; the solo reader is told it proves the **mechanism**, not conformance. |
| R7 | cross-machine is appendix-only and its **firewall step is unverified**. |
| R8a | the reader's entry state is **stated but linked**, never re-explained. |
| R8b | prerequisites are **Windows 10/11 + .NET 10 SDK + LocalDB**. This **corrects the spec's prose** claim of "nothing but the .NET 10 SDK". No substitute path is offered to macOS/Linux readers. |
| R9 | modules are declared **once**, up front, in one commit. **Parts A/B/C contain no declaration step** — a duplicate slug is rejected by the product and hard-stalls the reader. |

Two more, equally settled:

- **Finish lines are BEHAVIOURAL.** Test counts are observations, never targets,
  because the reader's AI session produces a different test decomposition. Where a
  count appears it is explicitly labelled *"an observation, not a target"*. **A
  finding that a count should be a pass criterion is out of scope.**
- **The two `400`s stay distinct.** A well-formed but invalid request gets the
  service's own validation envelope and **that envelope is contractual**. A body
  that is not JSON at all gets whatever the web framework emits, which is **not
  contractual** and is deliberately never printed as expected output. S1's
  third-provider opinion named collapsing these as the single biggest risk to this
  session.

## Facts established by execution this session — do not re-derive

Every one was produced by running something on 2026-08-03, not by reading source or
trusting S1's transcription.

1. **The answer key still passes**, re-run today from
   `D:\Projects\dabbler-csv-pipeline`: 31 + 24 + 19 = **74 passing, 0 failed, 0
   skipped**. The three summary lines quoted in the tutorial are that run's output.
2. **The Phase A decision-table suite runs with nothing started** —
   `CsvDeliveryProcessorTests`, **12 passing in 81 ms**, filtered run.
3. **This machine's prerequisites** — `dotnet --list-sdks` (four SDKs, including
   `10.0.201`) and `sqllocaldb info` (`MSSQLLocalDB`) are literal captures. The
   `10.0.201` in the tutorial is what `global.json` resolves to inside the reference
   solution.
4. **Every wire body and terminal line in the tutorial is machine-checked against a
   provenance source.** A checker extracts each such line and fails unless it appears
   verbatim in `s1-service-contracts.md`, `s1-walk-outline.md`, the reference
   solution's own files, or this session's capture log: **14/14 traceable.** It
   caught one fabrication in the first draft (a `Stored` transcript whose `fileName`
   had been edited to suit the prose) which was removed.
5. **`mkdir` at the root of `C:\` needs no elevation and creates intermediate
   folders** — probed in a **non-elevated** PowerShell on this machine, which is why
   the routed documentation review's Major on the drop-folder commands was dismissed
   as stated. See *Adjudications* below.

## Suite baseline (this tree)

| Suite | Result |
| --- | --- |
| Reference solution `dotnet test` (the answer key) | **74 passing** — 31 / 24 / 19, 0 failed, 0 skipped |
| `guidance_report --check` | see below |
| pytest (`ai_router`) | **This session adds no Python to the package**, so the count is inherited and not moved by this work |
| Extension unit / Layer 2 / Layer 3 | **Not run, and not armed.** This session changes no TypeScript, no Explorer-rendering surface, no state-file writer and no fixture. `requiresE2E: false`. |

**Layer 2 electron (`npm test`) remains a known-broken harness on this machine** —
`@vscode/test-electron` fails to launch on VS Code 1.128.0 (`bad option:
--no-sandbox`). **A finding that it was not run is a known residual, not a defect of
this session.**

## Adjudications already made — restating one is not a finding

Both routed reviews ran **off-provider (anthropic excluded)** before verification,
and their raw output is committed:

| Artifact | Outcome |
| --- | --- |
| `s2-duplication-review.json` | 1 Major + 3 Minor. **All four accepted and fixed.** |
| `s2-documentation-review.json` | 9 of 10 named rules pass; 1 Major. **Dismissed as stated, on evidence, with the residual fixed by removal.** |

**The accepted Major is worth knowing about**, because it is the class of defect this
set is most exposed to: the `touches:` passage originally cited the `app`/`greeter`
example, which lives in `adopt-dabbler.md` **Part 5 — the part Session 3 deletes.**
The reference would have dangled by the set's own end. It now makes the point
without citing deleted text. **Every remaining reference to `adopt-dabbler.md` is to
Parts 1, 2–3, 3 or 4, all of which survive S3's trim, and none uses a heading anchor**
— S3 also strips seven `*(scene N)*` markers, which would have broken any anchor.

**The dismissed Major** claimed the drop-folder `mkdir` commands would fail because
creating a folder at `C:\` requires administrator rights and because `mkdir` is not
recursive. **Both mechanisms were probed on this machine and both are false** (see
*Facts* 5). Its proposed fix would have put an unexpandable `~/Documents` path into
`appsettings.json`. The residual it gestured at — a locked-down managed workstation —
was fixed by **removal** per the simplicity-first convention: three `mkdir` lines
collapsed to two, plus one sentence saying any writable folder works.

## Known limits, disclosed on the artifact itself

**A finding that restates one of these is the document working, not a defect.** A
finding is material only if it shows a disclosure is *missing*, *insufficiently
prominent*, or *contradicted elsewhere*.

- **Nobody has walked this tutorial.** That is Session 4, and it is the whole reason
  S4 exists. The tutorial has been checked, not followed.
- **The macOS/Linux path is unwalked and is not offered as an equivalent.** The
  appendix's container route is described as what the answer key supports, explicitly
  *"not a substitute walk"*.
- **The cross-machine firewall step is unverified** and says so in the appendix.
- **A solo Part D proves the repoint mechanism, not conformance**, and says so.
- **The reader's code will not match the answer key.** Stated at the top and repeated
  where it bites (a `--project` path that depends on how their AI laid the project
  out).
