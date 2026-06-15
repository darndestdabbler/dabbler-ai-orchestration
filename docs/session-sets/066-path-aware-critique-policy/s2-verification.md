ISSUES_FOUND

**Major**
- Unsafe import path and incomplete fail-open handling → `ai_router/close_session.py:1787-1798` → The new gate does a bare `from path_aware_critique import ...` before entering the fail-open `try/except`. That creates two real problems: (1) a cwd/`sys.path` shadow module can hijack the gate instead of loading the package sibling, and (2) any non-`ImportError` during import/module initialization aborts close-out outright, violating the stated "internal error never wedges close-out" contract. Fix: resolve the sibling module explicitly and do it inside the guarded `try/except Exception` block (or use a controlled compat loader keyed off `__package__`/`importlib`).

**Minor**
- Mojibake / cp1252 corruption in newly added docs → `ai_router/docs/close-out.md:344-352`, `docs/ai-led-session-workflow.md:1808-1833` → The new text contains corrupted sequences such as `Â§` and `â€”`. This is a real encoding defect in shipped documentation. Fix: re-save the edits as UTF-8 and replace the corrupted characters with ASCII-safe text or the intended Unicode.