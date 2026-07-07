**ISSUES FOUND**

- **Issue 1:** Newly added verification instruction surfaces still tell users to run bare `python -m ai_router.verify_session`, reintroducing the exact interpreter/version-skew failure mode this set is supposed to close.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    1. **Violation** — The operator revision is explicitly about fixing the live UAT failure caused by version/interpreter skew: the addendum says the first walk failed because the scratch venv had PyPI `0.28.0` with “no `verify_session`, no integrity gate,” and this round is about hardening the **instruction surfaces**. The same diff’s bundle docs also state: “**Use the repo venv for every Python invocation. A bare `python` often resolves to a system interpreter without `ai_router` installed**.”
    2. **Impact** — A user/engine following the new advisory or remediation text can invoke the wrong interpreter, getting either `ModuleNotFoundError` or an older installed router that lacks the very `verify_session`/gate behavior this change depends on. That is not theoretical; it is the same class of failure the operator revision was ordered to eliminate, so it should block merge.
    3. **Evidence** — Multiple new/updated surfaces emit bare `python` anyway:
       - `ai_router/start_session.py` prints: ``python -m ai_router.verify_session --session-set-dir <this-set>``
       - `ai_router/routed_gate.py` prints: ``python -m ai_router.verify_session --session-set-dir <active-set>``
       - `ai_router/docs/close-out.md` remediation text names: ``python -m ai_router.verify_session --session-set-dir <set>``
       
       Meanwhile the updated bundle/docs teach venv-qualified invocations (`.venv/Scripts/python.exe ...` / `.venv/bin/python ...`) and explicitly warn that bare `python` is unsafe. The correct fix is to make these runtime/remediation surfaces emit the active interpreter (`sys.executable`) or the same venv-qualified form used elsewhere, not bare `python`.

#### NITS

- **Nit:** `README.md` and `tools/dabbler-ai-orchestration/README.md` front-matter now say “mandatory cross-provider verification” without immediately scoping that to Full tier; the later body clarifies it, so this is not blocking, but the opening line is broader than the actual policy.