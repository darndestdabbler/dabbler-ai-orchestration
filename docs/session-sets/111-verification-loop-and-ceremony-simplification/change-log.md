# Set 111 — Verification Loop & Ceremony Simplification

## What this set was for

Verification had grown **5.5×** (13 → 72 min median per session) while work
only doubled; the round bounds were printed but not enforced and were
exceeded in practice; UAT was dreaded and routinely bypassed; and the
operator was being asked to adjudicate decisions the AI held more context
on. The standing rule the whole set serves is **adoption dominates rigour**
— cut the ceremony (artifacts, checklists, rounds a human must drive), keep
the machinery (a routed call costs the developer nothing).

Set 110's `operator-notes.md` piloted every policy here in prose. This set
turned them into code and canonical docs.

## What shipped

### Session 1 — the bounds are real

`verify_session` now **refuses** a third discovery pass or a third
remediation-review cycle without an explicit
`--operator-authorized-round "<reason>"`. The K=2 discovery fan-out sends
two *differently framed* prompts (spec-conformance lens vs. failure-scenario
lens) at the same cost and position. A Minor-only round routes to close
rather than to another round.

### Session 2 — acceptance criteria with baseline discrimination

A finding auto-closes only when its **unchanged** criterion fails against
the pre-fix tree and passes against the fixed one, executed in disposable
worktrees. Criteria that pass pre-fix stay judgment-based. One holistic
`remediation-review` is retained as the final delta look.

### Session 3 — decision rights, journaled

Decisions route by **whose authority they need**, not by how much judgment
they take. Four classes stay human: external or hard-to-reverse
consequences, underivable value trade-offs, accountability sign-offs, and —
the hard carve-out — anything that reduces verification. Everything else
judgment-shaped is AI-decidable under six ordered tiebreaks.
`ai_router.decision_journal` is the blessed writer for a per-set
`decisions.jsonl`; it **refuses** to write a verification-reducing record
under AI authority. Education-mode briefs became the required format for
every operator stop.

### Session 4 — the ceremony pass

- **Session-size cap, measured not asserted** (`ai_router.spec_admission`).
  Across the 172 schema-v4 sessions carrying both a parseable spec plan and
  timestamps, crossing from 5 declared steps to 6 doubles the median session
  (42 → 84 min), triples the p90 (110 → 386 min), and nearly triples the
  share running past two hours (10% → 28%). Cap: 5. Stated limit: step count
  predicts the median, **not the tail** — the longest sessions on record
  (591/562/544/509 min) all declared 5–8 steps.
- **The test-run policy, made executable** (`ai_router.run_of_record` + the
  `test_run_fresh` close gate). Freshness is a content digest over the
  surfaces a suite covers, not an mtime.
- **UAT can no longer evaporate** (`disposition.uat` + the
  `uat_walk_recorded` close gate). A `requiresUAT` session closes with a
  recorded walk or an attested waiver — there is deliberately no third value.
- **The walk stages itself** (`npm run walk`). Six operator steps of staging
  ceremony collapse to zero.
- **CI actions SHA-pinned** — all 31 references, plus a `drift_guard` check
  and a Dependabot bump path.
- **Step-level progress checklists** (`ai_router.session_checklist`),
  operator-directed during S4.

## Decisions the operator made

Recorded in `decisions.jsonl` (16 records; 4 under operator authority).
Presented as one batched education-mode brief in `s4-uat-walk.md`:

| | question | outcome |
| :--- | :--- | :--- |
| D1 | Retire `sN-conventions.md` / `ai-assignment.md`? | **Retire nothing.** |
| D2 | Must a guidance promotion name what it displaces? | **No rule change.** |
| D3 | Bound the unbounded close backstop? | **Unchanged.** |

The orchestrator recommended retiring `sN-conventions.md` (nothing reads it)
and narrowing the backstop. The operator holds scope and declined; that is
the answer, recorded rather than argued.

## Two spec premises found already discharged

Reported rather than executed, because doing the stated work would have been
wrong:

- **`project-guidance.md` was said to be +369 tokens over its ceiling.** It
  is at exactly **3,499 / 3,499**. Commit `d3e00680` had already corrected
  it and recorded the +369 as a measurement artifact (a CRLF-inflating
  pipe). A pruning sweep would have cut real guidance to hit a target
  already met.
- **`require-green-test` was to be re-decided as a hard release gate.** Set
  110 S4 had already built exactly the shape the spec predicted:
  infrastructure failures are classified separately from test failures, with
  a per-commit operator override that requires a recorded reason and never
  tolerates a genuine test failure.

## The remediation that made Session 4 true

Verification found that the ceremony pass had shipped its centrepiece
**broken**, and the way it was broken is the most useful thing in this
set's record.

`npm run walk` could never have worked. The reveal lived inside the
product extension's `activate()`, gated on an env var — but that extension
declares no explicit activation events and contributes views, so VS Code
activates it when the Dabbler view becomes **visible**. The code that was
supposed to open the view was waiting on the view being open. It shipped
green because its only tests were source-text greps asserting the string
`process.env.DABBLER_WALK === "1"` appeared in a file: a test that a line
of code exists, not that it does anything.

Eight blocking findings across two discovery passes; seven distinct
defects; six fixed, one rejected on evidence.

- **The walk now starts itself, provably.** The startup activation moved
  to a development-only companion extension (`scripts/walk-companion/`,
  `onStartupFinished`), loaded by the stager as a second
  `--extensionDevelopmentPath`. The product extension keeps its Set 110
  activation profile and carries no walk-specific code at all.
  `npm run walk:smoke` launches the real stager and fails unless a marker
  written *after* the reveal command resolves says `revealed`.
- **`scripts/vscode-launch.js` became the single definition it claimed to
  be.** Created to remove duplication, it had instead re-typed binary
  discovery from an older copy of the Playwright harness and dropped what
  that harness had since learned: the macOS `.app`-bundle search (so
  `npm run walk` was broken on every Mac) and the Electron env allowlist
  (so a walk started from VS Code's own terminal could parse args instead
  of opening a window). `electronLaunch.ts` now requires and re-exports it.
- **`session_touched` was red on CI and green here.** It normalised with
  `os.sep`, a no-op on posix, so a Windows-authored `files_changed` entry
  matched nothing on the required ubuntu/macOS matrix — invisible from the
  developer machine by construction, the same shape as the `drift-guards`
  job this set's own CI section describes.
- **The UAT gate had a hole shaped like its purpose.** An omitted
  `uatScope` collapsed to `"none"` and disarmed the gate, so
  `requiresUAT: true` with no scope — the likeliest hand-authored shape —
  was exactly the spec that could close with no walk. Scope now chooses
  *which* sessions owe a walk and never cancels the requirement.
- **The Layer 3 freshness map named two of the policy's four trigger
  surfaces.** It now also covers the blessed state-file writers and the
  fixture/walk harness — and that fix immediately bound on this session.
- **One finding rejected on evidence.** The pypa publish action was
  reported as pinned to a moving branch head; `v1.14.2` is an annotated
  tag that dereferences to exactly the pinned commit. All six workflow
  pins were verified against their tags. No workflow change was warranted.

Round 4 returned VERIFIED with seven fix verdicts accepted and no nits.

## The UAT walk was waived, visibly

Session 4's own walk was **not performed**. The operator's reason is the
deliverable rather than the schedule: the guided-look format — a document
of Look items driven from a terminal — is the format they have found
unusable, and walking it would have rendered judgment on something already
superseded by decision. The waiver and its full reasoning are on the
record in `disposition.uat`, which is precisely what this session's gate
exists to force: skipping is now a recorded decision, not an evaporation.

The half of the problem this session *could* fix, it fixed and proved:
staging costs the operator nothing. The other half — comprehension —
became **Set 113**, authored here on operator instruction and sequenced
after Set 112: narrated video walkthroughs with a "repeat it yourself"
manual walkthrough rendered from the same source. Its feasibility is
measured, not assumed: Playwright's built-in `recordVideo` **breaks** the
automation it would record (the workbench window never attaches, no file
is written), while the identical launch without it drives the real UI
fine. Set 113 therefore starts from OS-level capture, and will not spend a
session rediscovering that.

## Honest residuals

- **The preload corpus has zero headroom.** `project-guidance.md` sits at
  100% of its ceiling and the operator declined the displacement rule, so
  the next promotion hits the wall and must be resolved then.
- **The close backstop is still unbounded** and still never runs in CI, so
  its cost lands on the operator machine at close time, unmeasurable on the
  `copilot-cli` seat. Retained by explicit operator choice.
- **The Work Explorer half of the progress surface is not built.** An
  in-flight session node could expand to show its logged steps. That touches
  the rendering surface and belongs to a session that owes a full Layer 3.
- **Every session of this set exceeds the cap this set shipped** — S1–S3 at
  6 steps, S4 at 11. The check was written against its own author and says
  so.
- **A carve-out-triggered escalation that results in NO reduction cannot
  name the carve-out as its rubric line.** D3 reached the operator because
  of the verification-reduction carve-out, but the decision reached was "no
  change", and `decision_journal`'s coherence rule requires
  `rubric_line="verification-reduction"` to pair with
  `verification_effect="reduces"`. Recorded as `escalate-to-human`. The
  refusal is the S3 rule working as designed; the vocabulary gap is real and
  worth a future look.
- **The Layer 2 mocha suite is red on this machine, and was before this
  session.** A clean-tree baseline measured 1,866 passing / **32 failing**;
  after this session's changes, 1,876 passing / 32 failing — ten new tests,
  the same pre-existing failures. Two environmental classes: VS Code 1.132
  made `workspace.workspaceFolders` getter-only, breaking the suite's stubs,
  and `watcherInventory` resolves `src` relative to the Electron host's cwd.
  Neither is caused by this diff. Repairing a VS Code-version break is its
  own work, not something to smuggle into a remediation round — but it does
  mean Layer 2 has not been a real gate for some time, and nobody noticed.
- **Nothing catches a SHA/comment mismatch on a pinned action.** The
  `actions-sha-pinned` drift guard verifies pins are 40-char SHAs, not that
  the trailing `# vX.Y.Z` names the tag they resolve to. Closing that needs
  a network lookup, which is the wrong dependency for an offline guard that
  gates every commit. All six pins were verified correct by hand this
  session; the *check* is still owed.
- **L-069-1 is archived and keeps being the answer.** `cite_lessons`
  flagged it for reactivation, and this session is the evidence: its
  central defect — a module created to remove duplication silently
  reintroducing it, worse — is exactly that lesson. Reactivating it is a
  guidance-tier change, and `lessons-learned.md` sits at 91% of its
  ceiling, so it belongs to a session that can verify the edit rather than
  to a close gate.
- **The advisory path-aware critique did not run.** The set declares
  `pathAwareCritique: advisory`, and `close_session` warned (non-blocking)
  that no `path-aware-critique.json` exists. `pull_critique` needs **direct
  provider API keys** (`DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`),
  and this set was orchestrated from the Copilot-CLI seat, which carries
  none by design. So an advisory gate is silently unavailable on one of the
  two supported transports — the same class of gap this session fixed
  elsewhere (a check that cannot run is not a check). Owed: either a
  seat-transport path for the pull verifier, or an explicit "unavailable on
  this transport" record rather than a warning that reads like an omission.
- **`cite_lessons` and the freshness gate contradict each other**, and this
  session hit it at close. The constitution says to run `cite_lessons` "in
  the final commit" — i.e. *after* verification — but the marker it writes
  lands in `lessons-learned.md`, which binds the work diff, so a
  one-character `last-used-set="110"` → `"111"` edit invalidated a VERIFIED
  round's evidence stamp and demanded a fresh metered round for pure
  bookkeeping. The framework already solved this exact shape for
  `decisions.jsonl` (freshness-exempt because a record *about* work is not
  the work), and the same reasoning applies to a machine-stamped citation
  marker. It was deliberately **not** fixed here: changing what the
  freshness check can see, at close, to make one's own close easier is a
  self-authorized reduction in verifier visibility — the one thing the
  decision-rights carve-out forbids. `disposition.lessons_cited` carries
  the durable citation either way; the markdown marker was reverted and
  re-applied in a follow-up commit.

## Release

Router changes are staged under `[Unreleased]` in `ai_router/CHANGELOG.md`.
**Publishing and release tagging remain operator-gated.**
