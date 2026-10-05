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

/** The source projects the solution file lists, each with the kind the Solution Explorer reads from its build file. */
export const PROJECTS = [
  ["Csv.Model", "library"],
  ["Csv.Importer", "application"],
  ["People.Api", "service"],
] as const;

/** The sessions the walked solution has, by the bucket the Work Explorer files them under. */
export const SESSIONS = {
  complete: [
    "001 · Author or import the solution plan",
    "002 · Challenge the plan, then break it into numbered sessions",
    "003 · The Person model",
  ],
  notStarted: ["004 · The CSV parser", "005 · The API's store", "006 · The importer sends"],
} as const;

export const WALK_STEPS: readonly WalkStep[] = [
  {
    id: "open-the-solution",
    title: "Open the solution",
    operator: [
      "Open the CSV solution folder in VS Code.",
      "Click the **Dabbler AI Orchestration** icon in the activity bar.",
    ],
    expect: [
      "Two panes appear: **Solution Explorer** and **Work Explorer**.",
      "The Solution Explorer names the repository and says **6 projects** — the three tiers' projects and their three test projects, read from the solution file.",
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
        "the repository row counts six projects",
        rows.some((r) => /6 projects/.test(r)),
        rows[0] ?? "no rows",
      );
      await ctx.shoot("01-solution-opened");
    },
  },

  {
    id: "read-the-decomposition",
    title: "Read what the solution is built from",
    operator: [
      "Collapse the Work Explorer and expand the Solution Explorer's repository row, then expand each project.",
    ],
    expect: [
      "`Csv.Model` is a **library**, **used by 5**: `Csv.Importer`, `People.Api` and the three test projects.",
      "`Csv.Importer` is an **application** and `People.Api` a **service**; each **depends on 1**, `Csv.Model`, and neither references the other.",
      "Each project row names its path, and each test project **depends on** the project it tests. Nothing here was declared: every row is read from the `.slnx` and the `<ProjectReference>` elements.",
    ],
    async drive(ctx) {
      const { expandAllRows, rowTexts, setPaneExpanded } = await browser();
      // The Work Explorer is collapsed so the whole project tree fits in one
      // viewport: a virtualized list only renders the rows on screen.
      await setPaneExpanded(ctx.page, "Work Explorer", false);
      const solution = await ctx.paneOf("Solution Explorer");
      await expandAllRows(solution);
      const rows = await rowTexts(solution);

      // A project's own row carries its kind and path; a sibling's name also
      // renders as a bare leaf under another project's "Depends on"/"Used by",
      // so each claim is checked against its own project's segment of rows.
      const topIndex = new Map<string, number>(
        PROJECTS.map(([name, kind]) => [name, rows.findIndex((r) => r.startsWith(name) && r.includes(`${kind} ·`))]),
      );
      const starts = [...topIndex.values()].filter((index) => index >= 0).sort((a, b) => a - b);
      const segmentOf = (name: string): string[] => {
        const start = topIndex.get(name) ?? -1;
        if (start < 0) return [];
        const next = starts.find((index) => index > start) ?? rows.length;
        return rows.slice(start, next);
      };

      for (const [name, kind] of PROJECTS) {
        ctx.check(`${name} is listed as ${kind}`, (topIndex.get(name) ?? -1) >= 0, rows.join(" | "));
      }
      ctx.check(
        "Csv.Model is used by both tiers and the three test projects",
        segmentOf("Csv.Model").some((r) => /^Used by\s*5$/.test(r)) &&
          ["Csv.Importer", "People.Api"].every((s) => segmentOf("Csv.Model").includes(s)),
        segmentOf("Csv.Model").join(" | "),
      );
      for (const tier of ["Csv.Importer", "People.Api"] as const) {
        const other = tier === "Csv.Importer" ? "People.Api" : "Csv.Importer";
        ctx.check(
          `${tier} depends on the model alone`,
          segmentOf(tier).some((r) => /^Depends on\s*1$/.test(r)) &&
            segmentOf(tier).includes("Csv.Model") &&
            !segmentOf(tier).includes(other),
          segmentOf(tier).join(" | "),
        );
      }
      await ctx.shoot("02-decomposition");
    },
  },

  {
    id: "read-the-work",
    title: "Read what work is planned",
    operator: [
      "Collapse the Solution Explorer and expand the **Work Explorer**.",
      "Expand the repository row, then the **Not Started** and **Complete** buckets.",
    ],
    expect: [
      "The repository shows **3/6** — three of the six sessions have closed.",
      "**Not Started** holds sessions 004 to 006, the phases session 2 planned; **Complete** holds 001 to 003, each with the day it closed.",
      "Each session's title is its heading in `docs/sessions/session-plan.md`.",
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
        "three of six sessions have closed",
        rows.some((r) => /3\/6/.test(r)),
        rows[0] ?? "no rows",
      );
      const bucket = (label: string, titles: readonly string[]) => {
        const start = rows.findIndex((r) => new RegExp(`^${label}\\s*${titles.length}$`).test(r));
        return start >= 0 && titles.every((title) => rows.slice(start + 1).some((r) => r.startsWith(title)));
      };
      ctx.check("Not Started holds sessions 004 to 006", bucket("Not Started", SESSIONS.notStarted), rows.join(" | "));
      ctx.check("Complete holds sessions 001 to 003", bucket("Complete", SESSIONS.complete), rows.join(" | "));
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
      let cliStarted = false;
      if (opened) {
        await ctx.page.keyboard.type("claude");
        await ctx.page.keyboard.press("Enter");
        // VS Code renames a terminal tab to its OWN foreground process, so
        // polling for the tab to become "claude" is what tells a running CLI
        // from a shell that typed the word and got "command not found": the
        // earlier version accepted any non-Dabbler tab, which a failed
        // launch satisfies exactly as well as a real one (round 1's
        // verifier, GPT Terra).
        const claudeTab = ctx.page.locator(".tabs-container .tab").filter({ hasText: /claude/i });
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          if ((await claudeTab.count()) > 0) {
            cliStarted = true;
            break;
          }
          await ctx.page.waitForTimeout(500);
        }
      }
      ctx.check(
        "the AI CLI actually started (its tab renamed to the running process)",
        cliStarted,
        opened
          ? "no tab renamed to 'claude' within 15s -- it may not be installed, or the launch failed"
          : "no editor terminal opened at all",
      );

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
        // Not merely "the other tab" -- by name, so a failed launch that
        // left an unrenamed shell tab cannot satisfy this either.
        "the AI CLI tab is specifically the claude process",
        tabs.some((t) => /claude/i.test(t)),
        tabs.join(" | ") || "no tabs",
      );
      // The tab's own label carries its group, so left/right is assertable
      // rather than merely visible -- and each side is now named, not just
      // positioned.
      ctx.check(
        "the CLI (claude) sits left of the Dabbler terminal",
        tabs.some((t) => /claude/i.test(t) && /Group 1/.test(t)) &&
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
