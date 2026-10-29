# State

Lifecycle: build

Now:

foldkit-flow is a node-based graph UI for Foldkit (a generic library over `@xyflow/system`; MIT). Spec 0000 (the development lifecycle, the workspace, the xyflow attribution) and spec 0001 (the first felt journey: pan and zoom, drag nodes, connect two handles, select by box, with the performance budget and keyboard access as falsifiers) are merged: `packages/flow` is the Flow Submodel with its Mounts, `apps/example` the first user, `tools/journey` the browser gate. Spec 0002 (Foldkit 0.170.0 and `@foldkit/vite-plugin` 0.29.0 in the example, a J9 that always judges memoisation, and the `vite-plus/test` gap in the module-mocking lint rule) is in review.

Next:

- Pick the next journey: keyboard connect (open question 2 of spec 0001), node resizing (`XYResizer`), an ELK.js layout example in the example app only.
- Add the journey gate to CI once CI has a Chromium (`bun run journey` needs one on `PATH` or in `FLOW_CHROMIUM`).
- Offer the library to Foldkit as `@foldkit/flow` once its API has settled (operator decision, not before).

Blocked:

- Nothing.
