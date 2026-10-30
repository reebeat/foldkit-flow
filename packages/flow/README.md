# @tsukuri/flow

A node-based graph UI for [Foldkit](https://foldkit.dev): pan and zoom a canvas, drag nodes, connect handles, select with a box. It does for Foldkit what React Flow and Svelte Flow do for their frameworks, on the same framework-free core, [`@xyflow/system`](https://github.com/xyflow/xyflow/tree/main/packages/system).

**Pre-release.** Versions `0.1.0-alpha.N` are published under the dist-tag `alpha`: `npm i @tsukuri/flow@alpha`. The API may change between alphas.

Peers: `foldkit` `~0.170.0` and `effect` `~4.1.0` (Foldkit itself also asks for `@effect/platform-browser` `~4.1.0`). Dependencies: `@xyflow/system` and `d3-selection`. `effect` stays on `~4.1.0` because Foldkit 0.170.0 declares that range: a wider one would promise a combination no install can have.

## Use

```ts
import * as Flow from "@tsukuri/flow";
import "@tsukuri/flow/flow.css";

const flow = Flow.defineFlow({
  isValidConnection: ({ source, target }) => source !== target,
  keyboardStep: 10,
});
```

The Flow is a Foldkit Submodel: its Model, Message and `update` are pure, the graph lives in your Model, and the xyflow controllers run in Mounts that dispatch Messages and are destroyed on unmount. Nodes are custom views (`renderNode`), with handles, three edge types (bezier, smooth step, straight), connect and reconnect with validation, parent (compound) nodes, box selection, a minimap, zoom controls, fit view and keyboard control with ARIA roles. The full API sketch and an example app: <https://github.com/tsukuri-labs/foldkit-flow#the-api-in-one-screen>.

## Exports

| Export | What |
| --- | --- |
| `@tsukuri/flow` | The Flow Submodel, its view and Mounts. |
| `@tsukuri/flow/flow.css` | The canvas styles. The only file with a side effect (`sideEffects` lists it). TypeScript 7 checks side-effect imports, so a project needs a `*.css` declaration for `import "@tsukuri/flow/flow.css"`; Vite's `vite/client` types are one. |
| `@tsukuri/flow/testing` | `eventually`: a test helper that waits for DOM state while a Foldkit runtime renders in happy-dom. It is for tests, not for the application. |

## Credit

`@tsukuri/flow` stands on `@xyflow/system` (MIT, Copyright (c) 2019-2025 webkid GmbH). xyflow asks its users to keep its attribution or to support the project. The link "Built with xyflow" in the corner of the canvas is **on by default**; turn it off with `Flow.init({ attribution: Flow.Attribution.Hidden() })`. See `NOTICE`.

## Licence

MIT. See `LICENSE` and `NOTICE`.
