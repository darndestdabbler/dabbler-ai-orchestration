// The stream helpers live at the leaf (`src/output.ts`): printing is a
// platform concern every module may reach, and while it lived under `cli/`
// every lower module that printed acquired an edge INTO the command layer
// -- seven of the fifty-two back-edges in the 2026-09-02 measurement. This
// re-export keeps `cli/`'s own imports stable; nothing below `cli/` may
// import this path, and the boundary lint holds it there.
export * from "../output.ts";
