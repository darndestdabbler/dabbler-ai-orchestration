ISSUES FOUND

- **Issue 1:** The sandbox-drift classifier still reports the session’s exact one-time mutation reproduction as servant dishonesty.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/pull_verifier.py:1422`, `ai_router/tests/test_pull_verifier.py:2920`, `docs/session-sets/113-narrated-video-walkthroughs/s6-reproduction-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s6-reproduction.md`
  - **Failure scenario:** An honest default servant reads state A, one file is appended once before the guard runs, and the tree then remains stable at state B. This is probable on the live repository because discrete appends to logs, metrics, Git state, or capture outputs are precisely the reproduced production failure. Both guard derivations observe B and agree with each other, so the code raises `DeterministicServantViolation` against the honest A result and aborts the paid critique.
  - **Acceptance criterion:** `JUDGMENT - With DeterministicServant, mutate the probed file exactly once after servant.run returns but before guard verification begins, then leave it stable; the run must not raise DeterministicServantViolation and must preserve an explicit drift/evidence-quality indication.`
  - **Details:** **Violation:** The work claims that narrowing the guard “removes a false-accusation class” and specifically cites “one append to one file between the servant call and the guard.” **Impact:** The original failure remains on a common live-tree timing pattern, so the OpenAI critique can still abort without producing the two-provider result this session exists to restore. This changes the merge decision because the central fix does not handle its own stated reproduction. **Evidence:** `_guard_raw_ground_truth` compares the servant’s A result with `truth=B`, then `again=B`; because the two fresh results agree and differ from A, it raises the violation. The new test does not plant that shape: its monkeypatch rewrites the file before every derivation, forcing `truth != again`. The correct fix must distinguish a change between servant execution and verification, rather than treating post-change stability as proof the servant lied.

- **Issue 2:** `BindingHTTPError` can include the Gemini API key in its exception message.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/pull_verifier.py:2305`, `ai_router/pull_verifier.py:2389`
  - **Failure scenario:** Gemini returns a routine non-2xx response, such as a rate limit, invalid-model response, or malformed-request error. Gemini authentication is carried in the request URL, and `_raise_for_status_with_body` interpolates `resp.request.url` directly into the exception. The error is then surfaced or logged during critique failure, disclosing the API key. Provider errors are probable operational events—the session itself exists because of repeated provider errors—and credential disclosure is materially damaging.
  - **Acceptance criterion:** `JUDGMENT - Construct a Gemini non-2xx response whose request URL contains a sentinel API key and verify that neither str(BindingHTTPError) nor any surfaced critique error contains the sentinel or other credential-bearing query values.`
  - **Details:** **Violation:** `BindingHTTPError` claims “nothing here can leak a key,” but the helper embeds the complete request URL without redaction. The justification that the `Authorization` header is untouched does not protect Gemini’s URL-carried credential. **Impact:** A normal provider failure can expose a live credential in terminal output, logs, or session evidence, which is a merge-blocking security defect. **Evidence:** `GeminiBinding` posts using `url`, while `_raise_for_status_with_body` formats `at {resp.request.url}` verbatim. The correct fix is to redact credential-bearing query parameters—or omit/sanitize the URL—before constructing the exception.

## NITS

- **Nit:** `ai_router/pull_critique.py:567` still records no metrics row when `run_pull` raises after a paid provider response. The exact servant-guard failure happens after model work but enters the exception branch before `_record_critique_call`, so the claim that critique accounting closes the spend hole is incomplete for failed arms.

- **Nit:** `ai_router/pull_verifier.py:2389` implements `status_code < 400` as success even though `BindingHTTPError` is documented for every “non-2xx status.” A 3xx response therefore proceeds to JSON parsing instead of preserving its status and body. Provider redirects are uncommon, so this is non-blocking.

- **Nit:** A dishonest non-deterministic servant can evade the guard by starting a background writer that continuously mutates the probed state, setting `raw=True`, and returning fabricated content. The independent derivations disagree, `SandboxNotQuiescent` is swallowed, and the fabricated result is delivered to the model. This is a real loss of integrity coverage, but it requires a custom adversarial servant rather than the production default.

- **Nit:** `ai_router/tests/conftest.py:201` leaves `AI_ROUTER_METRICS_PATH` untouched whenever it is already set, even if it points directly at the shipped ledger. That does not enforce the stated invariant that the suite “must never append” there. Unconditionally installing the scratch default would still allow individual tests to override it afterward.

- **Nit:** `_record_critique_call` writes `requested_model_id=result.model` and `served_model_id=result.model`. After alias resolution, `result.model` is the served ID, so the ledger loses the actual requested alias and the `requested_model_id` field is misleading.

- **Nit:** `s6-outcome.md` says “23 new tests,” but the displayed additions contain 25: 18 in `test_pull_verifier.py`, 4 in `test_pull_critique.py`, and 3 in `test_metrics.py`.