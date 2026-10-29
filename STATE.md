# State

Lifecycle: build

Now:

foldkit-flow is a node-based graph UI for Foldkit (a generic library over `@xyflow/system`; MIT). Spec 0000 (the development lifecycle copied from reebeat studio, the workspace, the xyflow attribution and the example shell) is merged. Spec 0001 (the first felt journey: pan and zoom, drag nodes, connect two handles, select by box, with the performance budget and keyboard access as falsifiers) is built and in review: `packages/flow` is the Flow Submodel with its Mounts, `apps/example` the first user, `tools/journey` the browser gate.

Next:

- Review and merge spec 0001 (`docs/specs/0001-first-felt-journey.md`), then pick the next journey: keyboard connect (open question 2 of spec 0001), node resizing (`XYResizer`), an ELK.js layout example in the example app only.
- Add the journey gate to CI once CI has a Chromium (`bun run journey` needs one on `PATH` or in `FLOW_CHROMIUM`).
- Re-enable `@foldkit/vite-plugin` when a release imports `effect/crypto` (reebeat studio issue #4), and drop the Effect 4.0.0 peer note then (see `AGENTS.md`).
- Offer the library to Foldkit as `@foldkit/flow` once its API has settled (operator decision, not before).

Blocked:

- Nothing.
