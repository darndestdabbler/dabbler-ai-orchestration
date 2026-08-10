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

| Gate | Reason |
| :--- | :--- |
| `checklist_posted` | **Delete first.** It proves a render, not a reading — the operator's own principle is that discipline whose context is avoided is worse than none. Its very first dogfood required an operator-attested waiver after a 6.83h blocked gap, which is the whole argument in one data point. |

### Demote to warn-not-block

| Gate | Reason |
| :--- | :--- |
| `activity_log_entry` | A log with one entry proves nothing about whether the log is honest. |
| `next_orchestrator_present` | Bookkeeping. A missing value is a nuisance, not a reason to refuse a close. |
| `change_log_fresh` | Bookkeeping. Worth a warning at the set boundary; not worth blocking on. |
| `verification_method_vocabulary` | A spelling check on a token. |

**"Demote" means the check still runs and still prints**, but it cannot
refuse a close. The signal is kept; the veto is removed. Nothing here is
deleted silently — a demoted check that never fires again is a candidate for
deletion in a later set, on evidence.

### Two consequences worth stating

1. **Test count falls as a side effect.** Each deleted gate takes its tests
   with it. `test_checklist_posts.py` and the demoted gates' refusal tests
   are a real slice of the ~3,800. This is the *only* test reduction this
   set endorses — a consequence of removing machinery, never a pruning
   target in its own right.
2. **Ten becomes three plus two.** Three gates the operator believes in,
   two preconditions protecting the write, four demoted signals, one
   deletion. If a future set wants to add a gate, it should have to argue
   against this table.
