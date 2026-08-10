# UAT improvement — source notes for the future session set

> **Status:** pre-authoring notes, captured 2026-07-04 when the operator
> suspended the Set 077 UAT. Input for the UAT-improvement session set that
> follows Set 078 (see the sequencing in the Set 077 activity log, session 6).
> The governing principle now lives in
> [`project-guidance.md`](project-guidance.md) → "UAT is written for a
> stranger and pre-verified by automation".
>
> **This file has a second half (added 2026-08-10):**
> [Deferred UAT — owed judgments, by set](#deferred-uat--owed-judgments-by-set)
> is a live register of walks deferred until Set 113 lands. Sessions that
> waive a walk under that deferral add their owed judgments there.

## What went wrong in the Set 077 UAT (operator report)

- Steps required guessing what was being asked, even after a
  name-the-exact-buttons clarification pass and a pre-baked starter kit.
- When an expected element did not appear, the operator could not tell
  whether the product was broken or the instruction was misread — the
  walk could not produce a trustworthy attestation either way.
- Instructions were written as if the human shared the orchestrator's
  context ("sharing a portion of the same brain"); reading level too high.
- Net effect: UAT was costly, tedious, and trust-undermining. The operator
  suspended it rather than finish.

## Direction to evaluate

1. **UAT DSL** — operator prototype at `D:\Projects\dabbler-uat-dsl`:
   a DSL for expressing human-action steps such that they compile to
   Playwright tests. Known imperfect; evaluate honestly against
   alternatives rather than adopting by default.
2. **Hard gate:** any part of a UAT walk that Playwright *can* execute must
   pass as a Playwright test *before* the checklist is offered to a human.
   The human should only ever walk the residue automation cannot verify
   (visual judgment, feel, cross-app flows).
3. A second AI engine following the instructions cold is a cheap
   followability test for the residue steps (the "can a stranger execute
   this?" check), worth considering as a pre-UAT gate too.

## Constraints from the same conversation

- **Simplicity-first:** the fix for UAT must not be another layer of
  complexity. Prefer removing/shrinking the human walk over adding
  tooling; if tooling is added (DSL compiler etc.), it must earn its
  complexity by deleting human steps.
- Extension E2E surface is the Layer 3 Playwright rendering harness —
  the natural place a compiled walk would run.

## Deferred work this set must eventually unblock

- Revisit and complete the Set 077 UAT under the improved experience.
- Run Set 078 UAT the same way.
- Complete the suspended 077 release: VSCE_PAT renewal, tag pushes
  `v0.27.0` + `vsix-v0.34.0`, Marketplace publish (0.34.0 VSIX is
  sideloadable meanwhile).

---

# Deferred UAT — owed judgments, by set

> **Status:** a live register, opened 2026-08-10 at the Set 114 S3
> operator stop. **Sequencing rule from the same conversation:** nothing
> here is walked until **Set 113** (narrated video walkthroughs) has
> landed. The operator expects 113 to take some time and wants Sets 114
> and 115 to ship before it, so the walks are deferred rather than
> skipped — the difference is this list.
>
> **Operator, 2026-08-10:** *"Right now, UAT is a broken, arduous
> process, which we shouldn't depend upon until Set 113 is finished.
> That said, I am going to authorize skipping UAT in this session. Please
> make a durable note of any features that you believe require UAT input.
> Later, I may create a remediation UAT set to address these things — but
> only after set 113 is done."*
>
> **How to use this register.** Each entry names a judgment that
> automation genuinely cannot settle, states what would decide it, and
> names the cheap remedy if the answer is "no". A future remediation UAT
> set should be authorable from this list alone. Add to it whenever a
> `requiresUAT` session waives its walk under the same deferral; do not
> delete an entry when it is walked — mark it walked, with the verdict.

## Set 114 S3 — the Work Explorer's step rows (waived 2026-08-10)

Automation already covers what it can: the row CONTENT is proven
row-for-row against the Python checklist by a cross-language corpus, the
tree-shape contract by 12 Layer 2 tests, and the painted result by three
Layer 3 scenarios in a real extension host. What is left is exactly the
residue the governing principle says a human should walk — visual
judgment and feel.

1. **Is a fifth level legible at the panel width you actually work at?**
   The tree is now module → status bucket → session set → session →
   step. Each level costs indentation, and Set 110 S1 measured that four
   inline actions erased the module label at minimum width. A step label
   is the deepest text in the tree. *Would decide it:* open the Explorer
   at your normal width with a real in-flight session expanded. *Cheap
   remedy if bad:* the step label is the humanized `stepKey`, which is
   already the shortest available string; the next lever is dropping the
   session level's `in flight` description to buy back room.

2. **Are the seeded step labels readable prose?** This is the entry I am
   least comfortable leaving to my own taste. Labels are derived from the
   spec's sentence by `plan_step_key` — first clause, punctuation
   stripped, six words max. This session's own plan produced
   **"Work explorer expansion an in flight"** for the step whose spec
   text is *"**Work Explorer expansion:** an in-flight session node
   expands to show its steps…"*. In a terminal table that reads as a
   handle; as the primary text of a tree row it reads as a typo.
   *Would decide it:* look at any set seeded after Set 114 S2.
   *Cheap remedy if bad:* stop at the first punctuation mark rather than
   at six words, or prefer the spec's **bold lead** when one exists (the
   authoring guide already asks authors to write one).

3. **Does `<- here` work as a tree marker?** It is the CLI's own
   vocabulary, carried over deliberately so the panel and the terminal
   name the same signal the same way. But in a tree it renders as dimmed
   `TreeItem.description` text, which may be too quiet to find at a
   glance — or, being ASCII arrow art, too loud. *Would decide it:* find
   the current step without reading every row. *Cheap remedy if bad:* a
   distinct icon on that one row, or bolding via a different carrier.

4. **Should a COMPLETED session expand to its steps too?** Journaled as
   an AI decision with `uat_decide: true` (`decisions.jsonl`, session 3).
   I chose in-flight-only: it matches the spec sentence, keeps the
   surface answering "where is this session *right now*", and keeps the
   scan cost off the 45 sets that are not in progress. *Would decide it:*
   whether you ever want to review a finished session's steps in the
   panel rather than opening `activity-log.json`. *Cheap remedy if
   wrong:* one predicate in `stepNodes`.

5. **Do `blocked` / `failed` steps read correctly as the cancelled
   glyph?** The CLI renders those as `[!]`. The tree has no `[!]` asset,
   so they map to `cancelled.svg` — the one authored glyph that says
   "this did not go well". It may instead read as *"this session was
   cancelled"*, which would be actively wrong. *Would decide it:* log a
   step with status `blocked` and look at it. *Cheap remedy if bad:* a
   fifth authored glyph, or a ThemeIcon with an error colour.

6. **Same question for an unrecognized status**, which maps to
   `not-started`. The reasoning is Set 086's rule that a confabulated
   value must never render as a pass, so it deliberately claims no
   progress — but it is indistinguishable from a genuine `pending` row.

7. **Does the list feel live during a real session?** Layer 3 proves the
   tree follows the ledger across an explicit refresh. Whether it feels
   current under the ordinary watcher + 30-second poll, while you are
   actually working, is a feel question no test can answer.

## Set 114 S1–S2 — the posting cadence itself (never walked)

8. **Is a checklist posted at seven named transitions signal or noise?**
   The set's own spec listed this as a risk: *"a checklist posted too
   often is scrolled past like any other banner."* The cadence was
   chosen as the smallest set of moments that answer "where is this
   session", and the gate enforces five of them. Only you can say whether
   the volume in a real session is right. *Cheap remedy if too noisy:*
   the cadence table is one document and the gate reads it; dropping a
   transition is a table edit plus a gate constant.

9. **Is the markdown table the right chat-surface shape?** `--markdown`
   was chosen for chat and plain text for consoles. Nobody has judged the
   rendered result in the surface it is posted into.

## Set 111 S4 — the checklist's first release (walk waived at the time)

10. **The original guided-look walk was waived** because the format was
    not judged worth the operator's time. Its subject — the checklist as
    a terminal surface — is now largely superseded by Sets 114 S1–S3, so
    a remediation set should re-scope rather than re-run it: what
    survives is entries 8 and 9 above.

