# foldkit-flow

A node-based graph UI for [Foldkit](https://foldkit.dev): pan and zoom a canvas, drag nodes, connect handles, select with a box. It does for Foldkit what React Flow and Svelte Flow do for their frameworks.

Status: **first journey built** (spec 0001), not published yet. The Flow Submodel, its view and the Mounts that own the xyflow controllers are in `packages/flow`; `apps/example` is the first user.

foldkit-flow is a generic library with no product logic. Layout is the application's job: an ELK.js example is planned, and ELK stays out of the library.

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Node and gitleaks). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run ready          # every gate: check, exceptions, tests, build, knip, cpd, secrets
cd apps/example && devenv shell -- bunx vp dev      # the example at http://localhost:5173/
devenv shell -- bun run build && devenv shell -- bun run journey   # the browser gate: needs a Chromium on PATH or FLOW_CHROMIUM
```

The example has three graphs: *Small* (five states and three edge kinds: pan and zoom, drag, connect, reconnect, box select), *Compound* (Scenes holding States, the statechart shape) and *Large* (500 nodes, 700 edges: the performance graph).

## The API in one screen

The Flow is a Foldkit Submodel: its Model, Message and `update` are pure, the graph lives in the application's Model, and the xyflow controllers run in Mounts that dispatch Messages.

```ts
import * as Flow from "foldkit-flow";

// 1. The rules that are code (not Model) are declared once.
const flow = Flow.defineFlow({
  isValidConnection: ({ source, target }) => source !== target,
  keyboardStep: 10, // arrow keys move a node by this much; Shift: four times
});

// 2. The Flow's Model is a field of the application's Model. Nodes carry their size and their handles (ports).
const model = {
  flow: Flow.init({
    id: "flow",
    nodes: [
      {
        id: "a", label: "A", type: "state", data: {}, draggable: true, selected: false,
        position: { x: 0, y: 0 }, width: 140, height: 50, isClampedToParent: false,
        handles: [{ id: "out", kind: "source", side: "Right" }],
      },
      /* ... a node with `parentId` is a child: its position is relative to the parent */
    ],
    edges: [{ id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", kind: "SmoothStep", /* or Bezier, Straight */ hasArrow: true, label: "", selected: false }],
  }),
};

// 3. Embed it and fold its Messages and out-messages (Update.foldChild).
//    OutMessage: UpdatedSelection | Connected | Reconnected | Deleted | Moved.
//    The Flow does not add an edge itself: on `Connected` the application calls Flow.addEdge(flow, connection, edge),
//    on `Reconnected` Flow.reconnectEdge(flow, edgeId, connection). That is where an application decides.

// 4. In the view, h.submodel renders it; `renderNode` is the node's own view (match on node.type for node types).
h.submodel({
  model: model.flow,
  slotId: "flow",
  toParentMessage: (message) => Message.GotFlowMessage({ message }),
  view: flow.view,
  viewInputs: { ariaLabel: "Story graph", renderNode: (node) => nodeContent(node) },
});
```

What the Flow gives you: custom node views, handles, three edge types with an optional arrow, connect and reconnect with validation, parent (compound) nodes with `isClampedToParent`, click / Shift-click / box selection, a minimap, zoom controls and fit view (also on init), keyboard control, and the xyflow attribution link (turn it off with `Flow.init({ attribution: Flow.Attribution.Hidden() })`).

**Large graphs.** `renderNode` runs for every node on every render. Return a memoised VNode (a module-level `createKeyedLazy` slot keyed by `node.id`, as `apps/example/src/main.ts` does) so an unchanged node costs nothing; the Flow memoises the node frame and the edges itself.

## Accessibility

- The canvas has role `application` with the accessible name you pass as `ariaLabel`, and an instructions text it is described by.
- Every node is a focusable `group` (`tabindex="0"`, `aria-roledescription="node"`, `aria-label` = its label). **Tab** moves between nodes. **Enter** or **Space** selects (Shift or Ctrl: add to the selection). **Arrow keys** move the node (and the selection it belongs to) by `keyboardStep`; **Shift+arrow** by four times as much; a clamped child stays inside its parent. **Delete** or **Backspace** removes the selection with its edges. **Escape** clears the selection. Focus stays on the node while it moves.
- A polite live region (`role="status"`) announces selection, moves, connections and deletions ("Moved Start to 20, 100", "Deleted 1 node and 1 edge").
- With focus on the canvas itself: **+** and **-** zoom, **0** fits the view, **Escape** clears the selection, **Delete** or **Backspace** removes it. The controls are buttons with labels (Zoom in, Zoom out, Fit view).
- Keyboard connect (choose a handle, then a target with the arrow keys) is not built yet; it is an open question in spec 0001.

## Performance

Measured, not assumed: `bun run journey` drags one node of the 500-node, 700-edge graph in headless Chromium and reports the numbers (spec 0001, falsifier J9). Foldkit's render per pointer move meets the budget because the node and edge views are keyed lazy views with primitive arguments: only the dragged node and its own edges are rendered. Pan and zoom change the viewport element's transform only and render no node.

## Credit

foldkit-flow stands on [`@xyflow/system`](https://github.com/xyflow/xyflow/tree/main/packages/system) (MIT, Copyright (c) 2019-2025 webkid GmbH), the framework-free core that React Flow and Svelte Flow share: pan and zoom, drag, handles, edge paths, minimap and resizer controllers. xyflow asks its users to keep its attribution or to support the project. The link "Built with xyflow" in the corner of the canvas is **on by default**; an application turns it off with `Attribution.Hidden()`, as React Flow's `proOptions` allows. See [`NOTICE`](NOTICE).

## Where to read

- [`AGENTS.md`](AGENTS.md): the process, the gate table, the Effect and Foldkit rules.
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`PROVENANCE.md`](PROVENANCE.md): what was copied from reebeat studio, at which commit, with which deviations.

## Licence

MIT. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md), then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
