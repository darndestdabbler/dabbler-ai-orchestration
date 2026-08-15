// Set 113 S3 remediation — a step expectation must WAIT, not snapshot.
//
// Found by cross-provider verification, and it is the defect that would
// have made the recorder's whole cross-cutting claim false. The bundled
// fixture updates synchronously, so reading the page once immediately
// after a click happens to work against it — and would have kept working
// forever, on the one target that was never the point. The applications
// this recorder advertises (.NET, Java, Python, SPA front ends) update
// after a round trip: `page.click()` returns first, a single read observes
// the PREVIOUS value, and the step is marked failed while the expected UI
// appears moments later.
//
// So the fixture cannot prove this fix. This spec plants the delay the
// fixture does not have, and asserts both halves (L-112-1): the wait
// succeeds across an asynchronous update, and it still FAILS — with a
// message naming what was actually on screen — when the text genuinely
// never arrives.
//
// Browser-only. It launches no VS Code and records nothing: the spec's
// non-goals refuse CI recording, and this tests the waiting, not the video.

import { test, expect } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const recorder = require("../../../scripts/record-web-walkthrough.js") as {
  assertExpectation: (
    page: unknown,
    expectation: { selector: string; text?: string },
    timeoutMs?: number,
  ) => Promise<void>;
  EXPECT_TIMEOUT_MS: number;
};

/** A page whose summary line updates only after `delayMs`. */
const DELAYED_PAGE = (delayMs: number, finalText: string) => `
  <!doctype html><meta charset="utf-8">
  <p id="summary">0 open</p>
  <button id="go">Add</button>
  <script>
    document.getElementById('go').addEventListener('click', function () {
      setTimeout(function () {
        document.getElementById('summary').textContent = ${JSON.stringify(
          finalText,
        )};
      }, ${delayMs});
    });
  </script>`;

test("an expectation waits across an asynchronous update", async ({ page }) => {
  await page.setContent(DELAYED_PAGE(900, "1 open"));
  await page.click("#go");

  // The value is still the OLD one at this instant: this is exactly the
  // moment a single textContent() read would have sampled and failed on.
  expect(await page.textContent("#summary")).toBe("0 open");

  await recorder.assertExpectation(page, { selector: "#summary", text: "1 open" }, 5_000);
});

test("a single snapshot would have failed on that same page", async ({ page }) => {
  // The control. Without the wait the recorder read once, right here.
  await page.setContent(DELAYED_PAGE(900, "1 open"));
  await page.click("#go");
  const snapshot = (await page.textContent("#summary")) || "";
  expect(snapshot.includes("1 open")).toBe(false);
});

test("an expectation that never comes true still fails, and says what it saw", async ({
  page,
}) => {
  await page.setContent(DELAYED_PAGE(50, "1 open"));
  await page.click("#go");

  let message = "";
  try {
    await recorder.assertExpectation(
      page,
      { selector: "#summary", text: "99 open" },
      1_000,
    );
  } catch (err) {
    message = String((err as Error).message);
  }
  expect(message).toContain('expected to read "99 open"');
  // What was actually on screen, which is what a person reading the run
  // manifest needs in order to act.
  expect(message).toContain("1 open");
});

test("a missing element fails as a missing element", async ({ page }) => {
  await page.setContent(DELAYED_PAGE(50, "1 open"));
  let message = "";
  try {
    await recorder.assertExpectation(page, { selector: "#nope" }, 1_000);
  } catch (err) {
    message = String((err as Error).message);
  }
  expect(message).toContain("never became visible");
});

test("the shipped timeout is a real budget, not a pacing knob", () => {
  // Long enough for a server round trip on a loaded machine. If this ever
  // shrinks to something step-shaped, the wait has quietly turned back
  // into a snapshot with extra steps.
  expect(recorder.EXPECT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
});
