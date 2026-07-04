# Session 1 close reason — Set 079

Session 1 of 5 ("Copilot CLI presence probe + Full-tier sub-choice UI")
completed with a clean cross-provider verification.

## What landed

- `src/utils/copilotCli.ts` — the Copilot CLI presence probe, mirroring
  `probePythonPresenceCore` (explicit `dabblerSessionSets.copilotCliPath`
  setting decides alone → PATH scan; filesystem probe only), wired into
  `computeGettingStarted` as a getting-started-mode-gated thunk with a
  quiet `true` default, plus the new `copilotCliPath` setting.
- The Full-only seat-profile radio group (`transportProfileBlockHtml`,
  "api" default / "copilot-cli") between the tier radios and the budget
  block, omitted on Lightweight (the `budgetBlockHtml` pattern).
- The missing-CLI warning (`data-gs-warning="copilot"`) inside the block,
  visible only when the Copilot option is selected AND the probe failed;
  absent payload flag fails quiet. The D6 key warning is suppressed while
  copilot-cli is selected (its copy tells the operator to set `DABBLER_*`
  keys — wrong for the keyless Copilot-seat audience); the verifier
  independently confirmed the reachable warning matrix.
- `restoreGsState`/`persistGsState`/`gsState` extended with the
  seat-profile family (`transportProfile`/`profileDirty`/`lastProfileSeed`)
  under the exact tier/mode seed/dirty/reload precedence; client.js seed
  tuple extended. `transportProfileSeed` rides the payload but the host
  resolver is deliberately null until Session 2 creates the durable
  source (the scaffold's `transport.profile` write).
- No Build wiring, by design — Sessions 2–3 own sequencing/subprocess/
  config-write.

## Probe/spawn agreement — the empirical facts (for Session 2)

Verified on this machine (2026-07-04, venv Python):

- `subprocess.run(["<abs path>\\fake.cmd"])` with `shell=False` → rc=0
  (CreateProcess executes extension-explicit batch files via an implicit
  cmd.exe — the BatBadBut behavior).
- `subprocess.run(["fake"])` with only `fake.cmd` on PATH →
  `FileNotFoundError` (bare-token resolution appends `.exe` only).
- `ai_router.copilot_catalog` exposes `--binary` (default `"copilot"`),
  so Session 2 can pass an explicit operator setting through to the
  refresh spawn. **Session 2 note:** if the operator set
  `copilotCliPath`, pass it as `--binary`; and mind BatBadBut-style
  argument handling if the binary is ever a `.cmd` (cmd.exe parsing).

The probe encodes exactly that asymmetry (PATH scan = `.exe` only;
explicit setting = plain file existence) and both branches are pinned by
tests.

## Verification

- Routed gate: REQUIRED (blast-radius, breadth, build-ci-config).
- Session verification: gpt-5-4 (OpenAI), **VERIFIED**, 0 issues
  (`s1-verification.md`).
- Routed code-review round (opus → gpt-5-4 auto-verify) produced one
  Major that was adjudicated with the empirical runs above
  (`record_adjudication`: context-gap / accept-dismissal); its real
  substance (comment overclaim + missing explicit-`.cmd` test) was fixed.
- Suites: Layer-2 mocha 1134 passing; `tsc --noEmit` clean; pytest 2483
  passed / 5 skipped; Playwright Layer 3 19 passed (local, 4.8m).

## Knowingly accepted residual

`copilotCliPresent` absent from the payload (a host older than this
session) reads as present, so a keyless operator on such a host who
selects Copilot with the CLI missing sees no warning until Build-time
handling (Sessions 2–3). Unreachable in-version (host and webview ship in
the same VSIX); quiet-not-loud by design, same as `pythonPresent`.
