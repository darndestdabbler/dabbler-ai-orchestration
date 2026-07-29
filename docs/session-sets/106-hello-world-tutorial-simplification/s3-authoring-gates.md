# S3 — Authoring gates (executed, not asserted)

> **Why this artifact exists.** This session's two deliverables are nine OBS
> scene scripts and a UAT checklist, and both are *transcriptions* — of the
> tutorial, and of strings the extension actually contributes. The failure mode
> is not bad prose; it is a scene script that tells the operator to run a
> command that does not exist, or a checklist that quotes a label the product
> stopped using. That is the **L-064-8** class one layer down (a successor doc
> inherits the source's claims at its peril), and the cost is paid in operator
> minutes on camera rather than in a re-verify round.
>
> The routed step-3.5 analyst's control for this was *"a full, literal desk
> check … against a clean developer environment"*. That was **declined with
> reasons** (see `ai-assignment.md` → Session 3): a clean-environment desk check
> of these scripts **is** the ~2-hour S4 walk, on operator-supplied resources
> this session does not have. What is adopted instead is mechanical, runs in
> under a second, and is committed so any later session can re-run it.
>
> **Both gates were run on the committed tree. Both exit 0.**

---

## The two gates

| Gate | Script | Result |
| --- | --- | --- |
| Literal fidelity | [`s3-check-literals.py`](s3-check-literals.py) | **98/98 PASS**, exit 0 |
| UAT checklist floor | [`s3-check-checklist.py`](s3-check-checklist.py) | **345/345 PASS**, exit 0 |

Both resolve the repo root from their own location, so they run from anywhere.

```text
$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-literals.py
[A] 10/10 PASS
[B] 53/53 PASS
[C] 35/35 PASS

TOTAL: 98/98 PASS

$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-checklist.py
[D] 255/255 PASS
[E] 26/26 PASS
[F] 64/64 PASS

TOTAL: 345/345 PASS
```

---

## Gate 1 — literal fidelity (`s3-check-literals.py`)

### Check A — every `Dabbler: <Title>` resolves to a real command (10/10)

Every `Dabbler: …` string anywhere under `docs/tutorials/` is matched against
the **`category` + `title`** of the extension's `contributes.commands` in
`tools/dabbler-ai-orchestration/package.json`. A title the extension does not
contribute fails the gate.

The ten distinct titles the teaching surface names, all resolving:

| Title in the docs | Command id |
| --- | --- |
| `Dabbler: New Module` | `dabbler.newModule` |
| `Dabbler: Delete Module` | `dabbler.deleteModule` |
| `Dabbler: Rename Module` | `dabbler.renameModule` |
| `Dabbler: Open PR for this set` | `dabbler.openPrForSet` |
| `Dabbler: Finalize merged set` | `dabbler.finalizeMergedSet` |
| `Dabbler: Install ai-router` | `dabblerSessionSets.installAiRouter` |
| `Dabbler: Set Up Copilot Seat` | `dabblerSessionSets.setUpCopilotSeat` |
| `Dabbler: Cut release tag` | `dabbler.cutReleaseTag` |
| `Dabbler: Start hotfix from tag` | `dabbler.startHotfixFromTag` |
| `Dabbler: Roll back to tag` | `dabbler.rollBackToTag` |

### Check B — shared literals are identical (53/53)

Forty-four strings that appear in **both** `hello-world.md` and a scene script
must be the same string in both: shell commands, the Copilot smoke test, input-box
titles (`New module (1/2): slug`), form labels (`Provider access (how routed calls
run)`), GitHub setting names (`Require status checks to pass before merging`),
CODEOWNERS rule lines, commit messages, expected output (`Hello, world! It is
14:32.`), and the solo cutoff sentence.

Comparison runs on a **whitespace-normalised** copy of each file. Markdown
reflows prose across lines and a blockquote prefixes continuations with `> `;
neither is a content difference. **The YAML comparison below deliberately does
not normalise** — there, whitespace *is* the content.

Nine further checks pin the CI workflow specifically:

- The `jobs:` block is **byte-identical** in `hello-world.md` and
  `scene-4-first-module.md` once the tutorial's list indentation is removed.
- `jobs:\n  test:`, `- uses: actions/checkout@v4`, and
  `- name: Build and test every module` appear in **both** the scaffolded
  `monorepo-ci.yml.template` and the tutorial's target YAML — so the tutorial's
  "add two steps, replace one `run:` block" really is add-only.
- The template already carries `pull_request`, and carries **no**
  `if: github.event_name` gate — so the tutorial's claim that the job "already
  runs on pull requests" is true of the shipped file.

Those last two exist because they are exactly the S2-queued residuals this
session fixed; the gate now stops them re-opening.

### Check C — every relative link resolves (35/35)

Every relative markdown link under `docs/tutorials/` is resolved against the
filesystem, anchors stripped. Covers the tutorial's `video/` pointer, the
release-and-recovery link, and all cross-references between the nine scripts.

---

## Gate 2 — the UAT checklist floor (`s3-check-checklist.py`)

### Check D — schema shape (255/255)

Top-level keys and `Configuration.reviewWidths` match the shipped exemplars
(Sets 078 and 103). Every one of the 13 items carries all eight required fields,
`Passes` is a boolean, `Result`/`Feedback` are empty (they are filled *during*
the S4 walk), and no item carries an unrecognised field.

### Check E — the ad-hoc floor (26/26)

`docs/ai-led-session-workflow.md` → *UAT Checklist Rule — Ad-hoc* requires that
**before the human is notified**, every non-judgment functional item declares
either `ProgrammaticVerification` or `NoProgrammaticPathReason`, and that the
justification be specific rather than "no test possible".

All 13 items are non-judgment. **Ten declare `ProgrammaticVerification`** (walks
1, 3–11); **three declare `NoProgrammaticPathReason`** (walks 2, 12, 13), and
each reason is load-bearing rather than convenient:

- **Walk 2 (create and clone a live GitHub repo)** — entirely host-side and
  operator-only. The tutorial deliberately teaches the stock GitHub UI and VS
  Code's built-in `Git: Clone` rather than anything Dabbler ships, so there is no
  code path to test. The remote-URL *forms* it produces are covered by
  `gitHost.test.ts`.
- **Walk 12 (direct-API take)** — executing it means re-scaffolding the walked
  repository onto `transport.profile: api`, destroying the walk, and spending
  real metered budget to re-prove a path Set 078 already validated. Deliberately
  read-only; only its key-presence probe is executed.
- **Walk 13 (whole-script attestation)** — "can a human follow this while
  recording" is the definition of a judgment with no programmatic path. It is
  also the reason this set declares `requiresUAT: true`.

The gate additionally requires ≥12 words of justification, so a one-word
dismissal cannot pass.

### Check F — the Set 078 authoring bar (64/64)

- Every item opens with a **`Where you are:`** preamble and continues into a
  **numbered** step list.
- Every `Expectation` is a literal result of ≥25 words, not a gesture.
- `Notes` carries the **checklist-level order map** naming Walk *N* → Part *M*
  for all six tutorial parts, states the checklist is **authored-not-yet-walked**,
  and names the operator preconditions together with the **stop-rather-than-run-
  degraded** rule.
- **Exactly two** walks are out of tutorial order, and each is flagged
  `INTENTIONALLY` in *both* its `Subarea` and its `HumanAction` — the gate fails
  if a third appears unflagged, or if a flagged one drops the explanation.
- Twelve tutorial literals quoted in the checklist are re-checked against
  `hello-world.md` on the JSON-escaped form.

---

## What these gates do **not** establish — named, not glossed

1. **That the instructions are followable.** Both gates check that a string is
   *correct*; neither can tell you it is *usable*. A step that assumes something
   an earlier step never established passes every check here. That is Walk 13,
   and it is why this set is `requiresUAT: true`.
2. **That the AI sessions produce good output.** The tutorial hands a real AI
   session one Scope paragraph and expects a usable plan. Nothing local proves
   that; Walk 4 is the first time anyone finds out.
3. **That the adapted CI workflow runs on a GitHub runner.** Session 2 proved
   the *scaffolded* file is green on an empty repo, and this gate proves the
   tutorial's target is reachable from it by adding steps. Neither executes the
   result on Actions — Walk 6 is its first ever run.
4. **That the durations in `video/README.md` are right.** They are estimates
   from the tutorial's own shape. Walks 4, 5 and 8 measure the real numbers, and
   Walk 13(a) reports them.
5. **That Azure DevOps has not renamed a settings page.** Walk 11 is a live spot
   check for exactly that; no test can cover somebody else's UI.

---

*Gates run 2026-07-28 on the committed tree, Set 106 Session 3.*
