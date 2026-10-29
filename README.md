# foldkit-flow

A node-based graph UI for [Foldkit](https://foldkit.dev): pan and zoom a canvas, drag nodes, connect handles, select with a box. It does for Foldkit what React Flow and Svelte Flow do for their frameworks.

Status: **planned**. The repository holds the development lifecycle and, in later pull requests, the library and an example app. Nothing is published yet.

foldkit-flow is a generic library. It has no product logic; layout is the application's job (an ELK.js example is planned, and ELK stays out of the library).

## Credit

foldkit-flow stands on [`@xyflow/system`](https://github.com/xyflow/xyflow/tree/main/packages/system) (MIT), the framework-free core that React Flow and Svelte Flow share: pan and zoom, drag, handles, edge paths, minimap and resizer controllers. The attribution link in the corner of the canvas is on by default and can be turned off, as React Flow's `proOptions` allows. See `NOTICE` once it lands.

## Licence

MIT. See [`LICENSE`](LICENSE).
