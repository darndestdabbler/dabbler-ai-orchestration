// What a suite's own output says happened, one test project at a time.
//
// Two runners are read and no third: `dotnet test` (the VSTest console) and
// Maven Surefire. A reader is a VIEW. It never decides an outcome -- the
// suite's exit code does -- so a line it does not know is no event and never
// an error, and a run in which it recognised nothing is shown as the suite
// wrote it.
//
// Events are said in the order their lines arrive and nothing is held back
// to pair a project's start with its result: `dotnet test` runs projects in
// parallel, and a reader that buffered would make a hung project look like
// silence.

/** One thing a suite's output said. */
export type TestEvent =
  | { readonly kind: "started"; readonly project: string }
  | {
      readonly kind: "result";
      readonly project: string;
      readonly passed: number;
      readonly failed: number;
      readonly notRun: number;
    }
  | { readonly kind: "none"; readonly project: string }
  | { readonly kind: "failure"; readonly test: string; readonly message: string };

/** Reads one line; most lines say nothing. Holds what a later line needs of an earlier one. */
export type TestOutputReader = (line: string) => TestEvent[];

const DOTNET_COMMAND = /(^|[\s"'\\/])dotnet(\.exe)?["']?\s+test\b/i;
const MAVEN_COMMAND = /(^|[\s"'\\/])mvnw?(\.cmd|\.bat)?["']?(\s|$)/i;

/** The reader for what this command runs, or null where neither runner is named. */
export function readerFor(command: string): TestOutputReader | null {
  if (DOTNET_COMMAND.test(command)) return dotnetReader();
  if (MAVEN_COMMAND.test(command)) return mavenReader();
  return null;
}

// --- dotnet test ---------------------------------------------------------------

// Not anchored to the start of a line: projects run in parallel and share one
// stream, and two writers' lines arrive glued together often enough to matter.

const DOTNET_STARTED = /Test run for .*?([^\\/]+)\.dll \(/;
const DOTNET_NONE = /No test is available in .*?([^\\/]+)\.dll\./;
const DOTNET_RESULT =
  /(?:Passed|Failed|Skipped)!\s+-\s+Failed:\s*(\d+),\s+Passed:\s*(\d+),\s+Skipped:\s*(\d+),\s+Total:\s*\d+.* - ([^\\/\s]+)\.dll\b/;
const DOTNET_FAILED_TEST = /^\s+Failed (\S+) \[/;
const DOTNET_MESSAGE_HEAD = /^\s+Error Message:\s*$/;

/**
 * The VSTest console's lines. A failing test is two lines apart from its
 * message -- `Failed <test> [..]`, `Error Message:`, then the message -- so
 * the test is held until the message arrives, and said without one if
 * anything else arrives first.
 */
export function dotnetReader(): TestOutputReader {
  let failing: string | null = null;
  let messageNext = false;
  return (line) => {
    const events: TestEvent[] = [];
    if (failing !== null && messageNext) {
      events.push({ kind: "failure", test: failing, message: line.trim() });
      failing = null;
      messageNext = false;
      return events;
    }
    if (failing !== null && DOTNET_MESSAGE_HEAD.test(line)) {
      messageNext = true;
      return events;
    }
    if (failing !== null) {
      events.push({ kind: "failure", test: failing, message: "" });
      failing = null;
    }
    const failed = DOTNET_FAILED_TEST.exec(line);
    if (failed !== null) {
      failing = failed[1] as string;
      return events;
    }
    const started = DOTNET_STARTED.exec(line);
    if (started !== null) events.push({ kind: "started", project: started[1] as string });
    const none = DOTNET_NONE.exec(line);
    if (none !== null) events.push({ kind: "none", project: none[1] as string });
    const result = DOTNET_RESULT.exec(line);
    if (result !== null) {
      events.push({
        kind: "result",
        project: result[4] as string,
        failed: Number(result[1]),
        passed: Number(result[2]),
        notRun: Number(result[3]),
      });
    }
    return events;
  };
}

// --- Maven Surefire --------------------------------------------------------------

const MAVEN_STARTED = /^\[INFO\] --- (?:maven-)?(?:surefire|failsafe)(?:-plugin)?:[^ ]+:(?:test|integration-test) .*@ (\S+) ---/;
const MAVEN_NONE = /^\[INFO\] No tests to run\./;
const MAVEN_RESULTS_HEAD = /^\[(?:INFO|ERROR|WARNING)\] Results:/;
/** The module's own total. A class's line carries `Time elapsed` and ends `-- in <class>`. */
const MAVEN_TOTAL = /^\[(?:INFO|ERROR|WARNING)\] Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)\s*$/;
const MAVEN_FAILED_TEST = /^\[ERROR\] {3}(\S+?)(?::\d+)? (.+)$/;

/**
 * Surefire's lines, one module at a time: the plugin's banner names the
 * module, `Results:` opens the list of what failed, and the total closes it.
 * A failure and an error are both a test that did not pass.
 */
export function mavenReader(): TestOutputReader {
  let project: string | null = null;
  let inResults = false;
  return (line) => {
    const started = MAVEN_STARTED.exec(line);
    if (started !== null) {
      project = started[1] as string;
      inResults = false;
      return [{ kind: "started", project }];
    }
    if (project === null) return [];
    if (MAVEN_NONE.test(line)) {
      const events: TestEvent[] = [{ kind: "none", project }];
      project = null;
      return events;
    }
    if (MAVEN_RESULTS_HEAD.test(line)) {
      inResults = true;
      return [];
    }
    const total = MAVEN_TOTAL.exec(line);
    if (total !== null) {
      const [run, failures, errors, skipped] = [total[1], total[2], total[3], total[4]].map(Number) as [
        number,
        number,
        number,
        number,
      ];
      const events: TestEvent[] = [
        { kind: "result", project, passed: run - failures - errors - skipped, failed: failures + errors, notRun: skipped },
      ];
      project = null;
      inResults = false;
      return events;
    }
    const failed = inResults ? MAVEN_FAILED_TEST.exec(line) : null;
    return failed === null ? [] : [{ kind: "failure", test: failed[1] as string, message: failed[2] as string }];
  };
}

// --- saying an event ----------------------------------------------------------------

/** An event as the router says one: its name, and its `key=value` fields in order. */
export interface SaidEvent {
  readonly event: string;
  readonly fields: Readonly<Record<string, string | number>>;
}

export const TESTS_RUNNING = "project-running";
export const TESTS_PASSED = "project-passed";
export const TESTS_FAILED = "project-failed";
export const TESTS_NONE = "project-no-tests";
export const TEST_FAILURE = "test-failed";

/**
 * A project that ran nothing is not a project that passed: it is its own
 * event, so three empty projects beside one green one do not read as four.
 */
export function said(event: TestEvent): SaidEvent {
  switch (event.kind) {
    case "started":
      return { event: TESTS_RUNNING, fields: { project: event.project } };
    case "none":
      return { event: TESTS_NONE, fields: { project: event.project } };
    case "failure":
      return { event: TEST_FAILURE, fields: { test: event.test, ...(event.message ? { message: event.message } : {}) } };
    case "result":
      return {
        event: event.failed > 0 ? TESTS_FAILED : TESTS_PASSED,
        fields: { project: event.project, pass: event.passed, fail: event.failed, not_run: event.notRun },
      };
  }
}
