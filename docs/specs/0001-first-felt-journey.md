# Spec 0001: the first felt journey (pan, zoom, drag, connect, box select)

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the operator's assignment of 2026-10-29 (a node-based graph UI for Foldkit, a generic library over `@xyflow/system`, MIT, no reebeat product logic; the performance budget and the public API list below).
Binding for: `packages/flow` and `apps/example`. Stacked on [spec 0000](0000-development-lifecycle.md) (PR 1).

## Goal

A person opens the example, sees a graph, and does five things with it: **pans and zooms** the canvas, **drags a node**, **connects two handles**, **selects by box**, and does all of it **with the keyboard too**. The graph lives in the application's Model; the library is a Foldkit Submodel plus the Mounts that own the xyflow controllers. A graph of 500 nodes and 700 edges drags at frame times under the 16 ms budget, measured in headless Chromium.

## Journey

```text
 example app (http://localhost:5173/)                       what the person does -> what holds
 ┌──────────────────────────────────────────────┐
 │ controls (+ - fit)            [ minimap ]    │  1 wheel / drag the pane  -> viewport (x, y, zoom) changes; nodes are not re-rendered
 │   ┌───────┐        ┌───────┐                 │  2 drag a node            -> node.position changes in the Model; its edges follow
 │   │ Start ●──────▶● Step  │                 │  3 drag from a handle to another handle -> a Connected out-message; the app adds the edge
 │   └───────┘        └───────┘                 │  4 Shift+drag on the pane -> nodes inside the box are selected
 │  Built with xyflow (hide with Attribution.Hidden())  │  5 Tab to a node, arrows move it, Delete removes it
 └──────────────────────────────────────────────┘
```

Steps to experience it: `devenv shell -- bun install`, then `cd apps/example && devenv shell -- bunx vp dev`, open the printed URL. The page has three graphs (the toggle "Graph": *Small*, *Compound*, *Large*): *Small* is the journey above; *Compound* has Scenes holding States (parent nodes); *Large* has 500 nodes and 700 edges (the performance graph). To measure: `devenv shell -- bun run journey` (needs a Chromium on `PATH` or `FLOW_CHROMIUM`; not part of CI, which has no browser).

## Constraints and values

- **The Elm architecture is the boundary.** Nodes, edges, viewport, selection and interaction live in `Flow.Model`, with its own `Message` and `update` (a Foldkit Submodel embedded with `h.submodel` and folded with `Update.foldChild`). The xyflow controllers attach in `Mount.defineStream` Mounts; their callbacks dispatch Messages; nothing mutates outside `update`. Every controller has an owned lifetime: its Mount's scope closes on unmount and destroys it.
- **Mount arguments are captured once at mount** (Foldkit), so a controller cannot read a changed Model through its arguments. The pure view therefore publishes a read-only snapshot of what the controllers need on the DOM with `Prop`, and a controller reads it when an event arrives. No Command is sent per Message.
- **Performance budget, measured, not assumed:** dragging one node in a graph of 500 nodes and 700 edges keeps frames under 16 ms in headless Chromium; pan and zoom change only the viewport transform and re-render no node; nodes and edges are keyed and memoised (`createKeyedLazy`).
- **Public API** (what the library exports; the example uses all of it):
  - nodes as custom views through one `renderNode` callback (the application matches on `node.type`);
  - handles (ports) declared by the node view with `Flow.handle(...)`;
  - edge types: `Bezier`, `SmoothStep`, `Straight`, with an optional arrow marker;
  - connect and reconnect with validation callbacks (`isValidConnection`) and out-messages `Connected`, `Reconnected`;
  - parent (compound) nodes: `parentId`, relative positions, `extent: Parent`;
  - selection: click, Shift or Ctrl click to add, box select with Shift+drag, `Escape` clears;
  - minimap and controls (zoom in, zoom out, fit view);
  - fit view, on init and on request;
  - keyboard accessibility: focusable nodes, Enter or Space selects, arrow keys move (Shift: larger step), Delete or Backspace removes, Escape clears; ARIA roles and a live region.
- **Attribution.** A link to xyflow is visible by default and turns off with `Attribution.Hidden()` (spec 0000).
- **Layout is the application's.** The library imports no layout engine. The example places its nodes by hand; an ELK.js layout would be an example of the application's own, and ELK (EPL-2.0 OR GPL-3.0) is not a dependency of this repository.
- **Effect ranges.** `packages/flow` declares `effect ~4.1.0`, `foldkit ~0.169.0` and depends on `@xyflow/system` 0.0.83 (exact: a 0.0.x release may break). The published-range test stays green.
- **No suppressions** unless registered. Pure stays pure: geometry, edge paths, connection checks and selection are plain functions with tests.

## Design

```text
packages/flow/src
  types.ts        Schemas: Position, Viewport, Handle, Node, Edge (EdgeKind), Connection, Interaction
  model.ts        Model, init, defaults; derived data memoised on node identity (lookup, bounds)
  message.ts      Message (PanZoomed, DraggedNodes, MeasuredNode, ConnectedHandles, ...), OutMessage
  update.ts       update: pure; returns OutMessage for Connected, Reconnected, Deleted, ChangedSelection
  geometry.ts     fit view, box select, keyboard steps; wrappers over @xyflow/system utilities
  edgePath.ts     Bezier, SmoothStep, Straight paths from handle positions
  snapshot.ts     the read-only controller snapshot, set with Prop, read by Mounts
  mounts.ts       FlowPane (XYPanZoom + size), FlowNode (XYDrag + measure), FlowHandle (XYHandle), FlowMinimap (XYMinimap)
  view.ts         defineView: pane, viewport layer, edges svg, nodes, selection box, controls, minimap, attribution, live region
  attribution.ts  (spec 0000)
```

- **Data flow.** `PanZoomed`, `DraggedNodes`, `MeasuredNode`, `UpdatedConnection` and `ConnectedHandles` arrive from Mounts. `PressedNode`, `PressedPane`, key messages and box-select moves arrive from view handlers and one Subscription that listens to document pointer events only while a box select is active. `update` turns each into a new Model.
- **Viewport sync.** When the Model's viewport changes without a gesture (fit view, zoom buttons, keyboard), the `FlowPane` Mount calls `panZoom.syncViewport(snapshot.viewport)` in a capture-phase listener before d3-zoom handles the next gesture.
- **Measurement.** `FlowNode` measures its element with a `ResizeObserver` and reads the handle bounds with `getHandleBounds`; the result is a `MeasuredNode` Message. An edge without measured end nodes is not drawn.
- **Memoisation.** A node view and an edge view are `createKeyedLazy` slots keyed by id, with primitives and node objects as arguments, so one dragged node re-renders itself and its edges only.
- **Render cost prototype (before the build).** A throwaway Foldkit app with 500 absolutely positioned nodes and 700 SVG edges, one node dragged by 150 pointer moves in headless Chromium (dev server, a loaded 32-thread host): with the lazy function recreated on every render (a miss on every key) the render callback took p50 6.8 ms, p95 15.5 ms, max 23.3 ms and one frame dropped; with the lazy function at module scope and keyed vnodes returned from it, p50 0.6 ms, p95 1.1 ms, max 3.1 ms, and every frame interval 16.7 ms. So Foldkit's render per pointer move meets the budget when the lazy function reference is stable, and the fix named in the assignment (apply the transform in the Mount) is not needed for drag.

## What is built

| Part | Content |
|---|---|
| `packages/flow` | the modules above; exports `Flow` (Model, Message, OutMessage, init, update, view), the node and edge Schemas, `handle`, `Attribution` |
| `apps/example` | the three graphs, the graph toggle, an event log of out-messages; the app embeds the Flow Submodel and handles `Connected`, `Reconnected`, `Deleted` |
| `tools/journey` | the browser gate: `bun run journey` drives the built example in headless Chromium through the journey and the performance measurement; evidence under `~/.local/state/foldkit-flow-verify/` |

## Falsifiers

Each falsifier has a gate and a negative control that is run and observed to fail, with the output in the PR body.

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
|---|---|---|---|
| J1 | A wheel or a pane drag changes the viewport and re-renders no node | `journey` (a `MutationObserver` on the node layer sees zero mutations while the viewport element's style changes); Story test `PanZoomed` | Make the viewport part of each node's lazy arguments: the node layer mutates and the journey step fails |
| J2 | Dragging a node updates `node.position` in the Model and its edges follow | Story test `DraggedNodes`; Scene test; `journey` | `DraggedNodes` ignores the position: the Story test fails |
| J3 | Dragging from a source handle to a target handle yields `Connected`; an invalid target (refused by `isValidConnection`) yields no edge; reconnecting an edge end yields `Reconnected` | Story tests; `journey` | `isValidConnection` always true: the invalid-target step fails |
| J4 | Shift+drag selects the nodes inside the box and no others; a plain drag pans | geometry test on `getNodesInside`; `journey` | box test with an off-by-the-transform rectangle fails |
| J5 | A node is focusable; Enter selects it; arrows move it by the step (Shift: four times); Delete removes it and its edges; Escape clears the selection; the canvas has role `application`, nodes role `group`, a live region announces the selection | Scene tests; `journey` (keyboard only) | remove `tabindex` from nodes: the Scene test and the keyboard step fail |
| J6 | Fit view frames all nodes; the controls zoom; the minimap shows nodes and pans | geometry test; `journey` | fit view ignores padding: the geometry test fails |
| J7 | Parent nodes: a child's position is relative to its parent; dragging the parent moves the child; `extent: Parent` clamps the child | geometry and Story tests | clamp removed: the Story test fails |
| J8 | Lifetimes: building and discarding each Mount runs nothing; after unmount (and after `dispose` of an embedded runtime) every controller is destroyed and no DOM listener it added remains | Mount tests (`Runtime.embed`, listener ledger) | skip the controller `destroy` in a Mount release: the ledger test fails |
| J9 | **Performance:** dragging one node of 500 nodes and 700 edges: the p95 of the render callback (view plus patch) is under 8 ms and no frame interval exceeds 16.8 ms plus one frame of tolerance in 95% of frames; pan and zoom: zero node mutations | `journey` | render every node on each move (no lazy): the p95 exceeds the budget |
| J10 | The attribution link is visible by default and the app can hide it | Scene test | default `Hidden`: the Scene test fails |
| J11 | `bun run ready` exits 0 | `ready` | as spec 0000 |

Numbers (headless Chromium, this host, load noted in the PR) are reported in the PR body, not only pass or fail.

## Constraints on the implementation

- Free on mechanism, specific on behaviour: the module split may change if the journey and falsifiers hold.
- No Command is used to push the Model into a controller; a Mount reads the snapshot.
- Every Mount acquires its controller inside `Effect.acquireRelease` (the controller is the success value of the acquire) and destroys it in the release.
- A test fixture is a temporary DOM the test creates; the browser gate serves the built example from a temporary port.

## Risks

| Risk | Mitigation |
|---|---|
| xyflow's controllers expect a store shape (`nodeLookup`, `transform`, `updateNodePositions`) | build the snapshot from the Model with `adoptUserNodes`, memoised on node identity; the controllers' own types are the contract (no installed guidance exists for them) |
| Handle bounds depend on layout, which happy-dom lacks | unit tests send `MeasuredNode` directly; the browser gate covers real measurement |
| Frame times are noisy on a shared host | report p50, p95, max and the load; the gate uses the render-callback time, which is less noisy than frame intervals |
| `@xyflow/system` 0.0.x changes | pinned exactly; the license and the attribution are kept |

## Open questions for the operator

1. Offer the library as `@foldkit/flow` once the API settles (not before).
2. Keyboard connect (select a handle, choose a target with the arrow keys): wanted in a later spec?

## Revisions

Dated entries. A spec is revised only here after its PR opens.

- **2026-10-29, plan written** with the render-cost prototype (the numbers above).
