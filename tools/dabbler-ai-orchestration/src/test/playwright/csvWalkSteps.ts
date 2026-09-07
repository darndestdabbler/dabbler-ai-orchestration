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

      // Every dependency claim below is checked against its OWN module's
      // segment of the row list, not against the tree as a whole: a
      // sibling's name also renders as a bare leaf under another module's
      // "Depends on"/"Used by" list (e.g. "app" under model's "Used by 3"),
      // so a global `rows.some(...)` cannot tell "app depends on 3" from
      // "app is one of the three model is used by". A module's own row is
      // the one that carries its kind label (only the top-level row does;
      // a bare sibling reference is just the slug) -- round 1's verifier
      // (GPT Terra) found the version before this checked only a global
      // "Used by 3", the package strings, and three of four group prefixes,
      // none of which is scoped to the module the tutorial claims it of.
      const KIND_OF: Record<(typeof MODULES)[number], string> = {
        model: "shared-types",
        deserializer: "library",
        persister: "library",
        app: "application",
      };
      // No space between the label and the description in the rendered
      // text (VS Code concatenates them as adjacent nodes, e.g.
      // "modelshared-types · package: CsvModel"), so the prefix check is
      // bare and the kind text is what disambiguates a module's own row
      // from a bare sibling-name leaf that merely starts the same way.
      const topIndex = new Map(
        MODULES.map((slug) => [
          slug,
          rows.findIndex((r) => r.startsWith(slug) && r.includes(KIND_OF[slug])),
        ]),
      );
      const byPosition = [...MODULES].sort((a, b) => topIndex.get(a)! - topIndex.get(b)!);
      const segmentOf = (slug: (typeof MODULES)[number]): string[] => {
        const start = topIndex.get(slug)!;
        const next = byPosition[byPosition.indexOf(slug) + 1];
        const end = next ? topIndex.get(next)! : rows.length;
        return start < 0 ? [] : rows.slice(start, end);
      };

      for (const slug of MODULES) {
        ctx.check(`the ${slug} module is listed`, topIndex.get(slug)! >= 0, rows.join(" | "));
      }
      ctx.check(
        "model is shared-types and used by its three siblings",
        segmentOf("model").some((r) => r.includes("shared-types")) &&
          segmentOf("model").some((r) => /^Used by\s*3$/.test(r)) &&
          ["deserializer", "persister", "app"].every((s) => segmentOf("model").includes(s)),
        segmentOf("model").join(" | "),
      );
      for (const slug of ["deserializer", "persister"] as const) {
        ctx.check(
          `${slug} depends on the model and is used by app`,
          segmentOf(slug).some((r) => /^Depends on\s*1$/.test(r)) &&
            segmentOf(slug).includes("model") &&
            segmentOf(slug).some((r) => /^Used by\s*1$/.test(r)) &&
            segmentOf(slug).includes("app"),
          segmentOf(slug).join(" | "),
        );
      }
      ctx.check(
        "app depends on all three siblings",
        segmentOf("app").some((r) => /^Depends on\s*3$/.test(r)) &&
          ["model", "deserializer", "persister"].every((s) => segmentOf("app").includes(s)),
        segmentOf("app").join(" | "),
      );
      for (const [slug, pkg] of [
        ["model", "CsvModel"],
        ["deserializer", "CsvDeserializer"],
        ["persister", "CsvPersister"],
        ["app", "CsvWatcher"],
      ] as const) {
        ctx.check(
          `${slug}'s own row names its package (${pkg})`,
          rows[topIndex.get(slug)!]?.includes(pkg) ?? false,
          rows[topIndex.get(slug)!] ?? "absent",
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
