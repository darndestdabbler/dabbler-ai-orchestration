ISSUES FOUND

- **Issue 1: The mandatory probe did not run through the pinned Copilot CLI**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The release operator relies on the explicit “Release-ready” and “VERIFIED working through the pinned CLI” claims and publishes 0.34.0, while supported environments governed by the required lock remain on CLI 1.0.68. The release’s central acceptance gate therefore never exercised the runtime those environments are expected to use. This is probable rather than hypothetical because `cli_version_pin_required = true` explicitly makes 1.0.68 the supported pinned version, while every recorded probe ran on 1.0.69.
  - **Details:**
    - **Violation:** The task requires a “**Live probe on Windows through the real pinned CLI**” and ends with “a real >32 KiB dispatch VERIFIED working on Windows through the pinned CLI.”
    - **Location:** `s2-live-probe.md` admits the installed CLI was 1.0.69 while `ai_router/copilot-catalog.lock` pins 1.0.68. The same file and `ai_router/CHANGELOG.md` nevertheless claim the probe ran “through the pinned CLI.”
    - **Impact:** The principal Session 2 verification objective is unmet, so the release cannot accurately be called publish-ready. Version-specific CLI wire behavior was the stated reason for requiring live dogfood; success on a different version does not establish success on the locked runtime.
    - **Evidence:** “installed CLI reports GitHub Copilot CLI 1.0.69 while `ai_router/copilot-catalog.lock` pins 1.0.68 (`cli_version_pin_required = true`).”
    - **Fix:** Install and rerun both probes through 1.0.68, preserving the results. Alternatively, formally re-confirm and update the required catalog pin to 1.0.69, then rerun the probes after that version becomes the actual pin. Until then, remove the “pinned CLI,” “VERIFIED,” and “Release-ready” claims.

#### NITS

- **Nit:** `s2-live-probe-raw.json` is described as a “raw machine record,” but it retains only `raw_stdout_len`, parsed post-strip content, and synthesized assertions—not the raw stdout containing the wire events and ACK. The exact composed prompt is also absent, so the claimed placements and ACK stripping cannot be independently inspected from the artifact. Retain the lossless raw process result and probe input, or describe this file accurately as a summarized machine record.

- **Nit:** The evidence calls fact B the “exact” or “dead” middle, but offset 41,194 is not the midpoint of an 81,829-character prompt; the midpoint is approximately 40,914. This still satisfies the broader requirement that the fact be in the middle region, but the exactness claim is inaccurate.