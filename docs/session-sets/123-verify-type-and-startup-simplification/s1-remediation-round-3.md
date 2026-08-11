# Remediation — Set 123 Session 1, Round 3 (remediation-review of the fix delta)

**Fix verdicts: 3 accepted, 1 rejected.** The rejection is correct and is
fixed here.

## The rejected fix: the anchor was following the process, not the config

Round 1 finding #5 said `load_config(path)` ignored the project file
beside an explicitly loaded config. My round-1 fix added the config's
directory as a **fallback** *after* cwd. Round 3 found the hole that
leaves: automation running from repo A while explicitly loading repo B's
`router-config.yaml` still resolves **A's** answer, because A's project
file is found first. B — the project whose config is actually being
loaded, and whose calls are about to be dispatched — is overruled by
whichever checkout the process happened to start in.

The verifier is right, and the correct rule is simpler than the one I
shipped: **the anchor follows the config, not the process.**

- `load_config` now passes `start=config_path.parent` and `extra_starts=(None,)`
  (the working directory) — config first, cwd second.
- A verify type describes how *a project* is verified. The project that
  owns the config being loaded is the project the dispatch belongs to.
- The cwd fallback still matters and is not vestigial: when the config is
  the **bundled default** (a pip install outside any repository) it has no
  project of its own, and the fallback puts the consumer's own project
  back in charge. That is the primary consumer path, so both anchors earn
  their place — as an ordered chain with one winner, not two mechanisms.

Note the ordering is also self-consistent for the ordinary case: a config
discovered by workspace walk-up lives *inside* the working project, so
both anchors name the same root and the reversal changes nothing.

## The falsifier

`test_a_config_loaded_from_outside_its_project_still_honours_it` now
drives **both** callers over the same target config:

- (a) the caller is in no project at all;
- (b) the caller is in a project of its own committing the **opposite**
  value — the exact collision round 3 described.

Both must resolve the target project's `COPILOT_CLI`. The pre-round-3
code passes (a) and fails (b), which is the point: the look-alike is what
separates a rule that fires from a rule that fires *correctly*.

## Baseline discrimination, proved by hand

The acceptance harness could not attribute a baseline for this finding —
`acceptance_harness --round 3` reports `baseline-mismatch`, because the
only pre-fix tree it holds belongs to round 2, not to the round that
raised this finding. So the discrimination was demonstrated directly, by
running the verifier's own criterion against **exactly** the round-2
ordering and then the round-3 one, under the workspace venv (bare
`python` on this seat has no PyYAML — see `s1-remediation-round-1.md`):

```
# start=None, extra_starts=(config_path.parent,)   <- round 2's ordering
PROFILE: api
AssertionError: api
round2-ordering-exit=1

# start=config_path.parent, extra_starts=(None,)   <- this fix
PROFILE: copilot-cli
round3-ordering-exit=0
```

Fails before, passes after, with the *only* difference being the anchor
order. That is the same evidence the harness would have produced.

## The three accepted fixes

Unchanged from `s1-remediation-round-1.md` / `-round-2.md`: the
resolution no longer claims a transport profile it will not dispatch with
(defect A), writes land at the project root and are refused outside a
repository (defect B), and the project file is read at the project root
and nowhere else (round 2).
