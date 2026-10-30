# State

Lifecycle: build

Now:

foldkit-flow is a node-based graph UI for Foldkit (a generic library over `@xyflow/system`; MIT), published as `@tsukuri/flow` once the operator releases it. Specs 0000 to 0004 are merged: the development lifecycle, the first felt journey (pan and zoom, drag, connect, box select, with the performance budget and keyboard access as falsifiers), Foldkit 0.170.0, the rename to tsukuri, and the package metadata. Spec 0005 (the published shape and the npm release path, copied from phibkro/pg-txmode, with the licence hygiene of what ships) is in review. It publishes nothing: the operator sets `NPM_TOKEN` in the environment `npm-release` and dispatches the workflow.

Next:

- The version PR: one changeset and `bun run release:version` (`0.1.0-alpha.0`). Then the operator dispatches Release `mode=check`, then `mode=publish`.
- Trusted publishing (OIDC) and the removal of the token (spec 0005, "Removal checklist").
- Pick the next journey: keyboard connect (open question 2 of spec 0001), node resizing (`XYResizer`), an ELK.js layout example in the example app only.
- Add the journey gate to CI once CI has a Chromium (`bun run journey` needs one on `PATH` or in `FLOW_CHROMIUM`).
- Offer the library to Foldkit as `@foldkit/flow` once its API has settled (operator decision, not before).

Blocked:

- Nothing.
