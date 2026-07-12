// Set 036 Session 4 (Q7 audit-locked): allowlisted watcher-inventory
// convention test.
//
// The D1 watcher-scope discipline (proposal-addendum §D1) says
// orchestrator-state inference must not be derived from indirect
// filesystem signals. The Codex config-toml watcher was retired in
// Session 3 because it was that anti-pattern. Q7's enforcement
// strategy is a hand-maintained allowlist that every new `fs.watch`
// or `vscode.workspace.createFileSystemWatcher` callsite must be
// registered against — adding an inference watcher fails the test
// loud and points the author at the discipline note in the
// proposal-addendum.
//
// What "in the allowlist" means: the file + line + a short rationale
// describing what is being watched and why D1 permits it. When the
// callsite moves (line numbers change after a refactor), update the
// allowlist line number in the same PR.
//
// What this test is NOT: a strict watcher cap, a semantic linter,
// a runtime check. It is a convention test on source-file content.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

interface WatcherEntry {
  // Path relative to src/, forward-slash-normalized
  file: string;
  // 1-based line number where the watcher primitive appears
  line: number;
  // What is being watched (e.g., "session-state.json" or
  // "~/.dabbler/checkout-conflicts/"). Free-form text intended for
  // the human reviewing the allowlist after a regex match shifts.
  target: string;
  // Why D1 permits it. Required so a reviewer pulling up the
  // allowlist sees the discipline rationale inline, not just the
  // mechanical fact of inclusion.
  purpose: string;
}

// The allowlist itself. Add new entries here when introducing a new
// filesystem watcher; the matching D1 rationale is required.
//
// Maintenance note: the line numbers must match the actual callsite
// after refactors. When a refactor shifts lines, update this list in
// the same commit. The test failure message points at the file:line
// of the unallowlisted callsite so the fix is mechanical.
const WATCHER_ALLOWLIST: WatcherEntry[] = [
  {
    file: "extension.ts",
    // Set 077 S2: +9 — the retainContextWhenHidden evaluation comment
    // at the view registration shifted both callsites down. Set 093 S2:
    // +1 — the assign-legacy command import + registration shifted both
    // callsites down one more line. Set 094: +1 — the
    // openModulesManifest command import shifted both down one more.
    line: 203,
    target: "docs/session-sets/** (spec.md, session-state.json, session-events.jsonl, activity-log.json, change-log.md, CANCELLED.md, *-uat-checklist.json)",
    purpose:
      "Tree-view refresh on canonical session-set state files. Watched files are themselves the writers' source of truth (no inference from indirect signals) — D1 permits.",
  },
  {
    file: "extension.ts",
    line: 239,
    target: "Getting Started Build-section input + module tree sources: {CLAUDE.md, AGENTS.md, GEMINI.md, docs/modules.yaml, docs/planning/project-plan.md, .venv/**/site-packages/ai_router/**}",
    purpose:
      "Set 060 Getting Started live-progress plus Set 092 manifest diagnostics: these scaffold artifacts, docs/modules.yaml, and the legacy root plan are the direct sources of truth for Build-section completion, module grouping, invalid-manifest status, and the Set 093 pseudo-module Plan node (no indirect orchestrator-state inference) — D1 permits. Set 094 dropped docs/session-sets/* (the getting-started→list flip keys on a materialized spec.md, caught by the watcher above).",
  },
];

const WATCHER_PRIMITIVES = [
  /\bfs\.watch\s*\(/,
  /\bvscode\.workspace\.createFileSystemWatcher\s*\(/,
];

// Files allowed to use watcher primitives without an allowlist entry
// (this test file itself + future test fixtures).
const ALLOWLIST_PREFIXES = ["test/"];

function srcRoot(): string {
  return path.resolve(process.cwd(), "src");
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function isUnderAllowedPrefix(rel: string): boolean {
  const normalized = rel.replace(/\\/g, "/");
  for (const prefix of ALLOWLIST_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

interface Callsite {
  file: string;
  line: number;
  text: string;
}

function scanCallsites(): Callsite[] {
  const root = srcRoot();
  const callsites: Callsite[] = [];
  for (const file of walkTs(root)) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (isUnderAllowedPrefix(rel)) continue;
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of WATCHER_PRIMITIVES) {
        if (pattern.test(line)) {
          callsites.push({ file: rel, line: i + 1, text: line.trim() });
          break;
        }
      }
    }
  }
  return callsites;
}

function findAllowlistEntry(c: Callsite): WatcherEntry | undefined {
  return WATCHER_ALLOWLIST.find((e) => e.file === c.file && e.line === c.line);
}

suite("Q7 watcher-inventory convention", () => {
  test("every fs.watch / createFileSystemWatcher callsite is allowlisted with a D1 rationale", () => {
    const callsites = scanCallsites();
    const orphans = callsites.filter((c) => findAllowlistEntry(c) === undefined);
    if (orphans.length > 0) {
      const formatted = orphans
        .map((o) => `  ${o.file}:${o.line}: ${o.text}`)
        .join("\n");
      assert.fail(
        "Found filesystem-watcher callsites without an entry in " +
          "WATCHER_ALLOWLIST. The D1 watcher-scope discipline " +
          "(docs/proposals/2026-05-21-chatsessionid-and-watcher-scope/" +
          "proposal-addendum.md §D1) requires that every new watcher " +
          "be evaluated for orchestrator-state-inference risk; add a " +
          "{file, line, target, purpose} entry to WATCHER_ALLOWLIST " +
          "with a one-line D1 rationale.\n\n" +
          `Unallowlisted callsites:\n${formatted}`,
      );
    }
  });

  test("allowlist entries point at real watcher callsites (no stale line numbers)", () => {
    const callsites = scanCallsites();
    const stale: WatcherEntry[] = [];
    for (const entry of WATCHER_ALLOWLIST) {
      const match = callsites.find(
        (c) => c.file === entry.file && c.line === entry.line,
      );
      if (!match) stale.push(entry);
    }
    if (stale.length > 0) {
      const formatted = stale
        .map((s) => `  ${s.file}:${s.line} (${s.target})`)
        .join("\n");
      assert.fail(
        "WATCHER_ALLOWLIST has entries that no longer point at a " +
          "watcher callsite. A refactor likely shifted the line " +
          "numbers; update the entries to match the current file " +
          "positions.\n\n" +
          `Stale entries:\n${formatted}`,
      );
    }
  });

  test("allowlist has expected post-Set-060 baseline (2 entries)", () => {
    // Sanity check: the post-Set-049 baseline was 1 watcher (extension.ts
    // tree refresh only — CheckoutPollService and its 2 watchers were
    // retired alongside the orchestrator coordination layer rip). Set 060
    // Session 1 added a second watcher for the Getting Started form's
    // live-progress inputs (root engine files + project-plan.md), bringing
    // the baseline to 2. A test that suddenly sees fewer means a watcher
    // was deleted; more means a new one was added without an updated D1
    // review.
    assert.strictEqual(
      WATCHER_ALLOWLIST.length,
      2,
      "Set-060 baseline watcher count is 2; bump this constant if a " +
        "watcher was added/removed legitimately and the change was " +
        "reviewed for D1 compliance.",
    );
  });
});
