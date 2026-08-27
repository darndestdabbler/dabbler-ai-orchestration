**ISSUES FOUND**

**Issue 1:** Late task declarations are still accepted after work can exist.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/session-framework-spec.md:92-112, docs/session-sets/148-the-session-framework/spec.md:249-263, ai_router/writers.py:643-683, ai_router/session.py:553-564, tests/test_session.py:619-648`
- **Failure scenario:** A session author misses the post-`start` reminder, does the work, then runs `session declare --releasable` before close. That is probable because the implemented path only prints guidance and the writer refuses duplicates/complete sessions, not late in-progress declarations.
- **Acceptance criterion:** `JUDGMENT - A first task declaration must be refused once material session work exists after registration, or the state machine must otherwise make task-list declaration the only allowed step before development; tests must cover that late-declaration path.`
- **Details:** **Violation:** spec says "`Task list -> Develop`" and "**The framework enforces this order**"; §3.a says the declaration is made "before any code exists." **Impact:** session 13 can later treat a retroactive `releasable` flag as valid, defeating the exact anti-hindsight packaging rule. **Evidence:** `declare_session_task` only checks write-once and complete-session status, while `start` only prints a reminder.

**Issue 2:** Session 4 decisions were backfilled under session 3.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/148-the-session-framework/activity-log.json:867-949, docs/session-sets/148-the-session-framework/decisions-log.md:783-894, docs/session-sets/148-the-session-framework/session-state.json:70-88, docs/session-sets/148-the-session-framework/spec.md:228-263`
- **Failure scenario:** A future session or operator looking for the session 4 “Record authority” decisions finds no session 4 decision section; D32-D37 are structurally attached to session 3 even though their headlines and content are session 4 records. This is already present in the delivered backfill.
- **Acceptance criterion:** `python -c "exec('import json, sys\nentries = json.load(open(\"docs/session-sets/148-the-session-framework/activity-log.json\", encoding=\"utf-8\"))[\"entries\"]\nby_id = {e.get(\"decisionId\"): e for e in entries if e.get(\"kind\") == \"decision\"}\nexpected = [\"D32\", \"D33\", \"D34\", \"D35\", \"D36\", \"D37\"]\nmd = open(\"docs/session-sets/148-the-session-framework/decisions-log.md\", encoding=\"utf-8\").read()\nok = all(by_id.get(i, {}).get(\"sessionNumber\") == 4 for i in expected) and \"## Session 4\" in md\nsys.exit(0 if ok else 1)')"`
- **Acceptance expectation:** exit 0
- **Details:** **Violation:** session 5 was required to "Backfill this set's own decisions log ... from ... sessions 1 through 4." **Impact:** the new authoritative structured record is wrong on its first dogfood use. **Evidence:** activity rows D32-D37 have `sessionNumber: 3` while their text says “Session 4,” and the rendered log places them under “Session 3.”

**Issue 3:** `decisions-log.md` is not rendered in decision order.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-framework-spec.md:78-84, ai_router/writers.py:741-780, docs/session-sets/148-the-session-framework/decisions-log.md:170-225`
- **Failure scenario:** Readers audit the human-facing decisions log expecting append order, but D38 is displayed before D10-D37. That is probable for every reader of the generated file because the renderer groups by session number before emitting entries.
- **Acceptance criterion:** `python -c "exec('import re, sys\ntext = open(\"docs/session-sets/148-the-session-framework/decisions-log.md\", encoding=\"utf-8\").read()\nids = [int(n) for n in re.findall(r\"^### D(\\\\d+) \", text, re.M)]\nsys.exit(0 if ids == sorted(ids) else 1)')"`
- **Acceptance expectation:** exit 0
- **Details:** **Violation:** the spec defines `decisions-log.md` as "Every decision, human or AI, in order," with entries appended at the moment decisions occur. **Impact:** the projection no longer provides the ordered audit trail it promises, undermining the main purpose of the file. **Evidence:** `render_decisions_log` iterates `for number in sorted(...)` and then emits that session’s decisions, producing the current D9 → D38 → D10 ordering.