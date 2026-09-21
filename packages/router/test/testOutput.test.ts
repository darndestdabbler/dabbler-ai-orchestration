// What a suite's own output says happened, read from REAL output.
//
// Every fixture line below was printed by `dotnet test` or by Maven on the
// operator's machine on 2026-09-21 -- the passing .NET run is the csv-parser
// sample's own run of record, the rest are that sample with one assertion
// broken. Lines are dropped, never reworded; one long scratch path is
// shortened to `C:\s`. A reader that passed only on lines somebody typed
// from memory would be a reader of that person's memory.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dotnetReader, mavenReader, readerFor, said, type TestEvent } from "../src/testOutput.ts";

function read(reader: (line: string) => TestEvent[], output: string): TestEvent[] {
  return output.split("\n").flatMap((line) => reader(line));
}

const DOTNET_PASSING = String.raw`running dotnet: dotnet test --blame-hang-timeout 5m
  Determining projects to restore...
  All projects are up-to-date for restore.
  CsvParser.Model -> D:\Projects\csv-parser\src\CsvParser.Model\bin\Debug\net10.0\CsvParser.Model.dll
  CsvParser.Model.Tests -> D:\Projects\csv-parser\tests\CsvParser.Model.Tests\bin\Debug\net10.0\CsvParser.Model.Tests.dll
Test run for D:\Projects\csv-parser\tests\CsvParser.Model.Tests\bin\Debug\net10.0\CsvParser.Model.Tests.dll (.NETCoreApp,Version=v10.0)
  CsvParser.ConsoleApp -> D:\Projects\csv-parser\src\CsvParser.ConsoleApp\bin\Debug\net10.0\CsvParser.ConsoleApp.dll
Test run for D:\Projects\csv-parser\tests\CsvParser.ConsoleApp.Tests\bin\Debug\net10.0\CsvParser.ConsoleApp.Tests.dll (.NETCoreApp,Version=v10.0)
A total of 1 test files matched the specified pattern.
A total of 1 test files matched the specified pattern.
No test is available in D:\Projects\csv-parser\tests\CsvParser.Model.Tests\bin\Debug\net10.0\CsvParser.Model.Tests.dll. Make sure that test discoverer & executors are registered and platform & framework version settings are appropriate and try again.
Data collector 'Blame' message: All tests finished running, Sequence file will not be generated.

Additionally, path to test adapters can be specified using /TestAdapterPath command. Example  /TestAdapterPath:<pathToCustomAdapters>.

Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5, Duration: 30 ms - CsvParser.ConsoleApp.Tests.dll (net10.0)
`;

const DOTNET_FAILING = String.raw`Test run for C:\s\dn\tests\Spec.A.Tests\bin\Debug\net11.0\Spec.A.Tests.dll (.NETCoreApp,Version=v11.0)
Test run for C:\s\dn\tests\Spec.B.Tests\bin\Debug\net11.0\Spec.B.Tests.dll (.NETCoreApp,Version=v11.0)
A total of 1 test files matched the specified pattern.A total of 1 test files matched the specified pattern.
[xUnit.net 00:00:00.57]     Spec.B.Tests.PersistenceTests.IsSkipped [SKIP]
[xUnit.net 00:00:00.63]     Spec.B.Tests.PersistenceTests.Throws_WhenTheFileIsMissing [FAIL]
[xUnit.net 00:00:00.63]     Spec.B.Tests.PersistenceTests.SavesAPerson_ThenReadsItBack [FAIL]

Passed!  - Failed:     0, Passed:     1, Skipped:     0, Total:     1, Duration: 2 ms - Spec.A.Tests.dll (net11.0)
  Skipped Spec.B.Tests.PersistenceTests.IsSkipped [1 ms]
  Failed Spec.B.Tests.PersistenceTests.Throws_WhenTheFileIsMissing [< 1 ms]
  Error Message:
   System.InvalidOperationException : no such file
  Stack Trace:
     at Spec.B.Tests.PersistenceTests.Throws_WhenTheFileIsMissing() in C:\s\dn\tests\Spec.B.Tests\UnitTest1.cs:line 9
  Failed Spec.B.Tests.PersistenceTests.SavesAPerson_ThenReadsItBack [3 ms]
  Error Message:
   Assert.Equal() Failure: Values differ
Expected: 1
Actual:   0
  Stack Trace:
     at Spec.B.Tests.PersistenceTests.SavesAPerson_ThenReadsItBack() in C:\s\dn\tests\Spec.B.Tests\UnitTest1.cs:line 6

Failed!  - Failed:     2, Passed:     1, Skipped:     1, Total:     4, Duration: 78 ms - Spec.B.Tests.dll (net11.0)
`;

const MAVEN_PASSING = `running maven: mvn -B verify -DforkedProcessTimeoutInSeconds=300
[INFO] Scanning for projects...
[INFO] --- compiler:3.10.1:testCompile (default-testCompile) @ person-model ---
[INFO] --- surefire:3.2.5:test (default-test) @ person-model ---
[INFO] Using auto detected provider org.apache.maven.surefire.junitplatform.JUnitPlatformProvider
[INFO] Running com.example.csvparser.model.PersonTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.039 s -- in com.example.csvparser.model.PersonTest
[INFO]
[INFO] Results:
[INFO]
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
[INFO]
[INFO] --- surefire:3.2.5:test (default-test) @ csv-deserializer ---
[INFO] No tests to run.
[INFO]
[INFO] --- jar:3.3.0:jar (default-jar) @ csv-deserializer ---
[WARNING] JAR will be empty - no content was marked for inclusion!
[INFO] BUILD SUCCESS
`;

const MAVEN_FAILING = `[INFO] --- surefire:3.2.5:test (default-test) @ person-model ---
[INFO] Running com.example.csvparser.model.PersonTest
[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.048 s <<< FAILURE! -- in com.example.csvparser.model.PersonTest
[ERROR] com.example.csvparser.model.PersonTest.exposesTheSuppliedFields -- Time elapsed: 0.005 s <<< FAILURE!
org.opentest4j.AssertionFailedError: expected: <Grace> but was: <Ada>
\tat com.example.csvparser.model.PersonTest.exposesTheSuppliedFields(PersonTest.java:13)

[INFO]
[INFO] Results:
[INFO]
[ERROR] Failures:
[ERROR]   PersonTest.exposesTheSuppliedFields:13 expected: <Grace> but was: <Ada>
[INFO]
[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0
[INFO]
[INFO] BUILD FAILURE
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.2.5:test (default-test) on project person-model: There are test failures.
[ERROR]   mvn <args> -rf :person-model
`;

describe("what `dotnet test` said", () => {
  it("is each project's start, its result by name, and a project that found no tests -- and nothing else", () => {
    assert.deepEqual(read(dotnetReader(), DOTNET_PASSING), [
      { kind: "started", project: "CsvParser.Model.Tests" },
      { kind: "started", project: "CsvParser.ConsoleApp.Tests" },
      { kind: "none", project: "CsvParser.Model.Tests" },
      { kind: "result", project: "CsvParser.ConsoleApp.Tests", passed: 5, failed: 0, notRun: 0 },
    ]);
  });

  it("names each failing test with the first line of its message, among projects that ran side by side", () => {
    assert.deepEqual(read(dotnetReader(), DOTNET_FAILING), [
      { kind: "started", project: "Spec.A.Tests" },
      { kind: "started", project: "Spec.B.Tests" },
      { kind: "result", project: "Spec.A.Tests", passed: 1, failed: 0, notRun: 0 },
      {
        kind: "failure",
        test: "Spec.B.Tests.PersistenceTests.Throws_WhenTheFileIsMissing",
        message: "System.InvalidOperationException : no such file",
      },
      {
        kind: "failure",
        test: "Spec.B.Tests.PersistenceTests.SavesAPerson_ThenReadsItBack",
        message: "Assert.Equal() Failure: Values differ",
      },
      { kind: "result", project: "Spec.B.Tests", passed: 1, failed: 2, notRun: 1 },
    ]);
  });

  it("reads a result that another project's line was glued in front of", () => {
    const glued =
      "A total of 1 test files matched the specified pattern.Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 9 ms - CsvParser.Persistence.Tests.dll (net10.0)";
    assert.deepEqual(dotnetReader()(glued), [
      { kind: "result", project: "CsvParser.Persistence.Tests", passed: 7, failed: 0, notRun: 0 },
    ]);
  });
});

describe("what Maven Surefire said", () => {
  it("is each module's total and not each class's, and a module with no tests", () => {
    assert.deepEqual(read(mavenReader(), MAVEN_PASSING), [
      { kind: "started", project: "person-model" },
      { kind: "result", project: "person-model", passed: 3, failed: 0, notRun: 0 },
      { kind: "started", project: "csv-deserializer" },
      { kind: "none", project: "csv-deserializer" },
    ]);
  });

  it("names a failing test from the results list, and none of the build's own errors after it", () => {
    assert.deepEqual(read(mavenReader(), MAVEN_FAILING), [
      { kind: "started", project: "person-model" },
      { kind: "failure", test: "PersonTest.exposesTheSuppliedFields", message: "expected: <Grace> but was: <Ada>" },
      { kind: "result", project: "person-model", passed: 2, failed: 1, notRun: 0 },
    ]);
  });
});

describe("which reader a suite's command gets", () => {
  it("is the runner the command names, and none for any other", () => {
    // Read through the reader it returns: a line only that runner prints.
    const dotnet = "Passed!  - Failed:     0, Passed:     1, Skipped:     0, Total:     1, Duration: 2 ms - A.dll (net10.0)";
    const maven = "[INFO] --- surefire:3.2.5:test (default-test) @ a ---";
    assert.equal(readerFor("dotnet test --blame-hang-timeout 5m")?.(dotnet).length, 1);
    assert.equal(readerFor("mvn -B verify -DforkedProcessTimeoutInSeconds=300")?.(maven).length, 1);
    assert.equal(readerFor(".\\mvnw.cmd -B verify")?.(maven).length, 1);
    assert.equal(readerFor("node scripts/suite.mjs container"), null);
    assert.equal(readerFor("dotnet build"), null);
    assert.equal(readerFor("npm test"), null);
  });
});

describe("how an event is said", () => {
  it("is passed or failed by the failures it counted, and no tests is neither", () => {
    assert.deepEqual(said({ kind: "result", project: "A", passed: 5, failed: 0, notRun: 1 }), {
      event: "project-passed",
      fields: { project: "A", pass: 5, fail: 0, not_run: 1 },
    });
    assert.equal(said({ kind: "result", project: "A", passed: 5, failed: 2, notRun: 0 }).event, "project-failed");
    assert.equal(said({ kind: "none", project: "A" }).event, "project-no-tests");
    assert.deepEqual(said({ kind: "failure", test: "A.b", message: "" }).fields, { test: "A.b" });
  });
});
