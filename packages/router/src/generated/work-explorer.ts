// Generated from work-explorer.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * One row of the tree, and the rows beneath it.
 */
export type WorkExplorerRow = {
  /**
   * Stable across refreshes and unique across the whole tree, so an interface keeps what was open and selected.
   */
  id: string;
  kind: "repository" | "bucket" | "session" | "task" | "verification" | "finding" | "attention" | "refusal";
  label: string;
  description: string | null;
  /**
   * Markdown source. A `$(name)` is an icon by name, as in the label.
   */
  tooltip: string | null;
  icon: WorkExplorerIcon | null;
  /**
   * Whether the row has children, and whether it starts open. `expanded` is the In Progress bucket's alone.
   */
  collapsible: "none" | "collapsed" | "expanded";
  /**
   * The row's tokens, each wrapped in `;`: its kind, its state, and one `act-` token per action it offers.
   */
  contextValue: string;
  /**
   * What activating the row does, or null where it does nothing.
   */
  click: WorkExplorerAction | null;
  /**
   * The actions the row offers, in menu order.
   */
  actions: WorkExplorerAction[];
  children: WorkExplorerRow[];
  /**
   * On a repository row whose progress reading failed: why, in words a person can act on. Such a row has no sessions.
   */
  error?: string;
};

/**
 * An icon by name. A `theme` icon is the editor's own glyph, optionally in a named theme colour; a `file` icon is one of the operator's status pictures, by its file name under media/light and media/dark.
 */
export type WorkExplorerIcon = {
  kind: "theme";
  id: string;
  color?: string;
} | {
  kind: "file";
  slug: string;
};

/**
 * One action, as an interface shows and runs it: the `dabbler` command it stands for with its arguments filled in, or the file it opens -- exactly one of the two -- and what it needs from a person first. Nothing about it is left for the interface to decide.
 */
export type WorkExplorerAction = {
  id: string;
  title: string;
  /**
   * The command, beginning `dabbler`, run in the repository's root.
   */
  argv: string[] | null;
  opens: WorkExplorerOpens | null;
  /**
   * A command that writes nothing, whose output the person reads before they are asked: a rollback's dry run, an exception's card. A rollback's dry run prints JSON whose `head` is passed back as `--as-of`.
   */
  preview: string[] | null;
  confirm: WorkExplorerConfirmation | null;
  reason: WorkExplorerReason | null;
};

/**
 * A file an action opens rather than a verb it runs.
 */
export type WorkExplorerOpens = {
  file: string;
  /**
   * The line to open at, 1-based; null for the top.
   */
  line: number | null;
  /**
   * The page's own anchor, for a page rather than a text file.
   */
  fragment: string | null;
};

/**
 * A confirmation a person gives before the action runs, in the words they are shown.
 */
export type WorkExplorerConfirmation = {
  title: string;
  /**
   * What the question means, or null where the words come from the action's preview instead.
   */
  detail: string | null;
  /**
   * The button that goes on.
   */
  accept: string;
  /**
   * The button that keeps things as they are, or null where dismissing is the only way back.
   */
  keep: string | null;
};

/**
 * A reason a person types before the action runs. It reaches the command as `--reason <text>` after its other arguments, and dismissing the box aborts.
 */
export type WorkExplorerReason = {
  prompt: string;
  placeholder: string;
  /**
   * What an empty answer passes, or null where an empty answer changes nothing because the reason is the authority itself.
   */
  blank: string | null;
};

/**
 * dabbler view work-explorer (the Work Explorer's rows)
 */
export type WorkExplorer = {
  /**
   * The shape this payload is written in.
   */
  schemaVersion: 1;
  /**
   * One row per repository given that has a sessions root, in the order given.
   */
  repositories: WorkExplorerRow[];
};
