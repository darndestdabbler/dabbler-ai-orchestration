import * as assert from "assert";
import {
  VERIFICATION_MODE_CHANGE_ENTRY_KIND,
  VERIFICATION_MODE_ENTRY_KIND,
  inspectActivityLog,
  rewriteSpecVerificationMode,
  verificationModeRecordExists,
} from "../../utils/verificationModeRewrite";

// Set 062 Session 2 (spec D3): the pure verification-mode rewrite
// helper matrix — the same shape as the tierRewrite (Set 061 S3 D4)
// matrix it siblings: present / absent / quoted / commented `…Mode:`
// variants, CRLF preservation, and non-config occurrences staying
// untouched — plus the durable-record gate that refuses the seed
// rewrite once a `verification_mode` activity-log entry exists.

function spec(blockBody: string, opts?: { pre?: string; post?: string }): string {
  // NB: the default prose deliberately avoids the literal
  // `verificationMode: <value>` shape — several tests build their
  // expected output with `input.replace(...)`, which substitutes the
  // FIRST occurrence. The dedicated outside-the-block test supplies
  // its own pre/post.
  const pre = opts?.pre ?? "# Some Spec\n\n> intro prose mentioning dedicated sessions casually\n\n";
  const post =
    opts?.post ??
    "\n\n## Sessions\n\nProse about `verificationMode: dedicated-sessions` in code.\n";
  return `${pre}## Session Set Configuration\n\n\`\`\`yaml\n${blockBody}\`\`\`${post}`;
}

suite("verificationModeRewrite — rewriteSpecVerificationMode (D3 matrix)", () => {
  test("present unquoted value is rewritten in place, all other bytes preserved", () => {
    const input = spec("totalSessions: 4\nverificationMode: out-of-band-or-none\nrequiresUAT: false\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.outcome, "rewritten");
    assert.strictEqual(result.previousMode, "out-of-band-or-none");
    assert.strictEqual(
      result.text,
      input.replace("verificationMode: out-of-band-or-none", "verificationMode: dedicated-sessions"),
      "only the verificationMode value may change",
    );
  });

  test("round-trips: switching back restores the original text byte-for-byte", () => {
    const input = spec("verificationMode: out-of-band-or-none\nrequiresUAT: false\n");
    const there = rewriteSpecVerificationMode(input, "dedicated-sessions");
    const back = rewriteSpecVerificationMode(there.text, "out-of-band-or-none");
    assert.strictEqual(back.text, input);
  });

  test("double-quoted value keeps its quote style", () => {
    const input = spec('verificationMode: "dedicated-sessions"\nrequiresUAT: false\n');
    const result = rewriteSpecVerificationMode(input, "out-of-band-or-none");
    assert.strictEqual(result.previousMode, "dedicated-sessions");
    assert.ok(result.text.includes('verificationMode: "out-of-band-or-none"'), "double quotes preserved");
    assert.ok(!result.text.includes('verificationMode: "dedicated-sessions"'));
  });

  test("single-quoted value keeps its quote style", () => {
    const input = spec("verificationMode: 'out-of-band-or-none'\nrequiresUAT: false\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.ok(result.text.includes("verificationMode: 'dedicated-sessions'"), "single quotes preserved");
  });

  test("trailing YAML comment and indentation survive the rewrite", () => {
    const input = spec("  verificationMode:  out-of-band-or-none   # seeded at authoring\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.ok(
      result.text.includes("  verificationMode:  dedicated-sessions   # seeded at authoring"),
      `comment/spacing must be preserved; got: ${result.text}`,
    );
  });

  test("CRLF specs stay CRLF and only the value changes", () => {
    const input = spec("totalSessions: 4\nverificationMode: out-of-band-or-none\n").replace(/\n/g, "\r\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(
      result.text,
      input.replace("verificationMode: out-of-band-or-none", "verificationMode: dedicated-sessions"),
      "CRLF document must be byte-identical outside the value",
    );
  });

  test("already on the target mode → no-op, text unchanged", () => {
    const input = spec("verificationMode: dedicated-sessions\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.text, input);
  });

  test("absent key + target out-of-band-or-none → already-target (parser default)", () => {
    const input = spec("totalSessions: 4\nrequiresUAT: false\n");
    const result = rewriteSpecVerificationMode(input, "out-of-band-or-none");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.previousMode, "out-of-band-or-none");
  });

  test("absent key + target dedicated-sessions → explicit declaration inserted at block top", () => {
    const input = spec("totalSessions: 4\nrequiresUAT: false\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, true);
    assert.ok(
      result.text.includes("```yaml\nverificationMode: dedicated-sessions\ntotalSessions: 4\n"),
      `verificationMode line should be inserted first in the block; got: ${result.text}`,
    );
    // Everything outside the insertion is preserved.
    assert.strictEqual(result.text.replace("verificationMode: dedicated-sessions\n", ""), input);
  });

  test("absent key insertion uses CRLF on a CRLF document", () => {
    const input = spec("totalSessions: 4\n").replace(/\n/g, "\r\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.ok(result.text.includes("verificationMode: dedicated-sessions\r\ntotalSessions: 4"));
  });

  test("commented-out line does not match — treated as absent", () => {
    const input = spec("totalSessions: 4\n# verificationMode: dedicated-sessions\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, true);
    assert.ok(
      result.text.includes("# verificationMode: dedicated-sessions"),
      "the commented line must survive untouched",
    );
    assert.ok(
      result.text.includes("```yaml\nverificationMode: dedicated-sessions\ntotalSessions: 4"),
      "an explicit declaration is inserted instead of editing the comment",
    );
  });

  test("verificationMode strings OUTSIDE the configuration block are never touched", () => {
    const pre = "# Spec\n\nverificationMode: dedicated-sessions\n\n";
    const post = "\n\n## Notes\n\nverificationMode: out-of-band-or-none\n";
    const input = spec("verificationMode: out-of-band-or-none\n", { pre, post });
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.ok(result.text.startsWith(pre), "prose before the block untouched");
    assert.ok(result.text.endsWith(post), "prose after the block untouched");
    const occurrences = result.text.match(/verificationMode: dedicated-sessions/g) ?? [];
    assert.strictEqual(occurrences.length, 2, "only the block's value flips (plus the pre-existing prose one)");
  });

  test("unknown scalar (typo) parses as effective default and is repaired to the target", () => {
    const input = spec("verificationMode: dedicated\n");
    const toDedicated = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(toDedicated.previousMode, "out-of-band-or-none");
    assert.ok(toDedicated.text.includes("verificationMode: dedicated-sessions"));
    assert.ok(!toDedicated.text.includes("verificationMode: dedicated\n"), "typo'd scalar replaced, not stacked");
  });

  test("typo'd scalar + same-effective-mode target still rewrites — the repair path (S061-S3-V1-002 pattern)", () => {
    // `verificationMode: none` parses as the effective default; picking
    // out-of-band-or-none again must repair the malformed scalar rather
    // than no-op (the command defers the decision to the helper).
    const input = spec("verificationMode: none\n");
    const result = rewriteSpecVerificationMode(input, "out-of-band-or-none");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.outcome, "rewritten");
    assert.strictEqual(result.previousMode, "out-of-band-or-none");
    assert.ok(result.text.includes("verificationMode: out-of-band-or-none\n"));
  });

  test("case-variant valid scalar is already-target (parser lowercases too)", () => {
    const input = spec("verificationMode: DEDICATED-SESSIONS\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.previousMode, "dedicated-sessions");
  });

  test("no Session Set Configuration block → no-config-block, text unchanged", () => {
    const input = "# Spec with no config\n\nverificationMode: out-of-band-or-none\n\n## Sessions\n";
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "no-config-block");
    assert.strictEqual(result.text, input);
  });

  test("does not disturb a tier: line sharing the block (sibling-key isolation)", () => {
    const input = spec("tier: lightweight\nverificationMode: out-of-band-or-none\n");
    const result = rewriteSpecVerificationMode(input, "dedicated-sessions");
    assert.ok(result.text.includes("tier: lightweight\n"), "tier line untouched");
    assert.ok(result.text.includes("verificationMode: dedicated-sessions\n"));
  });
});

suite("verificationModeRewrite — verificationModeRecordExists (D3 durable-record gate)", () => {
  const record = (kind: string, choice: unknown) =>
    JSON.stringify({ entries: [{ kind, choice, timestamp: "2026-06-12T00:00:00Z" }] });

  test("null / undefined / empty text reads as no record (file absent)", () => {
    assert.strictEqual(verificationModeRecordExists(null), false);
    assert.strictEqual(verificationModeRecordExists(undefined), false);
    assert.strictEqual(verificationModeRecordExists(""), false);
  });

  test("a valid verification_mode entry is a record — both modes", () => {
    assert.strictEqual(
      verificationModeRecordExists(record(VERIFICATION_MODE_ENTRY_KIND, "dedicated-sessions")),
      true,
    );
    assert.strictEqual(
      verificationModeRecordExists(record(VERIFICATION_MODE_ENTRY_KIND, "out-of-band-or-none")),
      true,
    );
  });

  test("entries of other kinds are not records (mirrors has_verification_mode_record)", () => {
    assert.strictEqual(
      verificationModeRecordExists(record("suggestion_disposition", "dedicated-sessions")),
      false,
    );
  });

  test("a verification_mode entry with an unrecognized choice is not a record", () => {
    assert.strictEqual(
      verificationModeRecordExists(record(VERIFICATION_MODE_ENTRY_KIND, "yolo")),
      false,
    );
    assert.strictEqual(
      verificationModeRecordExists(record(VERIFICATION_MODE_ENTRY_KIND, undefined)),
      false,
    );
  });

  test("unparseable / shapeless logs read as no record (tolerant, Python parity)", () => {
    assert.strictEqual(verificationModeRecordExists("{not json"), false);
    assert.strictEqual(verificationModeRecordExists("[]"), false);
    assert.strictEqual(verificationModeRecordExists('{"entries": "nope"}'), false);
    assert.strictEqual(verificationModeRecordExists('{"entries": [null, 42]}'), false);
  });

  test("record found anywhere in a mixed entries array", () => {
    const log = JSON.stringify({
      entries: [
        { kind: "step", description: "did a thing" },
        { kind: VERIFICATION_MODE_ENTRY_KIND, choice: "dedicated-sessions" },
        { kind: "step", description: "did another" },
      ],
    });
    assert.strictEqual(verificationModeRecordExists(log), true);
  });

  // Set 062 S3: the blessed transition record counts as a durable mode
  // record (Python parity — has_verification_mode_record gained the
  // same both-kinds recognition; the S3-audit F3 capture-idempotency
  // fix depends on it).
  test("a verification_mode_change entry is a durable record (S3 both-kinds parity)", () => {
    assert.strictEqual(
      verificationModeRecordExists(
        record(VERIFICATION_MODE_CHANGE_ENTRY_KIND, "dedicated-sessions"),
      ),
      true,
    );
  });

  test("a verification_mode_change entry with an unrecognized choice is not a record", () => {
    assert.strictEqual(
      verificationModeRecordExists(record(VERIFICATION_MODE_CHANGE_ENTRY_KIND, "yolo")),
      false,
    );
  });
});

suite("verificationModeRewrite — inspectActivityLog (D3 history gate, S062-S2-V1-001)", () => {
  test("an empty entries array is no-records — a scaffolded log with no history is safe", () => {
    assert.strictEqual(inspectActivityLog(JSON.stringify({ entries: [] })), "no-records");
    assert.strictEqual(
      inspectActivityLog(JSON.stringify({ sessionSetName: "x", totalSessions: 3, entries: [] })),
      "no-records",
    );
  });

  test("ANY entry is has-records — not just verification_mode ones (the locked D3 language)", () => {
    const stepOnly = JSON.stringify({
      entries: [{ sessionNumber: 1, stepKey: "session-001/x", description: "did a thing" }],
    });
    assert.strictEqual(inspectActivityLog(stepOnly), "has-records");
    const modeRecord = JSON.stringify({
      entries: [{ kind: VERIFICATION_MODE_ENTRY_KIND, choice: "dedicated-sessions" }],
    });
    assert.strictEqual(inspectActivityLog(modeRecord), "has-records");
    // Even a shapeless entry counts — presence of history is the signal.
    assert.strictEqual(inspectActivityLog(JSON.stringify({ entries: [42] })), "has-records");
  });

  test("unparseable or shapeless logs are unreadable — the consumer must fail loud, not fail open", () => {
    assert.strictEqual(inspectActivityLog("{not json"), "unreadable");
    assert.strictEqual(inspectActivityLog(""), "unreadable");
    assert.strictEqual(inspectActivityLog("null"), "unreadable");
    assert.strictEqual(inspectActivityLog("[]"), "unreadable");
    assert.strictEqual(inspectActivityLog(JSON.stringify({ noEntriesKey: true })), "unreadable");
    assert.strictEqual(inspectActivityLog(JSON.stringify({ entries: "nope" })), "unreadable");
  });

  test("contrast with the tolerant parity helper: a step-only log blocks the gate but is not a verification_mode record", () => {
    const stepOnly = JSON.stringify({
      entries: [{ sessionNumber: 1, stepKey: "session-001/x", description: "did a thing" }],
    });
    assert.strictEqual(inspectActivityLog(stepOnly), "has-records");
    assert.strictEqual(verificationModeRecordExists(stepOnly), false);
  });
});
