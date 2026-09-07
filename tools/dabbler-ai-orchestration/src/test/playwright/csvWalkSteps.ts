// The operator's walk through the multi-module CSV solution, as ONE list.
//
// csv-module-walk.spec.ts drives this list and
// docs/tutorials/csv-solution/csv-multi-module-walkthrough.md is rendered
// from it (by scripts/render-csv-walkthrough.mjs), so a step cannot be
// automated one way and documented another. That is the whole reason the
// list exists as data rather than as a sequence of `test(...)` calls: a
// walkthrough whose prose is maintained separately from its automation is a
// walkthrough that is wrong within two sessions.
//
// Each step says three things:
//
//   operator   what the person does, in the imperative, copy-pasteable
//   expect     what they should see afterwards, in their words
//   drive      how the browser does the same thing, and what it asserts
//
// `expect` is not decoration. It is rendered into the tutorial as the thing
// to check, AND it is what `drive` asserts, so the sentence a reader is
// told to trust is the sentence the suite proves.
//
// electronLaunch.ts is imported LAZILY, inside each `drive()` body, rather
// than at the top of this file. It is written for Playwright's CJS-style
// interop (`require`, `__dirname`), which does not exist under plain ESM;
// the generator that renders the tutorial (scripts/render-csv-walkthrough.mjs)
// loads THIS module with Node's native ESM loader and reads only `operator`,
// `expect`, `title` and `id` off each step -- it never calls `drive()` -- so
// a static top-level import here would fail a load that has no reason to
// need it at all.

import type { Locator, Page } from "@playwright/test";

export interface WalkContext {
  readonly page: Page;
  /** The Dabbler container's panes, by the view name VS Code renders. */
  paneOf(view: "Solution Explorer" | "Work Explorer"): Promise<Locator>;
  /** Capture the window under this name, alongside the step it belongs to. */
  shoot(name: string): Promise<void>;
  /** Record one expectation's outcome; a failed one fails the spec. */
  check(name: string, ok: boolean, saw: string): void;
}

export interface WalkStep {
  readonly id: string;
  readonly title: string;
  readonly operator: readonly string[];
  readonly expect: readonly string[];
  drive(ctx: WalkContext): Promise<void>;
}

/** electronLaunch.ts's browser-driving exports, loaded only when a step actually drives one. */
async function browser() {
  return import("./electronLaunch.ts");
}

/** The module slugs the staged manifest declares, in dependency order. */
export const MODULES = ["model", "deserializer", "persister", "app"] as const;

/** The planned sessions, one per module, as the corpus declares them. */
export const PLANNED_SESSIONS = [
  "001 · The Person model",
  "002 · Reading a CSV file",
  "003 · Storing a person",
  "004 · The watcher",
] as const;

export const WALK_STEPS: readonly WalkStep[] = [
  {
    id: "open-the-solution",
    title: "Open the solution",
    operator: [
      "Open the CSV solution folder in VS Code.",
      "Click the **AI Orchestration** icon in the activity bar.",
    ],
    expect: [
      "Two panes appear: **Solution Explorer** and **Work Explorer**.",
      "The Solution Explorer names the repository and says **4 modules**.",
    ],
    async drive(ctx) {
      const { openDabblerContainer, rowTexts } = await browser();
      await openDabblerContainer(ctx.page);
      const solution = await ctx.paneOf("Solution Explorer");
      await solution
        .locator(".monaco-list-row")
        .first()
        .waitFor({ state: "visible", timeout: 60_000 });
      const rows = await rowTexts(solution);
      ctx.check(
        "the repository row counts four modules",
        rows.some((r) => /4 modules/.test(r)),
        rows[0] ?? "no rows",
      );
      await ctx.shoot("01-solution-opened");
    },
  },

  {
    id: "read-the-decomposition",
    title: "Read what the solution is built from",
    operator: [
      "Collapse the Work Explorer and expand the Solution Explorer's repository row, then expand each module.",
    ],
    expect: [
      "Four modules: **model**, **deserializer**, **persister** and **app**.",
      "`model` is a **shared-types** module and is **used by 3** siblings — every other module references the `Person` type.",
      "`deserializer` and `persister` each depend on the model and are used by `app`.",
      "Each module names the package its siblings restore: `CsvModel`, `CsvDeserializer`, `CsvPersister`, `CsvWatcher`.",
    ],
    async drive(ctx) {
      const { expandAllRows, rowTexts, setPaneExpanded } = await browser();
      // The Work Explorer is collapsed for this shot so the whole module
      // tree fits in one viewport -- a virtualized list only renders the
      // rows on screen, so "all four modules" is a statement about layout
      // as much as about data.
      await setPaneExpanded(ctx.page, "Work Explorer", false);
      const solution = await ctx.paneOf("Solution Explorer");
      await expandAllRows(solution);
      const rows = await rowTexts(solution);
      for (const slug of MODULES) {
        ctx.check(
          `the ${slug} module is listed`,
          rows.some((r) => r.startsWith(slug)),
          rows.find((r) => r.startsWith(slug)) ?? "absent",
        );
      }
      ctx.check(
        "the model is used by its three siblings",
        rows.some((r) => /^Used by\s*3$/.test(r)),
        rows.filter((r) => r.startsWith("Used by")).join(" | ") || "no Used by row",
      );
      ctx.check(
        "each module names its package",
        ["CsvModel", "CsvDeserializer", "CsvPersister", "CsvWatcher"].every((p) =>
          rows.some((r) => r.includes(p)),
        ),
        rows.filter((r) => /Csv/.test(r)).join(" | "),
      );
      await ctx.shoot("02-decomposition");
    },
  },

  {
    id: "read-the-work",
    title: "Read what work is planned",
    operator: [
      "Collapse the Solution Explorer and expand the **Work Explorer**.",
      "Expand the repository row, then the **Not Started** bucket.",
    ],
    expect: [
      "The repository shows **0/4** — none of the four sessions has run.",
      "The sessions are grouped **by module**, one session per module.",
      "Each session's title says what that module is for.",
    ],
    async drive(ctx) {
      const { expandAllRows, rowTexts, setPaneExpanded } = await browser();
      await setPaneExpanded(ctx.page, "Solution Explorer", false);
      const work = await ctx.paneOf("Work Explorer");
      await work
        .locator(".monaco-list-row")
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });
      await expandAllRows(work);
      const rows = await rowTexts(work);
      ctx.check(
        "no session has run yet",
        rows.some((r) => /0\/4/.test(r)),
        rows[0] ?? "no rows",
      );
      ctx.check(
        "the sessions are grouped by module",
        MODULES.slice(0, 3).every((m) => rows.some((r) => new RegExp(`^${m}\\s*\\d`).test(r))),
        rows.join(" | "),
      );
      ctx.check(
        "the four planned sessions are listed",
        PLANNED_SESSIONS.every((title) => rows.some((r) => r.includes(title.slice(6)))),
        rows.join(" | "),
      );
      await ctx.shoot("03-work-planned");
    },
  },

  {
    id: "the-two-terminals",
    title: "Open the two terminals",
    operator: [
      "Open a terminal in the editor area and start your AI CLI in it.",
      "Run **Dabbler: Show Framework Terminal** from the command palette.",
    ],
    expect: [
      "Two editor tabs side by side: the **AI CLI on the left**, the **Dabbler terminal on the right**.",
      "This is the default. `dabbler.terminalLocation` is `editor`, which puts the CLI in the first editor column and the framework terminal beside it. Set it to `panel` if you would rather they were panel terminals.",
      "The Dabbler terminal prints the framework's own work, and nothing the CLI says.",
    ],
    async drive(ctx) {
      const { runCommand } = await browser();
      // The CLI is opened IDLE and never handed a prompt. The claim under
      // test is where the tabs sit; sending a prompt would start a paid
      // session that has nothing to do with the layout.
      await runCommand(ctx.page, ">Terminal: Create New Terminal in Editor Area", 4_000);
      const opened = (await ctx.page.locator(".tabs-container .tab").count()) > 0;
      if (opened) {
        await ctx.page.keyboard.type("claude");
        await ctx.page.keyboard.press("Enter");
        await ctx.page.waitForTimeout(12_000);
      }
      await runCommand(ctx.page, ">Dabbler: Show Framework Terminal", 3_000);

      const tabs = await ctx.page
        .locator(".tabs-container .tab")
        .evaluateAll((elements) => elements.map((e) => (e.getAttribute("aria-label") || "").trim()));
      const groups = await ctx.page.locator(".editor-group-container").count();

      ctx.check("the terminals open as two editor groups", groups >= 2, String(groups));
      ctx.check(
        "the Dabbler terminal is an editor tab",
        tabs.some((t) => /Dabbler/i.test(t)),
        tabs.join(" | ") || "no tabs",
      );
      ctx.check(
        "the AI CLI is the other editor tab",
        tabs.some((t) => t.length > 0 && !/Dabbler/i.test(t)),
        tabs.join(" | ") || "no tabs",
      );
      // The tab's own label carries its group, so left/right is assertable
      // rather than merely visible.
      ctx.check(
        "the CLI sits left of the Dabbler terminal",
        tabs.some((t) => !/Dabbler/i.test(t) && /Group 1/.test(t)) &&
          tabs.some((t) => /Dabbler/i.test(t) && /Group 2/.test(t)),
        tabs.join(" | "),
      );
      await ctx.shoot("04-two-terminals");
    },
  },
];

/** A `WalkContext.paneOf` implementation over the real workbench. */
export async function paneOfReal(
  page: Page,
  view: "Solution Explorer" | "Work Explorer",
): Promise<Locator> {
  const { solutionExplorerPane, workExplorerPane } = await browser();
  return view === "Solution Explorer" ? solutionExplorerPane(page) : workExplorerPane(page);
}
