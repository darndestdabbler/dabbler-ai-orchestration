# Step 9 — guidance reorganization review (Set 124, final session)

Run at the close of the set's last session, after the notification. "No
changes recommended" is a valid outcome; skipping the review is not.

## 1. Preload ceiling: one breach, found and fixed

`guidance_report --check` failed on this session's own edit — `AGENTS.md`
came in **+28 tokens over** its 2,031 ceiling after the verify-type pointer
was rewritten.

Ceilings ratchet **down** only, so the fix was to remove prose, not to raise
the number:

- Demoted *"Set 123 S3 retired the setup webview; the extension contributes
  none"* — two sets old, and the canonical
  `docs/planning/verify-type-resolution.md` carries it.
- Compressed the `local-overrides.yaml` retirement from three lines to one
  clause, keeping the fact and dropping the restatement.

Result: `AGENTS.md` 2,018 / 2,031 (99%), total 11,885 / 12,000 (99%).

**Standing observation for the operator:** every preload file now sits at
99–100% of its ceiling. There is effectively **zero headroom**. The next
lesson that earns admission will require an explicit removal decision, and
that decision is the operator's.

## 2. Lesson candidate — admitted in substance, blocked on headroom

**Proposed rule.** *A claim a writer embeds in its own output is a promise
the writer must keep. Assert the written artifact, not the intent.*

This set hit the class **three times**:

| where | the embedded claim | the reality |
| :--- | :--- | :--- |
| S1 (en route) | header: *"Committed on purpose: it is project configuration, not machine state"* | the exact inverse of the operator's ruling, shipped into every file setup wrote |
| S3 (cold-start walk) | header: *"Gitignored on purpose"* | nothing gitignored it; `git check-ignore` exit 1 |
| S3 (verification round 1) | toast: *"…(gitignored)"* | the writer's fail-open warning was dropped on the floor |

Applying the Set 085 **admission test**: recent recurrence ✓ (three in one
set); high miss cost ✓ (a committable machine-local answer, and a bricked
config); weak automated detectability ✓ (a case-sensitive grep missed the
capitalised "Committed"); expressible in ≤150 tokens ✓. The one soft
criterion is *no executable-gate equivalent* — the fix shape here (a
falsifier that asserts the **written artifact**) is already `L-112-1`'s
shape, which is in the active tier.

**Recommendation:** fold it into `L-112-1` as one sentence rather than admit
a new lesson — *"a gate is not the only thing that can claim something: text
a writer embeds in its output makes a claim too, and it needs the same
planted-violation proof."* **Not applied here**, because
`lessons-learned.md` is at 2,384 / 2,385 tokens and adding prose at ceiling
requires removing prose, which is an operator-reviewed archival decision.

## 3. `L-069-1` — archived, cited, no action needed

`cite_lessons` flagged `L-069-1` as *"ARCHIVED — consider reactivating."* No
reactivation is warranted: it was **promoted** at Set 073 and its rule lives
in `project-guidance.md` → Conventions → Code Style (*"a bug is a bug
CLASS"*), which is preload. The pointer table in `lessons-learned.md`
already records this. Recorded here so a future run does not re-raise it.

It was, for the record, the single most instrumental piece of guidance in
this set — it is why the Python-side retirement in S2 was followed to its
TypeScript sibling writer in S3 at all.

## 4. Applied: one anti-pattern added to the authoring guide

The authoring guide is an **on-demand reference**, not preload, so it carries
no ceiling cost. Added under *Anti-patterns*:

> **An echo pass scoped to descriptions when a mechanism was retired.**

This set's spec scoped Session 3's extension work to operator-facing
*strings*. The strings were describing a write that Session 2 had turned
into a hard refusal — so the session that was planned as a wording pass was
actually sitting on a Critical defect. The generalizable rule is that a
"fix every echo" session following a retirement must enumerate the retired
mechanism's **writers**, across **every language in the repo**, not only its
descriptions.

## 5. Spec flags — both were right

`requiresUAT: false` and `requiresE2E: false` held up. Session 3 edited
extension source, so `L-064-12` applied and the full Playwright suite ran at
close (31 passed) — declared in the session, as the spec's own comment
anticipated. No new rendering surface appeared that would have owed an
operator walk. No flag change recommended.

## 6. Deferred / owed

- **Irony budget overrun, disclosed:** 18 declared, 21 shipped. Entirely
  Session 3's two unplanned defects. Flagged rather than trimmed — dropping
  a falsifier to hit a budget is the wrong trade.
- **Checklist posts:** three verification-round transitions left a record
  with no post before the next transition. The gate is advisory and warned at
  close. **No waiver is claimed**, because an operator attestation is not the
  orchestrator's to author. Disclosed in `disposition.json` instead.
- **Playwright flakiness under load:** two specs (`icon-render-mechanism`,
  `session-plan-reveal`) timed out at 4 workers on a contended box and passed
  in isolation; the green run of record was taken at `--workers=2`. Not
  investigated — unrelated to this set's surfaces, but worth a look if it
  recurs.
