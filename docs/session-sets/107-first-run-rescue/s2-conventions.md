# S2 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects instead of burning
findings, and re-verify rounds, on an agreed baseline.

## What this session is

Set 107 Session 2 of 3. Session 1 shipped `Dabbler: Try a sample project` plus
the canonical sample bundle. **This session is documentation**: it authors a new
15-minute `docs/tutorials/hello-world.md`, relocates the previous 448-line
tutorial to `docs/tutorials/adopt-dabbler.md` with its nine video scripts,
repairs every inbound link, and ships a gate so the two cannot drift apart.

Session 3 — **not this one** — runs the timed acceptance walk on a clean VS Code
profile with a released VSIX. **No finding here should be phrased as "this was
not measured"**; measuring it is S3's entire job and this session cannot do it.

## Suite baseline (this tree)

| Suite | Result |
| --- | --- |
| pytest (`ai_router`) | **3149 passed / 6 skipped** (651s), final tree. Was 3066/6 at S1 close; the delta is exactly the **83 new tests** in `test_tutorial_gate.py`. Zero failures, zero tracked failures. (The gate started at 34 tests; rounds 1, 4 and 5 each found escapes past it, and every one of those escapes now has a test. The count is a record of what has been attempted against the gate, not a claim about the whole space.) |
| Extension unit (vscode-stub mocha) | **1821 passing** |
| `npx tsc --noEmit` | clean, exit 0 |
| `drift_guard.py` | OK, exit 0 |
| `tutorial_gate.py` (new this session) | OK, exit 0 |
| Layer 3 (Playwright) | **NOT run locally.** Known-broken harness on this machine — all 28 specs fail identically inside `_electron.launch` before any window opens, on all four cached VS Code builds. Recorded as an environment residual in S1's disposition. CI's `playwright-tests` job is the authoritative signal. This session changed markdown, two templates, their regenerated fixtures, and added a stdlib Python gate — nothing that can move a pixel in the webview. **A finding that Layer 3 was not run locally is not a defect of this session.** |

## Release contract

- **Extension 0.47.0 is staged and UNPUBLISHED** (no tag, no publish run). This
  session's two template edits fold into that staged version rather than
  bumping again — a bump would be wrong, because 0.47.0 has never shipped.
- **`dabbler-ai-router` publishing stays operator-gated.** `[Unreleased]` still
  carries S1's `close_session` EOF fix. This session adds no router API surface:
  `tutorial_gate.py` lives in `ai_router/scripts/`, which has no `__init__.py`
  and is excluded from the wheel, exactly like `drift_guard.py`.
- Publishing anything is human-only. **A finding that this session did not
  publish is out of scope**, by the constitution's irreversible-actions rule.

## By-design exclusions — please do not re-report these

1. **`adopt-dabbler.md` is relocated, not rewritten.** The spec says "unchanged
   in substance". Only its framing header changed (title, a "Start here? No"
   pointer to the new first run, the video-directory link, and one labelled note
   that it currently also carries the team workflow). **Findings about the body
   of that document's teaching are out of scope for this session** — they were
   in scope for Set 106, which shipped it after twelve verification rounds.
2. **The new `hello-world.md` is deliberately defined by what is ABSENT.** It
   must contain no git command, no YAML, no host configuration, no branch or
   pull-request or CI or worktree or teammate content, and no governance
   settings, with exactly one sanctioned exception: the closing sentence naming
   Full-tier cross-provider verification. A finding that it "should also
   explain X" is almost certainly a request to re-break the document — the
   whole set exists because the previous tutorial explained too much, and staff
   abandoned it. `ai_router/scripts/tutorial_gate.py` check 6 machine-enforces
   this. **Corrected after round 1**, which rightly found the first version of
   that check enforcing far less than this file claimed for it. The gate is now
   falsified by **83** tests (was 34). Rounds 1, 4, 5 and 6 each found a way
   past a version that had just been called complete, and every one of those
   escapes now has a test — `git diff` and `git --version`, untagged then
   commented then block-scalar YAML, a duplicated argument and a symmetric
   typo. The command class is now pinned to `bundle.json`'s own
   `testCommandArgs` / `programEntryPoint` rather than to a list of wrong
   shapes. Details in `s2-remediation-round-3.md`, `-5.md`, `-6.md`, `-7.md`.
3. **Two Minors are already recorded and adjudicated** in
   `s2-duplicate-procedure-adjudication.md`: the starter-line mechanic appearing
   in both tutorials (judged different work, with the residual named), and the
   concept-ownership table assigning "custom hosts" to a document that has none
   (a genuine defect **in the spec's table**, escalated to Step 9 — this session
   may not edit the spec's configuration at runtime). Re-raising either at the
   same severity is a settled point; raise it only with a *new* argument.
4. **Two deliberate scope corrections**, both recorded in `ai-assignment.md`:
   - The spec's step 5 said the shipped `getting-started.md.template` link
     "needs no change". That confirmation **failed** — both shipped templates
     describe the *adoption* content by name, so a resolving link is not the
     test. Both were repointed, `dist/` rebuilt, and the two cold-start goldens
     regenerated with `UPDATE_GOLDEN=1`.
   - The spec's step 7 said "extend Set 106's committed literal gate". That
     gate (`docs/session-sets/106-.../s3-check-literals.py`) is referenced by no
     CI job, no pytest test and no npm script — it was an artifact, not a gate.
     A **successor** was authored at repo level instead
     (`ai_router/scripts/tutorial_gate.py` + `ai_router/tests/test_tutorial_gate.py`
     + a CI step). The 106 script is left working and uninvalidated.

## Severity rubric — grade by CONSEQUENCE (L-095-1)

Carry this into every round until it ships in the verification template.

Severity = probability the stated failure scenario materialises for a real
reader × impact on the deliverable's objectives. **Low probability OR low impact
is Minor even when technically correct. No plausible failure scenario ⇒ Minor by
definition.**

- **Critical** — a reader is actively misled, or cannot complete the first run.
- **Major** — a literal that does not match the product (a command that does not
  exist, output that differs from reality), a broken inbound link, or a genuine
  second explanation of a concept the ownership table assigns elsewhere.
- **Minor** — wording, polish, or a technically-true observation with no
  plausible reader-facing consequence.

Set 095 spent 17 rounds and 39 "fresh Majors" on an ungraded loop over an
unbounded artifact surface and never converged; the first rubric-graded round
returned VERIFIED. A tutorial is exactly that kind of unbounded surface. Please
grade before reporting.

## Where to look first

The highest-value question is **literal fidelity**: does every command, path,
message and output in `docs/tutorials/hello-world.md` match what the product
actually does? Ground truth is `docs/templates/sample-project/bundle.json`, the
string constants in
`tools/dabbler-ai-orchestration/src/utils/sampleProject.ts`, and the contributed
command titles in `tools/dabbler-ai-orchestration/package.json`. A real
observed walk of the sample — on the **PyPI-published** router 0.34.0, not this
repo's editable install — is recorded in `s2-desk-check.md`, including what it
deliberately does not establish.
