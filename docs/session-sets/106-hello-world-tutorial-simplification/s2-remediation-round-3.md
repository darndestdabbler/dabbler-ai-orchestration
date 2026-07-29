# S2 — Remediation note, round 2 nits (loop closed here)

Round 2 (discovery, fan-out 2/2) returned **VERIFIED** — non-blocking, zero
blocking findings, five nits across the two calls. **The loop closes here.**
Two discovery passes is the constitution's bound, and a Minor-only round is
effectively VERIFIED; L-095-1 is explicit that a verifier surfacing fresh
unrated nits each round is edge-case exhaustion, not a reason to keep going.

All five nits were still fixed, because every one of them was a **factual error
in this session's own prose** or a one-line wording repair — mechanically
checkable, zero regression surface. **No round 3 was opened.**

| # | Nit | Checked how | Disposition |
| --- | --- | --- | --- |
| 1 | Following the tutorial's "replace only the placeholder `run:` block" leaves the step still named `Build and test every module (replace this placeholder)` after adaptation | Read the tutorial's step 6 wording against the template's step name | **FIXED** — step renamed to `Build and test every module`. The "this is a placeholder" cue was already carried three other ways (the HOW TO ADAPT comment, the `::warning::`, the `TODO` echoes), so nothing was lost by taking it out of the name that survives adaptation. |
| 2 | "One rule per module" is inaccurate for a module with several `codeRoots` — one CODEOWNERS pattern cannot cover several unrelated paths | True by inspection of the CODEOWNERS path-pattern syntax and the manifest's `codeRoots` being a list | **FIXED** — now "one rule per entry in a module's `codeRoots` … a module owning several unrelated paths needs one rule each." |
| 3 | The CHANGELOG's `85 → 42 lines` claim for the CI template is wrong; the diff establishes `84 → 43` | `git show HEAD:…\| wc -l` = **84**; `wc -l` on the working copy = **43**. The verifier was right and I was wrong. | **FIXED** — CHANGELOG now reads `84 → 43`. |
| 4 | The proof reports `PASS (31/31)` but exposes only 27 `[PASS]` lines, so the denominator is unauditable from the artifact | `grep -c '\[PASS\]'` = **27**. The 31 was a hand-written tally in the header that had drifted from the script output. | **FIXED** — the tally is now computed by the same counter that prints each check, so the two cannot diverge. Final: **PASS (29/29)**, and 29 `[PASS]` lines are listed. |
| 5 | Check C excused `getting-started.md` from byte comparison as "rendered with substitution tokens", but the postimage blob IDs are identical, indicating byte identity | Compared the template and the fixture directly: **identical: True** | **FIXED** — the excuse was wrong. It goes through the renderer but carries no token this bundle fills. It now gets the same byte assertion as the other two, with the URL assertions kept on top. |

## Re-run evidence on the final tree

- Goldens regenerated through the sanctioned `UPDATE_GOLDEN=1` path; `dist/`
  rebuilt via `npm run compile`.
- `s2-green-on-empty-proof.md`: **29/29 PASS**, regenerated whole.
- Full suite re-run across all three layers — results in `activity-log.json`
  and `disposition.json`.

## An honest note on what round 2 says about round 1

Round 1 and round 2 were both VERIFIED with no blocking findings, but round 2
found three factual errors in artifacts round 1 had already passed — two of them
in the *proof artifact whose entire purpose* is to stop this session asserting
things it has not established. That is the case for the second round having been
worth its ~$0.29, and it is the reason the tally is now machine-computed rather
than typed: the failure mode was me writing a number by hand next to output that
had moved.
