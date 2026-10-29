# foldkit-flow

A node-based graph UI for [Foldkit](https://foldkit.dev): pan and zoom a canvas, drag nodes, connect handles, select with a box. It does for Foldkit what React Flow and Svelte Flow do for their frameworks.

Status: **under construction**. The repository holds the development lifecycle, the workspace and the xyflow attribution (spec 0000); the canvas, nodes, edges and selection arrive with spec 0001. Nothing is published yet.

foldkit-flow is a generic library with no product logic. Layout is the application's job: an ELK.js example is planned, and ELK stays out of the library.

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Node and gitleaks). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run ready          # every gate: check, exceptions, tests, build, knip, cpd, secrets
cd apps/example && devenv shell -- bunx vp dev      # the example at http://localhost:5173/
```

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
