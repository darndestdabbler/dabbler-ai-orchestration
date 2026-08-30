// What a consumer of `dabbler-ai-router` may import: the contract, the
// generated types, and the implementation of the contract. The modules
// BEHIND the contract are not exported -- a caller that reached past
// `Router` would be depending on how the router is built rather than on
// what it answers.
//
// `createInProcessRouter` is the exception that proves it: it hands back a
// `Router`, so the extension gets an implementation without getting a
// module. It is exported here rather than assembled by the caller because
// wiring one would mean knowing which module answers which verb, which is
// exactly the knowledge the contract exists to hold on the caller's
// behalf.

export * from "./contracts/router.ts";
export * from "./contracts/verbs.ts";
export * from "./generated/index.ts";
export {
  createInProcessRouter,
  commandLineFor,
  quoteForDisplay,
  type InProcessRouterOptions,
  type RouterEcho,
  type VerbRun,
} from "./inProcess.ts";
