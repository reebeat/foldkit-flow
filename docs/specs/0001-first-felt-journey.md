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
- **Mount arguments are captured once at mount** (Foldkit), so a controller cannot read a changed Model through its arguments. The pure view therefore publishes a read-only snapshot of what the controllers need as a property of the pane's custom element, and a controller reads it when an event arrives. No Command is sent per Message.
- **Performance budget, measured, not assumed:** dragging one node in a graph of 500 nodes and 700 edges keeps frames under 16 ms in headless Chromium; pan and zoom change only the viewport transform and re-render no node; nodes and edges are keyed and memoised (`createKeyedLazy`).
- **Public API** (what the library exports; the example uses all of it):
  - nodes as custom views through one `renderNode` callback (the application matches on `node.type`);
  - handles (ports) declared on the node (`handles: HandleDef[]`);
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
  types.ts       Schemas: XY, Viewport, Size, HandleDef, FlowNode, FlowEdge (EdgeKind), Connection, ConnectionDraft, Interaction
  model.ts       Model, init
  message.ts     Message (PanZoomed, DraggedNodes, ConnectedHandles, ReconnectedHandles, key and pointer Messages, ...), OutMessage
  selection.ts   selection as plain functions (preserving identity of unchanged nodes)
  geometry.ts    handle layout, xyflow lookups (memoised per node), absolute positions, edge geometry, fit view, box select, minimap
  update.ts      flowUpdate(options): pure; returns OutMessage for Connected, Reconnected, Deleted, Moved, ChangedSelection
  snapshot.ts    the pane custom element and the read-only snapshot the Mounts read; pane, bounds and handle lookups
  mounts.ts      FlowPane (XYPanZoom, box select), FlowNodeMount (XYDrag), FlowHandle and FlowReconnect (XYHandle), FlowMinimap (XYMinimap)
  view.ts        defineView: pane, viewport layer, edges svg, nodes, draft connection, box, controls, minimap, attribution, live region
  flow.ts        defineFlow: update and view bound to the rules that are code
  attribution.ts (spec 0000)
tools/journey    probe.ts (runs in the page), journey.ts (the steps), stats.ts (percentiles)
```

- **Data flow.** `PanZoomed`, `DraggedNodes`, `UpdatedConnection`, `ConnectedHandles` and `ReconnectedHandles` arrive from Mounts. `PressedNode`, `PressedPane`, key Messages and box-select moves arrive from view handlers and from the pane Mount's document listeners (only while a box select is active). `update` turns each into a new Model.
- **Viewport sync.** When the Model's viewport changes without a gesture (fit view, zoom buttons, keyboard), the `FlowPane` Mount calls `panZoom.syncViewport(snapshot.viewport)` in a capture-phase listener before d3-zoom handles the next gesture.
- **Sizes and handles are declared** (see Revisions): there is no measurement step.
- **Memoisation.** A node view and an edge view are `createKeyedLazy` slots keyed by id whose arguments are primitives and Model objects that keep their identity (the absolute position is passed as two numbers), so one dragged node re-renders itself and its edges only. The application's `renderNode` returns a memoised VNode for the same reason.
- **Render cost prototype (before the build).** A throwaway Foldkit app with 500 absolutely positioned nodes and 700 SVG edges, one node dragged by 150 pointer moves in headless Chromium (dev server, a loaded 32-thread host): with the lazy function recreated on every render (a miss on every key) the render callback took p50 6.8 ms, p95 15.5 ms, max 23.3 ms and one frame dropped; with the lazy function at module scope and keyed vnodes returned from it, p50 0.6 ms, p95 1.1 ms, max 3.1 ms, and every frame interval 16.7 ms. So Foldkit's render per pointer move meets the budget when the lazy function reference is stable, and the fix named in the assignment (apply the transform in the Mount) is not needed for drag.

## What is built

| Part | Content |
|---|---|
| `packages/flow` | the modules above; exports `defineFlow`, `init`, `Model`, `Message`, `OutMessage`, `addEdge`, `reconnectEdge`, the node and edge Schemas, `Attribution`; `foldkit-flow/testing` (`eventually`, for tests that boot a runtime) |
| `apps/example` | the three graphs, the graph toggle, an event log of out-messages; the app embeds the Flow Submodel and handles `Connected`, `Reconnected`, `Deleted` |
| `tools/journey` | the browser gate: `bun run journey` drives the built example in headless Chromium through the journey and the performance measurement; evidence under `~/.local/state/foldkit-flow-verify/` |

## Falsifiers

Each falsifier has a gate and a negative control that is run and observed to fail, with the output in the PR body.

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
|---|---|---|---|
| J1 | A wheel or a pane drag changes the viewport and re-renders no node | `journey` (a `MutationObserver` on the viewport layer sees zero mutations while the viewport element's style changes); Story test `PanZoomed` | Make the viewport part of each node's lazy arguments: the viewport layer mutates and the journey step fails |
| J2 | Dragging a node updates `node.position` in the Model and its edges follow | Story test `DraggedNodes`; `journey` | `DraggedNodes` ignores the position: the Story test fails |
| J3 | Dragging from a source handle to a target handle yields `Connected`; an invalid target (refused by `isValidConnection`) yields no edge; reconnecting an edge end yields `Reconnected` | Story tests; `journey` | `isValidConnection` always true: the invalid-target step fails |
| J4 | Shift+drag selects the nodes inside the box and no others; a plain drag pans | geometry test on `getNodesInside`; `journey` | box test with an off-by-the-transform rectangle fails |
| J5 | A node is focusable; Enter selects it; arrows move it by the step (Shift: four times); Delete removes it and its edges; Escape clears the selection; the canvas has role `application`, nodes role `group`, a live region announces the selection | runtime tests, Story tests; `journey` (keyboard only) | remove `tabindex` from nodes: the runtime test and the keyboard step fail |
| J6 | Fit view frames all nodes; the controls zoom; the minimap shows nodes and pans | geometry test; `journey` | fit view ignores padding: the geometry test fails |
| J7 | Parent nodes: a child's position is relative to its parent; dragging the parent moves the child; `extent: Parent` clamps the child | geometry and Story tests | clamp removed: the Story test fails |
| J8 | Lifetimes: building and discarding each Mount runs nothing; after unmount (and after `dispose` of an embedded runtime) every controller is destroyed and no DOM listener it added remains | runtime tests (`Runtime.embed`, spies on the document and window listeners, d3's own binding record on the pane, the minimap and the nodes) | skip the controller teardown in a Mount release: the test fails |
| J9 | **Performance:** dragging one node of 500 nodes and 700 edges, measured three times: the median of the runs' p95 scripting time per pointer move (update, view, patch, controller callbacks) is under 8 ms and 95% of frame intervals are within 33.5 ms (one frame of tolerance); pan and zoom: zero mutations in the viewport layer | `journey` | render every node and edge on each move (no lazy): the median p95 exceeds the budget |
| J10 | The attribution link is visible by default and the app can hide it | runtime test, example Story and boot tests, `journey` | default `Hidden`: the runtime test, the Story test and the journey step fail |
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
- **2026-10-29, built; the design changed where the build taught otherwise.**
  - *No DOM measurement.* The plan had each node measured with a `ResizeObserver` and `getHandleBounds`, and an edge without measured ends not drawn. Built instead: a node declares its `width`, `height` and `handles` (xyflow accepts user-declared handle bounds), so edges are placed from the Model with no layout read, and no `MeasuredNode` Message exists. The Model is smaller and an edge is drawn on the first render.
  - *The snapshot is a custom-element property, not `Prop`.* `Prop` is not Foldkit public API. The pane is `foldkit-flow-pane` (`CustomElement.define`) carrying a `snapshot` property that the pure view sets; the controllers read it when an event arrives. The pane also holds an empty `div.foldkit-flow__bounds` because `XYHandle` types its container as `HTMLDivElement`.
  - *Handles are declared on the node (`handles: HandleDef[]`)*, not by a `Flow.handle(...)` call in the node view; the application's `renderNode` returns only the node's content.
  - *Connect and reconnect are out-messages the application applies* (`Flow.addEdge`, `Flow.reconnectEdge`); the Flow does not add or move an edge itself. `isValidConnection` and `keyboardStep` are code, declared once with `defineFlow`.
  - *Scene tests became runtime tests.* The Foldkit Scene harness stubs Mounts, so it cannot show a controller attached or released. The view, the keyboard and the Mount lifetimes are tested with a real runtime in happy-dom (`packages/flow/src/runtime.test.ts`: roles, keyboard, controls, d3 bindings and document listeners after `dispose`); pointer geometry is only meaningful in a browser, so it is the journey's.
  - *J9 is measured as scripting time per pointer move*, from Chromium's `Performance.getMetrics` (`ScriptDuration`: update, view, patch, controller callbacks), with style, layout and all main-thread tasks reported next to it, and an idle baseline. The host is shared (other work shows up as an outlier: one of three consecutive runs measured a p95 of 12.6 ms against 5 to 6 ms in the others), so the drag is measured three times and the gate is the **median of the three p95s** under 8 ms, with 95% of all frame intervals within 33.5 ms; the no-memoisation control still fails it (median p95 34 ms). The plan's "render callback" cannot be read from a production build.
  - *The journey found five real defects, all fixed here:* the connect gesture never started (the pane is not a `div`); the minimap controller was never created (it sits beside the pane and the pane lookup used `closest`); the minimap kept three d3 listeners after unmount; the reconnect gesture used the dragged end instead of the opposite end; node text was selectable while dragging. And one performance defect: the node lazy took the absolute position as an object that was rebuilt every render, so every node missed the cache (scripting p50 21 ms, p95 38 ms before the fix; p50 3.3 ms, p95 5 to 8 ms after).
  - *The J1 and J9 mutation count is not a proof of memoisation*: a re-rendered node whose output is unchanged mutates no DOM. The gate for memoisation is the scripting time; the mutation count catches a node whose output depends on the viewport.
  - *The first pointer move after a press starts an xyflow drag and is not applied to the node* (xyflow takes it as the drag's reference); the journey presses with a 2 px kick and expects the node to follow the pointer from there.
  - *tools/journey is a workspace* (`puppeteer-core` 25.16.0, Apache-2.0; `bun run journey`), and its two files get their own Effect platform groups in `vite.config.ts`: `probe.ts` runs inside the page (browser), `journey.ts` and `stats.ts` in Bun. For `journey.ts` and `probe.ts` the preset rule `typescript/promise-function-async` is off with its reason in `vite.config.ts`: Ultracite asks for `async` on a Promise-returning arrow, and the Effect diagnostics (`async-function`) and `require-await` reject that `async`; the arrow inside `Effect.tryPromise` is the Effect form. `journey.ts` also joins the `unicorn/throw-new-error` override that `effectExceptions.ts` has (its autofix rewrites a `Schema.TaggedError` class heritage to `new`).
- **2026-10-29, review round 1 (head `418dfe6`), all seven findings fixed:**
  - *Deleting a parent* took only its direct children and left their edges (and a grandchild with a dangling `parentId`). Delete now computes the transitive descendant closure first and derives the edge ids from it; `Deleted` and the live region report the full node and edge sets. New `nested()` fixture (scene, state, sub-state, edges) with two Story tests (J5, J7); control: without the closure both fail.
  - *A gesture pressed on a handle* kept XYHandle's four document listeners when the Mount was released before the pointer passed the drag threshold. A flag is set before `XYHandle.onPointerDown` and cleared by the release; the Mount's finalizer ends the gesture whenever it is set. Runtime test: press a handle, dispose, count document listeners (control: ending only when the connection is in progress fails it).
  - *`panByOf` no longer runs an Effect* (`Effect.runPromise` at a foreign callback): a plain function wrapped in a resolved Promise. The exception registry stays empty.
  - *J8 observes `destroy`*: `controllers.test.ts` wraps `XYPanZoom`, `XYDrag` and `XYMinimap` (`vi.mock`) and requires that each created controller is destroyed exactly once after `dispose`. For that file the `typescript/promise-function-async` override of `vite.config.ts` applies too (the factory returns the original module's Promise).
  - *Ctrl and Meta add to the selection on Enter or Space*: `PressedNodeKey` carries `isAdditive` (Shift, Ctrl or Meta) separately from `isShift` (the step multiplier); runtime test (control: Shift only fails it). The README now says so.
  - *Focus after a delete by key*: the node Mount remembers that the last key on its element was Delete or Backspace and gives the canvas focus when it is released. Runtime test.
  - *Renamed to the Foldkit convention before publication:* `ChangedPanning` to `UpdatedPanning` and the out-message `ChangedSelection` to `UpdatedSelection` (earlier text in this spec says `ChangedSelection`).
