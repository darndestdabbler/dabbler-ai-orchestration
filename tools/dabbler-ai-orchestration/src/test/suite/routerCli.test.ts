// Set 122 Session 2 — the router-CLI launcher, and the promise that the
// command a developer SEES is the command that RAN.
//
// The echo is not decoration. The operator's requirement (2026-08-11) is
// that commands are "echoed… so developers know what commands are being
// executed", and the git-transparency proposal's standing decision is that
// Dabbler runs the command it derived rather than asking a human or an LLM
// to. Both collapse to one testable claim: **select the line, paste it,
// get the same result.**
//
// Verification round 1 returned two Majors against exactly that claim — a
// `> ` prompt glyph welded onto the command, and PowerShell quoting that
// would not run. Both are pinned here.

import * as assert from "assert";
import {
  RouterCliEcho,
  buildArgv,
  buildCommandLine,
  classify,
  parseJsonPayload,
  quoteForDisplay,
  runRouterCli,
} from "../../utils/routerCli";

function recordingEcho(): RouterCliEcho & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    append: (line) => lines.push(line),
    reveal: () => undefined,
  };
}

const WINDOWS_VENV = "C:\\Users\\Some One\\repo\\.venv\\Scripts\\python.exe";

suite("routerCli — the echoed command is the command", () => {
  test("the command occupies a bare line of its own, with no prompt glyph", async () => {
    // Round 1, Major 2. A `> ` prefix means the copied text is a shell
    // redirection, not the command. The label may exist; it may not share
    // the line.
    const echo = recordingEcho();
    await runRouterCli(
      {
        module: "ai_router.modules",
        args: ["--json", "create", "--slug", "greeter"],
        cwd: "C:\\repo",
        actionLabel: "Creating a module",
      },
      {
        echo,
        resolveInterpreter: () => "python",
        interpreterExists: () => false, // stop before spawning; the echo already happened
      },
    );

    const expected = buildCommandLine("python", {
      module: "ai_router.modules",
      args: ["--json", "create", "--slug", "greeter"],
    });
    assert.ok(
      echo.lines.includes(expected),
      `no line equals the command exactly; got:\n${echo.lines.join("\n")}`,
    );
    for (const line of echo.lines) {
      assert.ok(
        !/^\s*[>$#]\s/.test(line),
        `line carries a prompt glyph, so copying it copies the glyph: ${line}`,
      );
    }
  });

  test("the echo happens even when the interpreter cannot be found", async () => {
    // A line printed only on success is not transparency — the case a
    // developer most needs to see the command is the case where it did not
    // run.
    const echo = recordingEcho();
    const result = await runRouterCli(
      {
        module: "ai_router.modules",
        args: ["--json", "delete", "--slug", "greeter"],
        cwd: "C:\\repo",
        actionLabel: "Deleting a module",
      },
      {
        echo,
        resolveInterpreter: () => "definitely-not-python",
        interpreterExists: () => false,
      },
    );
    assert.strictEqual(result.outcome, "unavailable");
    assert.ok(echo.lines.includes(result.commandLine));
  });

  test("a quoted interpreter path is prefixed with PowerShell's call operator", () => {
    // Round 1, Major 1. PowerShell parses a leading quoted token as a
    // STRING, not a command: without `&`, pasting the line prints the path
    // and runs nothing. Paths with spaces are the common Windows case.
    const line = buildCommandLine(WINDOWS_VENV, {
      module: "ai_router.modules",
      args: ["--json", "create", "--slug", "greeter"],
    });
    assert.ok(
      line.startsWith('& "'),
      `a quoted exe must be invoked with &; got: ${line}`,
    );
  });

  test("an unquoted interpreter gets no call operator", () => {
    // `& python -m ...` is valid but noise. The operator asked for a
    // command they can read, so the escape hatch appears only when it is
    // load-bearing.
    const line = buildCommandLine("python", {
      module: "ai_router.modules",
      args: ["--json", "delete", "--slug", "greeter"],
    });
    assert.ok(!line.startsWith("&"), line);
    assert.strictEqual(line, "python -m ai_router.modules --json delete --slug greeter");
  });

  test("quoting escapes PowerShell's specials with a BACKTICK, never a backslash", () => {
    // The POSIX habit (`\"`) is wrong here twice over: PowerShell does not
    // treat `\` as an escape inside double quotes, and Windows paths end in
    // a backslash often enough that `"C:\dir\"` would swallow the closing
    // quote.
    assert.strictEqual(quoteForDisplay('a "b" c'), '"a `"b`" c"');
    assert.strictEqual(quoteForDisplay("cost $5 each"), '"cost `$5 each"');
    assert.strictEqual(quoteForDisplay("tick ` here"), '"tick `` here"');
    // A trailing backslash must NOT be escaped into an unterminated string.
    assert.strictEqual(quoteForDisplay("C:\\a dir\\"), '"C:\\a dir\\"');
  });

  test("a value needing no quoting is shown verbatim", () => {
    assert.strictEqual(quoteForDisplay("--slug"), "--slug");
    assert.strictEqual(quoteForDisplay("payment-api"), "payment-api");
    assert.strictEqual(quoteForDisplay(""), '""');
  });

  test("the displayed line and the spawned argv carry the SAME values", () => {
    // The two are built from one input, but "built from one input" is not
    // the claim that matters — the claim is that a developer reading the
    // line and the process that ran received the same arguments. Asserted
    // by stripping the display quoting back off.
    const invocation = {
      module: "ai_router.modules",
      args: [
        "--repo-root",
        "C:\\Users\\Some One\\repo",
        "--json",
        "create",
        "--slug",
        "greeter",
        "--title",
        'The "Greeter"',
      ],
    };
    const argv = buildArgv(invocation);
    const line = buildCommandLine(WINDOWS_VENV, invocation);

    const unquote = (token: string): string =>
      token.startsWith('"') && token.endsWith('"')
        ? token.slice(1, -1).replace(/`(["`$])/g, "$1")
        : token;
    // Split on spaces that are not inside double quotes.
    const tokens = (line.match(/"(?:[^"`]|`.)*"|\S+/g) ?? []).map(unquote);
    const shown = tokens[0] === "&" ? tokens.slice(1) : tokens;

    assert.strictEqual(shown[0], WINDOWS_VENV, "the interpreter shown is the one spawned");
    assert.deepStrictEqual(
      shown.slice(1),
      argv,
      "every displayed argument must equal the spawned argument",
    );
  });
});

suite("routerCli — result classification", () => {
  test("exit 3 is a refusal carrying the CLI's own reason", () => {
    const c = classify(3, { refused: 'Module "x" already exists.' }, "", "");
    assert.strictEqual(c.outcome, "refused");
    assert.strictEqual(c.ok, false);
    assert.strictEqual(c.message, 'Module "x" already exists.');
  });

  test("exit 4 is a write failure carrying the CLI's own reason", () => {
    const c = classify(4, { writeFailed: "manifest write failed" }, "", "");
    assert.strictEqual(c.outcome, "writeFailed");
    assert.strictEqual(c.message, "manifest write failed");
  });

  test("a non-zero exit can never classify as ok", () => {
    // The falsifier for the one mistake that would silently discard a
    // refusal: reporting success on a failed call.
    for (const code of [1, 2, 3, 4, 5, 127, null]) {
      const c = classify(code, undefined, "some output", "some error");
      assert.strictEqual(c.ok, false, `exit ${code} must not be ok`);
      assert.notStrictEqual(c.outcome, "ok");
      assert.ok(c.message.length > 0, `exit ${code} must carry an explanation`);
    }
    assert.strictEqual(classify(0, undefined, "done", "").ok, true);
  });

  test("an unparseable payload falls back to the process output", () => {
    const c = classify(3, undefined, "", "Refused: nope");
    assert.strictEqual(c.outcome, "refused");
    assert.ok(c.message.includes("nope"));
  });

  test("the JSON payload is located, not assumed to start at byte 0", () => {
    // `python -m` can emit a RuntimeWarning banner ahead of real output.
    const payload = parseJsonPayload(
      '<frozen runpy>:130: RuntimeWarning: blah\n{"ok": true, "slug": "x"}\n',
    );
    assert.strictEqual(payload?.["slug"], "x");
    assert.strictEqual(parseJsonPayload("not json at all"), undefined);
    assert.strictEqual(parseJsonPayload(""), undefined);
  });
});
