# Remediation — Set 123 Session 1, Round 4 (remediation-review cycle 2)

**Fix verdicts: 4 accepted, 1 rejected.** The rejection is correct and is
fixed here. **The bounded total of 2 remediation-review cycles is now
reached**, so this sidecar is written for an operator adjudication, not for
another self-authorized round.

## The rejected fix: "no file yet" is an answer, and it belongs to the
## project being loaded

Round 3 made the config's project outrank the caller's. Round 4 found the
case that still leaked: when the loaded config's project has **no**
`project-verify-type.txt` yet, my chain fell through to the *next* anchor —
the working directory — and the caller's file then outranked the loaded
config's own explicit `transport.profile`.

Concretely: automation runs from repo A (`COPILOT_CLI` committed) while
explicitly loading repo B's `router-config.yaml`, where B is in the normal
pre-setup state — no project file, `transport.profile: api`. B loaded as
`copilot-cli` on A's authority, and when B had no `transports.copilot-cli`
block it did not merely dispatch wrongly, it **failed to load at all**.

The verifier is right, and the missing idea has a name now:

> **The first anchor that lands in a project answers outright — whether or
> not that project has committed a file.**

A project without a project file has said *"I have not chosen yet"*, which
is answered by its own configured profile. It is not an invitation for some
other project's file to answer on its behalf. The working-directory anchor
therefore only ever applies when the config belongs to **no** repository —
the pip-installed-consumer case it exists for.

## The fix

`derive_transport_profile` now takes one ordered `anchors` tuple
(replacing `start` / `extra_starts`, which invited exactly this "keep
walking" reading) and stops at the first anchor that resolves to a project
root:

```python
for anchor in anchors:
    root = find_project_root(anchor)
    if root is None:
        continue          # not a project -- try the next anchor
    if (root / PROJECT_FILE_NAME).is_file():
        return ...        # the project has chosen
    break                 # the project has NOT chosen: its config answers
```

`load_config` passes `anchors=(config_path.parent, None)`.

## The falsifier

`test_a_config_loaded_from_outside_its_project_still_honours_it` grew a
third case (c): the loaded config's project exists, has committed nothing,
and declares `transport.profile: api`, while the caller's project commits
`COPILOT_CLI`. It must load as `api`.

## Baseline discrimination, proved by hand

The harness cannot attribute a baseline for a finding raised in the round
it is reviewing, so the verifier's own criterion was run verbatim under the
workspace venv against the **round-3 code** (recovered from the git index)
and then the fix:

```
=== round-3 code (from index) ===
ValueError: transport.profile is 'copilot-cli' (derived from
  ...\repo-a\project-verify-type.txt ...) but transports.copilot-cli is missing
round3-code-exit=1

=== round-4 fix ===
round4-fix-exit=0
```

Fails before, passes after. Note the pre-fix failure is *louder* than the
verifier predicted: repo A's answer did not just mis-route repo B, it made
repo B's config unloadable — which is the strongest possible confirmation
that the leak was real.
