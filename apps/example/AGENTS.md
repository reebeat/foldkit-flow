# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: true

The subtree is not vendored: `repos/foldkit` is a large public repository and the installed `foldkit` package ships its `dist` with JSDoc, which is the contract here (see the repository's [`AGENTS.md`](../../AGENTS.md), "Effect and Foldkit"). Revisit when the library grows Submodels.

## Project Notes

- This app exists to exercise the library in `packages/flow` (`foldkit-flow`). The shell is a scaffold (spec 0000); the canvas comes with spec 0001.
- `src/main.ts` holds the pure definitions (Model, Message, init, update, view); `src/application.ts` builds the application from a container and `src/entry.ts` is the only module that boots the runtime. Tests are `src/story.test.ts` (drives `update`), `src/scene.test.ts` (drives the view) and `src/boot.test.ts` (boots the runtime in happy-dom).
- The repository formats with Oxfmt (double quotes, semicolons) and lints with the Foldkit plugin.
- Import `describe`, `test` and `expect` from `vite-plus/test`, not `vitest` (lint rule `vite-plus/prefer-vite-plus-imports`).
- `@foldkit/vite-plugin` is on in `vite.config.ts` (Model preservation across reloads, dev tools).
