# Operator notes — Set 116

Notes captured from the operator outside a session. Sessions read this file
at their start alongside the spec.

---

## 2026-08-10 — The gate ruling

The operator reviewed all ten close gates with their purposes and ruled:
**"go with your Read."** That disposition is recorded below.

**This is direction, not the attestation.** Reducing gates is a
**verification reduction** and sits inside the decision-rights hard
carve-out; `decision_journal.py` refuses to write it under AI authority.
Session 3 still presents the ruling and records the operator's attestation
in `decisions.jsonl` at the time it implements it. No session may treat this
file as the attestation.

### Keep as gates — the operator's three

| Gate | Why it survives |
| :--- | :--- |
| `verification_integrity` | Refuses a close whose claimed verdict is uncorroborated. This is gate (a) — the thing that makes a verdict mean something. |
| `uat_walk_recorded` | A `requiresUAT` session closes with its walk or an attested waiver. Gate (b), and it already permits the honest "no" the operator wants. |
| `test_run_fresh` | Gate (c) — but it is **broken today** and Session 3 must fix it: `pytest` and `mocha` are `expensive=False` in `run_of_record.py`, so the once-per-session rule never governed the 14-minute suite. Scope it to the surfaces the session actually touched, so a docs-only session never owes Playwright. |

### Keep as transactional preconditions — not gates

| Check | Why it is not ceremony |
| :--- | :--- |
| `working_tree_clean` | Protects the write. A close computed against a dirty surface records something that was never true. |
| `pushed_to_remote` | Same class: an unpushed close is a local fiction. |

These stay enforced, but they are **preconditions on a correct write**, not
discipline anyone should want to route around. Classifying them as gates is
what made "ten gates" sound like ten pieces of ceremony when two of them are
data integrity.

### Delete

**Nothing.** `checklist_posted` was originally ruled for deletion, then
**revised to demotion on 2026-08-10** once it emerged that Set 114 Session 1
shipped it *that morning* (completed 03:15; the ruling was made ~09:45).

The case for deleting it was real — it proves a render, not a reading, and
its very first dogfood was the **6.83h `waiver-escape` gap** in Set 114 S1,
the second-largest single stall in the dataset, ending in an
operator-attested waiver. The case against deleting it is also real, and is
written into the gate's own docstring: Set 111 S4 posted the checklist
**once** across many hours and dozens of transitions, and *nothing noticed,
because a close gate cannot observe a chat window*.

Demotion resolves both. The post ledger (`checklist-posts.jsonl`), the
cadence definition and the comparison all survive and still print; only the
veto that produced the stall is removed. Deletion remains available in a
later set **on evidence** — if the demoted check never surfaces anything
worth acting on, that is an argument; six hours of hindsight is not.

### Demote to warn-not-block

| Gate | Reason |
| :--- | :--- |
| `checklist_posted` | See above. Signal kept, veto removed. |
| `activity_log_entry` | A log with one entry proves nothing about whether the log is honest. |
| `next_orchestrator_present` | Bookkeeping. A missing value is a nuisance, not a reason to refuse a close. |
| `change_log_fresh` | Bookkeeping. Worth a warning at the set boundary; not worth blocking on. |
| `verification_method_vocabulary` | A spelling check on a token. |

**"Demote" means the check still runs and still prints**, but it cannot
refuse a close. The signal is kept; the veto is removed. Nothing here is
deleted silently — a demoted check that never fires again is a candidate for
deletion in a later set, on evidence.

### Two consequences worth stating

1. **No tests are removed by this ruling.** An earlier draft claimed test
   count would fall as a side effect of deleting gates; with the
   `checklist_posted` revision, **nothing is deleted**, so no test suite goes
   with it. This set therefore delivers **zero** reduction in the ~3,800
   tests — which is consistent with its own finding that test count is not
   where the time is.
2. **Ten becomes three plus two plus five.** Three gates the operator
   believes in, two preconditions protecting the write, five demoted
   signals, no deletions. If a future set wants to add a gate, it should
   have to argue against this table.

