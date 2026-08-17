# Session 3 — remediation, round 1

**Round 1 (discovery, `gpt-5.5`, fan-out 2) returned 2 blocking Majors. Both
are the same defect, found independently by both lenses. Both accepted without
argument.**

Round 2 (supplementary completeness critic, `gpt-5.5`) returned VERIFIED with
no new findings, so the merged blocker set is exactly the one below.

---

## F1 / F2 — a temporary Python helper left in the repo root

- **Call 1, lens `spec-conformance`:** *"A temporary Python helper is left in
  the repository root, contradicting the session's 'no new module / no product
  code' contract and excluding 16 added lines from the reported net."*
- **Call 2, lens `failure-scenario`:** *"Close-out commonly stages the working
  tree; because `.tmp_s3_log.py` is already present at repo root and visible in
  status, it is likely to either be committed accidentally or block a clean
  close."*

### Verdict: accepted, both

The finding is correct on every point it makes.

`.tmp_s3_log.py` was a 16-line scratch wrapper around
`ai_router.session_log.SessionLog.log_step`, written because `session_log` has
no CLI. It was always intended to be deleted before close — five sibling
scratch files (`.tmp_s3_footprint.py`, `.tmp_s3_net.py`, `.tmp_s3_candidates.py`,
`.tmp_s3_assignment.py`, and two `.tmp_decision*.json`) had already been removed
earlier in the session. This one survived because it was still in use for the
remaining step-log writes, which is an explanation and not a defence: the
verifier reads the tree as it stands, and as it stood the tree contained an
unplanned Python file at the repo root in a session whose governing rule is
**no new module**.

The second lens is right that the real hazard is at close, not now — a
`git add -A` would have committed it, and the session's own conventions block
asserts *"No Python module was added, changed, or deleted."* That claim would
have been false in the committed artifact.

### Fix

**Removal, not accommodation** (`project-guidance.md` G-005 — prefer removal
over addition). `.tmp_s3_log.py` is deleted. The remaining step-log writes for
steps 5-7 are made with an inline `python -c` invocation of the same sanctioned
writer, which leaves no file behind. No new file was created to replace it, and
no `.gitignore` entry was added — ignoring the artifact would have hidden the
defect rather than fixed it.

`git status --short` after the fix shows no untracked file outside this session
set's own documented deliverables.

### Acceptance

| finding | criterion | pre-fix | post-fix |
| :--- | :--- | :--- | :--- |
| F1 | `python -c "raise SystemExit(__import__('pathlib').Path('.tmp_s3_log.py').exists())"`, expect exit 0 | exit 1 (file present) | exit 0 |
| F2 | judgment: repo root no longer contains `.tmp_s3_log.py` and the Session 3 delta contains no new Python helper outside the documented deliverables | fails | passes |

### The lesson worth recording

The session's own conventions block asserted a scope claim — *"no product code,
no Python module added"* — that the working tree contradicted **at the moment
the claim was written**. Nothing checked the two against each other; a
cross-provider reader did, immediately, from both lenses independently.

A scope claim in a conventions block is an assertion about the tree, and it is
cheap to verify with `git status --short` before routing. This is the same
shape as L-064-8 (a doc inheriting claims it did not re-verify), one surface
over: **the claim was true of the intended diff and false of the actual one.**

---

## What was NOT changed

No other finding was raised, and none of the by-design exclusions listed in
`s3-conventions.md` was challenged by either lens — including the two most
likely to draw fire: ratcheting the ceilings to zero headroom, and shipping the
artifact caps as conventions with no enforcing validator.
