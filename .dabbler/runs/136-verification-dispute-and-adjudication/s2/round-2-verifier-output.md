VERIFIED — The prior major finding is resolved: `_adjudication_prompt` now includes the complete stored finding record, and the regression test covers fields previously omitted. The new bare-OVERRULE handling also fails closed and is tested.

## NITS

- **Nit:** `ai_router/verdict.py:parse_adjudication_response` requires reasons only for `OVERRULED`; a bare `UPHOLD` can still produce an empty reason despite the requirement to decide “with reasons.” This is non-blocking because it preserves the blocking finding, but it weakens the audit record.