# Step 9 — guidance reorganization review (set-terminal)

> Run on the last session of every set, after the notify. "No changes
> recommended" is a valid outcome; skipping the review is not.

## Reviewed

`docs/planning/project-guidance.md` and `docs/planning/lessons-learned.md`
against what Set 107 actually taught.

## Recommendation 1 — ACCEPT/REJECT NEEDED: add a *volume* rule to the UAT bar

**Why.** The standing UAT bar (operator-set, 2026-07-04, after suspending the
Set 077 walk) is entirely about **ambiguity**: name the exact button, quote the
exact string, never assume a shared brain. This session obeyed all of it and
still produced a checklist the operator rejected as **"daunting and tedious"** —
nine items, 15,149 characters of human-facing text, a tutorial-quality
interrogation attached to every one, and a six-mark clock protocol. The
operator's rule, in their words:

> *"UAT should not be about confirming every single detail. It should be about
> confirming the most important things and allowing the human to provide
> feedback on visual/cosmetic issues, if there are any — but generally speaking,
> you don't need dedicated items for this. If there are significant
> inconveniences or annoyances, the human will alert you."*

Rebuilt to four items and 2,588 characters, answering the same criterion. **The
bar was silent on volume, so a well-intentioned orchestrator satisfied every
stated rule and still built the wrong instrument.** That silence is the defect.

**This is not a lesson, it is a principle.** It is durable, operator-originated,
applies to every future set with `requiresUAT: true`, and has no executable-gate
equivalent — the ad-hoc floor checks that each item declares its programmatic
verification, never that the item should exist at all.

### The proposed text

Replace the third bullet of *UAT is written for a stranger and pre-verified by
automation* — currently the DSL "intended direction" note — with:

> - **Few items, and no per-item interrogation** (operator, 2026-07-30, after
>   rejecting a nine-item checklist as "daunting and tedious"). Derive the item
>   list from the set's **acceptance criterion**, not from the surface's feature
>   list. Say **once**, in the preamble, that anything confusing or annoying
>   goes in Feedback — never attach a quality question to every item. No
>   dedicated item for reading a prerequisite list, for a path the walker is
>   told not to trigger, or for a cosmetic judgment. Coverage that automation
>   already settles belongs in the suites, not in a human's evening.
> - A UAT DSL prototype exists (`D:\Projects\dabbler-uat-dsl`); evaluating it is
>   still deferred, so apply the rules above by hand.

### The obstacle, stated plainly

**`project-guidance.md` is at exactly 100% of its 3,499-token ceiling.** The
guidance lifecycle says ceilings ratchet down only, and raising one is an
operator config edit with a stated reason. The swap above is roughly
**+270 bytes net**, so it does not fit as written. Three ways forward, operator's
choice:

| | Option | Cost |
| :--- | :--- | :--- |
| **A** | Tighten the section's opening paragraph to pay for the new bullet (it restates the "confusing walk destroys evidentiary value" rationale at length). | No content lost, some rationale compressed. **Recommended.** |
| **B** | Accept a small ceiling raise for this file, with the reason recorded. | Ratchets the wrong way; the lifecycle discourages it. |
| **C** | Land it in `lessons-learned.md` instead. | That file is at 99% too, and this is a principle rather than a tactic — it would sit in the wrong tier. |

**Not applied unilaterally.** Editing guidance prose to make room touches content
the operator owns, and the constitution puts deleting or compressing guidance
under operator approval. Say the word and it lands in a follow-up commit.

## Recommendation 2 — reactivate L-079-3, or leave it archived (operator's call)

`cite_lessons` flagged it: **L-079-3** (*any set shipping provisioning must
dogfood the true cold start*) was cited as instrumental this set but lives in
`lessons-archive.md`, and the tool says to consider reactivating it.

**Recommendation: leave it archived.** Its rule was **promoted** into
`project-guidance.md` → Workflow Expectations, which is preloaded every session;
the archived copy is the full text, not the operative rule. The citation
recorded that the *rule* was instrumental — and it was, this set's entire
acceptance test is a true-cold-start walk — not that the archived text needed
reading. Reactivating would put the same rule in the preload twice, at a file
already at 99% of ceiling.

## Recommendation 3 — no change

Nothing else in either file was contradicted by this set. Five lessons were
cited and all applied as written:

- **L-095-1** (consequence-graded severity) — carried in the conventions block;
  the first graded round returned three real defects and no nit-churn.
- **L-065-1** (propagate a consistency fix to every echo) — the six-mark timing
  correction had three echoes, all fixed in one pass, then grepped.
- **L-064-8** (a replacement doc inherits the retired doc's claims at its peril)
  — the direct cause of finding F2: `ai-assignment.md` kept describing a
  protocol that had been replaced.
- **L-064-9** (`git diff` omits untracked files) — new artifacts staged before
  the evidence bundle was generated.
- **L-064-12** (Explorer changes run Layer 3 before close) — its *"a test layer
  nobody runs rots silently"* clause is what turned a shrug into
  `s3-pre-walk-floor.md` §3 and a named follow-on.

## Owed, and not blocking

The **advisory path-aware critique did not run**: the first-party automated
producer (`ai_router.pull_critique`) was attempted twice, seven minutes apart,
and both non-anthropic providers returned HTTP 429. `close_session` warned, as
`advisory` should, and the set closed. **No artifact was written**, because the
stage's own rule forbids fabricating a provider entry to satisfy the gate.
Re-runnable at any time against the closed set.
