ISSUES FOUND

- **Issue 1:** Unplanned Copilot CLI transport timeout changes are outside the Session 1 contract and are not release-documented.
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A `copilot-cli`-profile user hits a slow or hung CLI dispatch; the package now waits up to 1200s instead of the shipped 300s, but reviewers/operators are told this session only changed `verify_session` loop bounds/framing/stop behavior. Because real Copilot CLI `total-timeout` failures are already present in this seat’s baseline, this is a probable operational path, not theoretical.
  - **Details:** **Violation:** the plan says Session 1 creates/touches `verify_session.py`, its tests, and two workflow docs, and the release contract says `CHANGELOG.md` gains three Set 111 S1 entries. **Impact:** this broad routing transport behavior would ship without the explicit review/changelog authority a release-gatekeeper repo requires. **Evidence:** the diff also changes `ai_router/cli_transport.py`, `ai_router/config.py`, `ai_router/__init__.py`, `ai_router/router-config.yaml`, and `test_cli_transport.py`; `router-config.yaml` adds `transports.copilot-cli.timeouts.total_seconds: 1200`, and `cli_transport.py` adds resolver/validator plumbing. Correct fix: revert/split those transport changes, or explicitly scope and document them as a separate authorized deliverable.

#### NITS

- **Nit:** `load_discovery_model()` still says discovery runs K calls with “IDENTICAL prompts,” which now contradicts the lens-varied discovery behavior.