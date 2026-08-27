ISSUES FOUND

- **Issue 1:** Malformed slug-like markers still fail open when the closing parenthesis is missing.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/session.py:247-288`, `ai_router/writers.py:429-444`
  - **Failure scenario:** A spec author types `1. Define schema. (slug: plan-schema` while adding authored step slugs. Because the loose detector requires a closing `)`, `split_slug_marker` returns `(text, None)` instead of raising, and `seed_session_plan` falls back to `plan_step_key`; manual slug entry is the normal path for this feature, and missing a delimiter is a probable typo.
  - **Acceptance criterion:** `python -c "exec('import sys\nsys.path.insert(0, \".\")\nfrom ai_router.session import MalformedSlugError, split_slug_marker\ntry:\n    split_slug_marker(\"Define schema. (slug: plan-schema\")\nexcept MalformedSlugError:\n    raise SystemExit(0)\nraise SystemExit(1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** the spec says malformed authored slugs are “refused at write time like every other malformed field,” and the prior finding required slug-like typos not be treated as absent. **Impact:** the activity-log key and eventual plan `step_id` no longer match the slug the author attempted to declare, undermining the one-identity guarantee. **Evidence:** `_SLUG_MARKER_LOOSE_RE` only matches a trailing slug-like parenthetical that includes `)`, so an unclosed marker takes the `if not m: return text, None` path; `seed_session_plan` then uses the fallback key.

The hand-written-plan-without-ledger finding is resolved by `read_plan` requiring a recorded write hash before approval.