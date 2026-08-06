**ISSUES FOUND**

**Issue 1:** The VSIX verifier does not actually verify every `0.49.0` CHANGELOG claim it certifies.
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A release operator relies on `scripts/verify_vsix_claims.py` saying `ALL CLAIMS VERIFIED` / `11/11 claims pass`, but the script can pass while public release claims about session rows, lazy expansion, row-type action gating, malformed-ledger handling, duplicate-session handling, and icon application are false. That is probable because those claims are currently not tested by this verifier at all.
- **Details:** Violation: the release contract requires “vsix built and its contents verified against every CHANGELOG claim,” and `change-log.md` claims every `0.49.0` CHANGELOG claim is checked by this script. Impact: this is the exact release gate that discharged round 1’s Major; a reasonable reviewer cannot treat the staged artifact as fully claim-verified. Evidence: `CHANGELOG.md` claims row-type `contextValue` gating, session expansion, `normalizeLedgerSessions`, malformed/duplicate ledger behavior, and consistent status/module icon behavior; `verify_vsix_claims.py` only checks 11 coarse predicates such as version, view type absence, activity icon shape, packaged assets, submenu count, renderer absence, and tree id presence. Correct answer: either expand the verifier to cover each public claim, or narrow the release/change-log assertion to the subset actually verified and cite separate tests for behavioral claims.

#### NITS

- **Nit:** `s4-walk-evidence.md` still has stale status text saying “the activity-bar contrast finding was fixed” and quotes the pre-round-2 8.9m Layer 3 run, even though later lines in the same file and the release notes correctly say the contrast complaint is reopened/deferred and the final run is 8.0m.