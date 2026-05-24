"""Session 5 verification driver — Set 045 / log-harvest implementation.

Bundles the S5 deliverables and asks a cross-provider verifier
(Gemini Pro) to confirm the Explorer wiring (HarvestService +
RowPayload protocol extension + badge / conflict-pill rendering)
honors the S1 location lock + S2 schema + S4 marker contract.

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
Per memory `feedback_session_verification_gpt54_429_pivot_to_gemini`:
go straight to gemini-pro to avoid the GPT-5.4 429 cascade.
Per memory `feedback_split_large_verification_bundles`: bundle
estimated <120KB; well within gemini-pro's context window.
"""
from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

import ai_router  # noqa: E402  type: ignore


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SET_DIR = Path(__file__).resolve().parent


def read_file(path: Path) -> str:
    rel = path.relative_to(REPO_ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    return f"=== FILE: {rel} ===\n{text}"


def dump_route_result_to_json(result) -> dict:
    if dataclasses.is_dataclass(result):
        return dataclasses.asdict(result)
    if hasattr(result, "__dict__"):
        return {k: v for k, v in result.__dict__.items()}
    return {"_repr": repr(result)}


SYSTEM_SUMMARY = """
Set 045 (log-harvest implementation) ships the dual-primary
observability architecture locked by Set 044's consensus-audited
proposal. Sessions 1-4 closed verified.

Cumulative routed Set 045 coming into S5: $0.247 of $5 NTE budget.

Session 5 (THIS verification) wires the Session Set Explorer
webview to the joiner CLI built in S2-S4 and adds Layer-3
Playwright coverage for the new rendered surface:

  - ai_router/joiner/coverage.py — fixed the S2-era `narration_present
    = False` hardcode. The new _any_narration_marker() helper scans
    relevant native sessions via parsers.read_claude_session_events()
    for any event_type='marker' record. Bound markers match on
    set_slug; unbound markers (no set_slug) match on workspace
    canonicalized cwd (caller-applied filter). Copilot branch
    deliberately skipped — per pre-S5 operator decision the OTel
    `gen_ai.output.messages` field requires content-capture and is
    a corner-case channel; deferred to future set if needed.

  - tools/dabbler-ai-orchestration/src/providers/HarvestService.ts
    (NEW) — async shell-out to `python -m ai_router.joiner
    --coverage --json` and `--conflicts --json` from the Explorer
    snapshot path. 30s TTL cache; spawn results are cached and the
    onUpdate callback triggers a re-render once fresh data lands.
    Graceful-fail: both shell-outs failing → cached empty snapshot
    so the service does not hot-spin the subprocess. Dev-mode
    PYTHONPATH discovery: walks up from extensionUri.fsPath looking
    for an ai_router/__init__.py sibling (present under
    --extensionDevelopmentPath / Playwright; absent in Marketplace
    install where `pip install dabbler-ai-router` provides the
    import path).

  - tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts
    — extended RowPayload with harvestSignals
    (HarvestSignalsPayload | null: wrapperLaunched + narrationPresent
    + nativeLogBound + bypassInferred + lastSignalTs) and conflicts
    (ConflictPayload[]: kind + severity + note). Type unions for
    ConflictKind / ConflictSeverity exported. Null/empty on cold
    cache so the row renders without badges momentarily —
    pre-S5 single-line surface preserved as the cold-cache state.

  - tools/dabbler-ai-orchestration/src/providers/CustomSessionSetsView.ts
    — instantiates HarvestService in the constructor with
    `() => this.scheduleRender()` as the onUpdate callback;
    disposed in dispose(); invalidated in refresh(). buildRow()
    reads snapshot.signalsBySlug / conflictsBySlug synchronously.

  - tools/dabbler-ai-orchestration/media/session-sets-tree/client.js
    — renderRow() emits a .harvest-badges span (inside row-text,
    after description) with four fixed-position badges
    (wrapper / native / narration / bypass — glyphs W / N / M / B;
    .is-on vs .is-off CSS class) and a sibling .conflict-pills div
    (after .row-header) with one .conflict-pill per detected
    conflict (data-kind + data-severity + hover title).

  - tools/dabbler-ai-orchestration/media/session-sets-tree/tree.css
    — IBM colorblind-safe palette: blue (wrapper), purple (native),
    orange (narration), magenta (bypass). Severity colors:
    magenta (high), orange (medium), yellow (low). Pill border-
    radius + tabular-nums for badges; conflict-pills indented 60px
    to clear the fraction column.

  - tools/dabbler-ai-orchestration/src/test/playwright/harvest-signals.spec.ts
    (NEW Layer-3) — 3 scenarios: badges-off-state smoke + writer-
    bypass conflict pill via state-file mtime drift +
    badge/conflict layout invariants. All 3 pass.

  - ai_router/tests/test_joiner_coverage.py — 3 new Layer-1 tests
    covering the narration wiring fix. All 6 coverage tests pass.

  Build / test smoke: pytest 811/+3 in 151.42s; tsc clean;
  npm run test:unit 531 (+0 vs S4); Playwright harvest-signals
  spec 3/3 in 59.7s after rebuild. (Initial run failed because
  the bundle wasn't rebuilt — `npm run test:playwright` does
  compile+tsc+test in sequence; bare `playwright test` skips it.)

S6 ships UAT + cross-tier docs + dual-registry release.

Pre-S5 operator decisions recorded (both DEFER):
  - Copilot-side gen_ai.output.messages marker scanning DEFERRED
    (corner-case channel; bounded value vs. S5 scope cost).
  - Q3 phrasing-trigger ablation pre-S6 DEFERRED post-release
    (templates round-trip cleanly in S4 tests; Marketplace
    download count = 3 makes a real-world refusal a cheap patch).
""".strip()


FOCUS_PROMPT = """
Bias cautions: This prompt was authored by an AI agent that may
have an opinion on the answer. Its framing may inadvertently
constrain you to in-scope refinements when the right answer is to
question the scope. The work being reviewed may be presented as
further along than it should be. Before answering as posed,
briefly check whether this is the right question. If a different
question would be more useful, answer that one too.

ROUND A — Session 5 deliverable verification for Set 045
(log-harvest implementation).

You are Gemini Pro, asked to verify that Session 5 wires the
Session Set Explorer to the S2-S4 joiner CLI cleanly, that the
S2-era narration_present=False hardcode is correctly replaced by
a per-event marker scan, that the new Explorer surface (badges +
conflict pills) honors the operator's IBM colorblind-safe palette
preference and stays graceful under cold-cache / Python-missing
failure modes, and that Layer-3 Playwright coverage proves the
host → CLI → JSON → row payload → DOM pipeline is end-to-end live.

Verification targets:

A. **coverage.py narration_present wiring.**

   1. The new _any_narration_marker() helper iterates relevant
      native sessions and scans events via the per-event parser
      for marker records. Short-circuits on the first match. For
      Claude natives, parsers.read_claude_session_events() is
      called with session_cwd_canonical + fallback_conv_id from
      the NativeSession. For Copilot natives, the branch is
      skipped entirely per the pre-S5 decision. Is the short-
      circuit safe (parser is a generator; abandoning mid-stream
      should be fine), or does it leak file handles on certain
      OSes?

   2. The match predicate is `evt.set_slug is None or
      evt.set_slug == set_slug`. Bound markers (those whose
      parent native is bound to a launch via the harvest() join)
      get set_slug from launch context merge. Unbound markers
      (free-running) carry no set_slug. Is the "unbound counts
      for any set in the workspace" semantic correct, or should
      unbound markers be skipped entirely (the harvest() join
      doesn't run in coverage.py; the parser emits raw events,
      so set_slug here is ALWAYS None — is that a defect)?

   3. The previous Layer-1 test
      `test_coverage_returns_one_summary_per_set` asserted
      narration_present is False with the comment "S4 will flip
      this". That comment was updated to "no native sessions →
      no markers" — the assertion itself is unchanged because
      the test fixture has no Claude sessions. Is that
      acceptable, or should the test be made more robust by
      explicitly asserting the marker-scan path runs and finds
      nothing?

B. **HarvestService — async shell-out + caching.**

   1. CACHE_TTL_MS = 30_000. After 30s the next getSnapshot()
      call triggers a fresh background fetch. The cached
      snapshot is RETURNED while the fetch is in flight (stale-
      while-revalidate). Is that the right freshness vs.
      responsiveness tradeoff for an Explorer that the operator
      may glance at multiple times per minute, or should the
      TTL be shorter (5s) / longer (5min) / event-driven (only
      invalidate on the file watcher)?

   2. The onUpdate callback triggers `scheduleRender()`. That
      method debounces with RENDER_DEBOUNCE_MS = 50. So the
      operator sees a fresh paint ~50ms after the fetch
      resolves. Is the 50ms debounce safe (the harvest fetch
      itself is bounded by Python cold-start ~200-800ms, so
      the 50ms is dwarfed), or should the post-fetch render be
      immediate (bypass the debounce since the harvest already
      took ~half a second)?

   3. spawnJson() implementation: spawn the subprocess, collect
      stdout + stderr, resolve to {ok, payload}. On non-zero
      exit, the warning includes args.slice(0, 3) — that's the
      first three args ("-m ai_router.joiner --coverage"). Is
      that the right amount of context for the warning (vs.
      logging the full args), or should the workspace path
      also be logged?

   4. Dev-mode PYTHONPATH: resolveDevPythonPath() walks up to 5
      ancestor levels from the extension's fsPath looking for
      ai_router/__init__.py. Hard cap of 5 levels — at the dev
      repo layout (tools/dabbler-ai-orchestration/), the
      ai_router/ sibling is found at depth 2. Marketplace
      installs would find the cap with no match → null →
      PYTHONPATH unset → relies on pip install. Is 5 the right
      cap (would 3 be safer; is 5 too generous)?

   5. The spawn env in dev mode is `{...process.env,
      PYTHONPATH: devPythonPath}`. process.env at the Extension
      level is filtered by the Electron-launch allowlist
      (which intentionally excludes PYTHONPATH). So PYTHONPATH
      can't leak in from the user's shell — only the dev-mode
      discovery puts it there. Is that correct posture (PYTHONPATH
      cannot be user-configured at the Marketplace install
      site without modifying the spawn env), or should the
      service also honor an operator-set PYTHONPATH from the
      `dabblerSessionSets.pythonPath` cousin config?

C. **RowPayload protocol extension + buildRow wiring.**

   1. harvestSignals is `HarvestSignalsPayload | null`. Null
      means "harvest service has no data yet (cold cache or
      fetch failed)". Conflicts is `ConflictPayload[]` (always
      an array; empty array means no conflicts). Is the null
      vs. empty-array asymmetry the right shape, or should
      both use the same convention (e.g., both null on cold
      cache, both populated when ok)?

   2. buildRow() maps the HarvestService snapshot signals to
      the protocol shape with explicit field-by-field copy.
      That's verbose but safe — adding a new signal field to
      HarvestSignals would NOT auto-propagate to the protocol
      without an explicit buildRow change (which is a feature,
      not a bug — payload shape changes need conscious
      protocol updates). Is the verbosity justified, or should
      buildRow use a `{ ...snapshot.signals, lastSignalTs:
      snapshot.signals.lastSignalTs }` pattern?

D. **client.js — badge + conflict-pill rendering.**

   1. renderHarvestBadges() emits the four slots in a fixed
      order (wrapper / native / narration / bypass). The
      glyphs are single letters (W / N / M / B). Hover title
      is the human-readable explanation. Is single-letter
      glyph the right density (vs. icon glyphs or full
      words), or does it lose discoverability at a glance?

   2. The badges sit INSIDE .row-text (the span containing
      .row-name + .row-description). The conflict-pills div
      is a SIBLING of .row-header (under the treeitem div).
      So badges share the row name line; conflicts wrap onto
      a second line below. Is the two-tier layout right
      (badges = always-visible inline; conflicts = below to
      preserve one-line rows when no conflicts), or should
      both wrap below for visual consistency?

   3. HTML escape: every dynamic text goes through escHtml()
      / escAttr() before innerHTML assignment (defense-in-depth
      per S4 R13 / GPT M5). The badge title attribute is escAttr'd;
      the conflict pill note is escAttr'd on the title. Is this
      coverage complete (data-signal / data-kind / data-severity
      attributes are all from the closed enums, no user input)?

E. **CSS — IBM colorblind-safe palette + layout.**

   1. The palette is IBM blue (#648FFF) / purple (#785EF0) /
      orange (#FE6100) / magenta (#DC267F) for the four
      signals. Severity colors: magenta (high) / orange
      (medium) / yellow (#FFB000) (low). Per the operator's
      gauges_sizing_followup memory, this is the same palette
      used in the retired Set 029 S2 gauges. Is the
      assignment correct (wrapper → blue feels neutral;
      bypass → magenta as "attention" is reasonable), or
      should narration get the most-attention color (it's the
      strongest cross-provider signal)?

   2. .conflict-pills has `padding: 2px 12px 4px 60px` — the
      60px indent clears the fraction column on the row
      above. Is that hard-coded offset right (the fraction
      column is `width: 3em` + `margin-right: 12px` = depends
      on font size), or should the indent use CSS variables
      so a font-size change in the row doesn't break the
      indent alignment?

F. **Layer-3 Playwright coverage.**

   1. Scenario 1 (badges off-state smoke) asserts 4 badges
      render and all carry .is-off. The test relies on the
      operator's real ~/.claude/projects/ NOT having a
      session whose cwd matches the test tmpdir. Tmpdirs are
      randomly named so collision is vanishingly unlikely.
      Is that the right test posture, or should the test
      also inject a fake claude_root (would require extending
      the CLI with --claude-root which is currently
      Python-API-only)?

   2. Scenario 2 (writer-bypass via mtime drift) uses
      fs.utimesSync to push state-file mtime 60s into the
      past. The joiner's detect_writer_bypass compares
      mtime_ns to the nearest events-ledger entry; +60s drift
      is well outside the ±2s tolerance. Is the test
      semantically correct (it exercises the real bypass
      detector against a real workspace), or does it cheat
      around the actual writer-bypass semantics (the bug
      should be "someone wrote the state file WITHOUT
      appending an event" — the test simulates that by
      tampering with mtime, which is a real-world equivalent
      since the canonical writer always brackets the write
      with an event-emit, but a malicious actor could touch
      mtime without bypassing the writer)?

   3. Scenario 3 (layout invariants) asserts .conflict-pills
      is a direct child of the treeitem and .harvest-badges
      sits inside .row-header. Is that the right structural
      check, or would a visual-regression snapshot give
      stronger coverage (Playwright supports image diffs but
      they're flaky on font-rendering variations)?

   4. CRITICAL ROOT-CAUSE NOTE: The initial Playwright run
      against my pre-rebuild bundle failed because I called
      `npx playwright test` directly, which DOES NOT rebuild
      the extension. The correct invocation is
      `npm run test:playwright` which chains
      `npm run compile && npx tsc --outDir out &&
      npx playwright test`. The lesson is recorded in the
      activity log. Is this lesson worth surfacing more
      loudly (e.g., a banner in CONTRIBUTING.md or a
      pre-commit hook that complains when src/ changed but
      dist/extension.js didn't), or is it acceptable folklore
      that future contributors will rediscover?

G. **Cross-cutting / re-question.**

   Per the bias-cautions preamble: if a different question
   would be more useful, answer that one too. Specifically:

     - The HarvestService cache is per-CustomSessionSetsView
       instance. If a second webview view is ever added
       (e.g., a "Conflicts Only" tree), each view would
       maintain its own cache and shell out separately. Is
       that the right shape, or should the service be a
       singleton hung off the extension context?

     - The dev-mode PYTHONPATH affordance is a real
       maintainability concern: in production it relies on
       `pip install dabbler-ai-router`, but the Marketplace
       extension does NOT enforce that install. If the
       operator installs the extension without pip-installing
       the package, the badges silently never render (the
       service caches an empty snapshot). Should the
       extension SURFACE this missing dependency (a one-time
       toast "dabbler-ai-router not installed — install via
       `pip install dabbler-ai-router` for harvest signals"),
       or is silent-degrade the right posture?

     - The narration_present signal in the badge slot uses
       glyph "M" for marker. Should the future Q3 ablation
       (deferred per pre-S5 decision) result in a refusal,
       the operator would see no marker badge for that set
       even though they tried to render the template. That's
       a useful diagnostic (Marketplace users who hit refusal
       can see the badge stay off and know to re-render +
       paste). Is that diagnostic value worth a separate
       "narration template authored but no marker observed"
       state (a third state on the badge: on / off /
       pending)?

     - The writer-bypass detector only fires when an events
       ledger exists. A fresh session set with no events
       ledger yet — but a session-state.json written by
       start_session in the same transaction — would NOT
       trigger bypass even if mtimes are drifted (the
       detector returns [] when events_path doesn't exist).
       Is that the right "skip rather than false-positive"
       posture (preserves the operator's trust in the
       signal), or should the detector emit a `low` severity
       "missing-events-ledger" report so the operator knows
       why no bypass detection is happening?

Format the verdict as either:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_file(SET_DIR / "joiner-spec.md"),
        read_file(REPO_ROOT / "ai_router/joiner/coverage.py"),
        read_file(REPO_ROOT / "ai_router/joiner/cli.py"),
        read_file(REPO_ROOT / "ai_router/tests/test_joiner_coverage.py"),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/src/providers/HarvestService.ts"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/src/providers/CustomSessionSetsView.ts"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/media/session-sets-tree/client.js"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/media/session-sets-tree/tree.css"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/src/test/playwright/harvest-signals.spec.ts"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "session-005-route-result.json"

    print(f"\n{'='*60}\n[Round A] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="045-log-harvest-implementation",
        session_number=5,
    )
    result_dict = dump_route_result_to_json(result)
    out_path.write_text(
        json.dumps(result_dict, default=str, indent=2), encoding="utf-8"
    )
    print(f"Wrote {out_path.relative_to(REPO_ROOT).as_posix()}")
    print(f"Provider: {result_dict.get('provider')}")
    print(f"Model: {result_dict.get('model') or result_dict.get('model_name')}")
    print(
        "Tokens: "
        f"in={result_dict.get('input_tokens', '?')}, "
        f"out={result_dict.get('output_tokens', '?')}"
    )
    print(f"Cost: ${result_dict.get('cost_usd', result_dict.get('cost', '?'))}")
    print(f"Latency: {result_dict.get('latency_ms', '?')} ms")
    text = (
        result_dict.get("response")
        or result_dict.get("text")
        or result_dict.get("content")
    )
    if isinstance(text, str):
        print(f"\n--- VERIFIER OUTPUT ---\n{text}\n--- end ---")
        verdict_path = out_dir / "session-005.md"
        verdict_path.write_text(text, encoding="utf-8")
        print(f"Wrote {verdict_path.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
