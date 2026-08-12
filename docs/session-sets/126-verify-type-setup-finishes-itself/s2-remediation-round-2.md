# Set 126 Session 2 — remediation of round 2

**Round 2 verdict:** ISSUES_FOUND — 1 Major, 0 Minor.
**Supplementary pass (round 3):** VERIFIED, nothing new. The Major below is
the whole remediation subject.

---

## The finding, and why it was accepted

> **Major / Completeness — Stale setup instructions still tell Copilot users
> to configure the retired `transport.profile` local override.**
> A Copilot-only user following the quick-start, the clone setup, or the
> lightweight-migration error message is told to create
> `ai_router/local-overrides.yaml` with `transport.profile: copilot-cli`.
> `config._apply_local_overrides` **refuses** that exact key (Set 124 S2),
> so the next config load fails.

**Accepted in full, and it is this session's own defect class.** The
session's declared scope is the instruction surface for verify-type setup,
with the explicit instruction to enumerate *writers and echoes* rather than
trust the authoring list (`L-069-1`). The list named the surfaces that
described the **file**; these surfaces describe the **transport selection**,
which Set 124 S2 moved to the same one entry point. They are the same defect
family — a shipped instruction that contradicts Set 124's ruling and, unlike
the README's, this one **hard-fails at the loader** rather than merely
misleading.

Verified against the code before remediating, not taken on the verifier's
word:

- `ai_router/config.py:746-748` — `_LOCAL_OVERRIDE_ALLOWED` carries the
  comment *"Set 124 S2: `transport.profile` is NO LONGER an allowed local
  override"*, and the `transport` branch below it (`:840+`) is documented as
  **REFUSED rather than warned-and-ignored**.
- The deciding case named there is exactly the population these
  instructions address: *"a Copilot seat with NO project file"*.

## What was changed (one pass, every sibling site)

| site | change |
| :--- | :--- |
| `ai_router/spec_config.py` | `LIGHTWEIGHT_REMOVED_MESSAGE` — the **shipped** error text a stranded reader sees — now names `verify_type --set COPILOT_CLI` + `--set-env` instead of the retired override. A comment records why. |
| `ai_router/tests/test_spec_config.py` | `test_migration_message_names_both_remedies` pins the replacement **and** the negatives (`local-overrides`, `transport.profile`, `transport: {` must not reappear), so the old wording cannot creep back silently. |
| `docs/cross-repo-lightweight-removal-notice.md` | the quoted message updated to match the shipped string, and step 2 of the Copilot migration replaced with the two commands + an explicit "delete the `transport:` block if an older copy of these instructions had you create it". |
| `docs/clone-setup.md` | seat-transport step 5 replaced with the two commands; the "do not put it in `router-config.yaml`" warning gains its **`local-overrides.yaml`** sibling, since that file was the Set 110 answer and is no longer one. |
| `docs/quick-start.md` | the Copilot bullet now selects the transport through `verify_type`, and says the local-override route is refused at config load. |
| `docs/ai-led-session-workflow.md` | the Copilot-CLI routing section no longer says a shop "can instead set `transport.profile: copilot-cli`" — it resolves `COPILOT_CLI` and the profile is **derived**. |

Deliberately **not** changed (checked, and correct as they stand):

- `ai_router/CHANGELOG.md:1406-1414` and `docs/concepts/tier-model.md:49` —
  historical record and a profile *name*, not instructions.
- `tools/.../copilotSeatSetup.ts` — already retargeted by Set 124 S3; its
  surviving mentions describe the **derived** profile correctly.
- `docs/repository-reference.md:825` — says the gitignored
  `local-overrides.yaml` "is edited as YAML now", which is true of the file
  in general and asserts nothing about the retired key.

## Acceptance criterion (JUDGMENT), and how it is met

> *All live setup/migration surfaces and the `LIGHTWEIGHT_REMOVED_MESSAGE`
> direct Copilot users to `verify_type --set COPILOT_CLI` plus `--set-env`,
> and no longer instruct them to set `transport.profile` in
> `ai_router/local-overrides.yaml`; the corresponding spec-config test pins
> that replacement.*

Met on both halves. The repo-wide grep for the instruction pattern now
returns only historical/CHANGELOG matches and the new "do not do this"
warnings — and the negative assertions in `test_spec_config.py` are what
keep it that way after this session ends.

**Tests:** `test_spec_config.py`, `test_local_overrides_merge.py`,
`test_transport_profile_config.py`, `test_verify_type_resolution.py` —
**107 passed**.
