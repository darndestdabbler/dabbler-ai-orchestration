# S4 remediation — round 2 (close backstop)

The close-out gate's in-process backstop (Set 084) ran a fourth round against the
pushed commit and returned **ISSUES_FOUND with 2 blocking Majors**. Both are real,
**both are accepted in full**, and neither was disputed.

Worth stating plainly: the backstop caught two things that three earlier rounds — a
two-way discovery fan-out, a completeness-critic pass and a fix-delta review — did
not. It earned its place here.

---

## Finding 1 — the walk was called "end to end" when it skipped the Dabbler lifecycle

> **Major, Completeness / False Positive.** *"Every intended reader must use
> `Dabbler: New Module`, inspect the Work Explorer, and run the plan/decomposition
> workflow before building the services. Because the walk manually reproduced file
> effects instead of executing those steps, a broken command, misleading UI state, or
> lifecycle stall can affect the main path for typical readers while the session still
> claims the tutorial was walked end to end."*

### Adjudication — ACCEPTED

The disclosure existed, but it was **filed under the wrong justification and the
headline claim contradicted it**. `s4-walk-evidence.md` §2.3 had said the VS Code
surfaces were *"borrowed procedure this tutorial links to `adopt-dabbler.md` rather
than owning."* That is wrong on the facts, and the verifier's evidence line is
correct: the *mechanics* of those commands live in `adopt-dabbler.md`, but **the
instruction to run them is in this tutorial, on its main path, in every part** —
Day one Step 3 says run `Dabbler: New Module` three times, and Parts A, B and C each
open with *"run its plan set, then its decomposition set, then implement."*

Meanwhile the change log, the disposition and the commit message all said **"end to
end."** A limit disclosed in §2.3 does not license an unqualified claim in the
summary; that is precisely the *"evidence narrower than the sentence describing it"*
failure the conventions block asked verifiers to hunt.

### What was done

The finding offered two remedies — execute the lifecycle, or **"describe the walk as
partial and leave the corresponding acceptance claims unverified."** The second was
taken, because the first is not available to this session: driving the extension's
commands and the plan/decomposition sets needs the VS Code UI, which an orchestrator
cannot exercise headlessly. Fabricating that coverage would have been far worse than
admitting its absence.

| File | Change |
| --- | --- |
| `s4-walk-evidence.md` | Header now opens **"This is a PARTIAL walk, and the word matters"**, naming exactly what was skipped. §2's list is re-ordered so the lifecycle gap is **item 1, the largest**, and the old "borrowed procedure" justification is retracted in place rather than quietly deleted. |
| `change-log.md` | "walked the tutorial end to end" → a partial-walk paragraph stating the boundary and calling it the strongest reason the human walk is still required. |
| `s4-conventions.md` | The "what was actually done" item now carries the partial-walk statement. |
| UAT checklist | Preamble rewritten: the walk *"was PARTIAL, in one specific and important way… the engineering is proven and THE PRODUCT WORKFLOW ON THE MAIN PATH IS NOT."* Items 1 and 2's `ProgrammaticVerification` now say the command and the lifecycle were **never run**, and tell the walker they are the first to exercise them — *"a stall anywhere in that sequence is a genuine finding, not you doing it wrong."* |

The acceptance claims are correspondingly narrowed: §2 now says the walk proves the
*engineering* content of the four parts reaches its finish lines, not that the
tutorial as a whole was executed.

---

## Finding 2 — the Part D acceptance test was not a falsifier

> **Major, Correctness / False Positive.** *"`git diff --name-only` excludes untracked
> files, staged-only changes, and changes already committed. The checklist neither
> captures a clean pre-Part-D baseline nor prohibits staging or committing… The
> checklist's central falsifier is not a falsifier at all. It can approve a coupled
> implementation or reject a conforming one."*

### Adjudication — ACCEPTED, and it is worse in practice than in theory

Tested rather than argued with. Run over the walk repository, the original naive
command matched **two `.cs` files — both generated build artifacts**
(`obj/…/AssemblyInfo.cs`), not source. So the command was not merely theoretically
unsound; on this very repository it produced a result that was wrong in both
directions at once.

### What was done

A sound check was designed, **run for real, and then deliberately attacked**:

```
git add -A
git diff --cached --name-only <part-C-commit> -- "*.cs" "*.csproj" \
    ":(exclude)*/bin/*" ":(exclude)*/obj/*"
```

- `git add -A` first, so a new untracked source file cannot hide.
- Compared against a **pinned Part C commit**, so a change cannot hide by being
  committed.
- `bin/`/`obj/` excluded, so generated output cannot produce a false failure.

**Result on the walk repository: 0 files**, with `git ls-files --others
--exclude-standard` confirming no untracked source. The entire source diff across the
Part D range is one file, `watcher/appsettings.json`.

**And it was proved to be a real falsifier rather than a check that happens to return
zero:** one line planted in `DecisionTable.cs` made the file appear immediately. The
planted line was reverted and the walk repository restored to its Part D commit.

**The original Part D conclusion therefore survives the stricter test** — but it
survives it *because it was re-run*, not because the first check was adequate.

| File | Change |
| --- | --- |
| UAT checklist item 4 | Step 1 now pins a baseline commit before Part D; step 5 carries the sound command; the Expectation explains why each clause is there and says **"do not shorten that command."** |
| `s4-walk-evidence.md` | New *The Part D falsifier* subsection recording the unsound original, the two generated files it matched, the replacement, its result, and the planted-line falsification. §5's row points at it. |
| `s4-conventions.md` | The Part D evidence row restated with the baseline, the exclusions and the falsifier check. |

---

## Loop position

Round 1 discovery (blocking) → round 2 supplementary (clean) → round 3
remediation-review (fix accepted) → **round 4 close backstop (2 blocking)** → this
sidecar → round 5 remediation-review. That is the second remediation cycle, which is
the bound. Both findings here are accepted and fixed, so no finding is being carried
forward unremediated and nothing is being re-litigated.
