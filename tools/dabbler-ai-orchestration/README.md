# Dabbler AI Orchestration — VS Code extension

The Work Explorer for [dabbler-ai-router](../../README.md): a native tree
of modules, session sets, sessions and steps, rendered entirely from
`python -m ai_router.progress --json`. The extension decides nothing —
TypeScript renders, Python decides.

- Install the router first: `pip install dabbler-ai-router`
- Build the VSIX: `npm install && npm run package`
- Unit tests: `npm run test:unit` (vscode-stub, no Electron)
- UI tests: `npm run test:playwright` (downloads VS Code on first run)

See the repository README and `docs/quick-start.md` for the workflow.
