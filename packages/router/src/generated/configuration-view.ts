// Generated from configuration-view.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * One row of the section, and the rows beneath it.
 */
export type ConfigurationViewRow = {
  /**
   * Stable across refreshes and unique across the section, so an interface keeps what was open and selected.
   */
  id: string;
  kind: "configuration" | "configParticipant" | "configVehicle" | "configRole" | "configMechanic" | "configKeys" | "configCredential";
  label: string;
  description: string | null;
  /**
   * Plain text, paragraphs separated by a blank line. The root's carries the model catalog's age, where it lives and what re-reading it costs.
   */
  tooltip: string | null;
  icon: ConfigurationViewIcon | null;
  /**
   * Whether the row has children. Nothing here starts open.
   */
  collapsible: "none" | "collapsed";
  /**
   * The VS Code extension's menu token for the row, or null where it has none.
   */
  contextValue: string | null;
  /**
   * The value in force on a row that holds one: the engine, the vehicle, the model, the Mechanic's delegation, the credential's name. Null where the row holds none or nobody chose.
   */
  value: string | null;
  /**
   * Where the value is kept: this repository's settings, this machine's default, what ships, or nowhere. Null where the reading does not say.
   */
  decidedLayer: "checkout" | "machine" | "shipped" | "default" | null;
  /**
   * What activating the row does: one of its actions, or null where it does nothing.
   */
  click: ConfigurationViewAction | null;
  /**
   * The actions the row offers, in menu order.
   */
  actions: ConfigurationViewAction[];
  children: ConfigurationViewRow[];
};

/**
 * The editor's own glyph by name, and the tone it is drawn in where it has one.
 */
export type ConfigurationViewIcon = {
  id: string;
  tone?: "attention" | "done" | "muted" | "milestone";
};

/**
 * One action, as an interface shows and runs it: the Work Explorer's action, less the members no Configuration action uses. `argv` is the `dabbler` command it runs; an action that sets a value has none of its own and carries a `pick` instead, each of whose choices names its own command.
 */
export type ConfigurationViewAction = {
  id: string;
  title: string;
  argv: ConfigurationViewDabblerCommand | null;
  pick: ConfigurationViewPick | null;
  confirm: ConfigurationViewConfirmation | null;
  /**
   * Why the action cannot run now, in words a person can act on; null where it can. An interface shows this rather than running anything.
   */
  unavailable: string | null;
};

/**
 * What may be chosen for a value, as a list a person picks from: its title and placeholder, each choice it lists, what it does not list and why, and -- on a model whose reading lists nothing -- how a typed id is set instead.
 */
export type ConfigurationViewPick = {
  title: string;
  placeholder: string;
  /**
   * What the list offers, in order.
   */
  choices: ConfigurationViewChoice[];
  /**
   * What the list does not offer, each with why: a vehicle nothing here can reach, a model the record says is no longer served.
   */
  withheld: {
    label: string;
    reason: string;
  }[];
  /**
   * On a model whose reading lists nothing to pick: the model is TYPED, not picked, and this is how it is set. Null where there is a list.
   */
  typed: {
    prompt: string;
    /**
     * The command, with the typed id appended.
     */
    argv: ConfigurationViewDabblerCommand;
    /**
     * The same, as the machine's default.
     */
    mineArgv: ConfigurationViewDabblerCommand;
  } | null;
};

/**
 * One thing that may be chosen, and the `dabbler configure` command that sets it.
 */
export type ConfigurationViewChoice = {
  label: string;
  description: string | null;
  /**
   * `what you chose` on the choice in force, or what the machine found beside it.
   */
  detail: string | null;
  /**
   * What the command writes; empty clears the choice.
   */
  value: string;
  /**
   * Why this machine cannot reach it today, where it is still offered; null where it can.
   */
  unreachable: string | null;
  /**
   * Sets it for this repository; with no repository, as this machine's default.
   */
  argv: ConfigurationViewDabblerCommand;
  /**
   * Sets it as this machine's default.
   */
  mineArgv: ConfigurationViewDabblerCommand;
};

/**
 * A `dabbler` command as argv: the program, then its arguments.
 */
export type ConfigurationViewDabblerCommand = string[];

/**
 * A confirmation a person gives before the action runs, in the words they are shown.
 */
export type ConfigurationViewConfirmation = {
  title: string;
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
 * dabbler view configuration (the Configuration section's rows)
 */
export type ConfigurationView = {
  /**
   * The shape this payload is written in.
   */
  schemaVersion: 1;
  /**
   * No repository was named, so every row is this machine's default and every choice writes the machine's default.
   */
  machineOnly: boolean;
  /**
   * The Configuration root. A reading that could not be taken is this row with no children, its tooltip saying why.
   */
  configuration: ConfigurationViewRow;
};
